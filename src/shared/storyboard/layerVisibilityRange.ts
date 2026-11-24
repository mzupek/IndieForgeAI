/**
 * Timed layer presence: optional half-open [visibleFromSec, visibleToSec)
 * on a shot. Independent of the editor eye (`layer.visible`) and of event
 * setVisibility holds (those only apply while the layer is present).
 */

import type { StoryboardLayer } from '../types/assetPipeline'
import { TIMED_KEY_TIME_EPS } from './timedKeys'

export const VISIBILITY_RANGE_EPS = TIMED_KEY_TIME_EPS
const MIN_RANGE_SEC = 0.05

export function parseVisibilityBound(
  value: number | string | null | undefined,
  label: string
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be >= 0 seconds, got '${value}'`)
  }
  return n
}

export function layerPresenceRange(
  layer: Pick<StoryboardLayer, 'visibleFromSec' | 'visibleToSec'>,
  shotDurationSec: number
): { from: number; to: number } {
  const from = layer.visibleFromSec ?? 0
  const to = layer.visibleToSec ?? shotDurationSec
  return { from, to }
}

/**
 * Half-open [from, to). When `to` is omitted or equals the shot duration,
 * the layer stays present through the playhead-at-end instant.
 */
export function isLayerPresentAtTime(
  layer: Pick<StoryboardLayer, 'visibleFromSec' | 'visibleToSec'>,
  timeSec: number,
  shotDurationSec: number
): boolean {
  const duration = Number.isFinite(shotDurationSec) && shotDurationSec > 0 ? shotDurationSec : 0
  const t = Number.isFinite(timeSec) ? timeSec : 0
  const { from, to } = layerPresenceRange(layer, duration)
  if (t + VISIBILITY_RANGE_EPS < from) return false
  if (to >= duration - VISIBILITY_RANGE_EPS) return t <= duration + VISIBILITY_RANGE_EPS
  return t + VISIBILITY_RANGE_EPS < to
}

export function validateLayerVisibilityRange(
  layer: Pick<StoryboardLayer, 'visibleFromSec' | 'visibleToSec'>,
  shotDurationSec: number
): void {
  if (!Number.isFinite(shotDurationSec) || shotDurationSec <= 0) {
    throw new Error(`Shot duration must be a positive number of seconds, got ${shotDurationSec}`)
  }
  const from = layer.visibleFromSec
  const to = layer.visibleToSec
  if (from !== undefined) {
    if (!Number.isFinite(from) || from < 0) {
      throw new Error(`visibleFromSec must be >= 0, got ${from}`)
    }
    if (from > shotDurationSec + VISIBILITY_RANGE_EPS) {
      throw new Error(
        `visibleFromSec ${from}s is after shot duration ${shotDurationSec}s`
      )
    }
  }
  if (to !== undefined) {
    if (!Number.isFinite(to) || to < 0) {
      throw new Error(`visibleToSec must be >= 0, got ${to}`)
    }
    if (to > shotDurationSec + VISIBILITY_RANGE_EPS) {
      throw new Error(`visibleToSec ${to}s is after shot duration ${shotDurationSec}s`)
    }
  }
  if (from !== undefined && to !== undefined && from > to + VISIBILITY_RANGE_EPS) {
    throw new Error(`visibleFromSec ${from}s is after visibleToSec ${to}s`)
  }
}

export function clampVisibilityRange(
  from: number,
  to: number,
  shotDurationSec: number
): { from: number; to: number } {
  const duration = Math.max(0, shotDurationSec)
  let nextFrom = Math.max(0, Math.min(duration, from))
  let nextTo = Math.max(0, Math.min(duration, to))
  if (nextTo - nextFrom < MIN_RANGE_SEC) {
    if (nextFrom + MIN_RANGE_SEC <= duration) {
      nextTo = nextFrom + MIN_RANGE_SEC
    } else {
      nextFrom = Math.max(0, duration - MIN_RANGE_SEC)
      nextTo = duration
    }
  }
  return { from: nextFrom, to: nextTo }
}
