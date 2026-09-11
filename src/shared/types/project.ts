export type SceneStatus = 'planned' | 'in_progress' | 'complete'

export type GameEngine = 'godot' | 'unity'

export type CraftPath = 'pixel_silhouette' | 'engine_materials'

export type AssetMedium =
  | 'pixel_sprite'
  | 'sprite_sheet'
  | 'engine_material'
  | 'vfx_graph'
  | 'audio'
  | 'doc_only'

export type CraftStage =
  | 'planned'
  | 'guide'
  | 'silhouette'
  | 'colored'
  | 'animated'
  | 'engine_ready'
  | 'done'

export type ProductionOwner = 'human' | 'indie_forge' | 'cursor_agent'

export interface ProductionStep {
  id: string
  title: string
  description: string
  tool: string
  owner: ProductionOwner
  cursorPrompt?: string
  done?: boolean
}

export interface ProductionPlan {
  updatedAt: string
  steps: ProductionStep[]
}

export interface ExportSpriteSize {
  width: number
  height: number
}

export interface ProjectStyleGuide {
  artStyle: string
  perspective: 'top_down' | 'side_view' | 'isometric' | 'ui_only' | string
  colorPalette?: string
  /** Full-size working resolution for review and iteration */
  designSpriteWidth?: number
  designSpriteHeight?: number
  /** Target in-game / engine export size (you choose — 32 for retro pixel art, 128–512 for larger sprites) */
  defaultSpriteWidth: number
  defaultSpriteHeight: number
  defaultBackgroundWidth: number
  defaultBackgroundHeight: number
  notes: string
}

export type StyleReferenceRole = 'logo' | 'mood' | 'character' | 'ui' | 'background' | 'other'

export interface StyleReferenceAnalysis {
  summary: string
  colorPalette: string
  artStyleNotes: string
  generationGuidance: string
  dosAndDonts: string
}

export interface StyleReference {
  id: string
  name: string
  role: StyleReferenceRole
  filePath: string
  analysis?: StyleReferenceAnalysis
  analyzedAt?: string
  createdAt: string
}

/** Real-world or reference photos attached to a specific asset (pose, angle, composition) */
export interface AssetInspirationAnalysis {
  summary: string
  poseDescription: string
  cameraAngle: string
  compositionNotes: string
  generationGuidance: string
}

export interface AssetInspiration {
  id: string
  name: string
  filePath: string
  notes?: string
  analysis?: AssetInspirationAnalysis
  analyzedAt?: string
  createdAt: string
}

export interface DesignerSuggestions {
  styleGuideUpdates?: Partial<ProjectStyleGuide>
  assetPrompt?: string
  assetId?: string
  /** Short tweak instructions when refining an existing image */
  refinementPrompt?: string
  /** What the app should do after this reply */
  action?: 'generate' | 'refine' | 'none'
  /** Animation: which frame index to generate or refine (0-based) */
  targetFrameIndex?: number
  /** Animation: generate all frames in sequence after frame 0 is approved */
  generateAllFrames?: boolean
  /** Animation: total frames for this clip */
  totalFrames?: number
}

export interface DesignerChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  suggestions?: DesignerSuggestions
  /** Set when this turn triggered a generation */
  generationStatus?: 'generated' | 'failed'
}

export interface DesignerChatResponse {
  project: IndieForgeProject
  assistantMessage: DesignerChatMessage
}

/** Normalized scene-relative rectangle (0–1). */
export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export type AssetRole =
  | 'scene_background'
  | 'scene_foreground'
  | 'playable_character'
  | 'npc'
  | 'interactive_object'
  | 'environment_prop'
  | 'visual_effect'
  | 'gameplay_overlay'
  | 'hud_element'
  | 'menu_element'
  | 'audio_cue'
  | 'music_loop'
  | 'voice_line'

export type AssetFormat =
  | 'static_image'
  | 'frame_animation'
  | 'sprite_sheet'
  | 'layered_background'
  | 'tile_set'
  | 'nine_slice'
  | 'audio_clip'
  | 'music_track'

export type AnchorPoint =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'center_left'
  | 'center'
  | 'center_right'
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right'

export type SlotStatus = 'missing' | 'draft' | 'approved' | 'exported'

