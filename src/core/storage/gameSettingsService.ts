/**
 * Game pose slots, asset categories, and character pose slots.
 * Shared by CLI and UI. Writes go through updateAssetPipeline (studio.json lock).
 */

import type {
  AssetPipelineProject,
  Character,
  Game,
  GameAssetCategoryDef,
  GamePoseSlotDef,
  GameSettings,
  Pose,
  VisualAsset
} from '@shared/types/assetPipeline'
import {
  CORE_POSE_SLOTS,
  assertAddablePoseSlotKey,
  assertKnownPoseSlot,
  isCorePoseSlot,
  normalizePoseSlotDef,
  occupiedPoseSlotKeys
} from '@shared/gameSettings/poseSlots'
import {
  CORE_ASSET_CATEGORIES,
  assertAddableCategoryKey,
  assertKnownAssetCategory,
  isCoreAssetCategory,
  normalizeAssetCategoryDef,
  occupiedAssetCategoryKeys
} from '@shared/gameSettings/assetCategories'
import {
  assertCanRemoveEncounterType,
  assertCanRemoveModule,
  assertModuleUpdateCompatible,
  ensureGameSettings,
  gameEncounterTypes,
  gameModules,
  collectAttackKindUsers,
  collectCounterKindUsers,
  normalizeAttackKind,
  normalizeCounterKind,
  normalizeEncounterType,
  normalizeModule
} from '@shared/gameSettings/encounterSettings'
import { formatInUseError } from '@shared/worldContent/issues'
import type { GameEncounterModule, ModuleAttackKind, ModuleCounterKind } from '@shared/types/assetPipeline'
import { getAssetPipeline, updateAssetPipeline } from './studioStorage'

export interface NamedUser {
  id: string
  name: string
}

export interface SlotCategoryWriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
}

function ensureSettings(game: Game): GameSettings {
  return ensureGameSettings(game)
}

export function requireGame(pipeline: AssetPipelineProject, gameId: string): Game {
  const game = (pipeline.games || []).find((g) => g.id === gameId)
  if (!game) {
    throw new Error(`Game not found: ${gameId}`)
  }
  return game
}

export function requireCharacter(
  pipeline: AssetPipelineProject,
  characterId: string,
  gameId?: string
): Character {
  const character = (pipeline.characters || []).find((c) => c.id === characterId)
  if (!character) {
    throw new Error(`Character not found: ${characterId}`)
  }
  if (gameId && character.gameId !== gameId) {
    throw new Error(`Character '${characterId}' belongs to game '${character.gameId}', not '${gameId}'`)
  }
  return character
}

export function collectPoseSlotUsers(
  pipeline: AssetPipelineProject,
  slotKey: string,
  gameId: string,
  characterId?: string
): NamedUser[] {
  const charIds = new Set(
    (pipeline.characters || [])
      .filter((c) => c.gameId === gameId && (!characterId || c.id === characterId))
      .map((c) => c.id)
  )
  const users: NamedUser[] = []
  for (const pose of pipeline.poses || []) {
    if (pose.slot !== slotKey || !charIds.has(pose.characterId)) continue
    const character = (pipeline.characters || []).find((c) => c.id === pose.characterId)
    users.push({
      id: pose.id,
      name: `${character?.name ?? pose.characterId} ${pose.slot}`
    })
  }
  return users
}

export function collectAssetCategoryUsers(
  pipeline: AssetPipelineProject,
  categoryKey: string,
  gameId: string
): NamedUser[] {
  return (pipeline.visualAssets || [])
    .filter((a) => a.gameId === gameId && a.category === categoryKey)
    .map((a) => ({ id: a.id, name: a.name }))
}

export function formatSlotInUseError(key: string, users: NamedUser[]): string {
  const preview = users.slice(0, 5).map((u) => `${u.name} (${u.id})`).join(', ')
  const extra = users.length > 5 ? ` and ${users.length - 5} more` : ''
  return `Cannot remove pose slot '${key}': in use by ${users.length} pose(s): ${preview}${extra}`
}

export function formatCategoryInUseError(key: string, users: NamedUser[]): string {
  const preview = users.slice(0, 5).map((u) => `${u.name} (${u.id})`).join(', ')
  const extra = users.length > 5 ? ` and ${users.length - 5} more` : ''
  return `Cannot remove asset category '${key}': in use by ${users.length} asset(s): ${preview}${extra}`
}

function touch(game: Game): void {
  game.updatedAt = new Date().toISOString()
}

