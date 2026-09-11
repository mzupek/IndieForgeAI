import sharp from 'sharp'
import { dirname, join } from 'path'

export async function normalizeSprite(
  inputPath: string,
  width: number,
  height: number,
  baselineY?: number
): Promise<{ outputPath: string }> {
  const out = join(dirname(inputPath), `normalized_${width}x${height}.png`)

  await sharp(inputPath)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.nearest
    })
    .png()
    .toFile(out)

  if (baselineY !== undefined) {
    void baselineY
  }

  return { outputPath: out }
}
