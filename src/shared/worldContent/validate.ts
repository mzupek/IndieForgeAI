/**
 * World / Stage / Encounter / Region validation (1c). Game-agnostic: types and
 * modules come from game.settings. Cross-game refs are refused.
 */

import type {
  AssetPipelineProject,
  Encounter,
  EncounterStar,
  Game,
  Region,
  RegionAnchor,
  RegionEdge,
  RegionExit,
  RegionHotspot,
  Stage,
  World,
  WorldMap,
  WorldMapNode,
  WorldMapPath
} from '../types/assetPipeline'
import { isBackgroundCategoryKey } from '../gameSettings/assetCategories'
import {
  assertKnownEncounterType,
  assertKnownModule
} from '../gameSettings/encounterSettings'
import { requireGame } from './scope'
import { assertRecordKey, isAliasRef, isUuid, normalizeRecordKey } from './keys'
import { errorIssue, type ContentIssue, type NamedUser, warningIssue } from './issues'

export const RECORD_SCHEMA_VERSION = 2
export const MAX_ENCOUNTER_STARS = 3

export type { NamedUser }

function games(pipeline: AssetPipelineProject): Game[] {
  return pipeline.games || []
}

export function worldsOf(pipeline: AssetPipelineProject, gameId: string): World[] {
  return (pipeline.worlds || []).filter((w) => w.gameId === gameId)
}

export function stagesOf(pipeline: AssetPipelineProject, gameId: string, worldId?: string): Stage[] {
  return (pipeline.stages || []).filter(
    (s) => s.gameId === gameId && (!worldId || s.worldId === worldId)
  )
}

export function encountersOf(pipeline: AssetPipelineProject, gameId: string, stageId?: string): Encounter[] {
  return (pipeline.encounters || []).filter(
    (e) => e.gameId === gameId && (!stageId || e.stageId === stageId)
  )
}

export function regionsOf(pipeline: AssetPipelineProject, gameId: string, stageId?: string): Region[] {
  return (pipeline.regions || []).filter(
    (r) => r.gameId === gameId && (!stageId || r.stageId === stageId)
  )
}

export function findByIdOrKey<T extends { id: string; key?: string; gameId: string }>(
  records: T[],
  idOrKey: string,
  gameId: string
): T | undefined {
  const raw = String(idOrKey || '').trim()
  if (!raw) return undefined
  const inGame = records.filter((r) => r.gameId === gameId)
  if (isAliasRef(raw) || (!isUuid(raw) && raw.startsWith('@'))) {
    const key = normalizeRecordKey(raw.replace(/^@/, ''))
    return inGame.find((r) => r.key === key)
  }
  const byId = inGame.find((r) => r.id === raw)
  if (byId) return byId
  if (raw.startsWith('@')) {
    const key = normalizeRecordKey(raw.slice(1))
    return inGame.find((r) => r.key === key)
  }
  return inGame.find((r) => r.key === raw)
}

export function requireIdOrKey<T extends { id: string; key?: string; gameId: string }>(
  records: T[],
  idOrKey: string,
  gameId: string,
  kind: string
): T {
  const found = findByIdOrKey(records, idOrKey, gameId)
  if (!found) {
    throw new Error(`${kind} not found: ${idOrKey}`)
  }
  return found
}

export function assertKeyUnique<T extends { id: string; key?: string; gameId: string }>(
  records: T[],
  gameId: string,
  key: string | undefined,
  excludeId: string | undefined,
  kind: string
): void {
  if (!key) return
  const clash = records.find((r) => r.gameId === gameId && r.key === key && r.id !== excludeId)
  if (clash) {
    throw new Error(`${kind} key '${key}' already used by ${clash.id}`)
  }
}

function assertSameGame(
  refGameId: string | undefined,
  gameId: string,
  kind: string,
  refId: string,
  path: string,
  issues: ContentIssue[]
): boolean {
  if (!refGameId) {
    issues.push(errorIssue(path, `${kind} '${refId}' was not found`))
    return false
  }
  if (refGameId !== gameId) {
    issues.push(
      errorIssue(path, `${kind} '${refId}' belongs to game '${refGameId}', not '${gameId}'`)
    )
    return false
  }
  return true
}

