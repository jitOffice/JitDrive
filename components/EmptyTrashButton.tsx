'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon'
import { useUI } from './ui/UIProvider'

export default function EmptyTrashButton({ count }: { count: number }) {
  const router = useRouter()
  const { confirm, toast } = useUI()
  const [busy, setBusy] = useState(false)

  async function clear() {
    if (count === 0) return
    const ok = await confirm({
      title: '清空回收站',
      tone: 'danger',
      icon: 'trash',
      message: `将彻底删除回收站中的 ${count} 个文档（原始文件移入系统废纸篓，可从系统废纸篓找回），不可撤销。确定清空吗？`,
      confirmText: '清空回收站'
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await fetch('/api/trash', { method: 'DELETE' })
      const j = await r.json().catch(() => ({ code: 0 }))
      if (j && j.code && j.code !== 200) toast(j.message || '清空失败', 'error')
      else {
        toast('回收站已清空', 'success')
        router.refresh()
      }
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={clear}
      disabled={busy || count === 0}
      className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name="trash" size={15} />
      {busy ? '清空中…' : '清空回收站'}
    </button>
  )
}
