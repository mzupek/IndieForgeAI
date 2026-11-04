import { randomUUID } from 'crypto'
import { copyFile, mkdir } from 'fs/promises'
import { extname } from 'path'
import sharp from 'sharp'
import type { Character } from '@shared/types/assetPipeline'
import { loadProject as coreLoadProject, listProjects as coreListProjects, saveProject as coreSaveProject } from '@core/storage/projectStorage'
import { getProjectDir } from '@core/storage/dataDir'
import { output, outputError } from '../utils/output'
import { join } from 'path'

interface Options {
  dataDir?: string
  json?: boolean
  game: string
  name?: string
  role?: string
  styleNotes?: string
  tags?: string
  reference?: string
}

async function findProjectByGame(gameId: string, dataDir?: string) {
  const projects = await coreListProjects(dataDir)
  
  for (const project of projects) {
    if (project.assetPipeline?.games.some(g => g.id === gameId)) {
      return project
    }
  }
  
  throw new Error(`Game not found: ${gameId}`)
}

export async function list(options: Options): Promise<void> {
  try {
    const project = await findProjectByGame(options.game, options.dataDir)
    
    if (!project.assetPipeline) {
      throw new Error('Project has no asset pipeline data')
    }
    
    const characters = project.assetPipeline.characters.filter(c => c.gameId === options.game)
    
    if (options.json) {
      output(characters, options)
    } else {
      if (characters.length === 0) {
        console.log('No characters found')
      } else {
        console.log(`\nCharacters (${characters.length}):\n`)
        for (const char of characters) {
          console.log(`  ${char.id}`)
          console.log(`    Name: ${char.name}`)
          console.log(`    Role: ${char.role}`)
          if (char.styleNotes) console.log(`    Style Notes: ${char.styleNotes}`)
          if (char.tags.length > 0) console.log(`    Tags: ${char.tags.join(', ')}`)
          console.log()
        }
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function show(characterId: string, options: Options): Promise<void> {
  try {
    const project = await findProjectByGame(options.game, options.dataDir)
    
    if (!project.assetPipeline) {
      throw new Error('Project has no asset pipeline data')
    }
    
    const character = project.assetPipeline.characters.find(c => c.id === characterId)
    
    if (!character) {
      throw new Error(`Character not found: ${characterId}`)
    }
    
    if (options.json) {
      output(character, options)
    } else {
      console.log(`\nCharacter: ${character.name}\n`)
      console.log(`  ID: ${character.id}`)
      console.log(`  Game ID: ${character.gameId}`)
      console.log(`  Role: ${character.role}`)
      if (character.styleNotes) console.log(`  Style Notes: ${character.styleNotes}`)
      if (character.tags.length > 0) console.log(`  Tags: ${character.tags.join(', ')}`)
      if (character.referenceImage) console.log(`  Reference Image: ${character.referenceImage}`)
      if (character.thumbnail) console.log(`  Thumbnail: ${character.thumbnail}`)
      console.log(`  Created: ${character.createdAt}`)
      console.log(`  Updated: ${character.updatedAt}`)
      console.log()
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function create(options: Options): Promise<void> {
  try {
    if (!options.name || !options.role) {
      throw new Error('--name and --role are required')
    }
    
    const project = await findProjectByGame(options.game, options.dataDir)
    
    if (!project.assetPipeline) {
      throw new Error('Project has no asset pipeline data')
    }
    
    const now = new Date().toISOString()
    const characterId = randomUUID()
    
    const character: Character = {
      id: characterId,
      gameId: options.game,
      name: options.name,
      role: options.role,
      styleNotes: options.styleNotes,
      tags: options.tags ? options.tags.split(',').map(t => t.trim()) : [],
      createdAt: now,
      updatedAt: now
    }
    
    // Handle reference image if provided
    if (options.reference) {
      const ext = extname(options.reference)
      const refPath = join(getProjectDir(project.id, options.dataDir), 'characters', `${characterId}_ref${ext}`)
      const thumbPath = join(getProjectDir(project.id, options.dataDir), 'characters', `${characterId}_thumb.png`)
      
      await mkdir(join(getProjectDir(project.id, options.dataDir), 'characters'), { recursive: true })
      await copyFile(options.reference, refPath)
      await sharp(options.reference)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(thumbPath)
      
      character.referenceImage = refPath
      character.thumbnail = thumbPath
    }
    
    project.assetPipeline.characters.push(character)
    await coreSaveProject(project, options.dataDir)
    
    if (options.json) {
      output(character, options)
    } else {
      console.log(`\nCreated character: ${character.name} (${character.id})`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function update(characterId: string, options: Options): Promise<void> {
  try {
    const project = await findProjectByGame(options.game, options.dataDir)
    
    if (!project.assetPipeline) {
      throw new Error('Project has no asset pipeline data')
    }
    
    const index = project.assetPipeline.characters.findIndex(c => c.id === characterId)
    
    if (index === -1) {
      throw new Error(`Character not found: ${characterId}`)
    }
    
    const character = project.assetPipeline.characters[index]
    
    if (options.name) character.name = options.name
    if (options.role) character.role = options.role
    if (options.styleNotes !== undefined) character.styleNotes = options.styleNotes
    if (options.tags !== undefined) {
      character.tags = options.tags.split(',').map(t => t.trim())
    }
    
    // Handle reference image if provided
    if (options.reference) {
      const ext = extname(options.reference)
      const refPath = join(getProjectDir(project.id, options.dataDir), 'characters', `${characterId}_ref${ext}`)
      const thumbPath = join(getProjectDir(project.id, options.dataDir), 'characters', `${characterId}_thumb.png`)
      
      await mkdir(join(getProjectDir(project.id, options.dataDir), 'characters'), { recursive: true })
      await copyFile(options.reference, refPath)
      await sharp(options.reference)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(thumbPath)
      
      character.referenceImage = refPath
      character.thumbnail = thumbPath
    }
    
    character.updatedAt = new Date().toISOString()
    project.assetPipeline.characters[index] = character
    
    await coreSaveProject(project, options.dataDir)
    
    if (options.json) {
      output(character, options)
    } else {
      console.log(`\nUpdated character: ${character.name} (${character.id})`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function deleteCharacter(characterId: string, options: Options): Promise<void> {
  try {
    const project = await findProjectByGame(options.game, options.dataDir)
    
    if (!project.assetPipeline) {
      throw new Error('Project has no asset pipeline data')
    }
    
    const character = project.assetPipeline.characters.find(c => c.id === characterId)
    
    if (!character) {
      throw new Error(`Character not found: ${characterId}`)
    }
    
    project.assetPipeline.characters = project.assetPipeline.characters.filter(c => c.id !== characterId)
    
    // Also remove associated poses
    project.assetPipeline.poses = project.assetPipeline.poses.filter(p => p.characterId !== characterId)
    
    await coreSaveProject(project, options.dataDir)
    
    if (options.json) {
      output({ deleted: true, characterId }, options)
    } else {
      console.log(`\nDeleted character: ${character.name} (${characterId})`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}
