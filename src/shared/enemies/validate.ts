/**
 * Enemy records (2a). Game-agnostic: character, module, win kinds, and pose slots
 * come from per-game data. Still poses only.
 */

import type {
  AssetPipelineProject,
  AttackTable,
  BattleMoment,
  Character,
  Enemy,
  EnemyAssetRef,
  EnemyWinCondition,
  Game,
  GameEncounterModule,
  Pose
} from '../types/assetPipeline'
import { BATTLE_MOMENTS } from '../types/assetPipeline'
import { isKnownPoseSlot } from '../gameSettings/poseSlots'
import { assertWinConditionKey, findModule } from '../gameSettings/encounterSettings'
import { requireGame } from '../worldContent/scope'
import { assertRecordKey, isAliasRef, normalizeRecordKey } from '../worldContent/keys'
import {
  errorIssue,
  formatInUseError,
  type ContentIssue,
  type NamedUser
} from '../worldContent/issues'

export { BATTLE_MOMENTS, assertWinConditionKey }
export const FALLBACK_BATTLE_POSE_SLOT = 'ready'
export const BATTLE_TYPE_ID = 'battle'

export function enemiesOf(pipeline: AssetPipelineProject, gameId: string): Enemy[] {
  return (pipeline.enemies || []).filter((e) => e.gameId === gameId)
}

export function moduleWinKinds(mod: GameEncounterModule | undefined | null): string[] {
  return Array.isArray(mod?.winConditions) ? mod!.winConditions! : []
}

export function resolveCharacterRef(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string | undefined | null
): { id?: string; character?: Character; error?: string } {
  const value = String(raw ?? '').trim()
  if (!value) return { error: 'characterId is required' }
  const inGame = (pipeline.characters || []).filter((c) => c.gameId === gameId)
  if (isAliasRef(value) || value.startsWith('@')) {
    const key = normalizeRecordKey(value.replace(/^@/, ''))
    const found = inGame.find((c) => c.key === key)
    if (!found) return { error: `Character alias '@${key}' was not found in this game` }
    return { id: found.id, character: found }
  }
  const byId = inGame.find((c) => c.id === value)
  if (byId) return { id: byId.id, character: byId }
  const byKey = inGame.find((c) => c.key === value || c.key === normalizeRecordKey(value))
  if (byKey) return { id: byKey.id, character: byKey }
  const byName = inGame.filter((c) => c.name === value)
  if (byName.length === 1) return { id: byName[0].id, character: byName[0] }
  if (byName.length > 1) {
    return { error: `Character name '${value}' is not unique in this game` }
  }
  const other = (pipeline.characters || []).find((c) => c.id === value)
  if (other && other.gameId !== gameId) {
    return {
      error: `Character '${other.name}' belongs to game '${other.gameId}', not '${gameId}'`
    }
  }
  return { error: `Character '${value}' was not found in this game` }
}

export function resolveVisualAssetRef(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string | undefined | null
): { id?: string; error?: string } {
  const value = String(raw ?? '').trim()
  if (!value) return { error: 'assetId is required' }
  const assets = (pipeline.visualAssets || []).filter((a) => a.gameId === gameId)
  if (isAliasRef(value) || value.startsWith('@')) {
    const key = normalizeRecordKey(value.replace(/^@/, ''))
    const found = assets.find((a) => a.key === key)
    if (!found) return { error: `Visual asset alias '@${key}' was not found in this game` }
    return { id: found.id }
  }
  const found =
    assets.find((a) => a.id === value) ||
    assets.find((a) => a.key === value) ||
    assets.find((a) => a.name === value)
  if (found) return { id: found.id }
  const other = (pipeline.visualAssets || []).find((a) => a.id === value)
  if (other && other.gameId !== gameId) {
    return {
      error: `Visual asset '${other.name}' belongs to game '${other.gameId}', not '${gameId}'`
    }
  }
  return { error: `Visual asset '${value}' was not found in this game` }
}

export function parseFlatNumbers(
  raw: unknown,
  path: string,
  issues: ContentIssue[]
): Record<string, number> {
  if (raw === undefined || raw === null || raw === '') return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push(errorIssue(path, 'must be an object of number values'))
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

export function parseWinCondition(
  raw: unknown,
  path: string,
  issues: ContentIssue[]
): EnemyWinCondition | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push(errorIssue(path, 'winCondition must be { kind, params }'))
    return undefined
  }
  const obj = raw as Record<string, unknown>
  const kindRaw = String(obj.kind ?? '').trim()
  if (!kindRaw) {
    issues.push(errorIssue(`${path}.kind`, 'winCondition.kind is required'))
    return undefined
  }
  let kind = kindRaw
  try {
    kind = assertWinConditionKey(kindRaw)
  } catch (err) {
    issues.push(errorIssue(`${path}.kind`, err instanceof Error ? err.message : String(err)))
    return undefined
  }
  const params = parseFlatNumbers(obj.params ?? {}, `${path}.params`, issues)
  return { kind, params }
}

