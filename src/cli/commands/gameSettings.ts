/**
 * forge game slot|category and forge character slots — 1b.
 * Shares gameSettingsService with the app UI.
 */

import { Command } from 'commander'
import {
  addCharacterPoseSlot,
  addGameAssetCategory,
  addGamePoseSlot,
  listCharacterPoseSlots,
  listGameAssetCategories,
  listGamePoseSlots,
  removeCharacterPoseSlot,
  removeGameAssetCategory,
  removeGamePoseSlot,
  setCharacterCorePosesRequired
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
  })
}

export function registerGameSettingsCommands(gamesCmd: Command, characterCmd: Command, program: Command): void {
  const settingsCmd = gamesCmd.command('settings').description('Show per-game settings (pose slots, asset categories)')
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
}
