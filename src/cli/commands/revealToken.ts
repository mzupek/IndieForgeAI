/**
 * forge reveal-token — story facts granted through play.
 */

import { Command } from 'commander'
import {
  createRevealToken,
  listRevealTokens,
  removeRevealToken,
  showRevealToken,
  updateRevealToken,
  type RevealTokenInput
} from '@core/storage/revealTokenService'
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

function inputFromOptions(options: Record<string, unknown>): RevealTokenInput {
  const input: RevealTokenInput = {}
  if (options.title !== undefined) input.title = String(options.title)
  if (options.key !== undefined) input.key = String(options.key)
  if (options.text !== undefined) input.text = String(options.text)
  if (options.media !== undefined) input.mediaAssetId = String(options.media)
  if (options.mediaKind !== undefined) input.mediaKind = String(options.mediaKind)
  if (options.unlockedBy !== undefined) {
    input.unlockedBy = parseJsonFlag(options.unlockedBy, '--unlocked-by') as RevealTokenInput['unlockedBy']
  }
  if (options.order !== undefined) input.order = Number(options.order)
  if (options.chapter !== undefined) input.chapter = String(options.chapter)
  if (options.canon !== undefined) input.canonStatus = String(options.canon)
  return input
}

function addWriteFlags(cmd: Command, requiredTitle: boolean): Command {
  if (requiredTitle) cmd.requiredOption('--title <title>', 'Title')
  else cmd.option('--title <title>', 'Title')
  return cmd
    .option('--key <key>', 'Slug (required on create; auto flag revealed_<key>)')
    .option('--text <text>', 'Body text')
    .option('--media <id>', 'Image or clip asset id')
    .option('--media-kind <kind>', 'image | clip')
    .option('--unlocked-by <json>', 'Condition JSON')
    .option('--order <n>', 'Sort order')
    .option('--chapter <text>', 'Chapter / grouping')
    .option('--canon <status>', 'draft | approved')
    .option('--dry-run', 'Validate without writing')
}

export function registerRevealTokenCommands(program: Command): void {
  const cmd = program.command('reveal-token').alias('token').description('Manage reveal tokens (per-game label)')

  cmd
    .command('list')
    .description('List reveal tokens in a game')
    .requiredOption('--game <id>', 'Game ID')
    .option('--canon <status>', 'Filter draft | approved')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const tokens = await listRevealTokens(opts.game!, dir(opts), opts.canon || options.canon)
        printOrJson({ tokens }, opts, () => {
          console.log('\nReveal tokens:')
          if (tokens.length === 0) console.log('  (none)')
          for (const rec of tokens) {
            console.log(
              `  ${rec.id}${rec.key ? ` @${rec.key}` : ''}  ${rec.title}  order=${rec.order}  ${rec.canonStatus || 'draft'}`
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
        const record = await showRevealToken(opts.game!, String(id), dir(opts))
        printOrJson({ record }, opts, () => console.log(JSON.stringify(record, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  addWriteFlags(
    cmd.command('create').description('Create a reveal token').requiredOption('--game <id>', 'Game ID'),
    true
  ).action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const { record } = await createRevealToken(opts.game!, inputFromOptions(options), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would create' : 'Created'} reveal token: ${record.title} (${record.id})`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  addWriteFlags(
    cmd
      .command('update')
      .description('Update a reveal token')
      .argument('<id>', 'uuid or @key')
      .requiredOption('--game <id>', 'Game ID'),
    false
  ).action(async (id, options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await updateRevealToken(opts.game!, String(id), inputFromOptions(options), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would update' : 'Updated'} reveal token: ${record.title} (${record.id})`)
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
        const result = await removeRevealToken(opts.game!, String(id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} reveal token: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
