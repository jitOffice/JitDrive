import { kindOfExt } from '@/lib/filetypes'
import { publicConfig } from '@/lib/jitword'
import type { ShareLinkView, PublicFileRow } from '@/lib/share'
import ShareEditorClient from './ShareEditorClient'
import ShareFilePreview from './ShareFilePreview'

// v0.5.2 · Shared file-body renderer for two entry points:
//   · /s/[code]          — file-scoped link, `fileId` omitted (byte-identical
//                           to v0.5 URL construction)
//   · /s/[code]/f/[fid]  — folder-scoped link previewing a specific descendant,
//                           `fileId` threaded through so /raw and /ticket URLs
//                           carry ?fileId=<id>.
// Kept as a plain function (not a client component) — it just wires props into
// the existing ShareChrome + editor / preview clients.

interface Props {
  code: string
  file: PublicFileRow
  link: ShareLinkView
  /** Present only when mounted from the folder subroute. */
  fileId?: string
}

export function ShareFileRender({ code, file, link, fileId }: Props) {
  const kind = kindOfExt(file.extension)
  const cfg = publicConfig()
  if (kind === 'jitword' && file.docId) {
    return (
      <>
        <ShareChrome
          fileName={file.name}
          ownerName={file.owner.name}
          size={file.size}
          kind={kind}
          extension={file.extension}
        />
        <ShareEditorClient
          code={code}
          docId={file.docId}
          fileName={file.name}
          cfg={cfg}
          fileId={fileId}
        />
      </>
    )
  }
  return (
    <>
      <ShareChrome
        fileName={file.name}
        ownerName={file.owner.name}
        size={file.size}
        kind={kind}
        extension={file.extension}
      />
      <ShareFilePreview
        code={code}
        allowDownload={link.allowDownload}
        file={{ name: file.name, extension: file.extension, mime: file.mime, size: file.size, kind }}
        fileId={fileId}
      />
    </>
  )
}

// Slim file-info banner above every share render — replaces the drive's
// ViewHeader/FileHeader since visitors don't own the doc and shouldn't see
// any of the drive-only chrome (back link, mode switch, etc.).
function ShareChrome({
  fileName,
  ownerName,
  size,
  kind,
  extension
}: {
  fileName: string
  ownerName: string
  size: number
  kind: Parameters<typeof fileKindLabel>[0]
  extension: string
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-wps-border bg-white px-4 text-xs">
      <div className="truncate font-medium text-wps-text" title={fileName}>
        {fileName}
      </div>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-wps-subtext">
        {fileKindLabel(kind, extension)} · {(size / 1024).toFixed(1)} KB
      </span>
      <div className="ml-auto flex items-center gap-1 text-[11px] text-wps-subtext">
        由 <b className="text-wps-text">{ownerName}</b> 分享
      </div>
    </div>
  )
}

// Local copy so the /s subtree doesn't need to import the drive-only
// FileKindIcon module (which pulls in a few client bits we'd rather not
// load on an anonymous landing page).
function fileKindLabel(kind: string, ext: string): string {
  const map: Record<string, string> = {
    jitword: 'Word 文档',
    previewable: (ext || '').toUpperCase() + ' 预览',
    image: '图片',
    audio: '音频',
    video: '视频',
    archive: '压缩包',
    other: '文件'
  }
  return map[kind] || '文件'
}
