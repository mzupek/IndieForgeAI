/**
 * Scene service - CRUD operations for Scenes (Phase C)
 */

import { randomUUID } from 'crypto'
import type { Scene } from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from './studioStorage'
import { createStoryboard } from './storyboardService'

/**
 * Create a new scene
 */
export async function createScene(
  gameId: string,
  input: {
    name: string
    description?: string
    background?: string
    storyText?: string
    dataDirOverride?: string
  }
): Promise<Scene> {
  const pipeline = await getAssetPipeline(input.dataDirOverride)
  
  const now = new Date().toISOString()
  const scene: Scene = {
    id: randomUUID(),
    gameId,
    name: input.name,
    description: input.description,
    background: input.background,
    cast: [],
    storyText: input.storyText,
    poseRefs: [],
    clipRefs: [],
    audioRefs: [],
    interactionHooks: [],
    attachedPresets: [],
    createdAt: now,
    updatedAt: now
  }
  
  pipeline.scenes.push(scene)
  await updateAssetPipeline(pipeline, input.dataDirOverride)
  
  return scene
}

/**
 * Get scene by ID
 */
export async function getScene(
  sceneId: string,
  dataDirOverride?: string
): Promise<Scene | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.scenes.find((s) => s.id === sceneId)
}

/**
 * List scenes for a game
 */
export async function listScenes(
  gameId: string,
  dataDirOverride?: string
): Promise<Scene[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.scenes.filter((s) => s.gameId === gameId)
}

/**
 * Update scene
 */
export async function updateScene(
  sceneId: string,
  updates: Partial<Omit<Scene, 'id' | 'gameId' | 'createdAt' | 'updatedAt'>>,
  dataDirOverride?: string
): Promise<Scene> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const index = pipeline.scenes.findIndex((s) => s.id === sceneId)
  if (index === -1) {
    throw new Error(`Scene not found: ${sceneId}`)
  }
  
  pipeline.scenes[index] = {
    ...pipeline.scenes[index],
    ...updates,
    updatedAt: new Date().toISOString()
  }
  
  await updateAssetPipeline(pipeline, dataDirOverride)
  return pipeline.scenes[index]
}

/**
 * Remove scene (and optionally its storyboard)
 */
export async function removeScene(
  sceneId: string,
  options?: {
    removeStoryboard?: boolean
    dataDirOverride?: string
  }
): Promise<void> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  
  const scene = pipeline.scenes.find((s) => s.id === sceneId)
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`)
  }
  
  // Optionally remove attached storyboard
  if (options?.removeStoryboard && scene.storyboardId) {
    const storyboard = pipeline.storyboards.find((sb) => sb.id === scene.storyboardId)
    if (storyboard) {
      // Remove all shots
      pipeline.storyboardShots = pipeline.storyboardShots.filter(
        (shot) => !storyboard.shotIds.includes(shot.id)
      )
      // Remove storyboard
      pipeline.storyboards = pipeline.storyboards.filter((sb) => sb.id !== scene.storyboardId)
    }
  }
  
  // Remove scene
  pipeline.scenes = pipeline.scenes.filter((s) => s.id !== sceneId)
  
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
}

/**
 * Add character to scene cast
 */
export async function addCharacterToCast(
  sceneId: string,
  characterId: string,
  dataDirOverride?: string
): Promise<Scene> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const scene = pipeline.scenes.find((s) => s.id === sceneId)
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`)
  }
  
  if (!scene.cast.includes(characterId)) {
    scene.cast.push(characterId)
    scene.updatedAt = new Date().toISOString()
    await updateAssetPipeline(pipeline, dataDirOverride)
  }
  
  return scene
}

/**
 * Remove character from scene cast
 */
export async function removeCharacterFromCast(
  sceneId: string,
  characterId: string,
  dataDirOverride?: string
): Promise<Scene> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const scene = pipeline.scenes.find((s) => s.id === sceneId)
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`)
  }
  
  scene.cast = scene.cast.filter((id) => id !== characterId)
  scene.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
  
  return scene
}

/**
 * Attach preset to scene
 */
export async function attachPreset(
  sceneId: string,
  presetId: string,
  dataDirOverride?: string
): Promise<Scene> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const scene = pipeline.scenes.find((s) => s.id === sceneId)
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`)
  }
  
  if (!scene.attachedPresets.includes(presetId)) {
    scene.attachedPresets.push(presetId)
    scene.updatedAt = new Date().toISOString()
    await updateAssetPipeline(pipeline, dataDirOverride)
  }
  
  return scene
}

/**
 * Detach preset from scene
 */
export async function detachPreset(
  sceneId: string,
  presetId: string,
  dataDirOverride?: string
): Promise<Scene> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const scene = pipeline.scenes.find((s) => s.id === sceneId)
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`)
  }
  
  scene.attachedPresets = scene.attachedPresets.filter((id) => id !== presetId)
  scene.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
  
  return scene
}

/**
 * Create or attach storyboard for a scene
 */
export async function createSceneStoryboard(
  sceneId: string,
  input: {
    name?: string
    description?: string
    dataDirOverride?: string
  }
): Promise<{ scene: Scene; storyboardId: string }> {
  const pipeline = await getAssetPipeline(input.dataDirOverride)
  
  const scene = pipeline.scenes.find((s) => s.id === sceneId)
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`)
  }
  
  // Create new storyboard
  const storyboard = await createStoryboard(
    scene.gameId,
    {
      name: input.name || `${scene.name} Storyboard`,
      description: input.description,
      dataDirOverride: input.dataDirOverride
    }
  )
  
  // Link storyboard to scene
  scene.storyboardId = storyboard.id
  scene.updatedAt = new Date().toISOString()
  
  // Also update storyboard to reference scene
  const storyboardIndex = pipeline.storyboards.findIndex((sb) => sb.id === storyboard.id)
  if (storyboardIndex !== -1) {
    pipeline.storyboards[storyboardIndex].sceneId = sceneId
  }
  
  await updateAssetPipeline(pipeline, input.dataDirOverride)
  
  return { scene, storyboardId: storyboard.id }
}
