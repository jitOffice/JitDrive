import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import { getFile } from '@/lib/store'
import { getActorId } from '@/lib/users'
import { resolveReadPath } from '@/lib/storage'
import { guessMime } from '@/lib/filetypes'

export const runtime = 'nodejs'

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const rec = await getFile(ctx.params.id)
  const canAccess = !!rec && (rec.ownerSubject === actor || rec.sharedWith.includes(actor))
  const abs = rec ? resolveReadPath(rec) : null
  if (!rec || !abs || !canAccess) {
    return NextResponse.json({ code: 404, message: 'file not found' }, { status: 404 })
  }
  try {
    const buf = await fs.readFile(abs)
    // kind-aware MIME (docx/xlsx/pdf/images/etc.), fall back to octet-stream.
    const mime = rec.mime || guessMime(rec.extension)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(rec.name)}"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (e) {
    return NextResponse.json(
      { code: 500, message: `读取原始文件失败：${(e as Error).message}` },
      { status: 500 }
    )
  }
}
