/**
 * Authored timeline event cues (shot.eventCues).
 * Independent of P4 pose/state keys: those are step/hold samples;
 * cues are one-shot forward-play crossings of a named event.
 */

import type { AssetPipelineProject, ShotEventCue, StoryboardShot } from '../types/assetPipeline'
import { getShotGameId } from './layerValidation'
import { TIMED_KEY_TIME_EPS } from './timedKeys'
import { bindingsForShot } from './eventValidation'

export const EVENT_CUE_TIME_EPS = TIMED_KEY_TIME_EPS

export function ensureShotEventCues(shot: StoryboardShot): ShotEventCue[] {
  if (!shot.eventCues) shot.eventCues = []
  return shot.eventCues
}

export function parseEventCueTime(value: number | string, shotDurationSec: number): number {
  const t = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(t) || t < 0) {
    throw new Error(`Event cue time must be >= 0, got '${value}'`)
  }
  if (t > shotDurationSec + EVENT_CUE_TIME_EPS) {
    throw new Error(`Event cue time ${t}s is after shot duration ${shotDurationSec}s`)
  }
  return t
}

export function validateEventCue(
  cue: Pick<ShotEventCue, 't' | 'eventId'>,
  pipeline: AssetPipelineProject,
  shotId: string
): { warning?: string } {
  const shot = (pipeline.storyboardShots || []).find((s) => s.id === shotId)
  if (!shot) throw new Error(`Shot not found: ${shotId}`)
  parseEventCueTime(cue.t, shot.durationSec)
  const eventId = (cue.eventId || '').trim()
  if (!eventId) throw new Error('Event cue requires eventId')
  const event = (pipeline.eventDefinitions || []).find((e) => e.id === eventId)
  if (!event) throw new Error(`Event not found: ${eventId}`)
  const shotGameId = getShotGameId(pipeline, shotId)
  if (event.gameId !== shotGameId) {
    throw new Error(
      `Event '${event.name}' belongs to game '${event.gameId}', not shot game '${shotGameId}'`
    )
  }
  const bound = bindingsForShot(pipeline, shotId).filter((b) => b.eventId === eventId)
  if (bound.length === 0) {
    return {
      warning: `Event '${event.name}' has no bindings on this shot (Fire/timeline will match 0)`
    }
  }
  return {}
}

export function eventCueIssues(
  cue: ShotEventCue,
  pipeline: AssetPipelineProject,
  shotId: string
): string | null {
  try {
    const { warning } = validateEventCue(cue, pipeline, shotId)
    return warning || null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export function collectEventCueUsage(
  pipeline: AssetPipelineProject,
  eventId: string
): { cueIds: string[]; labels: string[] } {
  const cueIds: string[] = []
  const labels: string[] = []
  for (const shot of pipeline.storyboardShots || []) {
    for (const cue of shot.eventCues || []) {
      if (cue.eventId === eventId) {
        cueIds.push(cue.id)
        const event = (pipeline.eventDefinitions || []).find((e) => e.id === eventId)
        labels.push(`${shot.name || shot.id}/event cue ${cue.id} @ ${cue.t}s (${event?.name || eventId})`)
      }
    }
  }
  return { cueIds, labels }
}

export function findEventCue(
  pipeline: AssetPipelineProject,
  cueId: string
): { shot: StoryboardShot; cue: ShotEventCue } | undefined {
  for (const shot of pipeline.storyboardShots || []) {
    const cue = (shot.eventCues || []).find((c) => c.id === cueId)
    if (cue) return { shot, cue }
  }
  return undefined
}
