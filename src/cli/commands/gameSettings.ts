/**
 * forge game slot|category and forge character slots — 1b.
 * Shares gameSettingsService with the app UI.
 */

import { Command } from 'commander'
import { readFileSync } from 'fs'
import {
  addCharacterPoseSlot,
  addEncounterModule,
  addEncounterType,
  addGameAssetCategory,
  addGamePoseSlot,
  listCharacterPoseSlots,
  listEncounterModules,
  listEncounterTypes,
  listGameAssetCategories,
  listGamePoseSlots,
  removeCharacterPoseSlot,
  removeEncounterModule,
  removeEncounterType,
  removeGameAssetCategory,
  removeGamePoseSlot,
  setCharacterCorePosesRequired,
  updateEncounterModule,
  updateGameSettingsFromFile
} from '@core/storage/gameSettingsService'
import { getAssetPipeline } from '@core/storage/studioStorage'
import { requireGame } from '@core/storage/gameSettingsService'
import { emptyGameSettings } from '@shared/studio/schema'
import { output, outputError } from '../utils/output'

interface CommonOpts {
  dataDir?: string
  json?: boolean
  game?: string
  dryRun?: boolean
  key?: string
  label?: string
  group?: string
  required?: boolean
  base?: string
  coreRequired?: boolean
}

function collectOpts(cmd: Command, options: Record<string, unknown>): CommonOpts {
  const collected: Record<string, unknown> = {}
  let current: Command | null = cmd
  while (current) {
    Object.assign(collected, current.opts())
    current = current.parent
  }
  return { ...collected, ...options } as CommonOpts
}

function dir(opts: CommonOpts): string | undefined {
  return opts.dataDir
}

function printOrJson(data: unknown, opts: CommonOpts, text: () => void): void {
  if (opts.json) {
    output(data, opts)
  } else {
    text()
  }
}

async function showGameSettings(opts: CommonOpts): Promise<void> {
  if (!opts.game) throw new Error('--game is required')
  const pipeline = await getAssetPipeline(dir(opts))
  const game = requireGame(pipeline, opts.game)
  const settings = game.settings || emptyGameSettings()
  printOrJson(settings, opts, () => {
    console.log(`\nGame settings: ${game.name} (${game.id})\n`)
    console.log('  Pose slots (game):')
    if (settings.poseSlots.length === 0) console.log('    (none)')
    for (const slot of settings.poseSlots) {
      console.log(`    ${slot.key}  ${slot.label}${slot.required ? '  [required]' : ''}`)
    }
    console.log('  Asset categories (game):')
    if (settings.assetCategories.length === 0) console.log('    (none)')
    for (const cat of settings.assetCategories) {
      console.log(`    ${cat.key}  ${cat.label}${cat.base ? `  (base: ${cat.base})` : ''}`)
    }
    console.log('  Encounter types:')
    if (settings.encounterTypes.length === 0) console.log('    (none)')
    for (const t of settings.encounterTypes) console.log(`    ${t}`)
    console.log('  Modules:')
    if (settings.modules.length === 0) console.log('    (none)')
    for (const m of settings.modules) {
      console.log(
        `    ${m.id}  ${m.label}  types=${m.typeIds.join(',')}  stars=${(m.starKinds || []).join(',') || '(any)'}`
      )
    }
  })
}

