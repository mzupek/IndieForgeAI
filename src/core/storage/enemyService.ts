/**
 * Enemy CRUD (2a). Writes go through updateAssetPipeline. List/show/checklist use readStudio.
 */

import type { AssetPipelineProject, BattleMoment, Enemy, EnemyAssetRef } from '@shared/types/assetPipeline'
import { getAssetPipeline, readStudio, updateAssetPipeline } from './studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { assertRecordKey, nowIso } from '@shared/worldContent/keys'
import { formatInUseError } from '@shared/worldContent/issues'
import { overlayRecord } from '@shared/worldContent/apply'
import {
  RECORD_SCHEMA_VERSION,
  findByIdOrKey,
  requireIdOrKey
} from '@shared/worldContent/validate'
import { errorMessages, type ContentIssue } from '@shared/worldContent/issues'
import {
  assertEnemyKeyUnique,
  BATTLE_MOMENTS,
  buildEnemyChecklist,
  collectCharacterEnemyUsers,
  enemiesOf,
  parseAssetRefs,
  parseFlatNumbers,
  parsePoseMap,
  parseWinCondition,
  resolveCharacterRef,
  resolveVisualAssetRef,
  validateEnemy,
  type EnemyChecklist
} from '@shared/enemies/validate'
import { findModule } from '@shared/gameSettings/encounterSettings'

export interface WriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
}

export interface EnemyInput {
  name?: string
  key?: string
  characterId?: string
  moduleId?: string
  winKind?: string
  winParams?: Record<string, number>
  stats?: Record<string, number>
  poses?: Partial<Record<BattleMoment, string>>
  attackTableId?: string | null
  assets?: EnemyAssetRef[]
  notes?: string | null
}

function throwIssues(issues: ContentIssue[]): void {
  const errors = issues.filter((i) => i.level === 'error')
  if (errors.length) throw new Error(errorMessages(issues))
}

function newId(): string {
  return globalThis.crypto.randomUUID()
}

async function mutatePipeline<T>(
  options: WriteOptions | undefined,
  mutator: (pipeline: AssetPipelineProject) => T
): Promise<T> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const value = mutator(pipeline)
  if (!options?.dryRun) {
    await updateAssetPipeline(pipeline, options?.dataDirOverride)
  }
  return value
}

function resolveCharacterId(pipeline: AssetPipelineProject, gameId: string, raw: string): string {
  const resolved = resolveCharacterRef(pipeline, gameId, raw)
  if (resolved.error || !resolved.id) throw new Error(resolved.error || 'characterId is required')
  return resolved.id
}

function resolveAssets(
  pipeline: AssetPipelineProject,
  gameId: string,
  assets: EnemyAssetRef[]
): EnemyAssetRef[] {
  return assets.map((a) => {
    const resolved = resolveVisualAssetRef(pipeline, gameId, a.assetId)
    if (resolved.error || !resolved.id) throw new Error(resolved.error || 'assetId is required')
    const rec = (pipeline.visualAssets || []).find((x) => x.id === resolved.id)
    const states = (a.states || []).map((name) => {
      if (!rec) return name
      const owned = (pipeline.assetStates || []).filter((s) => s.assetId === rec.id)
      const found = owned.find(
        (s) => s.id === name || s.name === name || s.name.toLowerCase() === name.toLowerCase()
      )
      return found?.id || name
    })
    const next: EnemyAssetRef = { role: a.role, assetId: resolved.id }
    if (states.length) next.states = states
    return next
  })
}

function canonicalWinKind(pipeline: AssetPipelineProject, gameId: string, moduleId: string, kind: string): string {
  const game = requireGame(pipeline, gameId)
  const mod = findModule(game, moduleId)
  if (!mod) return kind
  const found = (mod.winConditions || []).find((k) => k.toLowerCase() === kind.toLowerCase())
  return found || kind
}

export async function listEnemies(gameId: string, dataDirOverride?: string): Promise<Enemy[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  return enemiesOf(pipeline, gameId).sort((a, b) => a.name.localeCompare(b.name))
}

export async function showEnemy(gameId: string, idOrKey: string, dataDirOverride?: string): Promise<Enemy> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.enemies || [], idOrKey, gameId, 'Enemy')
}

