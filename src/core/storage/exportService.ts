import { createHash } from 'crypto'
import { copyFile, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, join, relative } from 'path'
import { existsSync } from 'fs'
import type {
  ExportManifest,
  ExportValidation,
  ExportDryRun,
  ExportManifestCharacter,
  ExportManifestClip,
  ExportManifestPreset
} from '@shared/types/exportManifest'
import { EXPORT_MANIFEST_SCHEMA_VERSION } from '@shared/types/exportManifest'
import { getAssetPipeline } from './studioStorage'
import type { Game } from '@shared/types/assetPipeline'
import { homedir } from 'os'

/**
 * Get the export target directory for a game
 */
function getExportTargetDir(game: Game): string {
  // Use exportTarget if set, otherwise fall back to exportRoot
  const target = game.exportTarget || game.exportRoot
  
  // Expand ~ to home directory
  const expandedTarget = target.startsWith('~') 
    ? join(homedir(), target.slice(1))
    : target
  
  // Add engine-specific subfolder
  if (game.engine === 'unity') {
    return join(expandedTarget, 'Assets', 'IndieForge', game.id)
  } else if (game.engine === 'godot') {
    return join(expandedTarget, 'assets', 'indie_forge', game.id)
  }
  
  return expandedTarget
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
    presets: manifestPresets
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
  
  const targetDir = targetDirOverride || getExportTargetDir(game)
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
  
  const targetDir = targetDirOverride || getExportTargetDir(game)
  
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
