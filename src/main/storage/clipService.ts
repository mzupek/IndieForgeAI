import { randomUUID } from 'crypto'
import { copyFile, mkdir } from 'fs/promises'
import { basename, extname, join } from 'path'
import { promisify } from 'util'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import ffprobePath from 'ffprobe-static'
import type { Clip, ClipMoment } from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from '@core/storage/studioStorage'
import { getDataDir } from '@core/storage/dataDir'

// Set ffmpeg and ffprobe paths
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath)
}
if (ffprobePath && ffprobePath.path) {
  ffmpeg.setFfprobePath(ffprobePath.path)
}

function getClipsDir(dataDirOverride?: string): string {
  return join(getDataDir(dataDirOverride), 'clips')
}

/**
 * Get video duration using ffmpeg
 */
export async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err)
        return
      }
      
      const duration = metadata.format.duration
      if (duration === undefined) {
        reject(new Error('Could not detect video duration'))
        return
      }
      
      resolve(duration)
    })
  })
}

/**
 * Generate thumbnail from video at 0.5s mark
 */
export async function generateThumbnail(
  videoPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['0.5'],
        filename: basename(outputPath),
        folder: join(outputPath, '..'),
        size: '256x256'
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
  })
}

/**
 * Import a clip
 */
export async function importClip(
  sourcePath: string,
  moment: ClipMoment,
  options: {
    gameId?: string
    characterId?: string
    tags?: string[]
    dataDirOverride?: string
  }
): Promise<Clip> {
  const pipeline = await getAssetPipeline(options.dataDirOverride)
  
  // Verify game exists if provided
  if (options.gameId && !pipeline.games.some(g => g.id === options.gameId)) {
    throw new Error(`Game not found: ${options.gameId}`)
  }
  
  // Verify character exists if provided
  if (options.characterId && !pipeline.characters.some(c => c.id === options.characterId)) {
    throw new Error(`Character not found: ${options.characterId}`)
  }
  
  const clipsDir = getClipsDir(options.dataDirOverride)
  await mkdir(clipsDir, { recursive: true })
  
  const now = new Date().toISOString()
  const clipId = randomUUID()
  const ext = extname(sourcePath)
  
  const clipPath = join(clipsDir, `${clipId}_clip${ext}`)
  const thumbPath = join(clipsDir, `${clipId}_thumb.png`)
  
  // Copy video file
  await copyFile(sourcePath, clipPath)
  
  // Get duration
  const durationSec = await getVideoDuration(clipPath)
  
  // Generate thumbnail
  await generateThumbnail(clipPath, thumbPath)
  
  const clip: Clip = {
    id: clipId,
    characterId: options.characterId,
    moment,
    file: clipPath,
    durationSec,
    tags: options.tags || [],
    thumbnail: thumbPath,
    createdAt: now,
    updatedAt: now
  }
  
  pipeline.clips.push(clip)
  await updateAssetPipeline(pipeline, options.dataDirOverride)
  
  return clip
}

/**
 * Remove a clip
 */
export async function removeClip(
  clipId: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  pipeline.clips = pipeline.clips.filter(c => c.id !== clipId)
  
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Update clip metadata
 */
export async function updateClip(
  clipId: string,
  patch: Partial<Omit<Clip, 'id' | 'file' | 'durationSec' | 'thumbnail' | 'createdAt'>>,
  dataDirOverride?: string
): Promise<Clip> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const index = pipeline.clips.findIndex(c => c.id === clipId)
  if (index === -1) {
    throw new Error(`Clip not found: ${clipId}`)
  }
  
  const existing = pipeline.clips[index]
  const updated: Clip = {
    ...existing,
    ...patch,
    id: existing.id,
    file: existing.file,
    durationSec: existing.durationSec,
    thumbnail: existing.thumbnail,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  }
  
  pipeline.clips[index] = updated
  await updateAssetPipeline(pipeline, dataDirOverride)
  
  return updated
}
