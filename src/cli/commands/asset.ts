import { randomUUID } from 'crypto'
import { copyFile, mkdir } from 'fs/promises'
import { extname } from 'path'
import sharp from 'sharp'
import type { VisualAsset } from '@shared/types/assetPipeline'
import {
  getAssetPipeline,
  updateAssetPipeline,
  getVisualAssets,
  getVisualAsset,
  addVisualAsset,
  updateVisualAsset,
  deleteVisualAsset
} from '@core/storage/studioStorage'
import { getDataDir } from '@core/storage/dataDir'
import { output, outputError } from '../utils/output'
import { join } from 'path'

interface Options {
  dataDir?: string
  json?: boolean
  game: string
  name?: string
  category?: 'logo' | 'symbol' | 'item' | 'weapon' | 'prop'
  tags?: string
  image?: string
}

async function verifyGameExists(gameId: string, dataDir?: string) {
  const pipeline = await getAssetPipeline(dataDir)
  
  if (!pipeline.games.some(g => g.id === gameId)) {
    throw new Error(`Game not found: ${gameId}`)
  }
}

export async function list(options: Options): Promise<void> {
  try {
    await verifyGameExists(options.game, options.dataDir)
    const assets = await getVisualAssets(options.game, options.dataDir)
    
    // Filter by category if specified
    const filtered = options.category 
      ? assets.filter(a => a.category === options.category)
      : assets
    
    if (options.json) {
      output(filtered, options)
    } else {
      if (filtered.length === 0) {
        console.log('No visual assets found')
      } else {
        console.log(`\nVisual Assets (${filtered.length}):\n`)
        for (const asset of filtered) {
          console.log(`  ${asset.id}`)
          console.log(`    Name: ${asset.name}`)
          console.log(`    Category: ${asset.category}`)
          if (asset.tags.length > 0) console.log(`    Tags: ${asset.tags.join(', ')}`)
          console.log(`    Default State: ${asset.defaultStateId || 'none (single-state)'}`)
          console.log()
        }
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function show(assetId: string, options: Options): Promise<void> {
  try {
    await verifyGameExists(options.game, options.dataDir)
    const asset = await getVisualAsset(assetId, options.dataDir)
    
    if (!asset) {
      throw new Error(`Visual asset not found: ${assetId}`)
    }
    
    // Verify asset belongs to requested game
    if (asset.gameId !== options.game) {
      throw new Error(`Asset '${assetId}' belongs to game '${asset.gameId}', not '${options.game}'`)
    }
    
    if (options.json) {
      output(asset, options)
    } else {
      console.log(`\nVisual Asset: ${asset.name}\n`)
      console.log(`  ID: ${asset.id}`)
      console.log(`  Game ID: ${asset.gameId}`)
      console.log(`  Category: ${asset.category}`)
      if (asset.tags.length > 0) console.log(`  Tags: ${asset.tags.join(', ')}`)
      console.log(`  Default State: ${asset.defaultStateId || 'none (single-state)'}`)
      if (asset.thumbnail) console.log(`  Thumbnail: ${asset.thumbnail}`)
      console.log(`  Schema Version: ${asset.schemaVersion}`)
      console.log(`  Created: ${asset.createdAt}`)
      console.log(`  Updated: ${asset.updatedAt}`)
      console.log()
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function create(options: Options): Promise<void> {
  try {
    if (!options.name || !options.category) {
      throw new Error('--name and --category are required')
    }
    
    // Validate category
    const validCategories: Array<'logo' | 'symbol' | 'item' | 'weapon' | 'prop'> = ['logo', 'symbol', 'item', 'weapon', 'prop']
    if (!validCategories.includes(options.category)) {
      throw new Error(`Invalid category: ${options.category}. Must be one of: ${validCategories.join(', ')}`)
    }
    
    await verifyGameExists(options.game, options.dataDir)
    
    const now = new Date().toISOString()
    const assetId = randomUUID()
    const dataDir = options.dataDir || getDataDir()
    
    const asset: VisualAsset = {
      id: assetId,
      gameId: options.game,
      name: options.name,
      category: options.category,
      tags: options.tags ? options.tags.split(',').map(t => t.trim()) : [],
      defaultStateId: null, // Single-state by default, will be set when states added
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    }
    
    // Handle optional image import for static assets
    if (options.image) {
      const assetsDir = join(dataDir, 'assets', assetId)
      await mkdir(assetsDir, { recursive: true })
      
      // Validate file extension
      const ext = extname(options.image).toLowerCase()
      if (ext !== '.png') {
        throw new Error(`Image must be PNG format, got: ${ext}`)
      }
      
      // Copy image file
      const imagePath = join(assetsDir, 'image.png')
      await copyFile(options.image, imagePath)
      
      // Generate thumbnail
      const thumbPath = join(assetsDir, 'thumbnail.png')
      await sharp(options.image)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(thumbPath)
      
      // Set thumbnail path on asset
      asset.thumbnail = thumbPath
    }
    
    await addVisualAsset(asset, options.dataDir)
    
    if (options.json) {
      output(asset, options)
    } else {
      console.log(`\nCreated visual asset: ${asset.name} (${asset.id})`)
      console.log(`  Category: ${asset.category}`)
      console.log(`  Game: ${options.game}`)
      if (options.image) {
        console.log(`  Image: imported from ${options.image}`)
        console.log(`  Thumbnail: generated`)
      }
      console.log(`\nNext steps:`)
      if (!options.image) {
        console.log(`  - Add image: forge asset update ${assetId} --game ${options.game} --image "./path.png"`)
      }
      console.log(`  - Add states: forge asset-state create --game ${options.game} --asset ${assetId} --name "..." --file "./path.png"`)
      console.log(`  - Or use as single-state asset in scenes`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function update(assetId: string, options: Options): Promise<void> {
  try {
    await verifyGameExists(options.game, options.dataDir)
    const asset = await getVisualAsset(assetId, options.dataDir)
    
    if (!asset) {
      throw new Error(`Visual asset not found: ${assetId}`)
    }
    
    // Verify asset belongs to requested game
    if (asset.gameId !== options.game) {
      throw new Error(`Asset '${assetId}' belongs to game '${asset.gameId}', not '${options.game}'`)
    }
    
    // Update fields
    if (options.name) asset.name = options.name
    if (options.category) {
      const validCategories: Array<'logo' | 'symbol' | 'item' | 'weapon' | 'prop'> = ['logo', 'symbol', 'item', 'weapon', 'prop']
      if (!validCategories.includes(options.category)) {
        throw new Error(`Invalid category: ${options.category}. Must be one of: ${validCategories.join(', ')}`)
      }
      asset.category = options.category
    }
    if (options.tags !== undefined) {
      asset.tags = options.tags.split(',').map(t => t.trim())
    }
    
    // Handle image update
    if (options.image) {
      const dataDir = options.dataDir || getDataDir()
      const assetsDir = join(dataDir, 'assets', assetId)
      await mkdir(assetsDir, { recursive: true })
      
      // Validate file extension
      const ext = extname(options.image).toLowerCase()
      if (ext !== '.png') {
        throw new Error(`Image must be PNG format, got: ${ext}`)
      }
      
      // Copy image file
      const imagePath = join(assetsDir, 'image.png')
      await copyFile(options.image, imagePath)
      
      // Generate thumbnail
      const thumbPath = join(assetsDir, 'thumbnail.png')
      await sharp(options.image)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(thumbPath)
      
      // Update thumbnail path
      asset.thumbnail = thumbPath
    }
    
    asset.updatedAt = new Date().toISOString()
    
    await updateVisualAsset(asset, options.dataDir)
    
    if (options.json) {
      output(asset, options)
    } else {
      console.log(`\nUpdated visual asset: ${asset.name} (${asset.id})`)
      if (options.image) {
        console.log(`  Image: imported from ${options.image}`)
        console.log(`  Thumbnail: generated`)
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function deleteAsset(assetId: string, options: Options): Promise<void> {
  try {
    await verifyGameExists(options.game, options.dataDir)
    const asset = await getVisualAsset(assetId, options.dataDir)
    
    if (!asset) {
      throw new Error(`Visual asset not found: ${assetId}`)
    }
    
    // Verify asset belongs to requested game
    if (asset.gameId !== options.game) {
      throw new Error(`Asset '${assetId}' belongs to game '${asset.gameId}', not '${options.game}'`)
    }
    
    // Check for dependencies (P2: will check layer references)
    // For now, just cascade owned states
    
    const result = await deleteVisualAsset(assetId, options.dataDir)
    
    if (options.json) {
      output({ deleted: true, assetId, statesDeleted: result.statesDeleted }, options)
    } else {
      console.log(`\nDeleted visual asset: ${asset.name} (${assetId})`)
      if (result.statesDeleted > 0) {
        console.log(`  Cascade deleted ${result.statesDeleted} state(s)`)
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

interface SetDefaultOptions {
  dataDir?: string
  json?: boolean
  game: string
  state: string
}

export async function setDefaultState(assetId: string, options: SetDefaultOptions): Promise<void> {
  try {
    await verifyGameExists(options.game, options.dataDir)
    const asset = await getVisualAsset(assetId, options.dataDir)
    
    if (!asset) {
      throw new Error(`Visual asset not found: ${assetId}`)
    }
    
    // Verify asset belongs to requested game
    if (asset.gameId !== options.game) {
      throw new Error(`Asset '${assetId}' belongs to game '${asset.gameId}', not '${options.game}'`)
    }
    
    // Verify state exists and belongs to this asset
    const pipeline = await getAssetPipeline(options.dataDir)
    const state = pipeline.assetStates.find(s => s.id === options.state)
    
    if (!state) {
      throw new Error(`Asset state not found: ${options.state}`)
    }
    
    if (state.assetId !== assetId) {
      throw new Error(`State '${options.state}' does not belong to asset '${assetId}'`)
    }
    
    // Update default state
    asset.defaultStateId = options.state
    asset.updatedAt = new Date().toISOString()
    
    await updateVisualAsset(asset, options.dataDir)
    
    if (options.json) {
      output(asset, options)
    } else {
      console.log(`\nSet default state for asset '${asset.name}': ${state.name} (${options.state})`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}
