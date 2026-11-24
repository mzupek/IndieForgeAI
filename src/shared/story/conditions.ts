/**
 * Reusable condition / effect objects (Step 3). Game-agnostic.
 */

import type {
  AssetPipelineProject,
  Condition,
  Effect,
  FlagOp,
  GameFlag
} from '../types/assetPipeline'
import { isAliasRef, isUuid, normalizeRecordKey } from '../worldContent/keys'
import { errorIssue, warningIssue, type ContentIssue, type NamedUser } from '../worldContent/issues'

export function findRecord<T extends { id: string; key?: string; gameId: string }>(
  records: T[],
  idOrKey: string,
  gameId: string
): T | undefined {
  const raw = String(idOrKey || '').trim()
  if (!raw) return undefined
  const inGame = records.filter((r) => r.gameId === gameId)
  if (isAliasRef(raw) || (!isUuid(raw) && raw.startsWith('@'))) {
    const key = normalizeRecordKey(raw.replace(/^@/, ''))
    return inGame.find((r) => r.key === key)
  }
  return inGame.find((r) => r.id === raw) || inGame.find((r) => r.key === raw)
}

export const FLAG_OPS: FlagOp[] = ['eq', 'ne', 'gte', 'lte']
export const TRIGGER_KINDS = [
  'onHotspot',
  'onEnterRegion',
  'onStageEnter',
  'onEncounterWin',
  'onEncounterLose',
  'onDialogueEnd'
] as const

const CONDITION_KEYS = ['all', 'any', 'not', 'flag', 'stageCleared', 'encounterWon'] as const
const EFFECT_KEYS = [
  'setFlag',
  'incFlag',
  'clearFlag',
  'unlockStage',
  'startEncounter',
  'startDialogue',
  'playScene',
  'moveToRegion',
  'returnToWorldMap',
  'grantRevealToken'
] as const

export interface EvalContext {
  flags: Map<string, boolean | number>
  clearedStages: Set<string>
  wonEncounters: Set<string>
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function presentKeys(obj: Record<string, unknown>, allowed: readonly string[]): string[] {
  return allowed.filter((k) => obj[k] !== undefined)
}

export function flagsOf(pipeline: AssetPipelineProject, gameId: string): GameFlag[] {
  return (pipeline.flags || []).filter((f) => f.gameId === gameId)
}

export function resolveFlagRef(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string
): { id?: string; error?: string } {
  const value = String(raw || '').trim()
  if (!value) return { error: 'flag id is required' }
  const found = findRecord(pipeline.flags || [], value, gameId)
  if (found) return { id: found.id }
  const inGame = flagsOf(pipeline, gameId)
  const byName = inGame.find((f) => f.name === value)
  if (byName) return { id: byName.id }
  const other = (pipeline.flags || []).find((f) => f.id === value || f.key === value || f.name === value)
  if (other && other.gameId !== gameId) {
    return { error: `Flag '${value}' belongs to another game` }
  }
  return { error: `Flag '${value}' was not found in this game` }
}

export function parseCondition(raw: unknown, path: string, issues: ContentIssue[]): Condition | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const obj = asRecord(raw)
  if (!obj) {
    issues.push(errorIssue(path, 'Condition must be an object (all/any/not/flag/stageCleared/encounterWon)'))
    return undefined
  }
  const keys = presentKeys(obj, CONDITION_KEYS)
  if (keys.length !== 1) {
    issues.push(
      errorIssue(path, `Condition must have exactly one of ${CONDITION_KEYS.join(', ')}. Got ${keys.join(', ') || '(none)'}`)
    )
    return undefined
  }
  const kind = keys[0]!
  if (kind === 'all' || kind === 'any') {
    if (!Array.isArray(obj[kind])) {
      issues.push(errorIssue(`${path}.${kind}`, `${kind} must be an array of conditions`))
      return undefined
    }
    const children: Condition[] = []
    for (let i = 0; i < obj[kind].length; i++) {
      const child = parseCondition(obj[kind][i], `${path}.${kind}[${i}]`, issues)
      if (child) children.push(child)
    }
    return { [kind]: children } as Condition
  }
  if (kind === 'not') {
    const inner = parseCondition(obj.not, `${path}.not`, issues)
    return inner ? { not: inner } : undefined
  }
  if (kind === 'flag') {
    const flag = asRecord(obj.flag)
    if (!flag) {
      issues.push(errorIssue(`${path}.flag`, 'flag check must be { flagId, op, value }'))
      return undefined
    }
    const flagId = String(flag.flagId ?? '').trim()
    const op = String(flag.op ?? 'eq').trim() as FlagOp
    if (!flagId) issues.push(errorIssue(`${path}.flag.flagId`, 'flagId is required'))
    if (!FLAG_OPS.includes(op)) {
      issues.push(errorIssue(`${path}.flag.op`, `op must be one of ${FLAG_OPS.join(', ')}`))
      return undefined
    }
    if (flag.value === undefined || flag.value === null || flag.value === '') {
      issues.push(errorIssue(`${path}.flag.value`, 'value is required'))
      return undefined
    }
    const value = flag.value as boolean | number
    if (typeof value !== 'boolean' && typeof value !== 'number') {
      issues.push(errorIssue(`${path}.flag.value`, 'value must be a boolean or number'))
      return undefined
    }
    if (!flagId) return undefined
    return { flag: { flagId, op, value } }
  }
  if (kind === 'stageCleared') {
    const inner = asRecord(obj.stageCleared)
    const stageId = String((inner?.stageId ?? obj.stageCleared) || '').trim()
    if (!inner || !stageId) {
      issues.push(errorIssue(`${path}.stageCleared`, 'stageCleared must be { stageId }'))
      return undefined
    }
    return { stageCleared: { stageId } }
  }
  const inner = asRecord(obj.encounterWon)
  const encounterId = String((inner?.encounterId ?? obj.encounterWon) || '').trim()
  if (!inner || !encounterId) {
    issues.push(errorIssue(`${path}.encounterWon`, 'encounterWon must be { encounterId }'))
    return undefined
  }
  return { encounterWon: { encounterId } }
}