export function registerGameSettingsCommands(gamesCmd: Command, characterCmd: Command, program: Command): void {
  const settingsCmd = gamesCmd.command('settings').description('Show or update per-game settings')
  settingsCmd
    .command('show')
    .description('Show game.settings (read-only)')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        await showGameSettings(opts)
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  settingsCmd
    .command('update')
    .description('Merge a settings JSON file (encounterTypes, modules, poseSlots, assetCategories)')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--file <path>', 'JSON file')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const parsed = JSON.parse(readFileSync(String(options.file), 'utf-8'))
        const settings = await updateGameSettingsFromFile(opts.game!, parsed, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ settings, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would update' : 'Updated'} game settings for ${opts.game}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const slotCmd = gamesCmd.command('slot').description('Manage game-level pose slots')

  slotCmd
    .command('list')
    .description('List built-in and game pose slots')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const listed = await listGamePoseSlots(opts.game!, dir(opts))
        printOrJson(listed, opts, () => {
          console.log('\nBuilt-in pose slots:')
          for (const s of listed.core) console.log(`  ${s.key}  ${s.label}`)
          console.log('\nGame pose slots:')
          if (listed.game.length === 0) console.log('  (none)')
          for (const s of listed.game) {
            console.log(`  ${s.key}  ${s.label}${s.required ? '  [required]' : ''}`)
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  slotCmd
    .command('add')
    .description('Add a game pose slot')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--key <key>', 'Slot slug (lowercase, e.g. portrait)')
    .requiredOption('--label <label>', 'Display label')
    .option('--group <group>', 'Optional group label')
    .option('--required', 'Count toward pose completeness')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const def = await addGamePoseSlot(
          opts.game!,
          { key: opts.key!, label: opts.label!, group: opts.group, required: Boolean(opts.required) },
          { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
        )
        printOrJson({ slot: def, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would add' : 'Added'} game pose slot: ${def.key} (${def.label})`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  slotCmd
    .command('remove')
    .description('Remove a game pose slot (refused if any pose uses it)')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--key <key>', 'Slot slug to remove')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await removeGamePoseSlot(opts.game!, opts.key!, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} game pose slot: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const categoryCmd = gamesCmd.command('category').description('Manage game-level asset categories')

  categoryCmd
    .command('list')
    .description('List built-in and game asset categories')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const listed = await listGameAssetCategories(opts.game!, dir(opts))
        printOrJson(listed, opts, () => {
          console.log('\nBuilt-in asset categories:')
          for (const c of listed.core) console.log(`  ${c.key}  ${c.label}`)
          console.log('\nGame asset categories:')
          if (listed.game.length === 0) console.log('  (none)')
          for (const c of listed.game) {
            console.log(`  ${c.key}  ${c.label}${c.base ? `  (base: ${c.base})` : ''}`)
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  categoryCmd
    .command('add')
    .description('Add a game asset category')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--key <key>', 'Category slug')
    .requiredOption('--label <label>', 'Display label')
    .option('--base <base>', 'Built-in this category behaves like (e.g. background)')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const def = await addGameAssetCategory(
          opts.game!,
          { key: opts.key!, label: opts.label!, base: opts.base },
          { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
        )
        printOrJson({ category: def, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would add' : 'Added'} asset category: ${def.key} (${def.label})`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  categoryCmd
    .command('remove')
    .description('Remove a game asset category (refused if any asset uses it)')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--key <key>', 'Category slug to remove')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await removeGameAssetCategory(opts.game!, opts.key!, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} asset category: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const slotsCmd = characterCmd.command('slots').description('Manage per-character pose slots')

  slotsCmd
    .command('list')
    .description('List effective pose slots for a character')
    .argument('<character-id>', 'Character ID')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (characterId, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const listed = await listCharacterPoseSlots(characterId, opts.game!, dir(opts))
        printOrJson(listed, opts, () => {
          console.log(`\nCore poses required: ${listed.corePosesRequired ? 'yes' : 'no'}`)
          console.log('\nBuilt-in:')
          for (const s of listed.core) console.log(`  ${s.key}  ${s.label}`)
          console.log('\nGame:')
          if (listed.game.length === 0) console.log('  (none)')
          for (const s of listed.game) console.log(`  ${s.key}  ${s.label}`)
          console.log('\nCharacter:')
          if (listed.character.length === 0) console.log('  (none)')
          for (const s of listed.character) {
            console.log(`  ${s.key}  ${s.label}${s.required ? '  [required]' : ''}`)
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  slotsCmd
    .command('add')
    .description('Add a character pose slot')
    .argument('<character-id>', 'Character ID')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--key <key>', 'Slot slug (lowercase, unique vs built-in and game slots)')
    .requiredOption('--label <label>', 'Display label')
    .option('--group <group>', 'Optional group label')
    .option('--required', 'Count toward pose completeness')
    .option('--dry-run', 'Validate without writing')
    .action(async (characterId, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const def = await addCharacterPoseSlot(
          characterId,
          opts.game!,
          { key: opts.key!, label: opts.label!, group: opts.group, required: Boolean(opts.required) },
          { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
        )
        printOrJson({ slot: def, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would add' : 'Added'} character pose slot: ${def.key} (${def.label})`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  slotsCmd
    .command('core-required')
    .description('Set whether built-in five poses are required for this character')
    .argument('<character-id>', 'Character ID')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--value <bool>', 'true or false')
    .option('--dry-run', 'Validate without writing')
    .action(async (characterId, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const value = String(options.value ?? opts.coreRequired).toLowerCase()
        if (value !== 'true' && value !== 'false') {
          throw new Error('--value must be true or false')
        }
        const character = await setCharacterCorePosesRequired(characterId, opts.game!, value === 'true', {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson(
          { characterId: character.id, corePosesRequired: character.corePosesRequired, dryRun: Boolean(opts.dryRun) },
          opts,
          () => {
            console.log(
              `${opts.dryRun ? 'Would set' : 'Set'} corePosesRequired=${character.corePosesRequired} on ${character.name}`
            )
          }
        )
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  slotsCmd
    .command('remove')
    .description('Remove a character pose slot (refused if a pose uses it)')
    .argument('<character-id>', 'Character ID')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--key <key>', 'Slot slug to remove')
    .option('--dry-run', 'Validate without writing')
    .action(async (characterId, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await removeCharacterPoseSlot(characterId, opts.game!, opts.key!, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} character pose slot: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const typeCmd = gamesCmd.command('type').description('Manage game encounter types')
  typeCmd
    .command('list')
    .description('List encounter types')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const types = await listEncounterTypes(opts.game!, dir(opts))
        printOrJson({ encounterTypes: types }, opts, () => {
          console.log('\nEncounter types:')
          for (const t of types) console.log(`  ${t}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
  typeCmd
    .command('add')
    .description('Add an encounter type')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--id <id>', 'Type slug (e.g. battle)')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const typeId = await addEncounterType(opts.game!, String(options.id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ typeId, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would add' : 'Added'} encounter type: ${typeId}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
  typeCmd
    .command('remove')
    .description('Remove an encounter type (refused if an encounter uses it)')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--id <id>', 'Type slug')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await removeEncounterType(opts.game!, String(options.id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} encounter type: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const moduleCmd = gamesCmd.command('module').description('Manage game encounter modules')
  moduleCmd
    .command('list')
    .description('List encounter modules')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const modules = await listEncounterModules(opts.game!, dir(opts))
        printOrJson({ modules }, opts, () => {
          console.log('\nModules:')
          if (modules.length === 0) console.log('  (none)')
          for (const m of modules) {
            console.log(`  ${m.id}  ${m.label}  types=${m.typeIds.join(',')}`)
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
  moduleCmd
    .command('add')
    .description('Add an encounter module')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--id <id>', 'Module slug')
    .requiredOption('--label <label>', 'Display label')
    .requiredOption('--type-ids <ids>', 'Comma-separated type ids this module supports')
    .option('--star-kinds <kinds>', 'Comma-separated star kinds (optional; omit = any)')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const typeIds = String(options.typeIds)
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
        const starKinds = options.starKinds
          ? String(options.starKinds)
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : undefined
        const def = await addEncounterModule(
          opts.game!,
          { id: String(options.id), label: String(options.label), typeIds, starKinds },
          { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
        )
        printOrJson({ module: def, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would add' : 'Added'} module: ${def.id} (${def.label})`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
  moduleCmd
    .command('update')
    .description('Update an encounter module')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--id <id>', 'Module slug')
    .option('--label <label>', 'Display label')
    .option('--type-ids <ids>', 'Comma-separated type ids')
    .option('--star-kinds <kinds>', 'Comma-separated star kinds (empty string clears the list)')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const patch: { label?: string; typeIds?: string[]; starKinds?: string[] } = {}
        if (options.label !== undefined) patch.label = String(options.label)
        if (options.typeIds !== undefined) {
          patch.typeIds = String(options.typeIds)
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        }
        if (options.starKinds !== undefined) {
          patch.starKinds = String(options.starKinds)
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        }
        const def = await updateEncounterModule(opts.game!, String(options.id), patch, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ module: def, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would update' : 'Updated'} module: ${def.id}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
  moduleCmd
    .command('remove')
    .description('Remove an encounter module (refused if an encounter uses it)')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--id <id>', 'Module slug')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await removeEncounterModule(opts.game!, String(options.id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} module: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
