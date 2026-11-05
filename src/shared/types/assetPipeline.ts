/**
 * Adventure Lens Games Asset Pipeline Data Model
 * Phase 0: Core types for character cards, poses, clips, and per-game exports
 */

export type GameEngine = 'unity' | 'godot'

export type PoseSlot = 'ready' | 'success' | 'hurt' | 'win' | 'defeat'

export type PoseStatus = 'draft' | 'polished' | 'approved'

export type PoseSource = 'import' | 'ai'

export type ClipMoment = 'intro' | 'hit' | 'finisher' | 'defeat' | 'miss' | 'story_beat'

export type ScenePresetType = 'versus' | 'zoom_punch' | 'shake' | 'flash' | 'freeze'

export type GameDefinitionStage = 'MVP' | 'Beta' | 'Testing' | 'Release'

export type MVPBoardItemType = 'asset' | 'system' | 'content' | 'tuning'

export type MVPBoardStatus = 'needed' | 'partial' | 'done' | 'cut'

/**
 * MVP board item for tracking game definition progress
 */
export interface MVPBoardItem {
  id: string
  item: string
  type: MVPBoardItemType
  status: MVPBoardStatus
  notes?: string
}

/**
 * Theme slot for UI/visual customization
 */
export interface ThemeSlot {
  id: string
  name: string
  /** Reference to asset (character, clip, preset) or path */
  reference?: string
  description?: string
}

/**
 * Interaction stub for gameplay mechanics
 */
export interface InteractionStub {
  id: string
  name: string
  description: string
  /** Tagged references to related assets */
  assetRefs: string[]
}

/**
 * Tuning profile for game balance/difficulty
 */
export interface TuningProfile {
  id: string
  name: string
  params: Record<string, number | string | boolean>
  notes?: string
}

/**
 * Resource tag for linking Game Definition to studio assets
 * Format: [[type:id|label]] e.g. [[character:abc-123|Hero]] or [[pose:xyz-789|Hero Ready]]
 * Parseable by agents; human-friendly in markdown
 */
export interface ResourceTag {
  type: 'game' | 'character' | 'pose' | 'clip' | 'preset'
  id: string
  label: string
}

/**
 * Game Definition - living design document for a game
 * Phase B: structured app-owned data with markdown face
 */
export interface GameDefinition {
  id: string
  gameId: string
  stage: GameDefinitionStage
  /** Core design pillars */
  pillars: string[]
  /** Puzzle/gameplay core description */
  puzzleCore: string
  /** Story synopsis */
  storySynopsis: string
  /** Linked cast (character IDs) */
  cast: string[]
  /** Linked assets (pose, clip, preset IDs) */
  linkedAssets: {
    poses: string[]
    clips: string[]
    presets: string[]
  }
  /** Theme/UI slots (splash, home, HUD, buttons, fonts, palette) */
  themeSlots: ThemeSlot[]
  /** Interaction stubs */
  interactions: InteractionStub[]
  /** Tuning profiles */
  tuningProfiles: TuningProfile[]
  /** Keep/cut/invent notes */
  keepCutInvent: {
    keep: string[]
    cut: string[]
    invent: string[]
  }
  /** MVP board rows */
  mvpBoard: MVPBoardItem[]
  /** Markdown source (human-editable bible) */
  markdownSource: string
  createdAt: string
  updatedAt: string
}

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
 * Scene - narrative/gameplay moment with story, cast, and attached storyboard
 * Phase C: Scenes as the spine
 */
export interface Scene {
  id: string
  gameId: string
  name: string
  description?: string
  /** Background description or image reference */
  background?: string
  /** Character IDs in this scene */
  cast: string[]
  /** Story/dialogue text */
  storyText?: string
  /** Pose IDs referenced (for quick lookup) */
  poseRefs: string[]
  /** Clip IDs referenced (for quick lookup) */
  clipRefs: string[]
  /** Audio cue descriptions or references */
  audioRefs: string[]
  /** Interaction hook descriptions */
  interactionHooks: string[]
  /** Attached preset IDs (FX recipes) */
  attachedPresets: string[]
  /** Optional attached storyboard ID */
  storyboardId?: string
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
  
  /** Stage treatment effects applied to background only (Phase C.1) */
  stageTreatment?: {
    /** Darken background: 0 = no effect, 1 = full black */
    bgDim?: number
    /** Vignette darkness toward edges: 0 = none, 1 = strong */
    vignette?: number
  }
  
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
 * Storyboard - ordered sequence of shots, attached to a Scene
 * Phase C: Storyboards hang off scenes (not orphaned)
 */
export interface Storyboard {
  id: string
  gameId: string
  /** Scene this storyboard belongs to (Phase C) */
  sceneId?: string
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
  scenes: Scene[]
  storyboards: Storyboard[]
  storyboardShots: StoryboardShot[]
  exportProfiles: ExportProfile[]
  gameDefinitions: GameDefinition[]
  createdAt: string
  updatedAt: string
}
