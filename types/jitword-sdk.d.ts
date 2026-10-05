// Ambient typings for https://inner.jitword.com/px-editor/iframe-sdk/v1/loader.js
// Declared globally so `JitWordEditorInstance` etc. are visible from any file.
// Keep aligned with the capability list published at
//   https://inner.jitword.com/px-editor/iframe-sdk/manifest.json
// (Last synced: 2026-09 · loaderVersion 1.1.0 · protocolVersion 1.0)

/** Argument bag for `editor.importDocx(...)`.
 *  SDK 1.1 · capability `document.importDocx` · required scope `document:edit`.
 *  Parsing runs *inside the iframe* against a high-fidelity OOXML pipeline;
 *  there is no server-side round-trip. Comments and header/footer are
 *  detected and reported in the result but NOT written into the model. */
interface JitWordImportDocxOptions {
  /** Required. Either a browser File/Blob, or the raw bytes as ArrayBuffer /
   *  Uint8Array, or a base64 string. In this project we mostly feed
   *  `await fetch('/api/files/<id>/raw').then(r => r.arrayBuffer())` after
   *  upload, or a `File` picked from the editor's toolbar "导入 Word". */
  content: ArrayBuffer | Uint8Array | Blob | File | string
  /** Display name shown in the in-iframe progress overlay + used for magic-
   *  byte cross-checking. Extension isn't trusted — SDK sniffs the ZIP
   *  header regardless. */
  fileName?: string
  /** 'replace' (default) overwrites the entire document body; 'insert' appends
   *  to the end or after `nodeId` when provided. */
  mode?: 'replace' | 'insert'
  /** Optional anchor for 'insert' — a top-level block id to insert after. */
  nodeId?: string
  /** Timeout in ms. Defaults to 60 000 (much longer than the 10 s SDK default
   *  because OOXML parsing can take a while on 20MB+ decks). */
  timeout?: number
}

interface JitWordImportDocxResult {
  /** Echo of the mode actually applied by the editor. */
  mode: 'replace' | 'insert'
  /** True when the parsed content was successfully written into the model.
   *  False is technically possible on partial failures — treat as error. */
  applied: boolean
  /** Populated when the source docx contains comments. Comments are parsed
   *  but NOT written (host should surface to the user). */
  importedComments?: { count: number; [k: string]: unknown } | null
  /** Populated when the source docx contains header/footer sections. Same
   *  caveat: parsed but not written. */
  headerFooter?: { count?: number; [k: string]: unknown } | null
  /** Free-form warnings from the parser (unsupported styles, dropped nodes…). */
  warnings?: string[]
}

interface JitWordEditorInstance {
  ready(): Promise<unknown>
  on(event: string, handler: (payload?: unknown) => void): () => void
  destroy(): void

  // Document content (scope: document:read / document:edit)
  getContent(options?: { format?: 'html' | 'text' | 'json' | 'markdown' }): Promise<unknown>
  setContent(options: { format: string; content: string } | Record<string, unknown>): Promise<unknown>
  insertContent(options: { format: string; content: string } | Record<string, unknown>): Promise<unknown>
  clearContent(): Promise<unknown>
  deleteContent(options?: Record<string, unknown>): Promise<unknown>

  /** SDK 1.1 · Import a .docx directly into the live document via the
   *  iframe's high-fidelity OOXML pipeline. Replaces our previous
   *  mammoth-parse-server-then-setContent-client flow. Requires the
   *  `document:edit` scope (already granted by our edit-mode ticket). */
  importDocx(options: JitWordImportDocxOptions): Promise<JitWordImportDocxResult>

  // Save / export
  save(options?: Record<string, unknown>): Promise<unknown>
  exportDocx(
    options?: Record<string, unknown>
  ): Promise<{ base64?: string; buffer?: ArrayBuffer; filename?: string } | ArrayBuffer>

  // UI (scope: document:read for setters per manifest)
  setReadonly(readonly: boolean): Promise<unknown>
  setTheme(theme: 'light' | 'dark' | 'auto'): Promise<unknown>
  setWatermark(watermark: { text?: string; color?: string; opacity?: number } | null): Promise<unknown>
  // Toolbar runtime levels. Note: on initial mount the visibility is driven
  // by createEditor's `ui.chrome` (see config below), whereas this runtime
  // switch toggles the toolbar strip only.
  setToolbar(preset: 'full' | 'simple' | 'none'): Promise<unknown>
  focus(): Promise<unknown>

  // Selection / scroll / metadata
  getSelection(options?: Record<string, unknown>): Promise<unknown>
  setSelection(options: Record<string, unknown>): Promise<unknown>
  scrollTo(options: Record<string, unknown>): Promise<unknown>
  getMetadata(options?: Record<string, unknown>): Promise<unknown>
  setMetadata(options: Record<string, unknown>): Promise<unknown>

  // Info / status / permissions
  getDocumentInfo(): Promise<unknown>
  getInfo?(): Promise<unknown>
  getPermission?(): Promise<unknown>
  getStatus?(): Promise<unknown>
  getOnlineUsers?(): Promise<unknown>
}

interface JitWordCreateEditorConfig {
  container: string | HTMLElement
  editorUrl: string
  docId: string
  apiBase?: string
  tenantKey?: string
  providerKey?: string
  documentType?: 'document'
  mode?: 'full' | 'preview'
  lazy?: boolean
  lazyRootMargin?: string
  destroyOnLeave?: boolean
  placeholderText?: string
  timeout?: number
  // Per the current iframe-sdk docs:
  //   chrome:'host'    → no 顶栏 / no 工具条 / no 右侧工具条 (only document body)
  //   chrome:'toolbar' → edit toolbar only (hides 顶栏 + 文件入口 + AI入口)
  //   chrome:'full'    → 顶栏 + 编辑工具条 + 右侧工具条 (大纲、评论等)
  // `toolbar` is the ticket-side (server) name and stays in the type for
  // compat, but the client createEditor now reads `chrome`.
  ui?: {
    theme?: 'light' | 'dark' | 'auto'
    readonly?: boolean
    chrome?: 'host' | 'toolbar' | 'full'
    /** Legacy alias kept for backwards compatibility with the ticket-side
     *  ui block; the createEditor path now prefers `chrome`. */
    toolbar?: 'full' | 'simple' | 'none' | 'compact'
    /** Legacy alias from older SDK builds; ignored. */
    mode?: 'edit' | 'readonly' | string
  }
  auth?: {
    mode: 'embed-ticket'
    getEmbedTicket: () => Promise<string>
  }
  debug?: boolean | { enabled: boolean; traceId?: string }
  width?: string
  height?: string
  border?: string
}

interface JitWordGlobal {
  version: string
  createEditor(config: JitWordCreateEditorConfig): JitWordEditorInstance
  errors: Record<string, string>
  actions: Record<string, string>
}

interface Window {
  JitWord?: JitWordGlobal
}
