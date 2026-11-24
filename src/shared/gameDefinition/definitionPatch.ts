/**
 * Game Definition merge-patch, section extraction, and validation.
 * Shared by CLI and tests (no Electron). Arrays of objects match by `id`.
 */

import { randomUUID } from 'crypto'
import type {
  AssetPipelineProject,
  GameDefinition,
  GameDefinitionStage,
  InteractionStub,
  MVPBoardItem,
  MVPBoardItemType,
  MVPBoardStatus,
  ThemeSlot,
  TuningProfile
} from '../types/assetPipeline'
import { clipVisibleInGame } from '../storyboard/clipBlocks'

export const GAME_DEFINITION_STAGES: GameDefinitionStage[] = ['MVP', 'Beta', 'Testing', 'Release']
export const MVP_ITEM_TYPES: MVPBoardItemType[] = ['asset', 'system', 'content', 'tuning']
export const MVP_STATUSES: MVPBoardStatus[] = ['needed', 'partial', 'done', 'cut']

export const DEFINITION_SECTION_KEYS = [
  'stage',
  'pillars',
  'puzzleCore',
  'storySynopsis',
  'cast',
  'linkedAssets',
  'themeSlots',
  'interactions',
  'tuningProfiles',
  'keepCutInvent',
  'mvpBoard',
  'markdownSource'
] as const

export type DefinitionSectionKey = (typeof DEFINITION_SECTION_KEYS)[number]

const SECTION_ALIASES: Record<string, DefinitionSectionKey> = {
  stage: 'stage',
  pillars: 'pillars',
  pillar: 'pillars',
  puzzlecore: 'puzzleCore',
  'puzzle-core': 'puzzleCore',
  puzzle_core: 'puzzleCore',
  storysynopsis: 'storySynopsis',
  'story-synopsis': 'storySynopsis',
  story_synopsis: 'storySynopsis',
  synopsis: 'storySynopsis',
  cast: 'cast',
  linkedassets: 'linkedAssets',
  'linked-assets': 'linkedAssets',
  linked_assets: 'linkedAssets',
  links: 'linkedAssets',
  themeslots: 'themeSlots',
  'theme-slots': 'themeSlots',
  theme_slots: 'themeSlots',
  'theme-slot': 'themeSlots',
  interactions: 'interactions',
  interaction: 'interactions',
  tuningprofiles: 'tuningProfiles',
  'tuning-profiles': 'tuningProfiles',
  tuning: 'tuningProfiles',
  keepcutinvent: 'keepCutInvent',
  'keep-cut-invent': 'keepCutInvent',
  keep: 'keepCutInvent',
  cut: 'keepCutInvent',
  invent: 'keepCutInvent',
  mvpboard: 'mvpBoard',
  'mvp-board': 'mvpBoard',
  mvp: 'mvpBoard',
  markdownsource: 'markdownSource',
  'markdown-source': 'markdownSource',
  markdown: 'markdownSource'
}

const PATCH_KEY_ALIASES: Record<string, DefinitionSectionKey> = {
  stage: 'stage',
  pillars: 'pillars',
  puzzleCore: 'puzzleCore',
  'puzzle-core': 'puzzleCore',
  storySynopsis: 'storySynopsis',
  'story-synopsis': 'storySynopsis',
  cast: 'cast',
  linkedAssets: 'linkedAssets',
  'linked-assets': 'linkedAssets',
  themeSlots: 'themeSlots',
  'theme-slots': 'themeSlots',
  interactions: 'interactions',
  tuningProfiles: 'tuningProfiles',
  tuning: 'tuningProfiles',
  keepCutInvent: 'keepCutInvent',
  'keep-cut-invent': 'keepCutInvent',
  mvpBoard: 'mvpBoard',
  mvp: 'mvpBoard',
  markdownSource: 'markdownSource',
  'markdown-source': 'markdownSource'
}

const IDENTITY_KEYS = new Set(['id', 'gameId', 'createdAt', 'updatedAt'])

export interface DefinitionDiffEntry {
  path: string
  op: 'add' | 'update' | 'remove'
  before?: unknown
  after?: unknown
}

