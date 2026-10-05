import Link from 'next/link'
import Icon from '@/components/Icon'
import { DRIVE, LOGIN, REGISTER } from '@/lib/routes'

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: '产品'
    ,
    links: [
      { label: '核心能力', href: '/#capabilities' },
      { label: '智能云盘', href: '/#ai' },
      { label: '分享运营化', href: '/#share' },
      { label: '安全可控', href: '/#security' },
      { label: '平台形态', href: '/#platform' }
    ]
  },
  {
    title: '开始使用'
    ,
    links: [
      { label: '登录', href: LOGIN },
      { label: '邀请码注册', href: REGISTER },
      { label: '进入云盘', href: DRIVE }
    ]
  },
  {
    title: '文档类型'
    ,
    links: [
      { label: 'Word / 协作文档', href: '/#capabilities' },
      { label: 'Excel / PPT 预览', href: '/#capabilities' },
      { label: 'PDF / OFD', href: '/#capabilities' },
      { label: '图片 / 音视频', href: '/#capabilities' }
    ]
  }
]

/** Marketing footer. Pure server component — no interactivity, so zero JS is
 *  shipped for it. Anchor links resolve on the landing page; auth links point
 *  at the root-mounted /login and /register. */
export default function MarketingFooter() {
  return (
    <footer className="border-t border-wps-border bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-wps-brand to-wps-brandDark text-white">
                <Icon name="drive" size={17} />
              </span>
              <span className="text-sm font-semibold text-wps-text">JitDrive 智能云盘</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-wps-subtext">
              为团队而生的智能文档云盘：多格式高保真预览、浏览器内 Word 导入、实时协同编辑与可运营的分享，全部装进一个熟悉的 WPS 风格界面。
            </p>
          </div>

          {COLUMNS.map(col => (
            <div key={col.title}>
              <div className="text-sm font-semibold text-wps-text">{col.title}</div>
              <ul className="mt-3 space-y-2">
                {col.links.map(l => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-wps-subtext transition hover:text-wps-brand">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-wps-border pt-6 text-xs text-wps-subtext sm:flex-row">
          <span>© {new Date().getFullYear()} JitDrive · 智能云盘 · Demo 演示环境</span>
          <span className="flex items-center gap-1.5">
            <Icon name="globe" size={13} />
            基于 JitWord iframe SDK 构建
          </span>
        </div>
      </div>
    </footer>
  )
}
