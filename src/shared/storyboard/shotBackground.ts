/**
 * Shot static-background resolution: Library visual asset/state (full image,
 * never thumbnail as final art) or legacy/direct-import backgroundImage path.
 * Shared by storage, CLI, export, and the renderer (no Node APIs).
 */

import type { AssetPipelineProject, StoryboardShot } from '../types/assetPipeline'
import { getShotGameId, resolveVisualAssetImagePath } from './layerValidation'

export function clearShotBackgroundImageFields(shot: StoryboardShot): void {
  delete shot.backgroundImage
  delete shot.backgroundVisualAssetId
  delete shot.backgroundAssetStateId
}

/**
 * Full-resolution path for the canvas / export. Prefers a Game-scoped Library
 * visual asset (explicit state, else default, else static image). Falls back
 * to legacy `backgroundImage`. Missing/invalid refs return an error, not a throw.
 */
export function resolveShotBackgroundImagePath(
  shot: StoryboardShot,
  pipeline: AssetPipelineProject
): { path?: string; error?: string } {
  try {
    if (shot.backgroundVisualAssetId) {
      let gameId: string
      try {
        gameId = getShotGameId(pipeline, shot.id)
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
      const asset = (pipeline.visualAssets || []).find((a) => a.id === shot.backgroundVisualAssetId)
      if (!asset) {
        return { error: `Visual asset '${shot.backgroundVisualAssetId}' not found` }
      }
      if (asset.gameId !== gameId) {
        return {
          error: `Visual asset '${asset.name}' belongs to game '${asset.gameId}', not shot game '${gameId}'`
        }
      }
      const owned = (pipeline.assetStates || []).filter((s) => s.assetId === asset.id)
      if (shot.backgroundAssetStateId) {
        const state = owned.find((s) => s.id === shot.backgroundAssetStateId)
        if (!state) {
          return {
            error: `Asset state '${shot.backgroundAssetStateId}' not found for asset '${asset.name}'`
          }
        }
      }
      const resolved = resolveVisualAssetImagePath(asset, shot.backgroundAssetStateId, owned)
      if (resolved.path) return { path: resolved.path }
      return { error: resolved.error || `Visual asset '${asset.name}' has no static image` }
    }

    if (shot.backgroundAssetStateId) {
      return { error: 'backgroundAssetStateId requires backgroundVisualAssetId' }
    }

    if (shot.backgroundImage) {
      return { path: shot.backgroundImage }
    }

    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Throws on invalid Library refs. Legacy `backgroundImage` alone is allowed.
 */
export function validateShotBackgroundReferences(
  shot: StoryboardShot,
  pipeline: AssetPipelineProject
): void {
  if (!shot.backgroundVisualAssetId) {
    if (shot.backgroundAssetStateId) {
      throw new Error('backgroundAssetStateId requires backgroundVisualAssetId')
    }
    return
  }

  const resolved = resolveShotBackgroundImagePath(shot, pipeline)
  if (resolved.error) {
    throw new Error(resolved.error)
  }
  if (!resolved.path) {
    throw new Error('Library background asset has no resolvable image file')
  }
}