export interface AssetContract {
  id: string
  name: string
  role: AssetRole
  format: AssetFormat
  canvas: { width: number; height: number }
  transparent: boolean
  placement?: {
    anchor: AnchorPoint
    pivotX: number
    pivotY: number
    defaultScale: number
    layer: number
  }
  animation?: {
    frameCount: number
    frameDurationMs: number
    loop: boolean
    keyPoses?: string[]
  }
  export: {
    target: 'unity' | 'godot' | 'generic'
    pixelsPerUnit?: number
    filtering: 'nearest' | 'linear'
    compression: 'none' | 'lossless' | 'platform_default'
  }
}

export interface AssetSlot {
  id: string
  name: string
  role: AssetRole
  format: AssetFormat
  bounds: NormalizedRect
  anchor: AnchorPoint
  layer: number
  contract: AssetContract
  assetId?: string
  status: SlotStatus
  /**
   * Other project asset IDs whose images should be used as visual style references
   * when generating this slot (e.g. generate pitcher matching batter/umpire art).
   */
  styleFromAssetIds?: string[]
}

export type SceneReferenceRole = 'composition' | 'camera' | 'mood' | 'other'

/** Screenshot / mood / layout references attached to a scene (not the logo style pack). */
export interface SceneReference {
  id: string
  name: string
  filePath: string
  role: SceneReferenceRole
  notes?: string
  createdAt: string
}

export interface SceneLayer {
  name: string
  depth: number
}

export interface ViewportDefinition {
  width: number
  height: number
  orientation: 'portrait' | 'landscape' | 'square'
}

export interface CameraDefinition {
  view: string
  projection: string
  orientation: 'portrait' | 'landscape' | 'square'
}

/**
 * Scene blueprint (persisted as GameScene).
 * Asset slots describe what the scene requires; assetIds syncs linked assets.
 */
export interface GameScene {
  id: string
  name: string
  description: string
  assetIds: string[]
  status: SceneStatus
  viewport?: ViewportDefinition
  camera?: CameraDefinition
  layers?: SceneLayer[]
  assetSlots?: AssetSlot[]
  /** Composition / camera refs for this scene */
  references?: SceneReference[]
}

export interface IndieForgeProject {
  id: string
  name: string
  description: string
  targetPlatform: string
  /** Target game engine — required for studio brain workflows */
  engine: GameEngine
  /** How assets are crafted: pixel silhouette path vs engine materials/VFX */
  craftPath: CraftPath
  styleGuide: ProjectStyleGuide
  styleReferences?: StyleReference[]
  designerChat?: DesignerChatMessage[]
  productionPlan?: ProductionPlan
  scenes: GameScene[]
  assets: GameAsset[]
  createdAt: string
  updatedAt: string
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  targetPlatform: string
  engine: GameEngine
  craftPath: CraftPath
  sceneCount: number
  assetCount: number
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  description: string
  targetPlatform: string
  engine: GameEngine
  craftPath: CraftPath
  styleGuide: ProjectStyleGuide
}

export type GameAssetType =
  | 'sprite'
  | 'animation'
  | 'background'
  | 'prop'
  | 'effect'
  | 'ui_icon'
  | 'music'
  | 'sound_effect'
  | 'voice_line'

export type AssetStatus = 'planned' | 'generated' | 'approved' | 'exported'

export interface AnimationFrame {
  id: string
  frameIndex: number
  imagePath: string
  approved: boolean
  durationMs: number
  offsetX: number
  offsetY: number
  baselineY: number
}

export interface AnimationClip {
  id: string
  name: string
  frameWidth: number
  frameHeight: number
  frameDurationMs: number
  loop: boolean
  frames: AnimationFrame[]
  /** Vision-derived description of frame 0 for consistent later frames */
  referenceDescription?: string
  /** Frame 0 image path when referenceDescription was captured */
  referenceImagePath?: string
}

/** Fixed RH batter joint ids for Motion Studio v1 */
export type MotionJointId =
  | 'head'
  | 'shoulders'
  | 'torso'
  | 'hips'
  | 'frontFoot'
  | 'rearFoot'
  | 'hands'
  | 'batHandle'
  | 'batTip'

export type MotionPhaseName = 'idle' | 'load' | 'stride' | 'contact' | 'follow_through'

export type MotionFootRegion =
  | 'left_batters_box'
  | 'right_batters_box'
  | 'front_of_left_batters_box'
  | 'front_of_right_batters_box'
  | 'toward_pitcher'
  | 'other'

export type MotionSceneAnchorId = 'home_plate' | 'left_batters_box' | 'right_batters_box' | 'pitcher_direction'

