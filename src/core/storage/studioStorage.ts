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
 * Initialize empty studio data
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
      exportProfiles: []
    },
    createdAt: now,
    updatedAt: now
  }
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
  
  return withLock(lockPath, async () => {
    try {
      const data = await readFile(filePath, 'utf-8')
      return JSON.parse(data) as StudioData
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // Studio file doesn't exist - migrate from projects
        const studio = await migrateFromProjects(dataDirOverride)
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
