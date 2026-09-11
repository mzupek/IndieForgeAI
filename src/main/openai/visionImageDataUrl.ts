import { readFile } from 'fs/promises'
import sharp from 'sharp'
import { getPreviewMimeType } from '../storage/previewMime'

/** Resize and encode for GPT-4o vision — avoids octet-stream and huge payloads. */
export async function visionImageToDataUrl(filePath: string): Promise<string> {
  try {
    const buffer = await sharp(filePath)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } catch {
    const data = await readFile(filePath)
    const mime = getPreviewMimeType(filePath)
    if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/gif') {
      return `data:${mime};base64,${data.toString('base64')}`
    }
    throw new Error(`Unsupported image for vision analysis: ${filePath}`)
  }
}