export interface DefinitionDiff {
  entries: DefinitionDiffEntry[]
}

export interface DefinitionPatchResult {
  next: GameDefinition
  diff: DefinitionDiff
}

export function cloneGameDefinition(definition: GameDefinition): GameDefinition {
  return JSON.parse(JSON.stringify(definition)) as GameDefinition
}

export function emptyGameDefinition(
  gameId: string,
  now = '2026-01-01T00:00:00.000Z'
): GameDefinition {
  return {
    id: 'def-empty',
    gameId,
    stage: 'MVP',
    pillars: [],
    puzzleCore: '',
    storySynopsis: '',
    cast: [],
    linkedAssets: { poses: [], clips: [], presets: [] },
    themeSlots: [],
    interactions: [],
    tuningProfiles: [],
    keepCutInvent: { keep: [], cut: [], invent: [] },
    mvpBoard: [],
    markdownSource: '',
    createdAt: now,
    updatedAt: now
  }
}

export function parseStage(value: string): GameDefinitionStage {
  if ((GAME_DEFINITION_STAGES as string[]).includes(value)) {
    return value as GameDefinitionStage
  }
  throw new Error(`Invalid stage '${value}'. Use ${GAME_DEFINITION_STAGES.join('|')}`)
}

export function parseMvpType(value: string): MVPBoardItemType {
  if ((MVP_ITEM_TYPES as string[]).includes(value)) {
    return value as MVPBoardItemType
  }
  throw new Error(`Invalid MVP type '${value}'. Use ${MVP_ITEM_TYPES.join('|')}`)
}

export function parseMvpStatus(value: string): MVPBoardStatus {
  if ((MVP_STATUSES as string[]).includes(value)) {
    return value as MVPBoardStatus
  }
  throw new Error(`Invalid MVP status '${value}'. Use ${MVP_STATUSES.join('|')}`)
}

export function parseParamValue(raw: string): string | number | boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Number(raw)
  }
  return raw
}

export function parseParamAssignment(raw: string): { key: string; value: string | number | boolean } {
  const eq = raw.indexOf('=')
  if (eq <= 0) {
    throw new Error(`Invalid --param '${raw}'. Use key=value`)
  }
  const key = raw.slice(0, eq).trim()
  const value = raw.slice(eq + 1)
  if (!key) {
    throw new Error(`Invalid --param '${raw}'. Use key=value`)
  }
  return { key, value: parseParamValue(value) }
}

export function normalizeSectionName(name: string): DefinitionSectionKey {
  const key = SECTION_ALIASES[name.trim().toLowerCase()]
  if (!key) {
    throw new Error(
      `Unknown section '${name}'. Use ${DEFINITION_SECTION_KEYS.join(', ')} (aliases: puzzle-core, story-synopsis, linked-assets, theme-slots, tuning, mvp, markdown)`
    )
  }
  return key
}

export function extractSection(definition: GameDefinition, section: string): unknown {
  const key = normalizeSectionName(section)
  return definition[key]
}

export function listSectionNames(): string[] {
  return [...DEFINITION_SECTION_KEYS]
}

