import { randomUUID } from 'crypto'
import type {
  Storyboard,
  StoryboardShot,
  StoryboardLayer,
  CameraKeyframe,
  EffectMarker,
  LayerTimedKey,
  LayerTimedKeyAction,
  ShotClipBlock,
  ShotAudioBlock
} from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from './studioStorage'
import { validateLayerReferences } from '../../shared/storyboard/layerValidation'
import { validateShotBackgroundReferences } from '../../shared/storyboard/shotBackground'
import { purgeBindingsForLayers, purgeBindingsForShots } from './eventService'
import {
  findTimedKey,
  flattenShotTimedKeys,
  parseTimedKeyTime,
  validateLayerTimedKey
} from '../../shared/storyboard/timedKeys'
import {
  clipBlockEnd,
  findClipBlock,
  parseClipTime,
  validateShotClipBlock
} from '../../shared/storyboard/clipBlocks'
import {
  audioBlockEnd,
  findAudioBlock,
  fitAudioBlockToShotEnd,
  parseAudioBool,
  parseAudioRole,
  parseAudioTime,
  parseAudioVolume,
  planAudioBlockPlacement,
  validateShotAudioBlock
} from '../../shared/storyboard/audioBlocks'
import { assertShotDurationFitsContent } from '../../shared/storyboard/shotDuration'

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
    clipTrack: [],
    audioTrack: [],
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
const SHOT_CLEARABLE_KEYS = [
  'backgroundImage',
  'backgroundClipId',
  'backgroundVisualAssetId',
  'backgroundAssetStateId'
] as const

type ShotPatch = Partial<
  Pick<
    StoryboardShot,
    | 'name'
    | 'durationSec'
    | 'aspectRatio'
    | 'layers'
    | 'cameraTrack'
    | 'effectsTrack'
    | 'clipTrack'
    | 'audioTrack'
    | 'notes'
    | 'thumbnail'
    | 'stageTreatment'
  >
> & {
  backgroundImage?: string | null
  backgroundClipId?: string | null
  backgroundVisualAssetId?: string | null
  backgroundAssetStateId?: string | null
}

export async function updateShot(
  shotId: string,
  updates: ShotPatch,
  dataDirOverride?: string
): Promise<StoryboardShot> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const index = pipeline.storyboardShots.findIndex((s) => s.id === shotId)
  if (index === -1) {
    throw new Error(`Shot not found: ${shotId}`)
  }

  const existingShot = pipeline.storyboardShots[index]
  const nextDuration =
    updates.durationSec !== undefined ? updates.durationSec : existingShot.durationSec
  const durationCheckShot: StoryboardShot = {
    ...existingShot,
    layers: updates.layers ?? existingShot.layers,
    clipTrack: updates.clipTrack ?? existingShot.clipTrack,
    audioTrack: updates.audioTrack ?? existingShot.audioTrack,
    cameraTrack: updates.cameraTrack ?? existingShot.cameraTrack,
    effectsTrack: updates.effectsTrack ?? existingShot.effectsTrack
  }
  assertShotDurationFitsContent(durationCheckShot, nextDuration)

  const merged: StoryboardShot = {
    ...pipeline.storyboardShots[index],
    ...updates,
    updatedAt: new Date().toISOString()
  }
  // IPC structured-clone drops `undefined`; callers send `null` to clear.
  for (const key of SHOT_CLEARABLE_KEYS) {
    if (key in updates && (updates as Record<string, unknown>)[key] == null) {
      delete merged[key]
    }
  }

  if (
    'backgroundImage' in updates ||
    'backgroundVisualAssetId' in updates ||
    'backgroundAssetStateId' in updates
  ) {
    validateShotBackgroundReferences(merged, pipeline)
  }
  
  pipeline.storyboardShots[index] = merged
  
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
    visible: layer.visible !== false,
    timedKeys: layer.timedKeys || []
  }

  validateLayerReferences(newLayer, pipeline, shotId)
  for (const key of newLayer.timedKeys || []) {
    validateLayerTimedKey(key, newLayer, pipeline, shotId)
  }
  
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
  for (const key of merged.timedKeys || []) {
    validateLayerTimedKey(key, merged, pipeline, shotId)
  }

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
  shot.clipTrack = (shot.clipTrack || []).filter((b) => b.layerId !== layerId)
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

export async function addLayerTimedKey(
  shotId: string,
  layerId: string,
  input: { t: number | string; action: LayerTimedKeyAction },
  dataDirOverride?: string
): Promise<LayerTimedKey> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const shot = pipeline.storyboardShots.find((s) => s.id === shotId)
  if (!shot) throw new Error(`Shot not found: ${shotId}`)
  const layer = shot.layers.find((l) => l.id === layerId)
  if (!layer) throw new Error(`Layer not found: ${layerId}`)
  if (!layer.timedKeys) layer.timedKeys = []

  const key: LayerTimedKey = {
    id: randomUUID(),
    t: parseTimedKeyTime(input.t),
    action: input.action,
    schemaVersion: 1
  }
  validateLayerTimedKey(key, layer, pipeline, shotId)
  layer.timedKeys.push(key)
  layer.timedKeys.sort((a, b) => a.t - b.t)
  shot.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
  return key
}

