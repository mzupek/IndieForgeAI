import { randomUUID } from 'crypto'
import type { Game } from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from '@core/storage/studioStorage'
import { emptyGameSettings } from '@shared/studio/schema'
import { applyStoryTemplateToGame, getStoryTemplate, listStoryTemplates } from '@shared/story/templates'
import { nowIso } from '@shared/worldContent/keys'
import { output, outputError } from '../utils/output'

interface Options {
  dataDir?: string
  json?: boolean
  name?: string
  engine?: string
  key?: string
  exportRoot?: string
  template?: string
}

export async function list(options: Options): Promise<void> {
  try {
    const pipeline = await getAssetPipeline(options.dataDir)
    
    if (options.json) {
      output(pipeline.games, options)
    } else {
      if (pipeline.games.length === 0) {
        console.log('No games found')
      } else {
        console.log(`\nGames (${pipeline.games.length}):\n`)
        for (const game of pipeline.games) {
          console.log(`  ${game.id}`)
          console.log(`    Name: ${game.name}`)
          console.log(`    Engine: ${game.engine}`)
          console.log(`    Export Root: ${game.exportRoot}`)
          console.log()
        }
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function create(options: Options): Promise<void> {
  try {
    const name = String(options.name || '').trim()
    if (!name) throw new Error('--name is required')
    const engineRaw = String(options.engine || 'unity').trim().toLowerCase()
    if (engineRaw !== 'unity' && engineRaw !== 'godot') {
      throw new Error("--engine must be 'unity' or 'godot'")
    }
    const pipeline = await getAssetPipeline(options.dataDir)
    const now = nowIso()
    const game: Game = {
      id: randomUUID(),
      name,
      engine: engineRaw,
      exportRoot: String(options.exportRoot || `./exports/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
      settings: emptyGameSettings(),
      createdAt: now,
      updatedAt: now
    }
    if (options.key) game.key = String(options.key).trim()
    if (game.key && pipeline.games.some((g) => g.key === game.key)) {
      throw new Error(`Game key '${game.key}' is already used`)
    }
    pipeline.games.push(game)
    let templateKey: string | undefined
    if (options.template) {
      const template = getStoryTemplate(String(options.template), undefined)
      templateKey = template.key
      const applied = applyStoryTemplateToGame(pipeline, game, template)
      if (applied.issues.some((i) => i.level === 'error')) {
        throw new Error(applied.issues.filter((i) => i.level === 'error').map((i) => i.message).join('; '))
      }
    }
    await updateAssetPipeline(pipeline, options.dataDir)
    if (options.json) {
      output({ record: game, template: templateKey }, options)
    } else {
      console.log(`\nCreated game: ${game.name} (${game.id})${templateKey ? `  template=${templateKey}` : ''}`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function listTemplates(options: Options): Promise<void> {
  try {
    const templates = listStoryTemplates()
    if (options.json) output({ templates }, options)
    else {
      console.log('\nStory templates:\n')
      for (const t of templates) {
        console.log(`  ${t.key}  ${t.name}${t.builtin ? '  (built-in)' : ''}`)
        console.log(`    reveal token label: ${t.revealTokenLabel}`)
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}
