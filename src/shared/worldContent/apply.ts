/**
 * All-or-nothing content apply. Matches by key (create if new, update if found).
 * @key aliases resolve within the file or to existing records of the field's type.
 */

import type {
  AssetPipelineProject,
  Encounter,
  EncounterStar,
  Region,
  RegionEdge,
  Stage,
  World
} from '../types/assetPipeline'
import { requireGame } from './scope'
import {
  ContentApplyError,
  errorIssue,
  type ContentIssue
} from './issues'
import { aliasKey, assertRecordKey, isAliasRef, nowIso } from './keys'
import {
  RECORD_SCHEMA_VERSION,
  encountersOf,
  regionsOf,
  stagesOf,
  validateEncounter,
  validateRegion,
  validateStage,
  validateWorld,
  worldsOf
} from './validate'
import { resolveSceneId, resolveTuningProfileId } from './validate'

export interface ContentBundle {
  worlds?: Record<string, unknown>[]
  stages?: Record<string, unknown>[]
  encounters?: Record<string, unknown>[]
  regions?: Record<string, unknown>[]
}

export type ApplyAction = 'create' | 'update' | 'unchanged'

export interface ApplyRecordResult {
  type: 'world' | 'stage' | 'encounter' | 'region'
  action: ApplyAction
  id: string
  key?: string
  name?: string
}

export interface ApplyResult {
  aliasMap: Record<string, string>
  creates: ApplyRecordResult[]
  updates: ApplyRecordResult[]
  unchanged: ApplyRecordResult[]
  issues: ContentIssue[]
  written: boolean
}

function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function clonePipeline(pipeline: AssetPipelineProject): AssetPipelineProject {
  return JSON.parse(JSON.stringify(pipeline)) as AssetPipelineProject
}

function seedAliasMap(pipeline: AssetPipelineProject, gameId: string): Record<string, string> {
  const map: Record<string, string> = {}
  const add = (kind: string, key: string | undefined, id: string) => {
    if (!key) return
    map[`@${kind}:${key}`] = id
    // Unprefixed @key is convenient when keys don't collide across types.
    if (!map[`@${key}`]) map[`@${key}`] = id
  }
  for (const w of worldsOf(pipeline, gameId)) add('world', w.key, w.id)
  for (const s of stagesOf(pipeline, gameId)) add('stage', s.key, s.id)
  for (const e of encountersOf(pipeline, gameId)) add('encounter', e.key, e.id)
  for (const r of regionsOf(pipeline, gameId)) add('region', r.key, r.id)
  for (const a of (pipeline.visualAssets || []).filter((x) => x.gameId === gameId)) {
    add('asset', a.key, a.id)
  }
  for (const sc of (pipeline.scenes || []).filter((x) => x.gameId === gameId)) {
    add('scene', sc.key, sc.id)
  }
  return map
}

function lookupAlias(
  map: Record<string, string>,
  raw: string,
  kind: string
): string | undefined {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return undefined
  if (isAliasRef(trimmed)) {
    const key = aliasKey(trimmed)
    return map[`@${kind}:${key}`] || map[`@${key}`]
  }
  return undefined
}

function stableRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableRecord)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const skip = new Set(['createdAt', 'updatedAt', 'schemaVersion'])
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(obj).sort()) {
      if (skip.has(k)) continue
      const v = obj[k]
      if (v === undefined) continue
      out[k] = stableRecord(v)
    }
    return out
  }
  return value
}

