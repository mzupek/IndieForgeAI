import { createHash } from 'crypto'
import { copyFile, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, join, relative, isAbsolute, resolve } from 'path'
import { existsSync } from 'fs'
import type {
  ExportManifest,
  ExportValidation,
  ExportDryRun,
  ExportManifestCharacter,
  ExportManifestClip,
  ExportManifestPreset,
  ExportManifestStoryboard
} from '@shared/types/exportManifest'
import { EXPORT_MANIFEST_SCHEMA_VERSION } from '@shared/types/exportManifest'
import { getAssetPipeline, saveStudio } from './studioStorage'
import type { Game } from '@shared/types/assetPipeline'
import { homedir } from 'os'

/**
 * Expand ~ to home directory
 */
function expandHome(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return join(homedir(), path.slice(1))
  }
  return path
}

/**
 * Get default export target for a game based on ID and engine
 */
function getDefaultExportTarget(game: Game): string {
  const homeDir = homedir()
  
  // Default paths for known games
  if (game.id === 'game-neon-recall') {
    return join(homeDir, 'Documents/Agencies/1182/Neon_Recall')
  } else if (game.id === 'game-ring-em-up' || game.id === 'game-ringemup') {
    return join(homeDir, 'Documents/Agencies/1182/RingEmUp')
  }
  
  // Fallback: Documents/<GameName>
  return join(homeDir, 'Documents', game.name.replace(/[^a-zA-Z0-9]/g, ''))
}

/**
 * Ensure game has a valid absolute export target, migrating if needed
 */
async function ensureExportTarget(gameId: string, dataDirOverride?: string): Promise<string> {
  const { updateAssetPipeline } = require('./studioStorage')
  const pipeline = await getAssetPipeline(dataDirOverride)
  const game = pipeline.games.find(g => g.id === gameId)
  
  if (!game) {
    throw new Error(`Game not found: ${gameId}`)
  }
  
  let target = game.exportTarget
  
  // If no exportTarget or it's relative, set default and save
  if (!target || !isAbsolute(expandHome(target))) {
    target = getDefaultExportTarget(game)
    
    // Update the game in the pipeline
    game.exportTarget = target
    game.updatedAt = new Date().toISOString()
    
    // Save the migration
    await updateAssetPipeline(pipeline, dataDirOverride)
  }
  
  return expandHome(target)
}

/**
 * Get the export target directory for a game
 */
async function getExportTargetDir(gameId: string, dataDirOverride?: string): Promise<string> {
  const target = await ensureExportTarget(gameId, dataDirOverride)
  
  // Validate it's absolute
  if (!isAbsolute(target)) {
    throw new Error(`Export target must be an absolute path: ${target}`)
  }
  
  // Get game to determine engine
  const pipeline = await getAssetPipeline(dataDirOverride)
  const game = pipeline.games.find(g => g.id === gameId)
  
  if (!game) {
    throw new Error(`Game not found: ${gameId}`)
  }
  
  // Add engine-specific subfolder
  if (game.engine === 'unity') {
    return join(target, 'Assets', 'IndieForge', gameId)
  } else if (game.engine === 'godot') {
    return join(target, 'assets', 'indie_forge', gameId)
  }
  
  return target
}

/**
 * Validate a game for export readiness
 */
export async function validateExport(
  gameId: string,
  dataDirOverride?: string
): Promise<ExportValidation> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const game = pipeline.games.find(g => g.id === gameId)
  
  if (!game) {
    return {
      canExport: false,
      errors: [`Game not found: ${gameId}`],
      warnings: [],
      incompleteCharacters: []
    }
  }
  
  const warnings: string[] = []
  const errors: string[] = []
  const incompleteCharacters: Array<{ id: string; name: string; missingSlots: string[] }> = []
  
  // Check characters and their poses
  const characters = pipeline.characters.filter(c => c.gameId === gameId)
  
  for (const character of characters) {
    const poses = pipeline.poses.filter(p => p.characterId === character.id)
    const approvedPoses = poses.filter(p => p.status === 'approved')
    
    const slots = ['ready', 'success', 'hurt', 'win', 'defeat']
    const missingSlots = slots.filter(slot => 
      !approvedPoses.some(p => p.slot === slot)
    )
    
    if (missingSlots.length > 0) {
      incompleteCharacters.push({
        id: character.id,
        name: character.name,
        missingSlots
      })
      warnings.push(
        `Character "${character.name}" missing approved poses: ${missingSlots.join(', ')}`
      )
    }
    
    // Check file existence for approved poses
    for (const pose of approvedPoses) {
      if (!existsSync(pose.file)) {
        errors.push(`Pose file not found: ${pose.file} (${character.name} ${pose.slot})`)
      }
    }
  }
  
  // Check clip files
  const clips = pipeline.clips
  for (const clip of clips) {
    if (!existsSync(clip.file)) {
      errors.push(`Clip file not found: ${clip.file}`)
    }
    if (clip.thumbnail && !existsSync(clip.thumbnail)) {
      errors.push(`Clip thumbnail not found: ${clip.thumbnail}`)
    }
  }
  
  // Warnings don't prevent export, errors do
  const canExport = errors.length === 0
  
  return {
    canExport,
    warnings,
    errors,
    incompleteCharacters
  }
}