export function updatesFromDefinition(
  definition: GameDefinition
): Partial<Omit<GameDefinition, 'id' | 'gameId' | 'createdAt'>> {
  const {
    id: _id,
    gameId: _gameId,
    createdAt: _createdAt,
    ...rest
  } = definition
  return rest
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDeleteFlag(item: Record<string, unknown>): boolean {
  return item.delete === true || item._delete === true
}

export function resolveStringIndex(
  list: string[],
  options: { index?: number; id?: string },
  label: string
): number {
  if (options.id !== undefined && options.id !== '') {
    const idx = list.indexOf(options.id)
    if (idx === -1) {
      throw new Error(`${label} not found: '${options.id}'`)
    }
    if (options.index !== undefined && options.index !== idx) {
      throw new Error(`${label}: --index ${options.index} does not match --id '${options.id}'`)
    }
    return idx
  }
  if (options.index === undefined) {
    throw new Error(`${label}: provide --index <n> (0-based) or --id <text>`)
  }
  if (!Number.isInteger(options.index) || options.index < 0 || options.index >= list.length) {
    throw new Error(`${label}: index ${options.index} is out of range (0..${Math.max(0, list.length - 1)})`)
  }
  return options.index
}

export function addStringItem(list: string[], text: string, label: string): string[] {
  const value = text.trim()
  if (!value) {
    throw new Error(`${label} text is required`)
  }
  if (list.includes(value)) {
    throw new Error(`${label} already contains '${value}'`)
  }
  return [...list, value]
}

export function updateStringItem(
  list: string[],
  options: { index?: number; id?: string },
  text: string,
  label: string
): string[] {
  const value = text.trim()
  if (!value) {
    throw new Error(`${label} text is required`)
  }
  const idx = resolveStringIndex(list, options, label)
  const next = [...list]
  next[idx] = value
  return next
}

export function removeStringItem(
  list: string[],
  options: { index?: number; id?: string },
  label: string
): string[] {
  const idx = resolveStringIndex(list, options, label)
  return list.filter((_, i) => i !== idx)
}

function mergeStringList(current: string[], patch: unknown, label: string): string[] {
  if (Array.isArray(patch)) {
    if (!patch.every((item) => typeof item === 'string')) {
      throw new Error(`${label} must be an array of strings`)
    }
    return [...patch]
  }
  if (!isPlainObject(patch)) {
    throw new Error(`${label} patch must be a string array or { add, remove }`)
  }
  const extra = Object.keys(patch).filter((k) => k !== 'add' && k !== 'remove')
  if (extra.length > 0) {
    throw new Error(`${label} patch has unknown keys: ${extra.join(', ')}`)
  }
  let next = [...current]
  if (patch.add !== undefined) {
    if (!Array.isArray(patch.add) || !patch.add.every((item) => typeof item === 'string')) {
      throw new Error(`${label}.add must be an array of strings`)
    }
    for (const item of patch.add) {
      if (!next.includes(item)) next.push(item)
    }
  }
  if (patch.remove !== undefined) {
    if (!Array.isArray(patch.remove) || !patch.remove.every((item) => typeof item === 'string')) {
      throw new Error(`${label}.remove must be an array of strings`)
    }
    const drop = new Set(patch.remove)
    next = next.filter((item) => !drop.has(item))
  }
  return next
}

function mergeParams(
  current: Record<string, number | string | boolean>,
  patch: unknown,
  label: string
): Record<string, number | string | boolean> {
  if (!isPlainObject(patch)) {
    throw new Error(`${label} must be an object of key → number|string|boolean (null unsets)`)
  }
  const next = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key]
      continue
    }
    if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
      throw new Error(`${label}.${key} must be a number, string, boolean, or null`)
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`${label}.${key} must be a finite number`)
    }
    next[key] = value
  }
  return next
}

type IdItem = { id: string }

function mergeIdArray<T extends IdItem>(
  current: T[],
  patch: unknown,
  label: string,
  materialize: (incoming: Record<string, unknown>, existing: T | undefined) => T
): T[] {
  if (!Array.isArray(patch)) {
    throw new Error(`${label} patch must be an array (match by id; { id, delete: true } removes)`)
  }
  const next = [...current]
  for (const raw of patch) {
    if (!isPlainObject(raw)) {
      throw new Error(`${label} items must be objects`)
    }
    const id = typeof raw.id === 'string' && raw.id ? raw.id : undefined
    if (isDeleteFlag(raw)) {
      if (!id) {
        throw new Error(`${label} delete requires id`)
      }
      const idx = next.findIndex((item) => item.id === id)
      if (idx === -1) {
        throw new Error(`${label} not found: ${id}`)
      }
      next.splice(idx, 1)
      continue
    }
    if (id) {
      const idx = next.findIndex((item) => item.id === id)
      if (idx === -1) {
        next.push(materialize(raw, undefined))
      } else {
        next[idx] = materialize(raw, next[idx])
      }
    } else {
      next.push(materialize(raw, undefined))
    }
  }
  const seen = new Set<string>()
  for (const item of next) {
    if (seen.has(item.id)) {
      throw new Error(`${label} has duplicate id '${item.id}'`)
    }
    seen.add(item.id)
  }
  return next
}