export function parseEffects(raw: unknown, path: string, issues: ContentIssue[]): Effect[] {
  if (raw === undefined || raw === null || raw === '') return []
  if (!Array.isArray(raw)) {
    issues.push(errorIssue(path, 'effects must be an array'))
    return []
  }
  const out: Effect[] = []
  for (let i = 0; i < raw.length; i++) {
    const effect = parseEffect(raw[i], `${path}[${i}]`, issues)
    if (effect) out.push(effect)
  }
  return out
}

export function parseEffect(raw: unknown, path: string, issues: ContentIssue[]): Effect | undefined {
  const obj = asRecord(raw)
  if (!obj) {
    issues.push(errorIssue(path, 'Effect must be an object'))
    return undefined
  }
  const keys = presentKeys(obj, EFFECT_KEYS)
  if (keys.length !== 1) {
    issues.push(
      errorIssue(path, `Effect must have exactly one of ${EFFECT_KEYS.join(', ')}. Got ${keys.join(', ') || '(none)'}`)
    )
    return undefined
  }
  const kind = keys[0]!
  if (kind === 'returnToWorldMap') {
    if (obj.returnToWorldMap !== true && obj.returnToWorldMap !== 'true') {
      issues.push(errorIssue(`${path}.returnToWorldMap`, 'returnToWorldMap must be true'))
      return undefined
    }
    return { returnToWorldMap: true }
  }
  if (kind === 'setFlag') {
    const inner = asRecord(obj.setFlag)
    const flagId = String(inner?.flagId ?? '').trim()
    if (!inner || !flagId || inner.value === undefined || inner.value === null || inner.value === '') {
      issues.push(errorIssue(`${path}.setFlag`, 'setFlag must be { flagId, value }'))
      return undefined
    }
    if (typeof inner.value !== 'boolean' && typeof inner.value !== 'number') {
      issues.push(errorIssue(`${path}.setFlag.value`, 'value must be a boolean or number'))
      return undefined
    }
    return { setFlag: { flagId, value: inner.value as boolean | number } }
  }
  if (kind === 'incFlag') {
    const inner = asRecord(obj.incFlag)
    const flagId = String(inner?.flagId ?? '').trim()
    const by = typeof inner?.by === 'number' ? inner.by : Number(inner?.by)
    if (!inner || !flagId || !Number.isFinite(by) || !Number.isInteger(by)) {
      issues.push(errorIssue(`${path}.incFlag`, 'incFlag must be { flagId, by } with an integer by'))
      return undefined
    }
    return { incFlag: { flagId, by } }
  }
  if (kind === 'clearFlag') {
    const inner = asRecord(obj.clearFlag)
    const flagId = String(inner?.flagId ?? obj.clearFlag ?? '').trim()
    if (!flagId) {
      issues.push(errorIssue(`${path}.clearFlag`, 'clearFlag must be { flagId }'))
      return undefined
    }
    return { clearFlag: { flagId } }
  }
  if (kind === 'unlockStage') {
    const inner = asRecord(obj.unlockStage)
    const stageId = String(inner?.stageId ?? '').trim()
    if (!stageId) {
      issues.push(errorIssue(`${path}.unlockStage`, 'unlockStage must be { stageId }'))
      return undefined
    }
    return { unlockStage: { stageId } }
  }
  if (kind === 'startEncounter') {
    const inner = asRecord(obj.startEncounter)
    const encounterId = String(inner?.encounterId ?? '').trim()
    if (!encounterId) {
      issues.push(errorIssue(`${path}.startEncounter`, 'startEncounter must be { encounterId }'))
      return undefined
    }
    return { startEncounter: { encounterId } }
  }
  if (kind === 'startDialogue') {
    const inner = asRecord(obj.startDialogue)
    const dialogueId = String(inner?.dialogueId ?? '').trim()
    if (!dialogueId) {
      issues.push(errorIssue(`${path}.startDialogue`, 'startDialogue must be { dialogueId }'))
      return undefined
    }
    return { startDialogue: { dialogueId } }
  }
  if (kind === 'playScene') {
    const inner = asRecord(obj.playScene)
    const sceneId = String(inner?.sceneId ?? '').trim()
    if (!sceneId) {
      issues.push(errorIssue(`${path}.playScene`, 'playScene must be { sceneId }'))
      return undefined
    }
    return { playScene: { sceneId } }
  }
  if (kind === 'grantRevealToken') {
    const inner = asRecord(obj.grantRevealToken)
    const tokenId = String(inner?.tokenId ?? '').trim()
    if (!tokenId) {
      issues.push(errorIssue(`${path}.grantRevealToken`, 'grantRevealToken must be { tokenId }'))
      return undefined
    }
    return { grantRevealToken: { tokenId } }
  }
  const inner = asRecord(obj.moveToRegion)
  const regionId = String(inner?.regionId ?? '').trim()
  if (!regionId) {
    issues.push(errorIssue(`${path}.moveToRegion`, 'moveToRegion must be { regionId, anchorId? }'))
    return undefined
  }
  const effect: Effect = { moveToRegion: { regionId } }
  const anchorId = String(inner?.anchorId ?? '').trim()
  if (anchorId) effect.moveToRegion.anchorId = anchorId
  return effect
}

