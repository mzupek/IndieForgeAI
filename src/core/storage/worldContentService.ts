/**
 * World / Stage / Encounter / Region CRUD, content apply, content export.
 * Writes go through updateAssetPipeline (studio.json lock). List/show/export use readStudio.
 */

import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type {
  AssetPipelineProject,
  Encounter,
  EncounterEnemyLink,
  EncounterStar,
  AttackTable,
  DifficultyProfile,
  Enemy,
  Region,
  RegionEdge,
  Stage,
  World,
  WorldMap,
  WorldMapNode,
  WorldMapPath
} from '@shared/types/assetPipeline'
import { getAssetPipeline, readStudio, updateAssetPipeline } from './studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { assertRecordKey, nowIso } from '@shared/worldContent/keys'
import { formatInUseError } from '@shared/worldContent/issues'
import {
  RECORD_SCHEMA_VERSION,
  collectEncounterUsers,
  collectRegionUsers,
  collectStageUsers,
  collectWorldUsers,
  encountersOf,
  findByIdOrKey,
  regionsOf,
  requireIdOrKey,
  stagesOf,
  validateEncounter,
  validateRegion,
  validateStage,
  validateWorld,
  worldsOf
} from '@shared/worldContent/validate'
import { buildWorldFlow, type WorldFlow } from '@shared/worldContent/flow'
import { errorMessages, type ContentIssue } from '@shared/worldContent/issues'
import { bindCondition, bindEffects } from '@shared/story/conditions'
import {
  applyContentBundleIsolated,
  type ApplyResult,
  type ContentBundle
} from '@shared/worldContent/apply'
import { resolveSceneId, resolveTuningProfileId } from '@shared/worldContent/validate'
import { resolveEncounterEnemyLinks } from '@shared/worldContent/encounterLinks'
import { resolveDifficultyRef } from '@shared/difficulty/validate'
import { matchesCanonFilter } from '@shared/story/canon'

export const CONTENT_SCHEMA_VERSION = 1

export interface WriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
  canon?: string
}

function throwIssues(issues: ContentIssue[]): void {
  const errors = issues.filter((i) => i.level === 'error')
  if (errors.length) {
    throw new Error(errorMessages(issues))
  }
}

function warningsOf(issues: ContentIssue[]): ContentIssue[] {
  return issues.filter((i) => i.level === 'warning')
}

function nextOrder(items: { order: number }[]): number {
  if (items.length === 0) return 1
  return Math.max(...items.map((i) => i.order)) + 1
}

function resolveBackgroundAssetId(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string
): string {
  const value = String(raw || '').trim()
  if (!value) throw new Error('backgroundAssetId is required')
  const assets = (pipeline.visualAssets || []).filter((a) => a.gameId === gameId)
  if (value.startsWith('@')) {
    const key = value.slice(1).trim().toLowerCase()
    const found = assets.find((a) => a.key === key)
    if (!found) throw new Error(`Visual asset alias '@${key}' was not found in this game`)
    return found.id
  }
  const found = assets.find((a) => a.id === value) || assets.find((a) => a.key === value) || assets.find((a) => a.name === value)
  if (!found) throw new Error(`Visual asset '${value}' was not found in this game`)
  return found.id
}

async function mutatePipeline<T>(
  options: WriteOptions | undefined,
  mutator: (pipeline: AssetPipelineProject) => T
): Promise<{ value: T; warnings: ContentIssue[] }> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const warnings: ContentIssue[] = []
  const value = mutator(pipeline)
  if (!options?.dryRun) {
    await updateAssetPipeline(pipeline, options?.dataDirOverride)
  }
  return { value, warnings }
}

export async function listWorlds(gameId: string, dataDirOverride?: string): Promise<World[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  return worldsOf(pipeline, gameId).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

export async function listStages(
  gameId: string,
  worldId?: string,
  dataDirOverride?: string
): Promise<Stage[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  let worldFilter = worldId
  if (worldId) {
    const world = requireIdOrKey(pipeline.worlds || [], worldId, gameId, 'World')
    worldFilter = world.id
  }
  return stagesOf(pipeline, gameId, worldFilter).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

export async function listEncounters(
  gameId: string,
  stageId?: string,
  dataDirOverride?: string
): Promise<Encounter[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  let stageFilter = stageId
  if (stageId) {
    const stage = requireIdOrKey(pipeline.stages || [], stageId, gameId, 'Stage')
    stageFilter = stage.id
  }
  return encountersOf(pipeline, gameId, stageFilter).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

export async function listRegions(
  gameId: string,
  stageId?: string,
  dataDirOverride?: string
): Promise<Region[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  let stageFilter = stageId
  if (stageId) {
    const stage = requireIdOrKey(pipeline.stages || [], stageId, gameId, 'Stage')
    stageFilter = stage.id
  }
  return regionsOf(pipeline, gameId, stageFilter).sort((a, b) => a.name.localeCompare(b.name))
}

export async function showWorld(gameId: string, idOrKey: string, dataDirOverride?: string): Promise<World> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.worlds || [], idOrKey, gameId, 'World')
}

export async function showStage(gameId: string, idOrKey: string, dataDirOverride?: string): Promise<Stage> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.stages || [], idOrKey, gameId, 'Stage')
}

