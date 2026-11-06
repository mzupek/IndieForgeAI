/**
 * Studio-level storage - single source of truth for asset pipeline
 * Games, characters, and poses are stored at studio level, not per-project
 */

import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { AssetPipelineProject } from '@shared/types/assetPipeline'
import { getDataDir } from './dataDir'
import { withLock, atomicWriteFile } from './fileLock'
import { listProjects as listLegacyProjects } from './projectStorage'

interface StudioData {
  schemaVersion: number
  assetPipeline: AssetPipelineProject
  createdAt: string
  updatedAt: string
}

/**
 * Get studio file path
 */
function getStudioFilePath(dataDirOverride?: string): string {
  return join(getDataDir(dataDirOverride), 'studio.json')
}

/**
 * Initialize empty studio data structure
 */
function createEmptyStudioData(): StudioData {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    assetPipeline: {
      schemaVersion: 1,
      games: [],
      characters: [],
      poses: [],
      clips: [],
      scenePresets: [],
      scenes: [],
      storyboards: [],
      storyboardShots: [],
      exportProfiles: [],
      gameDefinitions: [],
      visualAssets: [],
      assetStates: []
    },
    createdAt: now,
    updatedAt: now
  }
}

/**
 * Seed default games for a brand new studio
 */
function seedDefaultGames(studio: StudioData): void {
  const now = new Date().toISOString()
  studio.assetPipeline.games = [
    {
      id: 'game-neon-recall',
      name: 'Neon Recall',
      engine: 'unity',
      exportRoot: './exports/neon-recall',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'game-ring-em-up',
      name: "Ring'Em Up",
      engine: 'godot',
      exportRoot: './exports/ring-em-up',
      createdAt: now,
      updatedAt: now
    }
  ]
}

/**
 * Migrate from per-project pipelines to single studio
 * Deduplicates games and merges characters/poses
 */
async function migrateFromProjects(dataDirOverride?: string): Promise<StudioData> {
  const studio = createEmptyStudioData()
  const projects = await listLegacyProjects(dataDirOverride)
  
  const seenGameIds = new Set<string>()
  const seenCharacterIds = new Set<string>()
  const seenPoseIds = new Set<string>()
  
  for (const project of projects) {
    if (!project.assetPipeline) continue
    
    // Merge games (dedupe by ID)
    for (const game of project.assetPipeline.games) {
      if (!seenGameIds.has(game.id)) {
        studio.assetPipeline.games.push(game)
        seenGameIds.add(game.id)
      }
    }
    
    // Merge characters (dedupe by ID)
    for (const character of project.assetPipeline.characters) {
      if (!seenCharacterIds.has(character.id)) {
        studio.assetPipeline.characters.push(character)
        seenCharacterIds.add(character.id)
      }
    }
    
    // Merge poses (dedupe by ID)
    for (const pose of project.assetPipeline.poses) {
      if (!seenPoseIds.has(pose.id)) {
        studio.assetPipeline.poses.push(pose)
        seenPoseIds.add(pose.id)
      }
    }
    
    // Merge clips, presets, profiles similarly
    for (const clip of project.assetPipeline.clips || []) {
      studio.assetPipeline.clips.push(clip)
    }
    for (const preset of project.assetPipeline.scenePresets || []) {
      studio.assetPipeline.scenePresets.push(preset)
    }
    for (const profile of project.assetPipeline.exportProfiles || []) {
      studio.assetPipeline.exportProfiles.push(profile)
    }
  }
  
  return studio
}

/**
 * Load studio data (migrates from projects if needed)
 */
