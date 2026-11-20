/**
 * Attack tables (2b). Game-agnostic: kinds, pose slots, events, and audio
 * come from per-game data. Still poses only; no scripts.
 */

import type {
  AssetPipelineProject,
  AttackCounterResult,
  AttackReveal,
  AttackRow,
  AttackRowCounter,
  AttackSelection,
  AttackTable,
  AudioAsset,
  EventDefinition,
  Game
} from '../types/assetPipeline'
import { findAttackKind, findCounterKind, findModule } from '../gameSettings/encounterSettings'
import { isKnownPoseSlot } from '../gameSettings/poseSlots'
import { requireGame } from '../worldContent/scope'
import { assertRecordKey, isAliasRef, normalizeRecordKey } from '../worldContent/keys'
import {
  errorIssue,
  formatInUseError,
  type ContentIssue,
  type NamedUser
} from '../worldContent/issues'
import { enemiesOf } from '../enemies/validate'

export const ATTACK_SELECTIONS: AttackSelection[] = ['weighted', 'sequence']
export const ATTACK_REVEALS: AttackReveal[] = ['roundStart']
export const ATTACK_COUNTER_RESULTS: AttackCounterResult[] = ['cancel', 'halve']

export function attackTablesOf(pipeline: AssetPipelineProject, gameId: string): AttackTable[] {
  return (pipeline.attackTables || []).filter((t) => t.gameId === gameId)
}

export function linkedEnemiesForTable(
  pipeline: AssetPipelineProject,
  tableId: string
): ReturnType<typeof enemiesOf> {
  return (pipeline.enemies || []).filter((e) => e.attackTableId === tableId)
}

export function resolveAttackTableRef(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string | undefined | null
): { id?: string; table?: AttackTable; error?: string } {
  const value = String(raw ?? '').trim()
  if (!value) return { error: 'attackTableId is required' }
  const inGame = attackTablesOf(pipeline, gameId)
  if (isAliasRef(value) || value.startsWith('@')) {
    const key = normalizeRecordKey(value.replace(/^@/, ''))
    const found = inGame.find((t) => t.key === key)
    if (!found) return { error: `Attack table alias '@${key}' was not found in this game` }
    return { id: found.id, table: found }
  }
  const byId = inGame.find((t) => t.id === value)
  if (byId) return { id: byId.id, table: byId }
  const byKey = inGame.find((t) => t.key === value || t.key === normalizeRecordKey(value))
  if (byKey) return { id: byKey.id, table: byKey }
  const byName = inGame.filter((t) => t.name === value)
  if (byName.length === 1) return { id: byName[0]!.id, table: byName[0] }
  if (byName.length > 1) {
    return { error: `Attack table name '${value}' is not unique in this game` }
  }
  const other = (pipeline.attackTables || []).find((t) => t.id === value)
  if (other && other.gameId !== gameId) {
    return {
      error: `Attack table '${other.name}' belongs to game '${other.gameId}', not '${gameId}'`
    }
  }
  return { error: `Attack table '${value}' was not found in this game` }
}

export function resolveEventRef(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string | undefined | null
): { id?: string; event?: EventDefinition; error?: string } {
  const value = String(raw ?? '').trim()
  if (!value) return {}
  const inGame = (pipeline.eventDefinitions || []).filter((e) => e.gameId === gameId)
  if (isAliasRef(value) || value.startsWith('@')) {
    const key = normalizeRecordKey(value.replace(/^@/, ''))
    const found = inGame.find((e) => e.key === key)
    if (!found) return { error: `Event alias '@${key}' was not found in this game` }
    return { id: found.id, event: found }
  }
  const byId = inGame.find((e) => e.id === value)
  if (byId) return { id: byId.id, event: byId }
  const byKey = inGame.find((e) => e.key === value || e.key === normalizeRecordKey(value))
  if (byKey) return { id: byKey.id, event: byKey }
  const byName = inGame.filter((e) => e.name === value)
  if (byName.length === 1) return { id: byName[0]!.id, event: byName[0] }
  if (byName.length > 1) {
    return { error: `Event name '${value}' is not unique in this game` }
  }
  const other = (pipeline.eventDefinitions || []).find((e) => e.id === value)
  if (other && other.gameId !== gameId) {
    return {
      error: `Event '${other.name}' belongs to game '${other.gameId}', not '${gameId}'`
    }
  }
  return { error: `Event '${value}' was not found in this game` }
}