function findById<T extends IdItem>(list: T[], id: string, label: string): T {
  const item = list.find((entry) => entry.id === id)
  if (!item) {
    throw new Error(`${label} not found: ${id}`)
  }
  return item
}

export function requireItemById<T extends IdItem>(list: T[], id: string, label: string): T {
  return findById(list, id, label)
}

function assertKnownKeys(obj: Record<string, unknown>, allowed: string[], label: string): void {
  const extra = Object.keys(obj).filter(
    (k) => !allowed.includes(k) && k !== 'delete' && k !== '_delete'
  )
  if (extra.length > 0) {
    throw new Error(`${label} has unknown keys: ${extra.join(', ')}`)
  }
}

function materializeThemeSlot(incoming: Record<string, unknown>, existing: ThemeSlot | undefined): ThemeSlot {
  assertKnownKeys(incoming, ['id', 'name', 'description', 'reference'], 'themeSlots item')
  const name = incoming.name !== undefined ? String(incoming.name) : existing?.name
  if (!name || !name.trim()) {
    throw new Error('theme slot --name is required')
  }
  return {
    id: existing?.id || (typeof incoming.id === 'string' && incoming.id) || randomUUID(),
    name: name.trim(),
    description:
      incoming.description !== undefined
        ? incoming.description === null
          ? undefined
          : String(incoming.description)
        : existing?.description,
    reference:
      incoming.reference !== undefined
        ? incoming.reference === null
          ? undefined
          : String(incoming.reference)
        : existing?.reference
  }
}

function materializeInteraction(
  incoming: Record<string, unknown>,
  existing: InteractionStub | undefined
): InteractionStub {
  assertKnownKeys(incoming, ['id', 'name', 'description', 'assetRefs'], 'interactions item')
  const name = incoming.name !== undefined ? String(incoming.name) : existing?.name
  if (!name || !name.trim()) {
    throw new Error('interaction --name is required')
  }
  let assetRefs = existing?.assetRefs ? [...existing.assetRefs] : []
  if (incoming.assetRefs !== undefined) {
    if (!Array.isArray(incoming.assetRefs) || !incoming.assetRefs.every((r) => typeof r === 'string')) {
      throw new Error('interaction assetRefs must be an array of strings')
    }
    assetRefs = [...incoming.assetRefs]
  }
  return {
    id: existing?.id || (typeof incoming.id === 'string' && incoming.id) || randomUUID(),
    name: name.trim(),
    description:
      incoming.description !== undefined ? String(incoming.description) : existing?.description || '',
    assetRefs
  }
}

function materializeTuning(
  incoming: Record<string, unknown>,
  existing: TuningProfile | undefined
): TuningProfile {
  assertKnownKeys(incoming, ['id', 'name', 'params', 'notes'], 'tuningProfiles item')
  const name = incoming.name !== undefined ? String(incoming.name) : existing?.name
  if (!name || !name.trim()) {
    throw new Error('tuning profile --name is required')
  }
  const params =
    incoming.params !== undefined
      ? mergeParams(existing?.params || {}, incoming.params, 'tuning params')
      : { ...(existing?.params || {}) }
  return {
    id: existing?.id || (typeof incoming.id === 'string' && incoming.id) || randomUUID(),
    name: name.trim(),
    params,
    notes:
      incoming.notes !== undefined
        ? incoming.notes === null
          ? undefined
          : String(incoming.notes)
        : existing?.notes
  }
}

