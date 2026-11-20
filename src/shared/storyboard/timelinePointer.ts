/**
 * Y-aware hit test for the seven timeline tracks
 * (camera / background / pose / effects / clips / audio / events).
 * Click on empty track time → playhead. Click on a marker/block → select (and drag if movable).
 * Selected-layer visibility range lives on the pose track (edge trim).
 */

export const TIMELINE_NEAR_RATIO = 0.03
export const TIMELINE_EDGE_RATIO = 0.012
export const TIMELINE_TRACK_COUNT = 7
export const TIMELINE_TRACK_HEIGHT_PX = 40
export const TIMELINE_HEIGHT_PX = TIMELINE_TRACK_COUNT * TIMELINE_TRACK_HEIGHT_PX
export const TIMELINE_TRACK_ORDER = [
  'camera',
  'background',
  'pose',
  'effects',
  'clips',
  'audio',
  'events'
] as const

export type TimelineTrack = (typeof TIMELINE_TRACK_ORDER)[number]

export type TimelineClipDrag = 'move' | 'trimIn' | 'trimOut'

export type TimelineHit =
  | { kind: 'playhead'; timeSec: number; track: TimelineTrack }
  | { kind: 'camera'; index: number; timeSec: number }
  | { kind: 'backgroundKey'; keyId: string; timeSec: number }
  | { kind: 'timedKey'; index: number; layerId: string; keyId: string; timeSec: number }
  | {
      kind: 'layerRange'
      layerId: string
      clipDrag: 'trimIn' | 'trimOut'
      timeSec: number
    }
  | { kind: 'effect'; index: number; timeSec: number }
  | {
      kind: 'clipBlock'
      blockId: string
      implicit: boolean
      clipDrag: TimelineClipDrag
      grabOffsetSec: number
      timeSec: number
    }
  | {
      kind: 'audioBlock'
      blockId: string
      clipDrag: TimelineClipDrag
      grabOffsetSec: number
      timeSec: number
    }
  | { kind: 'eventCue'; cueId: string; timeSec: number }

export function timelineTrackAtYRatio(yRatio: number): TimelineTrack {
  const band = Math.min(
    TIMELINE_TRACK_COUNT - 1,
    Math.max(0, Math.floor(yRatio * TIMELINE_TRACK_COUNT + 1e-9))
  )
  return TIMELINE_TRACK_ORDER[band]
}

export function nearMarkerTime(clickTime: number, markerTime: number, durationSec: number): boolean {
  const duration = durationSec > 0 ? durationSec : 1
  return Math.abs(clickTime - markerTime) < TIMELINE_NEAR_RATIO * duration
}

function edgeDrag(xRatio: number, x0: number, x1: number): TimelineClipDrag {
  if (xRatio - x0 < TIMELINE_EDGE_RATIO) return 'trimIn'
  if (x1 - xRatio < TIMELINE_EDGE_RATIO) return 'trimOut'
  return 'move'
}

export function hitTestTimeline(input: {
  durationSec: number
  xRatio: number
  yRatio: number
  cameraTimes: number[]
  timedKeys: Array<{ layerId: string; keyId: string; t: number }>
  effectTimes: number[]
  clipBlocks: Array<{ id: string; t: number; durationSec: number; implicit?: boolean }>
  audioBlocks: Array<{ id: string; t: number; durationSec: number }>
  eventCues?: Array<{ id: string; t: number }>
  backgroundKeys?: Array<{ id: string; t: number }>
  layerRange?: { layerId: string; fromSec: number; toSec: number }
}): TimelineHit {
  const duration = input.durationSec > 0 ? input.durationSec : 1
  const x = Math.max(0, Math.min(1, input.xRatio))
  const clickTime = x * duration
  const track = timelineTrackAtYRatio(input.yRatio)

  if (track === 'camera') {
    for (let i = 0; i < input.cameraTimes.length; i++) {
      if (nearMarkerTime(clickTime, input.cameraTimes[i], duration)) {
        return { kind: 'camera', index: i, timeSec: clickTime }
      }
    }
  } else if (track === 'background') {
    const keys = input.backgroundKeys || []
    for (let i = keys.length - 1; i >= 0; i--) {
      const row = keys[i]
      if (nearMarkerTime(clickTime, row.t, duration)) {
        return { kind: 'backgroundKey', keyId: row.id, timeSec: clickTime }
      }
    }
  } else if (track === 'pose') {
    for (let i = input.timedKeys.length - 1; i >= 0; i--) {
      const row = input.timedKeys[i]
      if (nearMarkerTime(clickTime, row.t, duration)) {
        return {
          kind: 'timedKey',
          index: i,
          layerId: row.layerId,
          keyId: row.keyId,
          timeSec: clickTime
        }
      }
    }
    if (input.layerRange) {
      const x0 = input.layerRange.fromSec / duration
      const x1 = input.layerRange.toSec / duration
      if (x >= x0 && x <= x1) {
        const edge = edgeDrag(x, x0, x1)
        if (edge === 'trimIn' || edge === 'trimOut') {
          return {
            kind: 'layerRange',
            layerId: input.layerRange.layerId,
            clipDrag: edge,
            timeSec: clickTime
          }
        }
      }
    }
  } else if (track === 'effects') {
    for (let i = 0; i < input.effectTimes.length; i++) {
      if (nearMarkerTime(clickTime, input.effectTimes[i], duration)) {
        return { kind: 'effect', index: i, timeSec: clickTime }
      }
    }
  } else if (track === 'clips') {
    for (let i = input.clipBlocks.length - 1; i >= 0; i--) {
      const block = input.clipBlocks[i]
      const x0 = block.t / duration
      const x1 = (block.t + block.durationSec) / duration
      if (x >= x0 && x <= x1) {
        return {
          kind: 'clipBlock',
          blockId: block.id,
          implicit: !!block.implicit,
          clipDrag: block.implicit ? 'move' : edgeDrag(x, x0, x1),
          grabOffsetSec: clickTime - block.t,
          timeSec: clickTime
        }
      }
    }
  } else if (track === 'audio') {
    for (let i = input.audioBlocks.length - 1; i >= 0; i--) {
      const block = input.audioBlocks[i]
      const x0 = block.t / duration
      const x1 = (block.t + block.durationSec) / duration
      if (x >= x0 && x <= x1) {
        return {
          kind: 'audioBlock',
          blockId: block.id,
          clipDrag: edgeDrag(x, x0, x1),
          grabOffsetSec: clickTime - block.t,
          timeSec: clickTime
        }
      }
    }
  } else {
    const cues = input.eventCues || []
    for (let i = cues.length - 1; i >= 0; i--) {
      const cue = cues[i]
      if (nearMarkerTime(clickTime, cue.t, duration)) {
        return { kind: 'eventCue', cueId: cue.id, timeSec: clickTime }
      }
    }
  }

  return { kind: 'playhead', timeSec: clickTime, track }
}
