import Icon from '@/components/Icon'

interface Props {
  reason:
    | 'not-found'
    | 'revoked'
    | 'expired'
    | 'view-limit'
    | 'file-gone'
    | 'folder-gone'
    | 'not-invited'
    | 'need-login'
    | 'unknown'
  /** Optional override for the sub headline (typically the server's
   *  `gate.message`, so the reason stays as an icon/heading hint while the
   *  body text matches what the gate actually said). */
  message?: string
}

const HEADLINES: Record<Props['reason'], { title: string; sub: string }> = {
  'not-found': {
    title: '分享链接不存在',
    sub: '请核对链接是否完整，或联系分享者重新发送。'
  },
  revoked: {
    title: '分享已被撤销',
    sub: '分享者主动关闭了这条链接，内容不再对外可见。'
  },
  expired: {
    title: '分享链接已过期',
    sub: '链接超过了分享者设置的有效时间，请联系对方重新发送。'
  },
  'view-limit': {
    title: '浏览次数已用完',
    sub: '这条链接达到了分享者设定的最大浏览次数。'
  },
  'file-gone': {
    title: '文件已不可用',
    sub: '原文件已被删除或移入回收站，链接随之失效。'
  },
  'folder-gone': {
    title: '目录已不可用',
    sub: '原目录已被删除或移入回收站，链接随之失效。'
  },
  'not-invited': {
    title: '你不在可见名单中',
    sub: '这条分享限定了可见用户，你的账号未被添加，请联系分享者。'
  },
  'need-login': {
    title: '请先登录',
    sub: '这条分享需要登录后才能查看。'
  },
  unknown: {
    title: '无法打开这条分享',
    sub: '请稍后重试，或联系分享者确认状态。'
  }
}

export default function ShareError({ reason, message }: Props) {
  const h = HEADLINES[reason] || HEADLINES.unknown
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-wps-border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-600">
          <Icon name="alert" size={22} />
        </div>
        <div className="text-lg font-semibold text-wps-text">{h.title}</div>
        <div className="mt-1 text-sm text-wps-subtext">{message || h.sub}</div>
        <div className="mt-6 text-[11px] text-wps-subtext">JitDrive · 你正在访问的链接由文件所有者分享</div>
      </div>
    </div>
  )
}
