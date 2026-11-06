/**
 * P2: Layer draw/hit-test helpers shared by the storyboard canvas and tests.
 * Pixel sizes match StoryboardEditor's existing 200px (imaged) / 100px (placeholder) convention.
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
  error?: string
}

export function getLayerPixelSize(
  layer: StoryboardLayer,
  hasImage: boolean
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
  return { width: side, height: side }
}

export function planLayerDraw(
  layer: StoryboardLayer,
  pipeline: AssetPipelineProject,
  gameId: string
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
  return {
    ...base,
    imagePath: media.path,
    pixelSize: getLayerPixelSize(layer, hasImage),
    error: media.error
  }
}

/**
 * Axis-aligned hit test in normalized stage coords (matches existing image-layer select).
 */
export function hitTestLayer(
  layer: StoryboardLayer,
  nx: number,
  ny: number,
  canvasWidth: number,
  hasImage: boolean
): boolean {
  if (layer.visible === false) return false
  const size = getLayerPixelSize(layer, hasImage)
  const halfW = size.width / 2 / canvasWidth
  const halfH = size.height / 2 / canvasWidth
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
