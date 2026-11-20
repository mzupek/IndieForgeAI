/**
 * P4: Timed pose/state keys on a shot layer.
 * Step/hold sampling, validation, and event-hold precedence.
 * Shared by storage, CLI, IPC, and the renderer (no Node APIs).
 */

import type {
  AssetPipelineProject,
  LayerTimedKey,
  LayerTimedKeyAction,
  StoryboardLayer,
  StoryboardShot
} from '../types/assetPipeline'
import { applyLayerPreview, type PreviewLayerOverride } from './eventPreview'
import { getLayerKind, getShotGameId } from './layerValidation'

export const TIMED_KEY_TIME_EPS = 1e-9
export const TIMED_KEY_DUPLICATE_EPS = 0.001

export interface TimedKeySample {
  keyId: string
  t: number
  poseId?: string
  assetStateId?: string
}

export function ensureLayerTimedKeys(layer: StoryboardLayer): LayerTimedKey[] {
  if (!layer.timedKeys) layer.timedKeys = []
  return layer.timedKeys
}

export function sortedTimedKeys(layer: StoryboardLayer): LayerTimedKey[] {
  return [...(layer.timedKeys || [])].sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t
    return a.id.localeCompare(b.id)
  })
}

/**
 * Step/hold sample at playhead timeSec.
 * Before the first key: undefined (caller uses authored default).
 * At/after a key: that key holds until the next key. Direction-independent.
 */
export function sampleLayerTimedKeys(
  layer: StoryboardLayer,
  timeSec: number
): TimedKeySample | undefined {
  const keys = sortedTimedKeys(layer)
  let chosen: LayerTimedKey | undefined
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].t <= timeSec + TIMED_KEY_TIME_EPS) chosen = keys[i]
    else break
  }
  if (!chosen) return undefined
  const sample: TimedKeySample = { keyId: chosen.id, t: chosen.t }
  if (chosen.action.type === 'setPose') sample.poseId = chosen.action.poseId
  else sample.assetStateId = chosen.action.stateId
  return sample
}

export function applyTimedSample(
  layer: StoryboardLayer,
  timeSec: number
): StoryboardLayer {
  const sample = sampleLayerTimedKeys(layer, timeSec)
  if (!sample) return layer
  return {
    ...layer,
    poseId: sample.poseId ?? layer.poseId,
    assetStateId:
      sample.assetStateId !== undefined ? sample.assetStateId : layer.assetStateId
  }
}

/**
 * Precedence: active event hold → timed sample at playhead → authored default.
 * Does not mutate `layer`.
 */
export function applyEffectiveLayer(
  layer: StoryboardLayer,
  timeSec: number,
  eventOverride?: PreviewLayerOverride
): StoryboardLayer {
  return applyLayerPreview(applyTimedSample(layer, timeSec), eventOverride)
}

export function parseTimedKeyTime(value: number | string | undefined): number {
  const n = value === undefined || value === '' ? NaN : Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`Key time must be a finite number of seconds, got '${value}'`)
  }
  return n
}

export function describeTimedKeyAction(action: LayerTimedKeyAction): string {
  if (action.type === 'setPose') return `setPose ${action.poseId}`
  return `setState ${action.stateId}`
}

function findShot(
  pipeline: AssetPipelineProject,
  shotId: string
): StoryboardShot {
  const shot = (pipeline.storyboardShots || []).find((s) => s.id === shotId)
  if (!shot) throw new Error(`Shot not found: ${shotId}`)
  return shot
}

export function validateTimedKeyTime(t: number, durationSec: number): void {
  if (!Number.isFinite(t)) {
    throw new Error(`Key time must be a finite number, got ${t}`)
  }
  if (t < 0) {
    throw new Error(`Key time ${t}s is before the shot start (0s)`)
  }
  if (t > durationSec + TIMED_KEY_TIME_EPS) {
    throw new Error(
      `Key time ${t}s is after shot duration ${durationSec}s`
    )
  }
}