export function resolveAudioRef(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string | undefined | null
): { id?: string; audio?: AudioAsset; error?: string } {
  const value = String(raw ?? '').trim()
  if (!value) return {}
  const inGame = (pipeline.audioAssets || []).filter((a) => a.gameId === gameId)
  const byId = inGame.find((a) => a.id === value)
  if (byId) return { id: byId.id, audio: byId }
  const byName = inGame.filter((a) => a.name === value)
  if (byName.length === 1) return { id: byName[0]!.id, audio: byName[0] }
  if (byName.length > 1) {
    return { error: `Audio name '${value}' is not unique in this game` }
  }
  const other = (pipeline.audioAssets || []).find((a) => a.id === value)
  if (other && other.gameId !== gameId) {
    return {
      error: `Audio '${other.name}' belongs to game '${other.gameId}', not '${gameId}'`
    }
  }
  return { error: `Audio '${value}' was not found in this game` }
}

export function slugFromLabel(label: string): string {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug
}

export function parseRowId(raw: unknown, fallbackLabel: string, path: string, issues: ContentIssue[]): string {
  const value = String(raw ?? '').trim()
  if (value) {
    try {
      return assertRecordKey(value, 'Attack row') || value
    } catch (err) {
      issues.push(errorIssue(`${path}.id`, err instanceof Error ? err.message : String(err)))
      return value.toLowerCase()
    }
  }
  const slug = slugFromLabel(fallbackLabel)
  if (!slug) {
    issues.push(errorIssue(`${path}.id`, 'row id is required (lowercase slug)'))
    return ''
  }
  try {
    return assertRecordKey(slug, 'Attack row') || slug
  } catch (err) {
    issues.push(errorIssue(`${path}.id`, err instanceof Error ? err.message : String(err)))
    return slug
  }
}

function parseOptionalInt(
  raw: unknown,
  path: string,
  issues: ContentIssue[]
): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    issues.push(errorIssue(path, 'must be an integer >= 1'))
    return undefined
  }
  return n
}

function parseOptionalNumber(
  raw: unknown,
  path: string,
  issues: ContentIssue[]
): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    issues.push(errorIssue(path, 'must be a finite number'))
    return undefined
  }
  return n
}

export function parseRowParams(
  raw: unknown,
  path: string,
  issues: ContentIssue[]
): Record<string, number> {
  if (raw === undefined || raw === null || raw === '') return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push(errorIssue(path, 'params must be an object of number values'))
    return {}
  }
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = String(key || '').trim()
    if (!name) continue
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) {
      issues.push(errorIssue(`${path}.${name}`, 'must be a finite number'))
      continue
    }
    out[name] = n
  }
  return out
}

export function parseCounter(
  raw: unknown,
  path: string,
  issues: ContentIssue[]
): AttackRowCounter | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push(errorIssue(path, 'counter must be { kind, result }'))
    return undefined
  }
  const obj = raw as Record<string, unknown>
  const kind = String(obj.kind ?? '').trim()
  const result = String(obj.result ?? '').trim() as AttackCounterResult
  if (!kind) issues.push(errorIssue(`${path}.kind`, 'counter.kind is required'))
  if (!ATTACK_COUNTER_RESULTS.includes(result)) {
    issues.push(
      errorIssue(
        `${path}.result`,
        `counter.result must be ${ATTACK_COUNTER_RESULTS.join(' or ')}`
      )
    )
  }
  if (!kind || !ATTACK_COUNTER_RESULTS.includes(result)) return undefined
  return { kind, result }
}

