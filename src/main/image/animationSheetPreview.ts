import type { ExportSpriteSize } from '@shared/types/project'

/**
 * Removed: previewAnimationSpriteSheet (animation frame packing removed in Phase 0)
 * Animation clips and sprite sheets are out of scope for the asset pipeline refactor.
 */
export async function previewAnimationSpriteSheet(
  _projectId: string,
  _assetId: string,
  _exportSizeOverride?: ExportSpriteSize
): Promise<{
  sheetPath: string
  atlasJsonPath: string
  frameWidth: number
  frameHeight: number
  frameCount: number
}> {
  throw new Error('Animation sheet preview removed in Phase 0 refactor')
}
