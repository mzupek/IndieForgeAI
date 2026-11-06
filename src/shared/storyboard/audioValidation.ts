/**
 * A1: Game-scoped audio catalog validation (no mixer).
 * A2 playback must use HTMLAudioElement.play()/pause() or AudioContext scheduling
 * with drift correction. Paused currentTime seeks do NOT produce sound.
 * Reverse scrub positions deterministically; silence while paused.
 * A3 event SFX must cancel real mixer voices on reset/stop/shot change/repeat.
 */

import type { AssetPipelineProject, AudioAsset, AudioKind } from '../types/assetPipeline'

export const AUDIO_KINDS: AudioKind[] = ['music', 'sfx']
export const SUPPORTED_AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a'] as const

export function ensureAudioArrays(pipeline: AssetPipelineProject): void {
  if (!pipeline.audioAssets) pipeline.audioAssets = []
}

export function audioFileExtension(file: string | undefined): string {
  if (!file) return ''
  const base = file.split(/[\\/]/).pop() || file
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function isSupportedAudioMedia(file: string | undefined): boolean {
  const ext = audioFileExtension(file)
  return (SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext)
}

export function unsupportedAudioMediaMessage(file: string | undefined): string {
  const ext = audioFileExtension(file) || 'unknown'
  return `Unsupported audio '.${ext}'. Forge imports mp3/wav/ogg/m4a; other types are not promised.`
}

export function parseAudioKind(value: string | undefined): AudioKind {
  const kind = (value || '').trim().toLowerCase()
  if (kind === 'music' || kind === 'sfx') return kind
  throw new Error(`Audio kind must be 'music' or 'sfx', got '${value}'`)
}

export function audioVisibleInGame(asset: AudioAsset, gameId: string): boolean {
  return asset.gameId === gameId
}

export function audioAssetsForGame(pipeline: AssetPipelineProject, gameId: string): AudioAsset[] {
  ensureAudioArrays(pipeline)
  return (pipeline.audioAssets || []).filter((a) => audioVisibleInGame(a, gameId))
}

export function formatAudioDuration(seconds: number): string {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return '0s'
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  return `${seconds.toFixed(2)}s`
}

/**
 * In-use collector. A1 has no shot audioTrack / playSfx yet; still scans optional
 * forward fields so delete cannot orphan later refs if they appear in JSON.
 */
export function collectAudioUsage(
  pipeline: AssetPipelineProject,
  audioId: string
): { labels: string[] } {
  const labels: string[] = []
  for (const shot of pipeline.storyboardShots || []) {
    const track =
      (shot as { audioTrack?: Array<{ id?: string; audioId?: string; t?: number }> }).audioTrack ||
      []
    for (const block of track) {
      if (block.audioId === audioId) {
        labels.push(
          `${shot.name || shot.id} audio block ${block.id || ''} @ ${block.t ?? 0}s`.trim()
        )
      }
    }
  }
  for (const binding of pipeline.eventBindings || []) {
    const action = binding.action as { type: string; audioId?: string }
    if (action.type === 'playSfx' && action.audioId === audioId) {
      labels.push(`event binding ${binding.id}`)
    }
  }
  return { labels }
}

export function formatAudioInUseError(name: string, labels: string[]): string {
  const preview = labels.slice(0, 3).join(', ')
  const extra = labels.length > 3 ? '...' : ''
  return `Cannot delete audio '${name}': referenced by ${labels.length} item(s): ${preview}${extra}`
}
