/**
 * P2: Storyboard layer reference validation and media/text resolution.
 * Shared by storage, CLI, IPC, and the renderer (no Node APIs).
 */

import type {
  AssetPipelineProject,
  AssetState,
  Font,
  Palette,
  StoryboardLayer,
  VisualAsset
} from '../types/assetPipeline'

export const DEFAULT_FONT_REF = 'default'
export const DEFAULT_PALETTE_REF = 'default'
export const DEFAULT_FONT_FAMILY = 'sans-serif'
export const DEFAULT_TEXT_COLOR = '#ffffff'

export type LayerKind = 'character' | 'clip' | 'visualAsset' | 'text' | 'image' | 'empty'

export function getLayerKind(layer: StoryboardLayer): LayerKind {
  if (layer.visualAssetId) return 'visualAsset'
  if (layer.text !== undefined && layer.text !== null && layer.text !== '') return 'text'
  if (layer.characterId || layer.poseId) return 'character'
  if (layer.clipId) return 'clip'
  if (layer.imagePath) return 'image'
  if (layer.fontRef || layer.paletteRef) return 'text'
  return 'empty'
}

export function isDefaultRef(ref: string | undefined | null): boolean {
  return !ref || ref === DEFAULT_FONT_REF || ref === DEFAULT_PALETTE_REF
}

function findStoryboardGameId(pipeline: AssetPipelineProject, shotId: string): string {
  const storyboard = (pipeline.storyboards || []).find((sb) => sb.shotIds?.includes(shotId))
  if (!storyboard) {
    throw new Error(`Shot '${shotId}' is not attached to a storyboard; cannot resolve game scope`)
  }
  return storyboard.gameId
}

export function getShotGameId(pipeline: AssetPipelineProject, shotId: string): string {
  return findStoryboardGameId(pipeline, shotId)
}

function gameFonts(pipeline: AssetPipelineProject, gameId: string): Font[] {
  return (pipeline.fonts || []).filter((f) => f.gameId === gameId)
}

function gamePalettes(pipeline: AssetPipelineProject, gameId: string): Palette[] {
  return (pipeline.palettes || []).filter((p) => p.gameId === gameId)
}

function themeSlotIdsForGame(pipeline: AssetPipelineProject, gameId: string): Set<string> {
  const ids = new Set<string>()
  for (const def of pipeline.gameDefinitions || []) {
    if (def.gameId !== gameId) continue
    for (const slot of def.themeSlots || []) {
      ids.add(slot.id)
    }
  }
  return ids
}

function siblingStaticImage(thumbnailPath: string): string {
  if (/thumbnail\.png$/i.test(thumbnailPath)) {
    return thumbnailPath.replace(/thumbnail\.png$/i, 'image.png')
  }
  const idx = Math.max(thumbnailPath.lastIndexOf('/'), thumbnailPath.lastIndexOf('\\'))
  if (idx === -1) return 'image.png'
  return `${thumbnailPath.slice(0, idx + 1)}image.png`
}

/**
 * Resolve the image file for a visual-asset layer:
 * selected AssetState file, else default state file, else static asset.image
 * (with thumbnail / sibling image.png fallback for P1 records that only stored thumbnail).
 */
export function resolveVisualAssetImagePath(
  asset: VisualAsset,
  assetStateId: string | null | undefined,
  states: AssetState[]
): { path?: string; error?: string } {
  const owned = states.filter((s) => s.assetId === asset.id)

  if (assetStateId) {
    const state = owned.find((s) => s.id === assetStateId)
    if (!state) {
      return { error: `Asset state '${assetStateId}' not found for asset '${asset.name}'` }
    }
    if (!state.file) {
      return { error: `Asset state '${state.name}' has no image file` }
    }
    return { path: state.file }
  }

  if (asset.defaultStateId) {
    const def = owned.find((s) => s.id === asset.defaultStateId)
    if (!def) {
      return { error: `Default state '${asset.defaultStateId}' missing for asset '${asset.name}'` }
    }
    if (!def.file) {
      return { error: `Default state '${def.name}' has no image file` }
    }
    return { path: def.file }
  }

  if (asset.image) {
    return { path: asset.image }
  }

  if (asset.thumbnail) {
    return { path: siblingStaticImage(asset.thumbnail) }
  }

  return { error: `Visual asset '${asset.name}' has no static image and no states` }
}

/**
 * Library grid preview path. Does not mutate asset records.
 * Prefers authored root thumbnail (static --image); otherwise the Game-scoped
 * default state's imported file via resolveVisualAssetImagePath. Missing or
 * invalid refs return no path (caller shows the category icon). Never throws.
 */
export function resolveLibraryPreviewPath(
  asset: VisualAsset,
  states: AssetState[],
  options?: { gameId?: string }
): { path?: string } {
  try {
    if (options?.gameId && asset.gameId !== options.gameId) {
      return {}
    }
    if (asset.thumbnail) {
      return { path: asset.thumbnail }
    }
    const owned = (states || []).filter((s) => s && s.assetId === asset.id)
    const resolved = resolveVisualAssetImagePath(asset, null, owned)
    if (resolved.path) return { path: resolved.path }
    return {}
  } catch {
    return {}
  }
}

