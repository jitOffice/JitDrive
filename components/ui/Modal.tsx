'use client'

import { useEffect } from 'react'
import Icon from '../Icon'
import type { IconName } from '../Icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  icon?: IconName
  iconClass?: string
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: string
  closeOnBackdrop?: boolean
}

/** Shared dialog shell (WPS-ish: white card, subtle backdrop, top-right close).
 *  Used directly by ShareDialog and as the base for confirm / prompt / toasts. */
export default function Modal({
  open,
  onClose,
  title,
  icon,
  iconClass = 'text-wps-brand',
  children,
  footer,
  maxWidth = 'max-w-md',
  closeOnBackdrop = true
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[1px]"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${maxWidth} rounded-xl border border-wps-border bg-white p-5 shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-wps-text">
            {icon && <Icon name={icon} size={17} className={iconClass} />}
            {title}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 -mt-1 rounded-md p-1 text-wps-subtext transition hover:bg-slate-100 hover:text-wps-text"
            aria-label="关闭"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="mt-3">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