export async function showEncounter(gameId: string, idOrKey: string, dataDirOverride?: string): Promise<Encounter> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.encounters || [], idOrKey, gameId, 'Encounter')
}

export async function showRegion(gameId: string, idOrKey: string, dataDirOverride?: string): Promise<Region> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.regions || [], idOrKey, gameId, 'Region')
}

export interface WorldInput {
  name: string
  key?: string
  description?: string
  order?: number
}

export interface StageInput {
  worldId: string
  name: string
  key?: string
  order?: number
  recommendedLevel?: number
  optional?: boolean
  unlockAfter?: string[] | null
  unlockCondition?: import('@shared/types/assetPipeline').Condition | null
  clearedBy?: string[] | null
  entryRegionId?: string | null
  entryAnchor?: string | null
  returnToNode?: string | null
}

export interface EncounterInput {
  stageId: string
  name: string
  typeId: string
  moduleId: string
  key?: string
  sceneId?: string
  tuningProfileId?: string
  difficultyProfileId?: string | null
  enemies?: EncounterEnemyLink[] | null
  onWin?: import('@shared/types/assetPipeline').Effect[] | null
  onLose?: import('@shared/types/assetPipeline').Effect[] | null
  recommendedLevel?: number
  stars?: EncounterStar[]
  order?: number
}

export interface RegionInput {
  name: string
  backgroundAssetId: string
  anchors: Region['anchors']
  edges: RegionEdge[]
  spawn: string
  hotspots: Region['hotspots']
  exits: Region['exits']
  key?: string
  stageId?: string
}

function newId(): string {
  return globalThis.crypto.randomUUID()
}

function resolveRegionLinkRefs(pipeline: AssetPipelineProject, gameId: string, region: Region): void {
  region.hotspots = (region.hotspots || []).map((hs) => {
    let next = hs
    if (hs.encounterId) {
      const enc = requireIdOrKey(pipeline.encounters || [], hs.encounterId, gameId, 'Encounter')
      next = { ...next, encounterId: enc.id }
    }
    if (hs.triggerId) {
      const trigger = requireIdOrKey(pipeline.triggers || [], hs.triggerId, gameId, 'Trigger')
      next = { ...next, triggerId: trigger.id }
    }
    return next
  })
  region.exits = (region.exits || []).map((ex) => {
    if (ex.toWorldMap || !ex.toRegionId) return ex
    const target = requireIdOrKey(pipeline.regions || [], ex.toRegionId, gameId, 'Region')
    return { ...ex, toRegionId: target.id }
  })
}

export async function createWorld(
  gameId: string,
  input: WorldInput,
  options?: WriteOptions
): Promise<{ record: World; warnings: ContentIssue[] }> {
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.worlds) pipeline.worlds = []
    const now = nowIso()
    const world: World = {
      id: newId(),
      gameId,
      name: String(input.name || '').trim(),
      order: input.order ?? nextOrder(worldsOf(pipeline, gameId)),
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now
    }
    const key = assertRecordKey(input.key, 'World')
    if (key) world.key = key
    if (input.description) world.description = input.description
    throwIssues(validateWorld(pipeline, world))
    if (options?.dryRun) return world
    pipeline.worlds.push(world)
    return world
  })
  return { record: value, warnings: [] }
}

export async function updateWorld(
  gameId: string,
  idOrKey: string,
  patch: Partial<WorldInput>,
  options?: WriteOptions
): Promise<{ record: World; warnings: ContentIssue[] }> {
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], idOrKey, gameId, 'World')
    if (patch.name !== undefined) world.name = String(patch.name).trim()
    if (patch.description !== undefined) {
      if (patch.description) world.description = patch.description
      else delete world.description
    }
    if (patch.order !== undefined) world.order = patch.order
    if (patch.key !== undefined) {
      const key = assertRecordKey(patch.key, 'World')
      if (key) world.key = key
      else delete world.key
    }
    world.updatedAt = nowIso()
    throwIssues(validateWorld(pipeline, world))
    return world
  })
  return { record: value, warnings: [] }
}

export async function removeWorld(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], idOrKey, gameId, 'World')
    const users = collectWorldUsers(pipeline, world.id)
    if (users.length > 0) throw new Error(formatInUseError('world', world.key || world.id, users))
    if (options?.dryRun) return world.id
    pipeline.worlds = (pipeline.worlds || []).filter((w) => w.id !== world.id)
    return world.id
  })
  return { removed: value }
}