export function parseAttackRow(
  raw: unknown,
  path: string,
  issues: ContentIssue[]
): AttackRow | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push(errorIssue(path, 'row must be an object'))
    return undefined
  }
  const obj = raw as Record<string, unknown>
  const label = String(obj.label ?? '').trim()
  if (!label) issues.push(errorIssue(`${path}.label`, 'label is required'))
  const telegraph = String(obj.telegraph ?? '').trim()
  const kind = String(obj.kind ?? '').trim()
  if (!kind) issues.push(errorIssue(`${path}.kind`, 'kind is required'))
  const id = parseRowId(obj.id, label, path, issues)
  const params = parseRowParams(obj.params, `${path}.params`, issues)
  const weightRaw = obj.weight
  const weight = typeof weightRaw === 'number' ? weightRaw : Number(weightRaw)
  if (!Number.isFinite(weight)) {
    issues.push(errorIssue(`${path}.weight`, 'weight must be a finite number'))
  }
  const damage = parseOptionalNumber(obj.damage, `${path}.damage`, issues)
  const minRound = parseOptionalInt(obj.minRound, `${path}.minRound`, issues)
  const maxRound = parseOptionalInt(obj.maxRound, `${path}.maxRound`, issues)
  if (minRound !== undefined && maxRound !== undefined && minRound > maxRound) {
    issues.push(errorIssue(`${path}.minRound`, 'minRound cannot be greater than maxRound'))
  }
  const counter = parseCounter(
    obj.counter ??
      (obj.counterKind
        ? { kind: obj.counterKind, result: obj.counterResult || 'cancel' }
        : undefined),
    `${path}.counter`,
    issues
  )
  const row: AttackRow = {
    id,
    label: label || id,
    telegraph,
    kind,
    weight: Number.isFinite(weight) ? weight : 0
  }
  if (Object.keys(params).length) row.params = params
  if (damage !== undefined) row.damage = damage
  if (minRound !== undefined) row.minRound = minRound
  if (maxRound !== undefined) row.maxRound = maxRound
  if (counter) row.counter = counter
  const poseSlot = String(obj.poseSlot ?? '').trim()
  if (poseSlot) row.poseSlot = poseSlot
  const heroPoseSlot = String(obj.heroPoseSlot ?? '').trim()
  if (heroPoseSlot) row.heroPoseSlot = heroPoseSlot
  const cueEventId = String(obj.cueEventId ?? '').trim()
  if (cueEventId) row.cueEventId = cueEventId
  const sfxAudioId = String(obj.sfxAudioId ?? '').trim()
  if (sfxAudioId) row.sfxAudioId = sfxAudioId
  return row
}

export function parseAttackRows(raw: unknown, path: string, issues: ContentIssue[]): AttackRow[] {
  if (raw === undefined || raw === null || raw === '') return []
  if (!Array.isArray(raw)) {
    issues.push(errorIssue(path, 'rows must be an array'))
    return []
  }
  const rows: AttackRow[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length; i++) {
    const row = parseAttackRow(raw[i], `${path}[${i}]`, issues)
    if (!row) continue
    const lower = row.id.toLowerCase()
    if (lower && seen.has(lower)) {
      issues.push(errorIssue(`${path}[${i}].id`, `Duplicate row id '${row.id}'`))
    }
    seen.add(lower)
    rows.push(row)
  }
  return rows
}

