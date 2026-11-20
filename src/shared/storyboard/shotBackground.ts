/**
 * Shot static-background resolution: Library visual asset/state (full image,
 * never thumbnail as final art) or legacy/direct-import backgroundImage path.
 * Shared by storage, CLI, export, and the renderer (no Node APIs).
 */

import type { AssetPipelineProject, StoryboardShot } from '../types/assetPipeline'
import { getShotGameId, resolveVisualAssetImagePath } from './layerValidation'

export type BackgroundStillRefs = {
  backgroundVisualAssetId?: string
  backgroundAssetStateId?: string | null
  backgroundImage?: string
}

export function clearShotBackgroundImageFields(shot: StoryboardShot): void {
  delete shot.backgroundImage
  delete shot.backgroundVisualAssetId
  delete shot.backgroundAssetStateId
}

/**
 * Full-resolution path for one still (static shot fields or a timed key).
 * Prefers a Game-scoped Library visual asset (explicit state, else default,
 * else static image). Falls back to a direct-import `backgroundImage`.
 * Missing/invalid refs return an error, not a throw.
 */
export function resolveBackgroundStillRefs(
  refs: BackgroundStillRefs,
  pipeline: AssetPipelineProject,
  shotId: string
): { path?: string; error?: string } {
  try {
    if (refs.backgroundVisualAssetId) {
      let gameId: string
      try {
        gameId = getShotGameId(pipeline, shotId)
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
      const asset = (pipeline.visualAssets || []).find((a) => a.id === refs.backgroundVisualAssetId)
      if (!asset) {
        return { error: `Visual asset '${refs.backgroundVisualAssetId}' not found` }
      }
      if (asset.gameId !== gameId) {
        return {
          error: `Visual asset '${asset.name}' belongs to game '${asset.gameId}', not shot game '${gameId}'`
        }
      }
      const owned = (pipeline.assetStates || []).filter((s) => s.assetId === asset.id)
      if (refs.backgroundAssetStateId) {
        const state = owned.find((s) => s.id === refs.backgroundAssetStateId)
        if (!state) {
          return {
            error: `Asset state '${refs.backgroundAssetStateId}' not found for asset '${asset.name}'`
          }
        }
      }
      const resolved = resolveVisualAssetImagePath(asset, refs.backgroundAssetStateId, owned)
      if (resolved.path) return { path: resolved.path }
      return { error: resolved.error || `Visual asset '${asset.name}' has no static image` }
    }

    if (refs.backgroundAssetStateId) {
      return { error: 'backgroundAssetStateId requires backgroundVisualAssetId' }
    }

    if (refs.backgroundImage) {
      return { path: refs.backgroundImage }
    }

    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
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
  return resolveBackgroundStillRefs(shot, pipeline, shot.id)
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
