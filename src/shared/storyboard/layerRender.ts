/**
 * P2: Layer draw/hit-test helpers shared by the storyboard canvas and tests.
 * Max-side fits the existing 200px (imaged) / 100px (placeholder) convention.
 * Visual-asset / image media keep source aspect (contain); scale stays uniform.
 * Does not rewrite authored layer x/y/scale/rotation.
 */

import type { AssetPipelineProject, StoryboardLayer } from '../types/assetPipeline'
import {
  getLayerKind,
  resolveLayerImagePath,
  resolveTextStyle
} from './layerValidation'

export const IMAGED_LAYER_PX = 200
export const PLACEHOLDER_LAYER_PX = 100
export const TEXT_BASE_PX = 32
/** Default scale for "reset to source aspect" (200px max-side contain). */
export const SOURCE_FIT_SCALE = 1

export interface LayerPixelSize {
  width: number
  height: number
}

export interface LayerDrawPlan {
  kind: ReturnType<typeof getLayerKind>
  visible: boolean
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
  flipX: boolean
  imagePath?: string
  text?: string
  fontFamily?: string
  fontFallback?: string
  color?: string
  pixelSize: LayerPixelSize
  sourceSize?: LayerPixelSize
  error?: string
}

export interface LayerSizeOptions {
  /** Decoded full-resolution pixels. Wins over stored boundingBox / pixelSize. */
  naturalSize?: LayerPixelSize
  canvasHeight?: number
}

/**
 * Contain source aspect in a max-side box. Uniform layer.scale is applied by caller.
 */
export function containSourcePixelSize(
  sourceWidth: number,
  sourceHeight: number,
  maxSide: number
): LayerPixelSize {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(maxSide > 0)) {
    return { width: maxSide, height: maxSide }
  }
  const aspect = sourceWidth / sourceHeight
  if (aspect >= 1) {
    return { width: maxSide, height: maxSide / aspect }
  }
  return { width: maxSide * aspect, height: maxSide }
}

/**
 * Metadata size from the current visual-asset state or static asset.
 * Prefers authored default/explicit state boundingBox, else asset.pixelSize.
 * Does not read files. Stale thumb-sized boxes are overridden when naturalSize is passed.
 */
export function resolveLayerSourceSize(
  layer: StoryboardLayer,
  pipeline: AssetPipelineProject
): LayerPixelSize | undefined {
  if (!layer.visualAssetId) return undefined
  const asset = (pipeline.visualAssets || []).find((a) => a.id === layer.visualAssetId)
  if (!asset) return undefined
  const stateId = layer.assetStateId || asset.defaultStateId
  if (stateId) {
    const state = (pipeline.assetStates || []).find((s) => s.id === stateId && s.assetId === asset.id)
    if (state?.boundingBox && state.boundingBox.width > 0 && state.boundingBox.height > 0) {
      return { width: state.boundingBox.width, height: state.boundingBox.height }
    }
  }
  if (asset.pixelSize && asset.pixelSize.width > 0 && asset.pixelSize.height > 0) {
    return { width: asset.pixelSize.width, height: asset.pixelSize.height }
  }
  return undefined
}

export function pickSourceSize(
  natural?: LayerPixelSize,
  metadata?: LayerPixelSize
): LayerPixelSize | undefined {
  if (natural && natural.width > 0 && natural.height > 0) return natural
  if (metadata && metadata.width > 0 && metadata.height > 0) return metadata
  return undefined
}

export function getLayerPixelSize(
  layer: StoryboardLayer,
  hasImage: boolean,
  sourceSize?: LayerPixelSize
): LayerPixelSize {
  const kind = getLayerKind(layer)
  if (kind === 'text') {
    const text = layer.text || ''
    const fontSize = TEXT_BASE_PX * layer.scale
    const width = Math.max(fontSize * 2, text.length * fontSize * 0.55)
    const height = fontSize * 1.4
    return { width, height }
  }
  const side = (hasImage ? IMAGED_LAYER_PX : PLACEHOLDER_LAYER_PX) * layer.scale
  if (!hasImage || !sourceSize) {
    return { width: side, height: side }
  }
  return containSourcePixelSize(sourceSize.width, sourceSize.height, side)
}

