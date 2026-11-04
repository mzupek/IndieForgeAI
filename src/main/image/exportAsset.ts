import { copyFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { ExportSpriteSize } from '@shared/types/project'
import { resolveExportSpriteSize } from '@shared/styleGuide'
import { loadProject } from '../storage/projectStore'
import { getAsset } from '../storage/assetStore'
import { normalizeSprite } from './normalizeSprite'

function safeName(name: string): string {
  return name.replace(/\s+/g, '_').replace(/[^\w.-]/g, '')
}

export async function exportAssetDesignCopy(
  sourcePath: string,
  exportDir: string,
  assetName: string
): Promise<string> {
  await mkdir(exportDir, { recursive: true })
  const dest = join(exportDir, `${safeName(assetName)}_design.png`)
  await copyFile(sourcePath, dest)
  return dest
}

export async function exportAssetGameReady(
  sourcePath: string,
  exportDir: string,
  assetName: string,
  exportWidth: number,
  exportHeight: number
): Promise<string> {
  await mkdir(exportDir, { recursive: true })
  const dest = join(exportDir, `${safeName(assetName)}_${exportWidth}x${exportHeight}.png`)
  const { outputPath } = await normalizeSprite(sourcePath, exportWidth, exportHeight)
  await copyFile(outputPath, dest)
  return dest
}

export async function exportSingleAsset(
  projectId: string,
  assetId: string,
  exportDir: string,
  mode: 'design' | 'game' | 'both',
  exportSizeOverride?: ExportSpriteSize
): Promise<{ copiedPaths: string[] }> {
  const { project, asset } = await getAsset(projectId, assetId)
  if (!asset.filePath) {
    throw new Error('This asset has no image to export yet — generate or import one first')
  }

  const { width: exportW, height: exportH } = resolveExportSpriteSize(
    project.styleGuide,
    exportSizeOverride
  )
  const isBackground = asset.type === 'background'
  const copiedPaths: string[] = []
  await mkdir(exportDir, { recursive: true })

  if (mode === 'design' || mode === 'both') {
    copiedPaths.push(await exportAssetDesignCopy(asset.filePath, exportDir, asset.name))
  }

  if (mode === 'game' || mode === 'both') {
    if (isBackground) {
      const dest = join(
        exportDir,
        `${safeName(asset.name)}_${project.styleGuide.defaultBackgroundWidth}x${project.styleGuide.defaultBackgroundHeight}.png`
      )
      const { resizeImage } = await import('./resizeImage')
      const { outputPath } = await resizeImage(
        asset.filePath,
        project.styleGuide.defaultBackgroundWidth,
        project.styleGuide.defaultBackgroundHeight,
        dest
      )
      copiedPaths.push(outputPath)
    } else {
      copiedPaths.push(await exportAssetGameReady(asset.filePath, exportDir, asset.name, exportW, exportH))
    }
  }

  return { copiedPaths }
}

export async function exportProjectVisualAssets(
  projectId: string,
  exportDir: string,
  mode: 'design' | 'game' | 'both',
  exportSizeOverride?: ExportSpriteSize
): Promise<{ copiedPaths: string[] }> {
  const project = await loadProject(projectId)
  const { width: exportW, height: exportH } = resolveExportSpriteSize(
    project.styleGuide,
    exportSizeOverride
  )
  const visualTypes = new Set(['sprite', 'animation', 'prop', 'effect', 'ui_icon', 'background'])
  const copiedPaths: string[] = []

  const outRoot = join(exportDir, mode === 'design' ? 'design' : mode === 'game' ? 'game_ready' : 'export')
  await mkdir(outRoot, { recursive: true })

  for (const asset of project.assets) {
    if (!asset.filePath || !visualTypes.has(asset.type)) continue

    if (mode === 'design' || mode === 'both') {
      const designDir = mode === 'both' ? join(outRoot, 'design') : outRoot
      copiedPaths.push(await exportAssetDesignCopy(asset.filePath, designDir, asset.name))
    }

    if (mode === 'game' || mode === 'both') {
      const gameDir = mode === 'both' ? join(outRoot, 'game_ready') : outRoot
      if (asset.type === 'background') {
        const dest = join(gameDir, `${safeName(asset.name)}_${project.styleGuide.defaultBackgroundWidth}x${project.styleGuide.defaultBackgroundHeight}.png`)
        await mkdir(gameDir, { recursive: true })
        const { resizeImage } = await import('./resizeImage')
        const { outputPath } = await resizeImage(
          asset.filePath,
          project.styleGuide.defaultBackgroundWidth,
          project.styleGuide.defaultBackgroundHeight,
          dest
        )
        copiedPaths.push(outputPath)
      } else {
        copiedPaths.push(
          await exportAssetGameReady(asset.filePath, gameDir, asset.name, exportW, exportH)
        )
      }
    }
  }

  return { copiedPaths }
}

/**
 * Removed: exportAnimationAtlas (animation frame packing removed in Phase 0)
 * Animation clips and sprite sheets are out of scope for the asset pipeline refactor.
 */
export async function exportAnimationAtlas(
  _projectId: string,
  _assetId: string,
  _exportDir: string,
  _mode: 'design' | 'game' | 'both',
  _exportSizeOverride?: ExportSpriteSize
): Promise<{
  designSheetPath?: string
  gameSheetPath?: string
  atlasJsonPath?: string
  pngPaths: string[]
}> {
  throw new Error('Animation atlas export removed in Phase 0 refactor')
}
