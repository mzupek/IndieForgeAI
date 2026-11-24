/**
 * Attack table CRUD (2b). Writes go through updateAssetPipeline.
 */

import type {
  AssetPipelineProject,
  AttackRow,
  AttackSelection,
  AttackTable,
  ModuleAttackKind,
  ModuleCounterKind,
  ModuleKindParamDef
} from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from './studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { assertRecordKey, nowIso } from '@shared/worldContent/keys'
import { overlayRecord } from '@shared/worldContent/apply'
import { RECORD_SCHEMA_VERSION, requireIdOrKey } from '@shared/worldContent/validate'
import { errorMessages, type ContentIssue } from '@shared/worldContent/issues'
import {
  ATTACK_REVEALS,
  ATTACK_SELECTIONS,
  assertAttackTableKeyUnique,
  assertCanRemoveAttackTable,
  attackTablesOf,
  parseAttackRow,
  parseAttackRows,
  resolveAttackTableRef,
  slugFromLabel,
  validateAttackTable
} from '@shared/attackTables/validate'
import { simulateAttackTable, type SimulateResult } from '@shared/attackTables/simulate'
import {
  findModule,
  normalizeAttackKind,
  normalizeCounterKind
} from '@shared/gameSettings/encounterSettings'

export interface WriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
}

export interface AttackTableInput {
  name?: string
  key?: string
  moduleId?: string
  selection?: AttackSelection | string
  noRepeatInARow?: boolean
  reveal?: string
  skipFinalRound?: boolean
  rows?: unknown[]
}

export interface AttackRowInput {
  id?: string
  label?: string
  telegraph?: string
  kind?: string
  params?: Record<string, number>
  damage?: number | null
  weight?: number
  minRound?: number | null
  maxRound?: number | null
  counterKind?: string | null
  counterResult?: string | null
  poseSlot?: string | null
  heroPoseSlot?: string | null
  cueEventId?: string | null
  sfxAudioId?: string | null
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

function asBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const s = String(value).trim().toLowerCase()
  if (s === 'true' || s === '1' || s === 'yes') return true
  if (s === 'false' || s === '0' || s === 'no') return false
  return fallback
}

function parseSelection(raw: unknown, fallback: AttackSelection): AttackSelection {
  const value = String(raw ?? fallback).trim() as AttackSelection
  if (!ATTACK_SELECTIONS.includes(value)) {
    throw new Error(`selection must be ${ATTACK_SELECTIONS.join(' or ')}`)
  }
  return value
}

function parseReveal(raw: unknown): AttackTable['reveal'] {
  const value = String(raw ?? 'roundStart').trim() as AttackTable['reveal']
  if (!ATTACK_REVEALS.includes(value)) {
    throw new Error(`reveal must be ${ATTACK_REVEALS.join(' or ')}`)
  }
  return value
}

function rowFromInput(input: AttackRowInput, existing?: AttackRow): Record<string, unknown> {
  const merged: Record<string, unknown> = existing ? { ...existing } : {}
  if (input.id !== undefined) merged.id = input.id
  if (input.label !== undefined) merged.label = input.label
  if (input.telegraph !== undefined) merged.telegraph = input.telegraph
  if (input.kind !== undefined) merged.kind = input.kind
  if (input.params !== undefined) merged.params = input.params
  if (input.damage !== undefined) {
    if (input.damage === null) delete merged.damage
    else merged.damage = input.damage
  }
  if (input.weight !== undefined) merged.weight = input.weight
  if (input.minRound !== undefined) {
    if (input.minRound === null) delete merged.minRound
    else merged.minRound = input.minRound
  }
  if (input.maxRound !== undefined) {
    if (input.maxRound === null) delete merged.maxRound
    else merged.maxRound = input.maxRound
  }
  if (input.counterKind !== undefined || input.counterResult !== undefined) {
    const kind = input.counterKind !== undefined ? input.counterKind : (existing?.counter?.kind ?? null)
    const result = input.counterResult !== undefined ? input.counterResult : (existing?.counter?.result ?? null)
    if (!kind) delete merged.counter
    else merged.counter = { kind, result: result || 'cancel' }
  }
  if (input.poseSlot !== undefined) {
    if (input.poseSlot) merged.poseSlot = input.poseSlot
    else delete merged.poseSlot
  }
  if (input.heroPoseSlot !== undefined) {
    if (input.heroPoseSlot) merged.heroPoseSlot = input.heroPoseSlot
    else delete merged.heroPoseSlot
  }
  if (input.cueEventId !== undefined) {
    if (input.cueEventId) merged.cueEventId = input.cueEventId
    else delete merged.cueEventId
  }
  if (input.sfxAudioId !== undefined) {
    if (input.sfxAudioId) merged.sfxAudioId = input.sfxAudioId
    else delete merged.sfxAudioId
  }
  if (!merged.label && existing?.label) merged.label = existing.label
  if (merged.weight === undefined) merged.weight = existing?.weight ?? 1
  if (merged.telegraph === undefined) merged.telegraph = existing?.telegraph ?? ''
  if (merged.kind === undefined) merged.kind = existing?.kind ?? ''
  if (!merged.id) merged.id = existing?.id || slugFromLabel(String(merged.label || ''))
  return merged
}

