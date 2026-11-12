/**
 * Game Definition service - CRUD operations for Game Definitions
 */

import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import type { GameDefinition } from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from './studioStorage'
import { seedNeonRecallDefinition } from './seedGameDefinition'
import {
  applyDefinitionMergePatch,
  type DefinitionDiff,
  updatesFromDefinition,
  validateGameDefinition
} from '../../shared/gameDefinition/definitionPatch'

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
 * Load seed markdown for Neon Recall.
 * Lazy-require electron so the CLI bundle does not hard-depend on it.
 */
async function loadNeonRecallSeedMarkdown(): Promise<string | null> {
  const candidates: string[] = [
    join(__dirname, '../../seed', 'neon_recall_current_state.md'),
    join(process.cwd(), 'seed', 'neon_recall_current_state.md')
  ]
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: { getAppPath?: () => string } }
    if (electron?.app?.getAppPath) {
      candidates.unshift(join(electron.app.getAppPath(), 'seed', 'neon_recall_current_state.md'))
    }
  } catch {
    // CLI / tests: electron is external and may not load
  }
  
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
export async function requireGameDefinitionByGameId(
  gameId: string,
  dataDirOverride?: string
): Promise<GameDefinition> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  if (!pipeline.games.some((g) => g.id === gameId)) {
    throw new Error(`Game not found: ${gameId}`)
  }
  const definition = pipeline.gameDefinitions?.find((def) => def.gameId === gameId)
  if (!definition) {
    throw new Error(
      `No game definition for '${gameId}'. Create one with: forge definition create --game ${gameId}`
    )
  }
  return definition
}

export async function createGameDefinition(
  gameId: string,
  dataDirOverride?: string
): Promise<GameDefinition> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  if (!pipeline.games.some((g) => g.id === gameId)) {
    throw new Error(`Game not found: ${gameId}`)
  }
  if (pipeline.gameDefinitions?.some((def) => def.gameId === gameId)) {
    throw new Error(
      `Game '${gameId}' already has a definition. Use forge definition show --game ${gameId}`
    )
  }

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
  const updated: GameDefinition = {
    ...definition,
    ...updates,
    id: definition.id,
    gameId: definition.gameId,
    createdAt: definition.createdAt,
    updatedAt: new Date().toISOString()
  }
  validateGameDefinition(updated, pipeline)

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
 * Apply a structured JSON merge patch (id-matched arrays). Used by CLI `definition apply`.
 * `--dry-run` computes next + diff and writes nothing.
 */
export async function applyGameDefinitionPatch(
  gameId: string,
  patch: Record<string, unknown>,
  options: { dryRun?: boolean; dataDirOverride?: string } = {}
): Promise<{ current: GameDefinition; next: GameDefinition; diff: DefinitionDiff; written: boolean }> {
  const pipeline = await getAssetPipeline(options.dataDirOverride)
  const current = await requireGameDefinitionByGameId(gameId, options.dataDirOverride)
  const { next, diff } = applyDefinitionMergePatch(current, patch, pipeline)
  if (options.dryRun || diff.entries.length === 0) {
    return { current, next, diff, written: false }
  }
  const saved = await updateGameDefinition(
    current.id,
    updatesFromDefinition(next),
    options.dataDirOverride
  )
  return { current, next: saved, diff, written: true }
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