export function parsePoseMap(
  raw: unknown,
  path: string,
  issues: ContentIssue[]
): Partial<Record<BattleMoment, string>> {
  if (raw === undefined || raw === null || raw === '') return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push(errorIssue(path, 'poses must be an object of battle moment -> slot'))
    return {}
  }
  const out: Partial<Record<BattleMoment, string>> = {}
  for (const [moment, slot] of Object.entries(raw as Record<string, unknown>)) {
    if (!BATTLE_MOMENTS.includes(moment as BattleMoment)) {
      issues.push(
        errorIssue(
          `${path}.${moment}`,
          `Unknown battle moment '${moment}'. Allowed: ${BATTLE_MOMENTS.join(', ')}`
        )
      )
      continue
    }
    const slotKey = String(slot ?? '').trim()
    if (!slotKey) continue
    out[moment as BattleMoment] = slotKey
  }
  return out
}

export function parseAssetRefs(
  raw: unknown,
  path: string,
  issues: ContentIssue[]
): EnemyAssetRef[] {
  if (raw === undefined || raw === null || raw === '') return []
  if (!Array.isArray(raw)) {
    issues.push(errorIssue(path, 'assets must be an array'))
    return []
  }
  const out: EnemyAssetRef[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(errorIssue(`${path}[${i}]`, 'asset must be { role, assetId, states? }'))
      continue
    }
    const obj = item as Record<string, unknown>
    const role = String(obj.role ?? '').trim()
    const assetId = String(obj.assetId ?? '').trim()
    if (!role) issues.push(errorIssue(`${path}[${i}].role`, 'role is required'))
    if (!assetId) issues.push(errorIssue(`${path}[${i}].assetId`, 'assetId is required'))
    const ref: EnemyAssetRef = { role: role || `asset-${i}`, assetId }
    if (obj.states !== undefined) {
      if (!Array.isArray(obj.states)) {
        issues.push(errorIssue(`${path}[${i}].states`, 'states must be an array of names'))
      } else {
        ref.states = obj.states.map((s) => String(s ?? '').trim()).filter(Boolean)
      }
    }
    out.push(ref)
  }
  return out
}

function canonicalWinKind(mod: GameEncounterModule, kind: string): string | undefined {
  const lower = kind.toLowerCase()
  return moduleWinKinds(mod).find((k) => k.toLowerCase() === lower)
}