export async function loadStudio(dataDirOverride?: string): Promise<StudioData> {
  const filePath = getStudioFilePath(dataDirOverride)
  const lockPath = `${filePath}.lock`
  
  // Ensure data directory exists before trying to acquire lock
  await mkdir(getDataDir(dataDirOverride), { recursive: true })
  
  return withLock(lockPath, async () => {
    try {
      const data = await readFile(filePath, 'utf-8')
      const studio = JSON.parse(data) as StudioData
      
      // Migrate: ensure storyboard fields exist
      if (!studio.assetPipeline.storyboards) {
        studio.assetPipeline.storyboards = []
      }
      if (!studio.assetPipeline.storyboardShots) {
        studio.assetPipeline.storyboardShots = []
      }
      
      // Migrate: ensure gameDefinitions field exists
      if (!studio.assetPipeline.gameDefinitions) {
        studio.assetPipeline.gameDefinitions = []
      }
      
      // Migrate: ensure scenes field exists (Phase C)
      if (!studio.assetPipeline.scenes) {
        studio.assetPipeline.scenes = []
        // Persist the migration
        await saveStudioInternal(studio, dataDirOverride)
      }
      
      // Migrate: copy absolute background image paths into studio storage
      let needsSave = false
      if (studio.assetPipeline.storyboardShots) {
        const { existsSync } = await import('fs')
        const { copyFile, mkdir: mkdirAsync } = await import('fs/promises')
        const { join: joinPath, basename: getBasename } = await import('path')
        
        for (const shot of studio.assetPipeline.storyboardShots) {
          if (shot.backgroundImage && typeof shot.backgroundImage === 'string') {
            const bgPath = shot.backgroundImage
            
            // Check if it's an absolute path (not a relative studio path)
            if (bgPath.startsWith('/') || /^[A-Za-z]:/.test(bgPath)) {
              try {
                // Only migrate if file exists
                if (existsSync(bgPath)) {
                  const dataDir = getDataDir(dataDirOverride)
                  const backgroundsDir = joinPath(dataDir, 'backgrounds')
                  await mkdirAsync(backgroundsDir, { recursive: true })
                  
                  const filename = `${Date.now()}-${getBasename(bgPath)}`
                  const destPath = joinPath(backgroundsDir, filename)
                  
                  await copyFile(bgPath, destPath)
                  console.log(`[Migration] Copied background from ${bgPath} to ${destPath}`)
                  
                  // Update to relative path: backgrounds/filename
                  shot.backgroundImage = `backgrounds/${filename}`
                  needsSave = true
                } else {
                  console.warn(`[Migration] Background image not found, clearing: ${bgPath}`)
                  shot.backgroundImage = undefined
                  needsSave = true
                }
              } catch (err) {
                console.error(`[Migration] Failed to copy background image ${bgPath}:`, err)
                // Clear the path if copy fails
                shot.backgroundImage = undefined
                needsSave = true
              }
            }
          }
        }
      }
      
      if (needsSave) {
        await saveStudioInternal(studio, dataDirOverride)
      }
      
      return studio
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // Studio file doesn't exist - migrate from projects or create new
        const studio = await migrateFromProjects(dataDirOverride)
        
        // If no games were migrated, seed default games
        if (studio.assetPipeline.games.length === 0) {
          seedDefaultGames(studio)
        }
        
        await saveStudioInternal(studio, dataDirOverride)
        return studio
      }
      throw err
    }
  })
}

/**
 * Internal save without lock (used by load when migrating)
 */
async function saveStudioInternal(studio: StudioData, dataDirOverride?: string): Promise<void> {
  const filePath = getStudioFilePath(dataDirOverride)
  
  // Ensure data directory exists
  await mkdir(getDataDir(dataDirOverride), { recursive: true })
  
  // Update timestamp
  studio.updatedAt = new Date().toISOString()
  
  // Atomic write
  const data = JSON.stringify(studio, null, 2)
  await atomicWriteFile(filePath, data)
}

/**
 * Save studio data
 */
export async function saveStudio(studio: StudioData, dataDirOverride?: string): Promise<void> {
  const filePath = getStudioFilePath(dataDirOverride)
  const lockPath = `${filePath}.lock`
  
  await withLock(lockPath, async () => {
    await saveStudioInternal(studio, dataDirOverride)
  })
}

/**
 * Get asset pipeline data
 */
export async function getAssetPipeline(dataDirOverride?: string): Promise<AssetPipelineProject> {
  const studio = await loadStudio(dataDirOverride)
  return studio.assetPipeline
}

/**
 * Update asset pipeline data
 */
