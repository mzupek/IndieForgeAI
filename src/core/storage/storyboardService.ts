import { randomUUID } from 'crypto'
import type {
  Storyboard,
  StoryboardShot,
  StoryboardLayer,
  CameraKeyframe,
  EffectMarker
} from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from './studioStorage'
import { validateLayerReferences } from '../../shared/storyboard/layerValidation'
import { purgeBindingsForLayers, purgeBindingsForShots } from './eventService'

/**
 * Create a new storyboard
 */
export async function createStoryboard(
  gameId: string,
  input: {
    name: string
    description?: string
    dataDirOverride?: string
  }
): Promise<Storyboard> {
  const pipeline = await getAssetPipeline(input.dataDirOverride)
  
  const now = new Date().toISOString()
  const storyboard: Storyboard = {
    id: randomUUID(),
    gameId,
    name: input.name,
    description: input.description,
    shotIds: [],
    createdAt: now,
    updatedAt: now
  }
  
  pipeline.storyboards.push(storyboard)
  await updateAssetPipeline(pipeline, input.dataDirOverride)
  
  return storyboard
}

/**
 * Get storyboard by ID
 */
export async function getStoryboard(
  storyboardId: string,
  dataDirOverride?: string
): Promise<Storyboard | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.storyboards.find((s) => s.id === storyboardId)
}

/**
 * List storyboards for a game
 */
export async function listStoryboards(
  gameId: string,
  dataDirOverride?: string
): Promise<Storyboard[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.storyboards.filter((s) => s.gameId === gameId)
}

/**
 * Update storyboard
 */
export async function updateStoryboard(
  storyboardId: string,
  updates: Partial<Pick<Storyboard, 'name' | 'description' | 'shotIds'>>,
  dataDirOverride?: string
): Promise<Storyboard> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const index = pipeline.storyboards.findIndex((s) => s.id === storyboardId)
  if (index === -1) {
    throw new Error(`Storyboard not found: ${storyboardId}`)
  }
  
  pipeline.storyboards[index] = {
    ...pipeline.storyboards[index],
    ...updates,
    updatedAt: new Date().toISOString()
  }
  
  await updateAssetPipeline(pipeline, dataDirOverride)
  return pipeline.storyboards[index]
}

/**
 * Remove storyboard and all its shots
 */
export async function removeStoryboard(
  storyboardId: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const storyboard = pipeline.storyboards.find((s) => s.id === storyboardId)
  if (!storyboard) {
    throw new Error(`Storyboard not found: ${storyboardId}`)
  }
  
  // Remove all shots
  pipeline.storyboardShots = pipeline.storyboardShots.filter(
    (shot) => !storyboard.shotIds.includes(shot.id)
  )
  purgeBindingsForShots(pipeline, storyboard.shotIds)
  
  // Remove storyboard
  pipeline.storyboards = pipeline.storyboards.filter((s) => s.id !== storyboardId)
  
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Create a new shot
 */
export async function createShot(
  storyboardId: string,
  input: {
    name: string
    durationSec?: number
    aspectRatio?: { width: number; height: number }
    notes?: string
    dataDirOverride?: string
  }
): Promise<StoryboardShot> {
  const pipeline = await getAssetPipeline(input.dataDirOverride)
  
  const storyboard = pipeline.storyboards.find((s) => s.id === storyboardId)
  if (!storyboard) {
    throw new Error(`Storyboard not found: ${storyboardId}`)
  }
  
  const now = new Date().toISOString()
  const shot: StoryboardShot = {
    id: randomUUID(),
    name: input.name,
    durationSec: input.durationSec ?? 3.0,
    aspectRatio: input.aspectRatio ?? { width: 16, height: 9 },
    layers: [],
    cameraTrack: [],
    effectsTrack: [],
    notes: input.notes,
    createdAt: now,
    updatedAt: now
  }
  
  pipeline.storyboardShots.push(shot)
  storyboard.shotIds.push(shot.id)
  storyboard.updatedAt = now
  
  await updateAssetPipeline(pipeline, input.dataDirOverride)
  
  return shot
}

/**
 * Get shot by ID
 */
export async function getShot(
  shotId: string,
  dataDirOverride?: string
): Promise<StoryboardShot | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.storyboardShots.find((s) => s.id === shotId)
}

/**
 * Update shot
 */
export async function updateShot(
  shotId: string,
  updates: Partial<
    Pick<
      StoryboardShot,
      | 'name'
      | 'durationSec'
      | 'aspectRatio'
      | 'backgroundImage'
      | 'backgroundClipId'
      | 'layers'
      | 'cameraTrack'
      | 'effectsTrack'
      | 'notes'
      | 'thumbnail'
    >
  >,
  dataDirOverride?: string
): Promise<StoryboardShot> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const index = pipeline.storyboardShots.findIndex((s) => s.id === shotId)
  if (index === -1) {
    throw new Error(`Shot not found: ${shotId}`)
  }
  
  pipeline.storyboardShots[index] = {
    ...pipeline.storyboardShots[index],
    ...updates,
    updatedAt: new Date().toISOString()
  }
  
  await updateAssetPipeline(pipeline, dataDirOverride)
  return pipeline.storyboardShots[index]
}

