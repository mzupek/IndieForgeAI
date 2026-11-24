/**
 * Canon status on story entities. Missing means draft (Notion-side work).
 * approved is studio-home canon that assistants share.
 */

import type { CanonStatus } from '../types/assetPipeline'
import { errorIssue, type ContentIssue } from '../worldContent/issues'

export const CANON_STATUSES: readonly CanonStatus[] = ['draft', 'approved']

export function parseCanonStatus(raw: unknown, fallback: CanonStatus = 'draft'): CanonStatus {
  if (raw === undefined || raw === null || raw === '') return fallback
  const value = String(raw).trim()
  if (value !== 'draft' && value !== 'approved') {
    throw new Error("canonStatus must be 'draft' or 'approved'")
  }
  return value
}

export function canonOf(record: { canonStatus?: CanonStatus } | undefined): CanonStatus {
  return record?.canonStatus === 'approved' ? 'approved' : 'draft'
}

export function matchesCanonFilter(
  record: { canonStatus?: CanonStatus } | undefined,
  filter?: CanonStatus | string | null
): boolean {
  if (!filter) return true
  const wanted = String(filter).trim()
  if (!wanted) return true
  if (wanted !== 'draft' && wanted !== 'approved') {
    throw new Error("canon filter must be 'draft' or 'approved'")
  }
  return canonOf(record) === wanted
}

export function validateCanonStatus(raw: unknown, path: string): ContentIssue[] {
  if (raw === undefined || raw === null || raw === '') return []
  try {
    parseCanonStatus(raw)
    return []
  } catch (err) {
    return [errorIssue(path, err instanceof Error ? err.message : String(err))]
  }
}
