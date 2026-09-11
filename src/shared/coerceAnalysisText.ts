/** Ensure analysis / prompt fields are plain strings (models sometimes return nested objects). */
export function coerceAnalysisText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(coerceAnalysisText).filter(Boolean).join('; ')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => {
        const text = coerceAnalysisText(nested)
        return text ? `${key}: ${text}` : key
      })
      .filter(Boolean)
      .join('; ')
  }
  return String(value)
}
