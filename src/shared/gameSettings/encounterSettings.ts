/**
 * Per-game encounter types and modules (game.settings). Game-agnostic: values are data.
 */

import type {
  AssetPipelineProject,
  Encounter,
  Game,
  GameEncounterModule,
  ModuleAttackKind,
  ModuleCounterKind,
  ModuleKindParamDef,
  ModuleParamSpec
} from '../types/assetPipeline'
import { assertCanRemoveParamSpec, normalizeParamSpecs } from './paramSpecs'
import { emptyGameSettings, DEFAULT_ENCOUNTER_TYPES } from '../studio/schema'
import { assertLabel, assertSettingsKey, normalizeSettingsKey } from './keys'
import type { NamedUser } from '../worldContent/issues'
import { formatInUseError } from '../worldContent/issues'

const WIN_KIND_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/

export function assertWinConditionKey(raw: string, kind = 'Win condition'): string {
  const trimmed = String(raw ?? '').trim()
  if (!WIN_KIND_PATTERN.test(trimmed)) {
    throw new Error(
      `${kind} key must start with a letter and contain only letters, digits, or underscore. Got '${raw}'`
    )
  }
  return trimmed
}

export function normalizeKindParamDef(raw: unknown, kindKey: string): ModuleKindParamDef {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Attack kind '${kindKey}' param must be { key, type, min?, max? }`)
  }
  const obj = raw as Record<string, unknown>
  const key = assertWinConditionKey(String(obj.key ?? ''), 'Attack kind param')
  const type = String(obj.type ?? 'number').trim()
  if (type !== 'number') {
    throw new Error(`Attack kind '${kindKey}' param '${key}' type must be 'number'`)
  }
  const def: ModuleKindParamDef = { key, type: 'number' }
  if (obj.min !== undefined && obj.min !== null && obj.min !== '') {
    const min = Number(obj.min)
    if (!Number.isFinite(min)) throw new Error(`Attack kind '${kindKey}' param '${key}' min must be a number`)
    def.min = min
  }
  if (obj.max !== undefined && obj.max !== null && obj.max !== '') {
    const max = Number(obj.max)
    if (!Number.isFinite(max)) throw new Error(`Attack kind '${kindKey}' param '${key}' max must be a number`)
    def.max = max
  }
  if (def.min !== undefined && def.max !== undefined && def.min > def.max) {
    throw new Error(`Attack kind '${kindKey}' param '${key}' min cannot be greater than max`)
  }
  return def
}

export function normalizeAttackKind(raw: unknown, moduleId: string): ModuleAttackKind {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Module '${moduleId}' attack kind must be { key, label, params? }`)
  }
  const obj = raw as Record<string, unknown>
  const key = assertWinConditionKey(String(obj.key ?? ''), 'Attack kind')
  const label = assertLabel(String(obj.label ?? obj.key ?? ''), 'Attack kind')
  const def: ModuleAttackKind = { key, label }
  if (obj.params !== undefined) {
    if (!Array.isArray(obj.params)) {
      throw new Error(`Attack kind '${key}' params must be an array`)
    }
    const params: ModuleKindParamDef[] = []
    const seen = new Set<string>()
    for (const item of obj.params) {
      const p = normalizeKindParamDef(item, key)
      const lower = p.key.toLowerCase()
      if (seen.has(lower)) throw new Error(`Attack kind '${key}' has duplicate param '${p.key}'`)
      seen.add(lower)
      params.push(p)
    }
    if (params.length) def.params = params
  }
  return def
}

export function normalizeAttackKinds(
  raw: ModuleAttackKind[] | undefined,
  moduleId: string
): ModuleAttackKind[] | undefined {
  if (!raw || raw.length === 0) return undefined
  const kinds: ModuleAttackKind[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const def = normalizeAttackKind(item, moduleId)
    const lower = def.key.toLowerCase()
    if (seen.has(lower)) throw new Error(`Module '${moduleId}' has duplicate attackKind '${def.key}'`)
    seen.add(lower)
    kinds.push(def)
  }
  return kinds
}

