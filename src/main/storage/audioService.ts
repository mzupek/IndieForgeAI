/**
 * A1: Import and manage Game-scoped studio-owned audio files.
 * Does not generate audio, does not call Suno/Runway, does not copy Unity projects.
 */

import { randomUUID } from 'crypto'
import { access, copyFile, mkdir, unlink } from 'fs/promises'
import { basename, extname, join } from 'path'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import ffprobePath from 'ffprobe-static'
import type { AudioAsset, AudioKind } from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from '@core/storage/studioStorage'
import { getDataDir } from '@core/storage/dataDir'
import {
  collectAudioUsage,
  ensureAudioArrays,
  formatAudioInUseError,
  isSupportedAudioMedia,
  parseAudioKind,
  unsupportedAudioMediaMessage
} from '../../shared/storyboard/audioValidation'
import { assertReplacementFitsAudioBlocks } from '../../shared/storyboard/audioBlocks'

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath)
}
if (ffprobePath && ffprobePath.path) {
  ffmpeg.setFfprobePath(ffprobePath.path)
}

function getAudioDir(dataDirOverride?: string): string {
  return join(getDataDir(dataDirOverride), 'audio')
}

export async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Could not read audio duration: ${err.message}`))
        return
      }
      const duration = metadata.format.duration
      if (duration === undefined || !Number.isFinite(duration) || duration <= 0) {
        reject(new Error(`Could not detect audio duration: ${filePath}`))
        return
      }
      resolve(duration)
    })
  })
}

async function assertReadableAudioFile(sourcePath: string): Promise<void> {
  try {
    await access(sourcePath)
  } catch {
    throw new Error(`File not found: ${sourcePath}`)
  }
  if (!isSupportedAudioMedia(sourcePath)) {
    throw new Error(unsupportedAudioMediaMessage(sourcePath))
  }
}

export async function importAudio(
  sourcePath: string,
  options: {
    gameId: string
    kind: AudioKind | string
    name?: string
    tags?: string[]
    engineNotes?: string
    dataDirOverride?: string
  }
): Promise<AudioAsset> {
  const pipeline = await getAssetPipeline(options.dataDirOverride)
  ensureAudioArrays(pipeline)

  if (!pipeline.games.some((g) => g.id === options.gameId)) {
    throw new Error(`Game not found: ${options.gameId}`)
  }

  await assertReadableAudioFile(sourcePath)
  const kind = parseAudioKind(options.kind)

  const now = new Date().toISOString()
  const audioId = randomUUID()
  const ext = extname(sourcePath).toLowerCase()
  const destDir = join(getAudioDir(options.dataDirOverride), audioId)
  await mkdir(destDir, { recursive: true })
  const destPath = join(destDir, `audio${ext}`)

  await copyFile(sourcePath, destPath)

  let durationSec: number
  try {
    durationSec = await getAudioDuration(destPath)
  } catch (err) {
    try {
      await unlink(destPath)
    } catch {
      /* ignore */
    }
    throw err
  }

  const name =
    (options.name && options.name.trim()) ||
    basename(sourcePath, extname(sourcePath)) ||
    'Audio'

  const asset: AudioAsset = {
    id: audioId,
    gameId: options.gameId,
    name,
    kind,
    tags: options.tags || [],
    file: destPath,
    durationSec,
    engineNotes: options.engineNotes?.trim() || undefined,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }

  pipeline.audioAssets.push(asset)
  await updateAssetPipeline(pipeline, options.dataDirOverride)
  return asset
}

export async function getAudioAsset(
  audioId: string,
  dataDirOverride?: string
): Promise<AudioAsset | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureAudioArrays(pipeline)
  return pipeline.audioAssets.find((a) => a.id === audioId)
}

export async function listAudioAssets(
  gameId: string,
  dataDirOverride?: string
): Promise<AudioAsset[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureAudioArrays(pipeline)
  if (!pipeline.games.some((g) => g.id === gameId)) {
    throw new Error(`Game not found: ${gameId}`)
  }
  return pipeline.audioAssets.filter((a) => a.gameId === gameId)
}

export async function updateAudio(
  audioId: string,
  patch: {
    name?: string
    kind?: AudioKind | string
    tags?: string[]
    engineNotes?: string | null
    file?: string
  },
  options: { gameId: string; dataDirOverride?: string }
): Promise<AudioAsset> {
  const pipeline = await getAssetPipeline(options.dataDirOverride)
  ensureAudioArrays(pipeline)

  const index = pipeline.audioAssets.findIndex((a) => a.id === audioId)
  if (index === -1) {
    throw new Error(`Audio not found: ${audioId}`)
  }

  const existing = pipeline.audioAssets[index]
  if (existing.gameId !== options.gameId) {
    throw new Error(
      `Audio '${existing.name}' belongs to game '${existing.gameId}', not '${options.gameId}'`
    )
  }

  let file = existing.file
  let durationSec = existing.durationSec

  if (patch.file) {
    await assertReadableAudioFile(patch.file)
    durationSec = await getAudioDuration(patch.file)
    assertReplacementFitsAudioBlocks(pipeline, audioId, durationSec)
    const ext = extname(patch.file).toLowerCase()
    const destDir = join(getAudioDir(options.dataDirOverride), existing.id)
    await mkdir(destDir, { recursive: true })
    const destPath = join(destDir, `audio${ext}`)
    await copyFile(patch.file, destPath)
    file = destPath
  }

  let engineNotes = existing.engineNotes
  if (patch.engineNotes === null || patch.engineNotes === '') {
    engineNotes = undefined
  } else if (patch.engineNotes !== undefined) {
    engineNotes = patch.engineNotes.trim() || undefined
  }

  const updated: AudioAsset = {
    ...existing,
    name: patch.name !== undefined ? patch.name.trim() || existing.name : existing.name,
    kind: patch.kind !== undefined ? parseAudioKind(patch.kind) : existing.kind,
    tags: patch.tags !== undefined ? patch.tags : existing.tags,
    engineNotes,
    file,
    durationSec,
    id: existing.id,
    gameId: existing.gameId,
    createdAt: existing.createdAt,
    schemaVersion: 1,
    updatedAt: new Date().toISOString()
  }

  pipeline.audioAssets[index] = updated
  await updateAssetPipeline(pipeline, options.dataDirOverride)
  return updated
}

export async function removeAudio(
  audioId: string,
  options: { gameId: string; dataDirOverride?: string }
): Promise<void> {
  const pipeline = await getAssetPipeline(options.dataDirOverride)
  ensureAudioArrays(pipeline)
  const asset = pipeline.audioAssets.find((a) => a.id === audioId)
  if (!asset) throw new Error(`Audio not found: ${audioId}`)
  if (asset.gameId !== options.gameId) {
    throw new Error(`Audio '${asset.name}' belongs to game '${asset.gameId}', not '${options.gameId}'`)
  }
  const usage = collectAudioUsage(pipeline, audioId)
  if (usage.labels.length > 0) {
    throw new Error(formatAudioInUseError(asset.name, usage.labels))
  }
  pipeline.audioAssets = pipeline.audioAssets.filter((a) => a.id !== audioId)
  await updateAssetPipeline(pipeline, options.dataDirOverride)
}