export async function createEnemy(
  gameId: string,
  input: EnemyInput,
  options?: WriteOptions
): Promise<{ record: Enemy }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.enemies) pipeline.enemies = []
    const issues: ContentIssue[] = []
    const characterId = resolveCharacterId(pipeline, gameId, String(input.characterId || ''))
    const moduleId = String(input.moduleId || '').trim()
    if (!moduleId) throw new Error('moduleId is required')
    const win = parseWinCondition(
      { kind: input.winKind, params: input.winParams || {} },
      'winCondition',
      issues
    )
    throwIssues(issues)
    if (!win) throw new Error('winCondition.kind is required')
    win.kind = canonicalWinKind(pipeline, gameId, moduleId, win.kind)
    const statsIssues: ContentIssue[] = []
    const stats = parseFlatNumbers(input.stats || {}, 'stats', statsIssues)
    throwIssues(statsIssues)
    const poseIssues: ContentIssue[] = []
    const poses = parsePoseMap(input.poses || {}, 'poses', poseIssues)
    throwIssues(poseIssues)
    const assetIssues: ContentIssue[] = []
    const assets = resolveAssets(
      pipeline,
      gameId,
      parseAssetRefs(input.assets || [], 'assets', assetIssues)
    )
    throwIssues(assetIssues)
    const now = nowIso()
    const known: Enemy = {
      id: newId(),
      gameId,
      name: String(input.name || '').trim(),
      characterId,
      moduleId,
      winCondition: win,
      stats,
      poses,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now
    }
    const key = assertRecordKey(input.key, 'Enemy')
    if (key) known.key = key
    assertEnemyKeyUnique(pipeline, gameId, key, known.id)
    if (input.attackTableId) known.attackTableId = String(input.attackTableId).trim()
    if (assets.length) known.assets = assets
    if (input.notes) known.notes = String(input.notes)
    throwIssues(validateEnemy(pipeline, known))
    if (options?.dryRun) return known
    pipeline.enemies.push(known)
    return known
  })
  return { record }
}

export async function updateEnemy(
  gameId: string,
  idOrKey: string,
  patch: EnemyInput,
  options?: WriteOptions
): Promise<{ record: Enemy }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.enemies || [], idOrKey, gameId, 'Enemy')
    const issues: ContentIssue[] = []
    const next: Enemy = overlayRecord(existing, {
      ...existing,
      name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
      updatedAt: nowIso()
    })
    if (patch.key !== undefined) {
      const key = assertRecordKey(patch.key, 'Enemy')
      if (key) next.key = key
      else delete next.key
    }
    if (patch.characterId !== undefined) {
      next.characterId = resolveCharacterId(pipeline, gameId, patch.characterId)
    }
    if (patch.moduleId !== undefined) next.moduleId = String(patch.moduleId).trim()
    if (patch.winKind !== undefined || patch.winParams !== undefined) {
      const win = parseWinCondition(
        {
          kind: patch.winKind ?? existing.winCondition.kind,
          params: patch.winParams ?? existing.winCondition.params
        },
        'winCondition',
        issues
      )
      throwIssues(issues)
      if (win) {
        win.kind = canonicalWinKind(pipeline, gameId, next.moduleId, win.kind)
        next.winCondition = win
      }
    }
    if (patch.stats !== undefined) {
      const statsIssues: ContentIssue[] = []
      next.stats = parseFlatNumbers(patch.stats, 'stats', statsIssues)
      throwIssues(statsIssues)
    }
    if (patch.poses !== undefined) {
      const poseIssues: ContentIssue[] = []
      next.poses = parsePoseMap(patch.poses, 'poses', poseIssues)
      throwIssues(poseIssues)
    }
    if (patch.assets !== undefined) {
      const assetIssues: ContentIssue[] = []
      next.assets = resolveAssets(pipeline, gameId, parseAssetRefs(patch.assets, 'assets', assetIssues))
      throwIssues(assetIssues)
      if (!next.assets.length) delete next.assets
    }
    if (patch.attackTableId !== undefined) {
      if (patch.attackTableId) next.attackTableId = String(patch.attackTableId).trim()
      else delete next.attackTableId
    }
    if (patch.notes !== undefined) {
      if (patch.notes) next.notes = String(patch.notes)
      else delete next.notes
    }
    assertEnemyKeyUnique(pipeline, gameId, next.key, next.id)
    throwIssues(validateEnemy(pipeline, next))
    const idx = (pipeline.enemies || []).findIndex((e) => e.id === existing.id)
    if (idx >= 0) pipeline.enemies![idx] = next
    return next
  })
  return { record }
}

export async function removeEnemy(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  return mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const enemy = requireIdOrKey(pipeline.enemies || [], idOrKey, gameId, 'Enemy')
    // 2c will refuse while an encounter uses the enemy. Nothing links yet in 2a.
    if (options?.dryRun) return { removed: enemy.id }
    pipeline.enemies = (pipeline.enemies || []).filter((e) => e.id !== enemy.id)
    return { removed: enemy.id }
  })
}

export async function enemyChecklist(
  gameId: string,
  idOrKey: string,
  dataDirOverride?: string
): Promise<EnemyChecklist> {
  const studio = await readStudio(dataDirOverride)
  const pipeline = studio.assetPipeline
  requireGame(pipeline, gameId)
  const enemy = requireIdOrKey(pipeline.enemies || [], idOrKey, gameId, 'Enemy')
  return buildEnemyChecklist(pipeline, enemy)
}

export function findEnemy(
  pipeline: AssetPipelineProject,
  gameId: string,
  idOrKey: string
): Enemy | undefined {
  return findByIdOrKey(pipeline.enemies || [], idOrKey, gameId)
}

export { collectCharacterEnemyUsers, formatInUseError, BATTLE_MOMENTS }
