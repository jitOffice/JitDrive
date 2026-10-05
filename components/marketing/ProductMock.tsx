import Icon, { type IconName } from '@/components/Icon'

type Tile = { name: string; meta: string; icon: IconName; tint: string }

const TILES: Tile[] = [
  { name: '产品需求文档.docx', meta: '协同编辑 · 3 人在线', icon: 'file', tint: 'text-wps-brand bg-red-50' },
  { name: '2026 财务预算.xlsx', meta: '刚刚预览', icon: 'fileSheet', tint: 'text-emerald-600 bg-emerald-50' },
  { name: '融资路演.pptx', meta: '只读分享中', icon: 'fileSlide', tint: 'text-amber-600 bg-amber-50' },
  { name: '合同终稿.pdf', meta: '带密码 · 7 天后过期', icon: 'filePdf', tint: 'text-rose-600 bg-rose-50' },
  { name: '原型截图', meta: '12 张图片', icon: 'image', tint: 'text-sky-600 bg-sky-50' },
  { name: '归档资料.zip', meta: '回收站 30 天', icon: 'fileArchive', tint: 'text-violet-600 bg-violet-50' }
]

const NAV = [
  { label: '我的云盘', icon: 'drive' as IconName, active: true },
  { label: '最近打开', icon: 'clock' as IconName, active: false },
  { label: '共享给我', icon: 'users' as IconName, active: false },
  { label: '我的分享', icon: 'share' as IconName, active: false },
  { label: '回收站', icon: 'trash' as IconName, active: false }
]

/**
 * Pure Tailwind/CSS mock of the JitDrive workspace — used as the hero "product
 * shot". Intentionally an asset-free reconstruction (no PNG) so it stays crisp
 * at any width, ships zero image bytes, and can never drift from a real build.
 * Decorative: the whole thing is aria-hidden.
 */
export default function ProductMock() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-2xl border border-wps-border bg-white shadow-2xl ring-1 ring-black/5"
    >
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-wps-border bg-wps-side px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <div className="ml-3 flex items-center gap-1.5 rounded-md border border-wps-border bg-white px-2.5 py-1 text-[11px] text-wps-subtext">
          <Icon name="lock" size={11} />
          jitdrive.com/drive
        </div>
      </div>

      <div className="flex">
        {/* sidebar */}
        <div className="hidden w-44 shrink-0 flex-col border-r border-wps-border bg-white p-3 sm:flex">
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-wps-brand to-wps-brandDark text-white">
              <Icon name="drive" size={15} />
            </span>
            <span className="text-[13px] font-semibold text-wps-text">JitDrive</span>
          </div>
          {NAV.map(n => (
            <div
              key={n.label}
              className={
                'mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] ' +
                (n.active ? 'bg-red-50 font-medium text-wps-brand' : 'text-wps-subtext')
              }
            >
              <Icon name={n.icon} size={14} />
              {n.label}
            </div>
          ))}
          <div className="mt-auto rounded-md border border-wps-border bg-wps-side p-2 text-[10px] text-wps-subtext">
            回收站文档保留 30 天后自动清理
          </div>
        </div>

        {/* main */}
        <div className="min-w-0 flex-1 bg-slate-50/60 p-3">
          {/* toolbar */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1.5 rounded-md border border-wps-border bg-white px-2.5 py-1.5 text-[12px] text-wps-subtext">
              <Icon name="search" size={13} />
              搜索文档标题
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-wps-border bg-white px-2.5 py-1.5 text-[12px] text-wps-text">
              <Icon name="plus" size={13} />
              新建
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-wps-brand px-2.5 py-1.5 text-[12px] font-medium text-white">
              <Icon name="upload" size={13} />
              上传文件
            </div>
          </div>

          {/* file grid */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {TILES.map(t => (
              <div
                key={t.name}
                className="flex items-center gap-2 rounded-lg border border-wps-border bg-white p-2.5 shadow-sm"
              >
                <span className={'grid h-8 w-8 shrink-0 place-items-center rounded-md ' + t.tint}>
                  <Icon name={t.icon} size={16} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-wps-text">{t.name}</div>
                  <div className="truncate text-[10px] text-wps-subtext">{t.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