export function validateEnemy(
  pipeline: AssetPipelineProject,
  enemy: Enemy,
  path = 'enemy'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  let game: Game
  try {
    game = requireGame(pipeline, enemy.gameId)
  } catch (err) {
    issues.push(errorIssue(`${path}.gameId`, err instanceof Error ? err.message : String(err)))
    return issues
  }

  if (!String(enemy.name || '').trim()) {
    issues.push(errorIssue(`${path}.name`, 'name is required'))
  }

  try {
    assertRecordKey(enemy.key, 'Enemy')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }

  const char = (pipeline.characters || []).find((c) => c.id === enemy.characterId)
  if (!char) {
    issues.push(errorIssue(`${path}.characterId`, `Character '${enemy.characterId}' was not found`))
  } else if (char.gameId !== enemy.gameId) {
    issues.push(
      errorIssue(
        `${path}.characterId`,
        `Character '${char.name}' belongs to game '${char.gameId}', not '${enemy.gameId}'`
      )
    )
  }

  const mod = findModule(game, enemy.moduleId)
  if (!mod) {
    issues.push(errorIssue(`${path}.moduleId`, `Unknown encounter module '${enemy.moduleId}'`))
  } else if (!mod.typeIds.includes(BATTLE_TYPE_ID)) {
    issues.push(
      errorIssue(
        `${path}.moduleId`,
        `Module '${mod.id}' does not support type '${BATTLE_TYPE_ID}'. Supported: ${mod.typeIds.join(', ')}`
      )
    )
  } else {
    const kind = enemy.winCondition?.kind
    if (!kind) {
      issues.push(errorIssue(`${path}.winCondition.kind`, 'winCondition.kind is required'))
    } else {
      const allowed = canonicalWinKind(mod, kind)
      if (!allowed) {
        const listed = moduleWinKinds(mod)
        issues.push(
          errorIssue(
            `${path}.winCondition.kind`,
            listed.length
              ? `Win kind '${kind}' is not in module '${mod.id}' winConditions (${listed.join(', ')})`
              : `Module '${mod.id}' has no winConditions; add them in Game Settings first`
          )
        )
      }
    }
    const params = enemy.winCondition?.params
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        if (!Number.isFinite(v)) {
          issues.push(errorIssue(`${path}.winCondition.params.${k}`, 'must be a finite number'))
        }
      }
    }
  }

  for (const [moment, slot] of Object.entries(enemy.poses || {})) {
    if (!BATTLE_MOMENTS.includes(moment as BattleMoment)) {
      issues.push(errorIssue(`${path}.poses.${moment}`, `Unknown battle moment '${moment}'`))
      continue
    }
    if (!slot) continue
    if (!char || !isKnownPoseSlot(slot, game, char)) {
      issues.push(
        errorIssue(
          `${path}.poses.${moment}`,
          `Pose slot '${slot}' is not one of this character's slots`
        )
      )
    }
  }

  for (let i = 0; i < (enemy.assets || []).length; i++) {
    const asset = enemy.assets![i]
    const resolved = resolveVisualAssetRef(pipeline, enemy.gameId, asset.assetId)
    if (resolved.error) {
      issues.push(errorIssue(`${path}.assets[${i}].assetId`, resolved.error))
      continue
    }
    const rec = (pipeline.visualAssets || []).find((a) => a.id === resolved.id)
    if (!rec) continue
    if (asset.states && asset.states.length) {
      const owned = (pipeline.assetStates || []).filter((s) => s.assetId === rec.id)
      for (const stateName of asset.states) {
        const found = owned.find(
          (s) => s.id === stateName || s.name === stateName || s.name.toLowerCase() === stateName.toLowerCase()
        )
        if (!found) {
          issues.push(
            errorIssue(
              `${path}.assets[${i}].states`,
              `Asset '${rec.name}' has no state '${stateName}'`
            )
          )
        }
      }
    }
  }

  const stats = enemy.stats || {}
  for (const [k, v] of Object.entries(stats)) {
    if (!Number.isFinite(v)) {
      issues.push(errorIssue(`${path}.stats.${k}`, 'must be a finite number'))
    }
  }

  if (enemy.attackTableId) {
    const tables = (pipeline.attackTables || []).filter((t) => t.gameId === enemy.gameId)
    const table =
      tables.find((t) => t.id === enemy.attackTableId) ||
      tables.find((t) => t.key === enemy.attackTableId) ||
      tables.find((t) => t.name === enemy.attackTableId)
    if (!table) {
      issues.push(
        errorIssue(`${path}.attackTableId`, `Attack table '${enemy.attackTableId}' was not found in this game`)
      )
    } else {
      if (table.gameId !== enemy.gameId) {
        issues.push(
          errorIssue(
            `${path}.attackTableId`,
            `Attack table '${table.name}' belongs to game '${table.gameId}', not '${enemy.gameId}'`
          )
        )
      }
      if (table.moduleId !== enemy.moduleId) {
        issues.push(
          errorIssue(
            `${path}.attackTableId`,
            `Attack table '${table.name}' belongs to module '${table.moduleId}', not '${enemy.moduleId}'`
          )
        )
      }
    }
  }

  return issues
}

export function slotForMoment(enemy: Enemy, moment: BattleMoment): string {
  return enemy.poses?.[moment] || FALLBACK_BATTLE_POSE_SLOT
}

function poseHasArt(poses: Pose[], characterId: string, slot: string): boolean {
  return poses.some((p) => p.characterId === characterId && p.slot === slot && Boolean(p.file))
}

export interface EnemyChecklistPose {
  slot: string
  have: boolean
  usedBy?: string
}

export interface EnemyChecklistAsset {
  role: string
  have: boolean
  states?: Record<string, boolean>
}

export interface EnemyChecklistRef {
  id: string
  name: string
  have: boolean
  usedBy: string
}

export interface EnemyChecklist {
  enemy: string
  character: string
  ready: boolean
  poses: EnemyChecklistPose[]
  assets: EnemyChecklistAsset[]
  cueEvents: EnemyChecklistRef[]
  sfx: EnemyChecklistRef[]
  usedBy: string[]
}

