/**
 * forge trigger + forge flow simulate — Step 3.
 */

import { Command } from 'commander'
import {
  createTrigger,
  listTriggers,
  removeTrigger,
  showTrigger,
  updateTrigger,
  type TriggerInput
} from '@core/storage/triggerService'
import { getAssetPipeline } from '@core/storage/studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { requireIdOrKey } from '@shared/worldContent/validate'
import { simulateWorldFlow } from '@shared/story/simulate'
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

function parseJsonFlag(raw: unknown, flag: string): unknown {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`${flag} must be JSON`)
  }
}

function inputFromOptions(options: Record<string, unknown>): TriggerInput {
  const input: TriggerInput = {}
  if (options.name !== undefined) input.name = String(options.name)
  if (options.key !== undefined) input.key = String(options.key)
  if (options.kind !== undefined) input.kind = String(options.kind)
  if (options.source !== undefined) input.sourceRef = String(options.source)
  if (options.sourceRef !== undefined) input.sourceRef = String(options.sourceRef)
  if (options.condition !== undefined) input.condition = parseJsonFlag(options.condition, '--condition')
  if (options.once !== undefined) input.once = options.once as boolean | string
  if (options.effects !== undefined) input.effects = parseJsonFlag(options.effects, '--effects')
  if (options.notes !== undefined) input.notes = String(options.notes)
  return input
}

function addWriteFlags(cmd: Command, requiredName: boolean): Command {
  if (requiredName) {
    cmd.requiredOption('--name <name>', 'Name')
    cmd.requiredOption('--kind <kind>', 'onHotspot | onEnterRegion | onStageEnter | onEncounterWin | onEncounterLose | onDialogueEnd')
    cmd.requiredOption('--source <id>', 'Source id or @key (hotspot, region, stage, encounter, or dialogue)')
  } else {
    cmd.option('--name <name>', 'Name')
    cmd.option('--kind <kind>', 'Trigger kind')
    cmd.option('--source <id>', 'Source id or @key')
  }
  return cmd
    .option('--key <key>', 'Optional slug unique per game')
    .option('--condition <json>', 'Condition object JSON')
    .option('--effects <json>', 'Effects array JSON')
    .option('--once', 'Fire at most once')
    .option('--notes <text>', 'Notes')
    .option('--dry-run', 'Validate without writing')
}

export function registerTriggerCommands(program: Command): void {
  const cmd = program.command('trigger').description('Manage story triggers (Step 3)')

  cmd
    .command('list')
    .description('List triggers in a game')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const triggers = await listTriggers(opts.game!, dir(opts))
        printOrJson({ triggers }, opts, () => {
          console.log('\nTriggers:')
          if (triggers.length === 0) console.log('  (none)')
          for (const t of triggers) {
            console.log(
              `  ${t.id}${t.key ? ` @${t.key}` : ''}  ${t.name}  ${t.kind}  source=${t.sourceRef}${t.once ? '  once' : ''}`
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
    .description('Show one trigger (uuid or @key)')
    .argument('<id>', 'Trigger uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const record = await showTrigger(opts.game!, String(id), dir(opts))
        printOrJson({ record }, opts, () => console.log(JSON.stringify(record, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  addWriteFlags(
    cmd.command('create').description('Create a trigger').requiredOption('--game <id>', 'Game ID'),
    true
  ).action(async (options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await createTrigger(opts.game!, inputFromOptions(options), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would create' : 'Created'} trigger: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  addWriteFlags(
    cmd
      .command('update')
      .description('Update a trigger (uuid or @key)')
      .argument('<id>', 'Trigger uuid or @key')
      .requiredOption('--game <id>', 'Game ID'),
    false
  ).action(async (id, options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await updateTrigger(opts.game!, String(id), inputFromOptions(options), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would update' : 'Updated'} trigger: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  cmd
    .command('remove')
    .description('Remove a trigger (uuid or @key)')
    .argument('<id>', 'Trigger uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const result = await removeTrigger(opts.game!, String(id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} trigger: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}

export function registerFlowSimulateCommand(program: Command): void {
  const flow = program.commands.find((c) => c.name() === 'flow')
  const parent = flow || program.command('flow').description('World flow preview and simulate')
  parent
    .command('simulate')
    .description('Evaluate which stages unlock and which triggers fire for a flag assignment')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--world <id>', 'World uuid or @key')
    .option('--flags <k=v,...>', 'Flag assignments (key, name, or id)')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const pipeline = await getAssetPipeline(dir(opts))
        requireGame(pipeline, opts.game!)
        const world = requireIdOrKey(pipeline.worlds || [], String(options.world), opts.game!, 'World')
        const result = simulateWorldFlow(pipeline, world, options.flags ? String(options.flags) : undefined)
        printOrJson({ result }, opts, () => {
          console.log(`\nSimulate ${result.worldName}`)
          console.log('  Flags:')
          for (const f of result.flags) {
            console.log(`    ${f.key || f.name}=${String(f.value)}`)
          }
          console.log('  Unlocked stages:')
          if (result.unlockedStages.length === 0) console.log('    (none)')
          for (const s of result.unlockedStages) console.log(`    ${s.name}  (${s.reason})`)
          console.log('  Locked stages:')
          if (result.lockedStages.length === 0) console.log('    (none)')
          for (const s of result.lockedStages) console.log(`    ${s.name}  (${s.reason})`)
          console.log('  Triggers that would fire:')
          if (result.firingTriggers.length === 0) console.log('    (none)')
          for (const t of result.firingTriggers) {
            console.log(`    ${t.name}  ${t.kind}${t.virtual ? ' (hotspot.encounterId)' : ''}  ${t.effects}`)
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