export function validateCondition(
  pipeline: AssetPipelineProject,
  gameId: string,
  condition: Condition | undefined,
  path: string
): ContentIssue[] {
  if (!condition) return []
  const issues: ContentIssue[] = []
  if ('all' in condition) {
    for (let i = 0; i < condition.all.length; i++) {
      issues.push(...validateCondition(pipeline, gameId, condition.all[i], `${path}.all[${i}]`))
    }
    return issues
  }
  if ('any' in condition) {
    for (let i = 0; i < condition.any.length; i++) {
      issues.push(...validateCondition(pipeline, gameId, condition.any[i], `${path}.any[${i}]`))
    }
    return issues
  }
  if ('not' in condition) {
    return validateCondition(pipeline, gameId, condition.not, `${path}.not`)
  }
  if ('flag' in condition) {
    const found = resolveFlagRef(pipeline, gameId, condition.flag.flagId)
    if (!found.id) {
      issues.push(errorIssue(`${path}.flag.flagId`, found.error || 'Flag was not found'))
      return issues
    }
    const flag = (pipeline.flags || []).find((f) => f.id === found.id)!
    const value = condition.flag.value
    if (flag.type === 'bool' && typeof value !== 'boolean') {
      issues.push(errorIssue(`${path}.flag.value`, `Flag '${flag.name}' is bool; value must be boolean`))
    }
    if (flag.type === 'int') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        issues.push(errorIssue(`${path}.flag.value`, `Flag '${flag.name}' is int; value must be an integer`))
      }
    }
    if ((condition.flag.op === 'gte' || condition.flag.op === 'lte') && flag.type !== 'int') {
      issues.push(errorIssue(`${path}.flag.op`, `op '${condition.flag.op}' is only valid for int flags`))
    }
    return issues
  }
  if ('stageCleared' in condition) {
    const stage = findRecord(pipeline.stages || [], condition.stageCleared.stageId, gameId)
    if (!stage) issues.push(errorIssue(`${path}.stageCleared.stageId`, `Stage '${condition.stageCleared.stageId}' was not found`))
    return issues
  }
  const enc = findRecord(pipeline.encounters || [], condition.encounterWon.encounterId, gameId)
  if (!enc) {
    issues.push(
      errorIssue(`${path}.encounterWon.encounterId`, `Encounter '${condition.encounterWon.encounterId}' was not found`)
    )
  }
  return issues
}

