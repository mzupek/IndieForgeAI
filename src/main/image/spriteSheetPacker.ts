import sharp from 'sharp'
import { join } from 'path'
import type { FrameRect } from '@shared/types/project'

export async function packSpriteSheet(
  framePaths: string[],
  frameWidth: number,
  frameHeight: number,
  outputPath: string
): Promise<{ sheetPath: string; frames: FrameRect[] }> {
  const cols = Math.ceil(Math.sqrt(framePaths.length))
  const rows = Math.ceil(framePaths.length / cols)
  const sheetWidth = cols * frameWidth
  const sheetHeight = rows * frameHeight

  const composites: sharp.OverlayOptions[] = []
  const frames: FrameRect[] = []

  for (let i = 0; i < framePaths.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * frameWidth
    const y = row * frameHeight

    const frameBuffer = await sharp(framePaths[i])
      .resize(frameWidth, frameHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer()

    composites.push({ input: frameBuffer, left: x, top: y })
    frames.push({ x, y, w: frameWidth, h: frameHeight, frameIndex: i })
  }

  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outputPath)

  return { sheetPath: outputPath, frames }
}