export async function createStage(
  gameId: string,
  input: StageInput,
  options?: WriteOptions
): Promise<{ record: Stage; warnings: ContentIssue[] }> {
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.stages) pipeline.stages = []
    const world = requireIdOrKey(pipeline.worlds || [], input.worldId, gameId, 'World')
    const now = nowIso()
    const stage: Stage = {
      id: newId(),
      gameId,
      worldId: world.id,
      name: String(input.name || '').trim(),
      order: input.order ?? nextOrder(stagesOf(pipeline, gameId, world.id)),
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now
    }
    const key = assertRecordKey(input.key, 'Stage')
    if (key) stage.key = key
    if (input.recommendedLevel !== undefined) stage.recommendedLevel = input.recommendedLevel
    if (input.optional !== undefined) stage.optional = input.optional
    applyStageLinkPatch(pipeline, gameId, stage, input)
    throwIssues(validateStage(pipeline, stage))
    if (options?.dryRun) return stage
    pipeline.stages.push(stage)
    return stage
  })
  return { record: value, warnings: [] }
}

export async function updateStage(
  gameId: string,
  idOrKey: string,
  patch: Partial<StageInput>,
  options?: WriteOptions
): Promise<{ record: Stage; warnings: ContentIssue[] }> {
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const stage = requireIdOrKey(pipeline.stages || [], idOrKey, gameId, 'Stage')
    if (patch.worldId !== undefined) {
      const world = requireIdOrKey(pipeline.worlds || [], patch.worldId, gameId, 'World')
      stage.worldId = world.id
    }
    if (patch.name !== undefined) stage.name = String(patch.name).trim()
    if (patch.order !== undefined) stage.order = patch.order
    if (patch.recommendedLevel !== undefined) stage.recommendedLevel = patch.recommendedLevel
    if (patch.optional !== undefined) stage.optional = patch.optional
    if (patch.key !== undefined) {
      const key = assertRecordKey(patch.key, 'Stage')
      if (key) stage.key = key
      else delete stage.key
    }
    applyStageLinkPatch(pipeline, gameId, stage, patch)
    stage.updatedAt = nowIso()
    throwIssues(validateStage(pipeline, stage))
    return stage
  })
  return { record: value, warnings: [] }
}

function reorderScoped<T extends { id: string; key?: string; gameId: string; order: number; updatedAt: string }>(
  records: T[],
  gameId: string,
  kind: string,
  idsOrKeys: string[],
  inScope: (row: T) => boolean,
  dryRun: boolean | undefined,
  missingScopeMessage: (token: string) => string
): T[] {
  const current = records.filter((row) => row.gameId === gameId && inScope(row))
  const raw = (Array.isArray(idsOrKeys) ? idsOrKeys : []).map((token) => String(token || '').trim()).filter(Boolean)
  if (raw.length === 0) {
    if (current.length === 0) return []
    throw new Error(`Reorder list must include every ${kind.toLowerCase()} (got 0, expected ${current.length})`)
  }
  const resolved: T[] = []
  const seen = new Set<string>()
  for (const token of raw) {
    const row = requireIdOrKey(records, token, gameId, kind)
    if (!inScope(row)) throw new Error(missingScopeMessage(token))
    if (seen.has(row.id)) throw new Error(`Duplicate ${kind.toLowerCase()} '${token}' in reorder list`)
    seen.add(row.id)
    resolved.push(row)
  }
  const missing = current.filter((row) => !seen.has(row.id))
  if (missing.length > 0) {
    const labels = missing.map((row) => (row.key ? `@${row.key}` : row.id)).join(', ')
    throw new Error(`Reorder list is missing ${kind.toLowerCase()} '${labels}'`)
  }
  if (resolved.length !== current.length) {
    throw new Error(
      `Reorder list must include every ${kind.toLowerCase()} (got ${resolved.length}, expected ${current.length})`
    )
  }
  const now = nowIso()
  return resolved.map((row, i) => {
    if (!dryRun) {
      row.order = i + 1
      row.updatedAt = now
      return row
    }
    return { ...row, order: i + 1 }
  })
}

export async function reorderWorlds(
  gameId: string,
  idsOrKeys: string[],
  options?: WriteOptions
): Promise<{ records: World[] }> {
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    return reorderScoped(
      pipeline.worlds || [],
      gameId,
      'World',
      idsOrKeys,
      () => true,
      options?.dryRun,
      (token) => `World '${token}' is not in this game`
    )
  })
  return { records: value }
}

export async function reorderStages(
  gameId: string,
  worldIdOrKey: string,
  idsOrKeys: string[],
  options?: WriteOptions
): Promise<{ records: Stage[] }> {
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
    return reorderScoped(
      pipeline.stages || [],
      gameId,
      'Stage',
      idsOrKeys,
      (row) => row.worldId === world.id,
      options?.dryRun,
      (token) => `Stage '${token}' is not in this world`
    )
  })
  return { records: value }
}

function resolveStageIdList(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string[] | undefined | null,
  kind: 'stage' | 'encounter'
): string[] | undefined | null {
  if (raw === undefined) return undefined
  if (raw === null) return null
  const records = kind === 'stage' ? pipeline.stages || [] : pipeline.encounters || []
  const label = kind === 'stage' ? 'Stage' : 'Encounter'
  return raw.map((id) => requireIdOrKey(records, id, gameId, label).id)
}