export function validateEffects(
  pipeline: AssetPipelineProject,
  gameId: string,
  effects: Effect[] | undefined,
  path: string
): ContentIssue[] {
  const issues: ContentIssue[] = []
  for (let i = 0; i < (effects || []).length; i++) {
    issues.push(...validateEffect(pipeline, gameId, effects![i]!, `${path}[${i}]`))
  }
  return issues
}

function validateEffect(
  pipeline: AssetPipelineProject,
  gameId: string,
  effect: Effect,
  path: string
): ContentIssue[] {
  const issues: ContentIssue[] = []
  if ('setFlag' in effect) {
    const found = resolveFlagRef(pipeline, gameId, effect.setFlag.flagId)
    if (!found.id) {
      issues.push(errorIssue(`${path}.setFlag.flagId`, found.error || 'Flag was not found'))
      return issues
    }
    const flag = (pipeline.flags || []).find((f) => f.id === found.id)!
    const value = effect.setFlag.value
    if (flag.type === 'bool' && typeof value !== 'boolean') {
      issues.push(errorIssue(`${path}.setFlag.value`, `Flag '${flag.name}' is bool; value must be boolean`))
    }
    if (flag.type === 'int' && (typeof value !== 'number' || !Number.isInteger(value))) {
      issues.push(errorIssue(`${path}.setFlag.value`, `Flag '${flag.name}' is int; value must be an integer`))
    }
    return issues
  }
  if ('incFlag' in effect) {
    const found = resolveFlagRef(pipeline, gameId, effect.incFlag.flagId)
    if (!found.id) {
      issues.push(errorIssue(`${path}.incFlag.flagId`, found.error || 'Flag was not found'))
      return issues
    }
    const flag = (pipeline.flags || []).find((f) => f.id === found.id)!
    if (flag.type !== 'int') {
      issues.push(errorIssue(`${path}.incFlag.flagId`, `incFlag requires an int flag; '${flag.name}' is ${flag.type}`))
    }
    return issues
  }
  if ('clearFlag' in effect) {
    const found = resolveFlagRef(pipeline, gameId, effect.clearFlag.flagId)
    if (!found.id) issues.push(errorIssue(`${path}.clearFlag.flagId`, found.error || 'Flag was not found'))
    return issues
  }
  if ('unlockStage' in effect) {
    const stage = findRecord(pipeline.stages || [], effect.unlockStage.stageId, gameId)
    if (!stage) issues.push(errorIssue(`${path}.unlockStage.stageId`, `Stage '${effect.unlockStage.stageId}' was not found`))
    return issues
  }
  if ('startEncounter' in effect) {
    const enc = findRecord(pipeline.encounters || [], effect.startEncounter.encounterId, gameId)
    if (!enc) {
      issues.push(
        errorIssue(`${path}.startEncounter.encounterId`, `Encounter '${effect.startEncounter.encounterId}' was not found`)
      )
    }
    return issues
  }
  if ('startDialogue' in effect) {
    const dialogues = ((pipeline as AssetPipelineProject & { dialogues?: { id: string; gameId: string; key?: string; name: string }[] })
      .dialogues || [])
      .filter((d) => d.gameId === gameId)
    const raw = effect.startDialogue.dialogueId
    const found =
      dialogues.find((d) => d.id === raw) ||
      dialogues.find((d) => d.key === raw.replace(/^@/, '')) ||
      dialogues.find((d) => d.name === raw)
    if (!found) {
      issues.push(errorIssue(`${path}.startDialogue.dialogueId`, `Dialogue '${raw}' was not found`))
    }
    return issues
  }
  if ('playScene' in effect) {
    const scenes = (pipeline.scenes || []).filter((s) => s.gameId === gameId)
    const raw = effect.playScene.sceneId
    const found =
      scenes.find((s) => s.id === raw) || scenes.find((s) => s.key === raw) || scenes.find((s) => s.name === raw)
    if (!found) issues.push(errorIssue(`${path}.playScene.sceneId`, `Scene '${raw}' was not found in this game`))
    return issues
  }
  if ('moveToRegion' in effect) {
    const region = findRecord(pipeline.regions || [], effect.moveToRegion.regionId, gameId)
    if (!region) {
      issues.push(errorIssue(`${path}.moveToRegion.regionId`, `Region '${effect.moveToRegion.regionId}' was not found`))
      return issues
    }
    if (effect.moveToRegion.anchorId) {
      const ok = (region.anchors || []).some((a) => a.id === effect.moveToRegion.anchorId)
      if (!ok) {
        issues.push(
          errorIssue(
            `${path}.moveToRegion.anchorId`,
            `Anchor '${effect.moveToRegion.anchorId}' was not found on region '${region.name}'`
          )
        )
      }
    }
    return issues
  }
  if ('grantRevealToken' in effect) {
    const tokens = (pipeline.revealTokens || []).filter((t) => t.gameId === gameId)
    const raw = effect.grantRevealToken.tokenId
    const found =
      tokens.find((t) => t.id === raw) ||
      tokens.find((t) => t.key === raw.replace(/^@/, '')) ||
      tokens.find((t) => t.title === raw)
    if (!found) {
      issues.push(errorIssue(`${path}.grantRevealToken.tokenId`, `Reveal token '${raw}' was not found`))
    }
    return issues
  }
  return issues
}

