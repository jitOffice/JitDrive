// v0.7 · P0 · Tag suggestion engine (runtime only — no persistence this round).
//
// Two signals combined:
//   1. **Extension → 类别标签** (deterministic, always high confidence).
//      docx → 文档, xlsx → 表格, pptx → 演示, pdf → PDF, txt/md → 文本, png/jpg
//      → 图片, mp4 → 视频, mp3 → 音频, zip → 压缩包.
//   2. **Filename 关键词 → 语义标签** (heuristic, medium confidence when
//      keyword is on the whitelist). Contract / invoice / meeting / plan /
//      resume / report / 版本 / 草稿 / 终稿 / 备份 / etc.
//   3. **Folder context → 上下文标签** (low confidence). Root files get nothing
//      extra; anything under 个人 / 团队 / 项目 folders inherit that label.
//
// No LLM. Add a keyword to KEYWORD_TAGS and it just works; drift is safe
// because we never write the tags to disk until v0.8 introduces FileTag table.
import type { FileRecord } from '../types'

interface KeywordRule {
  /** Case-insensitive substrings matched against File.name (no extension). */
  keywords: string[]
  /** Chinese label returned to the UI. */
  tag: string
}

/** Filename keyword → semantic tag. Order matters for UI (first wins on ties). */
const KEYWORD_TAGS: KeywordRule[] = [
  { keywords: ['合同', '协议', 'contract', 'agreement'], tag: '合同' },
  { keywords: ['发票', 'invoice', '收据', '账单', 'billing'], tag: '财务' },
  { keywords: ['简历', 'resume', 'cv', '应聘'], tag: '简历' },
  { keywords: ['会议', 'meeting', '纪要', 'minutes', 'agenda'], tag: '会议' },
  { keywords: ['计划', '规划', 'plan', 'roadmap', 'okr', 'kpi'], tag: '计划' },
  { keywords: ['报告', 'report', '分析', '复盘', 'review'], tag: '报告' },
  { keywords: ['设计', 'design', '原型', 'mock', 'figma', 'sketch'], tag: '设计' },
  { keywords: ['需求', 'prd', 'spec', '文档说明', 'manual'], tag: '需求' },
  { keywords: ['报价', '报价单', 'quote', '预算', 'budget'], tag: '报价' },
  { keywords: ['技术方案', '架构', 'architecture', 'tech'], tag: '技术' },
  { keywords: ['培训', '教程', 'tutorial', 'guide', 'handbook'], tag: '学习' },
  { keywords: ['数据', 'data', '统计', 'metrics'], tag: '数据' }
]

/** 版本 / 状态类关键词单独一列，命中就加"版本"标签，UI 会提示"看起来像草稿或终稿"。 */
const STATUS_KEYWORDS = ['草稿', 'draft', '终稿', 'final', 'v1', 'v2', 'v3', '版本', '备份', 'backup', 'copy', '副本']

/** Extension → 类别标签 (deterministic). */
const EXT_TAGS: Record<string, string> = {
  docx: '文档',
  xlsx: '表格',
  pptx: '演示',
  pdf: 'PDF',
  ofd: 'OFD',
  txt: '文本',
  md: 'Markdown',
  html: '网页',
  htm: '网页',
  csv: '数据表',
  png: '图片',
  jpg: '图片',
  jpeg: '图片',
  gif: '动图',
  webp: '图片',
  bmp: '图片',
  svg: '矢量图',
  mp3: '音频',
  wav: '音频',
  m4a: '音频',
  ogg: '音频',
  flac: '音频',
  aac: '音频',
  mp4: '视频',
  webm: '视频',
  mov: '视频',
  mkv: '视频',
  avi: '视频',
  zip: '压缩包',
  rar: '压缩包',
  '7z': '压缩包',
  tar: '压缩包',
  gz: '压缩包'
}

/** Folder 名 → 上下文标签。命中其一即加，最多一个。 */
const FOLDER_TAGS: KeywordRule[] = [
  { keywords: ['个人', 'private', '我的'], tag: '个人' },
  { keywords: ['团队', 'team', '协作'], tag: '团队' },
  { keywords: ['项目', 'project'], tag: '项目' },
  { keywords: ['财务', 'finance', '报销'], tag: '财务' },
  { keywords: ['hr', '人力', '员工'], tag: 'HR' },
  { keywords: ['客户', '销售', 'crm'], tag: '客户' }
]

/** 返回去重后的建议标签列表 + 置信度。
 *  置信度规则：命中 ≥3 语义 tag → high；命中 1-2 → medium；只有类别 → low。 */
export function suggestTags(
  rec: Pick<FileRecord, 'name' | 'extension' | 'parentId'>,
  parentName?: string | null
): { tags: string[]; confidence: 'high' | 'medium' | 'low' } {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (t: string) => {
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }

  // 类别标签（扩展名决定，永远加）
  const extTag = EXT_TAGS[(rec.extension || '').toLowerCase()]
  if (extTag) add(extTag)

  // 文件名关键词命中数（语义 / 状态）
  const fname = (rec.name || '').toLowerCase()
  let semanticHits = 0
  for (const rule of KEYWORD_TAGS) {
    if (rule.keywords.some(k => fname.includes(k.toLowerCase()))) {
      add(rule.tag)
      semanticHits++
    }
  }
  if (STATUS_KEYWORDS.some(k => fname.includes(k.toLowerCase()))) {
    add('版本')
    semanticHits++
  }

  // 目录上下文
  if (parentName) {
    const pn = parentName.toLowerCase()
    for (const rule of FOLDER_TAGS) {
      if (rule.keywords.some(k => pn.includes(k.toLowerCase()))) {
        add(rule.tag)
        break
      }
    }
  }

  // 置信度
  let confidence: 'high' | 'medium' | 'low' = 'low'
  if (semanticHits >= 3) confidence = 'high'
  else if (semanticHits >= 1) confidence = 'medium'

  // 上限 6 个，避免 UI 挤爆
  return { tags: out.slice(0, 6), confidence }
}

/** 供 UI 直接展示的白名单（可选：给"添加标签"下拉用）。v0.7 未接入。 */
export const TAG_VOCABULARY: string[] = Array.from(
  new Set([
    ...Object.values(EXT_TAGS),
    ...KEYWORD_TAGS.map(r => r.tag),
    ...FOLDER_TAGS.map(r => r.tag),
    '版本'
  ])
).sort()