function assertFiniteNumber(value: unknown, path: string, issues: ContentIssue[]): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) {
    issues.push(errorIssue(path, `Expected a number, got ${JSON.stringify(value)}`))
    return undefined
  }
  return n
}

function assertIntOrder(value: unknown, path: string, issues: ContentIssue[]): number {
  const n = assertFiniteNumber(value, path, issues)
  if (n === undefined) {
    issues.push(errorIssue(path, 'order is required'))
    return 0
  }
  if (!Number.isInteger(n)) {
    issues.push(errorIssue(path, `order must be an integer, got ${n}`))
  }
  return n
}

export function validateWorld(
  pipeline: AssetPipelineProject,
  world: World,
  path = 'world'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  requireGame(pipeline, world.gameId)
  if (!String(world.name || '').trim()) {
    issues.push(errorIssue(`${path}.name`, 'World name is required'))
  }
  try {
    if (world.key) assertRecordKey(world.key, 'World')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  assertIntOrder(world.order, `${path}.order`, issues)
  try {
    assertKeyUnique(pipeline.worlds || [], world.gameId, world.key, world.id, 'World')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  if (world.map) {
    issues.push(...validateWorldMap(pipeline, world, `${path}.map`))
  }
  return issues
}

export function assertPos01(pos: unknown, path: string, issues: ContentIssue[]): [number, number] | undefined {
  if (!Array.isArray(pos) || pos.length !== 2) {
    issues.push(errorIssue(path, `pos must be [x, y] with values in 0..1`))
    return undefined
  }
  const x = Number(pos[0])
  const y = Number(pos[1])
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    issues.push(errorIssue(path, `pos must be within 0..1, got [${pos[0]}, ${pos[1]}]`))
    return undefined
  }
  return [x, y]
}

function pathPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function validateWorldMap(
  pipeline: AssetPipelineProject,
  world: World,
  path = 'world.map'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  const map = world.map
  if (!map) return issues
  const game = requireGame(pipeline, world.gameId)

  const asset = (pipeline.visualAssets || []).find((a) => a.id === map.backgroundAssetId)
  if (!asset) {
    issues.push(
      errorIssue(`${path}.backgroundAssetId`, `Visual asset '${map.backgroundAssetId}' was not found`)
    )
  } else if (
    assertSameGame(asset.gameId, world.gameId, 'Visual asset', asset.id, `${path}.backgroundAssetId`, issues)
  ) {
    if (!isBackgroundCategoryKey(asset.category, game)) {
      issues.push(
        errorIssue(
          `${path}.backgroundAssetId`,
          `Visual asset '${asset.name}' category '${asset.category}' is not a background-based category`
        )
      )
    }
  }

  const nodes: WorldMapNode[] = Array.isArray(map.nodes) ? map.nodes : []
  const nodeIds = new Set<string>()
  const stageToNode = new Map<string, string>()
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const p = `${path}.nodes[${i}]`
    const id = String(node?.id || '').trim()
    if (!id) issues.push(errorIssue(`${p}.id`, 'Map node id is required'))
    else if (nodeIds.has(id)) issues.push(errorIssue(`${p}.id`, `Duplicate map node id '${id}'`))
    else nodeIds.add(id)
    assertPos01(node?.pos, `${p}.pos`, issues)
    const stageId = String(node?.stageId || '').trim()
    if (!stageId) {
      issues.push(errorIssue(`${p}.stageId`, 'Map node stageId is required'))
      continue
    }
    const stage = (pipeline.stages || []).find((s) => s.id === stageId)
    if (!stage) {
      issues.push(errorIssue(`${p}.stageId`, `Stage '${stageId}' was not found`))
    } else if (assertSameGame(stage.gameId, world.gameId, 'Stage', stage.id, `${p}.stageId`, issues)) {
      if (stage.worldId !== world.id) {
        issues.push(
          errorIssue(`${p}.stageId`, `Stage '${stage.name}' belongs to another world, not '${world.name}'`)
        )
      }
      const prev = stageToNode.get(stage.id)
      if (prev && prev !== id) {
        issues.push(errorIssue(`${p}.stageId`, `Stage '${stage.name}' already has a map node ('${prev}')`))
      } else if (id) {
        stageToNode.set(stage.id, id)
      }
    }
  }

  if (nodes.length > 0) {
    const start = String(map.startNodeId || '').trim()
    if (!start) {
      issues.push(errorIssue(`${path}.startNodeId`, 'startNodeId is required once the map has a node'))
    } else if (!nodeIds.has(start)) {
      issues.push(errorIssue(`${path}.startNodeId`, `startNodeId '${start}' is not a node on this map`))
    } else {
      const startNode = nodes.find((n) => n.id === start)
      const startStage = (pipeline.stages || []).find((s) => s.id === startNode?.stageId)
      if (startStage && Array.isArray(startStage.unlockAfter) && startStage.unlockAfter.length > 0) {
        issues.push(
          errorIssue(
            `${path}.startNodeId`,
            `Start node's stage '${startStage.name}' cannot have unlockAfter rules`
          )
        )
      }
    }
  }

  const paths: WorldMapPath[] = Array.isArray(map.paths) ? map.paths : []
  const pathIds = new Set<string>()
  const pairs = new Set<string>()
  for (let i = 0; i < paths.length; i++) {
    const edge = paths[i]
    const p = `${path}.paths[${i}]`
    const id = String(edge?.id || '').trim()
    if (!id) issues.push(errorIssue(`${p}.id`, 'Map path id is required'))
    else if (pathIds.has(id)) issues.push(errorIssue(`${p}.id`, `Duplicate map path id '${id}'`))
    else pathIds.add(id)
    const from = String(edge?.from || '').trim()
    const to = String(edge?.to || '').trim()
    if (!from || !nodeIds.has(from)) issues.push(errorIssue(`${p}.from`, `Unknown map node '${from}'`))
    if (!to || !nodeIds.has(to)) issues.push(errorIssue(`${p}.to`, `Unknown map node '${to}'`))
    if (from && to && from === to) {
      issues.push(errorIssue(p, 'Path from and to must be different nodes'))
    } else if (from && to) {
      const pair = pathPairKey(from, to)
      if (pairs.has(pair)) {
        issues.push(errorIssue(p, `Duplicate path between '${from}' and '${to}' (paths are two-way)`))
      } else {
        pairs.add(pair)
      }
    }
    const waypoints = edge?.waypoints
    if (waypoints !== undefined) {
      if (!Array.isArray(waypoints)) {
        issues.push(errorIssue(`${p}.waypoints`, 'waypoints must be an array of [x, y]'))
      } else {
        for (let w = 0; w < waypoints.length; w++) {
          assertPos01(waypoints[w], `${p}.waypoints[${w}]`, issues)
        }
      }
    }
  }

  return issues
}