export async function listLayerTimedKeys(
  shotId: string,
  layerId?: string,
  dataDirOverride?: string
): Promise<Array<{ layerId: string; key: LayerTimedKey }>> {
  const shot = await getShot(shotId, dataDirOverride)
  if (!shot) throw new Error(`Shot not found: ${shotId}`)
  const all = flattenShotTimedKeys(shot)
  return layerId ? all.filter((row) => row.layerId === layerId) : all
}

export async function getLayerTimedKey(
  keyId: string,
  dataDirOverride?: string
): Promise<{ shotId: string; layerId: string; key: LayerTimedKey } | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const found = findTimedKey(pipeline, keyId)
  if (!found) return undefined
  return { shotId: found.shot.id, layerId: found.layer.id, key: found.key }
}

export async function updateLayerTimedKey(
  keyId: string,
  patch: { t?: number | string; action?: LayerTimedKeyAction },
  dataDirOverride?: string
): Promise<LayerTimedKey> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const found = findTimedKey(pipeline, keyId)
  if (!found) throw new Error(`Timed key not found: ${keyId}`)
  const next: LayerTimedKey = {
    ...found.key,
    t: patch.t !== undefined ? parseTimedKeyTime(patch.t) : found.key.t,
    action: patch.action ?? found.key.action
  }
  validateLayerTimedKey(next, found.layer, pipeline, found.shot.id, { excludeKeyId: keyId })
  found.layer.timedKeys = (found.layer.timedKeys || []).map((k) => (k.id === keyId ? next : k))
  found.layer.timedKeys.sort((a, b) => a.t - b.t)
  found.shot.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
  return next
}

export async function removeLayerTimedKey(
  keyId: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const found = findTimedKey(pipeline, keyId)
  if (!found) throw new Error(`Timed key not found: ${keyId}`)
  found.layer.timedKeys = (found.layer.timedKeys || []).filter((k) => k.id !== keyId)
  found.shot.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
}

export async function addShotClipBlock(
  shotId: string,
  input: {
    clipId: string
    role?: ShotClipBlock['role']
    layerId?: string | null
    t: number | string
    sourceInSec?: number | string
    sourceOutSec?: number | string
    extendShot?: boolean
  },
  dataDirOverride?: string
): Promise<{ block: ShotClipBlock; layerId?: string; shotDurationSec: number; extended: boolean }> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const shot = pipeline.storyboardShots.find((s) => s.id === shotId)
  if (!shot) throw new Error(`Shot not found: ${shotId}`)
  if (!shot.clipTrack) shot.clipTrack = []

  const clip = (pipeline.clips || []).find((c) => c.id === input.clipId)
  if (!clip) throw new Error(`Clip not found: ${input.clipId}`)

  const role = input.role || 'layer'
  let layerId = input.layerId || null
  if (role === 'layer' && !layerId) {
    const zOrder =
      shot.layers.reduce((max, l) => Math.max(max, l.zOrder), 0) + 1
    const layer: StoryboardLayer = {
      id: randomUUID(),
      zOrder,
      clipId: input.clipId,
      visible: true,
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
      flipX: false,
      opacity: 1,
      timedKeys: []
    }
    validateLayerReferences(layer, pipeline, shotId)
    shot.layers.push(layer)
    layerId = layer.id
  }

  const sourceInSec =
    input.sourceInSec !== undefined ? parseClipTime(input.sourceInSec, 'source in') : 0
  const sourceOutSec =
    input.sourceOutSec !== undefined
      ? parseClipTime(input.sourceOutSec, 'source out')
      : clip.durationSec
  const t = parseClipTime(input.t, 'block start')
  const block: ShotClipBlock = {
    id: randomUUID(),
    clipId: input.clipId,
    role,
    layerId: role === 'background' ? null : layerId,
    t,
    durationSec: sourceOutSec - sourceInSec,
    sourceInSec,
    sourceOutSec,
    schemaVersion: 1
  }

  validateShotClipBlock(block, shot, pipeline, shotId, { extendShot: !!input.extendShot })
  const end = clipBlockEnd(block)
  let extended = false
  if (input.extendShot && end > shot.durationSec) {
    shot.durationSec = end
    extended = true
  }
  shot.clipTrack.push(block)
  shot.clipTrack.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  if (role === 'background') {
    shot.backgroundClipId = input.clipId
  }
  shot.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
  return { block, layerId: block.layerId || undefined, shotDurationSec: shot.durationSec, extended }
}

