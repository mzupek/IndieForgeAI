/**
 * forge attack-table — 2b attack tables, rows, and seeded simulate.
 */

import { Command } from 'commander'
import type { AttackRow, AttackSelection } from '@shared/types/assetPipeline'
import {
  addAttackTableRow,
  createAttackTable,
  listAttackTables,
  removeAttackTable,
  removeAttackTableRow,
  showAttackTable,
  simulateTable,
  updateAttackTable,
  updateAttackTableRow,
  type AttackRowInput,
  type AttackTableInput
} from '@core/storage/attackTableService'
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

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

function parseKvList(items: string[] | undefined, label: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const raw of items || []) {
    const idx = raw.indexOf('=')
    if (idx <= 0) throw new Error(`${label} must be key=number, got '${raw}'`)
    const key = raw.slice(0, idx).trim()
    const n = Number(raw.slice(idx + 1).trim())
    if (!key || !Number.isFinite(n)) throw new Error(`${label} must be key=number, got '${raw}'`)
    out[key] = n
  }
  return out
}

function tableInputFromOptions(options: Record<string, unknown>): AttackTableInput {
  const input: AttackTableInput = {}
  if (options.name !== undefined) input.name = String(options.name)
  if (options.key !== undefined) input.key = String(options.key)
  if (options.module !== undefined) input.moduleId = String(options.module)
  if (options.selection !== undefined) input.selection = String(options.selection) as AttackSelection
  if (options.forbidRepeat !== undefined) input.noRepeatInARow = Boolean(options.forbidRepeat)
  if (options.reveal !== undefined) input.reveal = String(options.reveal)
  if (options.skipFinalRound !== undefined) input.skipFinalRound = Boolean(options.skipFinalRound)
  return input
}

function rowInputFromOptions(options: Record<string, unknown>, partial: boolean): AttackRowInput {
  const input: AttackRowInput = {}
  if (options.id !== undefined) input.id = String(options.id)
  if (options.label !== undefined) input.label = String(options.label)
  if (options.telegraph !== undefined) input.telegraph = String(options.telegraph)
  if (options.kind !== undefined) input.kind = String(options.kind)
  const params = parseKvList(options.param as string[] | undefined, '--param')
  if (!partial || (options.param as string[] | undefined)?.length) input.params = params
  if (options.damage !== undefined) {
    const raw = String(options.damage).trim()
    input.damage = raw === '' ? null : Number(raw)
  }
  if (options.weight !== undefined) input.weight = Number(options.weight)
  if (options.minRound !== undefined) {
    const raw = String(options.minRound).trim()
    input.minRound = raw === '' ? null : Number(raw)
  }
  if (options.maxRound !== undefined) {
    const raw = String(options.maxRound).trim()
    input.maxRound = raw === '' ? null : Number(raw)
  }
  if (options.counterKind !== undefined) input.counterKind = String(options.counterKind) || null
  if (options.counterResult !== undefined) input.counterResult = String(options.counterResult) || null
  if (options.pose !== undefined) input.poseSlot = String(options.pose) || null
  if (options.heroPose !== undefined) input.heroPoseSlot = String(options.heroPose) || null
  if (options.cue !== undefined) input.cueEventId = String(options.cue) || null
  if (options.sfx !== undefined) input.sfxAudioId = String(options.sfx) || null
  return input
}

function addTableFlags(cmd: Command, required: boolean): Command {
  if (required) {
    cmd.requiredOption('--name <name>', 'Name')
    cmd.requiredOption('--module <id>', 'Encounter module id')
  } else {
    cmd.option('--name <name>', 'Name')
    cmd.option('--module <id>', 'Encounter module id')
  }
  return cmd
    .option('--key <key>', 'Optional slug unique per game')
    .option('--selection <mode>', 'weighted (default) or sequence')
    .option('--forbid-repeat', 'Do not pick the same row twice in a row (noRepeatInARow)')
    .option('--skip-final-round', 'Skip the last simulated round')
    .option('--reveal <when>', 'When the telegraph is shown (roundStart)')
    .option('--dry-run', 'Validate without writing')
}

function addRowFlags(cmd: Command, required: boolean): Command {
  if (required) {
    cmd.requiredOption('--label <label>', 'Row label')
    cmd.requiredOption('--kind <key>', 'Attack kind from the module')
    cmd.requiredOption('--weight <n>', 'Weight (must be > 0 when weighted)')
  } else {
    cmd.option('--label <label>', 'Row label')
    cmd.option('--kind <key>', 'Attack kind from the module')
    cmd.option('--weight <n>', 'Weight')
  }
  return cmd
    .option('--id <id>', 'Record-local slug (default: from label)')
    .option('--telegraph <text>', 'Telegraph text')
    .option('--param <k=v>', 'Kind param number (repeatable)', collect, [])
    .option('--damage <n>', 'Optional damage')
    .option('--min-round <n>', 'First round this row can appear')
    .option('--max-round <n>', 'Last round this row can appear')
    .option('--counter-kind <key>', 'Counter kind from the module')
    .option('--counter-result <result>', 'cancel or halve')
    .option('--pose <slot>', 'Pose slot on the linked enemy character')
    .option('--hero-pose <slot>', 'Hero pose slot (core + game)')
    .option('--cue <id>', 'Cue event id, @key, or exact name')
    .option('--sfx <id>', 'SFX audio id or exact name')
    .option('--dry-run', 'Validate without writing')
}

