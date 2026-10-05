import type { Metadata } from 'next'
import Link from 'next/link'
import Icon, { type IconName } from '@/components/Icon'
import { getSessionUserId } from '@/lib/auth'
import { DRIVE, REGISTER } from '@/lib/routes'
import ProductMock from '@/components/marketing/ProductMock'

export const metadata: Metadata = {
  title: 'JitDrive 智能云盘 · 会思考的团队文档中枢',
  description:
    'JitDrive 是为团队打造的智能云盘：多格式高保真预览、浏览器内 Word 一键导入、实时协同编辑、可运营的分享链接与安全可控的数据生命周期，装进一个熟悉的 WPS 风格界面。',
  keywords: ['智能云盘', '企业云盘', '协作文档', '文档预览', 'JitWord', 'JitDrive', '在线办公'],
  alternates: { canonical: '/' },
  openGraph: {
    title: 'JitDrive 智能云盘 · 会思考的团队文档中枢',
    description: '多格式高保真预览 · 浏览器内 Word 导入 · 实时协同 · 可运营的分享 · 安全可控。',
    type: 'website',
    url: '/'
  },
  robots: { index: true, follow: true }
}

/* ------------------------------------------------------------------ data -- */

const STATS: { value: string; label: string }[] = [
  { value: '20+', label: '种文件格式直接预览' },
  { value: '0', label: '字节上传即可导入 Word' },
  { value: '3', label: '级权限：拥有 / 编辑 / 只读' },
  { value: '30天', label: '回收站自动清理窗口' }
]

const CAPABILITIES: { icon: IconName; title: string; desc: string; tint: string }[] = [
  {
    icon: 'grid',
    title: '多格式高保真预览',
    desc: 'Word、Excel、PPT、PDF、OFD、图片、音视频、压缩包——同类内核渲染，版式与字体还原到位，不必下载就能看清每一份文件。',
    tint: 'bg-red-50 text-wps-brand'
  },
  {
    icon: 'import',
    title: '浏览器内 Word 导入',
    desc: '.docx 直接喂给编辑器内核，在浏览器本地完成解析，表格、图片、列表与样式尽量保留，服务端不落明文、不二次转换。',
    tint: 'bg-emerald-50 text-emerald-600'
  },
  {
    icon: 'edit',
    title: '实时协同编辑',
    desc: '多人同时在线的文档引擎，编辑态与预览态一键切换，共享给我的文件自动落到只读视图，改不动也不会误伤。',
    tint: 'bg-sky-50 text-sky-600'
  },
  {
    icon: 'tree',
    title: '目录树 + 全局搜索',
    desc: '卡片与嵌套目录树双视图自由切换，配合按标题的即时搜索，文件再多也能秒级定位到那一份。',
    tint: 'bg-amber-50 text-amber-600'
  },
  {
    icon: 'search',
    title: '智能自动归档',
    desc: '上传自动识别类型并落位，历史文档智能归拢，新文件即时可预览、可分享，省去手动整理的琐碎。',
    tint: 'bg-violet-50 text-violet-600'
  },
  {
    icon: 'link',
    title: '一份文件多端可用',
    desc: '从桌面到移动端，一个链接即可预览、协同与分享；熟悉的 WPS 风格交互，团队几乎零学习成本上手。',
    tint: 'bg-rose-50 text-rose-600'
  }
]

const AI_POINTS: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'import',
    title: '看懂格式，而非搬运字节',
    desc: '导入即解析：识别标题层级、表格、图片与列表，把一份 .docx 变成可继续协同的在线文档。'
  },
  {
    icon: 'search',
    title: '该出现时自然出现',
    desc: '自动归档、类型分派、最近打开与全局搜索，让常用内容浮到眼前，减少翻找与重复上传。'
  },
  {
    icon: 'grid',
    title: '所见即所得的预览',
    desc: '同一套渲染内核贯穿云盘、编辑器与分享落地页，无论谁打开，看到的版式都一致。'
  },
  {
    icon: 'share',
    title: '分享即洞察',
    desc: '每一次访问都被结构化记录，链接是否被打开、被谁打开、开了几次，数据替你说话。'
  }
]

const SHARE_FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'lock', title: '密码与有效期', desc: '为链接设置访问口令与到期时间，过期即失效，敏感资料不必担心长期裸奔。' },
  { icon: 'users', title: '指定人白名单', desc: '只让名单内的成员可见，移出名单后立即拦截，无需重新发链接。' },
  { icon: 'qrcode', title: '二维码与口令分发', desc: '面对面扫码或复制口令，多种分发姿势覆盖会议、社群与私聊场景。' },
  { icon: 'eye', title: '访问明细与洞察', desc: '浏览量、独立访问、最近打开时间尽在掌握，让每一次分享都能复盘。' },
  { icon: 'folder', title: '整目录可分享', desc: '一个链接分享整个文件夹树，子文件按需展开，资料打包分享不再逐个发。' },
  { icon: 'trash', title: '批量管理与吊销', desc: '在我的分享面板集中查看、筛选与批量吊销，链接一多也不失控。' }
]

