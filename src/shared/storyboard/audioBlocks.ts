/**
 * Timed shot audio blocks (A2).
 * Range playback on shot.audioTrack. Shared by storage, CLI, IPC, renderer.
 * Does not play sound — see audioPlayback.ts for HTMLAudioElement.play()/pause().
 */

import type {
  AssetPipelineProject,
  AudioAsset,
  AudioBlockRole,
  ShotAudioBlock,
  StoryboardShot
} from '../types/assetPipeline'
import { getShotGameId } from './layerValidation'
import { isSupportedAudioMedia, unsupportedAudioMediaMessage } from './audioValidation'

export const AUDIO_BLOCK_TIME_EPS = 1e-9
export const AUDIO_BLOCK_ROLES: AudioBlockRole[] = ['music', 'sfx']

export interface AudioBlockSample {
  blockId: string
  audioId: string
  role: AudioBlockRole
  sourceTimeSec: number
  gain: number
  loop: boolean
}

export function parseAudioTime(value: number | string | undefined, label: string): number {
  const n = value === undefined || value === '' ? NaN : Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`${label} must be a finite number of seconds, got '${value}'`)
  }
  return n
}

export function parseAudioRole(value: string | undefined, fallback: AudioBlockRole): AudioBlockRole {
  if (value === undefined || value === '') return fallback
  const role = value.trim().toLowerCase()
  if (role === 'music' || role === 'sfx') return role
  throw new Error(`Audio block role must be 'music' or 'sfx', got '${value}'`)
}

export function parseAudioVolume(value: number | string | undefined, fallback = 1): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`Volume must be between 0 and 1, got '${value}'`)
  }
  return n
}

