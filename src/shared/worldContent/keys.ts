/**
 * Optional record `key` slugs (World / Stage / Encounter / Region, plus existing types).
 * Unique per game and record type. @key aliases resolve in apply files and CLI ids.
 */

export const RECORD_KEY_PATTERN = /^[a-z][a-z0-9_-]*$/

export type WorldRecordKind = 'world' | 'stage' | 'encounter' | 'region'

export function normalizeRecordKey(raw: string): string {
  return String(raw ?? '').trim().toLowerCase()
}

export function isAliasRef(raw: string | undefined | null): boolean {
  return typeof raw === 'string' && raw.trim().startsWith('@')
}

export function aliasKey(raw: string): string {
  const trimmed = String(raw ?? '').trim()
  if (trimmed.startsWith('@')) return normalizeRecordKey(trimmed.slice(1))
  return normalizeRecordKey(trimmed)
}

/** Empty / missing is allowed. Present keys must be a lowercase slug (letters, digits, dash, underscore). */
export function assertRecordKey(raw: string | undefined | null, kind: string): string | undefined {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined
  const normalized = normalizeRecordKey(String(raw))
  if (!RECORD_KEY_PATTERN.test(normalized)) {
    throw new Error(
      `${kind} key must be a lowercase slug starting with a letter (a-z, then a-z/0-9/_/-). Got '${raw}'`
    )
  }
  return normalized
}

export function isUuid(raw: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(raw).trim())
}

export function nowIso(): string {
  return new Date().toISOString()
}