export function validateLayerTimedKey(
  key: Pick<LayerTimedKey, 'id' | 't' | 'action'>,
  layer: StoryboardLayer,
  pipeline: AssetPipelineProject,
  shotId: string,
  options?: { excludeKeyId?: string }
): void {
  const shot = findShot(pipeline, shotId)
  validateTimedKeyTime(key.t, shot.durationSec)
  getShotGameId(pipeline, shotId)

  const kind = getLayerKind(layer)
  const action = key.action

  if (action.type === 'setPose') {
    if (!layer.characterId) {
      throw new Error(
        `setPose timed key requires a character layer (layer '${layer.id}' has no characterId)`
      )
    }
    const pose = (pipeline.poses || []).find((p) => p.id === action.poseId)
    if (!pose) {
      throw new Error(`Pose not found: ${action.poseId}`)
    }
    if (pose.characterId !== layer.characterId) {
      throw new Error(
        `Pose '${action.poseId}' belongs to character '${pose.characterId}', not '${layer.characterId}'`
      )
    }
  } else if (action.type === 'setState') {
    if (!layer.visualAssetId) {
      throw new Error(
        `setState timed key requires a visual-asset layer (layer '${layer.id}' has no visualAssetId)`
      )
    }
    const state = (pipeline.assetStates || []).find((s) => s.id === action.stateId)
    if (!state) {
      throw new Error(`Asset state not found: ${action.stateId}`)
    }
    if (state.assetId !== layer.visualAssetId) {
      throw new Error(
        `State '${action.stateId}' belongs to asset '${state.assetId}', not '${layer.visualAssetId}'`
      )
    }
  } else {
    throw new Error(`Unknown timed key action type`)
  }

  if (kind === 'text') {
    throw new Error(`Text layers do not support pose/state timed keys`)
  }

  const others = (layer.timedKeys || []).filter((k) => k.id !== (options?.excludeKeyId || key.id))
  const clash = others.find((k) => Math.abs(k.t - key.t) < TIMED_KEY_DUPLICATE_EPS)
  if (clash) {
    throw new Error(
      `A timed key already exists at t=${clash.t}s on this layer (id ${clash.id}). Edit that key or choose a different time.`
    )
  }
}

export function timedKeyIssues(
  key: LayerTimedKey,
  layer: StoryboardLayer,
  pipeline: AssetPipelineProject,
  shotId: string
): string | null {
  try {
    validateLayerTimedKey(key, layer, pipeline, shotId)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export function describeTimedKeyRef(
  pipeline: AssetPipelineProject,
  shotId: string,
  layerId: string,
  key: LayerTimedKey
): string {
  const shot = (pipeline.storyboardShots || []).find((s) => s.id === shotId)
  return `${shot?.name || shotId}/${layerId} @ ${key.t}s`
}

export function collectPoseTimedKeyUsage(
  pipeline: AssetPipelineProject,
  poseId: string
): { keyIds: string[]; labels: string[] } {
  const keyIds: string[] = []
  const labels: string[] = []
  for (const shot of pipeline.storyboardShots || []) {
    for (const layer of shot.layers || []) {
      for (const key of layer.timedKeys || []) {
        if (key.action.type === 'setPose' && key.action.poseId === poseId) {
          keyIds.push(key.id)
          labels.push(describeTimedKeyRef(pipeline, shot.id, layer.id, key))
        }
      }
    }
  }
  return { keyIds, labels }
}

export function collectStateTimedKeyUsage(
  pipeline: AssetPipelineProject,
  stateId: string
): { keyIds: string[]; labels: string[] } {
  const keyIds: string[] = []
  const labels: string[] = []
  for (const shot of pipeline.storyboardShots || []) {
    for (const layer of shot.layers || []) {
      for (const key of layer.timedKeys || []) {
        if (key.action.type === 'setState' && key.action.stateId === stateId) {
          keyIds.push(key.id)
          labels.push(describeTimedKeyRef(pipeline, shot.id, layer.id, key))
        }
      }
    }
  }
  return { keyIds, labels }
}

export function formatTimedKeyInUseError(kind: string, name: string, labels: string[]): string {
  const preview = labels.slice(0, 3).join(', ')
  const extra = labels.length > 3 ? '...' : ''
  return `Cannot delete ${kind} '${name}': referenced by ${labels.length} timed key(s): ${preview}${extra}`
}

export function maxTimedKeyTimeOnShot(shot: StoryboardShot): number {
  let max = 0
  for (const layer of shot.layers || []) {
    for (const key of layer.timedKeys || []) {
      if (key.t > max) max = key.t
    }
  }
  return max
}

export function assertShotDurationFitsTimedKeys(shot: StoryboardShot, durationSec: number): void {
  const maxT = maxTimedKeyTimeOnShot(shot)
  if (durationSec + TIMED_KEY_TIME_EPS < maxT) {
    throw new Error(
      `Cannot set duration to ${durationSec}s: a timed key exists at t=${maxT}s`
    )
  }
}

export function flattenShotTimedKeys(
  shot: StoryboardShot
): Array<{ layerId: string; key: LayerTimedKey }> {
  const out: Array<{ layerId: string; key: LayerTimedKey }> = []
  for (const layer of shot.layers || []) {
    for (const key of sortedTimedKeys(layer)) {
      out.push({ layerId: layer.id, key })
    }
  }
  return out
}

export function findTimedKey(
  pipeline: AssetPipelineProject,
  keyId: string
): { shot: StoryboardShot; layer: StoryboardLayer; key: LayerTimedKey } | undefined {
  for (const shot of pipeline.storyboardShots || []) {
    for (const layer of shot.layers || []) {
      const key = (layer.timedKeys || []).find((k) => k.id === keyId)
      if (key) return { shot, layer, key }
    }
  }
  return undefined
}
