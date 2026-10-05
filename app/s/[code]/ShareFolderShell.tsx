import Link from 'next/link'
import Icon from '@/components/Icon'
import { kindOfExt, labelForKind } from '@/lib/filetypes'

// v0.5.2 · Server-only view of a folder-scoped share link.
//
// Renders: (a) a slim header with the shared folder name + owner, (b) a
// breadcrumb back to the shared root (and up through sub folders), (c) a
// grid of sub-folders, (d) a table of files. Every item links to a nested
// route — sub-folders to `/s/[code]/d/[folderId]`, files to `/s/[code]/f/[fileId]`
// — so visitors can bookmark / share / back-button their way through the tree
// exactly like they'd navigate the drive itself.
//
// Deliberately NOT a client component: all navigation is via `Link` to real
// SSR routes, which keeps the anon landing page's JS payload small and lets
// `X-Robots-Tag: noindex` do its job without hydration quirks.

interface SubFolder {
  id: string
  name: string
}
interface SubFile {
  id: string
  name: string
  extension: string
  size: number
}
interface Crumb {
  id: string
  name: string
}

interface Props {
  code: string
  /** Display name of the folder currently being shown. */
  folderName: string
  /** Sharing user's display name. */
  ownerName: string
  /** True when the current folder is the link's root — used to decide whether
   *  the "回到上级" button should point at `/s/[code]` or the parent crumb. */
  isRoot: boolean
  /** Breadcrumb chain from the shared root DOWN to (but excluding) the
   *  current folder. Empty when isRoot. */
  breadcrumb: Crumb[]
  folders: SubFolder[]
  files: SubFile[]
}

export default function ShareFolderShell({
  code,
  folderName,
  ownerName,
  isRoot,
  breadcrumb,
  folders,
  files
}: Props) {
  const parentCrumb = breadcrumb[breadcrumb.length - 1] ?? null
  const backHref = isRoot ? null : parentCrumb ? `/s/${code}/d/${parentCrumb.id}` : `/s/${code}`
  const total = folders.length + files.length

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header — mirrors v0.5 ShareChrome but framed for a folder. */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-wps-border bg-white px-4 text-xs">
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center gap-1 rounded border border-wps-border px-2 py-0.5 text-wps-text hover:bg-slate-50"
          >
            <Icon name="back" size={12} />
            上一级
          </Link>
        )}
        <div className="flex items-center gap-1.5 truncate font-medium text-wps-text" title={folderName}>
          <Icon name="folder" size={14} />
          <span className="truncate">{folderName}</span>
        </div>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-wps-subtext">
          目录分享 · {total} 项
        </span>
        <div className="ml-auto flex items-center gap-1 text-[11px] text-wps-subtext">
          由 <b className="text-wps-text">{ownerName}</b> 分享
        </div>
      </div>

      {/* Breadcrumb — anchor is always the shared root itself, followed by
          every intermediate folder down to (but not including) the current
          view; the last row already shows the current folder name above. */}
      <nav className="flex shrink-0 flex-wrap items-center gap-1 border-b border-wps-border bg-white px-4 py-2 text-[11px] text-wps-subtext">
        <Link href={`/s/${code}`} className="hover:text-wps-text">
          {breadcrumb.length > 0 ? breadcrumb[0].name : folderName}
        </Link>
        {breadcrumb.slice(1).map((c, i) => (
          <span key={c.id + i} className="flex items-center gap-1">
            <Icon name="chevronRight" size={10} />
            <Link href={`/s/${code}/d/${c.id}`} className="hover:text-wps-text">
              {c.name}
            </Link>
          </span>
        ))}
        {!isRoot && (
          <>
            <Icon name="chevronRight" size={10} />
            <span className="text-wps-text">{folderName}</span>
          </>
        )}
      </nav>

      <div className="flex-1 overflow-auto px-4 py-4 sm:px-6">
        {total === 0 ? (
          <div className="mt-12 flex flex-col items-center justify-center text-center text-xs text-wps-subtext">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500">
              <Icon name="folder" size={18} />
            </div>
            这个目录还没有可分享的内容
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-6">
            {folders.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium text-wps-subtext">文件夹</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {folders.map(f => (
                    <Link
                      key={f.id}
                      href={`/s/${code}/d/${f.id}`}
                      className="flex items-center gap-3 rounded-lg border border-wps-border bg-white p-3 shadow-sm transition hover:shadow-md"
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded bg-amber-50 text-amber-600">
                        <Icon name="folder" size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-wps-text" title={f.name}>
                          {f.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-wps-subtext">子目录</div>
                      </div>
                      <Icon name="chevronRight" size={14} />
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {files.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium text-wps-subtext">文件</div>
                <div className="overflow-hidden rounded-lg border border-wps-border bg-white shadow-sm">
                  <ul className="divide-y divide-wps-border">
                    {files.map(f => {
                      const kind = kindOfExt(f.extension)
                      return (
                        <li key={f.id}>
                          <Link
                            href={`/s/${code}/f/${f.id}`}
                            className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50"
                          >
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-slate-100 text-slate-500">
                              <Icon name="file" size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-wps-text" title={f.name}>
                                {f.name}
                              </div>
                            </div>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-wps-subtext">
                              {labelForKind(kind)} · {(f.size / 1024).toFixed(1)} KB
                            </span>
                            <Icon name="chevronRight" size={14} />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
