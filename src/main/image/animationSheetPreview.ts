import { mkdir } from 'fs/promises'
import { join } from 'path'
import type { ExportSpriteSize } from '@shared/types/project'
import { resolveExportSpriteSize } from '@shared/styleGuide'
import { getAsset } from '../storage/assetStore'
import { getGeneratedDir } from '../storage/filePaths'
import { normalizeSprite } from './normalizeSprite'
import { packSpriteSheet } from './spriteSheetPacker'
import { exportAtlasJson } from './atlasExporter'

export async function previewAnimationSpriteSheet(
  projectId: string,
  assetId: string,
  exportSizeOverride?: ExportSpriteSize
): Promise<{
  sheetPath: string
  atlasJsonPath: string
  frameWidth: number
  frameHeight: number
  frameCount: number
}> {
  const { project, asset } = await getAsset(projectId, assetId)
  const clip = asset.animationClips?.[0]
  if (!clip || clip.frames.length === 0) {
    throw new Error('No animation frames to pack')
  }

  const { width, height } = resolveExportSpriteSize(project.styleGuide, exportSizeOverride)
  const sorted = [...clip.frames].sort((a, b) => a.frameIndex - b.frameIndex)
  const approved = sorted.filter((f) => f.approved)
  const framesToPack = approved.length > 0 ? approved : sorted

  const outDir = getGeneratedDir(projectId, assetId)
  await mkdir(outDir, { recursive: true })

  const scaledPaths: string[] = []
  for (const frame of framesToPack) {
    const { outputPath } = await normalizeSprite(frame.imagePath, width, height, frame.baselineY)
    scaledPaths.push(outputPath)
  }

  const sheetPath = join(outDir, `preview_sheet_${width}x${height}.png`)
  const { frames: frameRects } = await packSpriteSheet(scaledPaths, width, height, sheetPath)

  const gameClip = { ...clip, frameWidth: width, frameHeight: height, frames: framesToPack }
  const atlasJsonPath = join(outDir, `preview_atlas_${width}x${height}.json`)
  await exportAtlasJson(gameClip, `preview_sheet_${width}x${height}.png`, frameRects, atlasJsonPath)

  return {
    sheetPath,
    atlasJsonPath,
    frameWidth: width,
    frameHeight: height,
    frameCount: framesToPack.length
  }
}
