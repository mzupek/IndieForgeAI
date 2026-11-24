/**
 * Read-only flow simulate: given flag values, which stages unlock and which triggers fire.
 */

import type { AssetPipelineProject, GameFlag, RevealToken, Stage, Trigger, World } from '../types/assetPipeline'
import { evaluateCondition, flagsOf, summarizeCondition, summarizeEffects } from './conditions'
import { collectGrantedRevealTokens } from './revealTokens'
import { findHotspotSource, triggersOf } from './triggers'
import { stagesOf } from '../worldContent/validate'

export interface SimulateFlagInput {
  key: string
  value: boolean | number
}

export interface SimulateResult {
  worldId: string
  worldName: string
  flags: { id: string; key?: string; name: string; value: boolean | number }[]
  unlockedStages: { id: string; name: string; reason: string }[]
  lockedStages: { id: string; name: string; reason: string }[]
  firingTriggers: {
    id: string
    name: string
    kind: string
    sourceRef: string
    virtual?: boolean
    effects: string
  }[]
  grantedRevealTokens: { id: string; key?: string; title: string }[]
}

function parseScalar(raw: string): boolean | number {
  const t = raw.trim()
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+$/.test(t)) return Number(t)
  throw new Error(`Flag value '${raw}' must be true, false, or an integer`)
}

export function parseFlagAssignments(raw: string | undefined, flags: GameFlag[]): Map<string, boolean | number> {
  const map = new Map<string, boolean | number>()
  for (const flag of flags) map.set(flag.id, flag.default)
  if (!raw || !String(raw).trim()) return map
  for (const part of String(raw).split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) throw new Error(`Flag assignment '${trimmed}' must be key=value`)
    const key = trimmed.slice(0, eq).trim()
    const value = parseScalar(trimmed.slice(eq + 1))
    const flag =
      flags.find((f) => f.key === key) ||
      flags.find((f) => f.name === key) ||
      flags.find((f) => f.id === key)
    if (!flag) throw new Error(`Unknown flag '${key}'`)
    if (flag.type === 'bool' && typeof value !== 'boolean') {
      throw new Error(`Flag '${flag.name}' is bool`)
    }
    if (flag.type === 'int' && typeof value !== 'number') {
      throw new Error(`Flag '${flag.name}' is int`)
    }
    map.set(flag.id, value)
  }
  return map
}

function stageUnlocked(
  stage: Stage,
  stages: Stage[],
  world: World,
  memo: Map<string, boolean>,
  visiting: Set<string>,
  ctx: { flags: Map<string, boolean | number>; clearedStages: Set<string>; wonEncounters: Set<string> }
): boolean {
  const cached = memo.get(stage.id)
  if (cached !== undefined) return cached
  if (visiting.has(stage.id)) return false
  visiting.add(stage.id)
  const startId = world.map?.startNodeId
  const startNode = (world.map?.nodes || []).find((n) => n.id === startId)
  if (startNode?.stageId === stage.id) {
    memo.set(stage.id, true)
    visiting.delete(stage.id)
    return true
  }
  const after = stage.unlockAfter || []
  for (const id of after) {
    const other = stages.find((s) => s.id === id)
    if (!other || !stageUnlocked(other, stages, world, memo, visiting, ctx)) {
      memo.set(stage.id, false)
      visiting.delete(stage.id)
      return false
    }
  }
  const ok = evaluateCondition(stage.unlockCondition, ctx)
  memo.set(stage.id, ok)
  visiting.delete(stage.id)
  return ok
}

