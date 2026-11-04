/**
 * Adventure Lens Games Asset Pipeline Data Model
 * Phase 0: Core types for character cards, poses, clips, and per-game exports
 */

export type GameEngine = 'unity' | 'godot'

export type PoseSlot = 'ready' | 'success' | 'hurt' | 'win' | 'defeat'

export type PoseStatus = 'draft' | 'polished' | 'approved'

export type PoseSource = 'import' | 'ai'

export type ClipMoment = 'intro' | 'hit' | 'finisher' | 'defeat' | 'story_beat'

export type ScenePresetType = 'versus' | 'zoom_punch' | 'shake' | 'flash' | 'freeze'

/**
 * Character reference sheet metadata for style consistency
 */
export interface CharacterReferenceSheet {
  palette?: string
  outlineStyle?: string
  facing?: string
  canvasSize?: { width: number; height: number }
}

/**
 * Game project - top-level entity for a Unity or Godot game
 */
export interface Game {
  id: string
  name: string
  engine: GameEngine
  /** Root directory for exports (relative or absolute) */
  exportRoot: string
  createdAt: string
  updatedAt: string
}

/**
 * Character entity - links to a game and holds role/style info
 */
export interface Character {
  id: string
  gameId: string
  name: string
  /** Character role (e.g. 'player', 'boss', 'npc') */
  role: string
  /** Style notes for generation or documentation */
  styleNotes?: string
  /** Reference image path for character appearance */
  referenceImage?: string
  /** Reference sheet metadata for style consistency */
  referenceSheet?: CharacterReferenceSheet
  /** Tags for library/search */
  tags: string[]
  /** Thumbnail path for library preview */
  thumbnail?: string
  createdAt: string
  updatedAt: string
}

/**
 * Pose - a single 1024x1024 transparent PNG for a character
 */
export interface Pose {
  id: string
  characterId: string
  slot: PoseSlot
  /** Path to 1024x1024 transparent PNG file */
  file: string
  /** Status: imported poses default to 'approved' */
  status: PoseStatus
  /** Source of the pose (optional) */
  source?: PoseSource
  createdAt: string
  updatedAt: string
}

/**
 * Clip - video clip (mp4/webm) for a character or scene moment
 */
export interface Clip {
  id: string
  /** Optional - clips can be character-specific or general */
  characterId?: string
  moment: ClipMoment
  /** Path to mp4 or webm file */
  file: string
  /** Duration in seconds */
  durationSec: number
  /** Tags for library/search */
  tags: string[]
  /** Thumbnail path for library preview */
  thumbnail?: string
  createdAt: string
  updatedAt: string
}

/**
 * Scene preset - camera/effect presets for scenes
 */
export interface ScenePreset {
  id: string
  type: ScenePresetType
  /** Arbitrary JSON params for the preset */
  params: Record<string, unknown>
  /** Tags for library/search */
  tags: string[]
  /** Thumbnail path for library preview */
  thumbnail?: string
  createdAt: string
  updatedAt: string
}

/**
 * Export profile - defines how to export assets for a specific game
 */
export interface ExportProfile {
  id: string
  gameId: string
  /** Root path for this export profile */
  rootPath: string
  /** Naming rules (e.g. character name format, pose naming conventions) */
  namingRules: {
    characterFormat?: string
    poseFormat?: string
    clipFormat?: string
  }
  createdAt: string
  updatedAt: string
}

/**
 * Main project structure for Adventure Lens Games pipeline
 * This extends/replaces the old IndieForgeProject structure
 */
export interface AssetPipelineProject {
  schemaVersion: 1
  id: string
  name: string
  description: string
  games: Game[]
  characters: Character[]
  poses: Pose[]
  clips: Clip[]
  scenePresets: ScenePreset[]
  exportProfiles: ExportProfile[]
  createdAt: string
  updatedAt: string
}
