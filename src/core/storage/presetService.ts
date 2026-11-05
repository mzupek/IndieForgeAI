import { randomUUID } from 'crypto'
import type { ScenePreset, ScenePresetType } from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from './studioStorage'
import { getDefaultParams, validatePresetParams } from '@shared/validation/presetDefaults'

/**
 * Create a new scene preset
 */
export async function createPreset(
  type: ScenePresetType,
  options: {
    params?: Record<string, unknown>
    tags?: string[]
    dataDirOverride?: string
  } = {}
): Promise<ScenePreset> {
  const pipeline = await getAssetPipeline(options.dataDirOverride)
  
  const defaultParams = getDefaultParams(type)
  const params = { ...defaultParams, ...(options.params || {}) }
  
  // Validate params
  const errors = validatePresetParams(type, params)
  if (errors.length > 0) {
    throw new Error(`Invalid preset params: ${errors.join(', ')}`)
  }
  
  const now = new Date().toISOString()
  const preset: ScenePreset = {
    id: randomUUID(),
    type,
    params,
    tags: options.tags || [],
    createdAt: now,
    updatedAt: now
  }
  
  pipeline.scenePresets.push(preset)
  await updateAssetPipeline(pipeline, options.dataDirOverride)
  
  return preset
}

/**
 * Get preset by ID
 */
export async function getPreset(
  presetId: string,
  dataDirOverride?: string
): Promise<ScenePreset | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.scenePresets.find(p => p.id === presetId)
}

/**
 * List all presets
 */
export async function listPresets(
  filters?: {
    type?: ScenePresetType
    tags?: string[]
  },
  dataDirOverride?: string
): Promise<ScenePreset[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  let presets = pipeline.scenePresets
  
  if (filters?.type) {
    presets = presets.filter(p => p.type === filters.type)
  }
  
  if (filters?.tags && filters.tags.length > 0) {
    presets = presets.filter(p =>
      filters.tags!.some(tag => p.tags.includes(tag))
    )
  }
  
  return presets
}

/**
 * Update a preset
 */
export async function updatePreset(
  presetId: string,
  updates: {
    params?: Record<string, unknown>
    tags?: string[]
  },
  dataDirOverride?: string
): Promise<ScenePreset> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const preset = pipeline.scenePresets.find(p => p.id === presetId)
  
  if (!preset) {
    throw new Error(`Preset not found: ${presetId}`)
  }
  
  if (updates.params) {
    const newParams = { ...preset.params, ...updates.params }
    const errors = validatePresetParams(preset.type, newParams)
    if (errors.length > 0) {
      throw new Error(`Invalid preset params: ${errors.join(', ')}`)
    }
    preset.params = newParams
  }
  
  if (updates.tags !== undefined) {
    preset.tags = updates.tags
  }
  
  preset.updatedAt = new Date().toISOString()
  
  await updateAssetPipeline(pipeline, dataDirOverride)
  
  return preset
}

/**
 * Remove a preset
 */
export async function removePreset(
  presetId: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const index = pipeline.scenePresets.findIndex(p => p.id === presetId)
  
  if (index === -1) {
    throw new Error(`Preset not found: ${presetId}`)
  }
  
  pipeline.scenePresets.splice(index, 1)
  await updateAssetPipeline(pipeline, dataDirOverride)
}
