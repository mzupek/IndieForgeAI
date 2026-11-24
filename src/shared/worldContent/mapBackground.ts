/**
 * World map background: full-resolution image (never the 256² library thumbnail
 * as primary art). Shared by the World Map tab. Coordinates are 0..1 of the
 * image's native-aspect surface.
 */

import type { AssetState, VisualAsset } from '../types/assetPipeline'

export const DEFAULT_MAP_ASPECT = { width: 16, height: 9 }

export type MapPixelSize = { width: number; height: number }

function validSize(size?: MapPixelSize | null): MapPixelSize | undefined {
  if (!size) return undefined
  if (!(size.width > 0) || !(size.height > 0)) return undefined
  return { width: size.width, height: size.height }
}

/**
 * Full-resolution path for the world map surface.
 * Prefers the default state's file, else asset.image, else the thumbnail
 * only when no full image exists. Game-scoped. Never throws.
 */
export function resolveWorldMapBackgroundPath(
  asset: VisualAsset | null | undefined,
  states: AssetState[],
  options?: { gameId?: string }
): { path?: string } {
  if (!asset) return {}
  try {
    if (options?.gameId && asset.gameId !== options.gameId) {
      return {}
    }
    const owned = (states || []).filter((s) => s && s.assetId === asset.id)
    if (asset.defaultStateId) {
      const def = owned.find((s) => s.id === asset.defaultStateId)
      if (def?.file) return { path: def.file }
    }
    if (asset.image) return { path: asset.image }
    if (asset.thumbnail) return { path: asset.thumbnail }
    return {}
  } catch {
    return {}
  }
}

/**
 * Native aspect for the map surface: authored pixelSize if present,
 * else decoded natural size, else 16:9.
 */
export function mapSurfaceAspect(
  pixelSize?: MapPixelSize | null,
  natural?: MapPixelSize | null
): MapPixelSize {
  return validSize(pixelSize) || validSize(natural) || { ...DEFAULT_MAP_ASPECT }
}