function sameRecord(a: unknown, b: unknown): boolean {
  return JSON.stringify(stableRecord(a)) === JSON.stringify(stableRecord(b))
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

function optionalStr(value: unknown): string | undefined {
  const s = str(value)
  return s ? s : undefined
}

function num(value: unknown, fallback?: number): number | undefined {
  if (value === undefined || value === null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function nextOrder(items: { order: number }[]): number {
  if (items.length === 0) return 1
  return Math.max(...items.map((i) => i.order)) + 1
}

interface Planned {
  id: string
  key?: string
  existing: boolean
  input: Record<string, unknown>
  index: number
}

function planIncoming(
  kind: 'world' | 'stage' | 'encounter' | 'region',
  inputs: Record<string, unknown>[],
  existing: { id: string; key?: string; gameId: string }[],
  gameId: string,
  aliasMap: Record<string, string>,
  issues: ContentIssue[]
): Planned[] {
  const planned: Planned[] = []
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i] || {}
    const path = `${kind}s[${i}]`
    let key: string | undefined
    try {
      key = assertRecordKey(optionalStr(input.key), kind)
    } catch (err) {
      issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
    }
    const inGame = existing.filter((r) => r.gameId === gameId)
    let found =
      (optionalStr(input.id) ? inGame.find((r) => r.id === str(input.id)) : undefined) ||
      (key ? inGame.find((r) => r.key === key) : undefined)
    const id = found?.id || (isUuidish(str(input.id)) ? str(input.id) : newId())
    if (key) {
      aliasMap[`@${kind}:${key}`] = id
      aliasMap[`@${key}`] = id
    }
    planned.push({ id, key, existing: Boolean(found), input, index: i })
  }
  return planned
}

function isUuidish(raw: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
}

function resolveBackgroundAsset(
  raw: unknown,
  gameId: string,
  pipeline: AssetPipelineProject,
  aliasMap: Record<string, string>,
  path: string,
  issues: ContentIssue[]
): string | undefined {
  const value = optionalStr(raw)
  if (!value) {
    issues.push(errorIssue(path, 'backgroundAssetId is required'))
    return undefined
  }
  if (isAliasRef(value)) {
    const resolved = lookupAlias(aliasMap, value, 'asset')
    if (!resolved) {
      issues.push(errorIssue(path, `Unknown alias '${value}' for asset`))
      return undefined
    }
    return resolved
  }
  const assets = (pipeline.visualAssets || []).filter((a) => a.gameId === gameId)
  const found =
    assets.find((a) => a.id === value) ||
    assets.find((a) => a.key === value) ||
    assets.find((a) => a.name === value)
  if (!found) {
    issues.push(errorIssue(path, `Visual asset '${value}' was not found in this game`))
    return undefined
  }
  return found.id
}

function resolveTypedRef(
  raw: unknown,
  kind: 'world' | 'stage' | 'encounter' | 'region' | 'asset' | 'scene',
  aliasMap: Record<string, string>,
  path: string,
  issues: ContentIssue[],
  required: boolean
): string | undefined {
  const value = optionalStr(raw)
  if (!value) {
    if (required) issues.push(errorIssue(path, `${kind} id is required`))
    return undefined
  }
  if (isAliasRef(value)) {
    const resolved = lookupAlias(aliasMap, value, kind)
    if (!resolved) {
      issues.push(errorIssue(path, `Unknown alias '${value}' for ${kind}`))
      return undefined
    }
    return resolved
  }
  return value
}

function pushResult(
  result: ApplyResult,
  rec: ApplyRecordResult
): void {
  if (rec.action === 'create') result.creates.push(rec)
  else if (rec.action === 'update') result.updates.push(rec)
  else result.unchanged.push(rec)
}

function actionOf<T>(existing: T | undefined, next: T): ApplyAction {
  if (!existing) return 'create'
  return sameRecord(existing, next) ? 'unchanged' : 'update'
}

/**
 * Mutates `pipeline`. Throws ContentApplyError if any error-level issues.
 */
export function applyContentBundle(
  pipeline: AssetPipelineProject,
  gameId: string,
  bundle: ContentBundle
): ApplyResult {
  requireGame(pipeline, gameId)
  const issues: ContentIssue[] = []
  const aliasMap = seedAliasMap(pipeline, gameId)
  const now = nowIso()

  if (!pipeline.worlds) pipeline.worlds = []
  if (!pipeline.stages) pipeline.stages = []
  if (!pipeline.encounters) pipeline.encounters = []
  if (!pipeline.regions) pipeline.regions = []

  const worldPlan = planIncoming('world', bundle.worlds || [], pipeline.worlds, gameId, aliasMap, issues)
  const stagePlan = planIncoming('stage', bundle.stages || [], pipeline.stages, gameId, aliasMap, issues)
  const regionPlan = planIncoming('region', bundle.regions || [], pipeline.regions, gameId, aliasMap, issues)
  const encounterPlan = planIncoming(
    'encounter',
    bundle.encounters || [],
    pipeline.encounters,
    gameId,
    aliasMap,
    issues
  )

  // Assign region ids into the alias map before validating exits.
  for (const p of regionPlan) {
    if (p.key) {
      aliasMap[`@region:${p.key}`] = p.id
      aliasMap[`@${p.key}`] = p.id
    }
  }

  const result: ApplyResult = {
    aliasMap: { ...aliasMap },
    creates: [],
    updates: [],
    unchanged: [],
    issues: [],
    written: false
  }

  const nextWorlds: World[] = []
  for (const p of worldPlan) {
    const path = `worlds[${p.index}]`
    const existing = pipeline.worlds.find((w) => w.id === p.id)
    const world: World = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      order: num(p.input.order, existing?.order ?? nextOrder(worldsOf(pipeline, gameId))) ?? 1,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) world.key = key
    const description = optionalStr(p.input.description) ?? existing?.description
    if (description) world.description = description
    else if (p.input.description === null) delete world.description
    issues.push(...validateWorld({ ...pipeline, worlds: [...pipeline.worlds.filter((w) => w.id !== p.id), world] }, world, path))
    nextWorlds.push(world)
  }

  for (const w of nextWorlds) {
    const idx = pipeline.worlds.findIndex((x) => x.id === w.id)
    if (idx >= 0) pipeline.worlds[idx] = w
    else pipeline.worlds.push(w)
  }

  const nextStages: Stage[] = []
  for (const p of stagePlan) {
    const path = `stages[${p.index}]`
    const existing = pipeline.stages.find((s) => s.id === p.id)
    const worldId = resolveTypedRef(
      p.input.worldId ?? existing?.worldId,
      'world',
      aliasMap,
      `${path}.worldId`,
      issues,
      true
    )
    const stage: Stage = {
      id: p.id,
      gameId,
      worldId: worldId || existing?.worldId || '',
      name: str(p.input.name) || existing?.name || '',
      order:
        num(p.input.order, existing?.order ?? nextOrder(stagesOf(pipeline, gameId, worldId))) ?? 1,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) stage.key = key
    const recLevel = num(p.input.recommendedLevel, existing?.recommendedLevel)
    if (recLevel !== undefined) stage.recommendedLevel = recLevel
    if (p.input.optional !== undefined) stage.optional = Boolean(p.input.optional)
    else if (existing?.optional !== undefined) stage.optional = existing.optional
    issues.push(
      ...validateStage({ ...pipeline, stages: [...pipeline.stages.filter((s) => s.id !== p.id), stage] }, stage, path)
    )
    nextStages.push(stage)
  }
  for (const s of nextStages) {
    const idx = pipeline.stages.findIndex((x) => x.id === s.id)
    if (idx >= 0) pipeline.stages[idx] = s
    else pipeline.stages.push(s)
  }

  const nextRegions: Region[] = []
  for (const p of regionPlan) {
    const path = `regions[${p.index}]`
    const existing = pipeline.regions.find((r) => r.id === p.id)
    const stageId = resolveTypedRef(
      p.input.stageId ?? existing?.stageId,
      'stage',
      aliasMap,
      `${path}.stageId`,
      issues,
      false
    )
    const backgroundAssetId = resolveBackgroundAsset(
      p.input.backgroundAssetId ?? existing?.backgroundAssetId,
      gameId,
      pipeline,
      aliasMap,
      `${path}.backgroundAssetId`,
      issues
    ) || existing?.backgroundAssetId || ''

    const region: Region = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      backgroundAssetId,
      anchors: (p.input.anchors as Region['anchors']) || existing?.anchors || [],
      edges: (p.input.edges as RegionEdge[]) || existing?.edges || [],
      spawn: str(p.input.spawn) || existing?.spawn || '',
      hotspots: (p.input.hotspots as Region['hotspots']) || existing?.hotspots || [],
      exits: (p.input.exits as Region['exits']) || existing?.exits || [],
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) region.key = key
    if (stageId) region.stageId = stageId
    else if (existing?.stageId) region.stageId = existing.stageId

    region.exits = (region.exits || []).map((ex, ei) => {
      const to = resolveTypedRef(
        ex.toRegionId,
        'region',
        aliasMap,
        `${path}.exits[${ei}].toRegionId`,
        issues,
        true
      )
      return { ...ex, toRegionId: to || ex.toRegionId }
    })
    nextRegions.push(region)
  }
  for (const r of nextRegions) {
    const idx = pipeline.regions.findIndex((x) => x.id === r.id)
    if (idx >= 0) pipeline.regions[idx] = r
    else pipeline.regions.push(r)
  }
  for (const r of nextRegions) {
    const path = `regions[${regionPlan.find((p) => p.id === r.id)?.index ?? 0}]`
    issues.push(...validateRegion(pipeline, r, path))
  }

  const nextEncounters: Encounter[] = []
  for (const p of encounterPlan) {
    const path = `encounters[${p.index}]`
    const existing = pipeline.encounters.find((e) => e.id === p.id)
    const stageId = resolveTypedRef(
      p.input.stageId ?? existing?.stageId,
      'stage',
      aliasMap,
      `${path}.stageId`,
      issues,
      true
    )
    let sceneId = optionalStr(p.input.sceneId) ?? existing?.sceneId
    if (sceneId) {
      const aliased = lookupAlias(aliasMap, sceneId, 'scene')
      if (aliased) sceneId = aliased
      else {
        const resolved: string[] = []
        const tmpIssues: ContentIssue[] = []
        const id = resolveSceneId(pipeline, gameId, sceneId, `${path}.sceneId`, tmpIssues)
        if (id) {
          sceneId = id
        } else {
          issues.push(...tmpIssues)
        }
        void resolved
      }
    }
    let tuningProfileId = optionalStr(p.input.tuningProfileId) ?? existing?.tuningProfileId
    if (tuningProfileId) {
      const tmpIssues: ContentIssue[] = []
      const id = resolveTuningProfileId(pipeline, gameId, tuningProfileId, `${path}.tuningProfileId`, tmpIssues)
      if (id) tuningProfileId = id
      else issues.push(...tmpIssues)
    }

    const encounter: Encounter = {
      id: p.id,
      gameId,
      stageId: stageId || existing?.stageId || '',
      name: str(p.input.name) || existing?.name || '',
      typeId: str(p.input.typeId) || existing?.typeId || '',
      moduleId: str(p.input.moduleId) || existing?.moduleId || '',
      stars: (p.input.stars as EncounterStar[]) || existing?.stars || [],
      order:
        num(p.input.order, existing?.order ?? nextOrder(encountersOf(pipeline, gameId, stageId))) ?? 1,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) encounter.key = key
    if (sceneId) encounter.sceneId = sceneId
    if (tuningProfileId) encounter.tuningProfileId = tuningProfileId
    const difficulty = optionalStr(p.input.difficultyProfileId) ?? existing?.difficultyProfileId
    if (difficulty) encounter.difficultyProfileId = difficulty
    const recLevel = num(p.input.recommendedLevel, existing?.recommendedLevel)
    if (recLevel !== undefined) encounter.recommendedLevel = recLevel
    nextEncounters.push(encounter)
  }
  for (const e of nextEncounters) {
    const idx = pipeline.encounters.findIndex((x) => x.id === e.id)
    if (idx >= 0) pipeline.encounters[idx] = e
    else pipeline.encounters.push(e)
  }
  for (const e of nextEncounters) {
    const path = `encounters[${encounterPlan.find((p) => p.id === e.id)?.index ?? 0}]`
    issues.push(...validateEncounter(pipeline, e, path))
  }

  result.issues = issues
  result.aliasMap = { ...aliasMap }

  const errorIssues = issues.filter((i) => i.level === 'error')
  if (errorIssues.length > 0) {
    throw new ContentApplyError(issues)
  }

  const stamp = (existing: { createdAt: string; updatedAt: string } | undefined, rec: { createdAt: string; updatedAt: string }, changed: boolean) => {
    if (!changed && existing) {
      rec.createdAt = existing.createdAt
      rec.updatedAt = existing.updatedAt
    }
  }

  for (const p of worldPlan) {
    const rec = pipeline.worlds.find((w) => w.id === p.id)!
    const existing = p.existing
      ? { ...rec, ...(JSON.parse(JSON.stringify(rec)) as World) }
      : undefined
    // existing is post-mutation; capture from nextWorlds vs original via actionOf using pre-clone below
    void existing
    pushResult(result, {
      type: 'world',
      action: p.existing ? 'update' : 'create',
      id: rec.id,
      key: rec.key,
      name: rec.name
    })
    stamp(undefined, rec, true)
  }

  // Recompute create/update/unchanged against the input clone taken by the caller.
  // Here we only know "existed before this apply" via p.existing; the service
  // overwrites actions after comparing to the pre-apply snapshot.
  result.creates = []
  result.updates = []
  result.unchanged = []
  const pack = (
    type: ApplyRecordResult['type'],
    planned: Planned[],
    list: { id: string; key?: string; name: string; createdAt: string; updatedAt: string }[]
  ) => {
    for (const p of planned) {
      const rec = list.find((x) => x.id === p.id)!
      const action: ApplyAction = p.existing ? 'update' : 'create'
      pushResult(result, { type, action, id: rec.id, key: rec.key, name: rec.name })
    }
  }
  pack('world', worldPlan, pipeline.worlds)
  pack('stage', stagePlan, pipeline.stages)
  pack('region', regionPlan, pipeline.regions)
  pack('encounter', encounterPlan, pipeline.encounters)

  return result
}

