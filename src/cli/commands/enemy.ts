/**
 * forge enemy — 2a enemy records, checklist, and JSON contract.
 */

import { Command } from 'commander'
import type { BattleMoment, EnemyAssetRef } from '@shared/types/assetPipeline'
import { BATTLE_MOMENTS } from '@shared/types/assetPipeline'
import {
  createEnemy,
  enemyChecklist,
  listEnemies,
  removeEnemy,
  showEnemy,
  updateEnemy,
  type EnemyInput
} from '@core/storage/enemyService'
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

function parsePoseList(items: string[] | undefined): Partial<Record<BattleMoment, string>> {
  const out: Partial<Record<BattleMoment, string>> = {}
  for (const raw of items || []) {
    const idx = raw.indexOf('=')
    if (idx <= 0) throw new Error(`--pose must be moment=slot, got '${raw}'`)
    const moment = raw.slice(0, idx).trim() as BattleMoment
    const slot = raw.slice(idx + 1).trim()
    if (!BATTLE_MOMENTS.includes(moment)) {
      throw new Error(`Unknown battle moment '${moment}'. Allowed: ${BATTLE_MOMENTS.join(', ')}`)
    }
    if (!slot) throw new Error(`--pose ${moment} needs a slot`)
    out[moment] = slot
  }
  return out
}

function parseAssetList(items: string[] | undefined): EnemyAssetRef[] {
  const out: EnemyAssetRef[] = []
  for (const raw of items || []) {
    const [roleAndId, statesRaw] = raw.split(':')
    const idx = (roleAndId || '').indexOf('=')
    if (idx <= 0) throw new Error(`--asset must be role=assetId[:state,state], got '${raw}'`)
    const role = roleAndId!.slice(0, idx).trim()
    const assetId = roleAndId!.slice(idx + 1).trim()
    const ref: EnemyAssetRef = { role, assetId }
    if (statesRaw) {
      ref.states = statesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    out.push(ref)
  }
  return out
}

function inputFromOptions(options: Record<string, unknown>, partial: boolean): EnemyInput {
  const input: EnemyInput = {}
  if (options.name !== undefined) input.name = String(options.name)
  if (options.key !== undefined) input.key = String(options.key)
  if (options.character !== undefined) input.characterId = String(options.character)
  if (options.module !== undefined) input.moduleId = String(options.module)
  if (options.win !== undefined) input.winKind = String(options.win)
  const winParams = parseKvList(options.winParam as string[] | undefined, '--win-param')
  if (!partial || (options.winParam as string[] | undefined)?.length) input.winParams = winParams
  const stats = parseKvList(options.stat as string[] | undefined, '--stat')
  if (!partial || (options.stat as string[] | undefined)?.length) input.stats = stats
  const poses = parsePoseList(options.pose as string[] | undefined)
  if (!partial || Object.keys(poses).length) input.poses = poses
  if ((options.asset as string[] | undefined)?.length) input.assets = parseAssetList(options.asset as string[])
  if (options.notes !== undefined) input.notes = String(options.notes)
  if (options.attackTable !== undefined) {
    input.attackTableId = String(options.attackTable) || null
  }
  return input
}

function addWriteFlags(cmd: Command, required: boolean): Command {
  if (required) {
    cmd.requiredOption('--name <name>', 'Name')
    cmd.requiredOption('--character <id>', 'Character id, @key, or exact name')
    cmd.requiredOption('--module <id>', 'Encounter module id')
    cmd.requiredOption('--win <kind>', 'Win condition kind from the module')
  } else {
    cmd.option('--name <name>', 'Name')
    cmd.option('--character <id>', 'Character id, @key, or exact name')
    cmd.option('--module <id>', 'Encounter module id')
    cmd.option('--win <kind>', 'Win condition kind from the module')
  }
  return cmd
    .option('--key <key>', 'Optional slug unique per game')
    .option('--win-param <k=v>', 'Win param number (repeatable)', collect, [])
    .option('--stat <k=v>', 'Stat number (repeatable)', collect, [])
    .option('--pose <moment=slot>', 'Battle moment -> pose slot (repeatable)', collect, [])
    .option('--asset <role=id[:states]>', 'Extra asset (repeatable)', collect, [])
    .option('--notes <text>', 'Notes')
    .option('--attack-table <id>', 'Attack table id, @key, or exact name')
    .option('--dry-run', 'Validate without writing')
}

export function registerEnemyCommands(program: Command): void {
  const enemyCmd = program.command('enemy').description('Manage enemies (2a)')

  enemyCmd
    .command('list')
    .description('List enemies in a game')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const enemies = await listEnemies(opts.game!, dir(opts))
        printOrJson({ enemies }, opts, () => {
          console.log('\nEnemies:')
          if (enemies.length === 0) console.log('  (none)')
          for (const e of enemies) {
            console.log(`  ${e.id}${e.key ? ` @${e.key}` : ''}  ${e.name}  module=${e.moduleId}`)
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  enemyCmd
    .command('show')
    .description('Show one enemy (uuid or @key)')
    .argument('<id>', 'Enemy uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (id, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const record = await showEnemy(opts.game!, String(id), dir(opts))
        printOrJson({ record }, opts, () => console.log(JSON.stringify(record, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  addWriteFlags(
    enemyCmd.command('create').description('Create an enemy').requiredOption('--game <id>', 'Game ID'),
    true
  ).action(async (options, cmd) => {
    const opts = { ...program.opts(), ...collectOpts(cmd, options) }
    try {
      const { record } = await createEnemy(opts.game!, inputFromOptions(options, false), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would create' : 'Created'} enemy: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  addWriteFlags(
    enemyCmd
      .command('update')
      .description('Update an enemy (uuid or @key)')
      .argument('<id>', 'Enemy uuid or @key')
      .requiredOption('--game <id>', 'Game ID'),
    false
  ).action(async (id, options, cmd) => {
    const opts = { ...program.opts(), ...collectOpts(cmd, options) }
    try {
      const { record } = await updateEnemy(opts.game!, String(id), inputFromOptions(options, true), {
        dataDirOverride: dir(opts),
        dryRun: Boolean(opts.dryRun)
      })
      printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
        console.log(`${opts.dryRun ? 'Would update' : 'Updated'} enemy: ${record.name} (${record.id})`)
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  enemyCmd
    .command('remove')
    .description('Remove an enemy (uuid or @key)')
    .argument('<id>', 'Enemy uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (id, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await removeEnemy(opts.game!, String(id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} enemy: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  enemyCmd
    .command('checklist')
    .description('Pose/asset checklist for an enemy')
    .argument('<id>', 'Enemy uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (id, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const checklist = await enemyChecklist(opts.game!, String(id), dir(opts))
        printOrJson(checklist, opts, () => {
          console.log(`\n${checklist.enemy}  character=${checklist.character}  ready=${checklist.ready}`)
          for (const p of checklist.poses) {
            console.log(`  pose ${p.slot}  ${p.have ? 'have' : 'missing'}${p.usedBy ? `  (${p.usedBy})` : ''}`)
          }
          for (const a of checklist.assets) {
            console.log(`  asset ${a.role}  ${a.have ? 'have' : 'missing'}`)
          }
          for (const c of checklist.cueEvents) {
            console.log(`  cue ${c.name}  ${c.have ? 'have' : 'missing'}  (${c.usedBy})`)
          }
          for (const s of checklist.sfx) {
            console.log(`  sfx ${s.name}  ${s.have ? 'have' : 'missing'}  (${s.usedBy})`)
          }
          console.log(
            `  usedBy: ${checklist.usedBy.length ? checklist.usedBy.join(', ') : '(none)'}`
          )
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
