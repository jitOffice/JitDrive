'use client'

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon, { type IconName } from './Icon'

/** 菜单项：label 必填，其他字段互斥或组合使用。
 *  - `onClick`：内部动作（重命名 / 分享 / 移动 / 删除）——由 caller 决定路由。
 *  - `href` + 无 `onClick`：直接 `<a>` 跳转 / 下载（例如 `/api/files/[id]/download`）。
 *  - `danger`：红色文案（删除 / 彻底删除）。
 *  - `divider`：在该项 **之前** 插入一条 1px 分隔线（末尾危险动作前的视觉隔断）。
 *  - `disabled`：灰色不可点，busy 期间由 caller 传入。 */
export interface RowAction {
  label: string
  icon?: IconName
  onClick?: () => void
  href?: string
  download?: boolean
  danger?: boolean
  disabled?: boolean
  divider?: boolean
}

interface Props {
  actions: RowAction[]
  /** 无障碍 name；默认"更多操作" */
  ariaLabel?: string
  /** 触发按钮 title tooltip */
  title?: string
  /** 整体禁用（例如回收站里的 busy 状态）——trigger 不可 hover/click 打开 */
  disabled?: boolean
  /** 触发按钮尺寸（默认 28px）——树模式行高较矮可用 24 */
  triggerSize?: 24 | 28 | 32
  /** 只在 hover 时才显示触发按钮（卡片右上或树行右侧常用） */
  visibleOnHoverOnly?: boolean
}

/** 卡片行右上角 / 树模式每行末尾的统一 ⋯ 下拉。
 *
 *  交互约定：
 *  - hover 触发按钮 250ms 打开（避免鼠标划过即闪出）
 *  - click 触发按钮 toggle 打开/关闭（触屏主要路径）
 *  - hover 打开的菜单遇到 click 会"钉住"（不关闭），只有 click 打开的才 toggle 关
 *  - 打开时菜单与触发按钮共享 hover 区，鼠标从按钮移到菜单上不会误关
 *  - Esc / 外点击 / 选择项 → 关闭
 *  - 菜单通过 `createPortal(…, document.body)` 挂到根 → 完全脱离祖先 stacking context
 *    （v0.5.3.1 修复：之前只靠 `position:fixed`+`z-50`，但 caller 给 ⋯ 外层加了 `z-20`
 *     后 wrapper 变成 stacking context，把 fixed 菜单困在里面，被后续卡片的 ⋯ 覆盖，
 *     底部"删除"项就"被截断"了；portal 到 body 后菜单 z-index 直接在根上下文比较）
 *  - 靠近视口右/下边界自动 flip（右侧贴齐 / 向上翻），max-height 兜底内部滚动 */