function applyStageLinkPatch(
  pipeline: AssetPipelineProject,
  gameId: string,
  stage: Stage,
  patch: Partial<StageInput>
): void {
  if (patch.unlockAfter !== undefined) {
    const ids = resolveStageIdList(pipeline, gameId, patch.unlockAfter, 'stage')
    if (ids === null || (Array.isArray(ids) && ids.length === 0)) delete stage.unlockAfter
    else if (ids) stage.unlockAfter = ids
  }
  if (patch.clearedBy !== undefined) {
    const ids = resolveStageIdList(pipeline, gameId, patch.clearedBy, 'encounter')
    if (ids === null || (Array.isArray(ids) && ids.length === 0)) delete stage.clearedBy
    else if (ids) stage.clearedBy = ids
  }
  if (patch.unlockCondition !== undefined) {
    if (!patch.unlockCondition) delete stage.unlockCondition
    else stage.unlockCondition = bindCondition(pipeline, gameId, patch.unlockCondition)
  }
  if (patch.entryRegionId !== undefined) {
    if (!patch.entryRegionId) delete stage.entryRegionId
    else {
      const region = requireIdOrKey(pipeline.regions || [], patch.entryRegionId, gameId, 'Region')
      stage.entryRegionId = region.id
    }
  }
  if (patch.entryAnchor !== undefined) {
    if (!patch.entryAnchor) delete stage.entryAnchor
    else stage.entryAnchor = String(patch.entryAnchor).trim()
  }
  if (patch.returnToNode !== undefined) {
    if (!patch.returnToNode) delete stage.returnToNode
    else stage.returnToNode = String(patch.returnToNode).trim()
  }
}

export async function removeStage(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const stage = requireIdOrKey(pipeline.stages || [], idOrKey, gameId, 'Stage')
    const users = collectStageUsers(pipeline, stage.id)
    if (users.length > 0) throw new Error(formatInUseError('stage', stage.key || stage.id, users))
    if (options?.dryRun) return stage.id
    pipeline.stages = (pipeline.stages || []).filter((s) => s.id !== stage.id)
    return stage.id
  })
  return { removed: value }
}

function resolveEncounterRefs(
  pipeline: AssetPipelineProject,
  gameId: string,
  encounter: Encounter
): ContentIssue[] {
  const issues: ContentIssue[] = []
  if (encounter.sceneId) {
    const id = resolveSceneId(pipeline, gameId, encounter.sceneId, 'sceneId', issues)
    if (id) encounter.sceneId = id
  }
  if (encounter.tuningProfileId) {
    const id = resolveTuningProfileId(pipeline, gameId, encounter.tuningProfileId, 'tuningProfileId', issues)
    if (id) encounter.tuningProfileId = id
  }
  if (encounter.enemies) {
    encounter.enemies = resolveEncounterEnemyLinks(
      pipeline,
      gameId,
      encounter.enemies,
      'enemies',
      issues
    )
    if (encounter.enemies.length === 0) delete encounter.enemies
  }
  if (encounter.difficultyProfileId) {
    const resolved = resolveDifficultyRef(pipeline, gameId, encounter.difficultyProfileId)
    if (resolved.error || !resolved.id) {
      issues.push({
        level: 'error',
        path: 'difficultyProfileId',
        message: resolved.error || 'difficultyProfileId was not found'
      })
    } else {
      encounter.difficultyProfileId = resolved.id
    }
  }
  return issues
}

export async function createEncounter(
  gameId: string,
  input: EncounterInput,
  options?: WriteOptions
): Promise<{ record: Encounter; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.encounters) pipeline.encounters = []
    const stage = requireIdOrKey(pipeline.stages || [], input.stageId, gameId, 'Stage')
    const now = nowIso()
    const encounter: Encounter = {
      id: newId(),
      gameId,
      stageId: stage.id,
      name: String(input.name || '').trim(),
      typeId: String(input.typeId || '').trim(),
      moduleId: String(input.moduleId || '').trim(),
      stars: input.stars || [],
      order: input.order ?? nextOrder(encountersOf(pipeline, gameId, stage.id)),
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now
    }
    const key = assertRecordKey(input.key, 'Encounter')
    if (key) encounter.key = key
    if (input.sceneId) encounter.sceneId = input.sceneId
    if (input.tuningProfileId) encounter.tuningProfileId = input.tuningProfileId
    if (input.difficultyProfileId) encounter.difficultyProfileId = input.difficultyProfileId
    if (input.enemies && input.enemies.length) encounter.enemies = input.enemies
    if (input.onWin && input.onWin.length) encounter.onWin = bindEffects(pipeline, gameId, input.onWin)
    if (input.onLose && input.onLose.length) encounter.onLose = bindEffects(pipeline, gameId, input.onLose)
    if (input.recommendedLevel !== undefined) encounter.recommendedLevel = input.recommendedLevel
    const refIssues = resolveEncounterRefs(pipeline, gameId, encounter)
    const issues = [...refIssues, ...validateEncounter(pipeline, encounter)]
    throwIssues(issues)
    warnings = warningsOf(issues)
    if (options?.dryRun) return encounter
    pipeline.encounters.push(encounter)
    return encounter
  })
  return { record: value, warnings }
}

