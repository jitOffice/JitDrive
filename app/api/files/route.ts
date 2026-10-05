import { NextResponse } from 'next/server'
import { listChildren, listDrive, putFile, canReadFolder } from '@/lib/store'
import { newId } from '@/lib/id'
import { createDocument, resolveOrigin } from '@/lib/jitword'
import { getActorId } from '@/lib/users'
import { getCurrentUser } from '@/lib/auth'
import type { FileRecord } from '@/lib/types'
import {
  extensionOf,
  guessMime,
  isAllowedExtension,
  kindOf,
  maxSizeFor
} from '@/lib/filetypes'
import { writeBlob, writeDocxLegacy } from '@/lib/storage'
import { inlineSha256 } from '@/lib/smart/hash'

export const runtime = 'nodejs'
// Docx parsing moved to the browser via iframe-sdk 1.1 `document.importDocx`
// (see components/EditorClient.tsx). The server only writes bytes to disk and
// provisions an empty JitWord document — maxDuration is here to accommodate
// 50 MB tier-2 uploads on slow connections, not parsing.
export const maxDuration = 60

/** GET /api/files — returns the actor's whole drive by default; `?folderId=…`
 *  (or `folderId=root` for the top level) narrows to a single directory view. */
export async function GET(req: Request) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const url = new URL(req.url)
  const folderId = url.searchParams.get('folderId')
  if (folderId === null) {
    const files = await listDrive(actor)
    return NextResponse.json({ code: 200, data: files })
  }
  const parentId = folderId === 'root' || folderId === '' ? null : folderId
  if (parentId && !(await canReadFolder(parentId, actor))) {
    return NextResponse.json({ code: 404, message: '目录不存在或无权限' }, { status: 404 })
  }
  const children = await listChildren(actor, parentId)
  return NextResponse.json({ code: 200, data: children })
}

/** POST /api/files — multipart upload. Handles both JitWord-native docx and
 *  generic blobs (pdf / xlsx / image / media / archive). Pass `?folderId=…`
 *  to place the new file under a folder; `folderId=root` (or omit) ⇒ root. */
export async function POST(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ code: 400, message: 'expected multipart/form-data' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ code: 400, message: 'missing "file" field' }, { status: 400 })
  }
  const name = file.name || 'untitled'
  if (!isAllowedExtension(name)) {
    return NextResponse.json(
      { code: 415, message: `暂不支持该类型：${extensionOf(name) || '(无扩展名)'}。允许：办公文档 / PDF / 图片 / 音频 / 视频 / 压缩包` },
      { status: 415 }
    )
  }
  const kind = kindOf(name)
  const cap = maxSizeFor(name)
  if (file.size > cap) {
    return NextResponse.json(
      { code: 413, message: `文件超过 ${Math.floor(cap / (1024 * 1024))}MB 上限` },
      { status: 413 }
    )
  }
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const me = await getCurrentUser()

  // Resolve optional folderId.
  const url = new URL(req.url)
  const rawFolder = url.searchParams.get('folderId')
  const parentId = !rawFolder || rawFolder === 'root' ? null : rawFolder
  if (parentId && !(await canReadFolder(parentId, actor))) {
    return NextResponse.json({ code: 404, message: '目录不存在或无权限' }, { status: 404 })
  }

  const id = newId()
  const now = Date.now()
  const ext = extensionOf(name)
  // Server-side MIME (never trust client.file.type).
  const mime = guessMime(ext)

  // ---------- Branch A: JitWord-native (docx) ----------
  // Bytes land on disk untouched; the browser will hand them to the iframe
  // SDK's `document.importDocx` on first editor open. See
  // components/EditorClient.tsx (`hasPendingImport` path).
  if (kind === 'jitword') {
    const buf = Buffer.from(await file.arrayBuffer())
    const written = await writeDocxLegacy(id, buf)
    // v0.7 · P0 · hash 就地算，零额外 IO（buf 已在内存）。sha256 of 25MB ≈ 60-80ms
    // on mid-tier dev machine，一次上传完全可接受。老数据靠 /api/smart/scan 懒回填。
    const contentHash = inlineSha256(buf)
    let docId: string
    try {
      const created = await createDocument({ name, externalSubject: actor })
      docId = created.docId
    } catch (e) {
      return NextResponse.json(
        { code: 502, message: `JitWord 建文档失败：${(e as Error).message}` },
        { status: 502 }
      )
    }
    const rec: FileRecord = {
      id,
      name,
      docId,
      extension: ext,
      kind,
      size: written.size,
      mime,
      parentId,
      ownerSubject: actor,
      ownerName: me?.name || actor,
      jwSubject: actor,
      sharedWith: [],
      createdAt: now,
      updatedAt: now,
      deleted: false,
      accessCount: 0,
      originalPath: written.absolutePath,
      // Pending flag drives the client-side auto-import on first open.
      // `pendingHtmlPath` is retained in the schema for backward compat but
      // always null post-v0.4.1 — we no longer stage parsed HTML server-side.
      pendingHtmlPath: undefined,
      pendingImport: true,
      status: 'ready',
      category: 'docx',
      // v0.7 · P0
      contentHash,
      sensitivity: null
    }
    await putFile(rec)
    void resolveOrigin
    return NextResponse.json({ code: 200, data: { ...rec, warnings: [] } })
  }

  // ---------- Branch B: generic blob (pdf / xlsx / image / media / archive / other) ----------
  const buf = Buffer.from(await file.arrayBuffer())
  const blob = await writeBlob(id, buf, { originalName: name })
  const contentHash = inlineSha256(buf)
  const rec: FileRecord = {
    id,
    name,
    docId: null,
    extension: ext,
    kind,
    size: blob.size,
    mime,
    parentId,
    ownerSubject: actor,
    ownerName: me?.name || actor,
    jwSubject: undefined,
    sharedWith: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    accessCount: 0,
    originalPath: blob.absolutePath,
    pendingHtmlPath: undefined,
    pendingImport: false,
    status: 'ready',
    // Legacy 'category' column is a docx-only concept post-v0.4; keep as 'docx'
    // so pre-existing UI components don't crash. New code reads kind/extension.
    category: 'docx',
    // v0.7 · P0
    contentHash,
    sensitivity: null
  }
  await putFile(rec)
  return NextResponse.json({ code: 200, data: { ...rec, warnings: [] } })
}