export function summarizeCondition(
  pipeline: AssetPipelineProject,
  gameId: string,
  condition: Condition | undefined
): string {
  if (!condition) return '(none)'
  if ('all' in condition) {
    if (condition.all.length === 0) return 'always'
    return condition.all.map((c) => `(${summarizeCondition(pipeline, gameId, c)})`).join(' AND ')
  }
  if ('any' in condition) {
    if (condition.any.length === 0) return 'never'
    return condition.any.map((c) => `(${summarizeCondition(pipeline, gameId, c)})`).join(' OR ')
  }
  if ('not' in condition) return `NOT (${summarizeCondition(pipeline, gameId, condition.not)})`
  if ('flag' in condition) {
    const flag = flagsOf(pipeline, gameId).find((f) => f.id === condition.flag.flagId)
    const name = flag?.key || flag?.name || condition.flag.flagId
    return `${name} ${condition.flag.op} ${String(condition.flag.value)}`
  }
  if ('stageCleared' in condition) {
    const stage = (pipeline.stages || []).find((s) => s.id === condition.stageCleared.stageId)
    return `stage cleared: ${stage?.name || condition.stageCleared.stageId}`
  }
  const enc = (pipeline.encounters || []).find((e) => e.id === condition.encounterWon.encounterId)
  return `encounter won: ${enc?.name || condition.encounterWon.encounterId}`
}