export async function updateEncounter(
  gameId: string,
  idOrKey: string,
  patch: Partial<EncounterInput>,
  options?: WriteOptions
): Promise<{ record: Encounter; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const encounter = requireIdOrKey(pipeline.encounters || [], idOrKey, gameId, 'Encounter')
    if (patch.stageId !== undefined) {
      const stage = requireIdOrKey(pipeline.stages || [], patch.stageId, gameId, 'Stage')
      encounter.stageId = stage.id
    }
    if (patch.name !== undefined) encounter.name = String(patch.name).trim()
    if (patch.typeId !== undefined) encounter.typeId = String(patch.typeId).trim()
    if (patch.moduleId !== undefined) encounter.moduleId = String(patch.moduleId).trim()
    if (patch.stars !== undefined) encounter.stars = patch.stars
    if (patch.order !== undefined) encounter.order = patch.order
    if (patch.recommendedLevel !== undefined) encounter.recommendedLevel = patch.recommendedLevel
    if (patch.difficultyProfileId !== undefined) {
      if (patch.difficultyProfileId) encounter.difficultyProfileId = patch.difficultyProfileId
      else delete encounter.difficultyProfileId
    }
    if (patch.enemies !== undefined) {
      if (patch.enemies && patch.enemies.length) encounter.enemies = patch.enemies
      else delete encounter.enemies
    }
    if (patch.onWin !== undefined) {
      if (patch.onWin && patch.onWin.length) encounter.onWin = bindEffects(pipeline, gameId, patch.onWin)
      else delete encounter.onWin
    }
    if (patch.onLose !== undefined) {
      if (patch.onLose && patch.onLose.length) encounter.onLose = bindEffects(pipeline, gameId, patch.onLose)
      else delete encounter.onLose
    }
    if (patch.sceneId !== undefined) {
      if (patch.sceneId) encounter.sceneId = patch.sceneId
      else delete encounter.sceneId
    }
    if (patch.tuningProfileId !== undefined) {
      if (patch.tuningProfileId) encounter.tuningProfileId = patch.tuningProfileId
      else delete encounter.tuningProfileId
    }
    if (patch.key !== undefined) {
      const key = assertRecordKey(patch.key, 'Encounter')
      if (key) encounter.key = key
      else delete encounter.key
    }
    encounter.updatedAt = nowIso()
    const refIssues = resolveEncounterRefs(pipeline, gameId, encounter)
    const issues = [...refIssues, ...validateEncounter(pipeline, encounter)]
    throwIssues(issues)
    warnings = warningsOf(issues)
    return encounter
  })
  return { record: value, warnings }
}

export async function removeEncounter(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const encounter = requireIdOrKey(pipeline.encounters || [], idOrKey, gameId, 'Encounter')
    const users = collectEncounterUsers(pipeline, encounter.id)
    if (users.length > 0) throw new Error(formatInUseError('encounter', encounter.key || encounter.id, users))
    if (options?.dryRun) return encounter.id
    pipeline.encounters = (pipeline.encounters || []).filter((e) => e.id !== encounter.id)
    return encounter.id
  })
  return { removed: value }
}

export async function createRegion(
  gameId: string,
  input: RegionInput,
  options?: WriteOptions
): Promise<{ record: Region; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.regions) pipeline.regions = []
    const now = nowIso()
    const region: Region = {
      id: newId(),
      gameId,
      name: String(input.name || '').trim(),
      backgroundAssetId: resolveBackgroundAssetId(pipeline, gameId, input.backgroundAssetId),
      anchors: input.anchors || [],
      edges: input.edges || [],
      spawn: String(input.spawn || '').trim(),
      hotspots: input.hotspots || [],
      exits: input.exits || [],
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now
    }
    const key = assertRecordKey(input.key, 'Region')
    if (key) region.key = key
    if (input.stageId) {
      const stage = requireIdOrKey(pipeline.stages || [], input.stageId, gameId, 'Stage')
      region.stageId = stage.id
    }
    resolveRegionLinkRefs(pipeline, gameId, region)
    const issues = validateRegion(pipeline, region)
    throwIssues(issues)
    warnings = warningsOf(issues)
    if (options?.dryRun) return region
    pipeline.regions.push(region)
    return region
  })
  return { record: value, warnings }
}