export default function RowActionsMenu({
  actions,
  ariaLabel = '更多操作',
  title = '更多操作',
  disabled = false,
  triggerSize = 28,
  visibleOnHoverOnly = false
}: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  // 记录菜单是"怎么被打开的"——hover 还是 click。
  // 修 v0.5.3 交互 bug：hover 250ms 自动打开后，用户（或自动化点击）紧接着的
  // 那一次 click 会命中 onTriggerClick 的 toggle 分支把刚打开的菜单又关掉，
  // 表现为"点 ⋯ 打不开 / 看不到删除"。用 openedBy 区分：hover 打开的菜单遇到
  // click 时不关闭，而是"钉住"（转成 click 归属），只有真正 click 打开的才 toggle 关。
  const openedBy = useRef<'hover' | 'click' | null>(null)

  function clearTimers() {
    if (openTimer.current) { window.clearTimeout(openTimer.current); openTimer.current = null }
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  function measure() {
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    const MENU_W = 180
    let left = r.right - MENU_W
    if (left < 8) left = 8
    if (left + MENU_W > window.innerWidth - 8) left = window.innerWidth - MENU_W - 8
    // 每项 30px + 上下 padding 4 + 分隔线（保守估）
    const dividerCount = actions.filter(a => a.divider).length
    const estH = actions.length * 30 + 8 + dividerCount * 9
    let top = r.bottom + 4
    if (r.bottom + 4 + estH > window.innerHeight - 8) {
      top = Math.max(8, r.top - 4 - estH)
    }
    setPos({ top, left })
  }

  function openMenu(source: 'hover' | 'click') {
    if (disabled) return
    clearTimers()
    openedBy.current = source
    measure()
    setOpen(true)
  }
  function closeMenu() {
    clearTimers()
    openedBy.current = null
    setOpen(false)
  }
  function scheduleOpen() {
    if (disabled || open) return
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
    if (openTimer.current) return
    openTimer.current = window.setTimeout(() => { openTimer.current = null; openMenu('hover') }, 250)
  }
  function scheduleClose() {
    if (openTimer.current) { window.clearTimeout(openTimer.current); openTimer.current = null }
    if (!open) return
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => { closeTimer.current = null; setOpen(false) }, 220)
  }
  function cancelClose() {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  useEffect(() => () => clearTimers(), [])

  // 打开时监听滚动 / resize / 外点击 / Esc
  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const t = triggerRef.current
      const m = menuRef.current
      const target = e.target as Node
      if (t && t.contains(target)) return
      if (m && m.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onScrollOrResize = () => measure()
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  // 渲染后再校准一次真实高度（用于底部溢出保护）
  useLayoutEffect(() => {
    if (!open) return
    const m = menuRef.current
    const t = triggerRef.current
    if (!m || !t) return
    const r = m.getBoundingClientRect()
    const tr = t.getBoundingClientRect()
    if (r.bottom > window.innerHeight - 8) {
      setPos(p => p ? { ...p, top: Math.max(8, tr.top - 4 - r.height) } : p)
    }
  }, [open])

  function onTriggerClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    if (open) {
      // 关键修复：菜单是被 hover 自动打开的，紧随其后的这次 click 不该关掉它，
      // 否则用户"移过去→它开了→点一下→又关了"，看起来就是打不开、没有删除项。
      // 这里把它"钉住"（归属转成 click），下一次真正的 click 才 toggle 关闭。
      if (openedBy.current === 'hover') {
        openedBy.current = 'click'
        measure()
        return
      }
      closeMenu()
      return
    }
    openMenu('click')
  }

  function runItem(a: RowAction, close: () => void) {
    if (a.disabled) return
    close()
    if (a.onClick) a.onClick()
  }

  const sizeMap = { 24: 'h-6 w-6', 28: 'h-7 w-7', 32: 'h-8 w-8' } as const
  const iconSize = triggerSize <= 24 ? 14 : 16

  return (
    <>
      <div
        className={
          'relative inline-flex ' +
          (visibleOnHoverOnly
            ? 'opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 ' + (open ? '!opacity-100' : '')
            : '')
        }
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={ariaLabel}
          title={title}
          disabled={disabled}
          onClick={onTriggerClick}
          className={
            'grid place-items-center rounded-md border transition ' + sizeMap[triggerSize] + ' ' +
            (open
              ? 'border-wps-brand bg-wps-brand text-white'
              : 'border-transparent text-wps-subtext hover:border-wps-border hover:bg-slate-50 hover:text-wps-text') +
            (disabled ? ' cursor-not-allowed opacity-40' : '')
          }
        >
          <Icon name="more" size={iconSize} />
        </button>
      </div>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: 180,
            zIndex: 50,
            // 短视口 / 多动作时防截断：允许内部滚动而不是溢出到屏幕外
            maxHeight: 'calc(100vh - 16px)',
            overflowY: 'auto'
          }}
          className="rounded-md border border-wps-border bg-white py-1 shadow-lg"
        >
          {actions.map((a, i) => {
            const dividerEl = a.divider
              ? <div key={'d-' + i} className="my-1 border-t border-slate-100" />
              : null

            const content = (
              <>
                {a.icon ? <Icon name={a.icon} size={13} /> : <span className="inline-block w-[13px] shrink-0" />}
                <span className="ml-2 flex-1 truncate text-left">{a.label}</span>
              </>
            )
            const base = 'flex w-full items-center px-3 py-1.5 text-xs transition outline-none focus:bg-slate-50 '
            const tone = a.disabled
              ? 'cursor-not-allowed text-wps-subtext/50'
              : a.danger
                ? 'text-red-500 hover:bg-red-50'
                : 'text-wps-text hover:bg-slate-50'
            const cls = base + tone
            const key = `${a.label}-${i}`

            let itemEl: React.ReactNode
            if (a.href && !a.onClick) {
              itemEl = (
                <a
                  key={key}
                  href={a.href}
                  download={a.download}
                  role="menuitem"
                  aria-disabled={a.disabled}
                  className={cls}
                  onClick={e => {
                    if (a.disabled) { e.preventDefault(); return }
                    setOpen(false)
                  }}
                >
                  {content}
                </a>
              )
            } else {
              itemEl = (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  disabled={a.disabled}
                  className={cls}
                  onClick={e => { e.stopPropagation(); runItem(a, () => setOpen(false)) }}
                >
                  {content}
                </button>
              )
            }

            // divider=true → 在该项 **之前** 插一条分隔线，但仍然渲染该项本身
            return dividerEl
              ? <Fragment key={`fw-${key}`}>{dividerEl}{itemEl}</Fragment>
              : itemEl
          })}
        </div>,
        document.body
      )}
    </>
  )
}
