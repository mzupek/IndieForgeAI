/**
 * Shared slug rules for pose slots and asset categories.
 * Keys are lowercase, unique across built-in + game + (for slots) character layers.
 */

export const SETTINGS_KEY_PATTERN = /^[a-z][a-z0-9_]*$/

export function normalizeSettingsKey(raw: string): string {
  return String(raw ?? '').trim().toLowerCase()
}

export function assertSettingsKey(key: string, kind: string): string {
  const normalized = normalizeSettingsKey(key)
  if (!SETTINGS_KEY_PATTERN.test(normalized)) {
    throw new Error(
      `${kind} key must be a lowercase slug starting with a letter (a-z, then a-z/0-9/_). Got '${key}'`
    )
  }
  return normalized
}

export function assertLabel(label: string, kind: string): string {
  const trimmed = String(label ?? '').trim()
  if (!trimmed) {
    throw new Error(`${kind} label is required`)
  }
  return trimmed
}