export function simulateWorldFlow(
  pipeline: AssetPipelineProject,
  world: World,
  flagRaw?: string
): SimulateResult {
  const flags = flagsOf(pipeline, world.gameId)
  const values = parseFlagAssignments(flagRaw, flags)
  const ctx = { flags: values, clearedStages: new Set<string>(), wonEncounters: new Set<string>() }
  const stages = stagesOf(pipeline, world.gameId, world.id)
  const memo = new Map<string, boolean>()
  // Two-pass: once unlocked stages exist, treat them as cleared for unlockAfter graphs
  // that depend on "cleared" via unlockAfter shorthand.
  for (const stage of stages) {
    if (stageUnlocked(stage, stages, world, memo, new Set(), ctx)) ctx.clearedStages.add(stage.id)
  }
  memo.clear()
  const unlockedStages: SimulateResult['unlockedStages'] = []
  const lockedStages: SimulateResult['lockedStages'] = []
  for (const stage of stages.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) {
    const open = stageUnlocked(stage, stages, world, memo, new Set(), ctx)
    const reasonBits: string[] = []
    if ((stage.unlockAfter || []).length) {
      reasonBits.push(`unlockAfter: ${(stage.unlockAfter || []).map((id) => stages.find((s) => s.id === id)?.name || id).join(', ')}`)
    }
    if (stage.unlockCondition) {
      reasonBits.push(summarizeCondition(pipeline, world.gameId, stage.unlockCondition))
    }
    const reason = reasonBits.join(' AND ') || 'open'
    if (open) unlockedStages.push({ id: stage.id, name: stage.name, reason })
    else lockedStages.push({ id: stage.id, name: stage.name, reason })
  }

  const firingTriggers: SimulateResult['firingTriggers'] = []
  for (const trigger of triggersOf(pipeline, world.gameId)) {
    if (!evaluateCondition(trigger.condition, ctx)) continue
    const sourceOk = triggerSourcePresent(pipeline, trigger)
    if (!sourceOk) continue
    if (trigger.kind === 'onStageEnter' || trigger.kind === 'onHotspot' || trigger.kind === 'onEnterRegion') {
      firingTriggers.push({
        id: trigger.id,
        name: trigger.name,
        kind: trigger.kind,
        sourceRef: trigger.sourceRef,
        effects: summarizeEffects(pipeline, world.gameId, trigger.effects)
      })
    } else if (evaluateCondition(trigger.condition, ctx)) {
      firingTriggers.push({
        id: trigger.id,
        name: trigger.name,
        kind: trigger.kind,
        sourceRef: trigger.sourceRef,
        effects: summarizeEffects(pipeline, world.gameId, trigger.effects)
      })
    }
  }

  for (const region of pipeline.regions || []) {
    if (region.gameId !== world.gameId) continue
    const stage = stages.find((s) => s.id === region.stageId)
    if (!stage) continue
    for (const hs of region.hotspots || []) {
      if (!hs.encounterId || hs.triggerId) continue
      firingTriggers.push({
        id: `hotspot:${region.id}:${hs.id}`,
        name: hs.prompt || hs.id,
        kind: 'onHotspot',
        sourceRef: hs.id,
        virtual: true,
        effects: `start encounter ${(pipeline.encounters || []).find((e) => e.id === hs.encounterId)?.name || hs.encounterId}`
      })
    }
  }

  const granted: RevealToken[] = []
  for (const trigger of firingTriggers) {
    if (trigger.virtual) continue
    const rec = (pipeline.triggers || []).find((t) => t.id === trigger.id)
    for (const token of collectGrantedRevealTokens(pipeline, world.gameId, rec?.effects)) {
      if (!granted.some((g) => g.id === token.id)) granted.push(token)
    }
  }
  return {
    worldId: world.id,
    worldName: world.name,
    flags: flags.map((f) => ({
      id: f.id,
      key: f.key,
      name: f.name,
      value: values.get(f.id) ?? f.default
    })),
    unlockedStages,
    lockedStages,
    firingTriggers,
    grantedRevealTokens: granted.map((t) => ({ id: t.id, key: t.key, title: t.title }))
  }
}

function triggerSourcePresent(pipeline: AssetPipelineProject, trigger: Trigger): boolean {
  if (trigger.kind === 'onHotspot') return Boolean(findHotspotSource(pipeline, trigger.gameId, trigger.sourceRef))
  if (trigger.kind === 'onEnterRegion') {
    return (pipeline.regions || []).some((r) => r.gameId === trigger.gameId && (r.id === trigger.sourceRef || r.key === trigger.sourceRef.replace(/^@/, '')))
  }
  if (trigger.kind === 'onStageEnter') {
    return (pipeline.stages || []).some((s) => s.gameId === trigger.gameId && (s.id === trigger.sourceRef || s.key === trigger.sourceRef.replace(/^@/, '')))
  }
  if (trigger.kind === 'onEncounterWin' || trigger.kind === 'onEncounterLose') {
    return (pipeline.encounters || []).some(
      (e) => e.gameId === trigger.gameId && (e.id === trigger.sourceRef || e.key === trigger.sourceRef.replace(/^@/, ''))
    )
  }
  return true
}
