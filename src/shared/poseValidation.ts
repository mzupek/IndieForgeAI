/**
 * Shared pose validation logic
 * Reusable by UI (Phase 2) and CLI (Phase 2.5)
 */

import type { Character, Game, Pose } from './types/assetPipeline'
import {
  CORE_POSE_SLOT_KEYS,
  effectivePoseSlotKeys,
  mapFilenameToSlotKey,
  requiredPoseSlots
} from './gameSettings/poseSlots'

/** Built-in five. Custom slots live on game.settings / character.poseSlots. */
export const POSE_SLOTS: string[] = [...CORE_POSE_SLOT_KEYS]

export interface PoseValidationIssue {
  slot: string
  type: 'missing' | 'size' | 'transparency' | 'facing' | 'status'
  message: string
}

export interface CompletenessResult {
  complete: boolean
  issues: PoseValidationIssue[]
}

export interface PoseMetadata {
  width: number
  height: number
  hasAlpha: boolean
  cornersTransparent: boolean
  facing?: 'left' | 'right' | 'front' | 'back'
}

export interface PoseCompletenessOptions {
  game?: Game | null
}

/**
 * Check required pose slots (core five by default; custom only if required: true).
 * Pass game so game-level slots participate. Missing game = core five only
 * (unless character.corePosesRequired === false).
 */
export function checkPoseCompleteness(
  character: Character,
  poses: Pose[],
  poseMetadataMap?: Map<string, PoseMetadata>,
  options?: PoseCompletenessOptions
): CompletenessResult {
  const issues: PoseValidationIssue[] = []
  const characterPoses = poses.filter((p) => p.characterId === character.id)
  const required = requiredPoseSlots(options?.game, character)

  for (const slotDef of required) {
    const slot = slotDef.key
    const pose = characterPoses.find((p) => p.slot === slot)

    if (!pose) {
      issues.push({
        slot,
        type: 'missing',
        message: `${slot} pose is missing`
      })
      continue
    }

    if (pose.status !== 'approved') {
      issues.push({
        slot,
        type: 'status',
        message: `${slot} pose is ${pose.status} (must be approved)`
      })
      continue
    }

    if (poseMetadataMap) {
      const metadata = poseMetadataMap.get(pose.id)
      if (metadata) {
        if (metadata.width !== 1024 || metadata.height !== 1024) {
          issues.push({
            slot,
            type: 'size',
            message: `${slot} pose is ${metadata.width}×${metadata.height} (must be 1024×1024)`
          })
        }

        if (!metadata.hasAlpha || !metadata.cornersTransparent) {
          issues.push({
            slot,
            type: 'transparency',
            message: `${slot} pose lacks transparent background`
          })
        }

        if (character.referenceSheet?.facing && metadata.facing) {
          if (character.referenceSheet.facing !== metadata.facing) {
            issues.push({
              slot,
              type: 'facing',
              message: `${slot} pose faces ${metadata.facing} (character sheet: ${character.referenceSheet.facing})`
            })
          }
        }
      }
    }
  }

  return {
    complete: issues.length === 0,
    issues
  }
}

/**
 * Auto-map pose filename to slot. Longest key first.
 * Without slotKeys, uses the built-in five.
 */
export function mapFilenameToSlot(filename: string, slotKeys?: string[]): string | null {
  return mapFilenameToSlotKey(filename, slotKeys && slotKeys.length > 0 ? slotKeys : CORE_POSE_SLOT_KEYS)
}

/**
 * Group pose imports by slot for batch import
 */
export function groupPosesBySlot(
  files: Array<{ name: string; path: string }>,
  slotKeys?: string[]
): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  const keys = slotKeys && slotKeys.length > 0 ? slotKeys : CORE_POSE_SLOT_KEYS

  for (const file of files) {
    const slot = mapFilenameToSlot(file.name, keys)
    if (slot) {
      if (!groups.has(slot)) {
        groups.set(slot, [])
      }
      groups.get(slot)!.push(file.path)
    }
  }

  return groups
}

export function availableSlotKeysForCharacter(game?: Game | null, character?: Character | null): string[] {
  return effectivePoseSlotKeys(game, character)
}

/**
 * Format validation issues for display
 */
export function formatValidationIssues(issues: PoseValidationIssue[]): string {
  if (issues.length === 0) return 'All checks passed'

  const byType = new Map<string, string[]>()
  for (const issue of issues) {
    const type = issue.type
    if (!byType.has(type)) {
      byType.set(type, [])
    }
    byType.get(type)!.push(issue.message)
  }

  const lines: string[] = []
  if (byType.has('missing')) {
    lines.push(`Missing: ${byType.get('missing')!.length} pose(s)`)
  }
  if (byType.has('status')) {
    lines.push(`Not approved: ${byType.get('status')!.length} pose(s)`)
  }
  if (byType.has('size')) {
    lines.push(`Wrong size: ${byType.get('size')!.length} pose(s)`)
  }
  if (byType.has('transparency')) {
    lines.push(`No transparency: ${byType.get('transparency')!.length} pose(s)`)
  }
  if (byType.has('facing')) {
    lines.push(`Facing mismatch: ${byType.get('facing')!.length} pose(s)`)
  }

  return lines.join(', ')
}
