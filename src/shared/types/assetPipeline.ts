/**
 * Adventure Lens Games Asset Pipeline Data Model
 * Phase 0: Core types for character cards, poses, clips, and per-game exports
 */

export type GameEngine = 'unity' | 'godot'

/** Built-in pose slots. Custom slots are free-form slugs on game.settings / character. */
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
 * Per-game lists (schema v2). Same shape for every game; values are data, not code.
 * Step 1a groundwork: migration fills empty lists. Pose slots / categories land in 1b;
 * encounter modules in 1c. Default encounterTypes are the generic four.
 */
export interface GamePoseSlotDef {
  key: string
  label: string
  group?: string
  required?: boolean
}

export interface GameAssetCategoryDef {
  key: string
  label: string
  /** Built-in this custom category behaves like (e.g. background). */
  base?: string
}

export interface ModuleKindParamDef {
  key: string
  type: 'number'
  min?: number
  max?: number
}

export type ModuleParamType = 'int' | 'float' | 'bool' | 'enum' | 'string'

/** 2d: expected tuning params for an encounter module. Optional; default empty. */
export interface ModuleParamSpec {
  key: string
  type: ModuleParamType
  min?: number
  max?: number
  options?: string[]
  default?: number | string | boolean
  required?: boolean
}

export interface ModuleAttackKind {
  key: string
  label: string
  params?: ModuleKindParamDef[]
}

export interface ModuleCounterKind {
  key: string
  label: string
}

export interface GameEncounterModule {
  id: string
  label: string
  typeIds: string[]
  starKinds?: string[]
  /** 2a: allowed enemy win-condition kinds for this module (data, not code). */
  winConditions?: string[]
  /** 2b: allowed attack row kinds for this module (data, not code). */
  attackKinds?: ModuleAttackKind[]
  /** 2b: allowed counter kinds for attack rows (data, not code). */
  counterKinds?: ModuleCounterKind[]
  /** 2d: expected tuning params for this module. Optional; default empty. */
  paramSpecs?: ModuleParamSpec[]
}

export interface GameSettings {
  poseSlots: GamePoseSlotDef[]
  assetCategories: GameAssetCategoryDef[]
  encounterTypes: string[]
  modules: GameEncounterModule[]
}

/**
 * Game project - top-level entity for a Unity or Godot game
 */
export interface Game {
  id: string
  /** Optional slug, unique per studio games list. Never backfilled. */
  key?: string
  name: string
  engine: GameEngine
  /** Root directory for exports (relative or absolute) */
  exportRoot: string
  /** Target path for exports (e.g., Unity project path or Godot project path) */
  exportTarget?: string
  /** Per-game lists. Present after schema v2 migrate; optional on v1 disk. */
  settings?: GameSettings
  createdAt: string
  updatedAt: string
}

/**
 * Character entity - links to a game and holds role/style info
 */
export interface Character {
  id: string
  gameId: string
  /** Optional slug, unique per game. Never backfilled. */
  key?: string
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
  /** Extra pose slots for this character (on top of built-ins + game.settings.poseSlots). */
  poseSlots?: GamePoseSlotDef[]
  /**
   * When false, the built-in five are not required for completeness (portrait-only NPC).
   * Missing means true.
   */
  corePosesRequired?: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Pose - a single 1024x1024 transparent PNG for a character
 */
export interface Pose {
  id: string
  characterId: string
  /** Built-in or custom slot key. Validated against the character's effective slots. */
  slot: string
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
  /** Optional slug, unique per game. Never backfilled. */
  key?: string
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
  
  /** P2: Visual asset references */
  visualAssetId?: string
  /** P2: Asset state ID (null = use asset's default state, undefined = no asset) */
  assetStateId?: string | null
  
  /** P2: Text content */
  text?: string
  /** P2: Font reference (Font id, Game Definition themeSlot id, or "default") */
  fontRef?: string
  /** P2: Palette reference (Palette id, Game Definition themeSlot id, or "default") */
  paletteRef?: string
  
  /** P2: Visibility flag (editor eye). Independent of timed presence. */
  visible: boolean

