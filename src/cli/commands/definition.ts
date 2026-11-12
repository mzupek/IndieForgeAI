/**
 * forge definition (alias: gamedef) — read/update Game Definitions.
 * Shares gameDefinitionService + studio.json locking with the app UI.
 */

import { Command } from 'commander'
import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type {
  AssetPipelineProject,
  GameDefinition,
  MVPBoardItem,
  ThemeSlot,
  TuningProfile
} from '../../shared/types/assetPipeline'
import { getDataDir } from '../../core/storage/dataDir'
import { getAssetPipeline } from '../../core/storage/studioStorage'
import {
  applyGameDefinitionPatch,
  createGameDefinition,
  generateMarkdownFromDefinition,
  requireGameDefinitionByGameId,
  updateGameDefinition
} from '../../core/storage/gameDefinitionService'
import {
  addStringItem,
  assertCharacterInGame,
  assertClipInGame,
  assertPoseInGame,
  assertPresetExists,
  cloneGameDefinition,
  extractSection,
  formatDiffText,
  parseMvpStatus,
  parseMvpType,
  parseParamAssignment,
  parseStage,
  removeStringItem,
  requireItemById,
  updateStringItem,
  updatesFromDefinition,
  validateGameDefinition
} from '../../shared/gameDefinition/definitionPatch'
import { output, outputError } from '../utils/output'

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous || []), value]
}

function collectOpts(cmd: Command, options: Record<string, unknown>): Record<string, unknown> & {
  json?: boolean
  dataDir?: string
  game?: string
} {
  const collected: Record<string, unknown> = {}
  let current: Command | null = cmd
  while (current) {
    Object.assign(collected, current.opts())
    current = current.parent
  }
  return { ...collected, ...options }
}

function dir(opts: { dataDir?: string }): string {
  return getDataDir(opts.dataDir)
}

function withCommon(cmd: Command): Command {
  return cmd.requiredOption('--game <id>', 'Game ID').option('--json', 'Output JSON')
}

function readInputFile(path: string, label: string): string {
  try {
    return path === '-' ? readFileSync(0, 'utf-8') : readFileSync(path, 'utf-8')
  } catch (err) {
    throw new Error(`Failed to read ${label} from '${path}': ${err instanceof Error ? err.message : String(err)}`)
  }
}

function resolveLongText(direct: string | undefined, file: string | undefined, label: string): string | undefined {
  if (direct !== undefined && file !== undefined) {
    throw new Error(`Use either --${label} or --${label}-file, not both`)
  }
  if (file !== undefined) {
    return readInputFile(file, label)
  }
  if (direct === '-') {
    return readInputFile('-', label)
  }
  return direct
}

function parseIndex(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined
  const n = Number(value)
  if (!Number.isInteger(n)) {
    throw new Error(`--index must be an integer, got '${value}'`)
  }
  return n
}

async function saveMutated(
  gameId: string,
  dataDir: string,
  mutator: (def: GameDefinition, pipeline: AssetPipelineProject) => GameDefinition
): Promise<GameDefinition> {
  const pipeline = await getAssetPipeline(dataDir)
  const current = await requireGameDefinitionByGameId(gameId, dataDir)
  const next = mutator(cloneGameDefinition(current), pipeline)
  validateGameDefinition(next, pipeline)
  return updateGameDefinition(current.id, updatesFromDefinition(next), dataDir)
}

function printOrJson(data: unknown, opts: { json?: boolean }, text: () => void): void {
  if (opts.json) {
    output(data, opts)
  } else {
    text()
  }
}

function printDefinitionSummary(def: GameDefinition): void {
  console.log(`Game definition: ${def.gameId} (${def.id})`)
  console.log(`Stage: ${def.stage}`)
  console.log(`Pillars: ${def.pillars.length}`)
  console.log(`Interactions: ${def.interactions.length}`)
  console.log(`Tuning profiles: ${def.tuningProfiles.length}`)
  console.log(`Theme slots: ${def.themeSlots.length}`)
  console.log(`MVP rows: ${def.mvpBoard.length}`)
  console.log(`Cast: ${def.cast.length}`)
  console.log(
    `Linked: ${def.linkedAssets.poses.length} pose(s), ${def.linkedAssets.clips.length} clip(s), ${def.linkedAssets.presets.length} preset(s)`
  )
  if (def.puzzleCore) {
    const one = def.puzzleCore.replace(/\s+/g, ' ').trim()
    console.log(`Puzzle core: ${one.length > 120 ? `${one.slice(0, 117)}...` : one}`)
  }
}