export function findUnlockCycle(stages: Stage[]): string[] | null {
  const ids = new Set(stages.map((s) => s.id))
  const graph = new Map<string, string[]>()
  for (const s of stages) {
    graph.set(
      s.id,
      (s.unlockAfter || []).filter((id) => typeof id === 'string' && ids.has(id))
    )
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  const dfs = (id: string): string[] | null => {
    if (visiting.has(id)) {
      const i = stack.indexOf(id)
      return stack.slice(i).concat(id)
    }
    if (visited.has(id)) return null
    visiting.add(id)
    stack.push(id)
    for (const next of graph.get(id) || []) {
      const cycle = dfs(next)
      if (cycle) return cycle
    }
    stack.pop()
    visiting.delete(id)
    visited.add(id)
    return null
  }
  for (const s of stages) {
    const cycle = dfs(s.id)
    if (cycle) return cycle
  }
  return null
}

export function validateStage(
  pipeline: AssetPipelineProject,
  stage: Stage,
  path = 'stage'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  requireGame(pipeline, stage.gameId)
  if (!String(stage.name || '').trim()) {
    issues.push(errorIssue(`${path}.name`, 'Stage name is required'))
  }
  try {
    if (stage.key) assertRecordKey(stage.key, 'Stage')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  assertIntOrder(stage.order, `${path}.order`, issues)
  const world = (pipeline.worlds || []).find((w) => w.id === stage.worldId)
  if (!world) {
    issues.push(errorIssue(`${path}.worldId`, `World '${stage.worldId}' was not found`))
  } else {
    assertSameGame(world.gameId, stage.gameId, 'World', world.id, `${path}.worldId`, issues)
  }
  if (stage.recommendedLevel !== undefined) {
    const n = assertFiniteNumber(stage.recommendedLevel, `${path}.recommendedLevel`, issues)
    if (n !== undefined && n < 0) {
      issues.push(errorIssue(`${path}.recommendedLevel`, 'recommendedLevel must be >= 0'))
    }
  }
  try {
    assertKeyUnique(pipeline.stages || [], stage.gameId, stage.key, stage.id, 'Stage')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }

  const worldStages = world ? stagesOf(pipeline, stage.gameId, world.id) : []
  const unlockAfter = Array.isArray(stage.unlockAfter) ? stage.unlockAfter : undefined
  if (unlockAfter) {
    const seen = new Set<string>()
    for (let i = 0; i < unlockAfter.length; i++) {
      const id = String(unlockAfter[i] || '').trim()
      const p = `${path}.unlockAfter[${i}]`
      if (!id) {
        issues.push(errorIssue(p, 'unlockAfter id is required'))
        continue
      }
      if (id === stage.id) {
        issues.push(errorIssue(p, 'A stage cannot unlock after itself'))
        continue
      }
      if (seen.has(id)) {
        issues.push(errorIssue(p, `Duplicate unlockAfter '${id}'`))
        continue
      }
      seen.add(id)
      const other = (pipeline.stages || []).find((s) => s.id === id)
      if (!other) {
        issues.push(errorIssue(p, `Stage '${id}' was not found`))
      } else if (assertSameGame(other.gameId, stage.gameId, 'Stage', other.id, p, issues)) {
        if (!world || other.worldId !== world.id) {
          issues.push(errorIssue(p, `unlockAfter stages must belong to the same world`))
        }
      }
    }
    if (world) {
      const merged = worldStages.map((s) => (s.id === stage.id ? stage : s))
      const cycle = findUnlockCycle(merged)
      if (cycle) {
        issues.push(
          errorIssue(
            `${path}.unlockAfter`,
            `unlockAfter cycle refused: ${cycle.join(' → ')}`
          )
        )
      }
    }
  }

  if (world?.map?.startNodeId) {
    const startNode = (world.map.nodes || []).find((n) => n.id === world.map!.startNodeId)
    if (startNode?.stageId === stage.id && unlockAfter && unlockAfter.length > 0) {
      issues.push(
        errorIssue(`${path}.unlockAfter`, `The start node's stage cannot have unlockAfter rules`)
      )
    }
  }

  const clearedBy = Array.isArray(stage.clearedBy) ? stage.clearedBy : undefined
  if (clearedBy) {
    const seen = new Set<string>()
    for (let i = 0; i < clearedBy.length; i++) {
      const id = String(clearedBy[i] || '').trim()
      const p = `${path}.clearedBy[${i}]`
      if (!id) {
        issues.push(errorIssue(p, 'clearedBy id is required'))
        continue
      }
      if (seen.has(id)) {
        issues.push(errorIssue(p, `Duplicate clearedBy '${id}'`))
        continue
      }
      seen.add(id)
      const enc = (pipeline.encounters || []).find((e) => e.id === id)
      if (!enc) {
        issues.push(errorIssue(p, `Encounter '${id}' was not found`))
      } else if (assertSameGame(enc.gameId, stage.gameId, 'Encounter', enc.id, p, issues)) {
        if (enc.stageId !== stage.id) {
          issues.push(errorIssue(p, `clearedBy encounters must belong to this stage`))
        }
      }
    }
  }

  if (stage.entryRegionId) {
    const region = (pipeline.regions || []).find((r) => r.id === stage.entryRegionId)
    if (!region) {
      issues.push(errorIssue(`${path}.entryRegionId`, `Region '${stage.entryRegionId}' was not found`))
    } else if (
      assertSameGame(region.gameId, stage.gameId, 'Region', region.id, `${path}.entryRegionId`, issues)
    ) {
      if (region.stageId !== stage.id) {
        issues.push(
          errorIssue(`${path}.entryRegionId`, `Entry region '${region.name}' belongs to another stage`)
        )
      } else if (stage.entryAnchor) {
        const anchors = new Set((region.anchors || []).map((a) => a.id))
        if (!anchors.has(stage.entryAnchor)) {
          issues.push(
            errorIssue(
              `${path}.entryAnchor`,
              `Anchor '${stage.entryAnchor}' does not exist on region '${region.name}'`
            )
          )
        }
      }
    }
  } else if (stage.entryAnchor) {
    issues.push(errorIssue(`${path}.entryAnchor`, 'entryAnchor requires entryRegionId'))
  }

  if (stage.returnToNode) {
    const map: WorldMap | undefined = world?.map
    const node = (map?.nodes || []).find((n) => n.id === stage.returnToNode)
    if (!node) {
      issues.push(
        errorIssue(
          `${path}.returnToNode`,
          `returnToNode '${stage.returnToNode}' is not a node on this world's map`
        )
      )
    }
  }

  return issues
}

function validateStars(
  stars: EncounterStar[] | undefined,
  moduleStarKinds: string[] | undefined,
  path: string,
  issues: ContentIssue[]
): EncounterStar[] {
  const list = Array.isArray(stars) ? stars : []
  if (list.length > MAX_ENCOUNTER_STARS) {
    issues.push(
      errorIssue(path, `Encounter may have at most ${MAX_ENCOUNTER_STARS} stars, got ${list.length}`)
    )
  }
  const ids = new Set<string>()
  const listedKinds = Array.isArray(moduleStarKinds) && moduleStarKinds.length > 0 ? moduleStarKinds : null
  for (let i = 0; i < list.length; i++) {
    const star = list[i]
    const p = `${path}[${i}]`
    const id = String(star?.id || '').trim()
    if (!id) issues.push(errorIssue(`${p}.id`, 'Star id is required'))
    else if (ids.has(id)) issues.push(errorIssue(`${p}.id`, `Duplicate star id '${id}'`))
    else ids.add(id)
    if (!String(star?.label || '').trim()) {
      issues.push(errorIssue(`${p}.label`, 'Star label is required'))
    }
    const kind = String(star?.kind || '').trim()
    if (!kind) issues.push(errorIssue(`${p}.kind`, 'Star kind is required'))
    else if (listedKinds && !listedKinds.includes(kind)) {
      issues.push(
        errorIssue(
          `${p}.kind`,
          `Star kind '${kind}' is not in this module's starKinds (${listedKinds.join(', ')})`
        )
      )
    }
  }
  return list
}

function resolveSceneId(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string,
  path: string,
  issues: ContentIssue[]
): string | undefined {
  const value = String(raw || '').trim()
  if (!value) return undefined
  const scenes = (pipeline.scenes || []).filter((s) => s.gameId === gameId)
  const key = value.startsWith('@') ? normalizeRecordKey(value.slice(1)) : undefined
  const found =
    scenes.find((s) => s.id === value) ||
    (key ? scenes.find((s) => s.key === key) : undefined) ||
    scenes.find((s) => s.key === value) ||
    scenes.find((s) => s.name === value)
  if (!found) {
    const other = (pipeline.scenes || []).find((s) => s.id === value || s.key === value || s.name === value)
    if (other && other.gameId !== gameId) {
      issues.push(
        errorIssue(path, `Scene '${value}' belongs to game '${other.gameId}', not '${gameId}'`)
      )
    } else {
      issues.push(errorIssue(path, `Scene '${value}' was not found in this game`))
    }
    return undefined
  }
  return found.id
}

function resolveTuningProfileId(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string,
  path: string,
  issues: ContentIssue[]
): string | undefined {
  const value = String(raw || '').trim()
  if (!value) return undefined
  const def = (pipeline.gameDefinitions || []).find((d) => d.gameId === gameId)
  const profiles = def?.tuningProfiles || []
  const found = profiles.find((p) => p.id === value) || profiles.find((p) => p.name === value)
  if (!found) {
    issues.push(
      errorIssue(
        path,
        `tuningProfileId '${value}' is not a row in this game's Game Definition tuningProfiles`
      )
    )
    return undefined
  }
  return found.id
}

export function validateEncounter(
  pipeline: AssetPipelineProject,
  encounter: Encounter,
  path = 'encounter'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  const game = requireGame(pipeline, encounter.gameId)
  if (!String(encounter.name || '').trim()) {
    issues.push(errorIssue(`${path}.name`, 'Encounter name is required'))
  }
  try {
    if (encounter.key) assertRecordKey(encounter.key, 'Encounter')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  assertIntOrder(encounter.order, `${path}.order`, issues)

  const stage = (pipeline.stages || []).find((s) => s.id === encounter.stageId)
  if (!stage) {
    issues.push(errorIssue(`${path}.stageId`, `Stage '${encounter.stageId}' was not found`))
  } else {
    assertSameGame(stage.gameId, encounter.gameId, 'Stage', stage.id, `${path}.stageId`, issues)
  }

  let typeId = encounter.typeId
  let mod = undefined as ReturnType<typeof assertKnownModule> | undefined
  try {
    typeId = assertKnownEncounterType(encounter.typeId, game)
  } catch (err) {
    issues.push(errorIssue(`${path}.typeId`, err instanceof Error ? err.message : String(err)))
  }
  try {
    mod = assertKnownModule(encounter.moduleId, typeId || encounter.typeId, game)
  } catch (err) {
    issues.push(errorIssue(`${path}.moduleId`, err instanceof Error ? err.message : String(err)))
  }

  if (encounter.sceneId) {
    resolveSceneId(pipeline, encounter.gameId, encounter.sceneId, `${path}.sceneId`, issues)
  }
  if (encounter.tuningProfileId) {
    resolveTuningProfileId(
      pipeline,
      encounter.gameId,
      encounter.tuningProfileId,
      `${path}.tuningProfileId`,
      issues
    )
  }
  // difficultyProfileId is stored and not checked until step 2.
  if (encounter.recommendedLevel !== undefined) {
    const n = assertFiniteNumber(encounter.recommendedLevel, `${path}.recommendedLevel`, issues)
    if (n !== undefined && n < 0) {
      issues.push(errorIssue(`${path}.recommendedLevel`, 'recommendedLevel must be >= 0'))
    }
  }

  validateStars(encounter.stars, mod?.starKinds, `${path}.stars`, issues)

  try {
    assertKeyUnique(pipeline.encounters || [], encounter.gameId, encounter.key, encounter.id, 'Encounter')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }

  return issues
}

function parseEdge(
  edge: RegionEdge,
  path: string,
  issues: ContentIssue[]
): { from: string; to: string; requires?: string; hint?: string } | null {
  if (Array.isArray(edge)) {
    if (edge.length !== 2 || typeof edge[0] !== 'string' || typeof edge[1] !== 'string') {
      issues.push(errorIssue(path, 'Edge tuple must be [from, to]'))
      return null
    }
    return { from: edge[0], to: edge[1] }
  }
  if (!edge || typeof edge !== 'object') {
    issues.push(errorIssue(path, 'Edge must be [a, b] or { from, to, requires?, hint? }'))
    return null
  }
  const from = String(edge.from || '').trim()
  const to = String(edge.to || '').trim()
  if (!from || !to) {
    issues.push(errorIssue(path, 'Edge { from, to } requires both ends'))
    return null
  }
  const parsed: { from: string; to: string; requires?: string; hint?: string } = { from, to }
  if (edge.hint) parsed.hint = String(edge.hint)
  if (edge.requires !== undefined && edge.requires !== null && String(edge.requires).trim() !== '') {
    parsed.requires = String(edge.requires)
    issues.push(
      warningIssue(
        `${path}.requires`,
        `Edge requires '${parsed.requires}' is stored but ignored until vehicles (step 5)`
      )
    )
  }
  return parsed
}

function assertAnchorPos(pos: unknown, path: string, issues: ContentIssue[]): [number, number] | undefined {
  return assertPos01(pos, path, issues)
}

export function validateRegion(
  pipeline: AssetPipelineProject,
  region: Region,
  path = 'region'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  const game = requireGame(pipeline, region.gameId)
  if (!String(region.name || '').trim()) {
    issues.push(errorIssue(`${path}.name`, 'Region name is required'))
  }
  try {
    if (region.key) assertRecordKey(region.key, 'Region')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }

  if (region.stageId) {
    const stage = (pipeline.stages || []).find((s) => s.id === region.stageId)
    if (!stage) {
      issues.push(errorIssue(`${path}.stageId`, `Stage '${region.stageId}' was not found`))
    } else {
      assertSameGame(stage.gameId, region.gameId, 'Stage', stage.id, `${path}.stageId`, issues)
    }
  }

  const asset = (pipeline.visualAssets || []).find((a) => a.id === region.backgroundAssetId)
  if (!asset) {
    issues.push(
      errorIssue(`${path}.backgroundAssetId`, `Visual asset '${region.backgroundAssetId}' was not found`)
    )
  } else if (!assertSameGame(asset.gameId, region.gameId, 'Visual asset', asset.id, `${path}.backgroundAssetId`, issues)) {
    // already recorded
  } else if (!isBackgroundCategoryKey(asset.category, game)) {
    issues.push(
      errorIssue(
        `${path}.backgroundAssetId`,
        `Visual asset '${asset.name}' category '${asset.category}' is not a background-based category`
      )
    )
  }

  const anchors = Array.isArray(region.anchors) ? region.anchors : []
  const anchorIds = new Set<string>()
  for (let i = 0; i < anchors.length; i++) {
    const a: RegionAnchor = anchors[i]
    const id = String(a?.id || '').trim()
    const p = `${path}.anchors[${i}]`
    if (!id) issues.push(errorIssue(`${p}.id`, 'Anchor id is required'))
    else if (anchorIds.has(id)) issues.push(errorIssue(`${p}.id`, `Duplicate anchor id '${id}'`))
    else anchorIds.add(id)
    assertAnchorPos(a?.pos, `${p}.pos`, issues)
  }

  const hasAnchor = (id: string, p: string) => {
    if (!anchorIds.has(id)) {
      issues.push(errorIssue(p, `Unknown anchor '${id}'`))
      return false
    }
    return true
  }

  const spawn = String(region.spawn || '').trim()
  if (!spawn) issues.push(errorIssue(`${path}.spawn`, 'Region spawn anchor is required'))
  else hasAnchor(spawn, `${path}.spawn`)

  const edges = Array.isArray(region.edges) ? region.edges : []
  for (let i = 0; i < edges.length; i++) {
    const parsed = parseEdge(edges[i], `${path}.edges[${i}]`, issues)
    if (!parsed) continue
    hasAnchor(parsed.from, `${path}.edges[${i}].from`)
    hasAnchor(parsed.to, `${path}.edges[${i}].to`)
  }

  const hotspots: RegionHotspot[] = Array.isArray(region.hotspots) ? region.hotspots : []
  const hotspotIds = new Set<string>()
  for (let i = 0; i < hotspots.length; i++) {
    const hs = hotspots[i]
    const p = `${path}.hotspots[${i}]`
    const id = String(hs?.id || '').trim()
    if (!id) issues.push(errorIssue(`${p}.id`, 'Hotspot id is required'))
    else if (hotspotIds.has(id)) issues.push(errorIssue(`${p}.id`, `Duplicate hotspot id '${id}'`))
    else hotspotIds.add(id)
    if (!String(hs?.prompt || '').trim()) issues.push(errorIssue(`${p}.prompt`, 'Hotspot prompt is required'))
    hasAnchor(String(hs?.anchor || ''), `${p}.anchor`)
    // triggerId stored, not checked until step 3
    if (hs?.encounterId) {
      if (!region.stageId) {
        issues.push(
          errorIssue(`${p}.encounterId`, 'A region with no stage cannot link an encounter')
        )
      } else {
        const enc = (pipeline.encounters || []).find((e) => e.id === hs.encounterId)
        if (!enc) {
          issues.push(errorIssue(`${p}.encounterId`, `Encounter '${hs.encounterId}' was not found`))
        } else if (
          assertSameGame(enc.gameId, region.gameId, 'Encounter', enc.id, `${p}.encounterId`, issues)
        ) {
          if (enc.stageId !== region.stageId) {
            issues.push(
              errorIssue(`${p}.encounterId`, `Encounter '${enc.name}' belongs to another stage`)
            )
          }
        }
      }
    }
  }

  const exits: RegionExit[] = Array.isArray(region.exits) ? region.exits : []
  const exitIds = new Set<string>()
  for (let i = 0; i < exits.length; i++) {
    const ex = exits[i]
    const p = `${path}.exits[${i}]`
    const id = String(ex?.id || '').trim()
    if (!id) issues.push(errorIssue(`${p}.id`, 'Exit id is required'))
    else if (exitIds.has(id)) issues.push(errorIssue(`${p}.id`, `Duplicate exit id '${id}'`))
    else exitIds.add(id)
    hasAnchor(String(ex?.anchor || ''), `${p}.anchor`)
    const toWorldMap = Boolean(ex.toWorldMap)
    const toRegionId = String(ex.toRegionId || '').trim()
    if (toWorldMap && toRegionId) {
      issues.push(errorIssue(p, 'An exit has either toRegionId or toWorldMap: true, never both'))
    } else if (toWorldMap) {
      // return to the world map
    } else if (!toRegionId) {
      issues.push(errorIssue(`${p}.toRegionId`, 'Exit needs toRegionId or toWorldMap: true'))
    } else {
      const target = (pipeline.regions || []).find((r) => r.id === toRegionId)
      if (!target) {
        issues.push(errorIssue(`${p}.toRegionId`, `Region '${toRegionId}' was not found`))
      } else if (assertSameGame(target.gameId, region.gameId, 'Region', target.id, `${p}.toRegionId`, issues)) {
        if (ex.toAnchor) {
          const targetAnchors = new Set((target.anchors || []).map((a) => a.id))
          if (!targetAnchors.has(ex.toAnchor)) {
            issues.push(
              errorIssue(`${p}.toAnchor`, `Anchor '${ex.toAnchor}' does not exist on region '${target.name}'`)
            )
          }
        }
      }
    }
  }

  try {
    assertKeyUnique(pipeline.regions || [], region.gameId, region.key, region.id, 'Region')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }

  return issues
}

export function collectWorldUsers(pipeline: AssetPipelineProject, worldId: string): NamedUser[] {
  return (pipeline.stages || [])
    .filter((s) => s.worldId === worldId)
    .map((s) => ({ id: s.id, name: s.name, kind: 'stage' }))
}

export function collectStageUsers(pipeline: AssetPipelineProject, stageId: string): NamedUser[] {
  const users: NamedUser[] = []
  for (const e of pipeline.encounters || []) {
    if (e.stageId === stageId) users.push({ id: e.id, name: e.name, kind: 'encounter' })
  }
  for (const r of pipeline.regions || []) {
    if (r.stageId === stageId) users.push({ id: r.id, name: r.name, kind: 'region' })
  }
  for (const w of pipeline.worlds || []) {
    for (const node of w.map?.nodes || []) {
      if (node.stageId === stageId) {
        users.push({ id: w.id, name: `${w.name} map node ${node.id}`, kind: 'world' })
      }
    }
  }
  for (const s of pipeline.stages || []) {
    if (s.id === stageId) continue
    if ((s.unlockAfter || []).includes(stageId)) {
      users.push({ id: s.id, name: `${s.name} unlockAfter`, kind: 'stage' })
    }
  }
  return users
}

export function collectEncounterUsers(pipeline: AssetPipelineProject, encounterId: string): NamedUser[] {
  const users: NamedUser[] = []
  for (const r of pipeline.regions || []) {
    for (const hs of r.hotspots || []) {
      if (hs.encounterId === encounterId) {
        users.push({ id: r.id, name: `${r.name} hotspot ${hs.id}`, kind: 'region' })
      }
    }
  }
  for (const s of pipeline.stages || []) {
    if ((s.clearedBy || []).includes(encounterId)) {
      users.push({ id: s.id, name: `${s.name} clearedBy`, kind: 'stage' })
    }
  }
  return users
}

export function collectRegionUsers(pipeline: AssetPipelineProject, regionId: string): NamedUser[] {
  const users: NamedUser[] = []
  for (const r of pipeline.regions || []) {
    if (r.id === regionId) continue
    for (const ex of r.exits || []) {
      if (ex.toRegionId === regionId) {
        users.push({ id: r.id, name: `${r.name} exit ${ex.id}`, kind: 'region' })
      }
    }
  }
  for (const s of pipeline.stages || []) {
    if (s.entryRegionId === regionId) {
      users.push({ id: s.id, name: `${s.name} entry region`, kind: 'stage' })
    }
  }
  return users
}

export function mapNodeForStage(world: World | undefined, stageId: string): WorldMapNode | undefined {
  return (world?.map?.nodes || []).find((n) => n.stageId === stageId)
}

export { pathPairKey }

export { resolveSceneId, resolveTuningProfileId }