function touchCharacter(character: Character): void {
  character.updatedAt = new Date().toISOString()
}

export async function listGamePoseSlots(
  gameId: string,
  dataDirOverride?: string
): Promise<{ core: GamePoseSlotDef[]; game: GamePoseSlotDef[] }> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const game = requireGame(pipeline, gameId)
  return {
    core: CORE_POSE_SLOTS.map(({ layer: _layer, ...rest }) => rest),
    game: [...(game.settings?.poseSlots || [])]
  }
}

export async function addGamePoseSlot(
  gameId: string,
  input: { key: string; label: string; group?: string; required?: boolean },
  options?: SlotCategoryWriteOptions
): Promise<GamePoseSlotDef> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const characters = (pipeline.characters || []).filter((c) => c.gameId === gameId)
  const occupied = new Set<string>()
  for (const c of characters) {
    for (const k of occupiedPoseSlotKeys(game, c)) occupied.add(k)
  }
  if (occupied.size === 0) {
    for (const k of occupiedPoseSlotKeys(game, null)) occupied.add(k)
  }
  const def = normalizePoseSlotDef(input)
  assertAddablePoseSlotKey(def.key, occupied, 'Pose slot')
  if (options?.dryRun) return def
  settings.poseSlots.push(def)
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return def
}

export async function removeGamePoseSlot(
  gameId: string,
  key: string,
  options?: SlotCategoryWriteOptions
): Promise<{ removed: string }> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const slotKey = String(key || '').trim().toLowerCase()
  if (isCorePoseSlot(slotKey)) {
    throw new Error(`Cannot remove built-in pose slot '${slotKey}'`)
  }
  const index = settings.poseSlots.findIndex((s) => s.key === slotKey)
  if (index < 0) {
    throw new Error(`Game pose slot not found: ${slotKey}`)
  }
  const users = collectPoseSlotUsers(pipeline, slotKey, gameId)
  if (users.length > 0) {
    throw new Error(formatSlotInUseError(slotKey, users))
  }
  if (options?.dryRun) return { removed: slotKey }
  settings.poseSlots.splice(index, 1)
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return { removed: slotKey }
}

export async function listGameAssetCategories(
  gameId: string,
  dataDirOverride?: string
): Promise<{ core: GameAssetCategoryDef[]; game: GameAssetCategoryDef[] }> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const game = requireGame(pipeline, gameId)
  return {
    core: CORE_ASSET_CATEGORIES.map((c) => ({ ...c })),
    game: [...(game.settings?.assetCategories || [])]
  }
}

export async function addGameAssetCategory(
  gameId: string,
  input: { key: string; label: string; base?: string },
  options?: SlotCategoryWriteOptions
): Promise<GameAssetCategoryDef> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const occupied = occupiedAssetCategoryKeys(game)
  const def = normalizeAssetCategoryDef(input)
  assertAddableCategoryKey(def.key, occupied)
  if (options?.dryRun) return def
  settings.assetCategories.push(def)
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return def
}

export async function removeGameAssetCategory(
  gameId: string,
  key: string,
  options?: SlotCategoryWriteOptions
): Promise<{ removed: string }> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const catKey = String(key || '').trim().toLowerCase()
  if (isCoreAssetCategory(catKey)) {
    throw new Error(`Cannot remove built-in asset category '${catKey}'`)
  }
  const index = settings.assetCategories.findIndex((c) => c.key === catKey)
  if (index < 0) {
    throw new Error(`Game asset category not found: ${catKey}`)
  }
  const users = collectAssetCategoryUsers(pipeline, catKey, gameId)
  if (users.length > 0) {
    throw new Error(formatCategoryInUseError(catKey, users))
  }
  if (options?.dryRun) return { removed: catKey }
  settings.assetCategories.splice(index, 1)
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return { removed: catKey }
}

export async function listCharacterPoseSlots(
  characterId: string,
  gameId: string,
  dataDirOverride?: string
): Promise<{
  core: GamePoseSlotDef[]
  game: GamePoseSlotDef[]
  character: GamePoseSlotDef[]
  corePosesRequired: boolean
}> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const character = requireCharacter(pipeline, characterId, gameId)
  return {
    core: CORE_POSE_SLOTS.map(({ layer: _layer, ...rest }) => rest),
    game: [...(game.settings?.poseSlots || [])],
    character: [...(character.poseSlots || [])],
    corePosesRequired: character.corePosesRequired !== false
  }
}

