/**
 * Renderer-safe attack-table save preview. Clones before validateAttackTable
 * (which canonicalizes in place) so a failed save cannot mutate the store or
 * wipe the typed draft.
 */

import type { AssetPipelineProject, AttackRow, AttackTable } from '../types/assetPipeline'
import { formErrorFromIssues } from '../studio/formErrors'
import type { ContentIssue } from '../worldContent/issues'
import { parseAttackRow, parseAttackRows, validateAttackTable } from './validate'

export type FormSaveFailure = { ok: false; message: string; issues: ContentIssue[] }
export type FormSaveResult<T> = { ok: true; value: T } | FormSaveFailure

export function cloneAttackTable(table: AttackTable): AttackTable {
  return {
    ...table,
    rows: (table.rows || []).map((row) => ({
      ...row,
      params: row.params ? { ...row.params } : undefined,
      counter: row.counter ? { ...row.counter } : undefined
    }))
  }
}

export function issuesForRow(issues: ContentIssue[], rowIndex: number): ContentIssue[] {
  const dotted = `.rows[${rowIndex}]`
  const prefix = `rows[${rowIndex}]`
  return issues.filter((i) => {
    if (i.level !== 'error') return false
    return i.path.includes(dotted) || i.path === prefix || i.path.startsWith(`${prefix}.`)
  })
}

export function fieldKeyFromIssue(issue: ContentIssue): string {
  const params = issue.path.match(/\.params\.([^.]+)$/)
  if (params) return `params.${params[1]}`
  if (issue.path.endsWith('.counter.kind')) return 'counterKind'
  if (issue.path.endsWith('.counter.result')) return 'counterResult'
  const m = issue.path.match(/\.([^.]+)$/)
  return m ? m[1]!.replace(/\[\d+\]$/, '') : issue.path
}

export function fieldErrorsFromIssues(issues: ContentIssue[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of issues.filter((i) => i.level === 'error')) {
    const key = fieldKeyFromIssue(issue)
    if (!out[key]) out[key] = issue.message
  }
  return out
}

function fail(issues: ContentIssue[], fallback = 'Invalid'): FormSaveFailure {
  return { ok: false, message: formErrorFromIssues(issues) || fallback, issues }
}

export function attemptSaveAttackRow(
  pipeline: AssetPipelineProject,
  table: AttackTable,
  raw: unknown,
  replaceRowId?: string
): FormSaveResult<AttackRow> {
  const parseIssues: ContentIssue[] = []
  const parsed = parseAttackRow(raw, 'row', parseIssues)
  const parseErrors = parseIssues.filter((i) => i.level === 'error')
  if (!parsed || parseErrors.length) return fail(parseIssues)

  const next = cloneAttackTable(table)
  const index = replaceRowId
    ? next.rows.findIndex((r) => r.id === replaceRowId || r.id.toLowerCase() === replaceRowId.toLowerCase())
    : -1
  if (replaceRowId && index < 0) {
    return { ok: false, message: `Row not found: ${replaceRowId}`, issues: [] }
  }
  if (index >= 0) next.rows[index] = parsed
  else next.rows.push(parsed)

  const issues = validateAttackTable(pipeline, next)
  const rowIndex = index >= 0 ? index : next.rows.length - 1
  const blocking = issues.filter(
    (i) => i.level === 'error' && (!i.path.includes('.rows[') || i.path.includes(`.rows[${rowIndex}]`))
  )
  if (blocking.length) return fail(blocking)
  return { ok: true, value: parsed }
}

export function attemptSaveAttackTable(
  pipeline: AssetPipelineProject,
  table: AttackTable,
  rawRows?: unknown
): FormSaveResult<AttackTable> {
  const next = cloneAttackTable(table)
  if (rawRows !== undefined) {
    const parseIssues: ContentIssue[] = []
    next.rows = parseAttackRows(rawRows, 'rows', parseIssues)
    const parseErrors = parseIssues.filter((i) => i.level === 'error')
    if (parseErrors.length) {
      const later = validateAttackTable(pipeline, next)
      return fail([...parseIssues, ...later])
    }
  }
  const issues = validateAttackTable(pipeline, next)
  const errors = issues.filter((i) => i.level === 'error')
  if (errors.length) return fail(errors)
  return { ok: true, value: next }
}
