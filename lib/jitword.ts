// Server-only JitWord embed helper.
//
// NEVER import this from a "use client" file. It reads JITWORD_CLIENT_SECRET
// straight from process.env and puts that secret in the X-Embed-Client-Secret
// header. The secret MUST stay on the server; the browser only ever sees the
// short-lived one-time ticket returned by issueTicket().
const API_BASE = (process.env.JITWORD_API_BASE || 'https://inner.jitword.com/api/v1').replace(/\/+$/, '')
const EDITOR_URL = (process.env.JITWORD_EDITOR_URL || 'https://inner.jitword.com/px-editor').replace(/\/+$/, '')
const TENANT_KEY = process.env.JITWORD_TENANT_KEY || 'demo'
const PROVIDER_KEY = process.env.JITWORD_PROVIDER_KEY || 'jitword-sdk-demo'
const CLIENT_SECRET = process.env.JITWORD_CLIENT_SECRET || ''
const DEMO_SUBJECT = process.env.DEMO_SUBJECT || 'demo-alice'
const DEMO_DISPLAY_NAME = process.env.DEMO_DISPLAY_NAME || 'Demo User'

export interface PublicConfig {
  editorUrl: string
  apiBase: string
  tenantKey: string
  providerKey: string
}

export function publicConfig(): PublicConfig {
  return { editorUrl: EDITOR_URL, apiBase: API_BASE, tenantKey: TENANT_KEY, providerKey: PROVIDER_KEY }
}

interface JitwordEnvelope<T> {
  code: number
  message?: string
  data?: T
}

async function jwFetch<T>(path: string, init: RequestInit): Promise<T> {
  if (!CLIENT_SECRET) throw new Error('JITWORD_CLIENT_SECRET is not configured')
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'X-Embed-Client-Secret': CLIENT_SECRET,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  })
  const text = await res.text()
  let body: JitwordEnvelope<T>
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`JitWord ${path}: HTTP ${res.status} non-json: ${text.slice(0, 200)}`)
  }
  if (!res.ok || (typeof body.code === 'number' && body.code !== 200)) {
    throw new Error(`JitWord ${path}: HTTP ${res.status} code=${body.code} msg=${body.message || text.slice(0, 200)}`)
  }
  if (!body.data) throw new Error(`JitWord ${path}: empty data payload`)
  return body.data
}

export interface CreatedDoc {
  docId: string
  name: string
  createdAt: string
  updatedAt: string
}

export async function createDocument(opts: { name: string; externalSubject?: string }): Promise<CreatedDoc> {
  const body = {
    tenantKey: TENANT_KEY,
    providerKey: PROVIDER_KEY,
    externalSubject: opts.externalSubject || DEMO_SUBJECT,
    type: 'document',
    name: opts.name
  }
  const data = await jwFetch<{ docId: string; document?: { name?: string; createdAt?: string; updatedAt?: string } }>(
    '/embed/documents',
    { method: 'POST', body: JSON.stringify(body) }
  )
  return {
    docId: data.docId,
    name: data.document?.name || opts.name,
    createdAt: data.document?.createdAt || new Date().toISOString(),
    updatedAt: data.document?.updatedAt || new Date().toISOString()
  }
}

export interface IssueTicketOptions {
  docId: string
  origin: string
  externalSubject?: string
  permission?: { role: string; scopes: string[] }
  ui?: { readonly?: boolean; theme?: 'light' | 'dark' | 'auto'; toolbar?: 'full' | 'simple' | 'none' | 'compact' }
  watermark?: { text?: string; color?: string; opacity?: number }
  expiresIn?: number
}

export interface IssuedTicket {
  ticket: string
  expiresAt: number
  docId: string
  origin: string
  scopes?: string[]
}

export async function issueTicket(opts: IssueTicketOptions): Promise<IssuedTicket> {
  const body: Record<string, unknown> = {
    tenantKey: TENANT_KEY,
    providerKey: PROVIDER_KEY,
    externalSubject: opts.externalSubject || DEMO_SUBJECT,
    docId: opts.docId,
    origin: opts.origin,
    user: { displayName: DEMO_DISPLAY_NAME },
    // Demo default: full read+edit+comment unless caller narrows it.
    permission: opts.permission || { role: 'editor', scopes: ['document:read', 'document:edit', 'comment:write'] },
    // Ticket lifetime is clamped 60-300 by JitWord.
    expiresIn: typeof opts.expiresIn === 'number' ? opts.expiresIn : 120
  }
  if (opts.ui) body.ui = opts.ui
  if (opts.watermark) body.watermark = opts.watermark
  const data = await jwFetch<{
    ticket: string
    expiresAt: number
    docId: string
    origin: string
    scopes?: string[]
  }>('/embed/tickets', { method: 'POST', body: JSON.stringify(body) })
  return {
    ticket: data.ticket,
    expiresAt: data.expiresAt,
    docId: data.docId,
    origin: data.origin,
    scopes: data.scopes
  }
}

/** Resolve the origin JitWord will accept for the current request.
 *  Priority: DEMO_PUBLIC_ORIGIN > incoming `Origin` header > incoming `Host`. */
export function resolveOrigin(req: Request): string {
  if (process.env.DEMO_PUBLIC_ORIGIN) return process.env.DEMO_PUBLIC_ORIGIN.replace(/\/+$/, '')
  const origin = req.headers.get('origin')
  if (origin) return origin.replace(/\/+$/, '')
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') || 'http'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}
