/**
 * Timeline event-cue crossings.
 * Fire once per forward-play crossing of cue.t. Not on pause, reverse, or seek-into.
 * Shot-loop wrap re-arms (next pass can fire again). Does not mutate authored JSON.
 */

import { isReverseScrub, type AudioTransportState } from './audioPlayback'
import type { ShotEventCue } from '../types/assetPipeline'

export type EventCueLike = Pick<ShotEventCue, 'id' | 't' | 'eventId'>

export function isShotLoopWrap(
  previousTimeSec: number | undefined,
  timeSec: number,
  shotDurationSec: number
): boolean {
  if (previousTimeSec === undefined) return false
  if (timeSec + 0.04 >= previousTimeSec) return false
  return previousTimeSec > shotDurationSec - 0.12 && timeSec < 0.12
}

/**
 * Cues whose time is in (previousTime, timeSec] while playing forward.
 * Seek-into / first sample (no previousTime) returns [].
 * Reverse/pause/scrub return [].
 * Loop wrap: re-arm only (do not fire remaining mid-shot cues as a reverse sweep).
 * A cue at t=0 is seek-into on play-from-0; it is not fired. Place cues at the Press time.
 */
export function collectEventCueCrossings(
  cues: EventCueLike[],
  previousTimeSec: number | undefined,
  timeSec: number,
  options: {
    transport: AudioTransportState
    scrubbing?: boolean
    shotDurationSec: number
  }
): EventCueLike[] {
  if (options.transport !== 'playing' || options.scrubbing) return []
  if (previousTimeSec === undefined) return []
  if (isReverseScrub(previousTimeSec, timeSec, options.shotDurationSec)) return []
  if (isShotLoopWrap(previousTimeSec, timeSec, options.shotDurationSec)) return []
  if (timeSec + 1e-9 < previousTimeSec) return []
  return cues
    .filter((c) => previousTimeSec < c.t && c.t <= timeSec)
    .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
}
