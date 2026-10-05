import { NextResponse } from 'next/server'
import { getFile } from '@/lib/store'
import { issueTicket, resolveOrigin } from '@/lib/jitword'
import { getActorId } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/files/[id]/ticket?mode=edit|preview
 *  Returns a fresh one-time ticket. Called from the SDK's getEmbedTicket
 *  (handshake + refresh), so this endpoint MUST be safe to hit repeatedly
 *  and MUST NOT cache the ticket it issued.
 *
 *  Permission model (multi-identity):
 *   - owner            + edit  → editor scopes, writable toolbar
 *   - shared viewer    + edit  → downgraded to READ-ONLY (editor + comment only)
 *   - anyone           + preview → viewer, readonly, no toolbar */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const rec = await getFile(ctx.params.id)
  if (!rec) return NextResponse.json({ code: 404, message: 'file not found' }, { status: 404 })
  if (rec.deleted) return NextResponse.json({ code: 410, message: '文档在回收站中，请先还原' }, { status: 410 })
  // Only JitWord-native docs (docx) have a docId/ticket flow. Non-docx files
  // are served via /api/files/[id]/raw + the Preview SDK on the client.
  if (!rec.docId) {
    return NextResponse.json(
      { code: 415, message: '此文件类型不走 JitWord 编辑器，请使用预览或下载路径' },
      { status: 415 }
    )
  }

  const url = new URL(req.url)
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const isOwner = rec.ownerSubject === actor
  const requested = url.searchParams.get('mode') === 'preview' ? 'preview' : 'edit'
  // Non-owners never get an editable session, even if they ask for edit.
  const canEdit = requested === 'edit' && isOwner
  const origin = resolveOrigin(req)

  try {
    const t = await issueTicket({
      docId: rec.docId,
      origin,
      // JitWord's doc ACL is keyed by the externalSubject that CREATED the doc.
      // Post-v0.3 the current user's cuid doesn't match that for legacy (persona-
      // created) docs, so we replay the stored creator subject verbatim. Falls
      // back to actor for any rows the backfill hasn't healed yet.
      externalSubject: rec.jwSubject || actor,
      permission: canEdit
        ? { role: 'editor', scopes: ['document:read', 'document:edit', 'comment:write'] }
        : { role: 'viewer', scopes: ['document:read'] },
      ui: canEdit
        ? { readonly: false, theme: 'light', toolbar: 'full' }
        : { readonly: true, theme: 'light', toolbar: 'none' }
    })
    return NextResponse.json({ code: 200, data: { ...t, canEdit, isOwner } })
  } catch (e) {
    return NextResponse.json(
      { code: 502, message: `JitWord 签发 ticket 失败：${(e as Error).message}` },
      { status: 502 }
    )
  }
}