function materializeMvp(incoming: Record<string, unknown>, existing: MVPBoardItem | undefined): MVPBoardItem {
  assertKnownKeys(incoming, ['id', 'item', 'type', 'status', 'notes'], 'mvpBoard item')
  const item = incoming.item !== undefined ? String(incoming.item) : existing?.item
  if (!item || !item.trim()) {
    throw new Error('mvp --item is required')
  }
  const typeRaw = incoming.type !== undefined ? String(incoming.type) : existing?.type
  if (!typeRaw) {
    throw new Error('mvp --type is required (asset|system|content|tuning)')
  }
  const statusRaw = incoming.status !== undefined ? String(incoming.status) : existing?.status || 'needed'
  return {
    id: existing?.id || (typeof incoming.id === 'string' && incoming.id) || randomUUID(),
    item: item.trim(),
    type: parseMvpType(typeRaw),
    status: parseMvpStatus(statusRaw),
    notes:
      incoming.notes !== undefined
        ? incoming.notes === null
          ? undefined
          : String(incoming.notes)
        : existing?.notes
  }
}

function mergeLinkedAssets(
  current: GameDefinition['linkedAssets'],
  patch: unknown
): GameDefinition['linkedAssets'] {
  if (!isPlainObject(patch)) {
    throw new Error('linkedAssets patch must be an object with poses, clips, and/or presets')
  }
  const extra = Object.keys(patch).filter((k) => !['poses', 'clips', 'presets'].includes(k))
  if (extra.length > 0) {
    throw new Error(`linkedAssets has unknown keys: ${extra.join(', ')}`)
  }
  return {
    poses: patch.poses !== undefined ? mergeStringList(current.poses, patch.poses, 'linkedAssets.poses') : [...current.poses],
    clips: patch.clips !== undefined ? mergeStringList(current.clips, patch.clips, 'linkedAssets.clips') : [...current.clips],
    presets:
      patch.presets !== undefined
        ? mergeStringList(current.presets, patch.presets, 'linkedAssets.presets')
        : [...current.presets]
  }
}

function mergeKeepCutInvent(
  current: GameDefinition['keepCutInvent'],
  patch: unknown
): GameDefinition['keepCutInvent'] {
  if (!isPlainObject(patch)) {
    throw new Error('keepCutInvent patch must be an object with keep, cut, and/or invent')
  }
  const extra = Object.keys(patch).filter((k) => !['keep', 'cut', 'invent'].includes(k))
  if (extra.length > 0) {
    throw new Error(`keepCutInvent has unknown keys: ${extra.join(', ')}`)
  }
  return {
    keep: patch.keep !== undefined ? mergeStringList(current.keep, patch.keep, 'keepCutInvent.keep') : [...current.keep],
    cut: patch.cut !== undefined ? mergeStringList(current.cut, patch.cut, 'keepCutInvent.cut') : [...current.cut],
    invent:
      patch.invent !== undefined
        ? mergeStringList(current.invent, patch.invent, 'keepCutInvent.invent')
        : [...current.invent]
  }
}