export function summarizeEffect(pipeline: AssetPipelineProject, gameId: string, effect: Effect): string {
  if ('setFlag' in effect) {
    const flag = flagsOf(pipeline, gameId).find((f) => f.id === effect.setFlag.flagId)
    return `set ${flag?.key || flag?.name || effect.setFlag.flagId} = ${String(effect.setFlag.value)}`
  }
  if ('incFlag' in effect) {
    const flag = flagsOf(pipeline, gameId).find((f) => f.id === effect.incFlag.flagId)
    return `inc ${flag?.key || flag?.name || effect.incFlag.flagId} by ${effect.incFlag.by}`
  }
  if ('clearFlag' in effect) {
    const flag = flagsOf(pipeline, gameId).find((f) => f.id === effect.clearFlag.flagId)
    return `clear ${flag?.key || flag?.name || effect.clearFlag.flagId}`
  }
  if ('unlockStage' in effect) {
    const stage = (pipeline.stages || []).find((s) => s.id === effect.unlockStage.stageId)
    return `unlock ${stage?.name || effect.unlockStage.stageId}`
  }
  if ('startEncounter' in effect) {
    const enc = (pipeline.encounters || []).find((e) => e.id === effect.startEncounter.encounterId)
    return `start encounter ${enc?.name || effect.startEncounter.encounterId}`
  }
  if ('startDialogue' in effect) return `start dialogue ${effect.startDialogue.dialogueId}`
  if ('playScene' in effect) {
    const scene = (pipeline.scenes || []).find((s) => s.id === effect.playScene.sceneId)
    return `play scene ${scene?.name || effect.playScene.sceneId}`
  }
  if ('moveToRegion' in effect) {
    const region = (pipeline.regions || []).find((r) => r.id === effect.moveToRegion.regionId)
    const anchor = effect.moveToRegion.anchorId ? ` @ ${effect.moveToRegion.anchorId}` : ''
    return `move to ${region?.name || effect.moveToRegion.regionId}${anchor}`
  }
  if ('grantRevealToken' in effect) {
    const token = (pipeline.revealTokens || []).find((t) => t.id === effect.grantRevealToken.tokenId)
    const label = pipeline.games.find((g) => g.id === gameId)?.settings?.revealTokenLabel || 'Reveal token'
    return `grant ${label.toLowerCase()} ${token?.title || effect.grantRevealToken.tokenId}`
  }
  return 'return to world map'
}

export function summarizeEffects(pipeline: AssetPipelineProject, gameId: string, effects: Effect[] | undefined): string {
  if (!effects || effects.length === 0) return '(none)'
  return effects.map((e) => summarizeEffect(pipeline, gameId, e)).join('; ')
}

export function evaluateCondition(condition: Condition | undefined, ctx: EvalContext): boolean {
  if (!condition) return true
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(c, ctx))
  if ('any' in condition) return condition.any.some((c) => evaluateCondition(c, ctx))
  if ('not' in condition) return !evaluateCondition(condition.not, ctx)
  if ('flag' in condition) {
    const current = ctx.flags.get(condition.flag.flagId)
    const expected = condition.flag.value
    if (condition.flag.op === 'eq') return current === expected
    if (condition.flag.op === 'ne') return current !== expected
    const a = typeof current === 'number' ? current : Number(current)
    const b = typeof expected === 'number' ? expected : Number(expected)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    if (condition.flag.op === 'gte') return a >= b
    return a <= b
  }
  if ('stageCleared' in condition) return ctx.clearedStages.has(condition.stageCleared.stageId)
  return ctx.wonEncounters.has(condition.encounterWon.encounterId)
}

function flagLeaves(
  condition: Condition | undefined,
  out: { flagId: string; op: FlagOp; value: boolean | number }[]
): void {
  if (!condition) return
  if ('all' in condition) condition.all.forEach((c) => flagLeaves(c, out))
  else if ('any' in condition) condition.any.forEach((c) => flagLeaves(c, out))
  else if ('not' in condition) flagLeaves(condition.not, out)
  else if ('flag' in condition) out.push(condition.flag)
}

function alwaysPasses(condition: Condition | undefined): boolean {
  if (!condition) return true
  if ('all' in condition) return condition.all.every(alwaysPasses)
  if ('any' in condition) return condition.any.length > 0 && condition.any.some(alwaysPasses)
  if ('not' in condition) return conditionNeverPasses(condition.not)
  return false
}

export function conditionNeverPasses(condition: Condition | undefined): boolean {
  if (!condition) return false
  if ('any' in condition) {
    if (condition.any.length === 0) return true
    return condition.any.every(conditionNeverPasses)
  }
  if ('all' in condition) {
    if (condition.all.some(conditionNeverPasses)) return true
    const leaves: { flagId: string; op: FlagOp; value: boolean | number }[] = []
    for (const child of condition.all) {
      if ('flag' in child) leaves.push(child.flag)
    }
    const byId = new Map<string, { flagId: string; op: FlagOp; value: boolean | number }[]>()
    for (const leaf of leaves) {
      const list = byId.get(leaf.flagId) || []
      list.push(leaf)
      byId.set(leaf.flagId, list)
    }
    for (const group of byId.values()) {
      const eqs = group.filter((l) => l.op === 'eq')
      for (let i = 0; i < eqs.length; i++) {
        for (let j = i + 1; j < eqs.length; j++) {
          if (eqs[i]!.value !== eqs[j]!.value) return true
        }
      }
      for (const eq of eqs) {
        if (group.some((l) => l.op === 'ne' && l.value === eq.value)) return true
      }
    }
    return false
  }
  if ('not' in condition) return alwaysPasses(condition.not)
  return false
}