/**
 * After a successful apply, mark records whose payload matches the pre-apply snapshot as unchanged.
 */
export function classifyApplyActions(
  before: AssetPipelineProject,
  after: AssetPipelineProject,
  result: ApplyResult
): ApplyResult {
  const lookup = {
    world: before.worlds || [],
    stage: before.stages || [],
    encounter: before.encounters || [],
    region: before.regions || []
  }
  const afterLookup = {
    world: after.worlds || [],
    stage: after.stages || [],
    encounter: after.encounters || [],
    region: after.regions || []
  }
  const all = [...result.creates, ...result.updates, ...result.unchanged]
  result.creates = []
  result.updates = []
  result.unchanged = []
  for (const rec of all) {
    const prev = lookup[rec.type].find((r) => r.id === rec.id)
    const next = afterLookup[rec.type].find((r) => r.id === rec.id)
    const action = actionOf(prev, next)
    if (action === 'unchanged' && next && prev) {
      next.createdAt = prev.createdAt
      next.updatedAt = prev.updatedAt
    }
    pushResult(result, { ...rec, action })
  }
  return result
}

export function applyContentBundleIsolated(
  pipeline: AssetPipelineProject,
  gameId: string,
  bundle: ContentBundle
): { pipeline: AssetPipelineProject; result: ApplyResult } {
  const before = clonePipeline(pipeline)
  const working = clonePipeline(pipeline)
  try {
    const raw = applyContentBundle(working, gameId, bundle)
    const result = classifyApplyActions(before, working, raw)
    return { pipeline: working, result }
  } catch (err) {
    if (err instanceof ContentApplyError) {
      throw err
    }
    throw err
  }
}

export { clonePipeline }
