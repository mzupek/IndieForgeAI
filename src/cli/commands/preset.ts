/**
 * Preset CLI commands
 */

import type { ScenePreset, ScenePresetType } from '@shared/types/assetPipeline'
import { getDefaultParams } from '@shared/validation/presetDefaults'
import {
  createPreset as createPresetService,
  listPresets,
  getPreset,
  updatePreset as updatePresetService,
  removePreset as removePresetService
} from '@core/storage/presetService'

interface BaseOptions {
  json?: boolean
  dataDir?: string
}

/**
 * List presets with optional filtering
 */
export async function list(options: BaseOptions & {
  type?: ScenePresetType
  tags?: string
}): Promise<void> {
  try {
    const filters: { type?: ScenePresetType; tags?: string[] } = {}
    
    if (options.type) {
      filters.type = options.type
    }
    
    if (options.tags) {
      filters.tags = options.tags.split(',').map(t => t.trim())
    }
    
    const presets = await listPresets(filters, options.dataDir)
    
    if (options.json) {
      console.log(JSON.stringify(presets, null, 2))
    } else {
      if (presets.length === 0) {
        console.log('No presets found')
        return
      }
      
      console.log(`Found ${presets.length} preset(s):\n`)
      for (const preset of presets) {
        console.log(`  ${preset.id}`)
        console.log(`    Type: ${preset.type}`)
        console.log(`    Tags: ${preset.tags.join(', ') || 'none'}`)
        console.log(`    Created: ${preset.createdAt}`)
        console.log()
      }
    }
  } catch (err) {
    if (options.json) {
      console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    } else {
      console.error('Error:', err instanceof Error ? err.message : err)
    }
    process.exit(1)
  }
}

/**
 * Show preset details
 */
export async function show(presetId: string, options: BaseOptions): Promise<void> {
  try {
    const preset = await getPreset(presetId, options.dataDir)
    
    if (!preset) {
      throw new Error(`Preset not found: ${presetId}`)
    }
    
    if (options.json) {
      console.log(JSON.stringify(preset, null, 2))
    } else {
      console.log(`Preset: ${preset.id}`)
      console.log(`  Type: ${preset.type}`)
      console.log(`  Params:`)
      for (const [key, value] of Object.entries(preset.params)) {
        console.log(`    ${key}: ${JSON.stringify(value)}`)
      }
      console.log(`  Tags: ${preset.tags.join(', ') || 'none'}`)
      console.log(`  Created: ${preset.createdAt}`)
      console.log(`  Updated: ${preset.updatedAt}`)
    }
  } catch (err) {
    if (options.json) {
      console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    } else {
      console.error('Error:', err instanceof Error ? err.message : err)
    }
    process.exit(1)
  }
}

/**
 * Create a new preset
 */
export async function create(options: BaseOptions & {
  type: ScenePresetType
  params?: string
  tags?: string
}): Promise<void> {
  try {
    let params = getDefaultParams(options.type)
    
    if (options.params) {
      try {
        const customParams = JSON.parse(options.params)
        params = { ...params, ...customParams }
      } catch (err) {
        throw new Error(`Invalid --params JSON: ${err instanceof Error ? err.message : err}`)
      }
    }
    
    const tags = options.tags
      ? options.tags.split(',').map(t => t.trim())
      : []
    
    const preset = await createPresetService(options.type, {
      params,
      tags,
      dataDirOverride: options.dataDir
    })
    
    if (options.json) {
      console.log(JSON.stringify(preset, null, 2))
    } else {
      console.log(`✓ Created preset: ${preset.id}`)
      console.log(`  Type: ${preset.type}`)
      console.log(`  Tags: ${tags.join(', ') || 'none'}`)
    }
  } catch (err) {
    if (options.json) {
      console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    } else {
      console.error('Error:', err instanceof Error ? err.message : err)
    }
    process.exit(1)
  }
}

/**
 * Update a preset
 */
export async function update(presetId: string, options: BaseOptions & {
  params?: string
  tags?: string
}): Promise<void> {
  try {
    const updates: { params?: Record<string, unknown>; tags?: string[] } = {}
    
    if (options.params) {
      try {
        updates.params = JSON.parse(options.params)
      } catch (err) {
        throw new Error(`Invalid --params JSON: ${err instanceof Error ? err.message : err}`)
      }
    }
    
    if (options.tags !== undefined) {
      updates.tags = options.tags.split(',').map(t => t.trim())
    }
    
    const preset = await updatePresetService(presetId, updates, options.dataDir)
    
    if (options.json) {
      console.log(JSON.stringify(preset, null, 2))
    } else {
      console.log(`✓ Updated preset: ${preset.id}`)
    }
  } catch (err) {
    if (options.json) {
      console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    } else {
      console.error('Error:', err instanceof Error ? err.message : err)
    }
    process.exit(1)
  }
}

/**
 * Remove a preset
 */
export async function remove(presetId: string, options: BaseOptions): Promise<void> {
  try {
    await removePresetService(presetId, options.dataDir)
    
    if (options.json) {
      console.log(JSON.stringify({ deleted: true, presetId }))
    } else {
      console.log(`✓ Removed preset: ${presetId}`)
    }
  } catch (err) {
    if (options.json) {
      console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    } else {
      console.error('Error:', err instanceof Error ? err.message : err)
    }
    process.exit(1)
  }
}