function summarizeRow(row: AttackRow): string {
  const bits = [`${row.id}`, row.label, `kind=${row.kind}`, `w=${row.weight}`]
  if (row.minRound) bits.push(`min=${row.minRound}`)
  if (row.maxRound) bits.push(`max=${row.maxRound}`)
  return bits.join('  ')
}

export function registerAttackTableCommands(program: Command): void {
  const cmd = program.command('attack-table').description('Manage attack tables (2b)')

  cmd
    .command('list')
    .description('List attack tables in a game')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const tables = await listAttackTables(opts.game!, dir(opts))
        printOrJson({ attackTables: tables }, opts, () => {
          console.log('\nAttack tables:')
          if (tables.length === 0) console.log('  (none)')
          for (const t of tables) {
            console.log(
              `  ${t.id}${t.key ? ` @${t.key}` : ''}  ${t.name}  module=${t.moduleId}  rows=${t.rows.length}`
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
    .description('Show one attack table (uuid or @key)')
    .argument('<id>', 'Table uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const record = await showAttackTable(opts.game!, String(id), dir(opts))
        printOrJson({ record }, opts, () => console.log(JSON.stringify(record, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  addTableFlags(
    cmd.command('create').description('Create an attack table').requiredOption('--game <id>', 'Game ID'),
    true
  ).action(async (options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await createAttackTable(opts.game!, tableInputFromOptions(options), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would create' : 'Created'} attack table: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  addTableFlags(
    cmd
      .command('update')
      .description('Update an attack table (uuid or @key)')
      .argument('<id>', 'Table uuid or @key')
      .requiredOption('--game <id>', 'Game ID'),
    false
  ).action(async (id, options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await updateAttackTable(opts.game!, String(id), tableInputFromOptions(options), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would update' : 'Updated'} attack table: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  cmd
    .command('remove')
    .description('Remove an attack table (refused while an enemy uses it)')
    .argument('<id>', 'Table uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const result = await removeAttackTable(opts.game!, String(id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} attack table: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const rowCmd = cmd.command('row').description('Add, update, or remove a row on an attack table')

  addRowFlags(
    rowCmd
      .command('add')
      .description('Add a row')
      .argument('<table>', 'Table uuid or @key')
      .requiredOption('--game <id>', 'Game ID'),
    true
  ).action(async (table, options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await addAttackTableRow(opts.game!, String(table), rowInputFromOptions(options, false), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        const row = record.rows[record.rows.length - 1]
        console.log(`${opts.dryRun ? 'Would add' : 'Added'} row ${row ? summarizeRow(row) : ''} on ${record.name}`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  addRowFlags(
    rowCmd
      .command('update')
      .description('Update a row')
      .argument('<table>', 'Table uuid or @key')
      .argument('<rowId>', 'Row slug')
      .requiredOption('--game <id>', 'Game ID'),
    false
  ).action(async (table, rowId, options, c) => {
    const opts = { ...program.opts(), ...collectOpts(c, options) }
    try {
      const { record } = await updateAttackTableRow(
        opts.game!,
        String(table),
        String(rowId),
        rowInputFromOptions(options, true),
        { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
      )
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would update' : 'Updated'} row ${rowId} on ${record.name}`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  rowCmd
    .command('remove')
    .description('Remove a row')
    .argument('<table>', 'Table uuid or @key')
    .argument('<rowId>', 'Row slug')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (table, rowId, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const { record } = await removeAttackTableRow(opts.game!, String(table), String(rowId), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} row ${rowId} from ${record.name}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  cmd
    .command('simulate')
    .description('Read-only seeded pick of rows for N rounds')
    .argument('<table>', 'Table uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--rounds <n>', 'Number of rounds')
    .requiredOption('--seed <n>', 'Uint32 seed (Mulberry32)')
    .action(async (table, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const result = await simulateTable(
          opts.game!,
          String(table),
          Number(options.rounds),
          Number(options.seed),
          dir(opts)
        )
        printOrJson(result, opts, () => {
          console.log(`\n${result.tableName}  seed=${result.seed}  rounds=${result.rounds}  ${result.selection}`)
          for (const round of result.results) {
            if (round.skipped) {
              console.log(`  round ${round.round}: skipped (${round.reason})`)
            } else {
              console.log(
                `  round ${round.round}: ${round.picked?.label}  possible=${round.possible.map((p) => p.id).join(',')}`
              )
            }
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