/**
 * Calculate file hash for change detection
 */
async function getFileHash(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath)
    return createHash('sha256').update(content).digest('hex')
  } catch {
    return ''
  }
}

/**
 * Check if a file needs to be copied (new or modified)
 */
async function needsCopy(source: string, destination: string): Promise<'new' | 'modified' | 'unchanged'> {
  if (!existsSync(destination)) {
    return 'new'
  }
  
  const sourceHash = await getFileHash(source)
  const destHash = await getFileHash(destination)
  
  return sourceHash === destHash ? 'unchanged' : 'modified'
}

/**
 * Generate export manifest
 */
async function generateManifest(
  game: Game,
  dataDirOverride?: string
): Promise<ExportManifest> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const characters = pipeline.characters.filter(c => c.gameId === game.id)
  
  const manifestCharacters: ExportManifestCharacter[] = []
  
  for (const character of characters) {
    const poses = pipeline.poses.filter(p => 
      p.characterId === character.id && p.status === 'approved'
    )
    
    manifestCharacters.push({
      id: character.id,
      name: character.name,
      role: character.role,
      styleNotes: character.styleNotes,
      tags: character.tags,
      poses: poses.map(p => ({
        slot: p.slot,
        file: `poses/${character.id}_${p.slot}.png`,
        width: 1024,
        height: 1024,
        status: 'approved' as const
      }))
    })
  }
  
  const manifestClips: ExportManifestClip[] = pipeline.clips.map(clip => ({
    id: clip.id,
    moment: clip.moment,
    characterId: clip.characterId,
    durationSec: clip.durationSec,
    file: `clips/${basename(clip.file)}`,
    thumbnail: `clips/${basename(clip.thumbnail)}`,
    tags: clip.tags
  }))
  
  const manifestPresets: ExportManifestPreset[] = pipeline.scenePresets.map(preset => ({
    id: preset.id,
    type: preset.type,
    params: preset.params,
    tags: preset.tags
  }))
  
  // Build storyboards for export (v2)
  const storyboards = pipeline.storyboards?.filter(sb => sb.gameId === gameId) ?? []
  const manifestStoryboards = storyboards.map(sb => {
    const shots = pipeline.storyboardShots?.filter(shot => sb.shotIds.includes(shot.id)) ?? []
    
    return {
      id: sb.id,
      name: sb.name,
      description: sb.description,
      shots: shots.map(shot => {
        const layers = shot.layers.map(layer => {
          const resolved: any = {
            id: layer.id,
            zOrder: layer.zOrder,
            x: layer.x,
            y: layer.y,
            scale: layer.scale,
            rotation: layer.rotation,
            flipX: layer.flipX,
            opacity: layer.opacity
          }
          
          if (layer.characterId) resolved.characterId = layer.characterId
          if (layer.poseId) {
            resolved.poseId = layer.poseId
            const pose = pipeline.poses.find(p => p.id === layer.poseId)
            if (pose && pose.status === 'approved') {
              const character = pipeline.characters.find(c => c.id === pose.characterId)
              if (character) {
                resolved.poseFile = `poses/${character.id}_${pose.slot}.png`
              }
            }
          }
          if (layer.clipId) {
            resolved.clipId = layer.clipId
            const clip = pipeline.clips.find(c => c.id === layer.clipId)
            if (clip) {
              resolved.clipFile = `clips/${basename(clip.file)}`
            }
          }
          if (layer.imagePath) resolved.imagePath = layer.imagePath
          
          return resolved
        })
        
        return {
          id: shot.id,
          name: shot.name,
          durationSec: shot.durationSec,
          aspectRatio: shot.aspectRatio,
          backgroundImage: shot.backgroundImage,
          backgroundClipId: shot.backgroundClipId,
          layers,
          cameraTrack: shot.cameraTrack,
          effectsTrack: shot.effectsTrack,
          notes: shot.notes,
          thumbnail: shot.thumbnail
        }
      })
    }
  })
  
  return {
    schemaVersion: EXPORT_MANIFEST_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    game: {
      id: game.id,
      name: game.name,
      engine: game.engine
    },
    characters: manifestCharacters,
    clips: manifestClips,
    presets: manifestPresets,
    storyboards: manifestStoryboards.length > 0 ? manifestStoryboards : undefined
  }
}

/**
 * Perform a dry-run export (no files copied)
 */
