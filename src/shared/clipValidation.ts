/**
 * Shared clip validation logic
 * Reusable by UI and CLI
 */

import type { Clip, ClipMoment } from './types/assetPipeline'

export const CLIP_MOMENTS: ClipMoment[] = ['intro', 'hit', 'finisher', 'defeat', 'story_beat']

export interface ClipValidationIssue {
  type: 'duration_short' | 'duration_long'
  message: string
}

/**
 * Validate clip duration
 */
export function validateClipDuration(durationSec: number): ClipValidationIssue[] {
  const issues: ClipValidationIssue[] = []
  
  if (durationSec < 0.5) {
    issues.push({
      type: 'duration_short',
      message: `Clip is ${durationSec.toFixed(2)}s (recommended: 0.5s - 2s)`
    })
  }
  
  if (durationSec > 2.0) {
    issues.push({
      type: 'duration_long',
      message: `Clip is ${durationSec.toFixed(2)}s (recommended: 0.5s - 2s)`
    })
  }
  
  return issues
}

/**
 * Auto-map clip filename to moment
 * Examples:
 *   gate_drone_finisher.mp4 → finisher
 *   hero_intro_v2.mp4 → intro
 *   boss-hit.webm → hit
 */
export function mapFilenameToMoment(filename: string): ClipMoment | null {
  const lower = filename.toLowerCase()
  
  for (const moment of CLIP_MOMENTS) {
    // Match moment as whole word or with separators
    const patterns = [
      new RegExp(`[_-]${moment}[_.-]`, 'i'),  // _intro_, -intro-, _intro.
      new RegExp(`[_-]${moment}$`, 'i'),      // _intro, -intro at end
      new RegExp(`^${moment}[_.-]`, 'i'),     // intro_, intro- at start
      new RegExp(`\\b${moment}\\b`, 'i')      // intro as whole word
    ]
    
    if (patterns.some((pattern) => pattern.test(lower))) {
      return moment
    }
  }
  
  return null
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(0)}ms`
  }
  return `${seconds.toFixed(2)}s`
}

/**
 * Get moment display name
 */
export function getMomentDisplayName(moment: ClipMoment): string {
  const names: Record<ClipMoment, string> = {
    intro: 'Intro',
    hit: 'Hit',
    finisher: 'Finisher',
    defeat: 'Defeat',
    story_beat: 'Story Beat'
  }
  return names[moment]
}