export async function addCharacterPoseSlot(
  characterId: string,
  gameId: string,
  input: { key: string; label: string; group?: string; required?: boolean },
  options?: SlotCategoryWriteOptions
): Promise<GamePoseSlotDef> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  ensureSettings(game)
  const character = requireCharacter(pipeline, characterId, gameId)
  if (!character.poseSlots) character.poseSlots = []
  const occupied = occupiedPoseSlotKeys(game, character)
  const def = normalizePoseSlotDef(input)
  assertAddablePoseSlotKey(def.key, occupied, 'Pose slot')
  if (options?.dryRun) return def
  character.poseSlots.push(def)
  touchCharacter(character)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return def
}

export async function removeCharacterPoseSlot(
  characterId: string,
  gameId: string,
  key: string,
  options?: SlotCategoryWriteOptions
): Promise<{ removed: string }> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  requireGame(pipeline, gameId)
  const character = requireCharacter(pipeline, characterId, gameId)
  const slotKey = String(key || '').trim().toLowerCase()
  if (isCorePoseSlot(slotKey)) {
    throw new Error(`Cannot remove built-in pose slot '${slotKey}'`)
  }
  const slots = character.poseSlots || []
  const index = slots.findIndex((s) => s.key === slotKey)
  if (index < 0) {
    throw new Error(`Character pose slot not found: ${slotKey}`)
  }
  const users = collectPoseSlotUsers(pipeline, slotKey, gameId, characterId)
  if (users.length > 0) {
    throw new Error(formatSlotInUseError(slotKey, users))
  }
  if (options?.dryRun) return { removed: slotKey }
  slots.splice(index, 1)
  character.poseSlots = slots
  touchCharacter(character)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return { removed: slotKey }
}

export async function setCharacterCorePosesRequired(
  characterId: string,
  gameId: string,
  required: boolean,
  options?: SlotCategoryWriteOptions
): Promise<Character> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  requireGame(pipeline, gameId)
  const character = requireCharacter(pipeline, characterId, gameId)
  if (options?.dryRun) {
    return { ...character, corePosesRequired: required }
  }
  character.corePosesRequired = required
  touchCharacter(character)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return character
}

export function validatePoseSlotForWrite(
  pipeline: AssetPipelineProject,
  characterId: string,
  slot: string
): string {
  const character = requireCharacter(pipeline, characterId)
  const game = requireGame(pipeline, character.gameId)
  return assertKnownPoseSlot(slot, game, character)
}

export function validateAssetCategoryForWrite(
  pipeline: AssetPipelineProject,
  gameId: string,
  category: string
): string {
  const game = requireGame(pipeline, gameId)
  return assertKnownAssetCategory(category, game)
}

export function assertNoDuplicatePoseSlot(
  poses: Pose[],
  characterId: string,
  slot: string,
  replacePoseId?: string
): void {
  const existing = poses.find(
    (p) => p.characterId === characterId && p.slot === slot && p.id !== replacePoseId
  )
  if (existing) {
    throw new Error(`Character already has a pose in slot '${slot}' (${existing.id})`)
  }
}

export function assertVisualAssetCategory(
  asset: VisualAsset,
  pipeline: AssetPipelineProject
): void {
  validateAssetCategoryForWrite(pipeline, asset.gameId, asset.category)
}

export async function listEncounterTypes(
  gameId: string,
  dataDirOverride?: string
): Promise<string[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const game = requireGame(pipeline, gameId)
  return gameEncounterTypes(game)
}

export async function addEncounterType(
  gameId: string,
  typeId: string,
  options?: SlotCategoryWriteOptions
): Promise<string> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const key = normalizeEncounterType(typeId)
  if (settings.encounterTypes.includes(key)) {
    throw new Error(`Encounter type '${key}' already exists`)
  }
  if (options?.dryRun) return key
  settings.encounterTypes.push(key)
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return key
}

export async function removeEncounterType(
  gameId: string,
  typeId: string,
  options?: SlotCategoryWriteOptions
): Promise<{ removed: string }> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const key = assertCanRemoveEncounterType(pipeline, typeId, gameId)
  const index = settings.encounterTypes.findIndex((t) => t === key)
  if (index < 0) {
    throw new Error(`Encounter type not found: ${key}`)
  }
  if (options?.dryRun) return { removed: key }
  settings.encounterTypes.splice(index, 1)
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return { removed: key }
}