/**
 * Remove shot from storyboard
 */
export async function removeShot(
  storyboardId: string,
  shotId: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const storyboard = pipeline.storyboards.find((s) => s.id === storyboardId)
  if (!storyboard) {
    throw new Error(`Storyboard not found: ${storyboardId}`)
  }
  
  storyboard.shotIds = storyboard.shotIds.filter((id) => id !== shotId)
  storyboard.updatedAt = new Date().toISOString()
  
  pipeline.storyboardShots = pipeline.storyboardShots.filter((s) => s.id !== shotId)
  purgeBindingsForShots(pipeline, [shotId])
  
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Add layer to shot
 */
export async function addLayer(
  shotId: string,
  layer: Omit<StoryboardLayer, 'id'>,
  dataDirOverride?: string
): Promise<StoryboardLayer> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const shot = pipeline.storyboardShots.find((s) => s.id === shotId)
  if (!shot) {
    throw new Error(`Shot not found: ${shotId}`)
  }
  
  const newLayer: StoryboardLayer = {
    id: randomUUID(),
    ...layer,
    visible: layer.visible !== false
  }

  validateLayerReferences(newLayer, pipeline, shotId)
  
  shot.layers.push(newLayer)
  shot.updatedAt = new Date().toISOString()
  
  await updateAssetPipeline(pipeline, dataDirOverride)
  
  return newLayer
}

/**
 * Update layer
 */
export async function updateLayer(
  shotId: string,
  layerId: string,
  updates: Partial<Omit<StoryboardLayer, 'id'>>,
  dataDirOverride?: string
): Promise<StoryboardLayer> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const shot = pipeline.storyboardShots.find((s) => s.id === shotId)
  if (!shot) {
    throw new Error(`Shot not found: ${shotId}`)
  }
  
  const layerIndex = shot.layers.findIndex((l) => l.id === layerId)
  if (layerIndex === -1) {
    throw new Error(`Layer not found: ${layerId}`)
  }
  
  const merged: StoryboardLayer = {
    ...shot.layers[layerIndex],
    ...updates
  }

  validateLayerReferences(merged, pipeline, shotId)

  shot.layers[layerIndex] = merged
  shot.updatedAt = new Date().toISOString()
  
  await updateAssetPipeline(pipeline, dataDirOverride)
  
  return shot.layers[layerIndex]
}

/**
 * Remove layer from shot
 */
export async function removeLayer(
  shotId: string,
  layerId: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const shot = pipeline.storyboardShots.find((s) => s.id === shotId)
  if (!shot) {
    throw new Error(`Shot not found: ${shotId}`)
  }
  
  shot.layers = shot.layers.filter((l) => l.id !== layerId)
  shot.updatedAt = new Date().toISOString()
  purgeBindingsForLayers(pipeline, [layerId])
  
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Add camera keyframe
 */
export async function addCameraKeyframe(
  shotId: string,
  keyframe: CameraKeyframe,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const shot = pipeline.storyboardShots.find((s) => s.id === shotId)
  if (!shot) {
    throw new Error(`Shot not found: ${shotId}`)
  }
  
  shot.cameraTrack.push(keyframe)
  shot.cameraTrack.sort((a, b) => a.t - b.t)
  shot.updatedAt = new Date().toISOString()
  
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Remove camera keyframe at time
 */
export async function removeCameraKeyframe(
  shotId: string,
  t: number,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const shot = pipeline.storyboardShots.find((s) => s.id === shotId)
  if (!shot) {
    throw new Error(`Shot not found: ${shotId}`)
  }
  
  shot.cameraTrack = shot.cameraTrack.filter((k) => k.t !== t)
  shot.updatedAt = new Date().toISOString()
  
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Add effect marker
 */
export async function addEffectMarker(
  shotId: string,
  effect: EffectMarker,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const shot = pipeline.storyboardShots.find((s) => s.id === shotId)
  if (!shot) {
    throw new Error(`Shot not found: ${shotId}`)
  }
  
  shot.effectsTrack.push(effect)
  shot.effectsTrack.sort((a, b) => a.t - b.t)
  shot.updatedAt = new Date().toISOString()
  
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Remove effect marker at time
 */
export async function removeEffectMarker(
  shotId: string,
  t: number,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const shot = pipeline.storyboardShots.find((s) => s.id === shotId)
  if (!shot) {
    throw new Error(`Shot not found: ${shotId}`)
  }
  
  shot.effectsTrack = shot.effectsTrack.filter((e) => e.t !== t)
  shot.updatedAt = new Date().toISOString()
  
  await updateAssetPipeline(pipeline, dataDirOverride)
}