export function collectConditionFlagIds(condition: Condition | undefined, into: Set<string>): void {
  const leaves: { flagId: string; op: FlagOp; value: boolean | number }[] = []
  flagLeaves(condition, leaves)
  for (const leaf of leaves) into.add(leaf.flagId)
}

export function collectEffectFlagWrites(
  effects: Effect[] | undefined,
  into: Set<string>,
  pipeline?: AssetPipelineProject
): void {
  for (const effect of effects || []) {
    if ('setFlag' in effect) into.add(effect.setFlag.flagId)
    else if ('incFlag' in effect) into.add(effect.incFlag.flagId)
    else if ('clearFlag' in effect) into.add(effect.clearFlag.flagId)
    else if ('grantRevealToken' in effect && pipeline) {
      const raw = effect.grantRevealToken.tokenId
      const token = (pipeline.revealTokens || []).find(
        (t) => t.id === raw || t.key === raw.replace(/^@/, '') || t.title === raw
      )
      if (token?.flagId) into.add(token.flagId)
    }
  }
}

export function collectConditionUsers(
  pipeline: AssetPipelineProject,
  flagId: string
): NamedUser[] {
  const users: NamedUser[] = []
  const add = (id: string, name: string, kind: string) => {
    if (!users.some((u) => u.id === id && u.kind === kind)) users.push({ id, name, kind })
  }
  const reads = (condition: Condition | undefined) => {
    const ids = new Set<string>()
    collectConditionFlagIds(condition, ids)
    return ids.has(flagId)
  }
  const writes = (effects: Effect[] | undefined) => {
    const ids = new Set<string>()
    collectEffectFlagWrites(effects, ids, pipeline)
    return ids.has(flagId)
  }
  for (const t of pipeline.triggers || []) {
    if (reads(t.condition) || writes(t.effects)) add(t.id, t.name, 'trigger')
  }
  for (const s of pipeline.stages || []) {
    if (reads(s.unlockCondition)) add(s.id, s.name, 'stage')
  }
  for (const e of pipeline.encounters || []) {
    if (writes(e.onWin) || writes(e.onLose)) add(e.id, e.name, 'encounter')
  }
  for (const n of pipeline.npcs || []) {
    for (const p of n.placements || []) {
      if (reads(p.condition)) add(n.id, n.displayName, 'npc')
    }
  }
  for (const d of pipeline.dialogues || []) {
    for (const variant of d.entryVariants || []) {
      if (reads(variant.condition)) add(d.id, d.name, 'dialogue')
    }
    for (const node of d.nodes || []) {
      if (writes(node.effects)) add(d.id, d.name, 'dialogue')
      for (const choice of node.choices || []) {
        if (reads(choice.condition) || writes(choice.effects)) add(d.id, d.name, 'dialogue')
      }
    }
  }
  for (const token of pipeline.revealTokens || []) {
    if (token.flagId === flagId || reads(token.unlockedBy)) add(token.id, token.title, 'revealToken')
  }
  for (const circle of pipeline.storyCircles || []) {
    for (const step of circle.steps || []) {
      if (step.flagId === flagId) add(circle.id, circle.name, 'storyCircle')
    }
  }
  return users
}