export async function updateAssetPipeline(
  pipeline: AssetPipelineProject,
  dataDirOverride?: string
): Promise<void> {
  const studio = await loadStudio(dataDirOverride)
  studio.assetPipeline = pipeline
  await saveStudio(studio, dataDirOverride)
}

/**
 * P1: Visual Assets CRUD
 */

/**
 * Get visual assets for a game
 */
export async function getVisualAssets(gameId: string, dataDirOverride?: string): Promise<import('@shared/types/assetPipeline').VisualAsset[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.visualAssets.filter(a => a.gameId === gameId)
}

/**
 * Get a single visual asset by ID
 */
export async function getVisualAsset(assetId: string, dataDirOverride?: string): Promise<import('@shared/types/assetPipeline').VisualAsset | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.visualAssets.find(a => a.id === assetId)
}

/**
 * Add a new visual asset
 */
export async function addVisualAsset(asset: import('@shared/types/assetPipeline').VisualAsset, dataDirOverride?: string): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  pipeline.visualAssets.push(asset)
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Update an existing visual asset
 */
export async function updateVisualAsset(asset: import('@shared/types/assetPipeline').VisualAsset, dataDirOverride?: string): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const index = pipeline.visualAssets.findIndex(a => a.id === asset.id)
  if (index === -1) {
    throw new Error(`Visual asset not found: ${asset.id}`)
  }
  pipeline.visualAssets[index] = asset
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Delete a visual asset
 * Returns the count of cascade-deleted states
 */
export async function deleteVisualAsset(assetId: string, dataDirOverride?: string): Promise<{ statesDeleted: number }> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  // Check if asset exists
  const assetIndex = pipeline.visualAssets.findIndex(a => a.id === assetId)
  if (assetIndex === -1) {
    throw new Error(`Visual asset not found: ${assetId}`)
  }
  
  // Remove asset
  pipeline.visualAssets.splice(assetIndex, 1)
  
  // Cascade delete owned states
  const statesBefore = pipeline.assetStates.length
  pipeline.assetStates = pipeline.assetStates.filter(s => s.assetId !== assetId)
  const statesDeleted = statesBefore - pipeline.assetStates.length
  
  await updateAssetPipeline(pipeline, dataDirOverride)
  
  return { statesDeleted }
}

/**
 * P1: Asset States CRUD
 */

/**
 * Get asset states for an asset
 */
export async function getAssetStates(assetId: string, dataDirOverride?: string): Promise<import('@shared/types/assetPipeline').AssetState[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.assetStates.filter(s => s.assetId === assetId)
}

/**
 * Get a single asset state by ID
 */
export async function getAssetState(stateId: string, dataDirOverride?: string): Promise<import('@shared/types/assetPipeline').AssetState | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.assetStates.find(s => s.id === stateId)
}

/**
 * Add a new asset state
 */
export async function addAssetState(state: import('@shared/types/assetPipeline').AssetState, dataDirOverride?: string): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  pipeline.assetStates.push(state)
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Update an existing asset state
 */
export async function updateAssetState(state: import('@shared/types/assetPipeline').AssetState, dataDirOverride?: string): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const index = pipeline.assetStates.findIndex(s => s.id === state.id)
  if (index === -1) {
    throw new Error(`Asset state not found: ${state.id}`)
  }
  pipeline.assetStates[index] = state
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Delete an asset state
 * Rejects if this is the asset's default state
 */
export async function deleteAssetState(stateId: string, dataDirOverride?: string): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  // Check if state exists
  const state = pipeline.assetStates.find(s => s.id === stateId)
  if (!state) {
    throw new Error(`Asset state not found: ${stateId}`)
  }
  
  // Check if this is the default state for its asset
  const asset = pipeline.visualAssets.find(a => a.id === state.assetId)
  if (asset && asset.defaultStateId === stateId) {
    throw new Error(`Cannot delete default state '${state.name}' for asset '${asset.name}'. Set a different default state first.`)
  }
  
  // Remove state
  pipeline.assetStates = pipeline.assetStates.filter(s => s.id !== stateId)
  
  await updateAssetPipeline(pipeline, dataDirOverride)
}
