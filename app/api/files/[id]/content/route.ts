import { NextResponse } from 'next/server'
import { getFile, patchFile } from '@/lib/store'
import { getActorId } from '@/lib/users'

export const runtime = 'nodejs'

/**
 * v0.4.1 — mammoth 服务端解析已下线，docx 解析迁移到浏览器端
 * iframe-sdk 1.1 `document.importDocx`。本路由只保留 POST：客户端
 * `EditorClient.runImportDocx()` 成功后调用它把 `pendingImport` 标记清 0，
 * 保证同一份 raw docx 不会被自动重放第二次。
 *
 * GET 保留一个 410 Gone 兜底（老页面缓存 / 书签直达时给出明确回执）。
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const rec = await getFile(ctx.params.id)
  if (!rec) return NextResponse.json({ code: 404, message: 'file not found' }, { status: 404 })
  if (rec.ownerSubject !== actor)
    return NextResponse.json({ code: 403, message: '仅所有者可执行导入' }, { status: 403 })
  await patchFile(rec.id, { pendingImport: false, lastEditedAt: Date.now(), updatedAt: Date.now() })
  return NextResponse.json({ code: 200, data: { cleared: true } })
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  void ctx
  return NextResponse.json(
    {
      code: 410,
      message:
        'GET /api/files/[id]/content 已废弃：docx 解析已迁移到浏览器端 iframe-sdk 1.1 document.importDocx，请改用「导入 Word」按钮或直接编辑页自动回放。'
    },
    { status: 410 }
  )
}
