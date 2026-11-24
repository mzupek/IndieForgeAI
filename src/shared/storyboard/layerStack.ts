/**
 * Photoshop-style layer stack: front of list = highest zOrder.
 * No lock field exists on StoryboardLayer — skip lock.
 */

import type { StoryboardLayer } from '../types/assetPipeline'

export function layersFrontToBack(layers: StoryboardLayer[]): StoryboardLayer[] {
  return [...layers].sort((a, b) => b.zOrder - a.zOrder || a.id.localeCompare(b.id))
}

export function compactLayerZOrders(frontToBack: StoryboardLayer[]): StoryboardLayer[] {
  const n = frontToBack.length
  return frontToBack.map((layer, index) => ({ ...layer, zOrder: n - index }))
}

export function moveLayerInStack(
  layers: StoryboardLayer[],
  layerId: string,
  direction: 'front' | 'back'
): StoryboardLayer[] {
  const list = layersFrontToBack(layers)
  const from = list.findIndex((l) => l.id === layerId)
  if (from < 0) return layers
  const to = direction === 'front' ? from - 1 : from + 1
  if (to < 0 || to >= list.length) return layers
  return reorderLayerToIndex(layers, layerId, to)
}

export function reorderLayerToIndex(
  layers: StoryboardLayer[],
  layerId: string,
  toFrontIndex: number
): StoryboardLayer[] {
  const list = layersFrontToBack(layers)
  const from = list.findIndex((l) => l.id === layerId)
  if (from < 0) return layers
  const clamped = Math.max(0, Math.min(list.length - 1, toFrontIndex))
  if (from === clamped) return compactLayerZOrders(list)
  const next = [...list]
  const [row] = next.splice(from, 1)
  next.splice(clamped, 0, row)
  return compactLayerZOrders(next)
}

export function toggleLayerVisible(
  layers: StoryboardLayer[],
  layerId: string,
  visible: boolean
): StoryboardLayer[] {
  return layers.map((layer) => (layer.id === layerId ? { ...layer, visible } : layer))
}