export async function listAttackTables(gameId: string, dataDirOverride?: string): Promise<AttackTable[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  return attackTablesOf(pipeline, gameId).sort((a, b) => a.name.localeCompare(b.name))
}

export async function showAttackTable(
  gameId: string,
  idOrKey: string,
  dataDirOverride?: string
): Promise<AttackTable> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.attackTables || [], idOrKey, gameId, 'Attack table')
}

export async function createAttackTable(
  gameId: string,
  input: AttackTableInput,
  options?: WriteOptions
): Promise<{ record: AttackTable }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.attackTables) pipeline.attackTables = []
    const issues: ContentIssue[] = []
    const moduleId = String(input.moduleId || '').trim()
    if (!moduleId) throw new Error('moduleId is required')
    const rows = parseAttackRows(input.rows || [], 'rows', issues)
    throwIssues(issues)
    const now = nowIso()
    const known: AttackTable = {
      id: newId(),
      gameId,
      name: String(input.name || '').trim(),
      moduleId,
      selection: parseSelection(input.selection, 'weighted'),
      noRepeatInARow: asBool(input.noRepeatInARow, false),
      reveal: parseReveal(input.reveal),
      skipFinalRound: asBool(input.skipFinalRound, false),
      rows,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now
    }
    const key = assertRecordKey(input.key, 'Attack table')
    if (key) known.key = key
    assertAttackTableKeyUnique(pipeline, gameId, key, known.id)
    throwIssues(validateAttackTable(pipeline, known))
    if (options?.dryRun) return known
    pipeline.attackTables.push(known)
    return known
  })
  return { record }
}

export async function updateAttackTable(
  gameId: string,
  idOrKey: string,
  patch: AttackTableInput,
  options?: WriteOptions
): Promise<{ record: AttackTable }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.attackTables || [], idOrKey, gameId, 'Attack table')
    const next: AttackTable = overlayRecord(existing, {
      ...existing,
      name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
      updatedAt: nowIso()
    })
    if (patch.key !== undefined) {
      const key = assertRecordKey(patch.key, 'Attack table')
      if (key) next.key = key
      else delete next.key
    }
    if (patch.moduleId !== undefined) next.moduleId = String(patch.moduleId).trim()
    if (patch.selection !== undefined) next.selection = parseSelection(patch.selection, existing.selection)
    if (patch.noRepeatInARow !== undefined) next.noRepeatInARow = asBool(patch.noRepeatInARow, existing.noRepeatInARow)
    if (patch.reveal !== undefined) next.reveal = parseReveal(patch.reveal)
    if (patch.skipFinalRound !== undefined) next.skipFinalRound = asBool(patch.skipFinalRound, existing.skipFinalRound)
    if (patch.rows !== undefined) {
      const issues: ContentIssue[] = []
      next.rows = parseAttackRows(patch.rows, 'rows', issues)
      throwIssues(issues)
    }
    assertAttackTableKeyUnique(pipeline, gameId, next.key, next.id)
    throwIssues(validateAttackTable(pipeline, next))
    const idx = (pipeline.attackTables || []).findIndex((t) => t.id === existing.id)
    if (idx >= 0) pipeline.attackTables![idx] = next
    return next
  })
  return { record }
}

export async function removeAttackTable(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  return mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const table = requireIdOrKey(pipeline.attackTables || [], idOrKey, gameId, 'Attack table')
    assertCanRemoveAttackTable(pipeline, table.id)
    if (options?.dryRun) return { removed: table.id }
    pipeline.attackTables = (pipeline.attackTables || []).filter((t) => t.id !== table.id)
    return { removed: table.id }
  })
}

export async function addAttackTableRow(
  gameId: string,
  tableIdOrKey: string,
  input: AttackRowInput,
  options?: WriteOptions
): Promise<{ record: AttackTable }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.attackTables || [], tableIdOrKey, gameId, 'Attack table')
    const issues: ContentIssue[] = []
    const parsed = parseAttackRow(rowFromInput(input), 'row', issues)
    throwIssues(issues)
    if (!parsed) throw new Error('row is required')
    if (existing.rows.some((r) => r.id.toLowerCase() === parsed.id.toLowerCase())) {
      throw new Error(`Row id '${parsed.id}' already exists on this table`)
    }
    const next: AttackTable = overlayRecord(existing, {
      ...existing,
      rows: [...existing.rows, parsed],
      updatedAt: nowIso()
    })
    throwIssues(validateAttackTable(pipeline, next))
    const idx = (pipeline.attackTables || []).findIndex((t) => t.id === existing.id)
    if (idx >= 0) pipeline.attackTables![idx] = next
    return next
  })
  return { record }
}

