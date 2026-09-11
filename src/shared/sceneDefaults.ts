import type {
  AnchorPoint,
  AssetContract,
  AssetFormat,
  AssetRole,
  AssetSlot,
  CameraDefinition,
  GameAssetType,
  GameEngine,
  GameScene,
  NormalizedRect,
  ProjectStyleGuide,
  ViewportDefinition
} from '@shared/types/project'
import { ENGINE_PROFILES } from './toolchain'

export function defaultViewport(styleGuide?: ProjectStyleGuide): ViewportDefinition {
  const width = styleGuide?.defaultBackgroundWidth ?? 1080
  const height = styleGuide?.defaultBackgroundHeight ?? 1920
  const ratio = width / height
  const orientation: ViewportDefinition['orientation'] =
    ratio > 1.05 ? 'landscape' : ratio < 0.95 ? 'portrait' : 'square'
  return { width, height, orientation }
}

export function defaultCamera(orientation: ViewportDefinition['orientation']): CameraDefinition {
  return {
    view: 'primary',
    projection: 'orthographic',
    orientation
  }
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function normalizeRect(rect: Partial<NormalizedRect> | undefined): NormalizedRect {
  const width = clamp01(rect?.width ?? 0.2)
  const height = clamp01(rect?.height ?? 0.2)
  const x = clamp01(rect?.x ?? 0.4)
  const y = clamp01(rect?.y ?? 0.4)
  return {
    x: Math.min(x, 1 - width),
    y: Math.min(y, 1 - height),
    width,
    height
  }
}

export function createDefaultContract(
  name: string,
  role: AssetRole,
  format: AssetFormat,
  options?: {
    canvas?: { width: number; height: number }
    transparent?: boolean
    layer?: number
    anchor?: AnchorPoint
    engine?: GameEngine
  }
): AssetContract {
  const transparent =
    options?.transparent ??
    (role !== 'scene_background' && format !== 'layered_background')
  const canvas =
    options?.canvas ??
    (role === 'scene_background' || format === 'layered_background'
      ? { width: 1080, height: 1920 }
      : { width: 1024, height: 1024 })

  const profile = options?.engine ? ENGINE_PROFILES[options.engine] : undefined

  return {
    id: `contract_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    name,
    role,
    format,
    canvas,
    transparent,
    placement: {
      anchor: options?.anchor ?? 'bottom_center',
      pivotX: 0.5,
      pivotY: 1,
      defaultScale: 1,
      layer: options?.layer ?? 0
    },
    export: {
      target: profile?.exportTarget ?? 'godot',
      filtering: profile?.filtering ?? 'nearest',
      compression: 'lossless',
      pixelsPerUnit: options?.engine === 'unity' ? 100 : undefined
    }
  }
}

export function createAssetSlot(input: {
  id: string
  name: string
  role: AssetRole
  format: AssetFormat
  bounds?: Partial<NormalizedRect>
  anchor?: AnchorPoint
  layer?: number
  contract?: AssetContract
  assetId?: string
  status?: AssetSlot['status']
  engine?: GameEngine
}): AssetSlot {
  const layer = input.layer ?? 0
  const anchor = input.anchor ?? 'bottom_center'
  const contract =
    input.contract ??
    createDefaultContract(input.name, input.role, input.format, {
      layer,
      anchor,
      engine: input.engine
    })

  return {
    id: input.id,
    name: input.name,
    role: input.role,
    format: input.format,
    bounds: normalizeRect(input.bounds),
    anchor,
    layer,
    contract,
    assetId: input.assetId,
    status: input.status ?? (input.assetId ? 'draft' : 'missing')
  }
}

/** Map semantic role + format to existing GameAssetType. */
export function slotToAssetType(role: AssetRole, format: AssetFormat): GameAssetType {
  if (format === 'music_track' || role === 'music_loop') return 'music'
  if (format === 'audio_clip' || role === 'audio_cue') return 'sound_effect'
  if (role === 'voice_line') return 'voice_line'
  if (format === 'frame_animation' || format === 'sprite_sheet') return 'animation'
  if (role === 'scene_background' || format === 'layered_background') {
    return 'background'
  }
  if (role === 'visual_effect') return 'effect'
  if (
    role === 'gameplay_overlay' ||
    role === 'hud_element' ||
    role === 'menu_element' ||
    format === 'nine_slice'
  ) {
    return 'ui_icon'
  }
  if (role === 'environment_prop' || role === 'interactive_object' || role === 'scene_foreground') {
    return 'prop'
  }
  return 'sprite'
}

export function ensureSceneBlueprint(
  scene: GameScene,
  styleGuide?: ProjectStyleGuide
): GameScene {
  const viewport = scene.viewport ?? defaultViewport(styleGuide)
  const camera = scene.camera ?? defaultCamera(viewport.orientation)
  const layers = scene.layers ?? []
  const assetSlots = scene.assetSlots ?? []
  const references = scene.references ?? []

  return {
    ...scene,
    viewport,
    camera,
    layers,
    assetSlots,
    references,
    assetIds: scene.assetIds ?? []
  }
}

/** Rebuild scene.assetIds from slots that have an assetId. */
export function syncSceneAssetIdsFromSlots(scene: GameScene): string[] {
  const fromSlots = (scene.assetSlots ?? [])
    .map((s) => s.assetId)
    .filter((id): id is string => Boolean(id))
  const legacy = (scene.assetIds ?? []).filter((id) => !fromSlots.includes(id))
  return [...fromSlots, ...legacy]
}