export function normalizeCounterKind(raw: unknown, moduleId: string): ModuleCounterKind {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Module '${moduleId}' counter kind must be { key, label }`)
  }
  const obj = raw as Record<string, unknown>
  const key = assertWinConditionKey(String(obj.key ?? ''), 'Counter kind')
  const label = assertLabel(String(obj.label ?? obj.key ?? ''), 'Counter kind')
  return { key, label }
}

export function normalizeCounterKinds(
  raw: ModuleCounterKind[] | undefined,
  moduleId: string
): ModuleCounterKind[] | undefined {
  if (!raw || raw.length === 0) return undefined
  const kinds: ModuleCounterKind[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const def = normalizeCounterKind(item, moduleId)
    const lower = def.key.toLowerCase()
    if (seen.has(lower)) throw new Error(`Module '${moduleId}' has duplicate counterKind '${def.key}'`)
    seen.add(lower)
    kinds.push(def)
  }
  return kinds
}

export function findAttackKind(mod: GameEncounterModule | undefined, key: string): ModuleAttackKind | undefined {
  const lower = String(key || '').trim().toLowerCase()
  return (mod?.attackKinds || []).find((k) => k.key.toLowerCase() === lower)
}

export function findCounterKind(mod: GameEncounterModule | undefined, key: string): ModuleCounterKind | undefined {
  const lower = String(key || '').trim().toLowerCase()
  return (mod?.counterKinds || []).find((k) => k.key.toLowerCase() === lower)
}

function attackTableRowUsers(
  pipeline: AssetPipelineProject,
  gameId: string,
  moduleId: string,
  match: (row: { kind: string; counter?: { kind: string } }, tableName: string, tableId: string) => boolean
): NamedUser[] {
  const users: NamedUser[] = []
  for (const table of pipeline.attackTables || []) {
    if (table.gameId !== gameId || table.moduleId !== moduleId) continue
    for (const row of table.rows || []) {
      if (match(row, table.name, table.id)) {
        users.push({ id: `${table.id}:${row.id}`, name: `${table.name} row ${row.label || row.id}`, kind: 'attack-row' })
      }
    }
  }
  return users
}

export function collectAttackKindUsers(
  pipeline: AssetPipelineProject,
  gameId: string,
  moduleId: string,
  kind: string
): NamedUser[] {
  const lower = kind.toLowerCase()
  return attackTableRowUsers(
    pipeline,
    gameId,
    moduleId,
    (row) => row.kind.toLowerCase() === lower
  )
}

export function collectCounterKindUsers(
  pipeline: AssetPipelineProject,
  gameId: string,
  moduleId: string,
  kind: string
): NamedUser[] {
  const lower = kind.toLowerCase()
  return attackTableRowUsers(
    pipeline,
    gameId,
    moduleId,
    (row) => (row.counter?.kind || '').toLowerCase() === lower
  )
}

export function normalizeWinConditions(raw: string[] | undefined, moduleId: string): string[] | undefined {
  if (!raw || raw.length === 0) return undefined
  const kinds: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const key = assertWinConditionKey(item)
    const lower = key.toLowerCase()
    if (seen.has(lower)) {
      throw new Error(`Module '${moduleId}' has duplicate winCondition '${key}'`)
    }
    seen.add(lower)
    kinds.push(key)
  }
  return kinds
}

export { DEFAULT_ENCOUNTER_TYPES }

export function ensureGameSettings(game: Game): NonNullable<Game['settings']> {
  if (!game.settings) game.settings = emptyGameSettings()
  if (!Array.isArray(game.settings.poseSlots)) game.settings.poseSlots = []
  if (!Array.isArray(game.settings.assetCategories)) game.settings.assetCategories = []
  if (!Array.isArray(game.settings.encounterTypes)) {
    game.settings.encounterTypes = [...DEFAULT_ENCOUNTER_TYPES]
  }
  if (!Array.isArray(game.settings.modules)) game.settings.modules = []
  return game.settings
}

export function gameEncounterTypes(game: Game | undefined | null): string[] {
  const raw = game?.settings?.encounterTypes
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_ENCOUNTER_TYPES]
  return raw.map((t) => normalizeSettingsKey(t)).filter(Boolean)
}

export function gameModules(game: Game | undefined | null): GameEncounterModule[] {
  return Array.isArray(game?.settings?.modules) ? game!.settings!.modules : []
}

export function findModule(game: Game | undefined | null, moduleId: string): GameEncounterModule | undefined {
  const id = normalizeSettingsKey(moduleId)
  return gameModules(game).find((m) => m.id === id)
}

export function normalizeEncounterType(raw: string): string {
  return assertSettingsKey(raw, 'Encounter type')
}

export function normalizeModule(input: {
  id: string
  label: string
  typeIds: string[]
  starKinds?: string[]
  winConditions?: string[]
  attackKinds?: ModuleAttackKind[]
  counterKinds?: ModuleCounterKind[]
  paramSpecs?: ModuleParamSpec[]
}): GameEncounterModule {
  const id = assertSettingsKey(input.id, 'Module')
  const label = assertLabel(input.label, 'Module')
  const typeIds = (input.typeIds || []).map((t) => normalizeEncounterType(t))
  if (typeIds.length === 0) {
    throw new Error(`Module '${id}' must list at least one typeId`)
  }
  const seen = new Set<string>()
  for (const t of typeIds) {
    if (seen.has(t)) throw new Error(`Module '${id}' has duplicate typeId '${t}'`)
    seen.add(t)
  }
  const def: GameEncounterModule = { id, label, typeIds }
  if (input.starKinds && input.starKinds.length > 0) {
    const kinds: string[] = []
    const kindSeen = new Set<string>()
    for (const raw of input.starKinds) {
      const kind = assertSettingsKey(raw, 'Star kind')
      if (kindSeen.has(kind)) throw new Error(`Module '${id}' has duplicate starKind '${kind}'`)
      kindSeen.add(kind)
      kinds.push(kind)
    }
    def.starKinds = kinds
  }
  const win = normalizeWinConditions(input.winConditions, id)
  if (win) def.winConditions = win
  const attacks = normalizeAttackKinds(input.attackKinds, id)
  if (attacks) def.attackKinds = attacks
  const counters = normalizeCounterKinds(input.counterKinds, id)
  if (counters) def.counterKinds = counters
  const specs = normalizeParamSpecs(input.paramSpecs, id)
  if (specs) def.paramSpecs = specs
  return def
}

export function assertKnownEncounterType(typeId: string, game: Game | undefined | null): string {
  const normalized = normalizeEncounterType(typeId)
  const types = gameEncounterTypes(game)
  if (!types.includes(normalized)) {
    throw new Error(
      `Unknown encounter type '${typeId}'. Available types: ${types.join(', ') || '(none)'}`
    )
  }
  return normalized
}

export function assertKnownModule(
  moduleId: string,
  typeId: string,
  game: Game | undefined | null
): GameEncounterModule {
  const id = assertSettingsKey(moduleId, 'Module')
  const mod = findModule(game, id)
  if (!mod) {
    const available = gameModules(game)
      .map((m) => m.id)
      .join(', ')
    throw new Error(`Unknown encounter module '${moduleId}'. Available modules: ${available || '(none)'}`)
  }
  const type = normalizeEncounterType(typeId)
  if (!mod.typeIds.includes(type)) {
    throw new Error(
      `Module '${mod.id}' does not support type '${type}'. Supported: ${mod.typeIds.join(', ')}`
    )
  }
  return mod
}

export function collectEncounterTypeUsers(
  pipeline: AssetPipelineProject,
  typeId: string,
  gameId: string
): NamedUser[] {
  const key = normalizeSettingsKey(typeId)
  return (pipeline.encounters || [])
    .filter((e) => e.gameId === gameId && e.typeId === key)
    .map((e) => ({ id: e.id, name: e.name, kind: 'encounter' }))
}

export function collectModuleUsers(
  pipeline: AssetPipelineProject,
  moduleId: string,
  gameId: string
): NamedUser[] {
  const key = normalizeSettingsKey(moduleId)
  const encounters = (pipeline.encounters || [])
    .filter((e) => e.gameId === gameId && e.moduleId === key)
    .map((e) => ({ id: e.id, name: e.name, kind: 'encounter' }))
  const enemies = (pipeline.enemies || [])
    .filter((e) => e.gameId === gameId && e.moduleId === key)
    .map((e) => ({ id: e.id, name: e.name, kind: 'enemy' }))
  const tables = (pipeline.attackTables || [])
    .filter((t) => t.gameId === gameId && t.moduleId === key)
    .map((t) => ({ id: t.id, name: t.name, kind: 'attack-table' }))
  return [...encounters, ...enemies, ...tables]
}

export function assertCanRemoveEncounterType(
  pipeline: AssetPipelineProject,
  typeId: string,
  gameId: string
): string {
  const key = normalizeEncounterType(typeId)
  const users = collectEncounterTypeUsers(pipeline, key, gameId)
  if (users.length > 0) {
    throw new Error(formatInUseError('encounter type', key, users))
  }
  return key
}

export function assertCanRemoveModule(
  pipeline: AssetPipelineProject,
  moduleId: string,
  gameId: string
): string {
  const key = assertSettingsKey(moduleId, 'Module')
  const users = collectModuleUsers(pipeline, key, gameId)
  if (users.length > 0) {
    throw new Error(formatInUseError('module', key, users))
  }
  return key
}

export function assertModuleUpdateCompatible(
  pipeline: AssetPipelineProject,
  gameId: string,
  previous: GameEncounterModule,
  next: GameEncounterModule
): void {
  const users = (pipeline.encounters || []).filter(
    (e) => e.gameId === gameId && e.moduleId === previous.id
  ) as Encounter[]
  for (const enc of users) {
    if (!next.typeIds.includes(enc.typeId)) {
      throw new Error(
        `Cannot update module '${next.id}': encounter '${enc.name}' (${enc.id}) uses type '${enc.typeId}', which this module would no longer support`
      )
    }
    if (next.starKinds && next.starKinds.length > 0) {
      for (const star of enc.stars || []) {
        if (!next.starKinds.includes(star.kind)) {
          throw new Error(
            `Cannot update module '${next.id}': encounter '${enc.name}' (${enc.id}) has star kind '${star.kind}' not in the module's starKinds`
          )
        }
      }
    }
  }
  const nextWins = new Set((next.winConditions || []).map((k) => k.toLowerCase()))
  for (const kind of previous.winConditions || []) {
    if (nextWins.has(kind.toLowerCase())) continue
    const users = (pipeline.enemies || []).filter(
      (e) =>
        e.gameId === gameId &&
        e.moduleId === previous.id &&
        e.winCondition?.kind?.toLowerCase() === kind.toLowerCase()
    )
    if (users.length > 0) {
      throw new Error(
        formatInUseError(
          'win condition',
          kind,
          users.map((e) => ({ id: e.id, name: e.name, kind: 'enemy' }))
        )
      )
    }
  }
  const nextAttacks = new Set((next.attackKinds || []).map((k) => k.key.toLowerCase()))
  for (const kind of previous.attackKinds || []) {
    if (nextAttacks.has(kind.key.toLowerCase())) continue
    const users = collectAttackKindUsers(pipeline, gameId, previous.id, kind.key)
    if (users.length > 0) throw new Error(formatInUseError('attack kind', kind.key, users))
  }
  const nextCounters = new Set((next.counterKinds || []).map((k) => k.key.toLowerCase()))
  for (const kind of previous.counterKinds || []) {
    if (nextCounters.has(kind.key.toLowerCase())) continue
    const users = collectCounterKindUsers(pipeline, gameId, previous.id, kind.key)
    if (users.length > 0) throw new Error(formatInUseError('counter kind', kind.key, users))
  }
  const nextSpecs = new Set((next.paramSpecs || []).map((s) => s.key.toLowerCase()))
  for (const spec of previous.paramSpecs || []) {
    if (nextSpecs.has(spec.key.toLowerCase())) continue
    assertCanRemoveParamSpec(pipeline, gameId, previous.id, spec.key)
  }
}
