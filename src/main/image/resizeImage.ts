import sharp from 'sharp'
import { dirname, join } from 'path'

export async function resizeImage(
  inputPath: string,
  width: number,
  height: number,
  outputPath?: string
): Promise<{ outputPath: string }> {
  const out = outputPath ?? join(dirname(inputPath), `resized_${width}x${height}.png`)
  await sharp(inputPath)
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out)
  return { outputPath: out }
}