export async function listShotClipBlocks(
  shotId: string,
  dataDirOverride?: string
): Promise<ShotClipBlock[]> {
  const shot = await getShot(shotId, dataDirOverride)
  if (!shot) throw new Error(`Shot not found: ${shotId}`)
  return [...(shot.clipTrack || [])].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
}

export async function getShotClipBlock(
  blockId: string,
  dataDirOverride?: string
): Promise<{ shotId: string; block: ShotClipBlock } | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const found = findClipBlock(pipeline, blockId)
  if (!found) return undefined
  return { shotId: found.shot.id, block: found.block }
}

export async function updateShotClipBlock(
  blockId: string,
  patch: {
    t?: number | string
    sourceInSec?: number | string
    sourceOutSec?: number | string
    extendShot?: boolean
  },
  dataDirOverride?: string
): Promise<{ block: ShotClipBlock; shotDurationSec: number; extended: boolean }> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const found = findClipBlock(pipeline, blockId)
  if (!found) throw new Error(`Clip block not found: ${blockId}`)
  const sourceInSec =
    patch.sourceInSec !== undefined
      ? parseClipTime(patch.sourceInSec, 'source in')
      : found.block.sourceInSec
  const sourceOutSec =
    patch.sourceOutSec !== undefined
      ? parseClipTime(patch.sourceOutSec, 'source out')
      : found.block.sourceOutSec
  const next: ShotClipBlock = {
    ...found.block,
    t: patch.t !== undefined ? parseClipTime(patch.t, 'block start') : found.block.t,
    sourceInSec,
    sourceOutSec,
    durationSec: sourceOutSec - sourceInSec
  }
  validateShotClipBlock(next, found.shot, pipeline, found.shot.id, {
    excludeBlockId: blockId,
    extendShot: !!patch.extendShot
  })
  const end = clipBlockEnd(next)
  let extended = false
  if (patch.extendShot && end > found.shot.durationSec) {
    found.shot.durationSec = end
    extended = true
  }
  found.shot.clipTrack = (found.shot.clipTrack || []).map((b) => (b.id === blockId ? next : b))
  found.shot.clipTrack.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  found.shot.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
  return { block: next, shotDurationSec: found.shot.durationSec, extended }
}

export async function removeShotClipBlock(
  blockId: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const found = findClipBlock(pipeline, blockId)
  if (!found) throw new Error(`Clip block not found: ${blockId}`)
  found.shot.clipTrack = (found.shot.clipTrack || []).filter((b) => b.id !== blockId)
  found.shot.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
}

export async function addShotAudioBlock(
  shotId: string,
  input: {
    audioId: string
    role?: string
    t: number | string
    sourceInSec?: number | string
    sourceOutSec?: number | string
    durationSec?: number | string
    loop?: boolean | string
    volume?: number | string
    fadeInSec?: number | string
    fadeOutSec?: number | string
    extendShot?: boolean
    fitShot?: boolean
  },
  dataDirOverride?: string
): Promise<{ block: ShotAudioBlock; shotDurationSec: number; extended: boolean; fitted: boolean }> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const shot = pipeline.storyboardShots.find((s) => s.id === shotId)
  if (!shot) throw new Error(`Shot not found: ${shotId}`)
  if (!shot.audioTrack) shot.audioTrack = []

  const asset = (pipeline.audioAssets || []).find((a) => a.id === input.audioId)
  if (!asset) throw new Error(`Audio not found: ${input.audioId}`)

  const role = parseAudioRole(input.role, asset.kind)
  const t = parseAudioTime(input.t, 'block start')
  const plan = planAudioBlockPlacement({
    asset,
    shotDurationSec: shot.durationSec,
    t,
    sourceInSec:
      input.sourceInSec !== undefined ? parseAudioTime(input.sourceInSec, 'source in') : undefined,
    sourceOutSec:
      input.sourceOutSec !== undefined ? parseAudioTime(input.sourceOutSec, 'source out') : undefined,
    durationSec:
      input.durationSec !== undefined ? parseAudioTime(input.durationSec, 'duration') : undefined,
    loop: input.loop === undefined || input.loop === '' ? undefined : parseAudioBool(input.loop, false),
    fitShot: !!input.fitShot,
    extendShot: !!input.extendShot
  })
  const block: ShotAudioBlock = {
    id: randomUUID(),
    audioId: input.audioId,
    role,
    t,
    durationSec: plan.durationSec,
    sourceInSec: plan.sourceInSec,
    sourceOutSec: plan.sourceOutSec,
    loop: plan.loop,
    volume: parseAudioVolume(input.volume, 1),
    fadeInSec: input.fadeInSec !== undefined ? parseAudioTime(input.fadeInSec, 'fade in') : 0,
    fadeOutSec: input.fadeOutSec !== undefined ? parseAudioTime(input.fadeOutSec, 'fade out') : 0,
    schemaVersion: 1
  }

  validateShotAudioBlock(block, shot, pipeline, shotId, { extendShot: !!input.extendShot })
  const end = audioBlockEnd(block)
  let extended = false
  if (input.extendShot && end > shot.durationSec) {
    shot.durationSec = end
    extended = true
  }
  shot.audioTrack.push(block)
  shot.audioTrack.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  shot.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
  return { block, shotDurationSec: shot.durationSec, extended, fitted: plan.fitted && !extended }
}