export interface MotionVec2 {
  x: number
  y: number
}

export interface MotionJoint {
  id: MotionJointId
  x: number
  y: number
  /** Optional degrees; bat angle is also derived from batHandle→batTip */
  rotationDeg?: number
}

export interface MotionConstraints {
  rearFootLocked?: boolean
  frontFootGrounded?: boolean
  frontFootRegion?: MotionFootRegion
  cannotOverlap?: MotionSceneAnchorId[]
  handsAttachedToBat?: boolean
  batRemainsLoaded?: boolean
  /** Expected bat angle in degrees (handle→tip); warnings if pose drifts */
  batAngleDeg?: number
  strideTowardPitcher?: boolean
  /**
   * Draw / paint depth: bat + hands in front of head/torso (camera-near).
   * When true, AI must paint bat OVER the helmet — never behind the head.
   */
  batInFrontOfBody?: boolean
}

export interface MotionPhase {
  name: MotionPhaseName
  rootOffset: MotionVec2
  joints: MotionJoint[]
  constraints: MotionConstraints
  notes?: string
  /** Disposable pose-guide PNG path for AI paint (not source of truth) */
  poseGuidePath?: string
}

export interface MotionBlueprintRevision {
  id: string
  savedAt: string
  label?: string
  phases: MotionPhase[]
}

export interface MotionBlueprint {
  id: string
  name: string
  /** e.g. rh_batter_swing */
  rigPreset: 'rh_batter_swing'
  sceneId?: string
  canvasWidth: number
  canvasHeight: number
  phases: MotionPhase[]
  updatedAt: string
  history?: MotionBlueprintRevision[]
}

/**
 * Cutout puppet — costume parts driven by Motion Blueprint keys.
 * Director/Manager: mannequin → motion proof → skin → cuts → rasterize.
 * @see shared/motion/characterPuppet.ts
 */
export type PuppetPartId =
  | 'head'
  | 'torso'
  | 'farArm'
  | 'nearArm'
  | 'farLeg'
  | 'nearLeg'
  | 'hands'
  | 'bat'

export type PuppetPartStatus = 'placeholder' | 'ai_draft' | 'approved'

/**
 * Director production gates (Animation Studio — pose sheet → Aseprite).
 * Legacy skin/cutout statuses map via resolveProductionGate.
 */
export type CharacterPuppetStatus =
  | 'needs_brief'
  | 'needs_scene'
  | 'needs_mannequin'
  | 'needs_motion_proof'
  | 'needs_export'
  | 'ready'
  /** @deprecated cutout path */
  | 'needs_skin'
  | 'needs_parts'
  | 'parts_ready'
  | 'needs_bible'
  | 'draft'
  | 'bound'

/** Lightweight Director brief — defaults from craft/project; approve to proceed. */
export interface AnimationBrief {
  styleNote: string
  cameraNote: string
  canvasWidth: number
  canvasHeight: number
  approvedAt?: string
}

/** Procedural capsule kit (no AI) — pose guides for the Motion Blueprint. */
export interface MannequinKit {
  generatedAt: string
  approvedAt?: string
  /** Full-body idle figure — what you approve (not the isolated part thumbs). */
  bindPreviewPath?: string
  partPaths?: Partial<Record<PuppetPartId, string>>
}

/** Handoff pack for Aseprite: Craft base sprite + Motion Blueprint skeleton frames. */
export interface PoseSheetExport {
  exportedAt: string
  dir: string
  /** Craft character sprite (from guide) — BASE to animate. */
  bindGuidePath?: string
  /** Horizontal strip of skeleton motion-guide frames. */
  stripPath: string
  /** Per-frame skeleton motion guides. */
  framePaths: string[]
  readmePath?: string
}

/**
 * Optional skin plate (legacy cutout path). Pose-sheet thesis skins in Aseprite instead.
 */
export interface CharacterBible {
  imagePath: string
  source: 'ai' | 'import'
  /** e.g. umpire POV toward pitcher */
  cameraNote: string
  approvedAt?: string
  basedOnGuidePath?: string
}