export async function listEncounterModules(
  gameId: string,
  dataDirOverride?: string
): Promise<GameEncounterModule[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  const game = requireGame(pipeline, gameId)
  return gameModules(game).map((m) => ({
    ...m,
    typeIds: [...m.typeIds],
    starKinds: m.starKinds ? [...m.starKinds] : undefined,
    winConditions: m.winConditions ? [...m.winConditions] : undefined,
    attackKinds: m.attackKinds ? m.attackKinds.map((k) => ({ ...k, params: k.params ? k.params.map((p) => ({ ...p })) : undefined })) : undefined,
    counterKinds: m.counterKinds ? m.counterKinds.map((k) => ({ ...k })) : undefined
  }))
}

export async function addEncounterModule(
  gameId: string,
  input: {
    id: string
    label: string
    typeIds: string[]
    starKinds?: string[]
    winConditions?: string[]
    attackKinds?: ModuleAttackKind[]
    counterKinds?: ModuleCounterKind[]
  },
  options?: SlotCategoryWriteOptions
): Promise<GameEncounterModule> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const def = normalizeModule(input)
  if (settings.modules.some((m) => m.id === def.id)) {
    throw new Error(`Module '${def.id}' already exists`)
  }
  for (const t of def.typeIds) {
    if (!settings.encounterTypes.includes(t)) {
      throw new Error(`Module typeId '${t}' is not in this game's encounterTypes`)
    }
  }
  if (options?.dryRun) return def
  settings.modules.push(def)
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return def
}

export async function updateEncounterModule(
  gameId: string,
  moduleId: string,
  input: {
    label?: string
    typeIds?: string[]
    starKinds?: string[]
    winConditions?: string[]
    attackKinds?: ModuleAttackKind[]
    counterKinds?: ModuleCounterKind[]
  },
  options?: SlotCategoryWriteOptions
): Promise<GameEncounterModule> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const index = settings.modules.findIndex((m) => m.id === moduleId.trim().toLowerCase() || m.id === moduleId)
  if (index < 0) throw new Error(`Module not found: ${moduleId}`)
  const previous = settings.modules[index]
  const next = normalizeModule({
    id: previous.id,
    label: input.label ?? previous.label,
    typeIds: input.typeIds ?? previous.typeIds,
    starKinds: input.starKinds !== undefined ? input.starKinds : previous.starKinds,
    winConditions: input.winConditions !== undefined ? input.winConditions : previous.winConditions,
    attackKinds: input.attackKinds !== undefined ? input.attackKinds : previous.attackKinds,
    counterKinds: input.counterKinds !== undefined ? input.counterKinds : previous.counterKinds
  })
  for (const t of next.typeIds) {
    if (!settings.encounterTypes.includes(t)) {
      throw new Error(`Module typeId '${t}' is not in this game's encounterTypes`)
    }
  }
  assertModuleUpdateCompatible(pipeline, gameId, previous, next)
  if (options?.dryRun) return next
  settings.modules[index] = next
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return next
}

export async function removeEncounterModule(
  gameId: string,
  moduleId: string,
  options?: SlotCategoryWriteOptions
): Promise<{ removed: string }> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const key = assertCanRemoveModule(pipeline, moduleId, gameId)
  const index = settings.modules.findIndex((m) => m.id === key)
  if (index < 0) throw new Error(`Module not found: ${key}`)
  if (options?.dryRun) return { removed: key }
  settings.modules.splice(index, 1)
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return { removed: key }
}

export async function addModuleAttackKind(
  gameId: string,
  moduleId: string,
  input: { key: string; label?: string; params?: ModuleKindParamDefLike[] },
  options?: SlotCategoryWriteOptions
): Promise<GameEncounterModule> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const index = settings.modules.findIndex((m) => m.id === moduleId.trim().toLowerCase() || m.id === moduleId)
  if (index < 0) throw new Error(`Module not found: ${moduleId}`)
  const previous = settings.modules[index]
  const def = normalizeAttackKind(
    { key: input.key, label: input.label || input.key, params: input.params },
    previous.id
  )
  const existing = previous.attackKinds || []
  if (existing.some((k) => k.key.toLowerCase() === def.key.toLowerCase())) {
    throw new Error(`Attack kind '${def.key}' already exists on module '${previous.id}'`)
  }
  const next = normalizeModule({
    ...previous,
    attackKinds: [...existing, def]
  })
  if (options?.dryRun) return next
  settings.modules[index] = next
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return next
}

