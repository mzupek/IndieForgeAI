/**
 * All-or-nothing content apply. Matches by key (create if new, update if found).
 * @key aliases resolve within the file or to existing records of the field's type.
 */

import type {
  AssetPipelineProject,
  AttackTable,
  CanonStatus,
  Character,
  DifficultyProfile,
  Effect,
  Encounter,
  EncounterEnemyLink,
  EncounterStar,
  Enemy,
  Dialogue,
  DialogueEntryVariant,
  DialogueNode,
  GameFlag,
  Npc,
  NpcPlacement,
  Region,
  RegionEdge,
  RegionExit,
  RegionHotspot,
  RevealToken,
  Stage,
  StoryCircle,
  StoryCircleStep,
  Trigger,
  World,
  WorldMap,
  WorldMapNode,
  WorldMapPath
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
import {
  enemiesOf,
  parseAssetRefs,
  parseFlatNumbers,
  parsePoseMap,
  parseWinCondition,
  resolveCharacterRef,
  resolveVisualAssetRef,
  validateEnemy
} from '../enemies/validate'
import {
  attackTablesOf,
  parseAttackRows,
  resolveAttackTableRef,
  validateAttackTable
} from '../attackTables/validate'
import {
  difficultyProfilesOf,
  resolveDifficultyRef,
  validateDifficultyProfile
} from '../difficulty/validate'
import { parseEncounterEnemies } from './encounterLinks'
import { resolveEnemyRef } from '../enemies/validate'
import { resolveSceneId, resolveTuningProfileId } from './validate'
import {
  findRecord,
  mapCondition,
  mapEffects,
  parseCondition,
  parseEffects,
  resolveFlagRef
} from '../story/conditions'
import { flagsOf, validateGameFlag } from '../story/flags'
import { parseTriggerKind, triggersOf, validateTrigger } from '../story/triggers'
import { npcsOf, validateNpc } from '../story/npcs'
import { bindDialogueTree, dialoguesOf, validateDialogue } from '../story/dialogue'
import { parseCanonStatus } from '../story/canon'
import {
  bindStoryCircle,
  emptyCircleSteps,
  parseStoryCircleScope,
  storyCirclesOf,
  validateStoryCircle
} from '../story/circles'
import {
  bindRevealToken,
  ensureRevealTokenFlag,
  parseMediaKind,
  revealTokensOf,
  validateRevealToken
} from '../story/revealTokens'
import { bindStoryProfile, parseStoryProfile, validateStoryProfile } from '../story/profiles'

export interface ContentBundle {
  worlds?: Record<string, unknown>[]
  stages?: Record<string, unknown>[]
  encounters?: Record<string, unknown>[]
  regions?: Record<string, unknown>[]
  enemies?: Record<string, unknown>[]
  attackTables?: Record<string, unknown>[]
  difficultyProfiles?: Record<string, unknown>[]
  flags?: Record<string, unknown>[]
  triggers?: Record<string, unknown>[]
  npcs?: Record<string, unknown>[]
  dialogues?: Record<string, unknown>[]
  characters?: Record<string, unknown>[]
  storyCircles?: Record<string, unknown>[]
  revealTokens?: Record<string, unknown>[]
}

export type ApplyAction = 'create' | 'update' | 'unchanged'

export interface ApplyRecordResult {
  type:
    | 'world'
    | 'stage'
    | 'encounter'
    | 'region'
    | 'enemy'
    | 'attackTable'
    | 'difficultyProfile'
    | 'flag'
    | 'trigger'
    | 'npc'
    | 'dialogue'
    | 'character'
    | 'storyCircle'
    | 'revealToken'
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
  for (const e of enemiesOf(pipeline, gameId)) add('enemy', e.key, e.id)
  for (const t of attackTablesOf(pipeline, gameId)) add('attackTable', t.key, t.id)
  for (const d of difficultyProfilesOf(pipeline, gameId)) add('difficultyProfile', d.key, d.id)
  for (const f of flagsOf(pipeline, gameId)) add('flag', f.key, f.id)
  for (const t of triggersOf(pipeline, gameId)) add('trigger', t.key, t.id)
  for (const n of npcsOf(pipeline, gameId)) add('npc', n.key, n.id)
  for (const d of dialoguesOf(pipeline, gameId)) add('dialogue', d.key, d.id)
  for (const c of storyCirclesOf(pipeline, gameId)) add('storyCircle', c.key, c.id)
  for (const t of revealTokensOf(pipeline, gameId)) add('revealToken', t.key, t.id)
  for (const c of (pipeline.characters || []).filter((x) => x.gameId === gameId)) {
    add('character', c.key, c.id)
  }
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

function resolveIncomingNamed(
  raw: unknown,
  kind: 'enemy' | 'attackTable' | 'difficultyProfile' | 'flag' | 'trigger' | 'npc' | 'dialogue' | 'revealToken' | 'storyCircle' | 'character',
  aliasMap: Record<string, string>,
  path: string,
  issues: ContentIssue[],
  resolver: (value: string) => { id?: string; error?: string }
): string | undefined {
  const value = optionalStr(raw)
  if (!value) return undefined
  const aliased = lookupAlias(aliasMap, value, kind)
  if (aliased) return aliased
  const found = resolver(value)
  if (found.id) return found.id
  issues.push(errorIssue(path, found.error || `${kind} '${value}' was not found`))
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
  kind:
    | 'world'
    | 'stage'
    | 'encounter'
    | 'region'
    | 'enemy'
    | 'attackTable'
    | 'difficultyProfile'
    | 'flag'
    | 'trigger'
    | 'npc'
    | 'dialogue'
    | 'character'
    | 'storyCircle'
    | 'revealToken',
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
  kind: 'world' | 'stage' | 'encounter' | 'region' | 'asset' | 'scene' | 'flag' | 'trigger',
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

/** Keep fields this build does not know about when reconstructing a record. */
export function overlayRecord<T extends object>(existing: T | undefined, known: T): T {
  const next: Record<string, unknown> = existing ? { ...(existing as Record<string, unknown>) } : {}
  for (const [key, value] of Object.entries(known as Record<string, unknown>)) {
    if (value === undefined) continue
    next[key] = value
  }
  return next as T
}

function resolveWorldMap(
  raw: unknown,
  gameId: string,
  pipeline: AssetPipelineProject,
  aliasMap: Record<string, string>,
  path: string,
  issues: ContentIssue[],
  existing?: WorldMap
): WorldMap | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push(errorIssue(path, 'map must be an object'))
    return existing
  }
  const input = raw as Record<string, unknown>
  const backgroundAssetId =
    resolveBackgroundAsset(
      input.backgroundAssetId ?? existing?.backgroundAssetId,
      gameId,
      pipeline,
      aliasMap,
      `${path}.backgroundAssetId`,
      issues
    ) || existing?.backgroundAssetId || ''

  const rawNodes = Array.isArray(input.nodes) ? input.nodes : existing?.nodes || []
  const nodes: WorldMapNode[] = rawNodes.map((n, i) => {
    const node = (n || {}) as Record<string, unknown>
    const stageId =
      resolveTypedRef(node.stageId, 'stage', aliasMap, `${path}.nodes[${i}].stageId`, issues, true) ||
      String(node.stageId || '')
    const next: WorldMapNode = {
      id: str(node.id),
      stageId,
      pos: Array.isArray(node.pos) ? (node.pos as [number, number]) : [0, 0]
    }
    const label = optionalStr(node.label)
    if (label) next.label = label
    if (node.hidden !== undefined) next.hidden = Boolean(node.hidden)
    return next
  })

  const rawPaths = Array.isArray(input.paths) ? input.paths : existing?.paths || []
  const paths: WorldMapPath[] = rawPaths.map((p) => {
    const edge = (p || {}) as Record<string, unknown>
    const next: WorldMapPath = {
      id: str(edge.id),
      from: str(edge.from),
      to: str(edge.to)
    }
    if (Array.isArray(edge.waypoints)) next.waypoints = edge.waypoints as [number, number][]
    return next
  })

  const map: WorldMap = {
    backgroundAssetId,
    nodes,
    paths
  }
  const start = optionalStr(input.startNodeId) ?? existing?.startNodeId
  if (start) map.startNodeId = start
  return map
}

function resolveIdList(
  raw: unknown,
  kind: 'world' | 'stage' | 'encounter' | 'region',
  aliasMap: Record<string, string>,
  path: string,
  issues: ContentIssue[]
): string[] | undefined {
  if (raw === undefined) return undefined
  if (raw === null) return []
  if (!Array.isArray(raw)) {
    issues.push(errorIssue(path, `Expected an array of ${kind} ids`))
    return []
  }
  const out: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const id = resolveTypedRef(raw[i], kind, aliasMap, `${path}[${i}]`, issues, true)
    if (id) out.push(id)
  }
  return out
}