export function planLayerDraw(
  layer: StoryboardLayer,
  pipeline: AssetPipelineProject,
  gameId: string,
  options?: LayerSizeOptions
): LayerDrawPlan {
  const kind = getLayerKind(layer)
  const visible = layer.visible !== false
  const base = {
    kind,
    visible,
    x: layer.x,
    y: layer.y,
    scale: layer.scale,
    rotation: layer.rotation,
    opacity: layer.opacity,
    flipX: layer.flipX
  }

  if (!visible) {
    return { ...base, pixelSize: getLayerPixelSize(layer, false) }
  }

  if (kind === 'text') {
    const style = resolveTextStyle(layer, pipeline, gameId)
    const error = style.fontError || style.paletteError
    return {
      ...base,
      text: layer.text || '',
      fontFamily: style.family,
      fontFallback: style.fallback,
      color: style.color,
      pixelSize: getLayerPixelSize(layer, false),
      error
    }
  }

  const media = resolveLayerImagePath(layer, pipeline)
  const hasImage = !!media.path && !media.error
  const sourceSize = pickSourceSize(options?.naturalSize, resolveLayerSourceSize(layer, pipeline))
  return {
    ...base,
    imagePath: media.path,
    pixelSize: getLayerPixelSize(layer, hasImage, sourceSize),
    sourceSize,
    error: media.error
  }
}

/**
 * Axis-aligned hit test in normalized stage coords.
 * Height is normalized by canvasHeight (defaults to canvasWidth for callers that pass a square).
 */
export function hitTestLayer(
  layer: StoryboardLayer,
  nx: number,
  ny: number,
  canvasWidth: number,
  hasImage: boolean,
  options?: LayerSizeOptions
): boolean {
  if (layer.visible === false) return false
  const sourceSize = pickSourceSize(options?.naturalSize, undefined)
  const size = getLayerPixelSize(layer, hasImage, sourceSize)
  const canvasHeight = options?.canvasHeight ?? canvasWidth
  const halfW = size.width / 2 / canvasWidth
  const halfH = size.height / 2 / canvasHeight
  return Math.abs(nx - layer.x) <= halfW && Math.abs(ny - layer.y) <= halfH
}

export function describeLayerLabel(
  layer: StoryboardLayer,
  pipeline: AssetPipelineProject
): string {
  const kind = getLayerKind(layer)
  if (kind === 'visualAsset') {
    const asset = (pipeline.visualAssets || []).find((a) => a.id === layer.visualAssetId)
    const name = asset?.name || `asset ${layer.visualAssetId?.slice(0, 8)}`
    if (layer.assetStateId) {
      const state = (pipeline.assetStates || []).find((s) => s.id === layer.assetStateId)
      return `${name} / ${state?.name || 'state'}`
    }
    if (asset?.defaultStateId) {
      const state = (pipeline.assetStates || []).find((s) => s.id === asset.defaultStateId)
      return `${name} / ${state?.name || 'default'}`
    }
    return `${name} (static)`
  }
  if (kind === 'text') {
    const preview = (layer.text || '').slice(0, 24)
    return preview ? `Text: ${preview}` : 'Text'
  }
  if (kind === 'character') {
    const character = (pipeline.characters || []).find((c) => c.id === layer.characterId)
    const pose = (pipeline.poses || []).find((p) => p.id === layer.poseId)
    const charName = character?.name || 'Character'
    return pose ? `${charName} / ${pose.slot}` : charName
  }
  if (kind === 'clip') return 'Clip'
  if (kind === 'image') return 'Image'
  return 'Layer'
}