export interface PuppetPart {
  id: PuppetPartId
  label: string
  /** Transparent cutout PNG. Absent while still a placeholder. */
  imagePath?: string
  /** Rotation/position origin — part-local once cut; canvas-space until then */
  pivot: MotionVec2
  /** Joint that drives this part's position */
  bindJoint: MotionJointId
  /** Optional aim joint for rotation (e.g. batHandle → batTip) */
  aimJoint?: MotionJointId
  /** Draw order (lower = further from camera) */
  zIndex: number
  /** Override when constraints.batInFrontOfBody is true */
  zIndexWhenBatInFront?: number
  status: PuppetPartStatus
  notes?: string
}

export interface PuppetBindPose {
  /** Usually idle — the pose Frame 0 / cutouts were authored against */
  phaseName: MotionPhaseName
  joints: MotionJoint[]
  authorityImagePath: string
  canvasWidth: number
  canvasHeight: number
}

export interface PuppetPartOverride {
  partId: PuppetPartId
  zIndex?: number
  visible?: boolean
}

export interface PuppetKeyframe {
  id: string
  phaseName: MotionPhaseName
  /** Index on the exported sheet / timeline */
  frameIndex: number
  /**
   * When set, use these joints instead of the blueprint phase.
   * Surgical tweaks (+18px front foot) live here without mutating the blueprint.
   */
  jointOverrides?: MotionJoint[]
  partOverrides?: PuppetPartOverride[]
  /** blueprint_phase = sample from Motion Blueprint; override = local tweak */
  source: 'blueprint_phase' | 'override'
  notes?: string
}

export interface PuppetTimeline {
  frameCount: number
  frameDurationMs: number
  keys: PuppetKeyframe[]
}

export interface CharacterPuppet {
  schemaVersion: 1
  id: string
  name: string
  assetId: string
  blueprintId: string
  rigPreset: 'rh_batter_swing'
  status: CharacterPuppetStatus
  /** Director brief (style/camera/canvas) */
  animationBrief?: AnimationBrief
  /** Procedural mannequin kit — approved before motion proof */
  mannequinKit?: MannequinKit
  /** Director approved mannequin motion scrub (Motion Studio keys) */
  motionProofAt?: string
  /** Last Aseprite pose-sheet handoff */
  poseSheetExport?: PoseSheetExport
  /** @deprecated optional legacy skin plate */
  characterBible?: CharacterBible
  /** @deprecated legacy part sheet */
  partSheetPath?: string
  bindPose: PuppetBindPose
  parts: PuppetPart[]
  timeline: PuppetTimeline
  /** Mannequin (or legacy cutout) timeline rasters — pose guides for Aseprite */
  rasterizedFrames?: string[]
  thesis: {
    mode: 'pose_sheet_aseprite' | 'cutout_puppet'
    aiRole: 'none' | 'skin_assist' | 'cutout_assist'
    interpolate: 'lerp_joints'
    notes?: string
  }
  updatedAt: string
}

/** One Preview Pose / AI Paint / approve / reject event for replay + agent debugging */
export type MotionDiagnosticEvent =
  | 'preview_pose'
  | 'ai_paint'
  | 'approve_frame'
  | 'reject_frame'
  | 'link_appearance'
  | 'save_blueprint'

export type MotionDiagnosticResult = 'ok' | 'pending' | 'approved' | 'rejected' | 'error'

export interface MotionDiagnosticRun {
  id: string
  at: string
  event: MotionDiagnosticEvent
  result: MotionDiagnosticResult
  phaseName?: MotionPhaseName
  frameIndex?: number
  blueprintId?: string
  /** Joints snapshot for the phase at event time (replay mechanics) */
  joints?: MotionJoint[]
  rootOffset?: MotionVec2
  constraints?: MotionConstraints
  phaseNotes?: string
  appearanceRefs?: Array<{ label: string; path: string }>
  poseGuidePath?: string
  outputFramePath?: string
  /** Prompt / multi-image hint sent to the image model (AI paint only) */
  prompt?: string
  multiImageHint?: string
  imageSize?: string
  imageQuality?: string
  errorMessage?: string
  notes?: string
}

