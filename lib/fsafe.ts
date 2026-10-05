// Safe "permanent" removal for the recycle bin.
//
// Policy: we NEVER fs.unlink user bytes. A "彻底删除" moves the physical file
// into the OS trash (macOS ~/.Trash) so it stays recoverable; if the system
// trash isn't available/writable we fall back to an app-local data/.trash bin.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { DATA_DIR } from './paths'

function systemTrashDir(): string | null {
  if (process.platform === 'darwin') return path.join(os.homedir(), '.Trash')
  if (process.platform === 'win32') return null // Recycle Bin needs shell API; use fallback
  return process.env.XDG_TRASH_FILES || null
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function uniqueName(dir: string, base: string): string {
  return path.join(dir, `${Date.now()}-${base}`)
}

/**
 * Move one file out of the data dir into a trash location. Returns the final
 * path (or null if the source didn't exist). Throws only on unexpected IO errors.
 */
export async function moveToTrash(absPath: string | undefined): Promise<string | null> {
  if (!absPath) return null
  if (!(await exists(absPath))) return null

  const base = path.basename(absPath)
  const sys = systemTrashDir()
  const fallback = path.join(DATA_DIR, '.trash')

  const targets = [sys, fallback].filter((t): t is string => !!t)
  for (const dir of targets) {
    try {
      await fs.mkdir(dir, { recursive: true })
      let dst = path.join(dir, base)
      if (await exists(dst)) dst = uniqueName(dir, base)
      try {
        await fs.rename(absPath, dst)
      } catch (e) {
        const err = e as NodeJS.ErrnoException
        if (err.code === 'EXDEV') {
          // Cross-device: copy then move the original into the app-local bin.
          await fs.copyFile(absPath, dst)
          const localDst = uniqueName(fallback, base)
          await fs.mkdir(fallback, { recursive: true })
          await fs.rename(absPath, localDst)
          const movedOk = (await exists(dst)) && !(await exists(absPath))
          if (movedOk) return localDst
          continue
        }
        throw e
      }
      const ok = (await exists(dst)) && !(await exists(absPath))
      if (ok) return dst
    } catch {
      // try next candidate target
    }
  }
  throw new Error(`无法将文件移入回收位置: ${absPath}`)
}
