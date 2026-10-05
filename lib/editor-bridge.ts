'use client'
// Tiny imperative bridge between the outer page chrome (FileHeader) and the
// live JitWord iframe instance owned by EditorClient. EditorClient mounts
// once per document and registers its methods; FileHeader buttons call through
// `editorBridge.xxx()` without needing a ref or context provider.
//
// v0.4.1 — SDK 1.1 `document.importDocx` replaces the old mammoth + setContent
// pipeline. The bridge is now a single method that hands a picked File
// straight to the iframe parser (no server round-trip, no staged HTML).

export interface EditorBridge {
  fileId: string
  canEdit: boolean
  /** Import a .docx into the currently open document via the iframe's
   *  high-fidelity parser. Returns the raw SDK result so callers can surface
   *  `warnings`, `importedComments`, `headerFooter` etc. Throws on scope /
   *  parse failure — see EditorClient.runImportDocx for the exact contract. */
  importDocxFile: (file: File) => Promise<JitWordImportDocxResult>
}

let current: EditorBridge | null = null
const listeners = new Set<(b: EditorBridge | null) => void>()

export function registerEditorBridge(b: EditorBridge | null): void {
  current = b
  listeners.forEach(fn => {
    try {
      fn(b)
    } catch {
      /* noop */
    }
  })
}

export function getEditorBridge(): EditorBridge | null {
  return current
}

export function onEditorBridge(fn: (b: EditorBridge | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
