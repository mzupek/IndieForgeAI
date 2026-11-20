/**
 * Timed clip blocks on a shot timeline.
 * Range playback (not instantaneous keys). Shared by storage, CLI, IPC, renderer.
 * Does not mutate Unity/Godot importers.
 */

import type {
  AssetPipelineProject,
  Clip,
  ShotClipBlock,
  StoryboardShot
} from '../types/assetPipeline'
import { getShotGameId } from './layerValidation'

export const CLIP_BLOCK_TIME_EPS = 1e-9
export const SUPPORTED_CLIP_EXTENSIONS = ['mp4', 'webm', 'mov'] as const

export interface ResolvedClipBlock extends ShotClipBlock {
  implicit: boolean
}

export interface ClipBlockSample {
  blockId: string
  clipId: string
  role: ShotClipBlock['role']
  layerId?: string | null
  sourceTimeSec: number
  implicit: boolean
}

export function parseClipTime(value: number | string | undefined, label: string): number {
  const n = value === undefined || value === '' ? NaN : Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`${label} must be a finite number of seconds, got '${value}'`)
  }
  return n
}

export function clipFileExtension(file: string | undefined): string {
  if (!file) return ''
  const base = file.split(/[\\/]/).pop() || file
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function isSupportedClipMedia(file: string | undefined): boolean {
  const ext = clipFileExtension(file)
  return (SUPPORTED_CLIP_EXTENSIONS as readonly string[]).includes(ext)
}

export function unsupportedClipMediaMessage(file: string | undefined): string {
  const ext = clipFileExtension(file) || 'unknown'
  return `Unsupported clip media '.${ext}'. Forge preview plays mp4/webm (mov attempted on some hosts); other types are not promised.`
}

export function clipBlockEnd(block: Pick<ShotClipBlock, 't' | 'durationSec'>): number {
  return block.t + block.durationSec
}

export function clipVisibleInGame(
  clip: Clip,
  pipeline: AssetPipelineProject,
  gameId: string
): boolean {
  if (!clip.characterId) return true
  const character = (pipeline.characters || []).find((c) => c.id === clip.characterId)
  if (!character) return false
  return character.gameId === gameId
}

export function clipsForGame(pipeline: AssetPipelineProject, gameId: string): Clip[] {
  return (pipeline.clips || []).filter((c) => clipVisibleInGame(c, pipeline, gameId))
}

function findShot(pipeline: AssetPipelineProject, shotId: string): StoryboardShot {
  const shot = (pipeline.storyboardShots || []).find((s) => s.id === shotId)
  if (!shot) throw new Error(`Shot not found: ${shotId}`)
  return shot
}

export function authoredClipTrack(shot: StoryboardShot): ShotClipBlock[] {
  return [...(shot.clipTrack || [])]
}

/**
 * Implicit blocks so legacy backgroundClipId / layer.clipId actually play
 * until the user places an explicit block for that target.
 * Half-open [0, min(clip.duration, shot.duration)). Never extends the shot.
 */
export function implicitClipBlocks(
  shot: StoryboardShot,
  clips: Clip[]
): ResolvedClipBlock[] {
  const authored = authoredClipTrack(shot)
  const out: ResolvedClipBlock[] = []
  const clipById = new Map(clips.map((c) => [c.id, c]))

  const hasBackground = authored.some((b) => b.role === 'background')
  if (!hasBackground && shot.backgroundClipId) {
    const clip = clipById.get(shot.backgroundClipId)
    if (clip) {
      const durationSec = Math.max(0, Math.min(clip.durationSec, shot.durationSec))
      out.push({
        id: `implicit:bg:${shot.backgroundClipId}`,
        clipId: shot.backgroundClipId,
        role: 'background',
        layerId: null,
        t: 0,
        durationSec,
        sourceInSec: 0,
        sourceOutSec: durationSec,
        schemaVersion: 1,
        implicit: true
      })
    }
  }

  for (const layer of shot.layers || []) {
    if (!layer.clipId) continue
    const hasLayerBlock = authored.some(
      (b) => b.role === 'layer' && b.layerId === layer.id
    )
    if (hasLayerBlock) continue
    const clip = clipById.get(layer.clipId)
    if (!clip) continue
    const durationSec = Math.max(0, Math.min(clip.durationSec, shot.durationSec))
    out.push({
      id: `implicit:layer:${layer.id}`,
      clipId: layer.clipId,
      role: 'layer',
      layerId: layer.id,
      t: 0,
      durationSec,
      sourceInSec: 0,
      sourceOutSec: durationSec,
      schemaVersion: 1,
      implicit: true
    })
  }

  return out
}

export function resolveEffectiveClipBlocks(
  shot: StoryboardShot,
  clips: Clip[]
): ResolvedClipBlock[] {
  const authored: ResolvedClipBlock[] = authoredClipTrack(shot).map((b) => ({
    ...b,
    implicit: false
  }))
  return [...authored, ...implicitClipBlocks(shot, clips)]
}

/**
 * Half-open interval: active when t <= timeSec < t+durationSec.
 * Before and at/after the end: inactive (layer/background not drawn from video).
 */
export function isClipBlockActive(
  block: Pick<ShotClipBlock, 't' | 'durationSec'>,
  timeSec: number
): boolean {
  return timeSec + CLIP_BLOCK_TIME_EPS >= block.t && timeSec < block.t + block.durationSec
}

export function sourceTimeForBlock(
  block: Pick<ShotClipBlock, 't' | 'sourceInSec' | 'sourceOutSec'>,
  timeSec: number
): number {
  const source = block.sourceInSec + (timeSec - block.t)
  const end = block.sourceOutSec
  if (source <= block.sourceInSec) return block.sourceInSec
  if (source >= end) return Math.max(block.sourceInSec, end - CLIP_BLOCK_TIME_EPS)
  return source
}

export function sampleClipBlocks(
  shot: StoryboardShot,
  clips: Clip[],
  timeSec: number
): ClipBlockSample[] {
  const blocks = resolveEffectiveClipBlocks(shot, clips)
  const samples: ClipBlockSample[] = []
  for (const block of blocks) {
    if (!isClipBlockActive(block, timeSec)) continue
    samples.push({
      blockId: block.id,
      clipId: block.clipId,
      role: block.role,
      layerId: block.layerId,
      sourceTimeSec: sourceTimeForBlock(block, timeSec),
      implicit: block.implicit
    })
  }
  return samples
}

export function sampleBackgroundClip(
  shot: StoryboardShot,
  clips: Clip[],
  timeSec: number
): ClipBlockSample | undefined {
  const samples = sampleClipBlocks(shot, clips, timeSec).filter((s) => s.role === 'background')
  return samples[samples.length - 1]
}

export function sampleLayerClip(
  shot: StoryboardShot,
  clips: Clip[],
  layerId: string,
  timeSec: number
): ClipBlockSample | undefined {
  const samples = sampleClipBlocks(shot, clips, timeSec).filter(
    (s) => s.role === 'layer' && s.layerId === layerId
  )
  return samples[samples.length - 1]
}

export function validateShotClipBlock(
  block: ShotClipBlock,
  shot: StoryboardShot,
  pipeline: AssetPipelineProject,
  shotId: string,
  options?: { excludeBlockId?: string; extendShot?: boolean }
): void {
  getShotGameId(pipeline, shotId)
  const clip = (pipeline.clips || []).find((c) => c.id === block.clipId)
  if (!clip) throw new Error(`Clip not found: ${block.clipId}`)

  const gameId = getShotGameId(pipeline, shotId)
  if (!clipVisibleInGame(clip, pipeline, gameId)) {
    throw new Error(
      `Clip '${block.clipId}' is not in game '${gameId}' (character belongs to another game)`
    )
  }

  if (!clip.file) throw new Error(`Clip '${block.clipId}' has no media file`)
  if (!isSupportedClipMedia(clip.file)) {
    throw new Error(unsupportedClipMediaMessage(clip.file))
  }

  if (!Number.isFinite(block.t) || block.t < 0) {
    throw new Error(`Block start ${block.t}s is before the shot start (0s)`)
  }
  if (!Number.isFinite(block.durationSec) || block.durationSec <= CLIP_BLOCK_TIME_EPS) {
    throw new Error(`Block duration must be > 0, got ${block.durationSec}s`)
  }
  if (!Number.isFinite(block.sourceInSec) || block.sourceInSec < 0) {
    throw new Error(`Source in ${block.sourceInSec}s is before clip start (0s)`)
  }
  if (!Number.isFinite(block.sourceOutSec) || block.sourceOutSec <= block.sourceInSec + CLIP_BLOCK_TIME_EPS) {
    throw new Error(
      `Source out ${block.sourceOutSec}s must be after source in ${block.sourceInSec}s`
    )
  }
  if (block.sourceOutSec > clip.durationSec + 0.05) {
    throw new Error(
      `Source out ${block.sourceOutSec}s exceeds clip duration ${clip.durationSec}s`
    )
  }

  const trimWindow = block.sourceOutSec - block.sourceInSec
  if (Math.abs(trimWindow - block.durationSec) > 0.001) {
    throw new Error(
      `Block duration ${block.durationSec}s must equal source out-in (${trimWindow}s) at 1x playback`
    )
  }

  if (block.role === 'layer') {
    if (!block.layerId) {
      throw new Error(`Layer clip block requires a layerId`)
    }
    const layer = (shot.layers || []).find((l) => l.id === block.layerId)
    if (!layer) throw new Error(`Layer not found: ${block.layerId}`)
    if (!layer.clipId) {
      throw new Error(`Layer '${block.layerId}' is not a clip layer`)
    }
    if (layer.clipId !== block.clipId) {
      throw new Error(
        `Block clip '${block.clipId}' does not match layer clip '${layer.clipId}'`
      )
    }
  } else if (block.role === 'background') {
    if (block.layerId) {
      throw new Error(`Background clip block must not set layerId`)
    }
  } else {
    throw new Error(`Unknown clip block role`)
  }

  const end = clipBlockEnd(block)
  if (end > shot.durationSec + CLIP_BLOCK_TIME_EPS && !options?.extendShot) {
    throw new Error(
      `Clip block ends at t=${end}s but shot duration is ${shot.durationSec}s. Pass --extend-shot to extend the shot (never silent).`
    )
  }

  const others = authoredClipTrack(shot).filter(
    (b) => b.id !== (options?.excludeBlockId || block.id)
  )
  for (const other of others) {
    const sameTarget =
      (block.role === 'background' && other.role === 'background') ||
      (block.role === 'layer' &&
        other.role === 'layer' &&
        other.layerId === block.layerId)
    if (!sameTarget) continue
    const overlap =
      block.t < clipBlockEnd(other) - CLIP_BLOCK_TIME_EPS &&
      other.t < end - CLIP_BLOCK_TIME_EPS
    if (overlap) {
      throw new Error(
        `Clip block overlaps existing block ${other.id} on the same ${block.role} target`
      )
    }
  }
}

export function clipBlockIssues(
  block: ShotClipBlock,
  shot: StoryboardShot,
  pipeline: AssetPipelineProject,
  shotId: string
): string | null {
  try {
    validateShotClipBlock(block, shot, pipeline, shotId, { extendShot: true })
    if (clipBlockEnd(block) > shot.durationSec + CLIP_BLOCK_TIME_EPS) {
      return `Block ends at t=${clipBlockEnd(block)}s after shot duration ${shot.durationSec}s`
    }
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export function maxClipBlockEndOnShot(shot: StoryboardShot): number {
  let max = 0
  for (const block of shot.clipTrack || []) {
    const end = clipBlockEnd(block)
    if (end > max) max = end
  }
  return max
}

export function assertShotDurationFitsClipBlocks(
  shot: StoryboardShot,
  durationSec: number
): void {
  const maxEnd = maxClipBlockEndOnShot(shot)
  if (durationSec + CLIP_BLOCK_TIME_EPS < maxEnd) {
    throw new Error(
      `Cannot set duration to ${durationSec}s: a clip block ends at t=${maxEnd}s`
    )
  }
}

export function findClipBlock(
  pipeline: AssetPipelineProject,
  blockId: string
): { shot: StoryboardShot; block: ShotClipBlock } | undefined {
  for (const shot of pipeline.storyboardShots || []) {
    const block = (shot.clipTrack || []).find((b) => b.id === blockId)
    if (block) return { shot, block }
  }
  return undefined
}

export function collectClipUsage(
  pipeline: AssetPipelineProject,
  clipId: string
): { labels: string[] } {
  const labels: string[] = []
  for (const shot of pipeline.storyboardShots || []) {
    if (shot.backgroundClipId === clipId) {
      labels.push(`${shot.name || shot.id} backgroundClipId`)
    }
    for (const layer of shot.layers || []) {
      if (layer.clipId === clipId) {
        labels.push(`${shot.name || shot.id}/layer ${layer.id}`)
      }
    }
    for (const block of shot.clipTrack || []) {
      if (block.clipId === clipId) {
        labels.push(`${shot.name || shot.id} clip block ${block.id} @ ${block.t}s`)
      }
    }
  }
  return { labels }
}

export function formatClipInUseError(name: string, labels: string[]): string {
  const preview = labels.slice(0, 3).join(', ')
  const extra = labels.length > 3 ? '...' : ''
  return `Cannot delete clip '${name}': referenced by ${labels.length} shot item(s): ${preview}${extra}`
}

export function describeClipBlock(block: ShotClipBlock, clip?: Clip): string {
  const moment = clip?.moment || block.clipId
  return `${block.role} ${moment} @ ${block.t.toFixed(2)}s–${clipBlockEnd(block).toFixed(2)}s (src ${block.sourceInSec.toFixed(2)}–${block.sourceOutSec.toFixed(2)})`
}

export function makeClipBlock(input: {
  id?: string
  clipId: string
  role: ShotClipBlock['role']
  layerId?: string | null
  t: number
  sourceInSec: number
  sourceOutSec: number
}): ShotClipBlock {
  const durationSec = input.sourceOutSec - input.sourceInSec
  return {
    id: input.id || '',
    clipId: input.clipId,
    role: input.role,
    layerId: input.role === 'background' ? null : input.layerId,
    t: input.t,
    durationSec,
    sourceInSec: input.sourceInSec,
    sourceOutSec: input.sourceOutSec,
    schemaVersion: 1
  }
}

export function defaultSourceWindow(
  clip: Clip,
  shotDurationSec: number,
  startT: number
): { sourceInSec: number; sourceOutSec: number; needsExtend: boolean; end: number } {
  const sourceInSec = 0
  const sourceOutSec = clip.durationSec
  const durationSec = sourceOutSec - sourceInSec
  const end = startT + durationSec
  return {
    sourceInSec,
    sourceOutSec,
    needsExtend: end > shotDurationSec + CLIP_BLOCK_TIME_EPS,
    end
  }
}
