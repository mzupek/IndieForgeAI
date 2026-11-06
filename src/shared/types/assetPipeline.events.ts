/**
 * Pose Events & Stateful Assets - Schema Additions
 * 
 * P0 CONTRACT: Types defined, NOT IMPORTED into runtime yet
 * Will be merged into assetPipeline.ts in P1
 * 
 * DO NOT import this file until P1 implementation begins
 */

/**
 * Visual asset - generic reusable art asset with optional states
 * Distinct from character poses (which remain import-only 1024 PNGs)
 * 
 * Examples: logos, symbols, items, weapons, props
 */
export interface VisualAsset {
  id: string
  gameId: string
  name: string
  /** Asset category: 'logo' | 'symbol' | 'item' | 'weapon' | 'prop' */
  category: string
  /** Tags for library search */
  tags: string[]
  /** Default state (null if single-state asset) */
  defaultStateId: string | null
  /** Thumbnail for library preview */
  thumbnail?: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/**
 * Asset state - named variation of a visual asset
 * 
 * Examples:
 * - Crate: "open" / "closed"
 * - Weapon: "ready" / "firing"
 * - Gate: "idle" / "opening" / "open" / "closing"
 */
export interface AssetState {
  id: string
  assetId: string
  name: string
  /** Path to image file (PNG with transparency) */
  file: string
  /** Optional bounding box override */
  boundingBox?: { width: number; height: number }
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/**
 * Editable text - text content with styling metadata
 * Font/palette references, not baked into images
 * 
 * Examples:
 * - Player name display
 * - Score counter
 * - Dialog text
 * - HUD labels
 */
export interface EditableText {
  id: string
  gameId: string
  name: string
  /** Default text content */
  defaultContent: string
  /** Font reference (path or font family name) */
  font: string
  /** Font size in px */
  fontSize: number
  /** Color (hex or palette reference) */
  color: string
  /** Text alignment: 'left' | 'center' | 'right' */
  alignment: 'left' | 'center' | 'right'
  /** Optional max width for wrapping (px) */
  maxWidth?: number
  /** Tags for library search */
  tags: string[]
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/**
 * Event definition - named gameplay event
 * 
 * Engine runtime detects and sends; Forge simulates for preview
 * 
 * Examples:
 * - hit_received: character takes damage
 * - hit_landed: character deals damage
 * - item_collected: player picks up item
 * - door_opened: interaction complete
 * - wave_completed: gameplay milestone
 */
export interface EventDefinition {
  id: string
  gameId: string
  name: string
  description?: string
  /** Optional payload schema (JSON schema subset for primitive validation) */
  payloadSchema?: {
    type: 'object'
    properties: Record<string, { 
      type: 'string' | 'number' | 'boolean'
      description?: string 
    }>
  }
  /** Tags for organization */
  tags: string[]
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/**
 * Event binding - links event to layer action
 * Bindings are authored per-shot, not global
 * 
 * Semantics:
 * - Instant (durationSec = 0): Apply action immediately, no timer
 * - Timed (durationSec > 0): Apply action, start timer, return based on policy
 * - Repeated event: Cancel old timer, restart with new duration
 * - Payload filter: Only trigger if event payload matches filter (optional)
 * 
 * Examples:
 * - hit_received → hero layer → setPose("hurt") → 0.5s → return to default
 * - item_collected → item layer → setVisibility(false) → 0s (instant)
 * - door_opened → door layer → setState("open") → hold forever
 */
export interface EventBinding {
  id: string
  shotId: string
  /** Source event ID */
  eventId: string
  /** Target layer ID in this shot */
  targetLayerId: string
  /** Action to perform */
  action: EventBindingAction
  /** Optional payload filter (primitive equality only) */
  payloadFilter?: Record<string, string | number | boolean>
  /** Duration in seconds (0 = instant, >0 = hold then return) */
  durationSec: number
  /** Return policy after duration expires */
  returnPolicy: 'default' | 'hold'
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/**
 * Event binding action - what to do when event fires
 */
export type EventBindingAction =
  | { type: 'setPose'; poseId: string }
  | { type: 'setState'; stateId: string }
  | { type: 'setVisibility'; visible: boolean }
  | { type: 'setText'; text: string }

/**
 * Extended StoryboardLayer additions (P2)
 * These fields will be added to existing StoryboardLayer interface
 * 
 * NOT YET MERGED - kept separate for P0 contract clarity
 */
export interface StoryboardLayerExtensions {
  /** Generic visual asset reference */
  assetId?: string
  /** Current asset state (for multi-state assets) */
  assetStateId?: string
  
  /** Editable text reference */
  textId?: string
  /** Current text content override (preview only, not persisted as default) */
  textContentOverride?: string
  