function validateRowAgainstModule(
  pipeline: AssetPipelineProject,
  game: Game,
  table: AttackTable,
  row: AttackRow,
  path: string,
  issues: ContentIssue[]
): void {
  const mod = findModule(game, table.moduleId)
  if (!mod) return

  const kindDef = findAttackKind(mod, row.kind)
  if (!kindDef) {
    const listed = (mod.attackKinds || []).map((k) => k.key)
    issues.push(
      errorIssue(
        `${path}.kind`,
        listed.length
          ? `Attack kind '${row.kind}' is not in module '${mod.id}' attackKinds (${listed.join(', ')})`
          : `Module '${mod.id}' has no attackKinds; add them in Game Settings first`
      )
    )
  } else {
    row.kind = kindDef.key
    const declared = kindDef.params || []
    const declaredKeys = new Set(declared.map((p) => p.key.toLowerCase()))
    const params = row.params || {}
    for (const def of declared) {
      const value = params[def.key] ?? params[Object.keys(params).find((k) => k.toLowerCase() === def.key.toLowerCase()) || '']
      if (value === undefined) {
        issues.push(errorIssue(`${path}.params.${def.key}`, `param '${def.key}' is required for kind '${kindDef.key}'`))
        continue
      }
      if (def.min !== undefined && value < def.min) {
        issues.push(
          errorIssue(`${path}.params.${def.key}`, `param '${def.key}' must be >= ${def.min}`)
        )
      }
      if (def.max !== undefined && value > def.max) {
        issues.push(
          errorIssue(`${path}.params.${def.key}`, `param '${def.key}' must be <= ${def.max}`)
        )
      }
    }
    for (const key of Object.keys(params)) {
      if (!declaredKeys.has(key.toLowerCase())) {
        issues.push(
          errorIssue(
            `${path}.params.${key}`,
            `Unknown param '${key}' for kind '${kindDef.key}'`
          )
        )
      }
    }
    const canonical: Record<string, number> = {}
    for (const def of declared) {
      const match = Object.keys(params).find((k) => k.toLowerCase() === def.key.toLowerCase())
      if (match !== undefined) canonical[def.key] = params[match]!
    }
    if (Object.keys(canonical).length) row.params = canonical
    else delete row.params
  }

  if (table.selection === 'weighted' && !(row.weight > 0)) {
    issues.push(errorIssue(`${path}.weight`, 'weight must be greater than 0 when selection is weighted'))
  }

  if (row.counter) {
    const counterDef = findCounterKind(mod, row.counter.kind)
    if (!counterDef) {
      const listed = (mod.counterKinds || []).map((k) => k.key)
      issues.push(
        errorIssue(
          `${path}.counter.kind`,
          listed.length
            ? `Counter kind '${row.counter.kind}' is not in module '${mod.id}' counterKinds (${listed.join(', ')})`
            : `Module '${mod.id}' has no counterKinds; add them in Game Settings first`
        )
      )
    } else {
      row.counter.kind = counterDef.key
    }
  }

  if (row.heroPoseSlot && !isKnownPoseSlot(row.heroPoseSlot, game, null)) {
    issues.push(
      errorIssue(
        `${path}.heroPoseSlot`,
        `Hero pose slot '${row.heroPoseSlot}' is not one of this game's slots`
      )
    )
  }

  const linked = linkedEnemiesForTable(pipeline, table.id)
  if (row.poseSlot && linked.length) {
    for (const enemy of linked) {
      const character = (pipeline.characters || []).find((c) => c.id === enemy.characterId)
      if (!character || !isKnownPoseSlot(row.poseSlot, game, character)) {
        issues.push(
          errorIssue(
            `${path}.poseSlot`,
            `Pose slot '${row.poseSlot}' is not one of the linked enemy's character slots`
          )
        )
        break
      }
    }
  }

  if (row.cueEventId) {
    const resolved = resolveEventRef(pipeline, table.gameId, row.cueEventId)
    if (resolved.error) issues.push(errorIssue(`${path}.cueEventId`, resolved.error))
    else if (resolved.id) row.cueEventId = resolved.id
  }
  if (row.sfxAudioId) {
    const resolved = resolveAudioRef(pipeline, table.gameId, row.sfxAudioId)
    if (resolved.error) issues.push(errorIssue(`${path}.sfxAudioId`, resolved.error))
    else if (resolved.id) row.sfxAudioId = resolved.id
  }
}

export function validateAttackTable(
  pipeline: AssetPipelineProject,
  table: AttackTable,
  path = 'attackTable'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  let game: Game
  try {
    game = requireGame(pipeline, table.gameId)
  } catch (err) {
    issues.push(errorIssue(`${path}.gameId`, err instanceof Error ? err.message : String(err)))
    return issues
  }

  if (!String(table.name || '').trim()) {
    issues.push(errorIssue(`${path}.name`, 'name is required'))
  }

  try {
    assertRecordKey(table.key, 'Attack table')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }

  if (!ATTACK_SELECTIONS.includes(table.selection)) {
    issues.push(
      errorIssue(
        `${path}.selection`,
        `selection must be ${ATTACK_SELECTIONS.join(' or ')}`
      )
    )
  }
  if (!ATTACK_REVEALS.includes(table.reveal)) {
    issues.push(errorIssue(`${path}.reveal`, `reveal must be ${ATTACK_REVEALS.join(' or ')}`))
  }

  const mod = findModule(game, table.moduleId)
  if (!mod) {
    issues.push(errorIssue(`${path}.moduleId`, `Unknown encounter module '${table.moduleId}'`))
  }

  const seen = new Set<string>()
  for (let i = 0; i < (table.rows || []).length; i++) {
    const row = table.rows[i]!
    const lower = (row.id || '').toLowerCase()
    if (lower && seen.has(lower)) {
      issues.push(errorIssue(`${path}.rows[${i}].id`, `Duplicate row id '${row.id}'`))
    }
    seen.add(lower)
    if (row.minRound !== undefined && row.maxRound !== undefined && row.minRound > row.maxRound) {
      issues.push(errorIssue(`${path}.rows[${i}].minRound`, 'minRound cannot be greater than maxRound'))
    }
    validateRowAgainstModule(pipeline, game, table, row, `${path}.rows[${i}]`, issues)
  }

  return issues
}

