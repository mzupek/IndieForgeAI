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
  /** Target path for exports (e.g., Unity project path or Godot project path) */
  exportTarget?: string
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
 * Layer in a storyboard shot - can be a character pose, clip, or image
 */
export interface StoryboardLayer {
  id: string
  /** Order in z-stack (higher = closer to camera) */
  zOrder: number
  
  /** Layer content - one of these must be set */
  characterId?: string
  poseId?: string
  clipId?: string
  imagePath?: string
  
  /** Transform in normalized stage coordinates [0,1] */
  x: number
  y: number
  scale: number
  rotation: number
  flipX: boolean
  opacity: number
}

/**
 * Camera keyframe for shot cinematography
 */
export interface CameraKeyframe {
  /** Time in seconds within the shot */
  t: number
  /** Target layer ID or explicit point {x, y} */
  target: string | { x: number; y: number }
  /** Zoom level (1.0 = normal, 2.0 = 2x zoom) */
  zoom: number
  /** Framing rectangle in normalized coordinates */
  framingRect?: { x: number; y: number; width: number; height: number }
}

/**
 * Effect marker for timeline - references preset or inline definition
 */
export interface EffectMarker {
  /** Time in seconds within the shot */
  t: number
  /** Optional clip moment this effect is tied to */
  moment?: ClipMoment
  /** Reference to existing scene preset ID */
  presetId?: string
  /** Or inline effect definition */
  inlineType?: ScenePresetType
  inlineParams?: Record<string, unknown>
}

/**
 * Shot in a storyboard - fixed aspect ratio stage with layers and timeline
 */
export interface StoryboardShot {
  id: string
  /** Display name for shot */
  name: string
  /** Shot duration in seconds */
  durationSec: number
  /** Stage aspect ratio (default 16:9) */
  aspectRatio: { width: number; height: number }
  
  /** Optional background */
  backgroundImage?: string
  backgroundClipId?: string
  
  /** Layers composited on stage */
  layers: StoryboardLayer[]
  
  /** Camera animation track */
  cameraTrack: CameraKeyframe[]
  
  /** Effects timeline */
  effectsTrack: EffectMarker[]
  
  /** Notes for engineer */
  notes?: string
  
  /** Thumbnail path for preview */
  thumbnail?: string
  
  createdAt: string
  updatedAt: string
}

/**
 * Storyboard (scene) - ordered sequence of shots
 */
export interface Storyboard {
  id: string
  gameId: string
  name: string
  description?: string
  /** Ordered list of shot IDs */
  shotIds: string[]
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
  storyboards: Storyboard[]
  storyboardShots: StoryboardShot[]
  exportProfiles: ExportProfile[]
  createdAt: string
  updatedAt: string
}
