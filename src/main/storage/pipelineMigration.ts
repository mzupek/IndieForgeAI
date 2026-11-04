import type { IndieForgeProject } from '@shared/types/project'
import { saveProject } from './projectStore'

/**
 * Auto-migrate projects to ensure asset pipeline games exist
 * Maps legacy Neon Recall and Ring'Em Up projects to games
 */
export async function ensureAssetPipelineGames(project: IndieForgeProject): Promise<IndieForgeProject> {
  // Initialize assetPipeline if missing
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

  let needsSave = false

  // Ensure Neon Recall game exists (Unity)
  if (project.name.toLowerCase().includes('neon recall') || project.id.includes('neon-recall')) {
    const neonGame = project.assetPipeline.games.find(
      (g) => g.name === 'Neon Recall' || g.id === 'game-neon-recall'
    )
    
    if (!neonGame) {
      const now = new Date().toISOString()
      project.assetPipeline.games.push({
        id: 'game-neon-recall',
        name: 'Neon Recall',
        engine: 'unity',
        exportRoot: './exports/neon-recall',
        createdAt: now,
        updatedAt: now
      })
      needsSave = true
    }
  }

  // Ensure Ring'Em Up game exists (Godot)
  if (project.name.toLowerCase().includes("ring'em up") || project.id.includes('ring-em-up')) {
    const ringGame = project.assetPipeline.games.find(
      (g) => g.name === "Ring'Em Up" || g.id === 'game-ring-em-up'
    )
    
    if (!ringGame) {
      const now = new Date().toISOString()
      project.assetPipeline.games.push({
        id: 'game-ring-em-up',
        name: "Ring'Em Up",
        engine: 'godot',
        exportRoot: './exports/ring-em-up',
        createdAt: now,
        updatedAt: now
      })
      needsSave = true
    }
  }

  if (needsSave) {
    await saveProject(project)
  }

  return project
}

/**
 * Ensure both studio games exist in any project
 * Used when opening the studio to guarantee games are available
 */
export async function ensureStudioGames(project: IndieForgeProject): Promise<IndieForgeProject> {
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

  let needsSave = false
  const now = new Date().toISOString()

  // Ensure Neon Recall exists
  const neonGame = project.assetPipeline.games.find((g) => g.id === 'game-neon-recall')
  if (!neonGame) {
    project.assetPipeline.games.push({
      id: 'game-neon-recall',
      name: 'Neon Recall',
      engine: 'unity',
      exportRoot: './exports/neon-recall',
      createdAt: now,
      updatedAt: now
    })
    needsSave = true
  }

  // Ensure Ring'Em Up exists
  const ringGame = project.assetPipeline.games.find((g) => g.id === 'game-ring-em-up')
  if (!ringGame) {
    project.assetPipeline.games.push({
      id: 'game-ring-em-up',
      name: "Ring'Em Up",
      engine: 'godot',
      exportRoot: './exports/ring-em-up',
      createdAt: now,
      updatedAt: now
    })
    needsSave = true
  }

  if (needsSave) {
    await saveProject(project)
  }

  return project
}