export async function updateAttackTableRow(
  gameId: string,
  tableIdOrKey: string,
  rowId: string,
  input: AttackRowInput,
  options?: WriteOptions
): Promise<{ record: AttackTable }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.attackTables || [], tableIdOrKey, gameId, 'Attack table')
    const index = existing.rows.findIndex((r) => r.id === rowId || r.id.toLowerCase() === String(rowId).toLowerCase())
    if (index < 0) throw new Error(`Row not found: ${rowId}`)
    const issues: ContentIssue[] = []
    const parsed = parseAttackRow(rowFromInput(input, existing.rows[index]), 'row', issues)
    throwIssues(issues)
    if (!parsed) throw new Error('row is required')
    const clash = existing.rows.find(
      (r, i) => i !== index && r.id.toLowerCase() === parsed.id.toLowerCase()
    )
    if (clash) throw new Error(`Row id '${parsed.id}' already exists on this table`)
    const rows = existing.rows.slice()
    rows[index] = parsed
    const next: AttackTable = overlayRecord(existing, {
      ...existing,
      rows,
      updatedAt: nowIso()
    })
    throwIssues(validateAttackTable(pipeline, next))
    const idx = (pipeline.attackTables || []).findIndex((t) => t.id === existing.id)
    if (idx >= 0) pipeline.attackTables![idx] = next
    return next
  })
  return { record }
}

export async function removeAttackTableRow(
  gameId: string,
  tableIdOrKey: string,
  rowId: string,
  options?: WriteOptions
): Promise<{ record: AttackTable }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.attackTables || [], tableIdOrKey, gameId, 'Attack table')
    const index = existing.rows.findIndex((r) => r.id === rowId || r.id.toLowerCase() === String(rowId).toLowerCase())
    if (index < 0) throw new Error(`Row not found: ${rowId}`)
    const rows = existing.rows.filter((_, i) => i !== index)
    const next: AttackTable = overlayRecord(existing, {
      ...existing,
      rows,
      updatedAt: nowIso()
    })
    throwIssues(validateAttackTable(pipeline, next))
    const idx = (pipeline.attackTables || []).findIndex((t) => t.id === existing.id)
    if (idx >= 0) pipeline.attackTables![idx] = next
    return next
  })
  return { record }
}

export async function simulateTable(
  gameId: string,
  idOrKey: string,
  rounds: number,
  seed: number,
  dataDirOverride?: string
): Promise<SimulateResult> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  requireGame(pipeline, gameId)
  const table = requireIdOrKey(pipeline.attackTables || [], idOrKey, gameId, 'Attack table')
  return simulateAttackTable(table, rounds, seed)
}

export function findAttackTable(
  pipeline: AssetPipelineProject,
  gameId: string,
  idOrKey: string
): AttackTable | undefined {
  return resolveAttackTableRef(pipeline, gameId, idOrKey).table
}

export { simulateAttackTable }

export function parseKindParamFlag(raw: string): ModuleKindParamDef {
  const parts = String(raw || '').split(':')
  const key = parts[0]?.trim()
  const type = (parts[1] || 'number').trim()
  if (!key) throw new Error('--param must be key:number[:min[:max]]')
  const def: { key: string; type: 'number'; min?: number; max?: number } = {
    key,
    type: type as 'number'
  }
  if (parts[2] !== undefined && parts[2] !== '') def.min = Number(parts[2])
  if (parts[3] !== undefined && parts[3] !== '') def.max = Number(parts[3])
  return normalizeAttackKind({ key: 'tmp', label: 'tmp', params: [def] }, 'tmp').params![0]!
}

export function buildAttackKindInput(key: string, label: string | undefined, params: ModuleKindParamDef[]): ModuleAttackKind {
  return normalizeAttackKind({ key, label: label || key, params: params.length ? params : undefined }, 'module')
}

export function buildCounterKindInput(key: string, label: string | undefined): ModuleCounterKind {
  return normalizeCounterKind({ key, label: label || key }, 'module')
}

export function requireModule(pipeline: AssetPipelineProject, gameId: string, moduleId: string) {
  const game = requireGame(pipeline, gameId)
  const mod = findModule(game, moduleId)
  if (!mod) throw new Error(`Module not found: ${moduleId}`)
  return mod
}
