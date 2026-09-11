import sharp from 'sharp'
import { mkdir } from 'fs/promises'
import { join } from 'path'

interface ColumnRun {
  start: number
  end: number
}

/**
 * Detect content column-runs in a transparent strip by scanning the alpha
 * channel for vertical gutters between frames. Returns runs left-to-right.
 */
async function detectContentRuns(stripPath: string, width: number, height: number): Promise<ColumnRun[]> {
  const { data, info } = await sharp(stripPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = info.channels
  const alphaThreshold = 12
  const columnHasContent: boolean[] = new Array(width).fill(false)

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * channels + (channels - 1)
      if (data[idx] > alphaThreshold) {
        columnHasContent[x] = true
        break
      }
    }
  }

  const runs: ColumnRun[] = []
  let runStart = -1
  for (let x = 0; x < width; x++) {
    if (columnHasContent[x] && runStart === -1) {
      runStart = x
    } else if (!columnHasContent[x] && runStart !== -1) {
      runs.push({ start: runStart, end: x - 1 })
      runStart = -1
    }
  }
  if (runStart !== -1) runs.push({ start: runStart, end: width - 1 })

  return runs
}

/**
 * Slice a horizontal sprite strip into N cell PNGs.
 *
 * First tries content-aware segmentation (splitting on transparent gutters so
 * a frame is never cut in half). If that doesn't yield exactly N frames, falls
 * back to N equal-width columns. Each frame is placed on a uniform square
 * canvas anchored at the bottom so every frame shares the same baseline.
 */
export async function sliceHorizontalStrip(
  stripPath: string,
  cellCount: number,
  outDir: string,
  namePrefix = 'frame'
): Promise<string[]> {
  await mkdir(outDir, { recursive: true })
  const meta = await sharp(stripPath).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width === 0 || height === 0) throw new Error('Could not read sprite strip dimensions')

  let runs: ColumnRun[] = []
  try {
    const detected = await detectContentRuns(stripPath, width, height)
    // Drop slivers (noise) narrower than 2% of the strip width.
    const minRunWidth = Math.max(4, Math.floor(width * 0.02))
    const filtered = detected.filter((r) => r.end - r.start + 1 >= minRunWidth)
    if (filtered.length === cellCount) runs = filtered
  } catch {
    runs = []
  }

  // Fallback: equal columns.
  if (runs.length !== cellCount) {
    const cellWidth = Math.floor(width / cellCount)
    runs = []
    for (let i = 0; i < cellCount; i++) {
      const start = i * cellWidth
      const end = i === cellCount - 1 ? width - 1 : start + cellWidth - 1
      runs.push({ start, end })
    }
  }

  const maxRunWidth = Math.max(...runs.map((r) => r.end - r.start + 1))
  const pad = Math.floor(maxRunWidth * 0.04)
  const canvasSize = Math.max(maxRunWidth + pad * 2, height)
  const outPaths: string[] = []

  for (let i = 0; i < runs.length; i++) {
    const left = Math.max(0, runs[i].start - pad)
    const right = Math.min(width - 1, runs[i].end + pad)
    const w = right - left + 1

    const cellBuffer = await sharp(stripPath)
      .extract({ left, top: 0, width: w, height })
      .png()
      .toBuffer()

    const outPath = join(outDir, `${namePrefix}_${i}_design.png`)
    await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: cellBuffer, gravity: 'south' }])
      .png()
      .toFile(outPath)

    outPaths.push(outPath)
  }

  return outPaths
}