export async function removeModuleAttackKind(
  gameId: string,
  moduleId: string,
  key: string,
  options?: SlotCategoryWriteOptions
): Promise<GameEncounterModule> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const index = settings.modules.findIndex((m) => m.id === moduleId.trim().toLowerCase() || m.id === moduleId)
  if (index < 0) throw new Error(`Module not found: ${moduleId}`)
  const previous = settings.modules[index]
  const found = (previous.attackKinds || []).find((k) => k.key.toLowerCase() === key.trim().toLowerCase())
  if (!found) throw new Error(`Attack kind '${key}' was not found on module '${previous.id}'`)
  const users = collectAttackKindUsers(pipeline, gameId, previous.id, found.key)
  if (users.length > 0) throw new Error(formatInUseError('attack kind', found.key, users))
  const next = normalizeModule({
    ...previous,
    attackKinds: (previous.attackKinds || []).filter((k) => k.key.toLowerCase() !== found.key.toLowerCase())
  })
  if (options?.dryRun) return next
  settings.modules[index] = next
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return next
}

export async function addModuleCounterKind(
  gameId: string,
  moduleId: string,
  input: { key: string; label?: string },
  options?: SlotCategoryWriteOptions
): Promise<GameEncounterModule> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const index = settings.modules.findIndex((m) => m.id === moduleId.trim().toLowerCase() || m.id === moduleId)
  if (index < 0) throw new Error(`Module not found: ${moduleId}`)
  const previous = settings.modules[index]
  const def = normalizeCounterKind({ key: input.key, label: input.label || input.key }, previous.id)
  const existing = previous.counterKinds || []
  if (existing.some((k) => k.key.toLowerCase() === def.key.toLowerCase())) {
    throw new Error(`Counter kind '${def.key}' already exists on module '${previous.id}'`)
  }
  const next = normalizeModule({
    ...previous,
    counterKinds: [...existing, def]
  })
  if (options?.dryRun) return next
  settings.modules[index] = next
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return next
}

export async function removeModuleCounterKind(
  gameId: string,
  moduleId: string,
  key: string,
  options?: SlotCategoryWriteOptions
): Promise<GameEncounterModule> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  const index = settings.modules.findIndex((m) => m.id === moduleId.trim().toLowerCase() || m.id === moduleId)
  if (index < 0) throw new Error(`Module not found: ${moduleId}`)
  const previous = settings.modules[index]
  const found = (previous.counterKinds || []).find((k) => k.key.toLowerCase() === key.trim().toLowerCase())
  if (!found) throw new Error(`Counter kind '${key}' was not found on module '${previous.id}'`)
  const users = collectCounterKindUsers(pipeline, gameId, previous.id, found.key)
  if (users.length > 0) throw new Error(formatInUseError('counter kind', found.key, users))
  const next = normalizeModule({
    ...previous,
    counterKinds: (previous.counterKinds || []).filter((k) => k.key.toLowerCase() !== found.key.toLowerCase())
  })
  if (options?.dryRun) return next
  settings.modules[index] = next
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return next
}

type ModuleKindParamDefLike = { key: string; type?: string; min?: number; max?: number }

export async function updateGameSettingsFromFile(
  gameId: string,
  patch: {
    encounterTypes?: string[]
    modules?: GameEncounterModule[]
    poseSlots?: GameSettings['poseSlots']
    assetCategories?: GameSettings['assetCategories']
  },
  options?: SlotCategoryWriteOptions
): Promise<GameSettings> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const game = requireGame(pipeline, gameId)
  const settings = ensureSettings(game)
  if (patch.encounterTypes) {
    const next = patch.encounterTypes.map((t) => normalizeEncounterType(t))
    const removed = settings.encounterTypes.filter((t) => !next.includes(t))
    for (const t of removed) assertCanRemoveEncounterType(pipeline, t, gameId)
    settings.encounterTypes = next
  }
  if (patch.modules) {
    const next = patch.modules.map((m) => normalizeModule(m))
    const nextIds = new Set(next.map((m) => m.id))
    for (const prev of settings.modules) {
      if (!nextIds.has(prev.id)) assertCanRemoveModule(pipeline, prev.id, gameId)
    }
    for (const n of next) {
      const prev = settings.modules.find((m) => m.id === n.id)
      if (prev) assertModuleUpdateCompatible(pipeline, gameId, prev, n)
      for (const t of n.typeIds) {
        if (!settings.encounterTypes.includes(t)) {
          throw new Error(`Module typeId '${t}' is not in this game's encounterTypes`)
        }
      }
    }
    settings.modules = next
  }
  if (patch.poseSlots) settings.poseSlots = patch.poseSlots
  if (patch.assetCategories) settings.assetCategories = patch.assetCategories
  if (options?.dryRun) return settings
  touch(game)
  await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return settings
}