export function mapCondition(
  condition: Condition | undefined,
  mapId: (kind: 'flag' | 'stage' | 'encounter', id: string) => string | undefined
): Condition | undefined {
  if (!condition) return undefined
  if ('all' in condition) {
    return { all: condition.all.map((c) => mapCondition(c, mapId)!).filter(Boolean) as Condition[] }
  }
  if ('any' in condition) {
    return { any: condition.any.map((c) => mapCondition(c, mapId)!).filter(Boolean) as Condition[] }
  }
  if ('not' in condition) {
    const inner = mapCondition(condition.not, mapId)
    return inner ? { not: inner } : undefined
  }
  if ('flag' in condition) {
    const flagId = mapId('flag', condition.flag.flagId) || condition.flag.flagId
    return { flag: { ...condition.flag, flagId } }
  }
  if ('stageCleared' in condition) {
    const stageId = mapId('stage', condition.stageCleared.stageId) || condition.stageCleared.stageId
    return { stageCleared: { stageId } }
  }
  const encounterId = mapId('encounter', condition.encounterWon.encounterId) || condition.encounterWon.encounterId
  return { encounterWon: { encounterId } }
}

export function mapEffects(
  effects: Effect[] | undefined,
  mapId: (
    kind: 'flag' | 'stage' | 'encounter' | 'region' | 'scene' | 'dialogue' | 'revealToken',
    id: string
  ) => string | undefined
): Effect[] {
  const out: Effect[] = []
  for (const effect of effects || []) {
    if ('setFlag' in effect) {
      out.push({ setFlag: { ...effect.setFlag, flagId: mapId('flag', effect.setFlag.flagId) || effect.setFlag.flagId } })
    } else if ('incFlag' in effect) {
      out.push({ incFlag: { ...effect.incFlag, flagId: mapId('flag', effect.incFlag.flagId) || effect.incFlag.flagId } })
    } else if ('clearFlag' in effect) {
      out.push({ clearFlag: { flagId: mapId('flag', effect.clearFlag.flagId) || effect.clearFlag.flagId } })
    } else if ('unlockStage' in effect) {
      out.push({
        unlockStage: { stageId: mapId('stage', effect.unlockStage.stageId) || effect.unlockStage.stageId }
      })
    } else if ('startEncounter' in effect) {
      out.push({
        startEncounter: {
          encounterId: mapId('encounter', effect.startEncounter.encounterId) || effect.startEncounter.encounterId
        }
      })
    } else if ('startDialogue' in effect) {
      out.push({
        startDialogue: {
          dialogueId: mapId('dialogue', effect.startDialogue.dialogueId) || effect.startDialogue.dialogueId
        }
      })
    } else if ('playScene' in effect) {
      out.push({ playScene: { sceneId: mapId('scene', effect.playScene.sceneId) || effect.playScene.sceneId } })
    } else if ('moveToRegion' in effect) {
      out.push({
        moveToRegion: {
          ...effect.moveToRegion,
          regionId: mapId('region', effect.moveToRegion.regionId) || effect.moveToRegion.regionId
        }
      })
    } else if ('grantRevealToken' in effect) {
      out.push({
        grantRevealToken: {
          tokenId: mapId('revealToken', effect.grantRevealToken.tokenId) || effect.grantRevealToken.tokenId
        }
      })
    } else {
      out.push(effect)
    }
  }
  return out
}

function resolveBoundId(
  pipeline: AssetPipelineProject,
  gameId: string,
  kind: 'flag' | 'stage' | 'encounter' | 'region' | 'scene' | 'dialogue' | 'revealToken',
  id: string
): string | undefined {
  if (kind === 'flag') return resolveFlagRef(pipeline, gameId, id).id
  if (kind === 'stage') return findRecord(pipeline.stages || [], id, gameId)?.id
  if (kind === 'encounter') return findRecord(pipeline.encounters || [], id, gameId)?.id
  if (kind === 'region') return findRecord(pipeline.regions || [], id, gameId)?.id
  if (kind === 'scene') return findRecord(pipeline.scenes || [], id, gameId)?.id
  if (kind === 'revealToken') return findRecord(pipeline.revealTokens || [], id, gameId)?.id
  return id
}

/** Resolve @key / name refs in a condition to record ids for storage. */
export function bindCondition(
  pipeline: AssetPipelineProject,
  gameId: string,
  condition: Condition | undefined
): Condition | undefined {
  return mapCondition(condition, (kind, id) => resolveBoundId(pipeline, gameId, kind, id))
}

/** Resolve @key / name refs in effects to record ids for storage. */
export function bindEffects(
  pipeline: AssetPipelineProject,
  gameId: string,
  effects: Effect[] | undefined
): Effect[] {
  return mapEffects(effects, (kind, id) => resolveBoundId(pipeline, gameId, kind, id))
}
