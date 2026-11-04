import { randomUUID } from 'crypto'
import { copyFile, mkdir } from 'fs/promises'
import { basename, extname, join } from 'path'
import sharp from 'sharp'
import type { Character } from '@shared/types/assetPipeline'
import { loadProject, saveProject } from './projectStore'

function getCharacterAssetsDir(projectId: string): string {
  const { app } = require('electron')
  const userData = app.getPath('userData')
  return join(userData, 'projects', projectId, 'characters')
}

/**
 * Create a character in the asset pipeline
 */
export async function createCharacter(
  projectId: string,
  input: {
    gameId: string
    name: string
    role: string
    styleNotes?: string
    tags?: string[]
  }
): Promise<Character> {
  const project = await loadProject(projectId)
  
  if (!project.assetPipeline) {
    project.assetPipeline = {
      schemaVersion: 1,
      games: [],
      characters: [],
      poses: [],
      clips: [],
      scenePresets: [],
      exportProfiles: []
    }
  }

  const now = new Date().toISOString()
  const character: Character = {
    id: randomUUID(),
    gameId: input.gameId,
    name: input.name,
    role: input.role,
    styleNotes: input.styleNotes,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now
  }

  project.assetPipeline.characters.push(character)
  await saveProject(project)
  return character
}

/**
 * Update a character
 */
export async function updateCharacter(
  projectId: string,
  characterId: string,
  patch: Partial<Omit<Character, 'id' | 'gameId' | 'createdAt' | 'updatedAt'>>
): Promise<Character> {
  const project = await loadProject(projectId)
  
  if (!project.assetPipeline) {
    throw new Error('Project has no asset pipeline data')
  }

  const index = project.assetPipeline.characters.findIndex((c) => c.id === characterId)
  if (index === -1) {
    throw new Error(`Character not found: ${characterId}`)
  }

  const existing = project.assetPipeline.characters[index]
  const updated: Character = {
    ...existing,
    ...patch,
    id: existing.id,
    gameId: existing.gameId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  }

  project.assetPipeline.characters[index] = updated
  await saveProject(project)
  return updated
}

/**
 * Delete a character and its associated poses
 */
export async function deleteCharacter(
  projectId: string,
  characterId: string
): Promise<void> {
  const project = await loadProject(projectId)
  
  if (!project.assetPipeline) {
    throw new Error('Project has no asset pipeline data')
  }

  project.assetPipeline.characters = project.assetPipeline.characters.filter(
    (c) => c.id !== characterId
  )
  
  // Also remove associated poses
  project.assetPipeline.poses = project.assetPipeline.poses.filter(
    (p) => p.characterId !== characterId
  )

  await saveProject(project)
}

/**
 * Set character reference image - copies image to project, creates thumbnail
 */
export async function setCharacterReference(
  projectId: string,
  characterId: string,
  sourcePath: string
): Promise<Character> {
  const project = await loadProject(projectId)
  
  if (!project.assetPipeline) {
    throw new Error('Project has no asset pipeline data')
  }

  const character = project.assetPipeline.characters.find((c) => c.id === characterId)
  if (!character) {
    throw new Error(`Character not found: ${characterId}`)
  }

  const assetsDir = getCharacterAssetsDir(projectId)
  await mkdir(assetsDir, { recursive: true })

  const ext = extname(sourcePath)
  const refFileName = `${characterId}_ref${ext}`
  const thumbFileName = `${characterId}_thumb.png`
  
  const refPath = join(assetsDir, refFileName)
  const thumbPath = join(assetsDir, thumbFileName)

  // Copy original reference
  await copyFile(sourcePath, refPath)

  // Create 256x256 thumbnail with Sharp
  await sharp(sourcePath)
    .resize(256, 256, { fit: 'cover', position: 'center' })
    .png()
    .toFile(thumbPath)

  // Update character with paths
  character.referenceImage = refPath
  character.thumbnail = thumbPath
  character.updatedAt = new Date().toISOString()

  await saveProject(project)
  return character
}

/**
 * Get a character by ID
 */
export async function getCharacter(
  projectId: string,
  characterId: string
): Promise<Character> {
  const project = await loadProject(projectId)
  
  if (!project.assetPipeline) {
    throw new Error('Project has no asset pipeline data')
  }

  const character = project.assetPipeline.characters.find((c) => c.id === characterId)
  if (!character) {
    throw new Error(`Character not found: ${characterId}`)
  }

  return character
}
