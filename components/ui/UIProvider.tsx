'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import Icon from '../Icon'
import type { IconName } from '../Icon'

type Tone = 'brand' | 'danger'
interface ConfirmOptions {
  title?: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  tone?: Tone
  icon?: IconName
}
interface PromptOptions {
  title?: string
  label?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
}
type ToastType = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  message: React.ReactNode
  type: ToastType
}

interface UIAPI {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  prompt: (opts: PromptOptions) => Promise<string | null>
  toast: (message: React.ReactNode, type?: ToastType) => void
}

const Ctx = createContext<UIAPI | null>(null)

export function useUI(): UIAPI {
  const v = useContext(Ctx)
  if (!v) throw new Error('useUI must be used within <UIProvider>')
  return v
}

const btnGhost =
  'rounded-md border border-wps-border px-3 py-1.5 text-sm text-wps-text transition hover:bg-slate-50'
const btnBrand =
  'rounded-md bg-wps-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-wps-brandDark disabled:opacity-50'
const btnDanger =
  'rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50'

function ConfirmDialog({ options, onResolve }: { options: ConfirmOptions; onResolve: (v: boolean) => void }) {
  const tone = options.tone || 'brand'
  return (
    <Modal
      open
      onClose={() => onResolve(false)}
      title={options.title || '请确认'}
      icon={options.icon || (tone === 'danger' ? 'alert' : 'user')}
      iconClass={tone === 'danger' ? 'text-red-500' : 'text-wps-brand'}
      maxWidth="max-w-sm"
      footer={
        <>
          <button className={btnGhost} onClick={() => onResolve(false)}>
            {options.cancelText || '取消'}
          </button>
          <button className={tone === 'danger' ? btnDanger : btnBrand} onClick={() => onResolve(true)}>
            {options.confirmText || '确定'}
          </button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-wps-text">{options.message}</div>
    </Modal>
  )
}

function PromptDialog({ options, onResolve }: { options: PromptOptions; onResolve: (v: string | null) => void }) {
  const [value, setValue] = useState(options.defaultValue || '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const submit = () => {
    const v = value.trim()
    onResolve(v ? v : null)
  }
  return (
    <Modal
      open
      onClose={() => onResolve(null)}
      title={options.title || '请输入'}
      icon="edit"
      maxWidth="max-w-sm"
      footer={
        <>
          <button className={btnGhost} onClick={() => onResolve(null)}>
            {options.cancelText || '取消'}
          </button>
          <button className={btnBrand} onClick={submit}>
            {options.confirmText || '确定'}
          </button>
        </>
      }
    >
      {options.label && <div className="mb-1.5 text-xs text-wps-subtext">{options.label}</div>}
      <input
        ref={ref}
        value={value}
        placeholder={options.placeholder}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
        }}
        className="w-full rounded-md border border-wps-border bg-white px-3 py-2 text-sm outline-none focus:border-wps-brand"
      />
    </Modal>
  )
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [confirmOpts, setConfirmOpts] = useState<ConfirmOptions | null>(null)
  const confirmResolve = useRef<((v: boolean) => void) | null>(null)
  const [promptOpts, setPromptOpts] = useState<PromptOptions | null>(null)
  const promptResolve = useRef<((v: string | null) => void) | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      confirmResolve.current = resolve
      setConfirmOpts(opts)
    })
  }, [])

  const prompt = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>(resolve => {
      promptResolve.current = resolve
      setPromptOpts(opts)
    })
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: React.ReactNode, type: ToastType = 'info') => {
      const id = ++idRef.current
      setToasts(prev => [...prev, { id, message, type }])
      setTimeout(() => dismissToast(id), 3200)
    },
    [dismissToast]
  )

  const resolveConfirm = (v: boolean) => {
    confirmResolve.current?.(v)
    confirmResolve.current = null
    setConfirmOpts(null)
  }
  const resolvePrompt = (v: string | null) => {
    promptResolve.current?.(v)
    promptResolve.current = null
    setPromptOpts(null)
  }

  return (
    <Ctx.Provider value={{ confirm, prompt, toast }}>
      {children}
      {confirmOpts && <ConfirmDialog options={confirmOpts} onResolve={resolveConfirm} />}
      {promptOpts && <PromptDialog options={promptOpts} onResolve={resolvePrompt} />}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map(t => (
          <ToastView key={t.id} item={t} onClose={() => dismissToast(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  )
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const map: Record<ToastType, { icon: IconName; cls: string }> = {
    success: { icon: 'check', cls: 'text-emerald-600' },
    error: { icon: 'alert', cls: 'text-red-500' },
    info: { icon: 'user', cls: 'text-wps-brand' }
  }
  const m = map[item.type]
  return (
    <div className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border border-wps-border bg-white px-3.5 py-2.5 text-sm text-wps-text shadow-lg">
      <Icon name={m.icon} size={16} className={`mt-0.5 shrink-0 ${m.cls}`} />
      <span className="flex-1">{item.message}</span>
      <button onClick={onClose} className="text-wps-subtext hover:text-wps-text" aria-label="关闭提示">
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
