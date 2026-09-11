import { readFile } from 'fs/promises'
import { basename, extname } from 'path'
import { toFile, type Uploadable } from 'openai'
import sharp from 'sharp'
import { getPreviewMimeType } from '../storage/previewMime'

const OPENAI_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png'
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

function uploadFileName(filePath: string, mime: string): string {
  const base = basename(filePath)
  if (extname(base)) return base
  const ext = mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '.png'
  return `${base}${ext}`
}

/** Build an OpenAI upload with a supported image MIME (never application/octet-stream). */
export async function openAIUploadableFromPath(filePath: string): Promise<Uploadable> {
  try {
    const pngBuffer = await sharp(filePath).png().toBuffer()
    return toFile(pngBuffer, uploadFileName(filePath, 'image/png'), { type: 'image/png' })
  } catch {
    const buffer = await readFile(filePath)
    let mime = getPreviewMimeType(filePath)
    if (!OPENAI_IMAGE_MIMES.has(mime)) {
      mime = detectImageMime(buffer) ?? 'image/png'
    }
    return toFile(buffer, uploadFileName(filePath, mime), { type: mime })
  }
}

export async function openAIUploadablesFromPaths(filePaths: string[]): Promise<Uploadable[]> {
  return Promise.all(filePaths.map((path) => openAIUploadableFromPath(path)))
}