export function applyDefinitionMergePatch(
  current: GameDefinition,
  patch: Record<string, unknown>,
  pipeline: AssetPipelineProject
): DefinitionPatchResult {
  if (!isPlainObject(patch)) {
    throw new Error('Patch must be a JSON object')
  }
  const next = cloneGameDefinition(current)
  for (const [rawKey, value] of Object.entries(patch)) {
    if (IDENTITY_KEYS.has(rawKey)) {
      throw new Error(`Cannot change '${rawKey}' via definition apply`)
    }
    const key = PATCH_KEY_ALIASES[rawKey]
    if (!key) {
      throw new Error(
        `Unknown patch field '${rawKey}'. Allowed: ${Object.keys(PATCH_KEY_ALIASES).join(', ')}`
      )
    }
    if (value === undefined) continue
    switch (key) {
      case 'stage':
        if (typeof value !== 'string') throw new Error('stage must be a string')
        next.stage = parseStage(value)
        break
      case 'pillars':
        next.pillars = mergeStringList(next.pillars, value, 'pillars')
        break
      case 'puzzleCore':
        if (typeof value !== 'string') throw new Error('puzzleCore must be a string')
        next.puzzleCore = value
        break
      case 'storySynopsis':
        if (typeof value !== 'string') throw new Error('storySynopsis must be a string')
        next.storySynopsis = value
        break
      case 'cast':
        next.cast = mergeStringList(next.cast, value, 'cast')
        break
      case 'linkedAssets':
        next.linkedAssets = mergeLinkedAssets(next.linkedAssets, value)
        break
      case 'themeSlots':
        next.themeSlots = mergeIdArray(next.themeSlots, value, 'themeSlots', materializeThemeSlot)
        break
      case 'interactions':
        next.interactions = mergeIdArray(next.interactions, value, 'interactions', materializeInteraction)
        break
      case 'tuningProfiles':
        next.tuningProfiles = mergeIdArray(next.tuningProfiles, value, 'tuningProfiles', materializeTuning)
        break
      case 'keepCutInvent':
        next.keepCutInvent = mergeKeepCutInvent(next.keepCutInvent, value)
        break
      case 'mvpBoard':
        next.mvpBoard = mergeIdArray(next.mvpBoard, value, 'mvpBoard', materializeMvp)
        break
      case 'markdownSource':
        if (typeof value !== 'string') throw new Error('markdownSource must be a string')
        next.markdownSource = value
        break
    }
  }
  validateGameDefinition(next, pipeline)
  return { next, diff: diffDefinitions(current, next) }
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function diffStringArray(path: string, before: string[], after: string[]): DefinitionDiffEntry[] {
  const entries: DefinitionDiffEntry[] = []
  for (const item of after) {
    if (!before.includes(item)) {
      entries.push({ path: `${path}[]`, op: 'add', after: item })
    }
  }
  for (const item of before) {
    if (!after.includes(item)) {
      entries.push({ path: `${path}[]`, op: 'remove', before: item })
    }
  }
  if (entries.length === 0 && !jsonEqual(before, after)) {
    entries.push({ path, op: 'update', before, after })
  }
  return entries
}

function diffIdArray<T extends IdItem>(path: string, before: T[], after: T[]): DefinitionDiffEntry[] {
  const entries: DefinitionDiffEntry[] = []
  const beforeMap = new Map(before.map((item) => [item.id, item]))
  const afterMap = new Map(after.map((item) => [item.id, item]))
  for (const [id, item] of afterMap) {
    const prev = beforeMap.get(id)
    if (!prev) {
      entries.push({ path: `${path}[${id}]`, op: 'add', after: item })
    } else if (!jsonEqual(prev, item)) {
      entries.push({ path: `${path}[${id}]`, op: 'update', before: prev, after: item })
    }
  }
  for (const [id, item] of beforeMap) {
    if (!afterMap.has(id)) {
      entries.push({ path: `${path}[${id}]`, op: 'remove', before: item })
    }
  }
  return entries
}

export function diffDefinitions(before: GameDefinition, after: GameDefinition): DefinitionDiff {
  const entries: DefinitionDiffEntry[] = []
  if (before.stage !== after.stage) {
    entries.push({ path: 'stage', op: 'update', before: before.stage, after: after.stage })
  }
  entries.push(...diffStringArray('pillars', before.pillars, after.pillars))
  if (before.puzzleCore !== after.puzzleCore) {
    entries.push({ path: 'puzzleCore', op: 'update', before: before.puzzleCore, after: after.puzzleCore })
  }
  if (before.storySynopsis !== after.storySynopsis) {
    entries.push({
      path: 'storySynopsis',
      op: 'update',
      before: before.storySynopsis,
      after: after.storySynopsis
    })
  }
  entries.push(...diffStringArray('cast', before.cast, after.cast))
  entries.push(...diffStringArray('linkedAssets.poses', before.linkedAssets.poses, after.linkedAssets.poses))
  entries.push(...diffStringArray('linkedAssets.clips', before.linkedAssets.clips, after.linkedAssets.clips))
  entries.push(
    ...diffStringArray('linkedAssets.presets', before.linkedAssets.presets, after.linkedAssets.presets)
  )
  entries.push(...diffIdArray('themeSlots', before.themeSlots, after.themeSlots))
  entries.push(...diffIdArray('interactions', before.interactions, after.interactions))
  entries.push(...diffIdArray('tuningProfiles', before.tuningProfiles, after.tuningProfiles))
  entries.push(...diffStringArray('keepCutInvent.keep', before.keepCutInvent.keep, after.keepCutInvent.keep))
  entries.push(...diffStringArray('keepCutInvent.cut', before.keepCutInvent.cut, after.keepCutInvent.cut))
  entries.push(
    ...diffStringArray('keepCutInvent.invent', before.keepCutInvent.invent, after.keepCutInvent.invent)
  )
  entries.push(...diffIdArray('mvpBoard', before.mvpBoard, after.mvpBoard))
  if (before.markdownSource !== after.markdownSource) {
    entries.push({
      path: 'markdownSource',
      op: 'update',
      before: before.markdownSource,
      after: after.markdownSource
    })
  }
  return { entries }
}

export function assertCharacterInGame(
  pipeline: AssetPipelineProject,
  gameId: string,
  characterId: string
): void {
  const character = (pipeline.characters || []).find((c) => c.id === characterId)
  if (!character) {
    throw new Error(`Character not found: ${characterId}`)
  }
  if (character.gameId !== gameId) {
    throw new Error(`Character '${characterId}' belongs to game '${character.gameId}', not '${gameId}'`)
  }
}

export function assertPoseInGame(pipeline: AssetPipelineProject, gameId: string, poseId: string): void {
  const pose = (pipeline.poses || []).find((p) => p.id === poseId)
  if (!pose) {
    throw new Error(`Pose not found: ${poseId}`)
  }
  assertCharacterInGame(pipeline, gameId, pose.characterId)
}

export function assertClipInGame(pipeline: AssetPipelineProject, gameId: string, clipId: string): void {
  const clip = (pipeline.clips || []).find((c) => c.id === clipId)
  if (!clip) {
    throw new Error(`Clip not found: ${clipId}`)
  }
  if (!clipVisibleInGame(clip, pipeline, gameId)) {
    throw new Error(`Clip '${clipId}' is not in game '${gameId}'`)
  }
}

export function assertPresetExists(pipeline: AssetPipelineProject, presetId: string): void {
  const preset = (pipeline.scenePresets || []).find((p) => p.id === presetId)
  if (!preset) {
    throw new Error(`Preset not found: ${presetId}`)
  }
}

export function validateGameDefinition(definition: GameDefinition, pipeline: AssetPipelineProject): void {
  parseStage(definition.stage)
  if (!pipeline.games.some((g) => g.id === definition.gameId)) {
    throw new Error(`Game not found: ${definition.gameId}`)
  }
  for (const characterId of definition.cast) {
    assertCharacterInGame(pipeline, definition.gameId, characterId)
  }
  for (const poseId of definition.linkedAssets.poses) {
    assertPoseInGame(pipeline, definition.gameId, poseId)
  }
  for (const clipId of definition.linkedAssets.clips) {
    assertClipInGame(pipeline, definition.gameId, clipId)
  }
  for (const presetId of definition.linkedAssets.presets) {
    assertPresetExists(pipeline, presetId)
  }
  for (const item of definition.mvpBoard) {
    parseMvpType(item.type)
    parseMvpStatus(item.status)
  }
  for (const profile of definition.tuningProfiles) {
    for (const [key, value] of Object.entries(profile.params || {})) {
      if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
        throw new Error(`tuningProfiles[${profile.id}].params.${key} must be number|string|boolean`)
      }
    }
  }
}

export function formatDiffText(diff: DefinitionDiff): string {
  if (diff.entries.length === 0) {
    return 'No changes'
  }
  return diff.entries
    .map((entry) => {
      if (entry.op === 'add') {
        return `+ ${entry.path}: ${summarize(entry.after)}`
      }
      if (entry.op === 'remove') {
        return `- ${entry.path}: ${summarize(entry.before)}`
      }
      return `~ ${entry.path}: ${summarize(entry.before)} → ${summarize(entry.after)}`
    })
    .join('\n')
}

function summarize(value: unknown): string {
  if (value === undefined) return '(none)'
  if (typeof value === 'string') {
    const oneLine = value.replace(/\s+/g, ' ').trim()
    return oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : JSON.stringify(oneLine)
  }
  try {
    const text = JSON.stringify(value)
    return text.length > 120 ? `${text.slice(0, 117)}...` : text
  } catch {
    return String(value)
  }
}