export async function dryRunExport(
  gameId: string,
  targetDirOverride?: string,
  dataDirOverride?: string
): Promise<ExportDryRun> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const game = pipeline.games.find(g => g.id === gameId)
  
  if (!game) {
    throw new Error(`Game not found: ${gameId}`)
  }
  
  // Validate targetDirOverride if provided
  if (targetDirOverride) {
    const expandedTarget = expandHome(targetDirOverride)
    if (!isAbsolute(expandedTarget)) {
      throw new Error(`Export target must be an absolute path: ${targetDirOverride}`)
    }
  }
  
  const targetDir = targetDirOverride ? expandHome(targetDirOverride) : await getExportTargetDir(gameId, dataDirOverride)
  const filesToCopy: ExportDryRun['filesToCopy'] = []
  let totalSize = 0
  
  // Collect approved poses
  const characters = pipeline.characters.filter(c => c.gameId === gameId)
  for (const character of characters) {
    const approvedPoses = pipeline.poses.filter(p => 
      p.characterId === character.id && p.status === 'approved'
    )
    
    for (const pose of approvedPoses) {
      const destination = join(targetDir, 'poses', `${character.id}_${pose.slot}.png`)
      const reason = await needsCopy(pose.file, destination)
      
      if (reason !== 'unchanged') {
        const stats = await stat(pose.file)
        totalSize += stats.size
        
        filesToCopy.push({
          source: pose.file,
          destination,
          reason
        })
      }
    }
  }
  
  // Collect clips
  for (const clip of pipeline.clips) {
    const clipDest = join(targetDir, 'clips', basename(clip.file))
    const clipReason = await needsCopy(clip.file, clipDest)
    
    if (clipReason !== 'unchanged') {
      const stats = await stat(clip.file)
      totalSize += stats.size
      
      filesToCopy.push({
        source: clip.file,
        destination: clipDest,
        reason: clipReason
      })
    }
    
    if (clip.thumbnail) {
      const thumbDest = join(targetDir, 'clips', basename(clip.thumbnail))
      const thumbReason = await needsCopy(clip.thumbnail, thumbDest)
      
      if (thumbReason !== 'unchanged') {
        const stats = await stat(clip.thumbnail)
        totalSize += stats.size
        
        filesToCopy.push({
          source: clip.thumbnail,
          destination: thumbDest,
          reason: thumbReason
        })
      }
    }
  }
  
  const manifestPath = join(targetDir, 'manifest.json')
  
  return {
    targetDir,
    filesToCopy,
    manifestPath,
    totalFiles: filesToCopy.length,
    totalSize
  }
}

/**
 * Export game assets to target directory
 */
export async function exportGame(
  gameId: string,
  targetDirOverride?: string,
  dataDirOverride?: string
): Promise<{
  targetDir: string
  copiedFiles: number
  manifestPath: string
}> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const game = pipeline.games.find(g => g.id === gameId)
  
  if (!game) {
    throw new Error(`Game not found: ${gameId}`)
  }
  
  // Validate first
  const validation = await validateExport(gameId, dataDirOverride)
  if (!validation.canExport) {
    throw new Error(`Export validation failed: ${validation.errors.join(', ')}`)
  }
  
  // Validate targetDirOverride if provided
  if (targetDirOverride) {
    const expandedTarget = expandHome(targetDirOverride)
    if (!isAbsolute(expandedTarget)) {
      throw new Error(`Export target must be an absolute path: ${targetDirOverride}`)
    }
  }
  
  const targetDir = targetDirOverride ? expandHome(targetDirOverride) : await getExportTargetDir(gameId, dataDirOverride)
  
  // Create target directories
  await mkdir(join(targetDir, 'poses'), { recursive: true })
  await mkdir(join(targetDir, 'clips'), { recursive: true })
  
  let copiedFiles = 0
  
  // Copy approved poses
  const characters = pipeline.characters.filter(c => c.gameId === gameId)
  for (const character of characters) {
    const approvedPoses = pipeline.poses.filter(p => 
      p.characterId === character.id && p.status === 'approved'
    )
    
    for (const pose of approvedPoses) {
      const destination = join(targetDir, 'poses', `${character.id}_${pose.slot}.png`)
      const reason = await needsCopy(pose.file, destination)
      
      if (reason !== 'unchanged') {
        await copyFile(pose.file, destination)
        copiedFiles++
      }
    }
  }
  
  // Copy clips and thumbnails
  for (const clip of pipeline.clips) {
    const clipDest = join(targetDir, 'clips', basename(clip.file))
    const clipReason = await needsCopy(clip.file, clipDest)
    
    if (clipReason !== 'unchanged') {
      await copyFile(clip.file, clipDest)
      copiedFiles++
    }
    
    if (clip.thumbnail) {
      const thumbDest = join(targetDir, 'clips', basename(clip.thumbnail))
      const thumbReason = await needsCopy(clip.thumbnail, thumbDest)
      
      if (thumbReason !== 'unchanged') {
        await copyFile(clip.thumbnail, thumbDest)
        copiedFiles++
      }
    }
  }
  
  // Generate storyboard thumbnails
  const { generateStoryboardThumbnails } = require('../export/storyboardThumbnails')
  await generateStoryboardThumbnails(pipeline, gameId, targetDir)
  
  // Generate and write manifest
  const manifest = await generateManifest(game, dataDirOverride)
  const manifestPath = join(targetDir, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  
  return {
    targetDir,
    copiedFiles,
    manifestPath
  }
}
