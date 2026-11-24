/**
 * forge story-circle — Harmon 8-step story circles.
 */

import { Command } from 'commander'
import {
  createStoryCircle,
  listStoryCircles,
  removeStoryCircle,
  showStoryCircle,
  updateStoryCircle,
  type StoryCircleInput
} from '@core/storage/storyCircleService'
import { output, outputError } from '../utils/output'

interface CommonOpts {
  dataDir?: string
  json?: boolean
  game?: string
  dryRun?: boolean
  canon?: string
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

function parseJsonFlag(raw: unknown, flag: string): unknown {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`${flag} must be JSON`)
  }
}

function inputFromOptions(options: Record<string, unknown>): StoryCircleInput {
  const input: StoryCircleInput = {}
  if (options.name !== undefined) input.name = String(options.name)
  if (options.key !== undefined) input.key = String(options.key)
  if (options.scope !== undefined) input.scope = String(options.scope)
  if (options.ref !== undefined) input.refId = String(options.ref)
  if (options.surfaceGoal !== undefined) input.surfaceGoal = String(options.surfaceGoal)
  if (options.hiddenGoal !== undefined) input.hiddenGoal = String(options.hiddenGoal)
  if (options.steps !== undefined) {
    input.steps = parseJsonFlag(options.steps, '--steps') as StoryCircleInput['steps']
  }
  if (options.notes !== undefined) input.notes = String(options.notes)
  if (options.canon !== undefined) input.canonStatus = String(options.canon)
  return input
}

function addWriteFlags(cmd: Command, requiredName: boolean): Command {
  if (requiredName) cmd.requiredOption('--name <name>', 'Name')
  else cmd.option('--name <name>', 'Name')
  return cmd
    .option('--key <key>', 'Optional slug unique per game')
    .option('--scope <scope>', 'game | world | stage (default game on create)')
    .option('--ref <id>', 'world/stage uuid or @key')
    .option('--surface-goal <text>', 'Surface goal')
    .option('--hidden-goal <text>', 'Hidden goal')
    .option('--steps <json>', 'JSON array of 8 steps')
    .option('--notes <text>', 'Notes')
    .option('--canon <status>', 'draft | approved')
    .option('--dry-run', 'Validate without writing')
}

export function registerStoryCircleCommands(program: Command): void {
  const cmd = program.command('story-circle').alias('circle').description('Manage story circles (Harmon 8-step)')

  cmd
    .command('list')
    .description('List story circles in a game')
    .requiredOption('--game <id>', 'Game ID')
    .option('--canon <status>', 'Filter draft | approved')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const circles = await listStoryCircles(opts.game!, dir(opts), opts.canon || options.canon)
        printOrJson({ circles }, opts, () => {
          console.log('\nStory circles:')
          if (circles.length === 0) console.log('  (none)')
          for (const rec of circles) {
            console.log(
              `  ${rec.id}${rec.key ? ` @${rec.key}` : ''}  ${rec.name}  ${rec.scope}${rec.refId ? ` ${rec.refId}` : ''}  ${rec.canonStatus || 'draft'}`
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
    .argument('<id>', 'uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const record = await showStoryCircle(opts.game!, String(id), dir(opts))
        printOrJson({ record }, opts, () => console.log(JSON.stringify(record, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  addWriteFlags(cmd.command('create').description('Create a story circle').requiredOption('--game <id>', 'Game ID'), true).action(
    async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const { record } = await createStoryCircle(opts.game!, inputFromOptions(options), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would create' : 'Created'} story circle: ${record.name} (${record.id})`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    }
  )

  addWriteFlags(
    cmd
      .command('update')
      .description('Update a story circle')
      .argument('<id>', 'uuid or @key')
      .requiredOption('--game <id>', 'Game ID'),
    false
  ).action(async (id, options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await updateStoryCircle(opts.game!, String(id), inputFromOptions(options), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would update' : 'Updated'} story circle: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  cmd
    .command('remove')
    .argument('<id>', 'uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const result = await removeStoryCircle(opts.game!, String(id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} story circle: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
