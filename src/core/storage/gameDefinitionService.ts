/**
 * Game Definition service - CRUD operations for Game Definitions
 */

import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import type { GameDefinition, GameDefinitionStage } from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from './studioStorage'
import { seedNeonRecallDefinition } from './seedGameDefinition'

/**
 * Get all game definitions
 */
export async function listGameDefinitions(dataDirOverride?: string): Promise<GameDefinition[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.gameDefinitions || []
}

/**
 * Get game definition by ID
 */
export async function getGameDefinition(
  id: string,
  dataDirOverride?: string
): Promise<GameDefinition | null> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.gameDefinitions?.find((def) => def.id === id) || null
}

/**
 * Get game definition by game ID
 */
export async function getGameDefinitionByGameId(
  gameId: string,
  dataDirOverride?: string
): Promise<GameDefinition | null> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  return pipeline.gameDefinitions?.find((def) => def.gameId === gameId) || null
}

/**
 * Load seed markdown for Neon Recall
 */
async function loadNeonRecallSeedMarkdown(): Promise<string | null> {
  const candidates = [
    join(app.getAppPath(), 'seed', 'neon_recall_current_state.md'),
    join(__dirname, '../../seed', 'neon_recall_current_state.md'),
    join(process.cwd(), 'seed', 'neon_recall_current_state.md')
  ]
  
  for (const seedPath of candidates) {
    if (existsSync(seedPath)) {
      try {
        return await readFile(seedPath, 'utf-8')
      } catch (err) {
        console.error(`Failed to read seed file at ${seedPath}:`, err)
      }
    }
  }
  
  return null
}

/**
 * Create a new game definition
 * For game-neon-recall, seeds from the current-state markdown if available
 */
export async function createGameDefinition(
  gameId: string,
  dataDirOverride?: string
): Promise<GameDefinition> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const now = new Date().toISOString()
  let newDefinition: GameDefinition
  
  if (gameId === 'game-neon-recall') {
    const seedMarkdown = await loadNeonRecallSeedMarkdown()
    if (seedMarkdown) {
      const seeded = seedNeonRecallDefinition(gameId, seedMarkdown)
      newDefinition = {
        id: randomUUID(),
        ...seeded,
        createdAt: now,
        updatedAt: now
      }
    } else {
      newDefinition = createEmptyDefinition(gameId, now)
    }
  } else {
    newDefinition = createEmptyDefinition(gameId, now)
  }
  
  if (!pipeline.gameDefinitions) {
    pipeline.gameDefinitions = []
  }
  pipeline.gameDefinitions.push(newDefinition)
  
  await updateAssetPipeline(pipeline, dataDirOverride)
  return newDefinition
}

/**
 * Create an empty game definition
 */
function createEmptyDefinition(gameId: string, now: string): GameDefinition {
  return {
    id: randomUUID(),
    gameId,
    stage: 'MVP',
    pillars: [],
    puzzleCore: '',
    storySynopsis: '',
    cast: [],
    linkedAssets: {
      poses: [],
      clips: [],
      presets: []
    },
    themeSlots: [],
    interactions: [],
    tuningProfiles: [],
    keepCutInvent: {
      keep: [],
      cut: [],
      invent: []
    },
    mvpBoard: [],
    markdownSource: '',
    createdAt: now,
    updatedAt: now
  }
}

/**
 * Update an existing game definition
 */
export async function updateGameDefinition(
  id: string,
  updates: Partial<Omit<GameDefinition, 'id' | 'gameId' | 'createdAt'>>,
  dataDirOverride?: string
): Promise<GameDefinition> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  const index = pipeline.gameDefinitions?.findIndex((def) => def.id === id)
  if (index === undefined || index === -1) {
    throw new Error(`Game definition not found: ${id}`)
  }
  
  const definition = pipeline.gameDefinitions[index]
  const updated = {
    ...definition,
    ...updates,
    updatedAt: new Date().toISOString()
  }
  
  pipeline.gameDefinitions[index] = updated
  await updateAssetPipeline(pipeline, dataDirOverride)
  
  return updated
}

/**
 * Delete a game definition
 */
export async function deleteGameDefinition(
  id: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  
  if (!pipeline.gameDefinitions) {
    return
  }
  
  pipeline.gameDefinitions = pipeline.gameDefinitions.filter((def) => def.id !== id)
  await updateAssetPipeline(pipeline, dataDirOverride)
}

