/**
 * Timed still-background keys (shot.backgroundKeys).
 * Step/hold like P4 pose keys: last key with t <= playhead holds until the next.
 * Before the first key, the shot's static background fields apply.
 * Hard cut (no crossfade). Clip-track background blocks still overlay stills.
 */

import type {
  AssetPipelineProject,
  ShotBackgroundKey,
  StoryboardShot
} from '../types/assetPipeline'
import {
  resolveBackgroundStillRefs,
  type BackgroundStillRefs
} from './shotBackground'
import { TIMED_KEY_TIME_EPS } from './timedKeys'

export const BACKGROUND_KEY_TIME_EPS = TIMED_KEY_TIME_EPS

export function ensureShotBackgroundKeys(shot: StoryboardShot): ShotBackgroundKey[] {
  if (!shot.backgroundKeys) shot.backgroundKeys = []
  return shot.backgroundKeys
}

export function parseBackgroundKeyTime(value: number | string, shotDurationSec: number): number {
  const t = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(t) || t < 0) {
    throw new Error(`Background key time must be >= 0, got '${value}'`)
  }
  if (t > shotDurationSec + BACKGROUND_KEY_TIME_EPS) {
    throw new Error(`Background key time ${t}s is after shot duration ${shotDurationSec}s`)
  }
  return t
}

export function backgroundKeyRefs(key: ShotBackgroundKey): BackgroundStillRefs {
  return {
    backgroundVisualAssetId: key.backgroundVisualAssetId,
    backgroundAssetStateId: key.backgroundAssetStateId,
    backgroundImage: key.backgroundImage
  }
}

export function validateBackgroundKey(
  key: Pick<
    ShotBackgroundKey,
    't' | 'backgroundVisualAssetId' | 'backgroundAssetStateId' | 'backgroundImage'
  >,
  pipeline: AssetPipelineProject,
  shotId: string
): void {
  const shot = (pipeline.storyboardShots || []).find((s) => s.id === shotId)
  if (!shot) throw new Error(`Shot not found: ${shotId}`)
  parseBackgroundKeyTime(key.t, shot.durationSec)
  const hasAsset = !!(key.backgroundVisualAssetId && key.backgroundVisualAssetId.trim())
  const hasImage = !!(key.backgroundImage && key.backgroundImage.trim())
  if (hasAsset && hasImage) {
    throw new Error('Use either a Library background asset or --background-image, not both')
  }
  if (!hasAsset && !hasImage) {
    throw new Error('Background key requires --background-asset or --background-image')
  }
  const resolved = resolveBackgroundStillRefs(backgroundKeyRefs(key as ShotBackgroundKey), pipeline, shotId)
  if (resolved.error) throw new Error(resolved.error)
  if (!resolved.path) throw new Error('Background key has no resolvable image file')
}

export function backgroundKeyIssues(
  key: ShotBackgroundKey,
  pipeline: AssetPipelineProject,
  shotId: string
): string | null {
  try {
    validateBackgroundKey(key, pipeline, shotId)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/** Latest key with t <= time (step/hold). None → static shot background. */
export function sampleBackgroundKey(
  shot: StoryboardShot,
  timeSec: number
): ShotBackgroundKey | null {
  const keys = [...(shot.backgroundKeys || [])].sort(
    (a, b) => a.t - b.t || a.id.localeCompare(b.id)
  )
  let held: ShotBackgroundKey | null = null
  for (const key of keys) {
    if (key.t <= timeSec + BACKGROUND_KEY_TIME_EPS) held = key
    else break
  }
  return held
}

export function resolveShotBackgroundAtTime(
  shot: StoryboardShot,
  pipeline: AssetPipelineProject,
  timeSec: number
): { path?: string; error?: string; keyId?: string } {
  const key = sampleBackgroundKey(shot, timeSec)
  if (!key) {
    const resolved = resolveBackgroundStillRefs(shot, pipeline, shot.id)
    return resolved
  }
  const resolved = resolveBackgroundStillRefs(backgroundKeyRefs(key), pipeline, shot.id)
  return { ...resolved, keyId: key.id }
}

/** Unique full-res paths to preload so mid-shot cuts do not flash. */
export function collectShotBackgroundStillPaths(
  shot: StoryboardShot,
  pipeline: AssetPipelineProject
): string[] {
  const paths: string[] = []
  const add = (path?: string) => {
    if (path && !paths.includes(path)) paths.push(path)
  }
  add(resolveBackgroundStillRefs(shot, pipeline, shot.id).path)
  for (const key of shot.backgroundKeys || []) {
    add(resolveBackgroundStillRefs(backgroundKeyRefs(key), pipeline, shot.id).path)
  }
  return paths
}

export function describeBackgroundKey(
  key: ShotBackgroundKey,
  pipeline?: AssetPipelineProject
): string {
  if (key.backgroundVisualAssetId) {
    const asset = (pipeline?.visualAssets || []).find((a) => a.id === key.backgroundVisualAssetId)
    const name = asset?.name || key.backgroundVisualAssetId
    if (key.backgroundAssetStateId) {
      const state = (pipeline?.assetStates || []).find((s) => s.id === key.backgroundAssetStateId)
      return `${name} / ${state?.name || key.backgroundAssetStateId}`
    }
    return name
  }
  if (key.backgroundImage) {
    const parts = key.backgroundImage.split(/[/\\]/)
    return parts[parts.length - 1] || key.backgroundImage
  }
  return 'background'
}

export function findBackgroundKey(
  pipeline: AssetPipelineProject,
  keyId: string
): { shot: StoryboardShot; key: ShotBackgroundKey } | undefined {
  for (const shot of pipeline.storyboardShots || []) {
    const key = (shot.backgroundKeys || []).find((k) => k.id === keyId)
    if (key) return { shot, key }
  }
  return undefined
}