export async function updateRegion(
  gameId: string,
  idOrKey: string,
  patch: Partial<RegionInput>,
  options?: WriteOptions
): Promise<{ record: Region; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const region = requireIdOrKey(pipeline.regions || [], idOrKey, gameId, 'Region')
    if (patch.name !== undefined) region.name = String(patch.name).trim()
    if (patch.backgroundAssetId !== undefined) {
      region.backgroundAssetId = resolveBackgroundAssetId(pipeline, gameId, patch.backgroundAssetId)
    }
    if (patch.anchors !== undefined) region.anchors = patch.anchors
    if (patch.edges !== undefined) region.edges = patch.edges
    if (patch.spawn !== undefined) region.spawn = String(patch.spawn).trim()
    if (patch.hotspots !== undefined) region.hotspots = patch.hotspots
    if (patch.exits !== undefined) region.exits = patch.exits
    if (patch.stageId !== undefined) {
      if (patch.stageId) {
        const stage = requireIdOrKey(pipeline.stages || [], patch.stageId, gameId, 'Stage')
        region.stageId = stage.id
      } else {
        delete region.stageId
      }
    }
    if (patch.key !== undefined) {
      const key = assertRecordKey(patch.key, 'Region')
      if (key) region.key = key
      else delete region.key
    }
    resolveRegionLinkRefs(pipeline, gameId, region)
    region.updatedAt = nowIso()
    const issues = validateRegion(pipeline, region)
    throwIssues(issues)
    warnings = warningsOf(issues)
    return region
  })
  return { record: value, warnings }
}

export async function removeRegion(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const region = requireIdOrKey(pipeline.regions || [], idOrKey, gameId, 'Region')
    const users = collectRegionUsers(pipeline, region.id)
    if (users.length > 0) throw new Error(formatInUseError('region', region.key || region.id, users))
    if (options?.dryRun) return region.id
    pipeline.regions = (pipeline.regions || []).filter((r) => r.id !== region.id)
    return region.id
  })
  return { removed: value }
}

export function parsePosPair(raw: string, label = 'pos'): [number, number] {
  const parts = String(raw || '')
    .split(',')
    .map((s) => Number(s.trim()))
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`${label} must be x,y with values in 0..1, got '${raw}'`)
  }
  return [parts[0], parts[1]]
}

export function parseWaypointList(raw: string | undefined): [number, number][] | undefined {
  if (raw === undefined || raw === '') return undefined
  return String(raw)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => parsePosPair(part, 'waypoint'))
}

function requireMap(world: World): WorldMap {
  if (!world.map) {
    throw new Error(`World '${world.key || world.id}' has no map. Set a background first.`)
  }
  return world.map
}

function touchWorld(world: World): void {
  world.updatedAt = nowIso()
}

export async function showWorldMap(
  gameId: string,
  worldIdOrKey: string,
  dataDirOverride?: string
): Promise<{ world: World; map: WorldMap | null }> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
  return { world, map: world.map || null }
}

export async function setWorldMap(
  gameId: string,
  worldIdOrKey: string,
  input: { backgroundAssetId: string; startNodeId?: string },
  options?: WriteOptions
): Promise<{ record: World; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
    const backgroundAssetId = resolveBackgroundAssetId(pipeline, gameId, input.backgroundAssetId)
    const prev = world.map
    world.map = {
      backgroundAssetId,
      nodes: prev?.nodes ? [...prev.nodes] : [],
      paths: prev?.paths ? [...prev.paths] : [],
      startNodeId: input.startNodeId || prev?.startNodeId
    }
    if (!world.map.startNodeId) delete world.map.startNodeId
    if (input.startNodeId) world.map.startNodeId = input.startNodeId
    touchWorld(world)
    const issues = validateWorld(pipeline, world)
    throwIssues(issues)
    warnings = warningsOf(issues)
    return world
  })
  return { record: value, warnings }
}

export async function addWorldMapNode(
  gameId: string,
  worldIdOrKey: string,
  input: { stageId: string; pos: [number, number]; id?: string; label?: string; hidden?: boolean },
  options?: WriteOptions
): Promise<{ record: World; node: WorldMapNode; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
    const map = requireMap(world)
    const stage = requireIdOrKey(pipeline.stages || [], input.stageId, gameId, 'Stage')
    const id = String(input.id || `n-${stage.key || stage.id.slice(0, 8)}`).trim()
    const node: WorldMapNode = { id, stageId: stage.id, pos: input.pos }
    if (input.label) node.label = input.label
    if (input.hidden) node.hidden = true
    map.nodes = [...(map.nodes || []), node]
    if (!map.startNodeId) map.startNodeId = id
    touchWorld(world)
    const issues = validateWorld(pipeline, world)
    throwIssues(issues)
    warnings = warningsOf(issues)
    return { world, node }
  })
  return { record: value.world, node: value.node, warnings }
}

export async function moveWorldMapNode(
  gameId: string,
  worldIdOrKey: string,
  nodeId: string,
  pos: [number, number],
  options?: WriteOptions
): Promise<{ record: World; node: WorldMapNode; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
    const map = requireMap(world)
    const node = (map.nodes || []).find((n) => n.id === nodeId)
    if (!node) throw new Error(`Map node '${nodeId}' was not found`)
    node.pos = pos
    touchWorld(world)
    const issues = validateWorld(pipeline, world)
    throwIssues(issues)
    warnings = warningsOf(issues)
    return { world, node }
  })
  return { record: value.world, node: value.node, warnings }
}

