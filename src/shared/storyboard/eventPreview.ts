/**
 * P3: In-memory event preview session.
 * Forge authors/simulates event responses. Unity/Godot detect real hits.
 * Preview holds NEVER write authored layer defaults.
 */

import type {
  EventBinding,
  EventDefinition,
  EventReturnPolicy,
  StoryboardLayer
} from '../types/assetPipeline'

export type PrimitivePayload = Record<string, string | number | boolean>

export interface PreviewLayerOverride {
  poseId?: string
  assetStateId?: string | null
  visible?: boolean
  text?: string
  bindingId: string
  eventId: string
}

export interface ActiveEventHold {
  layerId: string
  bindingId: string
  eventId: string
  generation: number
  startedAtMs: number
  /** null = no auto-return (instant or hold policy) */
  expiresAtMs: number | null
  durationSec: number
  returnPolicy: EventReturnPolicy
  override: PreviewLayerOverride
}

/** Transient event SFX voice. Never written to audioTrack. */
export interface ActiveEventSfx {
  bindingId: string
  eventId: string
  audioId: string
  volume: number
  generation: number
  startedAtMs: number
  /** null = play to completion unless reset/stop/shot change */
  expiresAtMs: number | null
  durationSec: number
  returnPolicy: EventReturnPolicy
  stopOnExpiry: boolean
}

export interface EventPreviewSnapshot {
  shotId: string | null
  generation: number
  overrides: Record<string, PreviewLayerOverride>
  holds: ActiveEventHold[]
  sfx: ActiveEventSfx[]
}

export interface FireResult {
  eventId: string
  eventName: string
  matched: number
  skippedFilter: number
  skippedWrongShot: number
  sfxStarted: number
}

function emptySnapshot(shotId: string | null, generation: number): EventPreviewSnapshot {
  return { shotId, generation, overrides: {}, holds: [], sfx: [] }
}

export function payloadMatchesFilter(
  filter: PrimitivePayload | undefined,
  payload: PrimitivePayload | undefined
): boolean {
  if (!filter || Object.keys(filter).length === 0) return true
  if (!payload) return false
  for (const [key, expected] of Object.entries(filter)) {
    if (payload[key] !== expected) return false
  }
  return true
}

export function overrideFromAction(
  binding: EventBinding
): PreviewLayerOverride {
  const base: PreviewLayerOverride = {
    bindingId: binding.id,
    eventId: binding.eventId
  }
  switch (binding.action.type) {
    case 'setPose':
      return { ...base, poseId: binding.action.poseId }
    case 'setState':
      return { ...base, assetStateId: binding.action.stateId }
    case 'setVisibility':
      return { ...base, visible: binding.action.visible }
    case 'setText':
      return { ...base, text: binding.action.text }
    case 'playSfx':
      return base
  }
}

/**
 * Overlay a transient preview hold onto a layer copy.
 * Does not mutate `layer`.
 */
export function applyLayerPreview(
  layer: StoryboardLayer,
  override?: PreviewLayerOverride
): StoryboardLayer {
  if (!override) return layer
  return {
    ...layer,
    poseId: override.poseId ?? layer.poseId,
    assetStateId:
      override.assetStateId !== undefined ? override.assetStateId : layer.assetStateId,
    visible: override.visible !== undefined ? override.visible : layer.visible,
    text: override.text !== undefined ? override.text : layer.text
  }
}

/**
 * P0/P4 precedence helper: active event hold → timed sample → authored default.
 */
export function computeEffectiveLayerState<T>(
  eventHold: T | undefined,
  timedSample: T | undefined,
  authoredDefault: T
): T {
  if (eventHold !== undefined) return eventHold
  if (timedSample !== undefined) return timedSample
  return authoredDefault
}

function expiresAtForBinding(binding: EventBinding, nowMs: number): number | null {
  if (binding.durationSec > 0 && binding.returnPolicy === 'default') {
    return nowMs + binding.durationSec * 1000
  }
  return null
}

export class EventPreviewEngine {
  private events: EventDefinition[] = []
  private bindings: EventBinding[] = []
  private shotId: string | null = null
  private generation = 0
  private holds = new Map<string, ActiveEventHold>()
  private sfx = new Map<string, ActiveEventSfx>()

  setCatalog(events: EventDefinition[], bindings: EventBinding[]): void {
    this.events = events
    this.bindings = bindings
  }

  getShotId(): string | null {
    return this.shotId
  }

  setShot(shotId: string | null): void {
    if (this.shotId === shotId) return
    this.shotId = shotId
    this.clearHolds()
  }

  reset(): void {
    this.clearHolds()
  }

  hasPendingTimers(): boolean {
    const holds = Array.from(this.holds.values())
    for (let i = 0; i < holds.length; i++) {
      if (holds[i].expiresAtMs !== null) return true
    }
    const sfx = Array.from(this.sfx.values())
    for (let i = 0; i < sfx.length; i++) {
      if (sfx[i].expiresAtMs !== null) return true
    }
    return false
  }

