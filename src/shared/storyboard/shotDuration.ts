/**
 * Shot duration shrink/grow guards.
 * User-entered duration only — never invent a previous length from history.
 * Silent truncation of unrelated clips, keys, camera, effects, or audio is refused.
 */

import type { StoryboardShot } from '../types/assetPipeline'
import { AUDIO_BLOCK_TIME_EPS, audioBlockEnd } from './audioBlocks'
import { CLIP_BLOCK_TIME_EPS, clipBlockEnd } from './clipBlocks'
import { TIMED_KEY_TIME_EPS } from './timedKeys'

export type ShotDurationBlockerKind =
  | 'audio'
  | 'clip'
  | 'timed-key'
  | 'camera'
  | 'effect'
  | 'event-cue'

export function eventCueOutsideDuration(cue: { t: number }, durationSec: number): boolean {
  return durationSec + TIMED_KEY_TIME_EPS < cue.t
}

export interface ShotDurationBlocker {
  kind: ShotDurationBlockerKind
  id: string
  t: number
  end?: number
  label: string
}

export function maxCameraKeyframeTimeOnShot(shot: StoryboardShot): number {
  let max = 0
  for (const key of shot.cameraTrack || []) {
    if (key.t > max) max = key.t
  }
  return max
}

export function maxEffectMarkerTimeOnShot(shot: StoryboardShot): number {
  let max = 0
  for (const marker of shot.effectsTrack || []) {
    if (marker.t > max) max = marker.t
  }
  return max
}

export function collectShotDurationBlockers(
  shot: StoryboardShot,
  durationSec: number
): ShotDurationBlocker[] {
  const blockers: ShotDurationBlocker[] = []

  for (const block of shot.audioTrack || []) {
    const end = audioBlockEnd(block)
    if (durationSec + AUDIO_BLOCK_TIME_EPS < end) {
      blockers.push({
        kind: 'audio',
        id: block.id,
        t: block.t,
        end,
        label: `an audio block ends at t=${end}s (${block.id})`
      })
    }
  }

  for (const block of shot.clipTrack || []) {
    const end = clipBlockEnd(block)
    if (durationSec + CLIP_BLOCK_TIME_EPS < end) {
      blockers.push({
        kind: 'clip',
        id: block.id,
        t: block.t,
        end,
        label: `a clip block ends at t=${end}s (${block.id})`
      })
    }
  }

  for (const layer of shot.layers || []) {
    for (const key of layer.timedKeys || []) {
      if (durationSec + TIMED_KEY_TIME_EPS < key.t) {
        blockers.push({
          kind: 'timed-key',
          id: key.id,
          t: key.t,
          label: `a timed key exists at t=${key.t}s (${key.id} on layer ${layer.id})`
        })
      }
    }
  }

  for (const key of shot.cameraTrack || []) {
    if (durationSec + TIMED_KEY_TIME_EPS < key.t) {
      blockers.push({
        kind: 'camera',
        id: `t=${key.t}`,
        t: key.t,
        label: `camera keyframe at t=${key.t}s`
      })
    }
  }

  for (const marker of shot.effectsTrack || []) {
    if (durationSec + TIMED_KEY_TIME_EPS < marker.t) {
      blockers.push({
        kind: 'effect',
        id: `t=${marker.t}`,
        t: marker.t,
        label: `effect marker at t=${marker.t}s`
      })
    }
  }

  for (const cue of shot.eventCues || []) {
    if (eventCueOutsideDuration(cue, durationSec)) {
      blockers.push({
        kind: 'event-cue',
        id: cue.id,
        t: cue.t,
        label: `an event cue exists at t=${cue.t}s (${cue.id})`
      })
    }
  }

  return blockers
}

export function formatShotDurationBlockers(
  durationSec: number,
  blockers: ShotDurationBlocker[]
): string {
  const preview = blockers.slice(0, 6).map((b) => b.label).join('; ')
  const extra = blockers.length > 6 ? ` (+${blockers.length - 6} more)` : ''
  return (
    `Cannot set duration to ${durationSec}s: ${preview}${extra}. ` +
    `Shorten those items first, then enter the new shot duration. ` +
    `Forge does not restore a previous duration from history.`
  )
}

export function assertShotDurationFitsContent(shot: StoryboardShot, durationSec: number): void {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error(`Shot duration must be a positive number of seconds, got ${durationSec}`)
  }
  const blockers = collectShotDurationBlockers(shot, durationSec)
  if (blockers.length) {
    throw new Error(formatShotDurationBlockers(durationSec, blockers))
  }
}
