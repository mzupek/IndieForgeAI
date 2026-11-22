/**
 * forge npc — Step 4 NPCs.
 */

import { Command } from 'commander'
import { createNpc, listNpcs, removeNpc, showNpc, updateNpc, type NpcInput } from '@core/storage/npcService'
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

function inputFromOptions(options: Record<string, unknown>): NpcInput {
  const input: NpcInput = {}
  if (options.displayName !== undefined || options.name !== undefined) {
    input.displayName = String(options.displayName || options.name)
  }
  if (options.key !== undefined) input.key = String(options.key)
  if (options.character !== undefined) input.characterId = String(options.character)
  if (options.role !== undefined) input.role = String(options.role)
  if (options.placements !== undefined) {
    input.placements = parseJsonFlag(options.placements, '--placements') as NpcInput['placements']
  }
  if (options.dialogue !== undefined) input.defaultDialogueId = String(options.dialogue)
  if (options.notes !== undefined) input.notes = String(options.notes)
  return input
}

function addWriteFlags(cmd: Command, required: boolean): Command {
  if (required) {
    cmd.requiredOption('--name <name>', 'Display name')
    cmd.requiredOption('--character <id>', 'Character uuid, @key, or name')
    cmd.requiredOption('--role <role>', 'Role (mentor, vendor, ...)')
  } else {
    cmd.option('--name <name>', 'Display name')
    cmd.option('--character <id>', 'Character uuid, @key, or name')
    cmd.option('--role <role>', 'Role')
  }
  return cmd
    .option('--key <key>', 'Optional slug unique per game')
    .option('--placements <json>', 'JSON array of { regionId, anchorId, condition?, interactTriggerId? }')
    .option('--dialogue <id>', 'Default dialogue uuid or @key (empty to clear on update)')
    .option('--notes <text>', 'Notes')
    .option('--dry-run', 'Validate without writing')
}

export function registerNpcCommands(program: Command): void {
  const cmd = program.command('npc').description('Manage NPCs (Step 4)')

  cmd
    .command('list')
    .description('List NPCs in a game')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const npcs = await listNpcs(opts.game!, dir(opts))
        printOrJson({ npcs }, opts, () => {
          console.log('\nNPCs:')
          if (npcs.length === 0) console.log('  (none)')
          for (const n of npcs) {
            console.log(
              `  ${n.id}${n.key ? ` @${n.key}` : ''}  ${n.displayName}  ${n.role}  placements=${n.placements.length}`
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
    .description('Show one NPC (uuid or @key)')
    .argument('<id>', 'NPC uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const record = await showNpc(opts.game!, String(id), dir(opts))
        printOrJson({ record }, opts, () => console.log(JSON.stringify(record, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  addWriteFlags(cmd.command('create').description('Create an NPC').requiredOption('--game <id>', 'Game ID'), true).action(
    async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const { record } = await createNpc(opts.game!, inputFromOptions(options), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would create' : 'Created'} npc: ${record.displayName} (${record.id})`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    }
  )

  addWriteFlags(
    cmd.command('update').description('Update an NPC').argument('<id>', 'NPC uuid or @key').requiredOption('--game <id>', 'Game ID'),
    false
  ).action(async (id, options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await updateNpc(opts.game!, String(id), inputFromOptions(options), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would update' : 'Updated'} npc: ${record.displayName} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  cmd
    .command('remove')
    .description('Remove an NPC')
    .argument('<id>', 'NPC uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const result = await removeNpc(opts.game!, String(id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} npc: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