export function resolveLayerImagePath(
  layer: StoryboardLayer,
  pipeline: AssetPipelineProject
): { path?: string; error?: string } {
  if (layer.visualAssetId) {
    const asset = (pipeline.visualAssets || []).find((a) => a.id === layer.visualAssetId)
    if (!asset) {
      return { error: `Visual asset '${layer.visualAssetId}' not found` }
    }
    return resolveVisualAssetImagePath(asset, layer.assetStateId, pipeline.assetStates || [])
  }
  if (layer.poseId) {
    const pose = (pipeline.poses || []).find((p) => p.id === layer.poseId)
    if (!pose) return { error: `Pose '${layer.poseId}' not found` }
    if (!pose.file) return { error: `Pose '${layer.poseId}' has no image file` }
    return { path: pose.file }
  }
  if (layer.clipId) {
    const clip = (pipeline.clips || []).find((c) => c.id === layer.clipId)
    if (!clip) return { error: `Clip '${layer.clipId}' not found` }
    const mediaPath = clip.thumbnail || clip.file
    if (!mediaPath) return { error: `Clip '${layer.clipId}' has no preview media` }
    return { path: mediaPath }
  }
  if (layer.imagePath) {
    return { path: layer.imagePath }
  }
  return {}
}

export function resolveTextStyle(
  layer: StoryboardLayer,
  pipeline: AssetPipelineProject,
  gameId: string
): { family: string; fallback: string; color: string; fontError?: string; paletteError?: string } {
  let family = DEFAULT_FONT_FAMILY
  let fallback = DEFAULT_FONT_FAMILY
  let color = DEFAULT_TEXT_COLOR
  let fontError: string | undefined
  let paletteError: string | undefined

  const fontRef = layer.fontRef
  if (!isDefaultRef(fontRef)) {
    const font = gameFonts(pipeline, gameId).find((f) => f.id === fontRef)
    const themeIds = themeSlotIdsForGame(pipeline, gameId)
    if (font) {
      family = font.family
      fallback = font.fallback || DEFAULT_FONT_FAMILY
    } else if (themeIds.has(fontRef!)) {
      family = DEFAULT_FONT_FAMILY
      fallback = DEFAULT_FONT_FAMILY
    } else {
      fontError = `Font '${fontRef}' is not a Font id, Game Definition theme slot, or 'default' for this game`
    }
  }

  const paletteRef = layer.paletteRef
  if (!isDefaultRef(paletteRef)) {
    const palette = gamePalettes(pipeline, gameId).find((p) => p.id === paletteRef)
    const themeIds = themeSlotIdsForGame(pipeline, gameId)
    if (palette) {
      color = palette.colors.text || palette.colors.primary || DEFAULT_TEXT_COLOR
    } else if (themeIds.has(paletteRef!)) {
      color = DEFAULT_TEXT_COLOR
    } else {
      paletteError = `Palette '${paletteRef}' is not a Palette id, Game Definition theme slot, or 'default' for this game`
    }
  }

  return { family, fallback, color, fontError, paletteError }
}

export function layerHasContent(layer: Partial<StoryboardLayer>): boolean {
  return !!(
    layer.visualAssetId ||
    layer.characterId ||
    layer.poseId ||
    layer.clipId ||
    layer.imagePath ||
    (layer.text !== undefined && layer.text !== null)
  )
}

/**
 * Validate layer refs against the shot's game. Throws actionable errors.
 */