function printSection(value: unknown, opts: { json?: boolean }): void {
  if (opts.json) {
    output(value, opts)
    return
  }
  if (typeof value === 'string') {
    console.log(value)
    return
  }
  console.log(JSON.stringify(value, null, 2))
}

export function registerDefinitionCommands(program: Command): void {
  const definitionCmd = program
    .command('definition')
    .alias('gamedef')
    .description('Read and update Game Definitions (studio.json; shared with the app UI)')

  withCommon(
    definitionCmd
      .command('show')
      .description('Print the whole definition or one section')
      .option('--section <name>', 'Section: stage, pillars, puzzle-core, story-synopsis, cast, linked-assets, theme-slots, interactions, tuning, keep-cut-invent, mvp, markdown')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await requireGameDefinitionByGameId(opts.game as string, dir(opts))
      if (options.section) {
        printSection(extractSection(def, options.section), opts)
      } else {
        printOrJson(def, opts, () => printDefinitionSummary(def))
      }
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    definitionCmd
      .command('export')
      .description('Export JSON (agents) or generated Markdown (humans)')
      .option('--format <fmt>', 'json or md', 'json')
      .option('--out <file>', 'Write to file instead of stdout')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const format = String(options.format || 'json').toLowerCase()
      if (format !== 'json' && format !== 'md') {
        throw new Error(`--format must be json or md, got '${options.format}'`)
      }
      const def = await requireGameDefinitionByGameId(opts.game as string, dir(opts))
      const body = format === 'md' ? generateMarkdownFromDefinition(def) : JSON.stringify(def, null, 2)
      if (options.out) {
        mkdirSync(dirname(options.out), { recursive: true })
        writeFileSync(options.out, body.endsWith('\n') ? body : `${body}\n`, 'utf-8')
        printOrJson({ written: options.out, format, gameId: def.gameId }, opts, () => {
          console.log(`Wrote ${format} to ${options.out}`)
        })
      } else if (opts.json && format === 'md') {
        output({ format: 'md', markdown: body, gameId: def.gameId }, opts)
      } else {
        process.stdout.write(body.endsWith('\n') ? body : `${body}\n`)
      }
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    definitionCmd
      .command('create')
      .description('Create an empty definition when the game has none')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await createGameDefinition(opts.game as string, dir(opts))
      printOrJson(def, opts, () => {
        console.log(`Created game definition ${def.id} for ${def.gameId} (stage ${def.stage})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    definitionCmd
      .command('set')
      .description('Set scalar/text fields (stage, puzzle core, story synopsis)')
      .option('--stage <stage>', 'MVP | Beta | Testing | Release')
      .option('--puzzle-core <text>', 'Puzzle core text (use - for stdin)')
      .option('--puzzle-core-file <path>', 'Read puzzle core from file or stdin (-)')
      .option('--story-synopsis <text>', 'Story synopsis (use - for stdin)')
      .option('--story-synopsis-file <path>', 'Read story synopsis from file or stdin (-)')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const puzzleCore = resolveLongText(options.puzzleCore, options.puzzleCoreFile, 'puzzle-core')
      const storySynopsis = resolveLongText(options.storySynopsis, options.storySynopsisFile, 'story-synopsis')
      if (options.stage === undefined && puzzleCore === undefined && storySynopsis === undefined) {
        throw new Error('Provide --stage, --puzzle-core/--puzzle-core-file, and/or --story-synopsis')
      }
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        if (options.stage !== undefined) current.stage = parseStage(options.stage)
        if (puzzleCore !== undefined) current.puzzleCore = puzzleCore
        if (storySynopsis !== undefined) current.storySynopsis = storySynopsis
        return current
      })
      printOrJson(def, opts, () => {
        console.log(`Updated definition for ${def.gameId}`)
        if (options.stage) console.log(`  stage: ${def.stage}`)
        if (puzzleCore !== undefined) console.log(`  puzzleCore: ${puzzleCore.length} chars`)
        if (storySynopsis !== undefined) console.log(`  storySynopsis: ${storySynopsis.length} chars`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  registerPillarCommands(definitionCmd)
  registerInteractionCommands(definitionCmd)
  registerTuningCommands(definitionCmd)
  registerThemeSlotCommands(definitionCmd)
  registerMvpCommands(definitionCmd)
  for (const list of ['keep', 'cut', 'invent'] as const) {
    registerKeepCutInventCommands(definitionCmd, list)
  }
  registerCastCommands(definitionCmd)
  registerLinkCommands(definitionCmd)
  registerApplyCommand(definitionCmd)
}

function registerPillarCommands(parent: Command): void {
  const pillar = parent.command('pillar').description('Core design pillars (string list; --index is 0-based, --id matches exact text)')

  withCommon(pillar.command('list').description('List pillars')).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await requireGameDefinitionByGameId(opts.game as string, dir(opts))
      printOrJson(
        def.pillars.map((text, index) => ({ index, text })),
        opts,
        () => {
          if (def.pillars.length === 0) {
            console.log('No pillars')
            return
          }
          def.pillars.forEach((text, index) => console.log(`[${index}] ${text}`))
        }
      )
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(pillar.command('add').description('Append a pillar').option('--text <text>', 'Pillar text')).action(
    async (options, cmd) => {
      const opts = collectOpts(cmd, options)
      try {
        if (!options.text) throw new Error('--text is required')
        const def = await saveMutated(opts.game as string, dir(opts), (current) => {
          current.pillars = addStringItem(current.pillars, options.text, 'pillars')
          return current
        })
        printOrJson(def.pillars, opts, () => console.log(`Added pillar [${def.pillars.length - 1}] ${options.text}`))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    }
  )

  withCommon(
    pillar
      .command('update')
      .description('Replace a pillar by --index or --id (exact text)')
      .option('--index <n>', '0-based index')
      .option('--id <text>', 'Exact current pillar text')
      .option('--text <text>', 'New pillar text')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      if (!options.text) throw new Error('--text is required')
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        current.pillars = updateStringItem(
          current.pillars,
          { index: parseIndex(options.index), id: options.id },
          options.text,
          'pillars'
        )
        return current
      })
      printOrJson(def.pillars, opts, () => console.log('Updated pillar'))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    pillar
      .command('remove')
      .description('Remove a pillar by --index or --id')
      .option('--index <n>', '0-based index')
      .option('--id <text>', 'Exact pillar text')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        current.pillars = removeStringItem(
          current.pillars,
          { index: parseIndex(options.index), id: options.id },
          'pillars'
        )
        return current
      })
      printOrJson(def.pillars, opts, () => console.log('Removed pillar'))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })
}

function registerInteractionCommands(parent: Command): void {
  const interaction = parent.command('interaction').description('Gameplay interaction stubs (id-based update/remove)')

  withCommon(interaction.command('list').description('List interactions')).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await requireGameDefinitionByGameId(opts.game as string, dir(opts))
      printOrJson(def.interactions, opts, () => {
        if (def.interactions.length === 0) {
          console.log('No interactions')
          return
        }
        for (const item of def.interactions) {
          console.log(`${item.id}: ${item.name}`)
          if (item.description) console.log(`  ${item.description}`)
          if (item.assetRefs.length) console.log(`  assets: ${item.assetRefs.join(', ')}`)
        }
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    interaction
      .command('add')
      .description('Add an interaction')
      .option('--name <name>', 'Name')
      .option('--description <text>', 'Description')
      .option('--asset-ref <ref>', 'Related asset tag (repeatable)', collect)
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      if (!options.name) throw new Error('--name is required')
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        current.interactions.push({
          id: randomUUID(),
          name: options.name,
          description: options.description || '',
          assetRefs: options.assetRef || []
        })
        return current
      })
      const created = def.interactions[def.interactions.length - 1]
      printOrJson(created, opts, () => console.log(`Added interaction ${created.id}: ${created.name}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    interaction
      .command('update')
      .description('Update an interaction by --id')
      .requiredOption('--id <id>', 'Interaction ID')
      .option('--name <name>', 'Name')
      .option('--description <text>', 'Description')
      .option('--asset-ref <ref>', 'Replace asset refs (repeatable)', collect)
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        const item = requireItemById(current.interactions, options.id, 'interaction')
        if (options.name !== undefined) item.name = options.name
        if (options.description !== undefined) item.description = options.description
        if (options.assetRef !== undefined) item.assetRefs = options.assetRef
        return current
      })
      const item = requireItemById(def.interactions, options.id, 'interaction')
      printOrJson(item, opts, () => console.log(`Updated interaction ${item.id}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    interaction.command('remove').description('Remove an interaction by --id').requiredOption('--id <id>', 'Interaction ID')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      await saveMutated(opts.game as string, dir(opts), (current) => {
        requireItemById(current.interactions, options.id, 'interaction')
        current.interactions = current.interactions.filter((item) => item.id !== options.id)
        return current
      })
      printOrJson({ removed: options.id }, opts, () => console.log(`Removed interaction ${options.id}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })
}

function registerTuningCommands(parent: Command): void {
  const tuning = parent.command('tuning').description('Tuning profiles (params inferred as number/bool/string)')

  withCommon(tuning.command('list').description('List tuning profiles')).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await requireGameDefinitionByGameId(opts.game as string, dir(opts))
      printOrJson(def.tuningProfiles, opts, () => {
        if (def.tuningProfiles.length === 0) {
          console.log('No tuning profiles')
          return
        }
        for (const item of def.tuningProfiles) {
          console.log(`${item.id}: ${item.name}`)
          for (const [k, v] of Object.entries(item.params)) console.log(`  ${k}=${v}`)
          if (item.notes) console.log(`  ${item.notes}`)
        }
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    tuning
      .command('add')
      .description('Add a tuning profile')
      .option('--name <name>', 'Name')
      .option('--notes <text>', 'Notes')
      .option('--param <key=value>', 'Parameter (repeatable)', collect)
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      if (!options.name) throw new Error('--name is required')
      let created: TuningProfile | undefined
      await saveMutated(opts.game as string, dir(opts), (current) => {
        const params: Record<string, string | number | boolean> = {}
        for (const raw of options.param || []) {
          const { key, value } = parseParamAssignment(raw)
          params[key] = value
        }
        created = { id: randomUUID(), name: options.name, params, notes: options.notes }
        current.tuningProfiles.push(created)
        return current
      })
      printOrJson(created, opts, () => console.log(`Added tuning profile ${created!.id}: ${created!.name}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    tuning
      .command('update')
      .description('Update a tuning profile by --id')
      .requiredOption('--id <id>', 'Tuning profile ID')
      .option('--name <name>', 'Name')
      .option('--notes <text>', 'Notes')
      .option('--param <key=value>', 'Set/overwrite parameter (repeatable)', collect)
      .option('--unset-param <key>', 'Remove a parameter (repeatable)', collect)
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        const item = requireItemById(current.tuningProfiles, options.id, 'tuning profile')
        if (options.name !== undefined) item.name = options.name
        if (options.notes !== undefined) item.notes = options.notes
        for (const raw of options.param || []) {
          const { key, value } = parseParamAssignment(raw)
          item.params[key] = value
        }
        for (const key of options.unsetParam || []) {
          delete item.params[key]
        }
        return current
      })
      const item = requireItemById(def.tuningProfiles, options.id, 'tuning profile')
      printOrJson(item, opts, () => console.log(`Updated tuning profile ${item.id}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    tuning.command('remove').description('Remove a tuning profile by --id').requiredOption('--id <id>', 'Tuning profile ID')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      await saveMutated(opts.game as string, dir(opts), (current) => {
        requireItemById(current.tuningProfiles, options.id, 'tuning profile')
        current.tuningProfiles = current.tuningProfiles.filter((item) => item.id !== options.id)
        return current
      })
      printOrJson({ removed: options.id }, opts, () => console.log(`Removed tuning profile ${options.id}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })
}

function registerThemeSlotCommands(parent: Command): void {
  const theme = parent.command('theme-slot').description('Theme/UI slots')

  withCommon(theme.command('list').description('List theme slots')).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await requireGameDefinitionByGameId(opts.game as string, dir(opts))
      printOrJson(def.themeSlots, opts, () => {
        if (def.themeSlots.length === 0) {
          console.log('No theme slots')
          return
        }
        for (const item of def.themeSlots) {
          console.log(`${item.id}: ${item.name}`)
          if (item.description) console.log(`  ${item.description}`)
          if (item.reference) console.log(`  ref: ${item.reference}`)
        }
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    theme
      .command('add')
      .description('Add a theme slot')
      .option('--name <name>', 'Name')
      .option('--description <text>', 'Description')
      .option('--reference <text>', 'Reference (asset, scene, or path)')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      if (!options.name) throw new Error('--name is required')
      let created: ThemeSlot | undefined
      await saveMutated(opts.game as string, dir(opts), (current) => {
        created = {
          id: randomUUID(),
          name: options.name,
          description: options.description,
          reference: options.reference
        }
        current.themeSlots.push(created)
        return current
      })
      printOrJson(created, opts, () => console.log(`Added theme slot ${created!.id}: ${created!.name}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    theme
      .command('update')
      .description('Update a theme slot by --id')
      .requiredOption('--id <id>', 'Theme slot ID')
      .option('--name <name>', 'Name')
      .option('--description <text>', 'Description')
      .option('--reference <text>', 'Reference')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        const item = requireItemById(current.themeSlots, options.id, 'theme slot')
        if (options.name !== undefined) item.name = options.name
        if (options.description !== undefined) item.description = options.description
        if (options.reference !== undefined) item.reference = options.reference
        return current
      })
      const item = requireItemById(def.themeSlots, options.id, 'theme slot')
      printOrJson(item, opts, () => console.log(`Updated theme slot ${item.id}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    theme.command('remove').description('Remove a theme slot by --id').requiredOption('--id <id>', 'Theme slot ID')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      await saveMutated(opts.game as string, dir(opts), (current) => {
        requireItemById(current.themeSlots, options.id, 'theme slot')
        current.themeSlots = current.themeSlots.filter((item) => item.id !== options.id)
        return current
      })
      printOrJson({ removed: options.id }, opts, () => console.log(`Removed theme slot ${options.id}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })
}

function registerMvpCommands(parent: Command): void {
  const mvp = parent.command('mvp').description('MVP board rows')

  withCommon(mvp.command('list').description('List MVP board rows')).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await requireGameDefinitionByGameId(opts.game as string, dir(opts))
      printOrJson(def.mvpBoard, opts, () => {
        if (def.mvpBoard.length === 0) {
          console.log('No MVP rows')
          return
        }
        for (const item of def.mvpBoard) {
          console.log(`${item.id}: [${item.status}] ${item.type} — ${item.item}`)
          if (item.notes) console.log(`  ${item.notes}`)
        }
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    mvp
      .command('add')
      .description('Add an MVP row')
      .option('--item <text>', 'Item name')
      .option('--type <type>', 'asset | system | content | tuning')
      .option('--status <status>', 'needed | partial | done | cut', 'needed')
      .option('--notes <text>', 'Notes')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      if (!options.item) throw new Error('--item is required')
      if (!options.type) throw new Error('--type is required (asset|system|content|tuning)')
      let created: MVPBoardItem | undefined
      await saveMutated(opts.game as string, dir(opts), (current) => {
        created = {
          id: randomUUID(),
          item: options.item,
          type: parseMvpType(options.type),
          status: parseMvpStatus(options.status || 'needed'),
          notes: options.notes
        }
        current.mvpBoard.push(created)
        return current
      })
      printOrJson(created, opts, () => console.log(`Added MVP row ${created!.id}: ${created!.item}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    mvp
      .command('update')
      .description('Update an MVP row by --id')
      .requiredOption('--id <id>', 'MVP row ID')
      .option('--item <text>', 'Item name')
      .option('--type <type>', 'asset | system | content | tuning')
      .option('--status <status>', 'needed | partial | done | cut')
      .option('--notes <text>', 'Notes')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        const item = requireItemById(current.mvpBoard, options.id, 'mvp row')
        if (options.item !== undefined) item.item = options.item
        if (options.type !== undefined) item.type = parseMvpType(options.type)
        if (options.status !== undefined) item.status = parseMvpStatus(options.status)
        if (options.notes !== undefined) item.notes = options.notes
        return current
      })
      const item = requireItemById(def.mvpBoard, options.id, 'mvp row')
      printOrJson(item, opts, () => console.log(`Updated MVP row ${item.id}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    mvp.command('remove').description('Remove an MVP row by --id').requiredOption('--id <id>', 'MVP row ID')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      await saveMutated(opts.game as string, dir(opts), (current) => {
        requireItemById(current.mvpBoard, options.id, 'mvp row')
        current.mvpBoard = current.mvpBoard.filter((item) => item.id !== options.id)
        return current
      })
      printOrJson({ removed: options.id }, opts, () => console.log(`Removed MVP row ${options.id}`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })
}

function registerKeepCutInventCommands(parent: Command, list: 'keep' | 'cut' | 'invent'): void {
  const cmd = parent.command(list).description(`Keep/cut/invent: ${list} list`)

  withCommon(cmd.command('list').description(`List ${list} items`)).action(async (options, cmdObj) => {
    const opts = collectOpts(cmdObj, options)
    try {
      const def = await requireGameDefinitionByGameId(opts.game as string, dir(opts))
      const items = def.keepCutInvent[list]
      printOrJson(
        items.map((text, index) => ({ index, text })),
        opts,
        () => {
          if (items.length === 0) {
            console.log(`No ${list} items`)
            return
          }
          items.forEach((text, index) => console.log(`[${index}] ${text}`))
        }
      )
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(cmd.command('add').description(`Append a ${list} item`).option('--text <text>', 'Item text')).action(
    async (options, cmdObj) => {
      const opts = collectOpts(cmdObj, options)
      try {
        if (!options.text) throw new Error('--text is required')
        const def = await saveMutated(opts.game as string, dir(opts), (current) => {
          current.keepCutInvent[list] = addStringItem(current.keepCutInvent[list], options.text, list)
          return current
        })
        printOrJson(def.keepCutInvent[list], opts, () =>
          console.log(`Added ${list} [${def.keepCutInvent[list].length - 1}] ${options.text}`)
        )
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    }
  )

  withCommon(
    cmd
      .command('remove')
      .description(`Remove a ${list} item by --index or --id`)
      .option('--index <n>', '0-based index')
      .option('--id <text>', 'Exact item text')
  ).action(async (options, cmdObj) => {
    const opts = collectOpts(cmdObj, options)
    try {
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        current.keepCutInvent[list] = removeStringItem(
          current.keepCutInvent[list],
          { index: parseIndex(options.index), id: options.id },
          list
        )
        return current
      })
      printOrJson(def.keepCutInvent[list], opts, () => console.log(`Removed ${list} item`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })
}

function registerCastCommands(parent: Command): void {
  const cast = parent.command('cast').description('Linked cast (character IDs in this game)')

  withCommon(cast.command('list').description('List cast character IDs')).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await requireGameDefinitionByGameId(opts.game as string, dir(opts))
      printOrJson(def.cast, opts, () => {
        if (def.cast.length === 0) {
          console.log('No cast')
          return
        }
        def.cast.forEach((id) => console.log(id))
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    cast.command('add').description('Add a character to the cast').option('--character <id>', 'Character ID')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      if (!options.character) throw new Error('--character is required')
      const def = await saveMutated(opts.game as string, dir(opts), (current, pipeline) => {
        assertCharacterInGame(pipeline, current.gameId, options.character)
        current.cast = addStringItem(current.cast, options.character, 'cast')
        return current
      })
      printOrJson(def.cast, opts, () => console.log(`Added ${options.character} to cast`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    cast.command('remove').description('Remove a character from the cast').option('--character <id>', 'Character ID')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      if (!options.character) throw new Error('--character is required')
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        current.cast = removeStringItem(current.cast, { id: options.character }, 'cast')
        return current
      })
      printOrJson(def.cast, opts, () => console.log(`Removed ${options.character} from cast`))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })
}

function registerLinkCommands(parent: Command): void {
  const link = parent.command('link').description('Linked assets: poses, clips, presets (must exist in this game)')

  withCommon(link.command('list').description('List linked pose/clip/preset IDs')).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const def = await requireGameDefinitionByGameId(opts.game as string, dir(opts))
      printOrJson(def.linkedAssets, opts, () => {
        console.log(`Poses: ${def.linkedAssets.poses.join(', ') || '(none)'}`)
        console.log(`Clips: ${def.linkedAssets.clips.join(', ') || '(none)'}`)
        console.log(`Presets: ${def.linkedAssets.presets.join(', ') || '(none)'}`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    link
      .command('add')
      .description('Link pose/clip/preset IDs')
      .option('--pose <id>', 'Pose ID (repeatable)', collect)
      .option('--clip <id>', 'Clip ID (repeatable)', collect)
      .option('--preset <id>', 'Preset ID (repeatable)', collect)
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const poses: string[] = options.pose || []
      const clips: string[] = options.clip || []
      const presets: string[] = options.preset || []
      if (poses.length + clips.length + presets.length === 0) {
        throw new Error('Provide --pose, --clip, and/or --preset')
      }
      const def = await saveMutated(opts.game as string, dir(opts), (current, pipeline) => {
        for (const id of poses) {
          assertPoseInGame(pipeline, current.gameId, id)
          current.linkedAssets.poses = addStringItem(current.linkedAssets.poses, id, 'linkedAssets.poses')
        }
        for (const id of clips) {
          assertClipInGame(pipeline, current.gameId, id)
          current.linkedAssets.clips = addStringItem(current.linkedAssets.clips, id, 'linkedAssets.clips')
        }
        for (const id of presets) {
          assertPresetExists(pipeline, id)
          current.linkedAssets.presets = addStringItem(current.linkedAssets.presets, id, 'linkedAssets.presets')
        }
        return current
      })
      printOrJson(def.linkedAssets, opts, () => console.log('Linked assets updated'))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  withCommon(
    link
      .command('remove')
      .description('Unlink pose/clip/preset IDs')
      .option('--pose <id>', 'Pose ID (repeatable)', collect)
      .option('--clip <id>', 'Clip ID (repeatable)', collect)
      .option('--preset <id>', 'Preset ID (repeatable)', collect)
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const poses: string[] = options.pose || []
      const clips: string[] = options.clip || []
      const presets: string[] = options.preset || []
      if (poses.length + clips.length + presets.length === 0) {
        throw new Error('Provide --pose, --clip, and/or --preset')
      }
      const def = await saveMutated(opts.game as string, dir(opts), (current) => {
        for (const id of poses) {
          current.linkedAssets.poses = removeStringItem(current.linkedAssets.poses, { id }, 'linkedAssets.poses')
        }
        for (const id of clips) {
          current.linkedAssets.clips = removeStringItem(current.linkedAssets.clips, { id }, 'linkedAssets.clips')
        }
        for (const id of presets) {
          current.linkedAssets.presets = removeStringItem(current.linkedAssets.presets, { id }, 'linkedAssets.presets')
        }
        return current
      })
      printOrJson(def.linkedAssets, opts, () => console.log('Linked assets updated'))
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })
}

function registerApplyCommand(parent: Command): void {
  withCommon(
    parent
      .command('apply')
      .description('Apply a JSON merge patch (arrays matched by id). --dry-run writes nothing.')
      .requiredOption('--file <path>', 'Patch JSON file (use - for stdin)')
      .option('--dry-run', 'Compute next definition + diff without writing')
  ).action(async (options, cmd) => {
    const opts = collectOpts(cmd, options)
    try {
      const raw = readInputFile(options.file, 'patch')
      let patch: unknown
      try {
        patch = JSON.parse(raw)
      } catch (err) {
        throw new Error(`Invalid patch JSON: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
        throw new Error('Patch must be a JSON object')
      }
      const result = await applyGameDefinitionPatch(opts.game as string, patch as Record<string, unknown>, {
        dryRun: Boolean(options.dryRun),
        dataDirOverride: dir(opts)
      })
      const payload = {
        dryRun: Boolean(options.dryRun),
        written: result.written,
        diff: result.diff,
        definition: result.next
      }
      printOrJson(payload, opts, () => {
        console.log(options.dryRun ? 'Dry run (not written)' : result.written ? 'Applied patch' : 'No changes')
        console.log(formatDiffText(result.diff))
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })
}