  fire(
    eventId: string,
    nowMs: number,
    payload?: PrimitivePayload
  ): FireResult {
    const event = this.events.find((e) => e.id === eventId)
    if (!event) {
      throw new Error(`Event not found: ${eventId}`)
    }
    if (!this.shotId) {
      throw new Error('No shot selected; cannot preview-fire events')
    }

    let matched = 0
    let skippedFilter = 0
    let skippedWrongShot = 0
    let sfxStarted = 0

    for (const binding of this.bindings) {
      if (binding.eventId !== eventId) continue
      if (binding.shotId !== this.shotId) {
        skippedWrongShot += 1
        continue
      }
      if (!payloadMatchesFilter(binding.payloadFilter, payload)) {
        skippedFilter += 1
        continue
      }

      this.generation += 1
      if (binding.action.type === 'playSfx') {
        const stopOnExpiry = binding.durationSec > 0 && binding.returnPolicy === 'default'
        const voice: ActiveEventSfx = {
          bindingId: binding.id,
          eventId: binding.eventId,
          audioId: binding.action.audioId,
          volume:
            binding.action.volume !== undefined && Number.isFinite(binding.action.volume)
              ? Math.max(0, Math.min(1, binding.action.volume))
              : 1,
          generation: this.generation,
          startedAtMs: nowMs,
          expiresAtMs: stopOnExpiry ? nowMs + binding.durationSec * 1000 : null,
          durationSec: binding.durationSec,
          returnPolicy: binding.returnPolicy,
          stopOnExpiry
        }
        this.sfx.set(binding.id, voice)
        sfxStarted += 1
        matched += 1
        continue
      }

      if (!binding.targetLayerId) continue
      const override = overrideFromAction(binding)
      const hold: ActiveEventHold = {
        layerId: binding.targetLayerId,
        bindingId: binding.id,
        eventId: binding.eventId,
        generation: this.generation,
        startedAtMs: nowMs,
        expiresAtMs: expiresAtForBinding(binding, nowMs),
        durationSec: binding.durationSec,
        returnPolicy: binding.returnPolicy,
        override
      }
      this.holds.set(binding.targetLayerId, hold)
      matched += 1
    }

    return {
      eventId,
      eventName: event.name,
      matched,
      skippedFilter,
      skippedWrongShot,
      sfxStarted
    }
  }

  tick(nowMs: number): boolean {
    let changed = false
    const entries = Array.from(this.holds.entries())
    for (let i = 0; i < entries.length; i++) {
      const layerId = entries[i][0]
      const hold = entries[i][1]
      if (hold.expiresAtMs !== null && nowMs >= hold.expiresAtMs) {
        this.holds.delete(layerId)
        changed = true
      }
    }
    const sfxEntries = Array.from(this.sfx.entries())
    for (let i = 0; i < sfxEntries.length; i++) {
      const bindingId = sfxEntries[i][0]
      const voice = sfxEntries[i][1]
      if (voice.expiresAtMs !== null && nowMs >= voice.expiresAtMs) {
        this.sfx.delete(bindingId)
        changed = true
      }
    }
    return changed
  }

  snapshot(): EventPreviewSnapshot {
    const overrides: Record<string, PreviewLayerOverride> = {}
    const holds: ActiveEventHold[] = []
    const current = Array.from(this.holds.values())
    for (let i = 0; i < current.length; i++) {
      const hold = current[i]
      overrides[hold.layerId] = hold.override
      holds.push({ ...hold, override: { ...hold.override } })
    }
    const sfx: ActiveEventSfx[] = []
    const sfxCurrent = Array.from(this.sfx.values())
    for (let i = 0; i < sfxCurrent.length; i++) {
      sfx.push({ ...sfxCurrent[i] })
    }
    return {
      shotId: this.shotId,
      generation: this.generation,
      overrides,
      holds,
      sfx
    }
  }

  effectiveLayer(layer: StoryboardLayer): StoryboardLayer {
    return applyLayerPreview(layer, this.holds.get(layer.id)?.override)
  }

  private clearHolds(): void {
    this.holds.clear()
    this.sfx.clear()
  }
}

export function simulateEventFire(input: {
  events: EventDefinition[]
  bindings: EventBinding[]
  shotId: string
  eventId: string
  nowMs?: number
  tickMs?: number
  payload?: PrimitivePayload
}): { fire: FireResult; snapshot: EventPreviewSnapshot } {
  const engine = new EventPreviewEngine()
  engine.setCatalog(input.events, input.bindings)
  engine.setShot(input.shotId)
  const nowMs = input.nowMs ?? 0
  const fire = engine.fire(input.eventId, nowMs, input.payload)
  if (input.tickMs !== undefined) {
    engine.tick(input.tickMs)
  }
  return { fire, snapshot: engine.snapshot() }
}

export const EMPTY_PREVIEW_SNAPSHOT: EventPreviewSnapshot = emptySnapshot(null, 0)