  /**
   * Timed presence on the shot, half-open
   * `[visibleFromSec ?? 0, visibleToSec ?? duration)`.
   * Omit both = whole shot. Eye (`visible`) is editor hide; this is how long
   * the asset is on stage during scrub/play.
   */
  visibleFromSec?: number
  visibleToSec?: number
  
  /** Transform in normalized stage coordinates [0,1] */
  x: number
  y: number
  scale: number
  rotation: number
  flipX: boolean
  opacity: number
  
  /**
   * P4: Timed pose/state keys on THIS layer (step/hold).
   * Authored poseId/assetStateId remain the default; keys never write those fields.
   * Not C.3c per-layer FX keys.
   */
  timedKeys?: LayerTimedKey[]

  /** Layer effects (Phase C.2) */
  fx?: {
    dropShadow?: {
      offsetX: number
      offsetY: number
      blur: number
      color: string
      alpha: number
    }
    outerGlow?: {
      blur: number
      color: string
      alpha: number
      strength?: number
    }
  }
}

/** P4: One pose or state change at a time on a layer timeline. */
export type LayerTimedKeyAction =
  | { type: 'setPose'; poseId: string }
  | { type: 'setState'; stateId: string }

/**
 * P4: Timed pose/state key on a single shot layer.
 * Step/hold: the latest key with t <= playhead holds until the next key.
 */
export interface LayerTimedKey {
  id: string
  t: number
  action: LayerTimedKeyAction
  schemaVersion: 1
}

/** P3: After a timed event action, return to authored default or hold the override. */
export type EventReturnPolicy = 'default' | 'hold'

export type EventBindingAction =
  | { type: 'setPose'; poseId: string }
  | { type: 'setState'; stateId: string }
  | { type: 'setVisibility'; visible: boolean }
  | { type: 'setText'; text: string }
  | { type: 'playSfx'; audioId: string; volume?: number }

export interface EventPayloadSchema {
  type: 'object'
  properties: Record<string, 'string' | 'number' | 'boolean'>
}

/**
 * P3: Named game event the engine may fire (hit_received, etc.).
 * Forge authors and preview-simulates responses; Unity/Godot detect real hits.
 */
export interface EventDefinition {
  id: string
  gameId: string
  /** Optional slug, unique per game. Never backfilled. */
  key?: string
  name: string
  description?: string
  payloadSchema?: EventPayloadSchema
  schemaVersion: 1
  createdAt: string
  updatedAt: string
}

/**
 * P3/A3: Shot binding: event → layer action and/or playSfx.
 * Layer actions require targetLayerId. playSfx does not (not tied to timed keys).
 * Authored defaults / audioTrack are never written by preview.
 */
export interface EventBinding {
  id: string
  shotId: string
  eventId: string
  /** Required for pose/state/text/visibility. Omit for playSfx. */
  targetLayerId?: string
  action: EventBindingAction
  payloadFilter?: Record<string, string | number | boolean>
  /**
   * Layer holds: 0 = instant (until reset); >0 + default returns at expiry.
   * playSfx: 0 = play file once to completion unless reset/stop/shot change;
   * >0 + default stops the voice at expiry; hold plays until completion/reset/stop.
   * Event SFX never loops.
   */
  durationSec: number
  returnPolicy: EventReturnPolicy
  schemaVersion: 1
  createdAt: string
  updatedAt: string
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
 * Timed clip block on a shot timeline (not an instantaneous key).
 * Plays source [sourceInSec, sourceOutSec) at shot time [t, t+durationSec).
 * durationSec must equal sourceOutSec - sourceInSec (1x, no stretch).
 * Not C.3c FX keys. Engine importers are unchanged.
 */
export type ClipBlockRole = 'layer' | 'background'

export interface ShotClipBlock {
  id: string
  clipId: string
  role: ClipBlockRole
  /** Required when role is layer: the clip layer that supplies transform/z-order */
  layerId?: string | null
  /** Shot time when the block starts */
  t: number
  /** Visible duration on the shot (seconds) */
  durationSec: number
  /** Inclusive source trim start (seconds) */
  sourceInSec: number
  /** Exclusive source trim end (seconds) */
  sourceOutSec: number
  schemaVersion: 1
}

/**
 * Timed audio block on a shot timeline (A2).
 * Half-open [t, t+duration). Non-loop 1x duration equals sourceOut-sourceIn.
 * Loop wraps the trim window so authored duration may be longer than trim.
 * Music overlap rejected (one bed). SFX overlap allowed.
 * Fit-to-shot clamps this block to the current shot end; library media is unchanged.
 * Shot duration is user-entered (no previous-length history).
 */
export type AudioBlockRole = 'music' | 'sfx'

export interface ShotAudioBlock {
  id: string
  audioId: string
  role: AudioBlockRole
  /** Shot time when the block starts */
  t: number
  /** Audible duration on the shot (seconds) */
  durationSec: number
  /** Inclusive source trim start (seconds) */
  sourceInSec: number
  /** Exclusive source trim end (seconds) */
  sourceOutSec: number
  loop: boolean
  /** Linear gain 0–1 */
  volume: number
  fadeInSec: number
  fadeOutSec: number
  schemaVersion: 1
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
  /**
   * Library visual asset used as the static shot background (selected Game).
   * Full-resolution `asset.image` / default or explicit `state.file` — not thumbnail.
   */
  backgroundVisualAssetId?: string
  /** Explicit AssetState for `backgroundVisualAssetId`. Omit/null = default or static image. */
  backgroundAssetStateId?: string | null

