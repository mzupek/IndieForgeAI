import sharp from 'sharp'
import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import type { StoryboardShot, Storyboard, AssetPipelineProject } from '@shared/types/assetPipeline'

/**
 * Generate thumbnail for a shot (simple placeholder for now)
 */
export async function generateShotThumbnail(
  shot: StoryboardShot,
  outputPath: string
): Promise<void> {
  // Create a simple placeholder thumbnail
  // In production, would render actual layers
  const width = 400
  const height = Math.floor(width / (shot.aspectRatio.width / shot.aspectRatio.height))
  
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#1a1a1a"/>
      <text x="50%" y="50%" font-family="Arial" font-size="16" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">
        ${shot.name}
      </text>
      <text x="50%" y="70%" font-family="Arial" font-size="12" fill="#999999" text-anchor="middle" dominant-baseline="middle">
        ${shot.layers.length} layer${shot.layers.length !== 1 ? 's' : ''} • ${shot.durationSec}s
      </text>
    </svg>
  `
  
  await mkdir(dirname(outputPath), { recursive: true })
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath)
}

/**
 * Generate contact sheet showing all shots in a storyboard
 */
export async function generateContactSheet(
  storyboard: Storyboard,
  shots: StoryboardShot[],
  outputPath: string
): Promise<void> {
  // Create grid layout
  const cols = Math.ceil(Math.sqrt(shots.length))
  const rows = Math.ceil(shots.length / cols)
  const thumbWidth = 300
  const thumbHeight = 169 // 16:9 aspect ratio
  const padding = 20
  const labelHeight = 40
  
  const sheetWidth = cols * thumbWidth + (cols + 1) * padding
  const sheetHeight = rows * (thumbHeight + labelHeight) + (rows + 1) * padding
  
  // Build SVG for contact sheet
  let svg = `
    <svg width="${sheetWidth}" height="${sheetHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${sheetWidth}" height="${sheetHeight}" fill="#ffffff"/>
      <text x="${padding}" y="${padding + 20}" font-family="Arial" font-size="24" font-weight="bold" fill="#000000">
        ${storyboard.name}
      </text>
  `
  
  shots.forEach((shot, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = padding + col * (thumbWidth + padding)
    const y = padding + 60 + row * (thumbHeight + labelHeight + padding)
    
    svg += `
      <rect x="${x}" y="${y}" width="${thumbWidth}" height="${thumbHeight}" fill="#1a1a1a" stroke="#cccccc" stroke-width="2"/>
      <text x="${x + thumbWidth / 2}" y="${y + thumbHeight / 2}" font-family="Arial" font-size="14" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">
        Shot ${idx + 1}
      </text>
      <text x="${x}" y="${y + thumbHeight + 25}" font-family="Arial" font-size="12" fill="#000000">
        ${shot.name} (${shot.durationSec}s)
      </text>
    `
  })
  
  svg += '</svg>'
  
  await mkdir(dirname(outputPath), { recursive: true })
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath)
}

/**
 * Generate thumbnails for all shots in storyboards during export
 */
export async function generateStoryboardThumbnails(
  pipeline: AssetPipelineProject,
  gameId: string,
  exportDir: string
): Promise<void> {
  const storyboards = pipeline.storyboards?.filter(sb => sb.gameId === gameId) ?? []
  
  for (const storyboard of storyboards) {
    const shots = pipeline.storyboardShots?.filter(shot => storyboard.shotIds.includes(shot.id)) ?? []
    
    // Generate individual shot thumbnails
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]
      const thumbPath = join(exportDir, 'storyboards', storyboard.id, `shot-${i + 1}.png`)
      await generateShotThumbnail(shot, thumbPath)
    }
    
    // Generate contact sheet
    const contactSheetPath = join(exportDir, 'storyboards', `${storyboard.id}-contact-sheet.png`)
    await generateContactSheet(storyboard, shots, contactSheetPath)
  }
}
