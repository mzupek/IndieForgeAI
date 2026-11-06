import { randomUUID } from 'crypto'
import { copyFile, mkdir, access, unlink } from 'fs/promises'
import { extname, join } from 'path'
import sharp from 'sharp'
import type { AssetState } from '@shared/types/assetPipeline'
import {
  getAssetPipeline,
  getVisualAsset,
  getAssetStates,
  getAssetState,
  addAssetState,
  updateAssetState,
  deleteAssetState
} from '@core/storage/studioStorage'
import { getDataDir } from '@core/storage/dataDir'
import { output, outputError } from '../utils/output'

interface Options {
  dataDir?: string
  json?: boolean
  game: string
  asset?: string
  name?: string
  file?: string
}

async function verifyGameExists(gameId: string, dataDir?: string) {
  const pipeline = await getAssetPipeline(dataDir)
  
  if (!pipeline.games.some(g => g.id === gameId)) {
    throw new Error(`Game not found: ${gameId}`)
  }
}

export async function list(options: Options): Promise<void> {
  try {
    if (!options.asset) {
      throw new Error('--asset is required')
    }
    
    await verifyGameExists(options.game, options.dataDir)
    const asset = await getVisualAsset(options.asset, options.dataDir)
    
    if (!asset) {
      throw new Error(`Visual asset not found: ${options.asset}`)
    }
    
    // Verify asset belongs to requested game
    if (asset.gameId !== options.game) {
      throw new Error(`Asset '${options.asset}' belongs to game '${asset.gameId}', not '${options.game}'`)
    }
    
    const states = await getAssetStates(options.asset, options.dataDir)
    
    if (options.json) {
      output(states, options)
    } else {
      if (states.length === 0) {
        console.log(`\nNo states for asset '${asset.name}'`)
        console.log(`  Asset ID: ${options.asset}`)
        console.log(`  This is a single-state asset`)
      } else {
        console.log(`\nAsset States for '${asset.name}' (${states.length}):\n`)
        for (const state of states) {
          const isDefault = asset.defaultStateId === state.id
          console.log(`  ${state.id}${isDefault ? ' (DEFAULT)' : ''}`)
          console.log(`    Name: ${state.name}`)
          console.log(`    File: ${state.file}`)
          if (state.boundingBox) {
            console.log(`    Bounding Box: ${state.boundingBox.width} × ${state.boundingBox.height}`)
          }
          console.log()
        }
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function show(stateId: string, options: Options): Promise<void> {
  try {
    await verifyGameExists(options.game, options.dataDir)
    const state = await getAssetState(stateId, options.dataDir)
    
    if (!state) {
      throw new Error(`Asset state not found: ${stateId}`)
    }
    
    // Verify asset belongs to requested game
    const asset = await getVisualAsset(state.assetId, options.dataDir)
    if (!asset) {
      throw new Error(`Parent asset not found: ${state.assetId}`)
    }
    
    if (asset.gameId !== options.game) {
      throw new Error(`Asset '${state.assetId}' belongs to game '${asset.gameId}', not '${options.game}'`)
    }
    
    if (options.json) {
      output(state, options)
    } else {
      const isDefault = asset.defaultStateId === stateId
      console.log(`\nAsset State: ${state.name}${isDefault ? ' (DEFAULT)' : ''}\n`)
      console.log(`  ID: ${state.id}`)
      console.log(`  Asset: ${asset.name} (${state.assetId})`)
      console.log(`  File: ${state.file}`)
      if (state.boundingBox) {
        console.log(`  Bounding Box: ${state.boundingBox.width} × ${state.boundingBox.height}`)
      }
      console.log(`  Schema Version: ${state.schemaVersion}`)
      console.log(`  Created: ${state.createdAt}`)
      console.log(`  Updated: ${state.updatedAt}`)
      console.log()
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function create(options: Options): Promise<void> {
  try {
    if (!options.asset || !options.name || !options.file) {
      throw new Error('--asset, --name, and --file are required')
    }
    
    await verifyGameExists(options.game, options.dataDir)
    const asset = await getVisualAsset(options.asset, options.dataDir)
    
    if (!asset) {
      throw new Error(`Visual asset not found: ${options.asset}`)
    }
    
    // Verify asset belongs to requested game
    if (asset.gameId !== options.game) {
      throw new Error(`Asset '${options.asset}' belongs to game '${asset.gameId}', not '${options.game}'`)
    }
    
    // Verify file exists and is PNG
    try {
      await access(options.file)
    } catch {
      throw new Error(`File not found: ${options.file}`)
    }
    
    const ext = extname(options.file).toLowerCase()
    if (ext !== '.png') {
      throw new Error(`File must be PNG format, got: ${ext}`)
    }
    
    const now = new Date().toISOString()
    const stateId = randomUUID()
    
    // Create assets directory
    const assetsDir = join(getDataDir(options.dataDir), 'assets', options.asset)
    await mkdir(assetsDir, { recursive: true })
    
    // Copy file to assets directory
    const statePath = join(assetsDir, `state_${stateId}.png`)
    await copyFile(options.file, statePath)
    
    // Generate thumbnail
    const thumbPath = join(assetsDir, `state_${stateId}_thumb.png`)
    const metadata = await sharp(options.file)
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(thumbPath)
    
    const state: AssetState = {
      id: stateId,
      assetId: options.asset,
      name: options.name,
      file: statePath,
      boundingBox: { width: metadata.width, height: metadata.height },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    }
    
    await addAssetState(state, options.dataDir)
    
    if (options.json) {
      output(state, options)
    } else {
      console.log(`\nCreated asset state: ${state.name} (${state.id})`)
      console.log(`  Asset: ${asset.name}`)
      console.log(`  File: ${statePath}`)
      console.log(`  Thumbnail: ${thumbPath}`)
      console.log(`\nNext steps:`)
      console.log(`  - Set as default: forge asset set-default-state ${options.asset} --state ${stateId} --game ${options.game}`)
      console.log(`  - Add more states: forge asset-state create --game ${options.game} --asset ${options.asset} --name "..." --file "./path.png"`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function update(stateId: string, options: Options): Promise<void> {
  try {
    await verifyGameExists(options.game, options.dataDir)
    const state = await getAssetState(stateId, options.dataDir)
    
    if (!state) {
      throw new Error(`Asset state not found: ${stateId}`)
    }
    
    // Verify asset belongs to requested game
    const asset = await getVisualAsset(state.assetId, options.dataDir)
    if (!asset) {
      throw new Error(`Parent asset not found: ${state.assetId}`)
    }
    
    if (asset.gameId !== options.game) {
      throw new Error(`Asset '${state.assetId}' belongs to game '${asset.gameId}', not '${options.game}'`)
    }
    
    // Update name if provided
    if (options.name) {
      state.name = options.name
    }
    
    // Update file if provided
    if (options.file) {
      // Verify new file exists and is PNG
      try {
        await access(options.file)
      } catch {
        throw new Error(`File not found: ${options.file}`)
      }
      
      const ext = extname(options.file).toLowerCase()
      if (ext !== '.png') {
        throw new Error(`File must be PNG format, got: ${ext}`)
      }
      
      // Delete old file
      try {
        await unlink(state.file)
        const oldThumb = state.file.replace('.png', '_thumb.png')
        await unlink(oldThumb)
      } catch {
        // Ignore if old file doesn't exist
      }
      
      // Copy new file
      const assetsDir = join(getDataDir(options.dataDir), 'assets', state.assetId)
      await mkdir(assetsDir, { recursive: true })
      
      const statePath = join(assetsDir, `state_${stateId}.png`)
      await copyFile(options.file, statePath)
      
      // Generate new thumbnail
      const thumbPath = join(assetsDir, `state_${stateId}_thumb.png`)
      const metadata = await sharp(options.file)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(thumbPath)
      
      state.file = statePath
      state.boundingBox = { width: metadata.width, height: metadata.height }
    }
    
    state.updatedAt = new Date().toISOString()
    
    await updateAssetState(state, options.dataDir)
    
    if (options.json) {
      output(state, options)
    } else {
      console.log(`\nUpdated asset state: ${state.name} (${state.id})`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function deleteState(stateId: string, options: Options): Promise<void> {
  try {
    await verifyGameExists(options.game, options.dataDir)
    const state = await getAssetState(stateId, options.dataDir)
    
    if (!state) {
      throw new Error(`Asset state not found: ${stateId}`)
    }
    
    // Verify asset belongs to requested game
    const asset = await getVisualAsset(state.assetId, options.dataDir)
    if (!asset) {
      throw new Error(`Parent asset not found: ${state.assetId}`)
    }
    
    if (asset.gameId !== options.game) {
      throw new Error(`Asset '${state.assetId}' belongs to game '${asset.gameId}', not '${options.game}'`)
    }
    
    // Delete state (will reject if this is the default state)
    await deleteAssetState(stateId, options.dataDir)
    
    // Delete files
    try {
      await unlink(state.file)
      const thumbPath = state.file.replace('.png', '_thumb.png')
      await unlink(thumbPath)
    } catch {
      // Ignore if files don't exist
    }
    
    if (options.json) {
      output({ deleted: true, stateId }, options)
    } else {
      console.log(`\nDeleted asset state: ${state.name} (${stateId})`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}