  /**
   * Timed still-background keys. Step/hold: last key with t <= playhead holds
   * until the next. Before the first key, the static background fields apply.
   * Clip-track background blocks still draw over stills while active.
   */
  backgroundKeys?: ShotBackgroundKey[]
  
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

  /**
   * Timed clip blocks (range bars). Legacy `backgroundClipId` and `layer.clipId`
   * without a block still play as implicit [0, min(clip, shot)) during preview.
   */
  clipTrack?: ShotClipBlock[]

  /**
   * Timed audio blocks (A2). Music/SFX range bars on the shot.
   * Playback uses HTMLAudioElement.play()/pause() (paused currentTime seeks stay silent).
   */
  audioTrack?: ShotAudioBlock[]

  /**
   * Authored one-shot event cues. Independent of P4 pose/state keys.
   * Timeline Play fires each cue once per forward-play crossing of `t`.
   */
  eventCues?: ShotEventCue[]
  
  /** Notes for engineer */
  notes?: string
  
  /** Thumbnail path for preview */
  thumbnail?: string
  
  createdAt: string
  updatedAt: string
}

export interface ShotEventCue {
  id: string
  /** Shot time (seconds) when Play should fire this named event */
  t: number
  eventId: string
  schemaVersion: 1
}

/**
 * One still-background cut on the shot. Complete still (Library asset+optional
 * state, or direct image) — not a partial patch of the static fields.
 * Hard cut; holds until the next key.
 */
export interface ShotBackgroundKey {
  id: string
  t: number
  backgroundVisualAssetId?: string
  backgroundAssetStateId?: string | null
  backgroundImage?: string
  schemaVersion: 1
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
 * P2: Font definition
 */
export interface Font {
  id: string
  /** Game this font belongs to (required for selected-Game scoping) */
  gameId: string
  name: string
  family: string
  /** System fallback family when `family` is unavailable */
  fallback?: string
  weight?: string
  style?: string
  source: 'system' | 'custom'
  file?: string
  schemaVersion: 1
  createdAt: string
  updatedAt: string
}

/**
 * P2: Color palette definition
 */
export interface Palette {
  id: string
  /** Game this palette belongs to (required for selected-Game scoping) */
  gameId: string
  name: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  schemaVersion: 1
  createdAt: string
  updatedAt: string
}

/**
 * Game-scoped imported audio (A1 catalog).
 * Playback mixer is A2 (must use HTMLAudioElement.play()/pause() or AudioContext;
 * paused currentTime seeks do not produce sound). Event SFX is A3.
 */
export type AudioKind = 'music' | 'sfx'

export interface AudioAsset {
  id: string
  gameId: string
  name: string
  kind: AudioKind
  tags: string[]
  /** Studio-owned copy of the imported file (not the original source path). */
  file: string
  /** Probed duration in seconds. */
  durationSec: number
  /** Optional mapping note for existing engine clips. Not a playable substitute. */
  engineNotes?: string
  schemaVersion: 1
  createdAt: string
  updatedAt: string
}

/**
 * Visual asset - generic reusable art asset with optional states
 * Distinct from character poses (which remain import-only 1024 PNGs)
 * P1: Generic visual assets (logos, symbols, items, weapons, props)
 */
export interface VisualAsset {
  id: string
  gameId: string
  /** Optional slug, unique per game. Never backfilled. */
  key?: string
  name: string
  /** Built-in or per-game category key. */
  category: string
  /** Tags for library search */
  tags: string[]
  /** Default state ID (null if single-state / static asset) */
  defaultStateId: string | null
  /** Full-size static image path (single-state assets; no dummy AssetState required) */
  image?: string
  /** Thumbnail path for library preview */
  thumbnail?: string
  /** Full-resolution source pixels (not the 256² library thumbnail). */
  pixelSize?: { width: number; height: number }
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/**
 * Asset state - named variation of a visual asset
 * Examples: crate "open"/"closed", weapon "ready"/"firing"
 * P1: Multi-state asset support
 */
export interface AssetState {
  id: string
  assetId: string
  name: string
  /** Path to image file (PNG with transparency) */
  file: string
  /** Full-resolution source pixels (not the 256² library thumbnail). */
  boundingBox?: { width: number; height: number }
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/**
 * World / Stage / Encounter / Region — schema v2 (1c records, 1d map fields optional).
 * Positions are 0..1 of the background image. Same shape in every game.
 */
export interface WorldMapNode {
  id: string
  stageId: string
  pos: [number, number]
  label?: string
  /** Secret until unlocked. Shown greyed in the editor unless hidden. */
  hidden?: boolean
}

export interface WorldMapPath {
  id: string
  from: string
  to: string
  /** Drawing only. */
  waypoints?: [number, number][]
}

export interface WorldMap {
  backgroundAssetId: string
  nodes: WorldMapNode[]
  paths: WorldMapPath[]
  startNodeId?: string
}

export interface World {
  id: string
  gameId: string
  key?: string
  name: string
  description?: string
  order: number
  /** Optional overworld node map. Missing means no map (1c data stays valid). */
  map?: WorldMap
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export interface Stage {
  id: string
  gameId: string
  worldId: string
  key?: string
  name: string
  order: number
  recommendedLevel?: number
  optional?: boolean
  /** Stages in this world that must be cleared first. No cycles. */
  unlockAfter?: string[]
  /** Encounters in this stage. Default: every hotspot-linked encounter. */
  clearedBy?: string[]
  entryRegionId?: string
  /** Defaults to the entry region's spawn. */
  entryAnchor?: string
  /** Node on this world's map. Defaults to the stage's own node. */
  returnToNode?: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export interface EncounterStar {
  id: string
  label: string
  kind: string
  params?: Record<string, string | number | boolean>
}

/** First entry is the lead enemy. attackTableId is an optional per-link override. */
export interface EncounterEnemyLink {
  enemyId: string
  attackTableId?: string
}

export interface Encounter {
  id: string
  gameId: string
  stageId: string
  key?: string
  name: string
  typeId: string
  moduleId: string
  sceneId?: string
  tuningProfileId?: string
  /** Empty / omitted = player's choice at runtime. */
  difficultyProfileId?: string
  /** Optional. Default empty. First entry is the lead. */
  enemies?: EncounterEnemyLink[]
  recommendedLevel?: number
  stars: EncounterStar[]
  order: number
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/**
 * Per-game difficulty profile. Optional; empty Encounter.difficultyProfileId
 * means the player picks at runtime.
 */
export interface DifficultyProfile {
  id: string
  gameId: string
  key?: string
  name: string
  heroHpMultiplier: number
  playbackSpeed: number
  attackWeightScale: number
  hintCharges: number
  notes?: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export interface RegionAnchor {
  id: string
  pos: [number, number]
}

export interface RegionHotspot {
  id: string
  anchor: string
  prompt: string
  triggerId?: string
  /** Encounter in the same stage. Regions with no stage cannot set this. */
  encounterId?: string
}

export interface RegionExit {
  id: string
  anchor: string
  /** Either toRegionId or toWorldMap: true, never both. */
  toRegionId?: string
  toAnchor?: string
  toWorldMap?: boolean
}

export type RegionEdge = [string, string] | { from: string; to: string; requires?: string; hint?: string }

/** Built-in battle moments. Missing mappings fall back to the character's ready slot. */
export const BATTLE_MOMENTS = ['idle', 'telegraph', 'attack', 'hit', 'defeat', 'win'] as const
export type BattleMoment = (typeof BATTLE_MOMENTS)[number]

export interface EnemyWinCondition {
  kind: string
  params: Record<string, number>
}

export interface EnemyAssetRef {
  role: string
  assetId: string
  states?: string[]
}

/**
 * Game-level enemy: wraps a Character with still poses, a module win condition, and stats.
 * Reused by any number of encounters (links land in 2c). Still poses only; no rigs.
 */
export interface Enemy {
  id: string
  gameId: string
  key?: string
  name: string
  characterId: string
  moduleId: string
  winCondition: EnemyWinCondition
  stats: Record<string, number>
  /** Battle moment -> a pose slot of the character (core, game, or character). */
  poses: Partial<Record<BattleMoment, string>>
  /** 2b: attack table in this game with the same module. */
  attackTableId?: string
  assets?: EnemyAssetRef[]
  notes?: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export type AttackSelection = 'weighted' | 'sequence'
export type AttackReveal = 'roundStart'
export type AttackCounterResult = 'cancel' | 'halve'

export interface AttackRowCounter {
  kind: string
  result: AttackCounterResult
}

/** Record-local slug row on an attack table. */
export interface AttackRow {
  id: string
  label: string
  telegraph: string
  kind: string
  params?: Record<string, number>
  damage?: number
  weight: number
  minRound?: number
  maxRound?: number
  counter?: AttackRowCounter
  /** Pose slot on the linked enemy's character. */
  poseSlot?: string
  /** Pose slot on the hero (core + game slots). */
  heroPoseSlot?: string
  cueEventId?: string
  sfxAudioId?: string
}

/**
 * Game-level attack table: rows an enemy picks from between puzzle rounds.
 * Linked from Enemy.attackTableId. Still data only; no scripts.
 */
export interface AttackTable {
  id: string
  gameId: string
  key?: string
  name: string
  moduleId: string
  selection: AttackSelection
  noRepeatInARow: boolean
  reveal: AttackReveal
  skipFinalRound: boolean
  rows: AttackRow[]
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export interface Region {
  id: string
  gameId: string
  stageId?: string
  key?: string
  name: string
  backgroundAssetId: string
  anchors: RegionAnchor[]
  edges: RegionEdge[]
  spawn: string
  hotspots: RegionHotspot[]
  exits: RegionExit[]
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/**
 * Main project structure for Adventure Lens Games pipeline
 * This extends/replaces the old IndieForgeProject structure
 */
export interface AssetPipelineProject {
  /** Studio pipeline schema. 1 = current disk until migrate; 2 = Step 1a+. */
  schemaVersion: number
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
  /** P1: Generic visual assets */
  visualAssets: VisualAsset[]
  /** P1: Asset states for multi-state assets */
  assetStates: AssetState[]
  /** P2: Fonts for text layers */
  fonts: Font[]
  /** P2: Color palettes for text layers */
  palettes: Palette[]
  /** P3: Game-scoped event definitions */
  eventDefinitions: EventDefinition[]
  /** P3: Shot-scoped event → layer bindings */
  eventBindings: EventBinding[]
  /** A1: Game-scoped imported audio catalog */
  audioAssets: AudioAsset[]
  /** Schema v2: worlds / stages / encounters / regions. Optional on v1 disk. */
  worlds?: World[]
  stages?: Stage[]
  encounters?: Encounter[]
  regions?: Region[]
  /** 2a: game-level enemy records. Optional on disk; filled in memory when missing. */
  enemies?: Enemy[]
  /** 2b: game-level attack tables. Optional on disk; filled in memory when missing. */
  attackTables?: AttackTable[]
  /** 2c: per-game difficulty profiles. Optional on disk; filled in memory when missing. */
  difficultyProfiles?: DifficultyProfile[]
  createdAt: string
  updatedAt: string
}
