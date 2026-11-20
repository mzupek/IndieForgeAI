/**
 * forge world|stage|encounter|region|content — world structure (1c) and map (1d).
 */

import { Command } from 'commander'
import { readFileSync } from 'fs'
import { ContentApplyError } from '@shared/worldContent/issues'
import {
  addWorldMapNode,
  addWorldMapPath,
  applyContent,
  applyTypedRecords,
  createEncounter,
  createRegion,
  createStage,
  createWorld,
  exportContent,
  listEncounters,
  listRegions,
  listStages,
  listWorlds,
  moveWorldMapNode,
  parsePosPair,
  parseWaypointList,
  removeEncounter,
  removeRegion,
  removeStage,
  removeWorld,
  removeWorldMapNode,
  removeWorldMapPath,
  reorderStages,
  reorderWorlds,
  setWorldMap,
  showEncounter,
  showRegion,
  showStage,
  showWorld,
  showWorldMap,
  updateEncounter,
  updateRegion,
  updateStage,
  updateWorld,
  worldFlow,
  type EncounterInput,
  type RegionInput,
  type StageInput,
  type WorldInput
} from '@core/storage/worldContentService'
import { output, outputError } from '../utils/output'

interface CommonOpts {
  dataDir?: string
  json?: boolean
  game?: string
  dryRun?: boolean
  world?: string
  stage?: string
  file?: string
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

function parseJsonArg(raw: string | undefined, label: string): unknown {
  if (raw === undefined || raw === '') return undefined
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`Invalid JSON for ${label}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    throw new Error(`Failed to read JSON file '${path}': ${err instanceof Error ? err.message : String(err)}`)
  }
}

function outputApplyError(err: unknown, opts: CommonOpts): void {
  if (err instanceof ContentApplyError && opts.json) {
    console.error(JSON.stringify({ error: true, message: err.message, issues: err.issues }, null, 2))
    return
  }
  outputError(err, opts)
}

export function registerWorldContentCommands(program: Command): void {
  const worldCmd = program.command('world').description('Manage worlds (1c)')
  registerCrud(worldCmd, 'world', program, {
    list: async (opts) => listWorlds(opts.game!, dir(opts)),
    show: (id, opts) => showWorld(opts.game!, id, dir(opts)),
    create: async (opts, options) => {
      const input: WorldInput = {
        name: String(options.name),
        key: options.key,
        description: options.description,
        order: options.order !== undefined ? Number(options.order) : undefined
      }
      return createWorld(opts.game!, input, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) })
    },
    update: async (id, opts, options) => {
      const patch: Partial<WorldInput> = {}
      if (options.name !== undefined) patch.name = String(options.name)
      if (options.key !== undefined) patch.key = String(options.key)
      if (options.description !== undefined) patch.description = String(options.description)
      if (options.order !== undefined) patch.order = Number(options.order)
      return updateWorld(opts.game!, id, patch, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) })
    },
    remove: (id, opts) => removeWorld(opts.game!, id, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }),
    applyKind: 'world',
    createFlags: (cmd) =>
      cmd
        .requiredOption('--name <name>', 'Name')
        .option('--key <key>', 'Optional slug unique per game+type')
        .option('--description <text>', 'Description')
        .option('--order <n>', 'Sort order'),
    updateFlags: (cmd) =>
      cmd
        .option('--name <name>', 'Name')
        .option('--key <key>', 'Slug')
        .option('--description <text>', 'Description')
        .option('--order <n>', 'Sort order')
  })

  worldCmd
    .command('reorder')
    .description('Renumber worlds in a game to 1..N (one save)')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--ids <ids>', 'Comma-separated world ids or @keys in the new order')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const { records } = await reorderWorlds(opts.game!, csvIds(String(options.ids)), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ records, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would reorder' : 'Reordered'} ${records.length} world(s)`)
          for (const row of records) {
            console.log(`${row.order}. ${row.id}${row.key ? ` @${row.key}` : ''}  ${row.name}`)
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const stageCmd = program.command('stage').description('Manage stages (1c)')
  registerCrud(stageCmd, 'stage', program, {
    list: async (opts) => listStages(opts.game!, opts.world, dir(opts)),
    show: (id, opts) => showStage(opts.game!, id, dir(opts)),
    create: async (opts, options) => {
      const input: StageInput = {
        worldId: String(options.world || options.worldId),
        name: String(options.name),
        key: options.key,
        order: options.order !== undefined ? Number(options.order) : undefined,
        recommendedLevel: options.recommendedLevel !== undefined ? Number(options.recommendedLevel) : undefined,
        optional: options.optional !== undefined ? Boolean(options.optional) : undefined
      }
      return createStage(opts.game!, input, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) })
    },
    update: async (id, opts, options) => {
      const patch: Partial<StageInput> = {}
      if (options.world !== undefined || options.worldId !== undefined) {
        patch.worldId = String(options.world || options.worldId)
      }
      if (options.name !== undefined) patch.name = String(options.name)
      if (options.key !== undefined) patch.key = String(options.key)
      if (options.order !== undefined) patch.order = Number(options.order)
      if (options.recommendedLevel !== undefined) patch.recommendedLevel = Number(options.recommendedLevel)
      if (options.optional !== undefined) patch.optional = Boolean(options.optional)
      if (options.entryRegion !== undefined) patch.entryRegionId = String(options.entryRegion)
      if (options.entryAnchor !== undefined) patch.entryAnchor = String(options.entryAnchor)
      if (options.unlockAfter !== undefined) patch.unlockAfter = csvIds(options.unlockAfter)
      if (options.clearedBy !== undefined) patch.clearedBy = csvIds(options.clearedBy)
      if (options.returnToNode !== undefined) patch.returnToNode = String(options.returnToNode)
      return updateStage(opts.game!, id, patch, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) })
    },
    remove: (id, opts) => removeStage(opts.game!, id, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }),
    applyKind: 'stage',
    listFlags: (cmd) => cmd.option('--world <id>', 'Filter by world id or @key'),
    createFlags: (cmd) =>
      cmd
        .requiredOption('--world <id>', 'World id or @key')
        .requiredOption('--name <name>', 'Name')
        .option('--key <key>', 'Optional slug')
        .option('--order <n>', 'Sort order')
        .option('--recommended-level <n>', 'Recommended level')
        .option('--optional', 'Mark stage optional'),
    updateFlags: (cmd) =>
      cmd
        .option('--world <id>', 'World id or @key')
        .option('--name <name>', 'Name')
        .option('--key <key>', 'Slug')
        .option('--order <n>', 'Sort order')
        .option('--recommended-level <n>', 'Recommended level')
        .option('--optional', 'Mark stage optional')
        .option('--entry-region <id>', 'Entry region id or @key (empty to clear)')
        .option('--entry-anchor <id>', 'Entry anchor id (defaults to spawn)')
        .option('--unlock-after <ids>', 'Comma-separated stage ids or @keys')
        .option('--cleared-by <ids>', 'Comma-separated encounter ids or @keys')
        .option('--return-to-node <id>', 'Map node id to return to')
  })

  stageCmd
    .command('reorder')
    .description('Renumber stages in a world to 1..N (one save)')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--world <id>', 'World id or @key')
    .requiredOption('--ids <ids>', 'Comma-separated stage ids or @keys in the new order')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const { records } = await reorderStages(opts.game!, String(options.world), csvIds(String(options.ids)), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ records, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would reorder' : 'Reordered'} ${records.length} stage(s)`)
          for (const row of records) {
            console.log(`${row.order}. ${row.id}${row.key ? ` @${row.key}` : ''}  ${row.name}`)
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const encounterCmd = program.command('encounter').description('Manage encounters (1c)')
  registerCrud(encounterCmd, 'encounter', program, {
    list: async (opts) => listEncounters(opts.game!, opts.stage, dir(opts)),
    show: (id, opts) => showEncounter(opts.game!, id, dir(opts)),
    create: async (opts, options) => {
      const input: EncounterInput = {
        stageId: String(options.stage || options.stageId),
        name: String(options.name),
        typeId: String(options.typeId || options.type),
        moduleId: String(options.moduleId || options.module),
        key: options.key,
        sceneId: options.scene,
        tuningProfileId: options.tuning,
        difficultyProfileId: options.difficulty,
        recommendedLevel: options.recommendedLevel !== undefined ? Number(options.recommendedLevel) : undefined,
        stars: parseJsonArg(options.stars, '--stars') as EncounterInput['stars'],
        order: options.order !== undefined ? Number(options.order) : undefined
      }
      return createEncounter(opts.game!, input, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) })
    },
    update: async (id, opts, options) => {
      const patch: Partial<EncounterInput> = {}
      if (options.stage !== undefined || options.stageId !== undefined) {
        patch.stageId = String(options.stage || options.stageId)
      }
      if (options.name !== undefined) patch.name = String(options.name)
      if (options.typeId !== undefined || options.type !== undefined) {
        patch.typeId = String(options.typeId || options.type)
      }
      if (options.moduleId !== undefined || options.module !== undefined) {
        patch.moduleId = String(options.moduleId || options.module)
      }
      if (options.key !== undefined) patch.key = String(options.key)
      if (options.scene !== undefined) patch.sceneId = String(options.scene)
      if (options.tuning !== undefined) patch.tuningProfileId = String(options.tuning)
      if (options.difficulty !== undefined) patch.difficultyProfileId = String(options.difficulty)
      if (options.recommendedLevel !== undefined) patch.recommendedLevel = Number(options.recommendedLevel)
      if (options.stars !== undefined) patch.stars = parseJsonArg(options.stars, '--stars') as EncounterInput['stars']
      if (options.order !== undefined) patch.order = Number(options.order)
      return updateEncounter(opts.game!, id, patch, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) })
    },
    remove: (id, opts) =>
      removeEncounter(opts.game!, id, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }),
    applyKind: 'encounter',
    listFlags: (cmd) => cmd.option('--stage <id>', 'Filter by stage id or @key'),
    createFlags: (cmd) =>
      cmd
        .requiredOption('--stage <id>', 'Stage id or @key')
        .requiredOption('--name <name>', 'Name')
        .requiredOption('--type <id>', 'Encounter type from game.settings')
        .requiredOption('--module <id>', 'Module id from game.settings')
        .option('--key <key>', 'Optional slug')
        .option('--scene <id>', 'Scene uuid, @key, or name')
        .option('--tuning <id>', 'Tuning profile uuid or name')
        .option('--difficulty <id>', 'Difficulty profile id (stored, not checked)')
        .option('--recommended-level <n>', 'Recommended level')
        .option('--stars <json>', 'JSON array of 0-3 stars')
        .option('--order <n>', 'Sort order'),
    updateFlags: (cmd) =>
      cmd
        .option('--stage <id>', 'Stage id or @key')
        .option('--name <name>', 'Name')
        .option('--type <id>', 'Encounter type')
        .option('--module <id>', 'Module id')
        .option('--key <key>', 'Slug')
        .option('--scene <id>', 'Scene uuid, @key, or name (empty to clear)')
        .option('--tuning <id>', 'Tuning profile uuid or name (empty to clear)')
        .option('--difficulty <id>', 'Difficulty profile id')
        .option('--recommended-level <n>', 'Recommended level')
        .option('--stars <json>', 'JSON array of 0-3 stars')
        .option('--order <n>', 'Sort order')
  })

  const regionCmd = program.command('region').description('Manage regions (1c)')
  registerCrud(regionCmd, 'region', program, {
    list: async (opts) => listRegions(opts.game!, opts.stage, dir(opts)),
    show: (id, opts) => showRegion(opts.game!, id, dir(opts)),
    create: async (opts, options) => {
      const input: RegionInput = {
        name: String(options.name),
        backgroundAssetId: String(options.background || options.backgroundAssetId),
        anchors: (parseJsonArg(options.anchors, '--anchors') as RegionInput['anchors']) || [],
        edges: (parseJsonArg(options.edges, '--edges') as RegionInput['edges']) || [],
        spawn: String(options.spawn || ''),
        hotspots: (parseJsonArg(options.hotspots, '--hotspots') as RegionInput['hotspots']) || [],
        exits: (parseJsonArg(options.exits, '--exits') as RegionInput['exits']) || [],
        key: options.key,
        stageId: options.stage
      }
      return createRegion(opts.game!, input, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) })
    },
    update: async (id, opts, options) => {
      const patch: Partial<RegionInput> = {}
      if (options.name !== undefined) patch.name = String(options.name)
      if (options.background !== undefined || options.backgroundAssetId !== undefined) {
        patch.backgroundAssetId = String(options.background || options.backgroundAssetId)
      }
      if (options.anchors !== undefined) {
        patch.anchors = parseJsonArg(options.anchors, '--anchors') as RegionInput['anchors']
      }
      if (options.edges !== undefined) patch.edges = parseJsonArg(options.edges, '--edges') as RegionInput['edges']
      if (options.spawn !== undefined) patch.spawn = String(options.spawn)
      if (options.hotspots !== undefined) {
        patch.hotspots = parseJsonArg(options.hotspots, '--hotspots') as RegionInput['hotspots']
      }
      if (options.exits !== undefined) patch.exits = parseJsonArg(options.exits, '--exits') as RegionInput['exits']
      if (options.key !== undefined) patch.key = String(options.key)
      if (options.stage !== undefined) patch.stageId = String(options.stage)
      return updateRegion(opts.game!, id, patch, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) })
    },
    remove: (id, opts) => removeRegion(opts.game!, id, { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }),
    applyKind: 'region',
    listFlags: (cmd) => cmd.option('--stage <id>', 'Filter by stage id or @key'),
    createFlags: (cmd) =>
      cmd
        .requiredOption('--name <name>', 'Name')
        .requiredOption('--background <id>', 'Background visual asset uuid, @key, or name')
        .requiredOption('--anchors <json>', 'JSON array of {id, pos:[x,y]}')
        .requiredOption('--spawn <id>', 'Spawn anchor id')
        .option('--stage <id>', 'Stage id or @key')
        .option('--key <key>', 'Optional slug')
        .option('--edges <json>', 'JSON array of [a,b] or {from,to,requires?,hint?}')
        .option('--hotspots <json>', 'JSON array of {id,anchor,prompt,triggerId?,encounterId?}')
        .option('--exits <json>', 'JSON array of {id,anchor,toRegionId?,toAnchor?,toWorldMap?}'),
    updateFlags: (cmd) =>
      cmd
        .option('--name <name>', 'Name')
        .option('--background <id>', 'Background visual asset')
        .option('--anchors <json>', 'JSON anchors')
        .option('--spawn <id>', 'Spawn anchor id')
        .option('--stage <id>', 'Stage id or @key')
        .option('--key <key>', 'Slug')
        .option('--edges <json>', 'JSON edges')
        .option('--hotspots <json>', 'JSON hotspots')
        .option('--exits <json>', 'JSON exits')
  })

  registerWorldMapCommands(worldCmd, program)

  worldCmd
    .command('flow')
    .description('Read-only flow preview (same shape as the UI)')
    .argument('<world>', 'uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (worldArg, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const flow = await worldFlow(opts.game!, String(worldArg), dir(opts))
        printOrJson(flow, opts, () => {
          printFlow(flow.tree, 0)
          const errors = flow.issues.filter((i) => i.level === 'error')
          const warnings = flow.issues.filter((i) => i.level === 'warning')
          console.log(`${errors.length} error(s), ${warnings.length} warning(s)`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const contentCmd = program.command('content').description('Apply or export world-structure content')

  contentCmd
    .command('apply')
    .description('All-or-nothing apply of a worlds/stages/regions/encounters/enemies/attackTables bundle (match by key)')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--file <path>', 'Bundle JSON')
    .option('--dry-run', 'Print alias map / creates / updates / issues; write nothing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const bundle = readJsonFile(String(options.file))
        const result = await applyContent(opts.game!, bundle, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson(result, opts, () => {
          console.log(opts.dryRun ? 'Dry run (nothing written)' : result.written ? 'Applied' : 'No changes')
          console.log(`Creates: ${result.creates.length}  Updates: ${result.updates.length}  Unchanged: ${result.unchanged.length}`)
          if (Object.keys(result.aliasMap).length) {
            console.log('Alias map:')
            for (const [k, v] of Object.entries(result.aliasMap)) {
              if (k.includes(':') || !result.aliasMap[`@world:${k.slice(1)}`]) {
                console.log(`  ${k} -> ${v}`)
              }
            }
          }
          for (const issue of result.issues) {
            console.log(`${issue.level}: ${issue.path}: ${issue.message}`)
          }
        })
      } catch (err) {
        outputApplyError(err, opts)
        process.exit(1)
      }
    })

  contentCmd
    .command('export')
    .description('Write a read-only content.json sidecar (contentSchemaVersion 1). Does not change studio.json.')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--out <dir>', 'Output directory (writes content.json)')
    .option('--dry-run', 'Print JSON without writing the file')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const exported = await exportContent(opts.game!, String(options.out), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson(exported, opts, () => {
          if (opts.dryRun) {
            console.log(JSON.stringify(exported.content, null, 2))
          } else {
            console.log(`Wrote ${exported.path}`)
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}

interface CrudSpec {
  list: (opts: CommonOpts) => Promise<unknown>
  show: (id: string, opts: CommonOpts) => Promise<unknown>
  create: (opts: CommonOpts, options: Record<string, any>) => Promise<{ record: unknown; warnings?: unknown[] }>
  update: (
    id: string,
    opts: CommonOpts,
    options: Record<string, any>
  ) => Promise<{ record: unknown; warnings?: unknown[] }>
  remove: (id: string, opts: CommonOpts) => Promise<{ removed: string }>
  applyKind: 'world' | 'stage' | 'encounter' | 'region'
  listFlags?: (cmd: Command) => Command
  createFlags: (cmd: Command) => Command
  updateFlags: (cmd: Command) => Command
}

function registerCrud(parent: Command, kind: string, program: Command, spec: CrudSpec): void {
  const listCmd = parent
    .command('list')
    .description(`List ${kind}s`)
    .requiredOption('--game <id>', 'Game ID')
  spec.listFlags?.(listCmd)
  listCmd.action(async (options, cmd) => {
    const opts = { ...program.opts(), ...collectOpts(cmd, options) }
    try {
      const rows = await spec.list(opts)
      printOrJson(rows, opts, () => {
        const list = Array.isArray(rows) ? rows : []
        if (list.length === 0) {
          console.log(`No ${kind}s`)
          return
        }
        for (const row of list as Array<{ id: string; key?: string; name: string }>) {
          console.log(`${row.id}${row.key ? `  @${row.key}` : ''}  ${row.name}`)
        }
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  parent
    .command('show')
    .description(`Show a ${kind} (uuid or @key)`)
    .argument('<id>', 'uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (id, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const record = await spec.show(id, opts)
        printOrJson(record, opts, () => console.log(JSON.stringify(record, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const createCmd = parent
    .command('create')
    .description(`Create a ${kind}`)
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
  spec.createFlags(createCmd)
  createCmd.action(async (options, cmd) => {
    const opts = { ...program.opts(), ...collectOpts(cmd, options) }
    try {
      const { record, warnings } = await spec.create(opts, options)
      printOrJson({ record, warnings: warnings || [], dryRun: Boolean(opts.dryRun) }, opts, () => {
        const rec = record as { id: string; name?: string; key?: string }
        console.log(`${opts.dryRun ? 'Would create' : 'Created'} ${kind}: ${rec.id}${rec.key ? ` @${rec.key}` : ''} ${rec.name || ''}`)
        for (const w of warnings || []) {
          const issue = w as { message: string }
          console.log(`warning: ${issue.message}`)
        }
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  const updateCmd = parent
    .command('update')
    .description(`Update a ${kind} (uuid or @key)`)
    .argument('<id>', 'uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
  spec.updateFlags(updateCmd)
  updateCmd.action(async (id, options, cmd) => {
    const opts = { ...program.opts(), ...collectOpts(cmd, options) }
    try {
      const { record, warnings } = await spec.update(id, opts, options)
      printOrJson({ record, warnings: warnings || [], dryRun: Boolean(opts.dryRun) }, opts, () => {
        const rec = record as { id: string; name?: string }
        console.log(`${opts.dryRun ? 'Would update' : 'Updated'} ${kind}: ${rec.id} ${rec.name || ''}`)
        for (const w of warnings || []) {
          const issue = w as { message: string }
          console.log(`warning: ${issue.message}`)
        }
      })
    } catch (err) {
      outputError(err, opts)
      process.exit(1)
    }
  })

  parent
    .command('remove')
    .description(`Remove a ${kind} (refused while referenced)`)
    .argument('<id>', 'uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (id, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await spec.remove(id, opts)
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} ${kind}: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  parent
    .command('apply')
    .description(`Apply ${kind} JSON (object or array); match by key`)
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--file <path>', 'JSON file')
    .option('--dry-run', 'Print plan; write nothing')
    .action(async (options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const raw = readJsonFile(String(options.file))
        const result = await applyTypedRecords(spec.applyKind, opts.game!, raw, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson(result, opts, () => {
          console.log(
            `${opts.dryRun ? 'Dry run' : result.written ? 'Applied' : 'No changes'}: ${result.creates.length} create(s), ${result.updates.length} update(s)`
          )
        })
      } catch (err) {
        outputApplyError(err, opts)
        process.exit(1)
      }
    })
}

function csvIds(raw: string): string[] {
  if (!String(raw || '').trim()) return []
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function printFlow(line: { label: string; status: string; locked?: boolean; issues: { message: string }[]; children: unknown[] }, depth: number): void {
  const pad = '  '.repeat(depth)
  const mark = line.status === 'error' ? 'ERR' : line.status === 'warning' ? 'WARN' : 'ok'
  const lock = line.locked ? ' [locked]' : ''
  console.log(`${pad}${mark} ${line.label}${lock}`)
  for (const issue of line.issues) {
    console.log(`${pad}  - ${issue.message}`)
  }
  for (const child of line.children as typeof line[]) {
    printFlow(child, depth + 1)
  }
}

function registerWorldMapCommands(worldCmd: Command, program: Command): void {
  const mapCmd = worldCmd.command('map').description('World stage node map (1d)')

  mapCmd
    .command('show')
    .description('Show the world map')
    .argument('<world>', 'uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (worldArg, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const shown = await showWorldMap(opts.game!, String(worldArg), dir(opts))
        printOrJson(shown, opts, () => console.log(JSON.stringify(shown.map, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  mapCmd
    .command('set')
    .description('Set map background and optional start node')
    .argument('<world>', 'uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--background <asset>', 'Background visual asset uuid, @key, or name')
    .option('--start <nodeId>', 'Start node id')
    .option('--dry-run', 'Validate without writing')
    .action(async (worldArg, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await setWorldMap(
          opts.game!,
          String(worldArg),
          { backgroundAssetId: String(options.background), startNodeId: options.start },
          { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
        )
        printOrJson({ record: result.record, warnings: result.warnings, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would set' : 'Set'} map on ${result.record.name}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const nodeCmd = mapCmd.command('node').description('Add, move, or remove a map node')

  nodeCmd
    .command('add')
    .description('Place a node for a stage')
    .argument('<world>', 'uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--stage <id>', 'Stage id or @key')
    .requiredOption('--pos <xy>', 'Position as x,y in 0..1')
    .option('--id <id>', 'Node id')
    .option('--label <text>', 'Label')
    .option('--hidden', 'Hide until unlocked')
    .option('--dry-run', 'Validate without writing')
    .action(async (worldArg, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await addWorldMapNode(
          opts.game!,
          String(worldArg),
          {
            stageId: String(options.stage),
            pos: parsePosPair(String(options.pos)),
            id: options.id,
            label: options.label,
            hidden: Boolean(options.hidden)
          },
          { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
        )
        printOrJson({ record: result.record, node: result.node, warnings: result.warnings, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would add' : 'Added'} node ${result.node.id}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  nodeCmd
    .command('move')
    .description('Move a map node')
    .argument('<world>', 'uuid or @key')
    .argument('<nodeId>', 'Node id')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--pos <xy>', 'Position as x,y in 0..1')
    .option('--dry-run', 'Validate without writing')
    .action(async (worldArg, nodeId, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await moveWorldMapNode(
          opts.game!,
          String(worldArg),
          String(nodeId),
          parsePosPair(String(options.pos)),
          { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
        )
        printOrJson({ record: result.record, node: result.node, warnings: result.warnings, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would move' : 'Moved'} node ${result.node.id}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  nodeCmd
    .command('remove')
    .description('Remove a map node (drops its paths; refused for the start node)')
    .argument('<world>', 'uuid or @key')
    .argument('<nodeId>', 'Node id')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (worldArg, nodeId, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await removeWorldMapNode(opts.game!, String(worldArg), String(nodeId), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} node ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const pathCmd = mapCmd.command('path').description('Add or remove a two-way path')

  pathCmd
    .command('add')
    .description('Add a two-way path')
    .argument('<world>', 'uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--from <node>', 'From node id')
    .requiredOption('--to <node>', 'To node id')
    .option('--waypoints <list>', 'Drawing waypoints as x,y;x,y')
    .option('--id <id>', 'Path id')
    .option('--dry-run', 'Validate without writing')
    .action(async (worldArg, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await addWorldMapPath(
          opts.game!,
          String(worldArg),
          {
            from: String(options.from),
            to: String(options.to),
            waypoints: parseWaypointList(options.waypoints),
            id: options.id
          },
          { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
        )
        printOrJson({ record: result.record, path: result.path, warnings: result.warnings, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would add' : 'Added'} path ${result.path.id}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  pathCmd
    .command('remove')
    .description('Remove a path (stranded nodes are allowed; flow flags them)')
    .argument('<world>', 'uuid or @key')
    .argument('<pathId>', 'Path id')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (worldArg, pathId, options, cmd) => {
      const opts = { ...program.opts(), ...collectOpts(cmd, options) }
      try {
        const result = await removeWorldMapPath(opts.game!, String(worldArg), String(pathId), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} path ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
