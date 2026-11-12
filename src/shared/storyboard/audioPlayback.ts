/**
 * A2 shot-audio mixer.
 *
 * Architecture: one HTMLAudioElement (or test double) per authored block.
 * Paused currentTime seeks do NOT produce sound — audible output requires
 * play() while the master transport is playing forward. Reverse scrub and
 * pause seek silently. Drift is corrected by seeking and continuing play().
 * This module never mutates authored audioTrack.
 */

import type { AudioAsset, ShotAudioBlock, StoryboardShot } from '../types/assetPipeline'
import {
  fadeGainForAudioBlock,
  isAudioBlockActive,
  sampleAudioBlocks,
  sourceTimeForAudioBlock
} from './audioBlocks'

export const AUDIO_DRIFT_SEC = 0.08

export type AudioTransportState = 'stopped' | 'playing' | 'paused'

export interface AudioElementLike {
  paused: boolean
  currentTime: number
  volume: number
  src: string
  play(): Promise<void>
  pause(): void
}

export type AudioVoiceStatus = 'loading' | 'ready' | 'error' | 'unsupported' | 'missing'

export interface AudioVoice {
  blockId: string
  audioId: string
  element: AudioElementLike
  url: string
  status: AudioVoiceStatus
  message?: string
  playGeneration: number
}

export interface AudioPlaybackCommand {
  blockId: string
  audioId: string
  active: boolean
  audible: boolean
  sourceTimeSec: number
  gain: number
  loop: boolean
}

/**
 * Shot-loop wrap (playhead jumps from near duration to ~0) is not reverse scrub.
 * Any other decrease is reverse/scrub and must stay silent.
 */
export function isReverseScrub(
  previousTimeSec: number | undefined,
  timeSec: number,
  shotDurationSec: number
): boolean {
  if (previousTimeSec === undefined) return false
  if (timeSec + 0.04 >= previousTimeSec) return false
  const wrappedLoop = previousTimeSec > shotDurationSec - 0.12 && timeSec < 0.12
  return !wrappedLoop
}

export function evaluateAudioPlayback(
  shot: StoryboardShot,
  timeSec: number,
  options: {
    transport: AudioTransportState
    previousTimeSec?: number
    scrubbing?: boolean
  }
): AudioPlaybackCommand[] {
  const reverse = isReverseScrub(options.previousTimeSec, timeSec, shot.durationSec)
  const transportAudible =
    options.transport === 'playing' && !options.scrubbing && !reverse
  const commands: AudioPlaybackCommand[] = []
  for (const block of shot.audioTrack || []) {
    const active = isAudioBlockActive(block, timeSec)
    commands.push({
      blockId: block.id,
      audioId: block.audioId,
      active,
      audible: transportAudible && active,
      sourceTimeSec: sourceTimeForAudioBlock(block, timeSec),
      gain: fadeGainForAudioBlock(block, timeSec),
      loop: !!block.loop
    })
  }
  return commands
}

export interface ApplyAudioPlaybackResult {
  played: string[]
  paused: string[]
  seeked: string[]
  silenced: string[]
}

function seekIfDrift(el: AudioElementLike, sourceTimeSec: number, seeked: string[], blockId: string): void {
  if (Math.abs(el.currentTime - sourceTimeSec) > AUDIO_DRIFT_SEC) {
    try {
      el.currentTime = sourceTimeSec
      seeked.push(blockId)
    } catch {
      /* seek may throw before ready */
    }
  }
}

/**
 * Drive loaded voices from evaluated commands. Does not load URLs.
 * Voices whose status is not ready are paused (no play() bursts).
 */
export function applyAudioPlayback(
  commands: AudioPlaybackCommand[],
  voices: Map<string, AudioVoice>,
  options?: {
    onPlayRejected?: (blockId: string, err: unknown) => void
  }
): ApplyAudioPlaybackResult {
  const result: ApplyAudioPlaybackResult = { played: [], paused: [], seeked: [], silenced: [] }
  const commandById = new Map(commands.map((c) => [c.blockId, c]))

  for (const [blockId, voice] of voices) {
    const command = commandById.get(blockId)
    const el = voice.element
    if (!command || !command.audible || voice.status !== 'ready') {
      el.volume = 0
      if (!el.paused) {
        el.pause()
        result.paused.push(blockId)
      }
      if (command && voice.status === 'ready') {
        seekIfDrift(el, command.sourceTimeSec, result.seeked, blockId)
      }
      if (!command) result.silenced.push(blockId)
      continue
    }

    el.volume = command.gain
    seekIfDrift(el, command.sourceTimeSec, result.seeked, blockId)
    if (el.paused) {
      const generation = ++voice.playGeneration
      result.played.push(blockId)
      void el.play().then(
        () => undefined,
        (err) => {
          if (generation !== voice.playGeneration) return
          const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : ''
          if (name === 'AbortError') return
          voice.status = 'error'
          voice.message =
            err instanceof Error ? err.message : 'Audio play() was rejected (host decode or autoplay)'
          options?.onPlayRejected?.(blockId, err)
        }
      )
    }
  }
  return result
}

export function silenceAudioVoices(voices: Map<string, AudioVoice>): string[] {
  const paused: string[] = []
  for (const [blockId, voice] of voices) {
    voice.playGeneration += 1
    voice.element.volume = 0
    if (!voice.element.paused) {
      voice.element.pause()
      paused.push(blockId)
    }
  }
  return paused
}

export function disposeAudioVoices(voices: Map<string, AudioVoice>): void {
  silenceAudioVoices(voices)
  for (const voice of voices.values()) {
    try {
      voice.element.src = ''
    } catch {
      /* ignore */
    }
  }
  voices.clear()
}

/** Convenience: evaluate + apply. Used by tests to simulate a transport tick. */
export function tickAudioPlayback(
  shot: StoryboardShot,
  timeSec: number,
  voices: Map<string, AudioVoice>,
  options: {
    transport: AudioTransportState
    previousTimeSec?: number
    scrubbing?: boolean
    onPlayRejected?: (blockId: string, err: unknown) => void
  }
): ApplyAudioPlaybackResult {
  const commands = evaluateAudioPlayback(shot, timeSec, options)
  return applyAudioPlayback(commands, voices, { onPlayRejected: options.onPlayRejected })
}

export function sampleDoesNotMutateTrack(
  shot: StoryboardShot,
  timeSec: number
): ShotAudioBlock[] {
  sampleAudioBlocks(shot, timeSec)
  return authoredCopy(shot)
}

function authoredCopy(shot: StoryboardShot): ShotAudioBlock[] {
  return (shot.audioTrack || []).map((b) => ({ ...b }))
}

export function audioAssetsById(assets: AudioAsset[]): Map<string, AudioAsset> {
  return new Map(assets.map((a) => [a.id, a]))
}
