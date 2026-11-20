/**
 * Stale/out-of-order media load guards for Storyboard stills and clip videos.
 * Pure — no DOM. Used by StoryboardEditor and unit tests.
 */

export const STALE_VIDEO_LOADING_MS = 8000

export function backgroundSourceKey(
  shotId: string | null | undefined,
  sourcePath: string | null | undefined
): string {
  return `${shotId || ''}::${sourcePath || ''}`
}

export function backgroundPathFromKey(key: string): string {
  const sep = key.indexOf('::')
  return sep < 0 ? '' : key.slice(sep + 2)
}

/**
 * Commit a finished still only when it is still the shot+source we asked for.
 * `expectedKey` must remain that shot+source until onload — emptying it
 * (e.g. a later selectedShotId reset) rejects a matching load and leaves
 * the canvas blank.
 */
export function shouldApplyLoadedBackground(
  expectedKey: string,
  loadedKey: string
): boolean {
  if (!expectedKey || !loadedKey) return false
  if (expectedKey !== loadedKey) return false
  return backgroundPathFromKey(expectedKey).length > 0
}

/** Blank the canvas only when shot or source actually changed. */
export function shouldClearBackgroundForKeyChange(
  previousKey: string,
  nextKey: string
): boolean {
  return previousKey !== nextKey
}

export type VideoCacheStatus = 'loading' | 'ready' | 'error' | 'unsupported' | 'missing'

export interface VideoCacheLookup {
  clipId: string
  file: string
  status: VideoCacheStatus
  loadingStartedAt?: number
}

export function shouldEvictVideoEntry(
  entry: VideoCacheLookup | undefined,
  needed: { clipId: string; file: string },
  now: number,
  staleMs: number = STALE_VIDEO_LOADING_MS
): boolean {
  if (!entry) return false
  if (entry.clipId !== needed.clipId) return true
  if ((entry.file || '') !== (needed.file || '')) return true
  if (
    entry.status === 'loading' &&
    entry.loadingStartedAt !== undefined &&
    now - entry.loadingStartedAt >= staleMs
  ) {
    return true
  }
  return false
}

export function shouldSkipVideoReload(
  entry: VideoCacheLookup | undefined,
  needed: { clipId: string; file: string },
  now: number,
  staleMs: number = STALE_VIDEO_LOADING_MS
): boolean {
  if (!entry) return false
  if (shouldEvictVideoEntry(entry, needed, now, staleMs)) return false
  return entry.status === 'ready' || entry.status === 'loading'
}

export function clampVideoSeekTime(
  requested: number,
  seekableStart: number,
  seekableEnd?: number
): number {
  let t = Number.isFinite(requested) ? requested : 0
  const start = Number.isFinite(seekableStart) ? Math.max(0, seekableStart) : 0
  if (t < start) t = start
  if (seekableEnd !== undefined && Number.isFinite(seekableEnd) && t > seekableEnd) {
    t = seekableEnd
  }
  if (t < 0) t = 0
  return t
}

export function videoHasDecodableFrame(readyState: number, videoWidth: number): boolean {
  return readyState >= 2 && videoWidth > 0
}
