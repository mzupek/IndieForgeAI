/**
 * Layered pose slots: built-in core + game.settings.poseSlots + character.poseSlots.
 * Game-agnostic: no title-specific keys live here.
 */

import type { Character, Game, GamePoseSlotDef } from '../types/assetPipeline'
import { assertLabel, assertSettingsKey } from './keys'

export type PoseSlotLayer = 'core' | 'game' | 'character'

export interface EffectivePoseSlot extends GamePoseSlotDef {
  layer: PoseSlotLayer
}

export const CORE_POSE_SLOTS: EffectivePoseSlot[] = [
  { key: 'ready', label: 'Ready', required: true, layer: 'core' },
  { key: 'success', label: 'Success', required: true, layer: 'core' },
  { key: 'hurt', label: 'Hurt', required: true, layer: 'core' },
  { key: 'win', label: 'Win', required: true, layer: 'core' },
  { key: 'defeat', label: 'Defeat', required: true, layer: 'core' }
]

export const CORE_POSE_SLOT_KEYS: string[] = CORE_POSE_SLOTS.map((s) => s.key)

export function isCorePoseSlot(key: string): boolean {
  return CORE_POSE_SLOT_KEYS.includes(key)
}

export function gamePoseSlotDefs(game: Game | undefined | null): GamePoseSlotDef[] {
  return Array.isArray(game?.settings?.poseSlots) ? game!.settings!.poseSlots : []
}

export function characterPoseSlotDefs(character: Character | undefined | null): GamePoseSlotDef[] {
  return Array.isArray(character?.poseSlots) ? character!.poseSlots : []
}

/**
 * Built-ins first, then game, then character. Duplicate keys keep the earlier layer.
 */
export function effectivePoseSlots(
  game?: Game | null,
  character?: Character | null
): EffectivePoseSlot[] {
  const seen = new Set<string>()
  const out: EffectivePoseSlot[] = []

  const push = (def: GamePoseSlotDef, layer: PoseSlotLayer) => {
    const key = String(def.key || '').trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({
      key,
      label: def.label || key,
      group: def.group,
      required: def.required,
      layer
    })
  }

  for (const slot of CORE_POSE_SLOTS) push(slot, 'core')
  for (const slot of gamePoseSlotDefs(game)) push(slot, 'game')
  for (const slot of characterPoseSlotDefs(character)) push(slot, 'character')
  return out
}

export function effectivePoseSlotKeys(game?: Game | null, character?: Character | null): string[] {
  return effectivePoseSlots(game, character).map((s) => s.key)
}

/**
 * Completeness required slots:
 * - Core five unless character.corePosesRequired === false
 * - Custom slots only when required: true
 */
export function requiredPoseSlots(
  game?: Game | null,
  character?: Character | null
): EffectivePoseSlot[] {
  const coreRequired = character?.corePosesRequired !== false
  return effectivePoseSlots(game, character).filter((slot) => {
    if (slot.layer === 'core') return coreRequired
    return slot.required === true
  })
}

export function isKnownPoseSlot(
  key: string,
  game?: Game | null,
  character?: Character | null
): boolean {
  const normalized = String(key || '').trim().toLowerCase()
  return effectivePoseSlotKeys(game, character).includes(normalized)
}

export function assertKnownPoseSlot(
  key: string,
  game?: Game | null,
  character?: Character | null
): string {
  const normalized = assertSettingsKey(key, 'Pose slot')
  if (!isKnownPoseSlot(normalized, game, character)) {
    const available = effectivePoseSlotKeys(game, character).join(', ')
    throw new Error(`Unknown pose slot '${key}'. Available slots: ${available}`)
  }
  return normalized
}

export function occupiedPoseSlotKeys(
  game?: Game | null,
  character?: Character | null
): Set<string> {
  return new Set(effectivePoseSlotKeys(game, character))
}

export function assertAddablePoseSlotKey(
  key: string,
  occupied: Set<string>,
  kind: string
): string {
  const normalized = assertSettingsKey(key, kind)
  if (occupied.has(normalized)) {
    throw new Error(`${kind} '${normalized}' already exists (built-in, game, or character)`)
  }
  return normalized
}

export function normalizePoseSlotDef(input: {
  key: string
  label: string
  group?: string
  required?: boolean
}): GamePoseSlotDef {
  const key = assertSettingsKey(input.key, 'Pose slot')
  const label = assertLabel(input.label, 'Pose slot')
  const def: GamePoseSlotDef = { key, label }
  if (input.group && input.group.trim()) def.group = input.group.trim()
  if (input.required) def.required = true
  return def
}

/**
 * Longest key first so a longer slug is not stolen by a prefix of itself.
 */
export function mapFilenameToSlotKey(filename: string, slotKeys: string[]): string | null {
  const lower = filename.toLowerCase()
  const sorted = [...slotKeys].sort((a, b) => b.length - a.length)

  for (const slot of sorted) {
    const patterns = [
      new RegExp(`[_-]${slot}[_.-]`, 'i'),
      new RegExp(`[_-]${slot}$`, 'i'),
      new RegExp(`^${slot}[_.-]`, 'i'),
      new RegExp(`\\b${slot}\\b`, 'i')
    ]
    if (patterns.some((pattern) => pattern.test(lower))) {
      return slot
    }
  }
  return null
}