  /** Visibility toggle (default true) */
  visible?: boolean
}

/**
 * Extended AssetPipelineProject additions (P1+)
 * These arrays will be added to existing AssetPipelineProject interface
 * 
 * NOT YET MERGED - kept separate for P0 contract clarity
 */
export interface AssetPipelineProjectExtensions {
  visualAssets: VisualAsset[]
  assetStates: AssetState[]
  editableTexts: EditableText[]
  eventDefinitions: EventDefinition[]
  eventBindings: EventBinding[]
}

/**
 * Validation Rules
 */

/**
 * Validate asset state belongs to asset
 */
export function validateAssetState(state: AssetState, assets: VisualAsset[]): string | null {
  const asset = assets.find(a => a.id === state.assetId)
  if (!asset) {
    return `AssetState '${state.id}' references missing asset '${state.assetId}'`
  }
  return null
}

/**
 * Validate event binding references
 */
export function validateEventBinding(
  binding: EventBinding,
  events: EventDefinition[],
  shots: any[] // StoryboardShot[] but avoiding circular import
): string | null {
  const event = events.find(e => e.id === binding.eventId)
  if (!event) {
    return `Binding '${binding.id}' references missing event '${binding.eventId}'`
  }
  
  const shot = shots.find(s => s.id === binding.shotId)
  if (!shot) {
    return `Binding '${binding.id}' references missing shot '${binding.shotId}'`
  }
  
  const layer = shot.layers?.find((l: any) => l.id === binding.targetLayerId)
  if (!layer) {
    return `Binding '${binding.id}' references missing layer '${binding.targetLayerId}' in shot '${binding.shotId}'`
  }
  
  // Validate action type matches layer content
  if (binding.action.type === 'setPose' && !layer.characterId) {
    return `Binding '${binding.id}' setPose action requires layer with characterId`
  }
  if (binding.action.type === 'setState' && !layer.assetId) {
    return `Binding '${binding.id}' setState action requires layer with assetId`
  }
  if (binding.action.type === 'setText' && !layer.textId) {
    return `Binding '${binding.id}' setText action requires layer with textId`
  }
  
  return null
}

/**
 * Validate game isolation (no cross-game references)
 */
export function validateGameIsolation(
  resourceId: string,
  resourceGameId: string,
  requestedGameId: string,
  resourceType: string
): string | null {
  if (resourceGameId !== requestedGameId) {
    return `${resourceType} '${resourceId}' belongs to game '${resourceGameId}', not '${requestedGameId}'`
  }
  return null
}

/**
 * Preview State Model
 * 
 * This is the runtime state (in-memory only, never persisted)
 * Managed by storyboard editor during playback/scrubbing
 */
export interface PreviewLayerState {
  layerId: string
  /** Active event binding timer (if any) */
  activeEventTimer?: {
    bindingId: string
    startTime: number
    endTime: number
    returnPolicy: 'default' | 'hold'
  }
  /** Current pose override (from event or timeline) */
  currentPoseId?: string
  /** Current state override (from event or timeline) */
  currentStateId?: string
  /** Current visibility override (from event or timeline) */
  currentVisibility?: boolean
  /** Current text override (from event or timeline) */
  currentText?: string
}

/**
 * Property precedence computation
 * Returns the effective value based on preview state and authored default
 * 
 * Precedence (highest to lowest):
 * 1. Active event hold (timer running)
 * 2. Timed keyframe sample (Phase C.3c, not yet implemented)
 * 3. Authored default (persisted in StoryboardLayer)
 */
export function computeEffectiveLayerState(
  layer: any, // StoryboardLayer with extensions
  previewState: PreviewLayerState | undefined,
  currentTime: number
): {
  poseId?: string
  stateId?: string
  visible: boolean
  text?: string
} {
  // If event timer active and not expired, use event override
  if (previewState?.activeEventTimer) {
    const timer = previewState.activeEventTimer
    if (currentTime >= timer.startTime && currentTime <= timer.endTime) {
      return {
        poseId: previewState.currentPoseId ?? layer.poseId,
        stateId: previewState.currentStateId ?? layer.assetStateId,
        visible: previewState.currentVisibility ?? layer.visible ?? true,
        text: previewState.currentText ?? layer.textContentOverride
      }
    }
    
    // Timer expired, apply return policy
    if (currentTime > timer.endTime) {
      if (timer.returnPolicy === 'hold') {
        // Keep event override
        return {
          poseId: previewState.currentPoseId ?? layer.poseId,
          stateId: previewState.currentStateId ?? layer.assetStateId,
          visible: previewState.currentVisibility ?? layer.visible ?? true,
          text: previewState.currentText ?? layer.textContentOverride
        }
      }
      // else 'default': fall through to authored default
    }
  }
  
  // TODO P4: Check timed keyframes (Phase C.3c integration)
  
  // Fall back to authored default
  return {
    poseId: layer.poseId,
    stateId: layer.assetStateId,
    visible: layer.visible ?? true,
    text: layer.textContentOverride
  }
}

/**
 * Export manifest format (engine-neutral)
 */
export interface ShotExportManifest {
  schemaVersion: number
  shotId: string
  durationSec: number
  layers: Array<{
    id: string
    zOrder: number
    assetId?: string
    defaultStateId?: string
    characterId?: string
    poseId?: string
    textId?: string
    defaultText?: string
    transform: {
      x: number
      y: number
      scale: number
      rotation: number
      flipX: boolean
      opacity: number
    }
    visible: boolean
  }>
  eventBindings: Array<{
    id: string
    eventName: string
    targetLayerId: string
    action: EventBindingAction
    payloadFilter?: Record<string, string | number | boolean>
    durationSec: number
    returnPolicy: 'default' | 'hold'
  }>
  assetManifest: Record<string, {
    name: string
    category: string
    states: Record<string, string> // stateId -> file path
  }>
}