export async function updateWorldMapNode(
  gameId: string,
  worldIdOrKey: string,
  nodeId: string,
  patch: { label?: string | null; hidden?: boolean; pos?: [number, number] },
  options?: WriteOptions
): Promise<{ record: World; node: WorldMapNode; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
    const map = requireMap(world)
    const node = (map.nodes || []).find((n) => n.id === nodeId)
    if (!node) throw new Error(`Map node '${nodeId}' was not found`)
    if (patch.pos) node.pos = patch.pos
    if (patch.label !== undefined) {
      if (patch.label) node.label = patch.label
      else delete node.label
    }
    if (patch.hidden !== undefined) {
      if (patch.hidden) node.hidden = true
      else delete node.hidden
    }
    touchWorld(world)
    const issues = validateWorld(pipeline, world)
    throwIssues(issues)
    warnings = warningsOf(issues)
    return { world, node }
  })
  return { record: value.world, node: value.node, warnings }
}

export async function removeWorldMapNode(
  gameId: string,
  worldIdOrKey: string,
  nodeId: string,
  options?: WriteOptions
): Promise<{ record: World; removed: string; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
    const map = requireMap(world)
    const node = (map.nodes || []).find((n) => n.id === nodeId)
    if (!node) throw new Error(`Map node '${nodeId}' was not found`)
    if (map.startNodeId === nodeId) {
      throw new Error(`Cannot remove the start node '${nodeId}'`)
    }
    map.nodes = (map.nodes || []).filter((n) => n.id !== nodeId)
    map.paths = (map.paths || []).filter((p) => p.from !== nodeId && p.to !== nodeId)
    for (const stage of stagesOf(pipeline, gameId, world.id)) {
      if (stage.returnToNode === nodeId) delete stage.returnToNode
    }
    touchWorld(world)
    const issues = validateWorld(pipeline, world)
    throwIssues(issues)
    warnings = warningsOf(issues)
    return { world, removed: nodeId }
  })
  return { record: value.world, removed: value.removed, warnings }
}

export async function addWorldMapPath(
  gameId: string,
  worldIdOrKey: string,
  input: { from: string; to: string; waypoints?: [number, number][]; id?: string },
  options?: WriteOptions
): Promise<{ record: World; path: WorldMapPath; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
    const map = requireMap(world)
    const id = String(input.id || `p-${input.from}-${input.to}`).trim()
    const edge: WorldMapPath = { id, from: input.from, to: input.to }
    if (input.waypoints && input.waypoints.length) edge.waypoints = input.waypoints
    map.paths = [...(map.paths || []), edge]
    touchWorld(world)
    const issues = validateWorld(pipeline, world)
    throwIssues(issues)
    warnings = warningsOf(issues)
    return { world, path: edge }
  })
  return { record: value.world, path: value.path, warnings }
}

export async function removeWorldMapPath(
  gameId: string,
  worldIdOrKey: string,
  pathId: string,
  options?: WriteOptions
): Promise<{ record: World; removed: string; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
    const map = requireMap(world)
    const edge = (map.paths || []).find((p) => p.id === pathId)
    if (!edge) throw new Error(`Map path '${pathId}' was not found`)
    map.paths = (map.paths || []).filter((p) => p.id !== pathId)
    touchWorld(world)
    const issues = validateWorld(pipeline, world)
    throwIssues(issues)
    warnings = warningsOf(issues)
    return { world, removed: pathId }
  })
  return { record: value.world, removed: value.removed, warnings }
}

export async function setWorldMapStart(
  gameId: string,
  worldIdOrKey: string,
  nodeId: string,
  options?: WriteOptions
): Promise<{ record: World; warnings: ContentIssue[] }> {
  let warnings: ContentIssue[] = []
  const { value } = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
    const map = requireMap(world)
    map.startNodeId = nodeId
    touchWorld(world)
    const issues = validateWorld(pipeline, world)
    throwIssues(issues)
    warnings = warningsOf(issues)
    return world
  })
  return { record: value, warnings }
}

export async function worldFlow(
  gameId: string,
  worldIdOrKey: string,
  dataDirOverride?: string
): Promise<WorldFlow> {
  const studio = await readStudio(dataDirOverride)
  const pipeline = studio.assetPipeline
  requireGame(pipeline, gameId)
  const world = requireIdOrKey(pipeline.worlds || [], worldIdOrKey, gameId, 'World')
  return buildWorldFlow(pipeline, world)
}

function parseBundle(raw: unknown): ContentBundle {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Content bundle must be a JSON object')
  }
  const obj = raw as Record<string, unknown>
  const bundle: ContentBundle = {}
  for (const name of [
    'worlds',
    'stages',
    'encounters',
    'regions',
    'enemies',
    'attackTables',
    'difficultyProfiles',
    'flags',
    'triggers',
    'npcs',
    'dialogues',
    'characters',
    'storyCircles',
    'revealTokens'
  ] as const) {
    if (obj[name] === undefined) continue
    if (!Array.isArray(obj[name])) {
      throw new Error(`bundle.${name} must be an array`)
    }
    bundle[name] = obj[name] as Record<string, unknown>[]
  }
  return bundle
}

