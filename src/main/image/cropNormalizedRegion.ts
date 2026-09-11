import sharp from 'sharp'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { NormalizedRect } from '@shared/types/project'
import { clamp01 } from '@shared/sceneDefaults'

/**
 * Crop a normalized (0–1) region from an image, with optional padding around the
 * slot so the model sees neighboring field/terrain context.
 */
export async function cropNormalizedRegion(
  sourcePath: string,
  bounds: NormalizedRect,
  outputPath: string,
  options?: { padRatio?: number }
): Promise<{ outputPath: string; width: number; height: number }> {
  const padRatio = options?.padRatio ?? 0.12
  const meta = await sharp(sourcePath).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width === 0 || height === 0) {
    throw new Error(`Could not read image dimensions: ${sourcePath}`)
  }

  const padX = bounds.width * padRatio
  const padY = bounds.height * padRatio
  const leftN = clamp01(bounds.x - padX)
  const topN = clamp01(bounds.y - padY)
  const rightN = clamp01(bounds.x + bounds.width + padX)
  const bottomN = clamp01(bounds.y + bounds.height + padY)

  const left = Math.max(0, Math.floor(leftN * width))
  const top = Math.max(0, Math.floor(topN * height))
  const right = Math.min(width, Math.ceil(rightN * width))
  const bottom = Math.min(height, Math.ceil(bottomN * height))
  const cropW = Math.max(1, right - left)
  const cropH = Math.max(1, bottom - top)

  await mkdir(dirname(outputPath), { recursive: true })
  await sharp(sourcePath)
    .extract({ left, top, width: cropW, height: cropH })
    .png()
    .toFile(outputPath)

  return { outputPath, width: cropW, height: cropH }
}