/** Full diagnostic package: schema the agent should respect + run history */
export interface MotionDiagnosticBundle {
  schemaVersion: 1
  exportedAt: string
  projectId: string
  projectName: string
  assetId: string
  assetName: string
  designSize: { width: number; height: number }
  exportSize: { width: number; height: number }
  appearance: {
    sourceAssetId?: string
    sourceName?: string
    guideImagePath?: string
    filePath?: string
    silhouettePath?: string
    outlinePath?: string
  }
  /** Source of truth for mechanics */
  blueprint: MotionBlueprint | null
  /** Cutout puppet draft when present (MVP thesis path) */
  characterPuppet?: CharacterPuppet | null
  /** What the paint agent is supposed to lock to (per phase summary) */
  agentWorkingSchema: {
    description: string
    phases: Array<{
      name: MotionPhaseName
      batAngleDegMeasured?: number | null
      constraints: MotionConstraints
      jointSummary: Record<string, { x: number; y: number }>
      poseGuidePath?: string
      notes?: string
    }>
    paintContract: string[]
    /** Present when asset.characterPuppet exists */
    puppetThesis?: {
      schemaVersion: 1
      status: CharacterPuppetStatus
      partsReady: number
      partCount: number
      frameCount: number
      interpolate: 'lerp_joints'
      aiRole: 'skin_assist' | 'cutout_assist' | 'none'
      nextMvpSteps: string[]
    }
  }
  runs: MotionDiagnosticRun[]
}

export interface GameAsset {
  id: string
  projectId: string
  sceneIds: string[]
  name: string
  type: GameAssetType
  description: string
  prompt: string
  status: AssetStatus
  medium?: AssetMedium
  craftStage?: CraftStage
  /** Suggested craft tool: craft_studio | aseprite | godot | unity | cursor */
  craftTool?: string
  engineNotes?: string
  providerId?: string
  filePath?: string
  silhouettePath?: string
  /** Contour / line art for Aseprite handoff (transparent PNG, no fill) */
  outlinePath?: string
  /**
   * Pose / camera guide image (photo or screenshot). Valid as the only Craft layer —
   * used by Motion overlay + AI Paint for depth/camera lock. Not the final sprite export.
   */
  guideImagePath?: string
  animationClips?: AnimationClip[]
  /** Deterministic motion definitions (Motion Studio). Source of truth for poses. */
  motionBlueprints?: MotionBlueprint[]
  /**
   * Cutout puppet MVP: parts + timeline sampling driven by a Motion Blueprint.
   * Thesis: interpolate joints / rasterize parts — do not AI-repaint every phase.
   */
  characterPuppet?: CharacterPuppet
  /** Append-only Preview/Paint/approve history for replay + agent diagnostics */
  motionDiagnosticRuns?: MotionDiagnosticRun[]
  metadata?: Record<string, unknown>
  designerThread?: DesignerChatMessage[]
  inspirationImages?: AssetInspiration[]
}

export interface PlannedAssetDraft {
  name: string
  type: GameAssetType
  description: string
  suggestedSceneNames: string[]
  promptHint: string
  medium?: AssetMedium
  craftTool?: string
  engineNotes?: string
}

export interface AIAssetPlan {
  scenes: Array<{ name: string; description: string }>
  visualAssets: PlannedAssetDraft[]
  audioAssets: PlannedAssetDraft[]
  animationPresets: string[]
  backgroundIdeas: string[]
  uiIconIdeas: string[]
  productionSteps?: ProductionStep[]
}

export interface AssetExport {
  assetId: string
  exportedAt: string
  pngPaths: string[]
  spriteSheetPath?: string
  atlasJsonPath?: string
  manifestPath?: string
}

export interface FrameRect {
  x: number
  y: number
  w: number
  h: number
  frameIndex: number
}

export interface CreateAssetDraft {
  name: string
  type: GameAssetType
  description?: string
  prompt?: string
  sceneIds?: string[]
  medium?: AssetMedium
  craftStage?: CraftStage
  craftTool?: string
  engineNotes?: string
}

export interface VisualGenerationOverrides {
  prompt?: string
  width?: number
  height?: number
  transparentBackground?: boolean
  /** Placement crop (scene background under the slot) */
  referenceImagePath?: string
  /** Approved cast sprites to match pixel style (not pose/camera photos). */
  styleImagePaths?: string[]
  /**
   * Real-world scene camera / composition photos (e.g. umpire POV).
   * Used for perspective — not treated as cast style refs.
   */
  cameraImagePaths?: string[]
  /** Style reference IDs from the project to include in the generation prompt */
  referenceIds?: string[]
  /** Asset inspiration image IDs to use as visual reference for generation */
  inspirationIds?: string[]
}

export interface AtlasJson {
  meta: {
    image: string
    size: { w: number; h: number }
    frameWidth: number
    frameHeight: number
  }
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number }
      duration: number
      approved: boolean
    }
  >
}