export function buildEnemyChecklist(pipeline: AssetPipelineProject, enemy: Enemy): EnemyChecklist {
  const character = (pipeline.characters || []).find((c) => c.id === enemy.characterId)
  const poses = pipeline.poses || []
  const slotUses: Record<string, string[]> = {}
  for (const moment of BATTLE_MOMENTS) {
    const mapped = Boolean(enemy.poses?.[moment])
    const slot = slotForMoment(enemy, moment)
    const label = mapped ? moment : `${moment} (unmapped, falls back to ${FALLBACK_BATTLE_POSE_SLOT})`
    if (!slotUses[slot]) slotUses[slot] = []
    slotUses[slot]!.push(label)
  }
  const table: AttackTable | undefined = enemy.attackTableId
    ? (pipeline.attackTables || []).find(
        (t) =>
          t.id === enemy.attackTableId ||
          t.key === enemy.attackTableId ||
          t.name === enemy.attackTableId
      )
    : undefined
  for (const row of table?.rows || []) {
    if (row.poseSlot) {
      const label = `attack row ${row.label || row.id}`
      if (!slotUses[row.poseSlot]) slotUses[row.poseSlot] = []
      slotUses[row.poseSlot]!.push(label)
    }
  }
  const poseRows: EnemyChecklistPose[] = Object.keys(slotUses).map((slot) => ({
    slot,
    have: character ? poseHasArt(poses, character.id, slot) : false,
    usedBy: slotUses[slot]!.join(', ')
  }))

  const assets: EnemyChecklistAsset[] = []
  for (const ref of enemy.assets || []) {
    const rec = (pipeline.visualAssets || []).find((a) => a.id === ref.assetId)
    const have = Boolean(rec)
    let states: Record<string, boolean> | undefined
    if (ref.states && ref.states.length) {
      states = {}
      const owned = (pipeline.assetStates || []).filter((s) => s.assetId === ref.assetId)
      for (const name of ref.states) {
        states[name] = owned.some(
          (s) => s.id === name || s.name === name || s.name.toLowerCase() === name.toLowerCase()
        )
      }
    }
    assets.push({ role: ref.role, have, states })
  }

  const cueEvents: EnemyChecklistRef[] = []
  const sfx: EnemyChecklistRef[] = []
  for (const row of table?.rows || []) {
    const usedBy = `attack row ${row.label || row.id}`
    if (row.cueEventId) {
      const event = (pipeline.eventDefinitions || []).find(
        (e) =>
          e.id === row.cueEventId ||
          e.key === row.cueEventId ||
          e.name === row.cueEventId
      )
      cueEvents.push({
        id: row.cueEventId,
        name: event?.name || row.cueEventId,
        have: Boolean(event) && event!.gameId === enemy.gameId,
        usedBy
      })
    }
    if (row.sfxAudioId) {
      const audio = (pipeline.audioAssets || []).find(
        (a) => a.id === row.sfxAudioId || a.name === row.sfxAudioId
      )
      sfx.push({
        id: row.sfxAudioId,
        name: audio?.name || row.sfxAudioId,
        have: Boolean(audio) && audio!.gameId === enemy.gameId,
        usedBy
      })
    }
  }

  const poseReady = poseRows.every((p) => p.have)
  const assetReady = assets.every(
    (a) => a.have && (!a.states || Object.values(a.states).every(Boolean))
  )
  const cueReady = cueEvents.every((c) => c.have)
  const sfxReady = sfx.every((s) => s.have)
  return {
    enemy: enemy.name,
    character: character?.name || enemy.characterId,
    ready: poseReady && assetReady && cueReady && sfxReady,
    poses: poseRows,
    assets,
    cueEvents,
    sfx,
    usedBy: []
  }
}

export function collectCharacterEnemyUsers(
  pipeline: AssetPipelineProject,
  characterId: string
): NamedUser[] {
  return (pipeline.enemies || [])
    .filter((e) => e.characterId === characterId)
    .map((e) => ({ id: e.id, name: e.name, kind: 'enemy' }))
}

export function collectWinConditionUsers(
  pipeline: AssetPipelineProject,
  gameId: string,
  moduleId: string,
  kind: string
): NamedUser[] {
  const lower = kind.toLowerCase()
  return enemiesOf(pipeline, gameId)
    .filter((e) => e.moduleId === moduleId && e.winCondition?.kind?.toLowerCase() === lower)
    .map((e) => ({ id: e.id, name: e.name, kind: 'enemy' }))
}

export function assertCanRemoveWinCondition(
  pipeline: AssetPipelineProject,
  gameId: string,
  moduleId: string,
  kind: string
): void {
  const users = collectWinConditionUsers(pipeline, gameId, moduleId, kind)
  if (users.length > 0) {
    throw new Error(formatInUseError('win condition', kind, users))
  }
}

export function assertEnemyKeyUnique(
  pipeline: AssetPipelineProject,
  gameId: string,
  key: string | undefined,
  excludeId: string | undefined
): void {
  if (!key) return
  const clash = enemiesOf(pipeline, gameId).find((e) => e.key === key && e.id !== excludeId)
  if (clash) {
    throw new Error(`Enemy key '${key}' already used by ${clash.id}`)
  }
}