function resolveStoryId(
  kind: 'flag' | 'stage' | 'encounter' | 'region' | 'scene' | 'dialogue' | 'revealToken',
  raw: string,
  pipeline: AssetPipelineProject,
  gameId: string,
  aliasMap: Record<string, string>,
  path: string,
  issues: ContentIssue[]
): string | undefined {
  if (kind === 'flag') {
    return resolveIncomingNamed(raw, 'flag', aliasMap, path, issues, (value) =>
      resolveFlagRef(pipeline, gameId, value)
    )
  }
  if (kind === 'dialogue') {
    return resolveIncomingNamed(raw, 'dialogue', aliasMap, path, issues, (value) => {
      const found = findRecord(pipeline.dialogues || [], value, gameId)
      return found ? { id: found.id } : { error: `Dialogue '${value}' was not found` }
    })
  }
  if (kind === 'revealToken') {
    return resolveIncomingNamed(raw, 'revealToken', aliasMap, path, issues, (value) => {
      const found = findRecord(pipeline.revealTokens || [], value, gameId)
      return found ? { id: found.id } : { error: `Reveal token '${value}' was not found` }
    })
  }
  const mapped =
    kind === 'scene' ? 'scene' : kind === 'region' ? 'region' : kind === 'stage' ? 'stage' : 'encounter'
  return resolveTypedRef(raw, mapped, aliasMap, path, issues, false)
}