export function validateEnemyAttackTable(
  pipeline: AssetPipelineProject,
  gameId: string,
  moduleId: string,
  attackTableId: string | undefined,
  path: string
): ContentIssue[] {
  if (!attackTableId) return []
  const issues: ContentIssue[] = []
  const resolved = resolveAttackTableRef(pipeline, gameId, attackTableId)
  if (resolved.error || !resolved.table) {
    issues.push(errorIssue(path, resolved.error || `Attack table '${attackTableId}' was not found`))
    return issues
  }
  if (resolved.table.moduleId !== moduleId) {
    issues.push(
      errorIssue(
        path,
        `Attack table '${resolved.table.name}' belongs to module '${resolved.table.moduleId}', not '${moduleId}'`
      )
    )
  }
  return issues
}

export function collectAttackTableUsers(
  pipeline: AssetPipelineProject,
  tableId: string
): NamedUser[] {
  return (pipeline.enemies || [])
    .filter((e) => e.attackTableId === tableId)
    .map((e) => ({ id: e.id, name: e.name, kind: 'enemy' }))
}

export function assertCanRemoveAttackTable(pipeline: AssetPipelineProject, tableId: string): void {
  const users = collectAttackTableUsers(pipeline, tableId)
  if (users.length > 0) {
    const table = (pipeline.attackTables || []).find((t) => t.id === tableId)
    throw new Error(formatInUseError('attack table', table?.name || tableId, users))
  }
}

export function collectEventAttackRowUsers(
  pipeline: AssetPipelineProject,
  eventId: string
): NamedUser[] {
  const event = (pipeline.eventDefinitions || []).find((e) => e.id === eventId)
  const aliases = new Set(
    [eventId, event?.id, event?.key, event?.key ? `@${event.key}` : '', event?.name]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase())
  )
  const users: NamedUser[] = []
  for (const table of pipeline.attackTables || []) {
    for (const row of table.rows || []) {
      if (row.cueEventId && aliases.has(row.cueEventId.toLowerCase())) {
        users.push({
          id: `${table.id}:${row.id}`,
          name: `${table.name} row ${row.label || row.id}`,
          kind: 'attack-row'
        })
      }
    }
  }
  return users
}

export function collectAudioAttackRowUsers(
  pipeline: AssetPipelineProject,
  audioId: string
): NamedUser[] {
  const audio = (pipeline.audioAssets || []).find((a) => a.id === audioId)
  const aliases = new Set(
    [audioId, audio?.id, audio?.name].filter(Boolean).map((s) => String(s).toLowerCase())
  )
  const users: NamedUser[] = []
  for (const table of pipeline.attackTables || []) {
    for (const row of table.rows || []) {
      if (row.sfxAudioId && aliases.has(row.sfxAudioId.toLowerCase())) {
        users.push({
          id: `${table.id}:${row.id}`,
          name: `${table.name} row ${row.label || row.id}`,
          kind: 'attack-row'
        })
      }
    }
  }
  return users
}

export function assertAttackTableKeyUnique(
  pipeline: AssetPipelineProject,
  gameId: string,
  key: string | undefined,
  excludeId: string | undefined
): void {
  if (!key) return
  const clash = attackTablesOf(pipeline, gameId).find((t) => t.key === key && t.id !== excludeId)
  if (clash) {
    throw new Error(`Attack table key '${key}' already used by ${clash.id}`)
  }
}
