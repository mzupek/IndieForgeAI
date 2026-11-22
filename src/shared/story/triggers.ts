/**
 * Trigger records (Step 3). Game-agnostic.
 */

import type { AssetPipelineProject, Region, Trigger, TriggerKind } from '../types/assetPipeline'
import { assertRecordKey } from '../worldContent/keys'
import { errorIssue, formatInUseError, warningIssue, type ContentIssue, type NamedUser } from '../worldContent/issues'
import {
  TRIGGER_KINDS,
  findRecord,
  parseCondition,
  parseEffects,
  validateCondition,
  validateEffects
} from './conditions'

export function triggersOf(pipeline: AssetPipelineProject, gameId: string): Trigger[] {
  return (pipeline.triggers || []).filter((t) => t.gameId === gameId)
}

export function parseTriggerKind(raw: unknown): TriggerKind {
  const value = String(raw ?? '').trim()
  if (!(TRIGGER_KINDS as readonly string[]).includes(value)) {
    throw new Error(`Trigger kind must be one of ${TRIGGER_KINDS.join(', ')}`)
  }
  return value as TriggerKind
}

export function findHotspotSource(
  pipeline: AssetPipelineProject,
  gameId: string,
  sourceRef: string
): { region: Region; hotspotId: string } | undefined {
  const raw = String(sourceRef || '').trim()
  if (!raw) return undefined
  const regions = (pipeline.regions || []).filter((r) => r.gameId === gameId)
  const split = raw.includes(':') ? raw.split(':') : raw.includes('/') ? raw.split('/') : null
  if (split && split.length === 2) {
    const region = findRecord(regions, split[0]!.trim(), gameId)
    const hotspotId = split[1]!.trim()
    if (region && (region.hotspots || []).some((h) => h.id === hotspotId)) {
      return { region, hotspotId }
    }
  }
  const matches: { region: Region; hotspotId: string }[] = []
  for (const region of regions) {
    for (const hs of region.hotspots || []) {
      if (hs.id === raw) matches.push({ region, hotspotId: hs.id })
    }
  }
  return matches.length === 1 ? matches[0] : undefined
}

export function validateTrigger(
  pipeline: AssetPipelineProject,
  trigger: Trigger,
  path = 'trigger'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  if (!String(trigger.name || '').trim()) issues.push(errorIssue(`${path}.name`, 'Trigger name is required'))
  if (!(TRIGGER_KINDS as readonly string[]).includes(trigger.kind)) {
    issues.push(errorIssue(`${path}.kind`, `kind must be one of ${TRIGGER_KINDS.join(', ')}`))
  }
  if (typeof trigger.once !== 'boolean') {
    issues.push(errorIssue(`${path}.once`, 'once must be a boolean'))
  }
  try {
    assertRecordKey(trigger.key, 'Trigger')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  if (trigger.key) {
    const clash = triggersOf(pipeline, trigger.gameId).find((t) => t.key === trigger.key && t.id !== trigger.id)
    if (clash) issues.push(errorIssue(`${path}.key`, `Trigger key '${trigger.key}' is already used by '${clash.name}'`))
  }

  const source = String(trigger.sourceRef || '').trim()
  if (!source) {
    issues.push(errorIssue(`${path}.sourceRef`, 'sourceRef is required'))
  } else {
    issues.push(...validateSource(pipeline, trigger, `${path}.sourceRef`))
  }

  if (trigger.condition) {
    issues.push(...validateCondition(pipeline, trigger.gameId, trigger.condition, `${path}.condition`))
  }
  issues.push(...validateEffects(pipeline, trigger.gameId, trigger.effects || [], `${path}.effects`))
  return issues
}

function validateSource(pipeline: AssetPipelineProject, trigger: Trigger, path: string): ContentIssue[] {
  const gameId = trigger.gameId
  const source = trigger.sourceRef
  if (trigger.kind === 'onHotspot') {
    const found = findHotspotSource(pipeline, gameId, source)
    if (!found) {
      return [warningIssue(path, `Trigger source hotspot '${source}' is missing`)]
    }
    return []
  }
  if (trigger.kind === 'onEnterRegion') {
    const region = findRecord(pipeline.regions || [], source, gameId)
    if (!region) return [warningIssue(path, `Trigger source region '${source}' is missing`)]
    return []
  }
  if (trigger.kind === 'onStageEnter') {
    const stage = findRecord(pipeline.stages || [], source, gameId)
    if (!stage) return [warningIssue(path, `Trigger source stage '${source}' is missing`)]
    return []
  }
  if (trigger.kind === 'onEncounterWin' || trigger.kind === 'onEncounterLose') {
    const enc = findRecord(pipeline.encounters || [], source, gameId)
    if (!enc) return [warningIssue(path, `Trigger source encounter '${source}' is missing`)]
    return []
  }
  const dialogues =
    ((pipeline as AssetPipelineProject & { dialogues?: { id: string; gameId: string; key?: string }[] }).dialogues ||
      [])
  const found =
    dialogues.find((d) => d.gameId === gameId && (d.id === source || d.key === source.replace(/^@/, '')))
  if (!found) return [warningIssue(path, `Trigger source dialogue '${source}' is missing`)]
  return []
}

export function collectTriggerUsers(pipeline: AssetPipelineProject, triggerId: string): NamedUser[] {
  const users: NamedUser[] = []
  for (const r of pipeline.regions || []) {
    for (const hs of r.hotspots || []) {
      if (hs.triggerId === triggerId) {
        users.push({ id: r.id, name: `${r.name} hotspot ${hs.id}`, kind: 'region' })
      }
    }
  }
  for (const n of pipeline.npcs || []) {
    for (const p of n.placements || []) {
      if (p.interactTriggerId === triggerId) {
        users.push({ id: n.id, name: n.displayName, kind: 'npc' })
      }
    }
  }
  return users
}

export function assertCanRemoveTrigger(pipeline: AssetPipelineProject, triggerId: string, name: string): void {
  const users = collectTriggerUsers(pipeline, triggerId)
  if (users.length) throw new Error(formatInUseError('trigger', name, users))
}

export function parseTriggerCondition(raw: unknown, path: string): { condition?: import('../types/assetPipeline').Condition; issues: ContentIssue[] } {
  const issues: ContentIssue[] = []
  const condition = parseCondition(raw, path, issues)
  return { condition, issues }
}

export function parseTriggerEffects(raw: unknown, path: string): { effects: import('../types/assetPipeline').Effect[]; issues: ContentIssue[] } {
  const issues: ContentIssue[] = []
  const effects = parseEffects(raw, path, issues)
  return { effects, issues }
}