const SECURITY_POINTS: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'user', title: '细粒度权限', desc: '拥有者 / 编辑 / 只读三级，非拥有者自动落到只读，删除、彻底清除、重命名均受归属校验。' },
  { icon: 'lock', title: '无状态安全会话', desc: 'HMAC 签名的 HttpOnly 会话 Cookie，前端读不到、XSS 偷不走，撤销即失效。' },
  { icon: 'globe', title: '反爆破与反枚举', desc: '口令校验滑动窗口限流，越权访问统一返回 404，杜绝归属枚举的侧信道。' },
  { icon: 'restore', title: '软删除数据生命周期', desc: '删除先进回收站，可随时还原；到期由后台自动清理，误删有救、垃圾有界。' }
]

const PLATFORMS: { icon: IconName; title: string; desc: string; points: string[] }[] = [
  {
    icon: 'link',
    title: '可嵌入的 iframe SDK',
    desc: '文档能力以 iframe SDK 形式交付，能嵌进你已有的门户、知识库与业务系统。',
    points: ['与宿主页面双向握手', '绝对地址 + 资源路径可配', '编辑 / 预览 / 只读多形态']
  },
  {
    icon: 'drive',
    title: '一键自部署',
    desc: '标准 Web 应用形态，本地或私有云皆可运行，数据完全握在自己手里。',
    points: ['SQLite 起步，可迁移 Postgres', '邀请码注册、无第三方依赖', '环境变量即可切换租户']
  },
  {
    icon: 'globe',
    title: '团队 SaaS',
    desc: '开箱即用的多租户云盘，邀请同事即可共享协同，适合快速起跑的小团队。',
    points: ['邮箱 + 密码 + 邀请码加入', '分享链接公开可达', '统一的空间与回收站策略']
  }
]

