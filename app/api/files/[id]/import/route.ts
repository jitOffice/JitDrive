import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * v0.4.1 — POST /api/files/[id]/import 已废弃。
 *
 * 旧实现：接收 .docx → 服务端 mammoth 解析成 HTML → 暂存到 pendingHtmlPath →
 * 让 EditorClient 走 setContent 注入。
 *
 * 新实现：FileHeader 的「导入 Word」按钮把用户选的 File 直接交给浏览器端
 * iframe-sdk 1.1 `document.importDocx`（经由 editor-bridge → EditorClient
 * .runImportDocx），解析、写入、保存全在 iframe 内完成，不再有服务端往返，
 * 也不用把整份 docx 上传回服务端。
 *
 * 保留此路由只为给老缓存 / 书签直达一个明确回执。
 */
export async function POST() {
  return NextResponse.json(
    {
      code: 410,
      message:
        'POST /api/files/[id]/import 已废弃：Word 导入已迁移到浏览器端 iframe-sdk 1.1 document.importDocx，请在编辑页使用「导入 Word」按钮。'
    },
    { status: 410 }
  )
}
