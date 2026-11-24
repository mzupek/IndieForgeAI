/**
 * forge flag — Step 3 story flags.
 */

import { Command } from 'commander'
import {
  createFlag,
  listFlags,
  removeFlag,
  showFlag,
  updateFlag,
  type FlagInput
} from '@core/storage/flagService'
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

function inputFromOptions(options: Record<string, unknown>): FlagInput {
  const input: FlagInput = {}
  if (options.name !== undefined) input.name = String(options.name)
  if (options.key !== undefined) input.key = String(options.key)
  if (options.type !== undefined) input.type = String(options.type)
  if (options.default !== undefined) input.default = options.default as string
  if (options.scope !== undefined) input.scope = String(options.scope)
  if (options.description !== undefined) input.description = String(options.description)
  return input
}

function addWriteFlags(cmd: Command, requiredName: boolean): Command {
  if (requiredName) cmd.requiredOption('--name <name>', 'Name')
  else cmd.option('--name <name>', 'Name')
  return cmd
    .option('--key <key>', 'Optional slug unique per game')
    .option('--type <type>', 'bool | int (default bool on create)')
    .option('--default <value>', 'Default value (bool: true/false; int: integer). Default false/0')
    .option('--scope <scope>', 'game | world (default game)')
    .option('--description <text>', 'Description')
    .option('--dry-run', 'Validate without writing')
}

export function registerFlagCommands(program: Command): void {
  const cmd = program.command('flag').description('Manage story flags (Step 3)')

  cmd
    .command('list')
    .description('List flags in a game')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const flags = await listFlags(opts.game!, dir(opts))
        printOrJson({ flags }, opts, () => {
          console.log('\nFlags:')
          if (flags.length === 0) console.log('  (none)')
          for (const f of flags) {
            console.log(
              `  ${f.id}${f.key ? ` @${f.key}` : ''}  ${f.name}  ${f.type} default=${String(f.default)}  ${f.scope}`
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
    .description('Show one flag (uuid or @key)')
    .argument('<id>', 'Flag uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const record = await showFlag(opts.game!, String(id), dir(opts))
        printOrJson({ record }, opts, () => console.log(JSON.stringify(record, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  addWriteFlags(
    cmd.command('create').description('Create a flag').requiredOption('--game <id>', 'Game ID'),
    true
  ).action(async (options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await createFlag(opts.game!, inputFromOptions(options), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would create' : 'Created'} flag: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  addWriteFlags(
    cmd
      .command('update')
      .description('Update a flag (uuid or @key)')
      .argument('<id>', 'Flag uuid or @key')
      .requiredOption('--game <id>', 'Game ID'),
    false
  ).action(async (id, options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await updateFlag(opts.game!, String(id), inputFromOptions(options), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would update' : 'Updated'} flag: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  cmd
    .command('remove')
    .description('Remove a flag (uuid or @key)')
    .argument('<id>', 'Flag uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const result = await removeFlag(opts.game!, String(id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} flag: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
