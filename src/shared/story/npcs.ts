/**
 * NPC records (Step 4). Game-agnostic. Character still-poses only.
 */

import type { AssetPipelineProject, Npc, NpcPlacement } from '../types/assetPipeline'
import { assertRecordKey } from '../worldContent/keys'
import { errorIssue, formatInUseError, warningIssue, type ContentIssue, type NamedUser } from '../worldContent/issues'
import { findRecord, validateCondition } from './conditions'

export function npcsOf(pipeline: AssetPipelineProject, gameId: string): Npc[] {
  return (pipeline.npcs || []).filter((n) => n.gameId === gameId)
}

export function validateNpc(pipeline: AssetPipelineProject, npc: Npc, path = 'npc'): ContentIssue[] {
  const issues: ContentIssue[] = []
  if (!String(npc.displayName || '').trim()) {
    issues.push(errorIssue(`${path}.displayName`, 'NPC displayName is required'))
  }
  if (!String(npc.role || '').trim()) {
    issues.push(errorIssue(`${path}.role`, 'NPC role is required'))
  }
  try {
    assertRecordKey(npc.key, 'NPC')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  if (npc.key) {
    const clash = npcsOf(pipeline, npc.gameId).find((n) => n.key === npc.key && n.id !== npc.id)
    if (clash) issues.push(errorIssue(`${path}.key`, `NPC key '${npc.key}' is already used by '${clash.displayName}'`))
  }
  const character = (pipeline.characters || []).find((c) => c.id === npc.characterId && c.gameId === npc.gameId)
  if (!npc.characterId || !character) {
    issues.push(errorIssue(`${path}.characterId`, `Character '${npc.characterId || ''}' was not found`))
  }
  if (npc.defaultDialogueId) {
    const dlg = findRecord(pipeline.dialogues || [], npc.defaultDialogueId, npc.gameId)
    if (!dlg) {
      issues.push(errorIssue(`${path}.defaultDialogueId`, `Dialogue '${npc.defaultDialogueId}' was not found`))
    }
  }
  const placements = npc.placements || []
  const seen = new Set<string>()
  for (let i = 0; i < placements.length; i++) {
    issues.push(...validatePlacement(pipeline, npc, placements[i]!, `${path}.placements[${i}]`, seen))
  }
  return issues
}

function validatePlacement(
  pipeline: AssetPipelineProject,
  npc: Npc,
  placement: NpcPlacement,
  path: string,
  seen: Set<string>
): ContentIssue[] {
  const issues: ContentIssue[] = []
  const region = findRecord(pipeline.regions || [], placement.regionId, npc.gameId)
  if (!region) {
    issues.push(errorIssue(`${path}.regionId`, `Region '${placement.regionId}' was not found`))
    return issues
  }
  const anchor = (region.anchors || []).find((a) => a.id === placement.anchorId)
  if (!placement.anchorId || !anchor) {
    issues.push(errorIssue(`${path}.anchorId`, `Anchor '${placement.anchorId || ''}' was not found on '${region.name}'`))
  }
  const sig = `${region.id}:${placement.anchorId}`
  if (seen.has(sig)) {
    issues.push(errorIssue(path, `Duplicate placement on '${region.name}' @ ${placement.anchorId}`))
  }
  seen.add(sig)
  if (placement.condition) {
    issues.push(...validateCondition(pipeline, npc.gameId, placement.condition, `${path}.condition`))
  }
  if (placement.interactTriggerId) {
    const trigger = findRecord(pipeline.triggers || [], placement.interactTriggerId, npc.gameId)
    if (!trigger) {
      issues.push(errorIssue(`${path}.interactTriggerId`, `Trigger '${placement.interactTriggerId}' was not found`))
    } else if (trigger.kind !== 'onHotspot') {
      issues.push(
        warningIssue(`${path}.interactTriggerId`, `Trigger '${trigger.name}' kind is ${trigger.kind}; onHotspot is expected`)
      )
    }
  }
  return issues
}

export function collectNpcUsers(pipeline: AssetPipelineProject, npcId: string): NamedUser[] {
  const users: NamedUser[] = []
  for (const d of pipeline.dialogues || []) {
    if ((d.nodes || []).some((n) => n.speaker === npcId)) {
      users.push({ id: d.id, name: d.name, kind: 'dialogue' })
    }
  }
  return users
}

export function assertCanRemoveNpc(pipeline: AssetPipelineProject, npcId: string, name: string): void {
  const users = collectNpcUsers(pipeline, npcId)
  if (users.length) throw new Error(formatInUseError('npc', name, users))
}

export function npcsInRegion(pipeline: AssetPipelineProject, regionId: string): { npc: Npc; placement: NpcPlacement }[] {
  const out: { npc: Npc; placement: NpcPlacement }[] = []
  for (const npc of pipeline.npcs || []) {
    for (const p of npc.placements || []) {
      if (p.regionId === regionId) out.push({ npc, placement: p })
    }
  }
  return out
}