export async function listShotAudioBlocks(
  shotId: string,
  dataDirOverride?: string
): Promise<ShotAudioBlock[]> {
  const shot = await getShot(shotId, dataDirOverride)
  if (!shot) throw new Error(`Shot not found: ${shotId}`)
  return [...(shot.audioTrack || [])].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
}

export async function getShotAudioBlock(
  blockId: string,
  dataDirOverride?: string
): Promise<{ shotId: string; block: ShotAudioBlock } | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const found = findAudioBlock(pipeline, blockId)
  if (!found) return undefined
  return { shotId: found.shot.id, block: found.block }
}

export async function updateShotAudioBlock(
  blockId: string,
  patch: {
    t?: number | string
    sourceInSec?: number | string
    sourceOutSec?: number | string
    durationSec?: number | string
    loop?: boolean | string
    volume?: number | string
    fadeInSec?: number | string
    fadeOutSec?: number | string
    extendShot?: boolean
    fitShot?: boolean
  },
  dataDirOverride?: string
): Promise<{ block: ShotAudioBlock; shotDurationSec: number; extended: boolean; fitted: boolean }> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const found = findAudioBlock(pipeline, blockId)
  if (!found) throw new Error(`Audio block not found: ${blockId}`)
  if (patch.extendShot && patch.fitShot) {
    throw new Error('Use either --fit-shot or --extend-shot, not both')
  }
  const sourceInSec =
    patch.sourceInSec !== undefined
      ? parseAudioTime(patch.sourceInSec, 'source in')
      : found.block.sourceInSec
  const sourceOutSec =
    patch.sourceOutSec !== undefined
      ? parseAudioTime(patch.sourceOutSec, 'source out')
      : found.block.sourceOutSec
  const loop = patch.loop !== undefined ? parseAudioBool(patch.loop, found.block.loop) : found.block.loop
  const trim = sourceOutSec - sourceInSec
  const durationSec =
    patch.durationSec !== undefined
      ? parseAudioTime(patch.durationSec, 'duration')
      : loop
        ? found.block.durationSec
        : trim
  let next: ShotAudioBlock = {
    ...found.block,
    t: patch.t !== undefined ? parseAudioTime(patch.t, 'block start') : found.block.t,
    sourceInSec,
    sourceOutSec,
    durationSec,
    loop,
    volume: patch.volume !== undefined ? parseAudioVolume(patch.volume, found.block.volume) : found.block.volume,
    fadeInSec:
      patch.fadeInSec !== undefined ? parseAudioTime(patch.fadeInSec, 'fade in') : found.block.fadeInSec,
    fadeOutSec:
      patch.fadeOutSec !== undefined
        ? parseAudioTime(patch.fadeOutSec, 'fade out')
        : found.block.fadeOutSec,
    schemaVersion: 1
  }
  let fitted = false
  if (patch.fitShot) {
    const before = JSON.stringify({
      durationSec: next.durationSec,
      sourceOutSec: next.sourceOutSec
    })
    next = fitAudioBlockToShotEnd(next, found.shot.durationSec)
    fitted =
      JSON.stringify({ durationSec: next.durationSec, sourceOutSec: next.sourceOutSec }) !== before
  }
  validateShotAudioBlock(next, found.shot, pipeline, found.shot.id, {
    excludeBlockId: blockId,
    extendShot: !!patch.extendShot
  })
  const end = audioBlockEnd(next)
  let extended = false
  if (patch.extendShot && end > found.shot.durationSec) {
    found.shot.durationSec = end
    extended = true
  }
  found.shot.audioTrack = (found.shot.audioTrack || []).map((b) => (b.id === blockId ? next : b))
  found.shot.audioTrack.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  found.shot.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
  return { block: next, shotDurationSec: found.shot.durationSec, extended, fitted }
}

export async function removeShotAudioBlock(
  blockId: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const found = findAudioBlock(pipeline, blockId)
  if (!found) throw new Error(`Audio block not found: ${blockId}`)
  found.shot.audioTrack = (found.shot.audioTrack || []).filter((b) => b.id !== blockId)
  found.shot.updatedAt = new Date().toISOString()
  await updateAssetPipeline(pipeline, dataDirOverride)
}