export function parseAudioBool(value: boolean | string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback
  if (typeof value === 'boolean') return value
  const v = value.trim().toLowerCase()
  if (v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  throw new Error(`Expected boolean, got '${value}'`)
}

export function audioBlockEnd(block: Pick<ShotAudioBlock, 't' | 'durationSec'>): number {
  return block.t + block.durationSec
}

export function authoredAudioTrack(shot: StoryboardShot): ShotAudioBlock[] {
  return [...(shot.audioTrack || [])]
}

export function isAudioBlockActive(
  block: Pick<ShotAudioBlock, 't' | 'durationSec'>,
  timeSec: number
): boolean {
  return timeSec + AUDIO_BLOCK_TIME_EPS >= block.t && timeSec < block.t + block.durationSec
}

/**
 * Source playhead inside the trim window.
 * Loop wraps elapsed time through [sourceIn, sourceOut). Reverse elapsed still maps
 * deterministically (positive modulo) so paused reverse scrub has a stable position.
 */
export function sourceTimeForAudioBlock(
  block: Pick<ShotAudioBlock, 't' | 'sourceInSec' | 'sourceOutSec' | 'loop'>,
  timeSec: number
): number {
  const trim = block.sourceOutSec - block.sourceInSec
  const elapsed = timeSec - block.t
  if (!(trim > AUDIO_BLOCK_TIME_EPS)) return block.sourceInSec
  if (block.loop) {
    let wrapped = elapsed % trim
    if (wrapped < 0) wrapped += trim
    const source = block.sourceInSec + wrapped
    if (source >= block.sourceOutSec) {
      return Math.max(block.sourceInSec, block.sourceOutSec - AUDIO_BLOCK_TIME_EPS)
    }
    return source
  }
  const source = block.sourceInSec + elapsed
  if (source <= block.sourceInSec) return block.sourceInSec
  if (source >= block.sourceOutSec) {
    return Math.max(block.sourceInSec, block.sourceOutSec - AUDIO_BLOCK_TIME_EPS)
  }
  return source
}

/**
 * Linear fade-in from the block start and fade-out to the block end, multiplied by volume.
 * Fades may overlap in the middle; they multiply.
 */
export function fadeGainForAudioBlock(
  block: Pick<ShotAudioBlock, 't' | 'durationSec' | 'volume' | 'fadeInSec' | 'fadeOutSec'>,
  timeSec: number
): number {
  if (!isAudioBlockActive(block, timeSec)) return 0
  const volume = Number.isFinite(block.volume) ? Math.max(0, Math.min(1, block.volume)) : 1
  const local = timeSec - block.t
  const remaining = block.durationSec - local
  const fadeIn = block.fadeInSec > AUDIO_BLOCK_TIME_EPS ? Math.max(0, Math.min(1, local / block.fadeInSec)) : 1
  const fadeOut =
    block.fadeOutSec > AUDIO_BLOCK_TIME_EPS ? Math.max(0, Math.min(1, remaining / block.fadeOutSec)) : 1
  return Math.max(0, Math.min(1, volume * fadeIn * fadeOut))
}

export function sampleAudioBlocks(
  shot: StoryboardShot,
  timeSec: number
): AudioBlockSample[] {
  const samples: AudioBlockSample[] = []
  for (const block of authoredAudioTrack(shot)) {
    if (!isAudioBlockActive(block, timeSec)) continue
    samples.push({
      blockId: block.id,
      audioId: block.audioId,
      role: block.role,
      sourceTimeSec: sourceTimeForAudioBlock(block, timeSec),
      gain: fadeGainForAudioBlock(block, timeSec),
      loop: !!block.loop
    })
  }
  return samples
}

export function validateShotAudioBlock(
  block: ShotAudioBlock,
  shot: StoryboardShot,
  pipeline: AssetPipelineProject,
  shotId: string,
  options?: { excludeBlockId?: string; extendShot?: boolean }
): void {
  getShotGameId(pipeline, shotId)
  const asset = (pipeline.audioAssets || []).find((a) => a.id === block.audioId)
  if (!asset) throw new Error(`Audio not found: ${block.audioId}`)

  const gameId = getShotGameId(pipeline, shotId)
  if (asset.gameId !== gameId) {
    throw new Error(`Audio '${asset.name}' belongs to game '${asset.gameId}', not '${gameId}'`)
  }
  if (!asset.file) throw new Error(`Audio '${asset.name}' has no media file`)
  if (!isSupportedAudioMedia(asset.file)) {
    throw new Error(unsupportedAudioMediaMessage(asset.file))
  }
  if (block.role !== asset.kind) {
    throw new Error(
      `Audio block role '${block.role}' must match library kind '${asset.kind}' for '${asset.name}'`
    )
  }

  if (!Number.isFinite(block.t) || block.t < 0) {
    throw new Error(`Block start ${block.t}s is before the shot start (0s)`)
  }
  if (!Number.isFinite(block.durationSec) || block.durationSec <= AUDIO_BLOCK_TIME_EPS) {
    throw new Error(`Block duration must be > 0, got ${block.durationSec}s`)
  }
  if (!Number.isFinite(block.sourceInSec) || block.sourceInSec < 0) {
    throw new Error(`Source in ${block.sourceInSec}s is before audio start (0s)`)
  }
  if (
    !Number.isFinite(block.sourceOutSec) ||
    block.sourceOutSec <= block.sourceInSec + AUDIO_BLOCK_TIME_EPS
  ) {
    throw new Error(
      `Source out ${block.sourceOutSec}s must be after source in ${block.sourceInSec}s`
    )
  }
  if (block.sourceOutSec > asset.durationSec + 0.05) {
    throw new Error(
      `Source out ${block.sourceOutSec}s exceeds audio duration ${asset.durationSec}s`
    )
  }

  const trimWindow = block.sourceOutSec - block.sourceInSec
  if (!block.loop) {
    if (Math.abs(trimWindow - block.durationSec) > 0.001) {
      throw new Error(
        `Non-loop audio duration ${block.durationSec}s must equal source out-in (${trimWindow}s) at 1x`
      )
    }
  }

  if (!Number.isFinite(block.volume) || block.volume < 0 || block.volume > 1) {
    throw new Error(`Volume must be between 0 and 1, got ${block.volume}`)
  }
  if (!Number.isFinite(block.fadeInSec) || block.fadeInSec < 0) {
    throw new Error(`Fade in must be >= 0, got ${block.fadeInSec}`)
  }
  if (!Number.isFinite(block.fadeOutSec) || block.fadeOutSec < 0) {
    throw new Error(`Fade out must be >= 0, got ${block.fadeOutSec}`)
  }

  const end = audioBlockEnd(block)
  if (end > shot.durationSec + AUDIO_BLOCK_TIME_EPS && !options?.extendShot) {
    throw new Error(
      `Audio block ends at t=${end}s but shot duration is ${shot.durationSec}s. Pass --extend-shot to extend the shot, or --fit-shot to clamp this block to the current shot end (never silent).`
    )
  }

  if (block.role === 'music') {
    const others = authoredAudioTrack(shot).filter(
      (b) => b.id !== (options?.excludeBlockId || block.id) && b.role === 'music'
    )
    for (const other of others) {
      const overlap =
        block.t < audioBlockEnd(other) - AUDIO_BLOCK_TIME_EPS &&
        other.t < end - AUDIO_BLOCK_TIME_EPS
      if (overlap) {
        throw new Error(
          `Music block overlaps existing music ${other.id} (MVP allows one music bed)`
        )
      }
    }
  }
}

export function audioBlockIssues(
  block: ShotAudioBlock,
  shot: StoryboardShot,
  pipeline: AssetPipelineProject,
  shotId: string
): string | null {
  try {
    validateShotAudioBlock(block, shot, pipeline, shotId, { extendShot: true })
    if (audioBlockEnd(block) > shot.durationSec + AUDIO_BLOCK_TIME_EPS) {
      return `Block ends at t=${audioBlockEnd(block)}s after shot duration ${shot.durationSec}s`
    }
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export function maxAudioBlockEndOnShot(shot: StoryboardShot): number {
  let max = 0
  for (const block of shot.audioTrack || []) {
    const end = audioBlockEnd(block)
    if (end > max) max = end
  }
  return max
}

export function assertShotDurationFitsAudioBlocks(
  shot: StoryboardShot,
  durationSec: number
): void {
  const maxEnd = maxAudioBlockEndOnShot(shot)
  if (durationSec + AUDIO_BLOCK_TIME_EPS < maxEnd) {
    throw new Error(
      `Cannot set duration to ${durationSec}s: an audio block ends at t=${maxEnd}s`
    )
  }
}

export function findAudioBlock(
  pipeline: AssetPipelineProject,
  blockId: string
): { shot: StoryboardShot; block: ShotAudioBlock } | undefined {
  for (const shot of pipeline.storyboardShots || []) {
    const block = (shot.audioTrack || []).find((b) => b.id === blockId)
    if (block) return { shot, block }
  }
  return undefined
}

export function describeAudioBlock(block: ShotAudioBlock, asset?: AudioAsset): string {
  const name = asset?.name || block.audioId
  const loop = block.loop ? ' loop' : ''
  return `${block.role}${loop} ${name} @ ${block.t.toFixed(2)}s–${audioBlockEnd(block).toFixed(2)}s (src ${block.sourceInSec.toFixed(2)}–${block.sourceOutSec.toFixed(2)})`
}

export function makeAudioBlock(input: {
  id?: string
  audioId: string
  role: AudioBlockRole
  t: number
  sourceInSec: number
  sourceOutSec: number
  durationSec?: number
  loop?: boolean
  volume?: number
  fadeInSec?: number
  fadeOutSec?: number
}): ShotAudioBlock {
  const trim = input.sourceOutSec - input.sourceInSec
  const loop = !!input.loop
  const durationSec = loop && input.durationSec !== undefined ? input.durationSec : trim
  return {
    id: input.id || '',
    audioId: input.audioId,
    role: input.role,
    t: input.t,
    durationSec,
    sourceInSec: input.sourceInSec,
    sourceOutSec: input.sourceOutSec,
    loop,
    volume: input.volume !== undefined ? input.volume : 1,
    fadeInSec: input.fadeInSec || 0,
    fadeOutSec: input.fadeOutSec || 0,
    schemaVersion: 1
  }
}

export function remainingShotTime(shotDurationSec: number, startT: number): number {
  return shotDurationSec - startT
}

export function defaultLoopForAudioKind(kind: AudioAsset['kind']): boolean {
  return kind === 'music'
}

/**
 * Clamp THIS block to the current shot end. Library source is unchanged.
 * Loop: duration = remaining, source in/out stay the trim (file still loops).
 * Non-loop: sourceOut and duration shrink to the remaining prefix (1x).
 * Does not invent a previous shot length.
 */
export function fitAudioBlockToShotEnd<
  T extends Pick<ShotAudioBlock, 't' | 'durationSec' | 'sourceInSec' | 'sourceOutSec' | 'loop'>
>(block: T, shotDurationSec: number): T {
  const remaining = remainingShotTime(shotDurationSec, block.t)
  if (remaining <= AUDIO_BLOCK_TIME_EPS) {
    throw new Error(
      `Cannot fit audio: start ${block.t}s is at or after shot duration ${shotDurationSec}s`
    )
  }
  if (audioBlockEnd(block) <= shotDurationSec + AUDIO_BLOCK_TIME_EPS) {
    return block
  }
  if (block.loop) {
    return { ...block, durationSec: remaining }
  }
  return {
    ...block,
    sourceOutSec: block.sourceInSec + remaining,
    durationSec: remaining
  }
}

export interface AudioPlacementPlan {
  sourceInSec: number
  sourceOutSec: number
  durationSec: number
  loop: boolean
  fitted: boolean
  needsExtend: boolean
}

/**
 * Default placement uses remaining shot time, not the full library file.
 * Explicit overflowing --duration still requires --extend-shot or --fit-shot.
 */
export function planAudioBlockPlacement(input: {
  asset: AudioAsset
  shotDurationSec: number
  t: number
  sourceInSec?: number
  sourceOutSec?: number
  durationSec?: number
  loop?: boolean
  fitShot?: boolean
  extendShot?: boolean
}): AudioPlacementPlan {
  if (input.extendShot && input.fitShot) {
    throw new Error('Use either --fit-shot or --extend-shot, not both')
  }
  const remaining = remainingShotTime(input.shotDurationSec, input.t)
  if (remaining <= AUDIO_BLOCK_TIME_EPS) {
    throw new Error(
      `Cannot place audio at t=${input.t}s: shot duration is ${input.shotDurationSec}s (at or after the shot end)`
    )
  }
  const loop = input.loop !== undefined ? input.loop : defaultLoopForAudioKind(input.asset.kind)
  const sourceInSec = input.sourceInSec !== undefined ? input.sourceInSec : 0
  let sourceOutSec = input.sourceOutSec !== undefined ? input.sourceOutSec : input.asset.durationSec
  const trim = sourceOutSec - sourceInSec
  const durationWasSet = input.durationSec !== undefined
  let durationSec = durationWasSet ? input.durationSec! : loop ? remaining : trim
  let fitted = false
  if (!durationWasSet && loop && Math.abs(remaining - trim) > AUDIO_BLOCK_TIME_EPS) {
    fitted = true
  }
  const overflow = input.t + durationSec > input.shotDurationSec + AUDIO_BLOCK_TIME_EPS
  if (overflow && (input.fitShot || (!input.extendShot && !durationWasSet))) {
    const next = fitAudioBlockToShotEnd(
      { t: input.t, durationSec, sourceInSec, sourceOutSec, loop },
      input.shotDurationSec
    )
    sourceOutSec = next.sourceOutSec
    durationSec = next.durationSec
    fitted = true
  }
  return {
    sourceInSec,
    sourceOutSec,
    durationSec,
    loop,
    fitted,
    needsExtend: input.t + durationSec > input.shotDurationSec + AUDIO_BLOCK_TIME_EPS
  }
}

export function defaultAudioWindow(
  asset: AudioAsset,
  shotDurationSec: number,
  startT: number,
  opts?: { loop?: boolean }
): AudioPlacementPlan & { end: number } {
  const plan = planAudioBlockPlacement({
    asset,
    shotDurationSec,
    t: startT,
    loop: opts?.loop
  })
  return { ...plan, end: startT + plan.durationSec }
}

export function assertReplacementFitsAudioBlocks(
  pipeline: AssetPipelineProject,
  audioId: string,
  newDurationSec: number
): void {
  for (const shot of pipeline.storyboardShots || []) {
    for (const block of shot.audioTrack || []) {
      if (block.audioId !== audioId) continue
      if (block.sourceOutSec > newDurationSec + 0.05) {
        throw new Error(
          `Cannot replace audio file: shot '${shot.name || shot.id}' block ${block.id} source out ${block.sourceOutSec}s exceeds new duration ${newDurationSec}s`
        )
      }
    }
  }
  // playSfx bindings have no sourceOut trim; a shorter replacement is allowed.
}