/**
 * Parse resource tags from markdown
 * Format: [[type:id|label]]
 */
export function parseResourceTags(markdown: string): Array<{
  type: 'game' | 'character' | 'pose' | 'clip' | 'preset'
  id: string
  label: string
  match: string
}> {
  const tagRegex = /\[\[(\w+):([a-zA-Z0-9-]+)\|([^\]]+)\]\]/g
  const tags: Array<{
    type: 'game' | 'character' | 'pose' | 'clip' | 'preset'
    id: string
    label: string
    match: string
  }> = []
  
  let match
  while ((match = tagRegex.exec(markdown)) !== null) {
    const [fullMatch, type, id, label] = match
    if (['game', 'character', 'pose', 'clip', 'preset'].includes(type)) {
      tags.push({
        type: type as 'game' | 'character' | 'pose' | 'clip' | 'preset',
        id,
        label,
        match: fullMatch
      })
    }
  }
  
  return tags
}

/**
 * Generate markdown from game definition
 */
export function generateMarkdownFromDefinition(definition: GameDefinition): string {
  const sections: string[] = []
  
  sections.push(`# Game Definition: ${definition.gameId}`)
  sections.push(`\n**Stage:** ${definition.stage}\n`)
  
  if (definition.pillars.length > 0) {
    sections.push('## Core Pillars\n')
    definition.pillars.forEach((pillar) => {
      sections.push(`- ${pillar}`)
    })
    sections.push('')
  }
  
  if (definition.puzzleCore) {
    sections.push('## Puzzle Core\n')
    sections.push(definition.puzzleCore)
    sections.push('')
  }
  
  if (definition.storySynopsis) {
    sections.push('## Story Synopsis\n')
    sections.push(definition.storySynopsis)
    sections.push('')
  }
  
  if (definition.cast.length > 0) {
    sections.push('## Cast\n')
    definition.cast.forEach((characterId) => {
      sections.push(`- [[character:${characterId}|Character]]`)
    })
    sections.push('')
  }
  
  if (definition.themeSlots.length > 0) {
    sections.push('## Theme & UI\n')
    definition.themeSlots.forEach((slot) => {
      sections.push(`### ${slot.name}`)
      if (slot.description) {
        sections.push(slot.description)
      }
      if (slot.reference) {
        sections.push(`Reference: ${slot.reference}`)
      }
      sections.push('')
    })
  }
  
  if (definition.interactions.length > 0) {
    sections.push('## Interactions\n')
    definition.interactions.forEach((interaction) => {
      sections.push(`### ${interaction.name}`)
      sections.push(interaction.description)
      if (interaction.assetRefs.length > 0) {
        sections.push(`Assets: ${interaction.assetRefs.join(', ')}`)
      }
      sections.push('')
    })
  }
  
  if (definition.tuningProfiles.length > 0) {
    sections.push('## Tuning Profiles\n')
    definition.tuningProfiles.forEach((profile) => {
      sections.push(`### ${profile.name}`)
      Object.entries(profile.params).forEach(([key, value]) => {
        sections.push(`- ${key}: ${value}`)
      })
      if (profile.notes) {
        sections.push(`\n${profile.notes}`)
      }
      sections.push('')
    })
  }
  
  sections.push('## Keep / Cut / Invent\n')
  if (definition.keepCutInvent.keep.length > 0) {
    sections.push('### KEEP')
    definition.keepCutInvent.keep.forEach((item) => {
      sections.push(`- ${item}`)
    })
    sections.push('')
  }
  if (definition.keepCutInvent.cut.length > 0) {
    sections.push('### CUT / defer from MVP')
    definition.keepCutInvent.cut.forEach((item) => {
      sections.push(`- ${item}`)
    })
    sections.push('')
  }
  if (definition.keepCutInvent.invent.length > 0) {
    sections.push('### INVENT only as MVP glue')
    definition.keepCutInvent.invent.forEach((item) => {
      sections.push(`- ${item}`)
    })
    sections.push('')
  }
  
  if (definition.mvpBoard.length > 0) {
    sections.push('## MVP Board\n')
    sections.push('| Item | Type | Status | Notes |')
    sections.push('|------|------|--------|-------|')
    definition.mvpBoard.forEach((item) => {
      sections.push(`| ${item.item} | ${item.type} | ${item.status} | ${item.notes || ''} |`)
    })
    sections.push('')
  }
  
  return sections.join('\n')
}