export function validateLayerReferences(
  layer: StoryboardLayer,
  pipeline: AssetPipelineProject,
  shotId: string
): void {
  const gameId = findStoryboardGameId(pipeline, shotId)

  if (!layerHasContent(layer)) {
    throw new Error(
      'Layer must include content: --asset, --character/--pose, --clip, --image, or --text'
    )
  }

  if (layer.visualAssetId) {
    const asset = (pipeline.visualAssets || []).find((a) => a.id === layer.visualAssetId)
    if (!asset) {
      throw new Error(`Visual asset not found: ${layer.visualAssetId}`)
    }
    if (asset.gameId !== gameId) {
      throw new Error(
        `Visual asset '${asset.name}' belongs to game '${asset.gameId}', not shot game '${gameId}'`
      )
    }

    if (layer.assetStateId) {
      const state = (pipeline.assetStates || []).find((s) => s.id === layer.assetStateId)
      if (!state) {
        throw new Error(`Asset state not found: ${layer.assetStateId}`)
      }
      if (state.assetId !== asset.id) {
        throw new Error(
          `Asset state '${state.name}' belongs to asset '${state.assetId}', not '${asset.id}'`
        )
      }
    }
  } else if (layer.assetStateId) {
    throw new Error('assetStateId requires visualAssetId')
  }

  if (layer.characterId) {
    const character = (pipeline.characters || []).find((c) => c.id === layer.characterId)
    if (!character) {
      throw new Error(`Character not found: ${layer.characterId}`)
    }
    if (character.gameId !== gameId) {
      throw new Error(
        `Character '${character.name}' belongs to game '${character.gameId}', not shot game '${gameId}'`
      )
    }
  }

  if (layer.poseId) {
    const pose = (pipeline.poses || []).find((p) => p.id === layer.poseId)
    if (!pose) {
      throw new Error(`Pose not found: ${layer.poseId}`)
    }
    if (layer.characterId && pose.characterId !== layer.characterId) {
      throw new Error(
        `Pose '${layer.poseId}' belongs to character '${pose.characterId}', not '${layer.characterId}'`
      )
    }
    if (!layer.characterId) {
      const parent = (pipeline.characters || []).find((c) => c.id === pose.characterId)
      if (parent && parent.gameId !== gameId) {
        throw new Error(
          `Pose '${layer.poseId}' belongs to character '${pose.characterId}' in game '${parent.gameId}', not '${gameId}'`
        )
      }
    }
  }

  if (layer.clipId) {
    const clip = (pipeline.clips || []).find((c) => c.id === layer.clipId)
    if (!clip) {
      throw new Error(`Clip not found: ${layer.clipId}`)
    }
  }

  if (!isDefaultRef(layer.fontRef)) {
    const font = gameFonts(pipeline, gameId).find((f) => f.id === layer.fontRef)
    const themeIds = themeSlotIdsForGame(pipeline, gameId)
    if (!font && !themeIds.has(layer.fontRef!)) {
      throw new Error(
        `Font '${layer.fontRef}' is not a Font id or Game Definition theme slot for game '${gameId}'. Use --font default for the system fallback.`
      )
    }
  }

  if (!isDefaultRef(layer.paletteRef)) {
    const palette = gamePalettes(pipeline, gameId).find((p) => p.id === layer.paletteRef)
    const themeIds = themeSlotIdsForGame(pipeline, gameId)
    if (!palette && !themeIds.has(layer.paletteRef!)) {
      throw new Error(
        `Palette '${layer.paletteRef}' is not a Palette id or Game Definition theme slot for game '${gameId}'. Use --palette default for the system fallback.`
      )
    }
  }
}

export function collectAssetLayerUsage(
  pipeline: AssetPipelineProject,
  assetId: string
): { layerIds: string[]; shotIds: string[]; labels: string[] } {
  const layerIds: string[] = []
  const shotIds: string[] = []
  const labels: string[] = []
  for (const shot of pipeline.storyboardShots || []) {
    for (const layer of shot.layers || []) {
      if (layer.visualAssetId === assetId) {
        layerIds.push(layer.id)
        if (!shotIds.includes(shot.id)) shotIds.push(shot.id)
        labels.push(`${shot.name}/${layer.id}`)
      }
    }
  }
  return { layerIds, shotIds, labels }
}

export function collectAssetStateLayerUsage(
  pipeline: AssetPipelineProject,
  stateId: string
): { layerIds: string[]; shotIds: string[]; labels: string[] } {
  const layerIds: string[] = []
  const shotIds: string[] = []
  const labels: string[] = []
  for (const shot of pipeline.storyboardShots || []) {
    for (const layer of shot.layers || []) {
      if (layer.assetStateId === stateId) {
        layerIds.push(layer.id)
        if (!shotIds.includes(shot.id)) shotIds.push(shot.id)
        labels.push(`${shot.name}/${layer.id}`)
      }
    }
  }
  return { layerIds, shotIds, labels }
}

export function collectFontLayerUsage(
  pipeline: AssetPipelineProject,
  fontId: string
): { layerIds: string[]; labels: string[] } {
  const layerIds: string[] = []
  const labels: string[] = []
  for (const shot of pipeline.storyboardShots || []) {
    for (const layer of shot.layers || []) {
      if (layer.fontRef === fontId) {
        layerIds.push(layer.id)
        labels.push(`${shot.name}/${layer.id}`)
      }
    }
  }
  return { layerIds, labels }
}

export function collectPaletteLayerUsage(
  pipeline: AssetPipelineProject,
  paletteId: string
): { layerIds: string[]; labels: string[] } {
  const layerIds: string[] = []
  const labels: string[] = []
  for (const shot of pipeline.storyboardShots || []) {
    for (const layer of shot.layers || []) {
      if (layer.paletteRef === paletteId) {
        layerIds.push(layer.id)
        labels.push(`${shot.name}/${layer.id}`)
      }
    }
  }
  return { layerIds, labels }
}

export function formatInUseError(kind: string, name: string, labels: string[]): string {
  const preview = labels.slice(0, 3).join(', ')
  const extra = labels.length > 3 ? '...' : ''
  return `Cannot delete ${kind} '${name}': referenced by ${labels.length} layer(s) in shots: ${preview}${extra}`
}