function optionalCanon(
  raw: unknown,
  existing: CanonStatus | undefined,
  path: string,
  issues: ContentIssue[]
): CanonStatus | undefined {
  if (raw === undefined) return existing
  if (raw === null || raw === '') return undefined
  try {
    return parseCanonStatus(raw)
  } catch (err) {
    issues.push(errorIssue(path, err instanceof Error ? err.message : String(err)))
    return existing
  }
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
  if (!pipeline.enemies) pipeline.enemies = []
  if (!pipeline.attackTables) pipeline.attackTables = []
  if (!pipeline.difficultyProfiles) pipeline.difficultyProfiles = []
  if (!pipeline.flags) pipeline.flags = []
  if (!pipeline.triggers) pipeline.triggers = []
  if (!pipeline.npcs) pipeline.npcs = []
  if (!pipeline.dialogues) pipeline.dialogues = []
  if (!pipeline.characters) pipeline.characters = []
  if (!pipeline.storyCircles) pipeline.storyCircles = []
  if (!pipeline.revealTokens) pipeline.revealTokens = []

  const characterPlan = planIncoming(
    'character',
    bundle.characters || [],
    pipeline.characters,
    gameId,
    aliasMap,
    issues
  )
  const worldPlan = planIncoming('world', bundle.worlds || [], pipeline.worlds, gameId, aliasMap, issues)
  const flagPlan = planIncoming('flag', bundle.flags || [], pipeline.flags, gameId, aliasMap, issues)
  const stagePlan = planIncoming('stage', bundle.stages || [], pipeline.stages, gameId, aliasMap, issues)
  const regionPlan = planIncoming('region', bundle.regions || [], pipeline.regions, gameId, aliasMap, issues)
  const attackTablePlan = planIncoming(
    'attackTable',
    bundle.attackTables || [],
    pipeline.attackTables,
    gameId,
    aliasMap,
    issues
  )
  const enemyPlan = planIncoming('enemy', bundle.enemies || [], pipeline.enemies, gameId, aliasMap, issues)
  const difficultyPlan = planIncoming(
    'difficultyProfile',
    bundle.difficultyProfiles || [],
    pipeline.difficultyProfiles,
    gameId,
    aliasMap,
    issues
  )
  const encounterPlan = planIncoming(
    'encounter',
    bundle.encounters || [],
    pipeline.encounters,
    gameId,
    aliasMap,
    issues
  )
  const npcPlan = planIncoming('npc', bundle.npcs || [], pipeline.npcs, gameId, aliasMap, issues)
  const dialoguePlan = planIncoming('dialogue', bundle.dialogues || [], pipeline.dialogues, gameId, aliasMap, issues)
  const storyCirclePlan = planIncoming(
    'storyCircle',
    bundle.storyCircles || [],
    pipeline.storyCircles,
    gameId,
    aliasMap,
    issues
  )
  const revealTokenPlan = planIncoming(
    'revealToken',
    bundle.revealTokens || [],
    pipeline.revealTokens,
    gameId,
    aliasMap,
    issues
  )
  const triggerPlan = planIncoming('trigger', bundle.triggers || [], pipeline.triggers, gameId, aliasMap, issues)

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

  const nextCharacters: Character[] = []
  for (const p of characterPlan) {
    const path = `characters[${p.index}]`
    const existing = pipeline.characters.find((c) => c.id === p.id)
    const tagsRaw = p.input.tags
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.map((t) => String(t).trim()).filter(Boolean)
      : existing?.tags || []
    const profileIssues: ContentIssue[] = []
    const parsedProfile =
      p.input.storyProfile !== undefined
        ? parseStoryProfile(p.input.storyProfile, `${path}.storyProfile`, profileIssues)
        : existing?.storyProfile
    issues.push(...profileIssues)
    const known: Character = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      role: str(p.input.role) || existing?.role || '',
      tags,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    const styleNotes = optionalStr(p.input.styleNotes) ?? existing?.styleNotes
    if (styleNotes) known.styleNotes = styleNotes
    if (p.input.corePosesRequired !== undefined) known.corePosesRequired = Boolean(p.input.corePosesRequired)
    else if (existing?.corePosesRequired !== undefined) known.corePosesRequired = existing.corePosesRequired
    if (parsedProfile) {
      const bound = bindStoryProfile(pipeline, gameId, parsedProfile)
      if (bound?.relationships) {
        bound.relationships = bound.relationships.map((rel) => ({
          characterId:
            lookupAlias(aliasMap, rel.characterId, 'character') ||
            findRecord(pipeline.characters, rel.characterId, gameId)?.id ||
            rel.characterId,
          relation: rel.relation
        }))
      }
      known.storyProfile = bound
    }
    else if (p.input.storyProfile === null) {
      /* clear below */
    } else if (existing?.storyProfile) known.storyProfile = existing.storyProfile
    const rec = overlayRecord(existing, known)
    if (p.input.storyProfile === null) delete rec.storyProfile
    if (p.input.styleNotes === null || p.input.styleNotes === '') delete rec.styleNotes
    if (p.input.key === '') delete rec.key
    if (!rec.name.trim()) issues.push(errorIssue(`${path}.name`, 'Character name is required'))
    if (!rec.role.trim()) issues.push(errorIssue(`${path}.role`, 'Character role is required'))
    nextCharacters.push(rec)
  }
  for (const c of nextCharacters) {
    const idx = pipeline.characters.findIndex((x) => x.id === c.id)
    if (idx >= 0) pipeline.characters[idx] = c
    else pipeline.characters.push(c)
  }

  const nextWorlds: World[] = []
  for (const p of worldPlan) {
    const path = `worlds[${p.index}]`
    const existing = pipeline.worlds.find((w) => w.id === p.id)
    const known: World = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      order: num(p.input.order, existing?.order ?? nextOrder(worldsOf(pipeline, gameId))) ?? 1,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    const description = optionalStr(p.input.description) ?? existing?.description
    if (description) known.description = description
    const world = overlayRecord(existing, known)
    if (p.input.description === null) delete world.description
    if (p.input.map === null) delete world.map
    else if (p.input.map !== undefined) {
      const mapped = resolveWorldMap(
        p.input.map,
        gameId,
        pipeline,
        aliasMap,
        `${path}.map`,
        issues,
        existing?.map
      )
      if (mapped) world.map = mapped
    }
    nextWorlds.push(world)
  }

  for (const w of nextWorlds) {
    const idx = pipeline.worlds.findIndex((x) => x.id === w.id)
    if (idx >= 0) pipeline.worlds[idx] = w
    else pipeline.worlds.push(w)
  }

  const nextFlags: GameFlag[] = []
  for (const p of flagPlan) {
    const path = `flags[${p.index}]`
    const existing = pipeline.flags.find((f) => f.id === p.id)
    const typeRaw = optionalStr(p.input.type) || existing?.type || 'bool'
    const type = typeRaw === 'int' ? 'int' : 'bool'
    let defaultValue: boolean | number = existing?.default ?? (type === 'int' ? 0 : false)
    if (p.input.default !== undefined) {
      if (type === 'bool') defaultValue = p.input.default === true || p.input.default === 'true' || p.input.default === 1
      else {
        const n = Number(p.input.default)
        defaultValue = Number.isInteger(n) ? n : 0
      }
    }
    const known: GameFlag = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      type,
      default: defaultValue,
      scope: optionalStr(p.input.scope) === 'world' ? 'world' : existing?.scope || 'game',
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    const description = optionalStr(p.input.description) ?? existing?.description
    if (description) known.description = description
    nextFlags.push(overlayRecord(existing, known))
  }
  for (const f of nextFlags) {
    const idx = pipeline.flags.findIndex((x) => x.id === f.id)
    if (idx >= 0) pipeline.flags[idx] = f
    else pipeline.flags.push(f)
  }

  const nextRevealTokens: RevealToken[] = []
  for (const p of revealTokenPlan) {
    const path = `revealTokens[${p.index}]`
    const existing = pipeline.revealTokens.find((t) => t.id === p.id)
    const condIssues: ContentIssue[] = []
    const unlockedBy =
      p.input.unlockedBy !== undefined
        ? parseCondition(p.input.unlockedBy, `${path}.unlockedBy`, condIssues)
        : existing?.unlockedBy
    issues.push(...condIssues)
    let mediaKind: RevealToken['mediaKind'] | undefined = existing?.mediaKind
    try {
      if (p.input.mediaKind !== undefined) mediaKind = parseMediaKind(p.input.mediaKind)
    } catch (err) {
      issues.push(errorIssue(`${path}.mediaKind`, err instanceof Error ? err.message : String(err)))
    }
    const orderRaw = p.input.order
    const order =
      orderRaw !== undefined && orderRaw !== null && orderRaw !== ''
        ? Number(orderRaw)
        : existing?.order ?? p.index
    const known: RevealToken = {
      id: p.id,
      gameId,
      title: str(p.input.title) || existing?.title || '',
      text: p.input.text !== undefined ? str(p.input.text) : existing?.text || '',
      order: Number.isInteger(order) ? order : 0,
      flagId: existing?.flagId || '',
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    const chapter = optionalStr(p.input.chapter) ?? existing?.chapter
    if (chapter) known.chapter = chapter
    const mediaAssetId = optionalStr(p.input.mediaAssetId) ?? existing?.mediaAssetId
    if (mediaAssetId) known.mediaAssetId = mediaAssetId
    if (mediaKind) known.mediaKind = mediaKind
    if (unlockedBy) {
      known.unlockedBy = mapCondition(unlockedBy, (k, id) =>
        resolveStoryId(k, id, pipeline, gameId, aliasMap, `${path}.unlockedBy`, issues)
      )
    }
    const canon = optionalCanon(p.input.canonStatus ?? p.input.canon, existing?.canonStatus, `${path}.canonStatus`, issues)
    if (canon) known.canonStatus = canon
    const flagRaw = optionalStr(p.input.flagId)
    if (flagRaw) {
      const resolved = resolveIncomingNamed(flagRaw, 'flag', aliasMap, `${path}.flagId`, issues, (value) =>
        resolveFlagRef(pipeline, gameId, value)
      )
      if (resolved) known.flagId = resolved
    } else {
      const auto = ensureRevealTokenFlag(pipeline, gameId, {
        id: known.id,
        key: known.key,
        title: known.title,
        flagId: known.flagId
      })
      known.flagId = auto.id
      if (auto.key) {
        aliasMap[`@flag:${auto.key}`] = auto.id
        if (!aliasMap[`@${auto.key}`]) aliasMap[`@${auto.key}`] = auto.id
      }
    }
    const rec = overlayRecord(existing, bindRevealToken(pipeline, gameId, known))
    if (p.input.chapter === null || p.input.chapter === '') delete rec.chapter
    if (p.input.mediaAssetId === null || p.input.mediaAssetId === '') {
      delete rec.mediaAssetId
      delete rec.mediaKind
    }
    if (p.input.unlockedBy === null) delete rec.unlockedBy
    if ((p.input.canonStatus ?? p.input.canon) === null || (p.input.canonStatus ?? p.input.canon) === '') {
      delete rec.canonStatus
    }
    nextRevealTokens.push(rec)
  }
  for (const t of nextRevealTokens) {
    const idx = pipeline.revealTokens.findIndex((x) => x.id === t.id)
    if (idx >= 0) pipeline.revealTokens[idx] = t
    else pipeline.revealTokens.push(t)
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
    const known: Stage = {
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
    if (key) known.key = key
    const recLevel = num(p.input.recommendedLevel, existing?.recommendedLevel)
    if (recLevel !== undefined) known.recommendedLevel = recLevel
    if (p.input.optional !== undefined) known.optional = Boolean(p.input.optional)
    else if (existing?.optional !== undefined) known.optional = existing.optional
    const entryRegionId = resolveTypedRef(
      p.input.entryRegionId !== undefined ? p.input.entryRegionId : existing?.entryRegionId,
      'region',
      aliasMap,
      `${path}.entryRegionId`,
      issues,
      false
    )
    if (entryRegionId) known.entryRegionId = entryRegionId
    const entryAnchor = optionalStr(p.input.entryAnchor) ?? existing?.entryAnchor
    if (entryAnchor) known.entryAnchor = entryAnchor
    const returnToNode = optionalStr(p.input.returnToNode) ?? existing?.returnToNode
    if (returnToNode) known.returnToNode = returnToNode
    const unlockAfter =
      p.input.unlockAfter !== undefined
        ? resolveIdList(p.input.unlockAfter, 'stage', aliasMap, `${path}.unlockAfter`, issues)
        : existing?.unlockAfter
    if (unlockAfter) known.unlockAfter = unlockAfter
    const clearedBy =
      p.input.clearedBy !== undefined
        ? resolveIdList(p.input.clearedBy, 'encounter', aliasMap, `${path}.clearedBy`, issues)
        : existing?.clearedBy
    if (clearedBy) known.clearedBy = clearedBy
    if (p.input.unlockCondition !== undefined) {
      const condIssues: ContentIssue[] = []
      const parsed = parseCondition(p.input.unlockCondition, `${path}.unlockCondition`, condIssues)
      issues.push(...condIssues)
      if (parsed) {
        known.unlockCondition = mapCondition(parsed, (kind, id) =>
          resolveStoryId(kind, id, pipeline, gameId, aliasMap, `${path}.unlockCondition`, issues)
        )
      }
    } else if (existing?.unlockCondition) {
      known.unlockCondition = existing.unlockCondition
    }
    const stage = overlayRecord(existing, known)
    if (p.input.entryRegionId === null) delete stage.entryRegionId
    if (p.input.entryAnchor === null) delete stage.entryAnchor
    if (p.input.returnToNode === null) delete stage.returnToNode
    if (p.input.unlockAfter === null) delete stage.unlockAfter
    if (p.input.clearedBy === null) delete stage.clearedBy
    if (p.input.unlockCondition === null) delete stage.unlockCondition
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

    const known: Region = {
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
    if (key) known.key = key
    if (stageId) known.stageId = stageId
    else if (existing?.stageId) known.stageId = existing.stageId

    known.hotspots = (known.hotspots || []).map((hs: RegionHotspot, hi) => {
      let next = hs
      if (hs?.encounterId) {
        const encId = resolveTypedRef(
          hs.encounterId,
          'encounter',
          aliasMap,
          `${path}.hotspots[${hi}].encounterId`,
          issues,
          false
        )
        if (encId) next = { ...next, encounterId: encId }
      }
      if (hs?.triggerId) {
        const triggerId = resolveTypedRef(
          hs.triggerId,
          'trigger',
          aliasMap,
          `${path}.hotspots[${hi}].triggerId`,
          issues,
          false
        )
        if (triggerId) next = { ...next, triggerId }
      }
      return next
    })
    known.exits = (known.exits || []).map((ex: RegionExit, ei) => {
      if (ex.toWorldMap) return { ...ex }
      if (!ex.toRegionId) return ex
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
    nextRegions.push(overlayRecord(existing, known))
  }
  for (const r of nextRegions) {
    const idx = pipeline.regions.findIndex((x) => x.id === r.id)
    if (idx >= 0) pipeline.regions[idx] = r
    else pipeline.regions.push(r)
  }

  const nextDifficulties: DifficultyProfile[] = []
  for (const p of difficultyPlan) {
    const path = `difficultyProfiles[${p.index}]`
    const existing = pipeline.difficultyProfiles.find((d) => d.id === p.id)
    const known: DifficultyProfile = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      heroHpMultiplier: num(p.input.heroHpMultiplier, existing?.heroHpMultiplier ?? 1) ?? 1,
      playbackSpeed: num(p.input.playbackSpeed, existing?.playbackSpeed ?? 1) ?? 1,
      attackWeightScale: num(p.input.attackWeightScale, existing?.attackWeightScale ?? 1) ?? 1,
      hintCharges: num(p.input.hintCharges, existing?.hintCharges ?? 0) ?? 0,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    const notes = optionalStr(p.input.notes) ?? existing?.notes
    if (notes) known.notes = notes
    if (p.input.notes === null || p.input.notes === '') delete known.notes
    nextDifficulties.push(overlayRecord(existing, known))
  }
  for (const d of nextDifficulties) {
    const idx = pipeline.difficultyProfiles.findIndex((x) => x.id === d.id)
    if (idx >= 0) pipeline.difficultyProfiles[idx] = d
    else pipeline.difficultyProfiles.push(d)
  }

  const nextTables: AttackTable[] = []
  for (const p of attackTablePlan) {
    const path = `attackTables[${p.index}]`
    const existing = pipeline.attackTables.find((t) => t.id === p.id)
    const rowIssues: ContentIssue[] = []
    const rows = parseAttackRows(
      p.input.rows !== undefined ? p.input.rows : existing?.rows || [],
      `${path}.rows`,
      rowIssues
    )
    issues.push(...rowIssues)
    const selectionRaw = optionalStr(p.input.selection) || existing?.selection || 'weighted'
    const revealRaw = optionalStr(p.input.reveal) || existing?.reveal || 'roundStart'
    const known: AttackTable = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      moduleId: str(p.input.moduleId) || existing?.moduleId || '',
      selection: selectionRaw === 'sequence' ? 'sequence' : 'weighted',
      noRepeatInARow:
        p.input.noRepeatInARow !== undefined
          ? Boolean(p.input.noRepeatInARow)
          : existing?.noRepeatInARow ?? false,
      reveal: revealRaw === 'roundStart' ? 'roundStart' : 'roundStart',
      skipFinalRound:
        p.input.skipFinalRound !== undefined
          ? Boolean(p.input.skipFinalRound)
          : existing?.skipFinalRound ?? false,
      rows,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    nextTables.push(overlayRecord(existing, known))
  }
  for (const t of nextTables) {
    const idx = pipeline.attackTables.findIndex((x) => x.id === t.id)
    if (idx >= 0) pipeline.attackTables[idx] = t
    else pipeline.attackTables.push(t)
  }

  const nextEnemies: Enemy[] = []
  for (const p of enemyPlan) {
    const path = `enemies[${p.index}]`
    const existing = pipeline.enemies.find((e) => e.id === p.id)
    const charRaw = optionalStr(p.input.characterId) ?? existing?.characterId
    const char = resolveCharacterRef(pipeline, gameId, charRaw)
    if (char.error) issues.push(errorIssue(`${path}.characterId`, char.error))
    const winRaw = p.input.winCondition ?? (p.input.winKind
      ? { kind: p.input.winKind, params: p.input.winParams || {} }
      : undefined)
    const win = parseWinCondition(winRaw ?? existing?.winCondition, `${path}.winCondition`, issues)
    const stats = parseFlatNumbers(
      p.input.stats !== undefined ? p.input.stats : existing?.stats || {},
      `${path}.stats`,
      issues
    )
    const poses = parsePoseMap(
      p.input.poses !== undefined ? p.input.poses : existing?.poses || {},
      `${path}.poses`,
      issues
    )
    const assetsIn = parseAssetRefs(
      p.input.assets !== undefined ? p.input.assets : existing?.assets || [],
      `${path}.assets`,
      issues
    )
    const assets = assetsIn.map((a, i) => {
      const resolved = resolveVisualAssetRef(pipeline, gameId, a.assetId)
      if (resolved.error) {
        issues.push(errorIssue(`${path}.assets[${i}].assetId`, resolved.error))
        return a
      }
      return { ...a, assetId: resolved.id || a.assetId }
    })
    const known: Enemy = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      characterId: char.id || existing?.characterId || '',
      moduleId: str(p.input.moduleId) || existing?.moduleId || '',
      winCondition: win || existing?.winCondition || { kind: '', params: {} },
      stats,
      poses,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    if (assets.length) known.assets = assets
    const notes = optionalStr(p.input.notes) ?? existing?.notes
    if (notes) known.notes = notes
    const tableRaw = optionalStr(p.input.attackTableId) ?? existing?.attackTableId
    if (tableRaw) {
      if (isAliasRef(tableRaw)) {
        const resolved = lookupAlias(aliasMap, tableRaw, 'attackTable')
        if (!resolved) issues.push(errorIssue(`${path}.attackTableId`, `Unknown alias '${tableRaw}' for attack table`))
        else known.attackTableId = resolved
      } else {
        const resolved = resolveAttackTableRef(pipeline, gameId, tableRaw)
        if (resolved.error) issues.push(errorIssue(`${path}.attackTableId`, resolved.error))
        else known.attackTableId = resolved.id || tableRaw
      }
    }
    nextEnemies.push(overlayRecord(existing, known))
  }
  for (const e of nextEnemies) {
    const idx = pipeline.enemies.findIndex((x) => x.id === e.id)
    if (idx >= 0) pipeline.enemies[idx] = e
    else pipeline.enemies.push(e)
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
        const tmpIssues: ContentIssue[] = []
        const id = resolveSceneId(pipeline, gameId, sceneId, `${path}.sceneId`, tmpIssues)
        if (id) sceneId = id
        else issues.push(...tmpIssues)
      }
    }
    let tuningProfileId = optionalStr(p.input.tuningProfileId) ?? existing?.tuningProfileId
    if (tuningProfileId) {
      const tmpIssues: ContentIssue[] = []
      const id = resolveTuningProfileId(pipeline, gameId, tuningProfileId, `${path}.tuningProfileId`, tmpIssues)
      if (id) tuningProfileId = id
      else issues.push(...tmpIssues)
    }

    const known: Encounter = {
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
    if (key) known.key = key
    if (sceneId) known.sceneId = sceneId
    if (tuningProfileId) known.tuningProfileId = tuningProfileId
    const recLevel = num(p.input.recommendedLevel, existing?.recommendedLevel)
    if (recLevel !== undefined) known.recommendedLevel = recLevel

    const clearDifficulty = Object.prototype.hasOwnProperty.call(p.input, 'difficultyProfileId') &&
      (p.input.difficultyProfileId === null || p.input.difficultyProfileId === '')
    if (!clearDifficulty) {
      const difficultyRaw = optionalStr(p.input.difficultyProfileId) ?? existing?.difficultyProfileId
      if (difficultyRaw) {
        const resolved = resolveIncomingNamed(
          difficultyRaw,
          'difficultyProfile',
          aliasMap,
          `${path}.difficultyProfileId`,
          issues,
          (value) => resolveDifficultyRef(pipeline, gameId, value)
        )
        if (resolved) known.difficultyProfileId = resolved
      }
    }

    if (p.input.enemies !== undefined) {
      const parsed = parseEncounterEnemies(p.input.enemies, `${path}.enemies`, issues)
      const resolvedLinks: EncounterEnemyLink[] = []
      for (let i = 0; i < parsed.length; i++) {
        const link = parsed[i]!
        const enemyId = resolveIncomingNamed(
          link.enemyId,
          'enemy',
          aliasMap,
          `${path}.enemies[${i}].enemyId`,
          issues,
          (value) => resolveEnemyRef(pipeline, gameId, value)
        )
        if (!enemyId) continue
        const nextLink: EncounterEnemyLink = { enemyId }
        if (link.attackTableId) {
          const tableId = resolveIncomingNamed(
            link.attackTableId,
            'attackTable',
            aliasMap,
            `${path}.enemies[${i}].attackTableId`,
            issues,
            (value) => resolveAttackTableRef(pipeline, gameId, value)
          )
          if (tableId) nextLink.attackTableId = tableId
        }
        resolvedLinks.push(nextLink)
      }
      if (resolvedLinks.length) known.enemies = resolvedLinks
    } else if (existing?.enemies?.length) {
      known.enemies = existing.enemies
    }

    if (p.input.onWin !== undefined) {
      const winIssues: ContentIssue[] = []
      const parsed = parseEffects(p.input.onWin, `${path}.onWin`, winIssues)
      issues.push(...winIssues)
      known.onWin = mapEffects(parsed, (kind, id) =>
        resolveStoryId(kind, id, pipeline, gameId, aliasMap, `${path}.onWin`, issues)
      )
    } else if (existing?.onWin) {
      known.onWin = existing.onWin
    }
    if (p.input.onLose !== undefined) {
      const loseIssues: ContentIssue[] = []
      const parsed = parseEffects(p.input.onLose, `${path}.onLose`, loseIssues)
      issues.push(...loseIssues)
      known.onLose = mapEffects(parsed, (kind, id) =>
        resolveStoryId(kind, id, pipeline, gameId, aliasMap, `${path}.onLose`, issues)
      )
    } else if (existing?.onLose) {
      known.onLose = existing.onLose
    }

    const rec = overlayRecord(existing, known)
    if (p.input.enemies !== undefined && !known.enemies?.length) delete rec.enemies
    if (clearDifficulty) delete rec.difficultyProfileId
    if (p.input.onWin !== undefined && !known.onWin?.length) delete rec.onWin
    if (p.input.onLose !== undefined && !known.onLose?.length) delete rec.onLose
    nextEncounters.push(rec)
  }
  for (const e of nextEncounters) {
    const idx = pipeline.encounters.findIndex((x) => x.id === e.id)
    if (idx >= 0) pipeline.encounters[idx] = e
    else pipeline.encounters.push(e)
  }

  const nextNpcs: Npc[] = []
  for (const p of npcPlan) {
    const path = `npcs[${p.index}]`
    const existing = pipeline.npcs.find((n) => n.id === p.id)
    const characterRaw = optionalStr(p.input.characterId) ?? existing?.characterId
    const characterAlias = characterRaw ? lookupAlias(aliasMap, characterRaw, 'character') : undefined
    const characterResolved = characterRaw ? resolveCharacterRef(pipeline, gameId, characterRaw) : { error: 'characterId is required' }
    const character = characterAlias || characterResolved.id
    if (!character) {
      issues.push(errorIssue(`${path}.characterId`, characterResolved.error || 'Character was not found'))
    }
    const dialogueId = optionalStr(p.input.defaultDialogueId)
    const defaultDialogueId = dialogueId
      ? resolveStoryId('dialogue', dialogueId, pipeline, gameId, aliasMap, `${path}.defaultDialogueId`, issues)
      : existing?.defaultDialogueId
    const placementsRaw = p.input.placements !== undefined ? p.input.placements : existing?.placements
    const placements: NpcPlacement[] = []
    if (Array.isArray(placementsRaw)) {
      for (let i = 0; i < placementsRaw.length; i++) {
        const row = (placementsRaw[i] || {}) as Record<string, unknown>
        const regionId = resolveTypedRef(row.regionId, 'region', aliasMap, `${path}.placements[${i}].regionId`, issues, true)
        const interact = optionalStr(row.interactTriggerId)
        const interactTriggerId = interact
          ? resolveIncomingNamed(
              interact,
              'trigger',
              aliasMap,
              `${path}.placements[${i}].interactTriggerId`,
              issues,
              (value) => {
                const found = findRecord(pipeline.triggers || [], value, gameId)
                return found ? { id: found.id } : { error: `Trigger '${value}' was not found` }
              }
            )
          : undefined
        const condIssues: ContentIssue[] = []
        const condition =
          row.condition !== undefined
            ? parseCondition(row.condition, `${path}.placements[${i}].condition`, condIssues)
            : undefined
        issues.push(...condIssues)
        placements.push({
          regionId: regionId || String(row.regionId || ''),
          anchorId: str(row.anchorId),
          condition: condition
            ? mapCondition(condition, (kind, id) =>
                resolveStoryId(kind, id, pipeline, gameId, aliasMap, `${path}.placements[${i}].condition`, issues)
              )
            : undefined,
          interactTriggerId
        })
      }
    } else if (existing?.placements) {
      placements.push(...existing.placements)
    }
    const known: Npc = {
      id: p.id,
      gameId,
      characterId: character || existing?.characterId || '',
      displayName: str(p.input.displayName) || existing?.displayName || '',
      role: str(p.input.role) || existing?.role || '',
      placements,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    if (defaultDialogueId) known.defaultDialogueId = defaultDialogueId
    const notes = optionalStr(p.input.notes) ?? existing?.notes
    if (notes) known.notes = notes
    const npcCanon = optionalCanon(
      p.input.canonStatus ?? p.input.canon,
      existing?.canonStatus,
      `${path}.canonStatus`,
      issues
    )
    if (npcCanon) known.canonStatus = npcCanon
    const npcRec = overlayRecord(existing, known)
    if ((p.input.canonStatus ?? p.input.canon) === null || (p.input.canonStatus ?? p.input.canon) === '') {
      delete npcRec.canonStatus
    }
    nextNpcs.push(npcRec)
  }
  for (const n of nextNpcs) {
    const idx = pipeline.npcs.findIndex((x) => x.id === n.id)
    if (idx >= 0) pipeline.npcs[idx] = n
    else pipeline.npcs.push(n)
  }

  const nextDialogues: Dialogue[] = []
  for (const p of dialoguePlan) {
    const path = `dialogues[${p.index}]`
    const existing = pipeline.dialogues.find((d) => d.id === p.id)
    const nodesRaw = p.input.nodes !== undefined ? p.input.nodes : existing?.nodes
    const nodes: DialogueNode[] = []
    if (Array.isArray(nodesRaw)) {
      for (let i = 0; i < nodesRaw.length; i++) {
        const row = (nodesRaw[i] || {}) as Record<string, unknown>
        const speakerRaw = str(row.speaker)
        const speakerNpc = lookupAlias(aliasMap, speakerRaw, 'npc')
        const speaker =
          speakerRaw === 'hero' || speakerRaw === 'narrator'
            ? speakerRaw
            : speakerNpc || findRecord(pipeline.npcs || [], speakerRaw, gameId)?.id || speakerRaw
        const effectIssues: ContentIssue[] = []
        const effects =
          row.effects !== undefined ? parseEffects(row.effects, `${path}.nodes[${i}].effects`, effectIssues) : undefined
        issues.push(...effectIssues)
        const choicesRaw = row.choices
        const choices = Array.isArray(choicesRaw)
          ? choicesRaw.map((c, ci) => {
              const ch = (c || {}) as Record<string, unknown>
              const condIssues: ContentIssue[] = []
              const condition =
                ch.condition !== undefined
                  ? parseCondition(ch.condition, `${path}.nodes[${i}].choices[${ci}].condition`, condIssues)
                  : undefined
              issues.push(...condIssues)
              const chEffIssues: ContentIssue[] = []
              const chEffects =
                ch.effects !== undefined
                  ? parseEffects(ch.effects, `${path}.nodes[${i}].choices[${ci}].effects`, chEffIssues)
                  : undefined
              issues.push(...chEffIssues)
              return {
                text: str(ch.text),
                next: str(ch.next),
                condition: condition
                  ? mapCondition(condition, (kind, id) =>
                      resolveStoryId(kind, id, pipeline, gameId, aliasMap, `${path}.nodes[${i}].choices[${ci}]`, issues)
                    )
                  : undefined,
                effects: chEffects
                  ? mapEffects(chEffects, (kind, id) =>
                      resolveStoryId(kind, id, pipeline, gameId, aliasMap, `${path}.nodes[${i}].choices[${ci}]`, issues)
                    )
                  : undefined
              }
            })
          : undefined
        nodes.push({
          id: str(row.id),
          speaker,
          text: str(row.text),
          poseSlot: optionalStr(row.poseSlot),
          next: optionalStr(row.next),
          effects: effects
            ? mapEffects(effects, (kind, id) =>
                resolveStoryId(kind, id, pipeline, gameId, aliasMap, `${path}.nodes[${i}].effects`, issues)
              )
            : undefined,
          choices
        })
      }
    } else if (existing?.nodes) {
      nodes.push(...existing.nodes)
    }
    const variantsRaw = p.input.entryVariants
    let entryVariants: DialogueEntryVariant[] | undefined
    if (variantsRaw !== undefined) {
      entryVariants = []
      if (Array.isArray(variantsRaw)) {
        for (let i = 0; i < variantsRaw.length; i++) {
          const row = (variantsRaw[i] || {}) as Record<string, unknown>
          const condIssues: ContentIssue[] = []
          const condition = parseCondition(row.condition, `${path}.entryVariants[${i}].condition`, condIssues)
          issues.push(...condIssues)
          if (condition) {
            entryVariants.push({
              condition: mapCondition(condition, (kind, id) =>
                resolveStoryId(kind, id, pipeline, gameId, aliasMap, `${path}.entryVariants[${i}]`, issues)
              )!,
              startNodeId: str(row.startNodeId)
            })
          }
        }
      }
    } else if (existing?.entryVariants) {
      entryVariants = existing.entryVariants
    }
    const known: Dialogue = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      startNodeId: str(p.input.startNodeId) || existing?.startNodeId || nodes[0]?.id || '',
      nodes,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    if (entryVariants && entryVariants.length) known.entryVariants = entryVariants
    const notes = optionalStr(p.input.notes) ?? existing?.notes
    if (notes) known.notes = notes
    const dlgCanon = optionalCanon(
      p.input.canonStatus ?? p.input.canon,
      existing?.canonStatus,
      `${path}.canonStatus`,
      issues
    )
    if (dlgCanon) known.canonStatus = dlgCanon
    const dlgRec = overlayRecord(existing, bindDialogueTree(pipeline, gameId, known))
    if ((p.input.canonStatus ?? p.input.canon) === null || (p.input.canonStatus ?? p.input.canon) === '') {
      delete dlgRec.canonStatus
    }
    nextDialogues.push(dlgRec)
  }
  for (const d of nextDialogues) {
    const idx = pipeline.dialogues.findIndex((x) => x.id === d.id)
    if (idx >= 0) pipeline.dialogues[idx] = d
    else pipeline.dialogues.push(d)
  }

  const nextStoryCircles: StoryCircle[] = []
  for (const p of storyCirclePlan) {
    const path = `storyCircles[${p.index}]`
    const existing = pipeline.storyCircles.find((c) => c.id === p.id)
    let scope: StoryCircle['scope'] = existing?.scope || 'game'
    try {
      if (p.input.scope !== undefined) scope = parseStoryCircleScope(p.input.scope, existing?.scope)
    } catch (err) {
      issues.push(errorIssue(`${path}.scope`, err instanceof Error ? err.message : String(err)))
    }
    const refRaw = optionalStr(p.input.refId) ?? existing?.refId
    let refId = refRaw
    if (refRaw) {
      const kind = scope === 'world' ? 'world' : scope === 'stage' ? 'stage' : undefined
      if (kind) {
        const resolved = resolveTypedRef(refRaw, kind, aliasMap, `${path}.refId`, issues, false)
        if (resolved) refId = resolved
      }
    }
    const stepsRaw = p.input.steps !== undefined ? p.input.steps : existing?.steps
    let steps: StoryCircleStep[] = emptyCircleSteps()
    if (Array.isArray(stepsRaw) && stepsRaw.length) {
      steps = emptyCircleSteps().map((blank) => {
        const match = (stepsRaw as Record<string, unknown>[]).find(
          (s) => Number((s || {}).index) === blank.index
        )
        if (!match) return blank
        const row = match
        const next: StoryCircleStep = { ...blank }
        if (row.beat !== undefined) next.beat = str(row.beat)
        const sceneId = optionalStr(row.sceneId)
        if (sceneId) next.sceneId = resolveTypedRef(sceneId, 'scene', aliasMap, `${path}.steps.sceneId`, issues, false) || sceneId
        const dialogueId = optionalStr(row.dialogueId)
        if (dialogueId) {
          next.dialogueId =
            resolveStoryId('dialogue', dialogueId, pipeline, gameId, aliasMap, `${path}.steps.dialogueId`, issues) ||
            dialogueId
        }
        const encounterId = optionalStr(row.encounterId)
        if (encounterId) {
          next.encounterId =
            resolveStoryId('encounter', encounterId, pipeline, gameId, aliasMap, `${path}.steps.encounterId`, issues) ||
            encounterId
        }
        const flagId = optionalStr(row.flagId)
        if (flagId) {
          next.flagId = resolveStoryId('flag', flagId, pipeline, gameId, aliasMap, `${path}.steps.flagId`, issues) || flagId
        }
        const advances = optionalStr(row.advancesCircleId)
        if (advances) {
          const aliased = lookupAlias(aliasMap, advances, 'storyCircle')
          next.advancesCircleId = aliased || findRecord(pipeline.storyCircles, advances, gameId)?.id || advances
        }
        if (row.advancesStep !== undefined && row.advancesStep !== null && row.advancesStep !== '') {
          const n = Number(row.advancesStep)
          if (Number.isInteger(n) && n >= 1 && n <= 8) next.advancesStep = n as StoryCircleStep['advancesStep']
        }
        return next
      })
    }
    const known: StoryCircle = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      scope,
      steps,
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    if (refId) known.refId = refId
    const surfaceGoal = optionalStr(p.input.surfaceGoal) ?? existing?.surfaceGoal
    if (surfaceGoal) known.surfaceGoal = surfaceGoal
    const hiddenGoal = optionalStr(p.input.hiddenGoal) ?? existing?.hiddenGoal
    if (hiddenGoal) known.hiddenGoal = hiddenGoal
    const notes = optionalStr(p.input.notes) ?? existing?.notes
    if (notes) known.notes = notes
    const circleCanon = optionalCanon(
      p.input.canonStatus ?? p.input.canon,
      existing?.canonStatus,
      `${path}.canonStatus`,
      issues
    )
    if (circleCanon) known.canonStatus = circleCanon
    const rec = overlayRecord(existing, bindStoryCircle(pipeline, gameId, known))
    if (p.input.surfaceGoal === null || p.input.surfaceGoal === '') delete rec.surfaceGoal
    if (p.input.hiddenGoal === null || p.input.hiddenGoal === '') delete rec.hiddenGoal
    if (p.input.notes === null || p.input.notes === '') delete rec.notes
    if ((p.input.canonStatus ?? p.input.canon) === null || (p.input.canonStatus ?? p.input.canon) === '') {
      delete rec.canonStatus
    }
    nextStoryCircles.push(rec)
  }
  for (const c of nextStoryCircles) {
    const idx = pipeline.storyCircles.findIndex((x) => x.id === c.id)
    if (idx >= 0) pipeline.storyCircles[idx] = c
    else pipeline.storyCircles.push(c)
  }

  const nextTriggers: Trigger[] = []
  for (const p of triggerPlan) {
    const path = `triggers[${p.index}]`
    const existing = pipeline.triggers.find((t) => t.id === p.id)
    let kind: Trigger['kind'] = existing?.kind || 'onHotspot'
    try {
      if (p.input.kind !== undefined) kind = parseTriggerKind(p.input.kind)
    } catch (err) {
      issues.push(errorIssue(`${path}.kind`, err instanceof Error ? err.message : String(err)))
    }
    const condIssues: ContentIssue[] = []
    const parsedCondition =
      p.input.condition !== undefined
        ? parseCondition(p.input.condition, `${path}.condition`, condIssues)
        : existing?.condition
    issues.push(...condIssues)
    const effectIssues: ContentIssue[] = []
    const parsedEffects =
      p.input.effects !== undefined
        ? parseEffects(p.input.effects, `${path}.effects`, effectIssues)
        : existing?.effects || []
    issues.push(...effectIssues)
    const known: Trigger = {
      id: p.id,
      gameId,
      name: str(p.input.name) || existing?.name || '',
      kind,
      sourceRef: str(p.input.sourceRef) || existing?.sourceRef || '',
      once: p.input.once !== undefined ? Boolean(p.input.once) : existing?.once ?? false,
      effects: mapEffects(parsedEffects, (k, id) =>
        resolveStoryId(k, id, pipeline, gameId, aliasMap, `${path}.effects`, issues)
      ),
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    const key = p.key ?? existing?.key
    if (key) known.key = key
    const notes = optionalStr(p.input.notes) ?? existing?.notes
    if (notes) known.notes = notes
    if (parsedCondition) {
      known.condition = mapCondition(parsedCondition, (k, id) =>
        resolveStoryId(k, id, pipeline, gameId, aliasMap, `${path}.condition`, issues)
      )
    }
    const sourceKind =
      kind === 'onEnterRegion'
        ? 'region'
        : kind === 'onStageEnter'
          ? 'stage'
          : kind === 'onEncounterWin' || kind === 'onEncounterLose'
            ? 'encounter'
            : kind === 'onDialogueEnd'
              ? 'dialogue'
              : undefined
    if (sourceKind && known.sourceRef) {
      const resolved = resolveStoryId(
        sourceKind,
        known.sourceRef,
        pipeline,
        gameId,
        aliasMap,
        `${path}.sourceRef`,
        issues
      )
      if (resolved) known.sourceRef = resolved
    } else if (kind === 'onHotspot' && known.sourceRef) {
      const aliased = lookupAlias(aliasMap, known.sourceRef, 'region')
      if (aliased && !known.sourceRef.includes(':') && !known.sourceRef.includes('/')) {
        // keep hotspot-local id; aliases for region:hotspot stay as authored
      }
    }
    nextTriggers.push(overlayRecord(existing, known))
  }
  for (const t of nextTriggers) {
    const idx = pipeline.triggers.findIndex((x) => x.id === t.id)
    if (idx >= 0) pipeline.triggers[idx] = t
    else pipeline.triggers.push(t)
  }

  for (const p of worldPlan) {
    const rec = pipeline.worlds.find((w) => w.id === p.id)!
    issues.push(...validateWorld(pipeline, rec, `worlds[${p.index}]`))
  }
  for (const p of stagePlan) {
    const rec = pipeline.stages.find((s) => s.id === p.id)!
    issues.push(...validateStage(pipeline, rec, `stages[${p.index}]`))
  }
  for (const p of regionPlan) {
    const rec = pipeline.regions.find((r) => r.id === p.id)!
    issues.push(...validateRegion(pipeline, rec, `regions[${p.index}]`))
  }
  for (const p of encounterPlan) {
    const rec = pipeline.encounters.find((e) => e.id === p.id)!
    issues.push(...validateEncounter(pipeline, rec, `encounters[${p.index}]`))
  }
  for (const p of attackTablePlan) {
    const rec = pipeline.attackTables.find((t) => t.id === p.id)!
    issues.push(...validateAttackTable(pipeline, rec, `attackTables[${p.index}]`))
  }
  for (const p of enemyPlan) {
    const rec = pipeline.enemies.find((e) => e.id === p.id)!
    issues.push(...validateEnemy(pipeline, rec, `enemies[${p.index}]`))
  }
  for (const p of difficultyPlan) {
    const rec = pipeline.difficultyProfiles.find((d) => d.id === p.id)!
    issues.push(...validateDifficultyProfile(pipeline, rec, `difficultyProfiles[${p.index}]`))
  }
  for (const p of flagPlan) {
    const rec = pipeline.flags.find((f) => f.id === p.id)!
    issues.push(...validateGameFlag(pipeline, rec, `flags[${p.index}]`))
  }
  for (const p of npcPlan) {
    const rec = pipeline.npcs.find((n) => n.id === p.id)!
    issues.push(...validateNpc(pipeline, rec, `npcs[${p.index}]`))
  }
  for (const p of dialoguePlan) {
    const rec = pipeline.dialogues.find((d) => d.id === p.id)!
    issues.push(...validateDialogue(pipeline, rec, `dialogues[${p.index}]`))
  }
  for (const p of triggerPlan) {
    const rec = pipeline.triggers.find((t) => t.id === p.id)!
    issues.push(...validateTrigger(pipeline, rec, `triggers[${p.index}]`))
  }
  for (const p of characterPlan) {
    const rec = pipeline.characters.find((c) => c.id === p.id)!
    issues.push(...validateStoryProfile(pipeline, gameId, rec, `characters[${p.index}].storyProfile`))
  }
  for (const p of revealTokenPlan) {
    const rec = pipeline.revealTokens.find((t) => t.id === p.id)!
    issues.push(...validateRevealToken(pipeline, rec, `revealTokens[${p.index}]`))
  }
  for (const p of storyCirclePlan) {
    const rec = pipeline.storyCircles.find((c) => c.id === p.id)!
    issues.push(...validateStoryCircle(pipeline, rec, `storyCircles[${p.index}]`))
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
  pack('difficultyProfile', difficultyPlan, pipeline.difficultyProfiles)
  pack('attackTable', attackTablePlan, pipeline.attackTables)
  pack('enemy', enemyPlan, pipeline.enemies)
  pack('encounter', encounterPlan, pipeline.encounters)
  pack('flag', flagPlan, pipeline.flags)
  pack(
    'npc',
    npcPlan,
    pipeline.npcs.map((n) => ({ ...n, name: n.displayName }))
  )
  pack('dialogue', dialoguePlan, pipeline.dialogues)
  pack('trigger', triggerPlan, pipeline.triggers)
  pack('character', characterPlan, pipeline.characters)
  pack(
    'storyCircle',
    storyCirclePlan,
    pipeline.storyCircles
  )
  pack(
    'revealToken',
    revealTokenPlan,
    pipeline.revealTokens.map((t) => ({ ...t, name: t.title }))
  )

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
    region: before.regions || [],
    enemy: before.enemies || [],
    attackTable: before.attackTables || [],
    difficultyProfile: before.difficultyProfiles || [],
    flag: before.flags || [],
    trigger: before.triggers || [],
    npc: before.npcs || [],
    dialogue: before.dialogues || [],
    character: before.characters || [],
    storyCircle: before.storyCircles || [],
    revealToken: before.revealTokens || []
  }
  const afterLookup = {
    world: after.worlds || [],
    stage: after.stages || [],
    encounter: after.encounters || [],
    region: after.regions || [],
    enemy: after.enemies || [],
    attackTable: after.attackTables || [],
    difficultyProfile: after.difficultyProfiles || [],
    flag: after.flags || [],
    trigger: after.triggers || [],
    npc: after.npcs || [],
    dialogue: after.dialogues || [],
    character: after.characters || [],
    storyCircle: after.storyCircles || [],
    revealToken: after.revealTokens || []
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
