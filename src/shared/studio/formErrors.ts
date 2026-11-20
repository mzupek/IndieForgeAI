/**
 * Shared GUI/CLI error text. Keeps validator messages plain and unwraps
 * Electron IPC envelopes so forms can show the same text the CLI prints.
 */

import { errorMessages, type ContentIssue } from '../worldContent/issues'

export function plainErrorMessage(err: unknown): string {
  let message = err instanceof Error ? err.message : String(err ?? '')
  message = message.trim()
  if (!message) return 'Save failed'
  for (let i = 0; i < 5; i++) {
    const ipc = message.match(/^Error invoking remote method '[^']+': (?:Error: )?([\s\S]+)$/)
    if (ipc) {
      message = ipc[1]!.trim()
      continue
    }
    const nested = message.match(/^Error: ([\s\S]+)$/)
    if (nested && nested[1]!.trim() !== message) {
      message = nested[1]!.trim()
      continue
    }
    break
  }
  return message || 'Save failed'
}

export function formErrorFromIssues(issues: ContentIssue[]): string | null {
  const text = errorMessages(issues)
  return text || null
}

export function attemptSync<T>(fn: () => T): { ok: true; value: T } | { ok: false; message: string } {
  try {
    return { ok: true, value: fn() }
  } catch (err) {
    return { ok: false, message: plainErrorMessage(err) }
  }
}