export async function applyContent(
  gameId: string,
  bundleRaw: unknown,
  options?: WriteOptions
): Promise<ApplyResult> {
  const bundle = parseBundle(bundleRaw)
  const studio = await readStudio(options?.dataDirOverride)
  const { pipeline, result } = applyContentBundleIsolated(studio.assetPipeline, gameId, bundle)
  const changed = result.creates.length + result.updates.length > 0
  if (options?.dryRun || !changed) {
    return { ...result, written: false }
  }
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return { ...result, written: true }
}

export async function applyTypedRecords(
  kind: 'world' | 'stage' | 'encounter' | 'region',
  gameId: string,
  raw: unknown,
  options?: WriteOptions
): Promise<ApplyResult> {
  let items: Record<string, unknown>[]
  if (Array.isArray(raw)) items = raw
  else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const nested = obj[`${kind}s`]
    if (Array.isArray(nested)) items = nested as Record<string, unknown>[]
    else items = [obj]
  } else {
    throw new Error('Apply file must be a JSON object or array')
  }
  return applyContent(gameId, { [`${kind}s`]: items }, options)
}

export interface ContentExportFile {
  contentSchemaVersion: number
  gameId: string
  exportedAt: string
  settings: {
    encounterTypes: string[]
    modules: NonNullable<AssetPipelineProject['games'][number]['settings']>['modules']
    revealTokenLabel?: string
  }
  worlds: World[]
  stages: Stage[]
  encounters: Encounter[]
  regions: Region[]
  enemies: Enemy[]
  attackTables: AttackTable[]
  difficultyProfiles: DifficultyProfile[]
  flags: import('@shared/types/assetPipeline').GameFlag[]
  triggers: import('@shared/types/assetPipeline').Trigger[]
  npcs: import('@shared/types/assetPipeline').Npc[]
  dialogues: import('@shared/types/assetPipeline').Dialogue[]
  characters: import('@shared/types/assetPipeline').Character[]
  storyCircles: import('@shared/types/assetPipeline').StoryCircle[]
  revealTokens: import('@shared/types/assetPipeline').RevealToken[]
}

export async function exportContent(
  gameId: string,
  outDir: string,
  options?: WriteOptions
): Promise<{ path: string; dryRun: boolean; content: ContentExportFile }> {
  const studio = await readStudio(options?.dataDirOverride)
  const pipeline = studio.assetPipeline
  const game = requireGame(pipeline, gameId)
  const canon = options?.canon
  const content: ContentExportFile = {
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    gameId,
    exportedAt: nowIso(),
    settings: {
      encounterTypes: [...(game.settings?.encounterTypes || [])],
      modules: [...(game.settings?.modules || [])],
      revealTokenLabel: game.settings?.revealTokenLabel
    },
    worlds: worldsOf(pipeline, gameId),
    stages: stagesOf(pipeline, gameId),
    encounters: encountersOf(pipeline, gameId),
    regions: regionsOf(pipeline, gameId),
    enemies: (pipeline.enemies || []).filter((e) => e.gameId === gameId),
    attackTables: (pipeline.attackTables || []).filter((t) => t.gameId === gameId),
    difficultyProfiles: (pipeline.difficultyProfiles || []).filter((p) => p.gameId === gameId),
    flags: (pipeline.flags || []).filter((f) => f.gameId === gameId),
    triggers: (pipeline.triggers || []).filter((t) => t.gameId === gameId),
    npcs: (pipeline.npcs || []).filter((n) => n.gameId === gameId && matchesCanonFilter(n, canon)),
    dialogues: (pipeline.dialogues || []).filter((d) => d.gameId === gameId && matchesCanonFilter(d, canon)),
    characters: (pipeline.characters || []).filter(
      (c) => c.gameId === gameId && (!canon || matchesCanonFilter(c.storyProfile, canon))
    ),
    storyCircles: (pipeline.storyCircles || []).filter((c) => c.gameId === gameId && matchesCanonFilter(c, canon)),
    revealTokens: (pipeline.revealTokens || []).filter((t) => t.gameId === gameId && matchesCanonFilter(t, canon))
  }
  const target = join(outDir, 'content.json')
  if (options?.dryRun) {
    return { path: target, dryRun: true, content }
  }
  await mkdir(outDir, { recursive: true })
  await writeFile(target, `${JSON.stringify(content, null, 2)}\n`, 'utf-8')
  return { path: target, dryRun: false, content }
}

export function findRecord<T extends { id: string; key?: string; gameId: string }>(
  records: T[],
  idOrKey: string,
  gameId: string
): T | undefined {
  return findByIdOrKey(records, idOrKey, gameId)
}
