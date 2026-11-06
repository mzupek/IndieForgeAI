import { copyFile, mkdir } from 'fs/promises'
import { extname, join } from 'path'
import sharp from 'sharp'
import type { VisualAsset } from '@shared/types/assetPipeline'
import { getDataDir } from './dataDir'
import { getVisualAsset, updateVisualAsset } from './studioStorage'

/**
 * Copy a PNG into app-owned storage for a static (no dummy state) visual asset.
 */
export async function importStaticAssetImage(
  assetId: string,
  sourcePath: string,
  dataDirOverride?: string
): Promise<VisualAsset> {
  const asset = await getVisualAsset(assetId, dataDirOverride)
  if (!asset) {
    throw new Error(`Visual asset not found: ${assetId}`)
  }

  const ext = extname(sourcePath).toLowerCase()
  if (ext !== '.png') {
    throw new Error(`Image must be PNG format, got: ${ext || 'unknown'}`)
  }

  const dataDir = getDataDir(dataDirOverride)
  const assetsDir = join(dataDir, 'assets', assetId)
  await mkdir(assetsDir, { recursive: true })

  const imagePath = join(assetsDir, 'image.png')
  const thumbPath = join(assetsDir, 'thumbnail.png')

  await copyFile(sourcePath, imagePath)
  await sharp(sourcePath)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(thumbPath)

  asset.image = imagePath
  asset.thumbnail = thumbPath
  asset.updatedAt = new Date().toISOString()
  await updateVisualAsset(asset, dataDirOverride)
  return asset
}
