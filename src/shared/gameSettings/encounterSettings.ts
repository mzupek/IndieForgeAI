/**
 * Per-game encounter types and modules (game.settings). Game-agnostic: values are data.
 */

import type {
  AssetPipelineProject,
  Encounter,
  Game,
  GameEncounterModule
} from '../types/assetPipeline'
import { emptyGameSettings, DEFAULT_ENCOUNTER_TYPES } from '../studio/schema'
import { assertLabel, assertSettingsKey, normalizeSettingsKey } from './keys'
import type { NamedUser } from '../worldContent/issues'
import { formatInUseError } from '../worldContent/issues'

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
  return (pipeline.encounters || [])
    .filter((e) => e.gameId === gameId && e.moduleId === key)
    .map((e) => ({ id: e.id, name: e.name, kind: 'encounter' }))
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
}
