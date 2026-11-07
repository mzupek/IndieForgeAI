/**
 * A3 event SFX mixer.
 *
 * One HTMLAudioElement (or test double) per playSfx binding.
 * Fire plays immediately (not gated on transport). Same-binding repeat
 * cancels and restarts from 0. Unrelated voices overlap. Event SFX never loops.
 * Reset / stop / shot change / unmount cancel these voices.
 * Stale play() resolutions must not resurrect audio (generation token).
 * Never mutates authored layers, defaults, or shot.audioTrack.
 * Transport music/SFX use a separate voice map.
 */

import type { AudioElementLike, AudioVoiceStatus } from './audioPlayback'
import type { ActiveEventSfx, EventPreviewSnapshot } from './eventPreview'

export interface EventSfxVoice {
  bindingId: string
  audioId: string
  element: AudioElementLike
  url: string
  status: AudioVoiceStatus
  message?: string
  playGeneration: number
  appliedGeneration: number
  completedGeneration: number
}

export interface ApplyEventSfxResult {
  played: string[]
  restarted: string[]
  stopped: string[]
}

export function eventSfxVolume(sfx: Pick<ActiveEventSfx, 'volume'>): number {
  const n = Number(sfx.volume)
  if (!Number.isFinite(n)) return 1
  return Math.max(0, Math.min(1, n))
}

/**
 * Drive event SFX voices from the current preview snapshot.
 * Restart when that binding's generation advances. Do not loop.
 * Voices not in the snapshot are paused (expiry / reset / shot change).
 */
export function applyEventSfxPlayback(
  snapshot: EventPreviewSnapshot,
  voices: Map<string, EventSfxVoice>,
  options?: {
    onPlayRejected?: (bindingId: string, err: unknown) => void
  }
): ApplyEventSfxResult {
  const result: ApplyEventSfxResult = { played: [], restarted: [], stopped: [] }
  const active = new Map(snapshot.sfx.map((s) => [s.bindingId, s]))

  for (const [bindingId, voice] of voices) {
    const sfx = active.get(bindingId)
    const el = voice.element
    if (!sfx) {
      voice.playGeneration += 1
      el.volume = 0
      if (!el.paused) {
        el.pause()
        result.stopped.push(bindingId)
      }
      continue
    }
    if (voice.status !== 'ready') {
      el.volume = 0
      if (!el.paused) {
        el.pause()
        result.stopped.push(bindingId)
      }
      continue
    }

    const volume = eventSfxVolume(sfx)
    const restart = voice.appliedGeneration !== sfx.generation
    if (restart) {
      voice.playGeneration += 1
      const generation = voice.playGeneration
      try {
        el.currentTime = 0
      } catch {
        /* seek may throw before ready */
      }
      if (!el.paused) el.pause()
      el.volume = volume
      voice.appliedGeneration = sfx.generation
      result.restarted.push(bindingId)
      result.played.push(bindingId)
      void el.play().then(
        () => undefined,
        (err) => {
          if (generation !== voice.playGeneration) return
          const name =
            err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : ''
          if (name === 'AbortError') return
          voice.status = 'error'
          voice.message =
            err instanceof Error ? err.message : 'Audio play() was rejected (host decode or autoplay)'
          options?.onPlayRejected?.(bindingId, err)
        }
      )
      continue
    }

    el.volume = volume
    if (voice.completedGeneration === sfx.generation) {
      if (!el.paused) {
        el.pause()
        result.stopped.push(bindingId)
      }
      continue
    }
  }

  return result
}

export function markEventSfxEnded(voice: EventSfxVoice): void {
  voice.completedGeneration = voice.appliedGeneration
  voice.playGeneration += 1
  if (!voice.element.paused) voice.element.pause()
}

export function cancelEventSfxVoices(voices: Map<string, EventSfxVoice>): string[] {
  const stopped: string[] = []
  for (const [bindingId, voice] of voices) {
    voice.playGeneration += 1
    voice.appliedGeneration = 0
    voice.element.volume = 0
    if (!voice.element.paused) {
      voice.element.pause()
      stopped.push(bindingId)
    }
  }
  return stopped
}

export function disposeEventSfxVoices(voices: Map<string, EventSfxVoice>): void {
  cancelEventSfxVoices(voices)
  for (const voice of voices.values()) {
    try {
      voice.element.src = ''
    } catch {
      /* ignore */
    }
  }
  voices.clear()
}