/* --------------------------------------------------------------- helpers -- */

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-sm font-semibold text-wps-brand">{eyebrow}</div>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-wps-text sm:text-4xl">{title}</h2>
      {sub && <p className="mt-4 text-base leading-relaxed text-wps-subtext">{sub}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ page -- */

export default async function MarketingPage() {
  const signedIn = !!getSessionUserId()

  return (
    <>
      {/* HERO ---------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-red-50/70 via-white to-white">
        {/* decorative blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-wps-brand/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-40 h-80 w-80 rounded-full bg-amber-300/10 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pt-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-wps-brand/20 bg-white px-3 py-1 text-xs font-medium text-wps-brand shadow-sm">
              <Icon name="drive" size={13} />
              智能云盘 · 为团队文档而生
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-wps-text sm:text-5xl">
              让团队的每一份文档，
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-wps-brand to-amber-500 bg-clip-text text-transparent">都被智能地看见</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-wps-subtext">
              JitDrive 把多格式高保真预览、浏览器内 Word 导入、实时协同编辑与可运营的分享，收进一个你早已熟悉的 WPS 风格云盘。上传即解析、打开即协同、分享即洞察。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {signedIn ? (
                <Link
                  href={DRIVE}
                  className="flex items-center gap-2 rounded-lg bg-wps-brand px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-wps-brand/20 transition hover:bg-wps-brandDark"
                >
                  进入我的云盘
                  <Icon name="chevronRight" size={16} />
                </Link>
              ) : (
                <Link
                  href={REGISTER}
                  className="flex items-center gap-2 rounded-lg bg-wps-brand px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-wps-brand/20 transition hover:bg-wps-brandDark"
                >
                  免费开始使用
                  <Icon name="chevronRight" size={16} />
                </Link>
              )}
              <a
                href="#capabilities"
                className="flex items-center gap-2 rounded-lg border border-wps-border bg-white px-6 py-3 text-sm font-semibold text-wps-text transition hover:border-wps-brand hover:text-wps-brand"
              >
                了解核心能力
              </a>
            </div>
            <p className="mt-4 text-xs text-wps-subtext">演示环境内置示例账号，注册需邀请码——无需绑卡，即开即用。</p>
          </div>

          <div className="relative">
            <ProductMock />
          </div>
        </div>

        {/* stats strip */}
        <div className="relative mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-wps-border bg-white p-6 shadow-sm sm:gap-6 lg:grid-cols-4">
            {STATS.map(s => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-extrabold text-wps-brand sm:text-4xl">{s.value}</div>
                <div className="mt-1 text-xs text-wps-subtext sm:text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CAPABILITIES -------------------------------------------------- */}
      <section id="capabilities" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="核心能力"
            title="一个云盘，装下团队关于文档的所有动作"
            sub="从上传、预览、协同到分享与管理，JitDrive 用一致的体验覆盖文件的全生命周期。"
          />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(c => (
              <div
                key={c.title}
                className="group rounded-2xl border border-wps-border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className={'grid h-12 w-12 place-items-center rounded-xl ' + c.tint}>
                  <Icon name={c.icon} size={22} />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-wps-text">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-wps-subtext">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI / 智能云盘 ------------------------------------------------- */}
      <section id="ai" className="scroll-mt-20 bg-wps-side py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div className="relative order-2 lg:order-1">
            <div className="rounded-2xl border border-wps-border bg-white p-6 shadow-lg">
              <div className="flex items-center gap-2 border-b border-wps-border pb-3 text-sm font-medium text-wps-text">
                <Icon name="import" size={16} className="text-wps-brand" />
                导入 Word · 浏览器内解析
              </div>
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-wps-brand">
                    <Icon name="file" size={18} />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm text-wps-text">季度总结.docx</div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full w-full rounded-full bg-wps-brand" />
                    </div>
                  </div>
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                    <Icon name="check" size={14} />
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['标题层级', '表格 / 列表', '图片 / 样式'].map(t => (
                    <div
                      key={t}
                      className="rounded-lg border border-wps-border bg-wps-side px-2 py-2 text-center text-[11px] text-wps-subtext"
                    >
                      {t}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-wps-border bg-white px-3 py-2 text-xs text-wps-subtext">
                  <Icon name="lock" size={13} />
                  解析在本地完成 · 服务端不落明文
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="text-sm font-semibold text-wps-brand">智能云盘</div>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-wps-text sm:text-4xl">
              不只是存文件，更懂文件里的内容
            </h2>
            <p className="mt-4 text-base leading-relaxed text-wps-subtext">
              「智能」不是噱头，而是每一次与文档打交道时少费的那份心：识别格式、自动落位、一致还原、分享留痕。
            </p>
            <dl className="mt-8 space-y-5">
              {AI_POINTS.map(p => (
                <div key={p.title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-wps-brand shadow-sm ring-1 ring-wps-border">
                    <Icon name={p.icon} size={18} />
                  </span>
                  <div>
                    <dt className="text-base font-semibold text-wps-text">{p.title}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-wps-subtext">{p.desc}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* SHARE --------------------------------------------------------- */}
      <section id="share" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="分享运营化"
            title="把每一次分享，都变成可管理、可复盘的动作"
            sub="密码、有效期、白名单、二维码、访问明细与批量吊销——分享从此不只是发个链接。"
          />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SHARE_FEATURES.map(f => (
              <div key={f.title} className="rounded-2xl border border-wps-border bg-wps-side p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-wps-brand shadow-sm">
                  <Icon name={f.icon} size={20} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-wps-text">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-wps-subtext">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECURITY ------------------------------------------------------ */}
      <section id="security" className="scroll-mt-20 bg-wps-text py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-sm font-semibold text-wps-brand">安全可控</div>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">你的数据，边界清清楚楚</h2>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              权限、会话、访问与删除，每一层都有明确的门。安全不是事后补丁，而是架构里的默认。
            </p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SECURITY_POINTS.map(p => (
              <div key={p.title} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-wps-brand text-white">
                  <Icon name={p.icon} size={20} />
                </span>
                <h3 className="mt-4 text-base font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORM ------------------------------------------------------ */}
      <section id="platform" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="平台形态"
            title="嵌入、自部署，或直接给团队用起来"
            sub="同一套文档内核，三种落地方式，按你的场景选一条路。"
          />
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {PLATFORMS.map(p => (
              <div
                key={p.title}
                className="flex flex-col rounded-2xl border border-wps-border bg-white p-7 shadow-sm transition hover:shadow-md"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-wps-brand to-wps-brandDark text-white">
                  <Icon name={p.icon} size={22} />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-wps-text">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-wps-subtext">{p.desc}</p>
                <ul className="mt-4 space-y-2 border-t border-wps-border pt-4">
                  {p.points.map(pt => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-wps-text">
                      <Icon name="check" size={16} className="mt-0.5 shrink-0 text-wps-brand" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA ----------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-wps-brand to-wps-brandDark py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            现在，把团队的文档搬进会思考的云盘
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-red-50">
            上传、协同、分享、管理，一站式完成。内置演示账号，几分钟即可体验完整的智能云盘。
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={signedIn ? DRIVE : REGISTER}
              className="flex items-center gap-2 rounded-lg bg-white px-7 py-3 text-sm font-semibold text-wps-brand shadow-lg transition hover:bg-red-50"
            >
              {signedIn ? '进入我的云盘' : '免费创建账号'}
              <Icon name="chevronRight" size={16} />
            </Link>
            <a
              href="/#capabilities"
              className="flex items-center gap-2 rounded-lg border border-white/40 px-7 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              再逛逛功能
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
