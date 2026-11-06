/**
 * Export manifest schema for Adventure Lens Games
 * Version 2.0 - adds storyboard support
 */

export const EXPORT_MANIFEST_SCHEMA_VERSION = 2

export interface ExportManifestPose {
  /** Pose slot (ready, success, hurt, win, defeat) */
  slot: string
  /** Relative path to pose image file in export directory */
  file: string
  /** Image dimensions (must be 1024x1024 for approved poses) */
  width: number
  height: number
  /** Pose status (only 'approved' poses are exported) */
  status: 'approved'
}

export interface ExportManifestCharacter {
  id: string
  name: string
  role: string
  /** Style notes for the character */
  styleNotes?: string
  /** Character tags */
  tags: string[]
  /** Approved poses for this character */
  poses: ExportManifestPose[]
}

export interface ExportManifestClip {
  id: string
  /** Clip moment type */
  moment: 'intro' | 'hit' | 'finisher' | 'defeat' | 'story_beat'
  /** Associated character ID (if any) */
  characterId?: string
  /** Duration in seconds */
  durationSec: number
  /** Relative path to video file in export directory */
  file: string
  /** Relative path to thumbnail image in export directory */
  thumbnail: string
  /** Clip tags */
  tags: string[]
}

export interface ExportManifestPreset {
  id: string
  /** Preset type */
  type: 'versus' | 'zoom_punch' | 'shake' | 'flash' | 'freeze'
  /** Preset parameters (schema varies by type) */
  params: Record<string, unknown>
  /** Preset tags */
  tags: string[]
}

export interface ExportManifestLayer {
  id: string
  zOrder: number
  characterId?: string
  poseId?: string
  poseFile?: string
  clipId?: string
  clipFile?: string
  imagePath?: string
  x: number
  y: number
  scale: number
  rotation: number
  flipX: boolean
  opacity: number
}

export interface ExportManifestCameraKeyframe {
  t: number
  target: string | { x: number; y: number }
  zoom: number
  framingRect?: { x: number; y: number; width: number; height: number }
}

export interface ExportManifestEffectMarker {
  t: number
  moment?: 'intro' | 'hit' | 'finisher' | 'defeat' | 'story_beat'
  presetId?: string
  inlineType?: 'versus' | 'zoom_punch' | 'shake' | 'flash' | 'freeze'
  inlineParams?: Record<string, unknown>
}

export interface ExportManifestClipBlock {
  id: string
  clipId: string
  clipFile?: string
  role: 'layer' | 'background'
  layerId?: string | null
  t: number
  durationSec: number
  sourceInSec: number
  sourceOutSec: number
}

export interface ExportManifestShot {
  id: string
  name: string
  durationSec: number
  aspectRatio: { width: number; height: number }
  backgroundImage?: string
  backgroundClipId?: string
  backgroundVisualAssetId?: string
  backgroundAssetStateId?: string | null
  /** Resolved studio-relative full-resolution image (not thumbnail, not an external source path). */
  backgroundFile?: string
  layers: ExportManifestLayer[]
  cameraTrack: ExportManifestCameraKeyframe[]
  effectsTrack: ExportManifestEffectMarker[]
  clipTrack?: ExportManifestClipBlock[]
  notes?: string
  thumbnail?: string
}

export interface ExportManifestStoryboard {
  id: string
  name: string
  description?: string
  contactSheet?: string
  shots: ExportManifestShot[]
}

export interface ExportManifest {
  /** Schema version for compatibility checking */
  schemaVersion: number
  /** ISO 8601 timestamp when this manifest was exported */
  exportedAt: string
  /** Game information */
  game: {
    id: string
    name: string
    engine: 'unity' | 'godot'
  }
  /** Characters with approved poses */
  characters: ExportManifestCharacter[]
  /** Clips for cutscenes and moments */
  clips: ExportManifestClip[]
  /** Scene and camera presets */
  presets: ExportManifestPreset[]
  /** Storyboards (v2+) */
  storyboards?: ExportManifestStoryboard[]
}

/**
 * Validation result for export readiness
 */
export interface ExportValidation {
  /** Whether the export can proceed */
  canExport: boolean
  /** Warning messages (missing approved poses, etc.) */
  warnings: string[]
  /** Error messages (invalid files, etc.) */
  errors: string[]
  /** Characters with incomplete pose sets */
  incompleteCharacters: Array<{
    id: string
    name: string
    missingSlots: string[]
  }>
}

/**
 * Dry-run result showing what would change
 */
export interface ExportDryRun {
  /** Target export directory */
  targetDir: string
  /** Files that would be copied (with source and destination) */
  filesToCopy: Array<{
    source: string
    destination: string
    reason: 'new' | 'modified' | 'unchanged'
  }>
  /** Manifest path */
  manifestPath: string
  /** Total number of files that would be copied */
  totalFiles: number
  /** Total size in bytes */
  totalSize: number
}
