// v0.7 · P0 · Heuristic sensitivity scanner — pure core.
//
// 拆成 core + fs 两个文件的原因：
//   • sensitive.ts 需要 `fs/promises` 打开物理文件做正文扫描，是 server-only。
//   • LinkPane 是 client component，只用到"根据 sensitivity 字段渲染 banner 文案"
//     这一小段纯逻辑，绝不能把 fs 拉进浏览器 bundle（webpack 会抛
//     `UnhandledSchemeError: Reading from "node:path" is not handled`）。
//   • 项目老规则（v0.6 MEMORY 里踩过）：client 边界不能跨调 server 模块，即便
//     目标函数是 pure — 模块 import 会把整个文件（含 side effects）打包。
//
// 所以：纯函数 + 类型 + 常量 → sensitive-core.ts（client-safe），
//       fs IO（scanFile）留在 sensitive.ts。routes / store 都从 sensitive.ts 拿。
import type { SensitivityLabel } from '../types'

/** Text-family extensions we feel comfortable reading as utf-8 today.
 *  Deliberately narrow: json/xml/log aren't in the upload whitelist yet, and
 *  opening a xlsx/pdf binary stream as utf-8 would produce garbage matches. */
export const TEXT_FAMILY = new Set(['txt', 'md', 'html', 'htm', 'csv'])

/** Body read ceiling (bytes). Files larger than this get their head slice. */
export const BODY_SCAN_LIMIT = 4 * 1024 * 1024

interface Rule {
  id: string
  bucket: SensitivityLabel
  label: string
  pattern?: RegExp
  filenameKeywords?: string[]
}

const RULES: Rule[] = [
  // ----- 高：明确 PII / 密钥 -----
  {
    // 中国大陆居民身份证 18 位（末位可能是 X）。
    id: 'id-card',
    bucket: 'high',
    label: '身份证号',
    pattern: /(?<![0-9Xx])\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx](?![0-9Xx])/g,
    filenameKeywords: ['身份证', 'id-card', 'idcard']
  },
  {
    // 银行卡号 16-19 位数字。Luhn 校验在 scanContent 里做，避免误伤订单号。
    id: 'bank-card',
    bucket: 'high',
    label: '银行卡号',
    pattern: /(?<!\d)\d{16,19}(?!\d)/g,
    filenameKeywords: ['银行卡', '信用卡', 'bank-card', 'debit', 'credit']
  },
  {
    id: 'private-key',
    bucket: 'high',
    label: '私钥文件',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
    filenameKeywords: ['私钥', 'private_key', 'privatekey', '.pem']
  },
  {
    id: 'aws-key',
    bucket: 'high',
    label: '云 API 密钥',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g
  },
  {
    id: 'password-literal',
    bucket: 'high',
    label: '明文密码',
    pattern: /(?:password|passwd|pwd|密码|secret|token)\s*[:=]\s*["']?[^\s"',;]{4,64}["']?/gi,
    filenameKeywords: ['密码', 'password', 'secret', 'token']
  },
  // ----- 中：疑似 / 上下文型敏感 -----
  {
    id: 'phone-cn',
    bucket: 'medium',
    label: '手机号',
    pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    filenameKeywords: ['手机号', 'phone', '联系电话']
  },
  {
    id: 'email',
    bucket: 'medium',
    label: '邮箱',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  },
  {
    id: 'contract-keyword',
    bucket: 'medium',
    label: '合同/协议',
    filenameKeywords: ['合同', '协议', 'contract', 'agreement', '保密', 'nda', '薪资', '工资', 'salary', 'payroll', '花名册', '员工名单', '客户名单']
  }
]

const BUCKET_ORDER: Record<SensitivityLabel, number> = { low: 0, medium: 1, high: 2 }
function maxBucket(a: SensitivityLabel, b: SensitivityLabel): SensitivityLabel {
  return BUCKET_ORDER[a] >= BUCKET_ORDER[b] ? a : b
}

function luhnValid(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

function shannonEntropy(s: string): number {
  if (!s.length) return 0
  const freq = new Map<string, number>()
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1)
  let h = 0
  for (const n of freq.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

export interface ScanResult {
  label: SensitivityLabel
  reasons: string[]
  reasonLabels: string[]
}

/** 扫一段 utf-8 文本 + 一个文件名，返回综合 bucket。空文本 / 空文件名都安全。 */
export function scanContent(text: string, filename: string): ScanResult {
  const reasons = new Set<string>()
  const labels = new Set<string>()
  let bucket: SensitivityLabel = 'low'

  const fname = (filename || '').toLowerCase()
  for (const rule of RULES) {
    if (!rule.filenameKeywords) continue
    if (rule.filenameKeywords.some(k => fname.includes(k.toLowerCase()))) {
      reasons.add(rule.id)
      labels.add(rule.label)
      bucket = maxBucket(bucket, rule.bucket)
    }
  }

  if (text && text.length > 0) {
    for (const rule of RULES) {
      if (!rule.pattern) continue
      rule.pattern.lastIndex = 0
      const raw = text.match(rule.pattern)
      if (!raw || raw.length === 0) continue
      if (rule.id === 'bank-card') {
        const hits = raw.filter(m => luhnValid(m))
        if (hits.length === 0) continue
      }
      reasons.add(rule.id)
      labels.add(rule.label)
      bucket = maxBucket(bucket, rule.bucket)
    }

    const blobs = text.match(/[A-Za-z0-9+/=]{200,}/g)
    if (blobs) {
      for (const b of blobs) {
        if (shannonEntropy(b) > 4.4) {
          reasons.add('high-entropy-blob')
          labels.add('高熵密串')
          bucket = maxBucket(bucket, 'high')
          break
        }
      }
    }
  }

  return { label: bucket, reasons: Array.from(reasons), reasonLabels: Array.from(labels) }
}

/** 分享弹窗预警文案。null 表示无需预警。client-safe，LinkPane 直接调。 */
export function bannerTextFor(label: SensitivityLabel | null | undefined): string | null {
  if (label === 'high') return '此文件被扫描到疑似身份证 / 银行卡 / 私钥等敏感信息，分享前请再次确认接收方。'
  if (label === 'medium') return '此文件疑似包含合同 / 员工名单 / 手机号等半敏感内容，建议使用「仅指定用户」或加密分享。'
  return null
}
