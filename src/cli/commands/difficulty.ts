/**
 * forge difficulty — 2c difficulty profiles.
 */

import { Command } from 'commander'
import {
  createDifficultyProfile,
  listDifficultyProfiles,
  removeDifficultyProfile,
  showDifficultyProfile,
  updateDifficultyProfile,
  type DifficultyProfileInput
} from '@core/storage/difficultyService'
import { output, outputError } from '../utils/output'

interface CommonOpts {
  dataDir?: string
  json?: boolean
  game?: string
  dryRun?: boolean
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
  if (opts.json) output(data, opts)
  else text()
}

function numOpt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function inputFromOptions(options: Record<string, unknown>): DifficultyProfileInput {
  const input: DifficultyProfileInput = {}
  if (options.name !== undefined) input.name = String(options.name)
  if (options.key !== undefined) input.key = String(options.key)
  if (options.heroHpMultiplier !== undefined) input.heroHpMultiplier = numOpt(options.heroHpMultiplier)
  if (options.playbackSpeed !== undefined) input.playbackSpeed = numOpt(options.playbackSpeed)
  if (options.attackWeightScale !== undefined) input.attackWeightScale = numOpt(options.attackWeightScale)
  if (options.hintCharges !== undefined) input.hintCharges = numOpt(options.hintCharges)
  if (options.notes !== undefined) input.notes = String(options.notes)
  return input
}

function addWriteFlags(cmd: Command, required: boolean): Command {
  if (required) cmd.requiredOption('--name <name>', 'Name')
  else cmd.option('--name <name>', 'Name')
  return cmd
    .option('--key <key>', 'Optional slug unique per game')
    .option('--hero-hp-multiplier <n>', 'Hero HP multiplier (> 0). Default 1 on create')
    .option('--playback-speed <n>', 'Playback speed (> 0). Default 1 on create')
    .option('--attack-weight-scale <n>', 'Attack weight scale (> 0). Default 1 on create')
    .option('--hint-charges <n>', 'Hint charges (integer >= 0). Default 0 on create')
    .option('--notes <text>', 'Notes')
    .option('--dry-run', 'Validate without writing')
}

export function registerDifficultyCommands(program: Command): void {
  const cmd = program.command('difficulty').description('Manage difficulty profiles (2c)')

  cmd
    .command('list')
    .description('List difficulty profiles in a game')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const difficultyProfiles = await listDifficultyProfiles(opts.game!, dir(opts))
        printOrJson({ difficultyProfiles }, opts, () => {
          console.log('\nDifficulty profiles:')
          if (difficultyProfiles.length === 0) console.log('  (none)')
          for (const p of difficultyProfiles) {
            console.log(
              `  ${p.id}${p.key ? ` @${p.key}` : ''}  ${p.name}  hp×${p.heroHpMultiplier}  speed×${p.playbackSpeed}`
            )
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  cmd
    .command('show')
    .description('Show one difficulty profile (uuid or @key)')
    .argument('<id>', 'Profile uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const record = await showDifficultyProfile(opts.game!, String(id), dir(opts))
        printOrJson({ record }, opts, () => console.log(JSON.stringify(record, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  addWriteFlags(
    cmd.command('create').description('Create a difficulty profile').requiredOption('--game <id>', 'Game ID'),
    true
  ).action(async (options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await createDifficultyProfile(opts.game!, inputFromOptions(options), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would create' : 'Created'} difficulty: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  addWriteFlags(
    cmd
      .command('update')
      .description('Update a difficulty profile (uuid or @key)')
      .argument('<id>', 'Profile uuid or @key')
      .requiredOption('--game <id>', 'Game ID'),
    false
  ).action(async (id, options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await updateDifficultyProfile(
        opts.game!,
        String(id),
        inputFromOptions(options),
        { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
      )
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would update' : 'Updated'} difficulty: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  cmd
    .command('remove')
    .description('Remove a difficulty profile (uuid or @key)')
    .argument('<id>', 'Profile uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const result = await removeDifficultyProfile(opts.game!, String(id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} difficulty: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
