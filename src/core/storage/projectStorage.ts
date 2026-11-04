/**
 * Shared project storage logic for both Electron app and CLI
 */

import { mkdir, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import type { IndieForgeProject } from '@shared/types/project'
import { getProjectFilePath, getProjectsDir, getProjectDir } from './dataDir'
import { withLock, atomicWriteFile } from './fileLock'
import { migrateProject } from '../../main/storage/pipelineMigration'

/**
 * Load a project by ID
 */
export async function loadProject(
  projectId: string,
  dataDirOverride?: string
): Promise<IndieForgeProject> {
  const filePath = getProjectFilePath(projectId, dataDirOverride)
  const lockPath = `${filePath}.lock`
  
  return withLock(lockPath, async () => {
    const data = await readFile(filePath, 'utf-8')
    const project = JSON.parse(data) as IndieForgeProject
    
    // Apply migrations
    return migrateProject(project)
  })
}

/**
 * Save a project
 */
export async function saveProject(
  project: IndieForgeProject,
  dataDirOverride?: string
): Promise<void> {
  const filePath = getProjectFilePath(project.id, dataDirOverride)
  const lockPath = `${filePath}.lock`
  
  await withLock(lockPath, async () => {
    // Ensure directory exists
    const projectDir = getProjectDir(project.id, dataDirOverride)
    await mkdir(projectDir, { recursive: true })
    
    // Atomic write
    const data = JSON.stringify(project, null, 2)
    await atomicWriteFile(filePath, data)
  })
}

/**
 * List all projects
 */
export async function listProjects(dataDirOverride?: string): Promise<IndieForgeProject[]> {
  const projectsDir = getProjectsDir(dataDirOverride)
  
  try {
    await mkdir(projectsDir, { recursive: true })
    const entries = await readdir(projectsDir, { withFileTypes: true })
    
    const projects: IndieForgeProject[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const project = await loadProject(entry.name, dataDirOverride)
          projects.push(project)
        } catch (err) {
          console.error(`Failed to load project ${entry.name}:`, err)
        }
      }
    }
    
    return projects
  } catch (err) {
    return []
  }
}

/**
 * Get file path for character reference image
 */
export function getCharacterReferencePath(
  projectId: string,
  characterId: string,
  ext: string,
  dataDirOverride?: string
): string {
  return join(getProjectDir(projectId, dataDirOverride), 'characters', `${characterId}_ref${ext}`)
}

/**
 * Get file path for character thumbnail
 */
export function getCharacterThumbnailPath(
  projectId: string,
  characterId: string,
  dataDirOverride?: string
): string {
  return join(getProjectDir(projectId, dataDirOverride), 'characters', `${characterId}_thumb.png`)
}

/**
 * Get file path for pose file
 */
export function getPosePath(
  projectId: string,
  poseId: string,
  ext: string,
  dataDirOverride?: string
): string {
  return join(getProjectDir(projectId, dataDirOverride), 'poses', `${poseId}_pose${ext}`)
}

/**
 * Get file path for pose thumbnail
 */
export function getPoseThumbnailPath(
  projectId: string,
  poseId: string,
  dataDirOverride?: string
): string {
  return join(getProjectDir(projectId, dataDirOverride), 'poses', `${poseId}_thumb.png`)
}
