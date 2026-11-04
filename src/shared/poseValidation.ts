/**
 * Shared pose validation logic
 * Reusable by UI (Phase 2) and CLI (Phase 2.5)
 */

import type { Character, Pose, PoseSlot } from './types/assetPipeline'

export const POSE_SLOTS: PoseSlot[] = ['ready', 'success', 'hurt', 'win', 'defeat']

export interface PoseValidationIssue {
  slot: PoseSlot
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

/**
 * Check if all five pose slots are filled with approved poses
 */
export function checkPoseCompleteness(
  character: Character,
  poses: Pose[],
  poseMetadataMap?: Map<string, PoseMetadata>
): CompletenessResult {
  const issues: PoseValidationIssue[] = []
  const characterPoses = poses.filter((p) => p.characterId === character.id)

  for (const slot of POSE_SLOTS) {
    const pose = characterPoses.find((p) => p.slot === slot)

    // Check if slot is filled
    if (!pose) {
      issues.push({
        slot,
        type: 'missing',
        message: `${slot} pose is missing`
      })
      continue
    }

    // Check if pose is approved
    if (pose.status !== 'approved') {
      issues.push({
        slot,
        type: 'status',
        message: `${slot} pose is ${pose.status} (must be approved)`
      })
      continue
    }

    // Check metadata if available
    if (poseMetadataMap) {
      const metadata = poseMetadataMap.get(pose.id)
      if (metadata) {
        // Check size
        if (metadata.width !== 1024 || metadata.height !== 1024) {
          issues.push({
            slot,
            type: 'size',
            message: `${slot} pose is ${metadata.width}×${metadata.height} (must be 1024×1024)`
          })
        }

        // Check transparency
        if (!metadata.hasAlpha || !metadata.cornersTransparent) {
          issues.push({
            slot,
            type: 'transparency',
            message: `${slot} pose lacks transparent background`
          })
        }

        // Check facing consistency
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
 * Auto-map pose filename to slot
 * Examples:
 *   gate_drone_hurt.png → hurt
 *   hero_success_v2.png → success
 *   character-ready.png → ready
 */
export function mapFilenameToSlot(filename: string): PoseSlot | null {
  const lower = filename.toLowerCase()
  
  for (const slot of POSE_SLOTS) {
    // Match slot name as whole word or with separators
    const patterns = [
      new RegExp(`[_-]${slot}[_.-]`, 'i'),  // _hurt_, -hurt-, _hurt.
      new RegExp(`[_-]${slot}$`, 'i'),      // _hurt, -hurt at end
      new RegExp(`^${slot}[_.-]`, 'i'),     // hurt_, hurt- at start
      new RegExp(`\\b${slot}\\b`, 'i')      // hurt as whole word
    ]
    
    if (patterns.some((pattern) => pattern.test(lower))) {
      return slot
    }
  }
  
  return null
}

/**
 * Group pose imports by slot for batch import
 */
export function groupPosesBySlot(files: Array<{ name: string; path: string }>): Map<PoseSlot, string[]> {
  const groups = new Map<PoseSlot, string[]>()
  
  for (const file of files) {
    const slot = mapFilenameToSlot(file.name)
    if (slot) {
      if (!groups.has(slot)) {
        groups.set(slot, [])
      }
      groups.get(slot)!.push(file.path)
    }
  }
  
  return groups
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
