/**
 * NPC CRUD (Step 4). Writes go through updateAssetPipeline.
 */

import type { AssetPipelineProject, Npc, NpcPlacement } from '@shared/types/assetPipeline'
import { getAssetPipeline, readStudio, updateAssetPipeline } from './studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { nowIso } from '@shared/worldContent/keys'
import { overlayRecord } from '@shared/worldContent/apply'
import { RECORD_SCHEMA_VERSION, requireIdOrKey } from '@shared/worldContent/validate'
import { errorMessages, type ContentIssue } from '@shared/worldContent/issues'
import { bindCondition, findRecord } from '@shared/story/conditions'
import { assertCanRemoveNpc, npcsOf, validateNpc } from '@shared/story/npcs'
import { resolveCharacterRef } from '@shared/enemies/validate'

export interface WriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
}

export interface NpcInput {
  displayName?: string
  key?: string
  characterId?: string
  role?: string
  placements?: NpcPlacement[] | null
  defaultDialogueId?: string | null
  notes?: string | null
}

function throwIssues(issues: ContentIssue[]): void {
  const errors = issues.filter((i) => i.level === 'error')
  if (errors.length) throw new Error(errorMessages(issues))
}

function newId(): string {
  return globalThis.crypto.randomUUID()
}

async function mutatePipeline<T>(
  options: WriteOptions | undefined,
  mutator: (pipeline: AssetPipelineProject) => T
): Promise<T> {
  const pipeline = await getAssetPipeline(options?.dataDirOverride)
  const value = mutator(pipeline)
  if (!options?.dryRun) await updateAssetPipeline(pipeline, options?.dataDirOverride)
  return value
}

function bindPlacements(pipeline: AssetPipelineProject, gameId: string, raw: NpcPlacement[] | undefined | null): NpcPlacement[] {
  if (!raw) return []
  return raw.map((p) => {
    const region = findRecord(pipeline.regions || [], p.regionId, gameId)
    const trigger = p.interactTriggerId
      ? findRecord(pipeline.triggers || [], p.interactTriggerId, gameId)
      : undefined
    return {
      regionId: region?.id || p.regionId,
      anchorId: String(p.anchorId || '').trim(),
      condition: p.condition ? bindCondition(pipeline, gameId, p.condition) : p.condition,
      interactTriggerId: trigger?.id || p.interactTriggerId
    }
  })
}

export async function listNpcs(gameId: string, dataDirOverride?: string): Promise<Npc[]> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return npcsOf(pipeline, gameId).slice().sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function showNpc(gameId: string, idOrKey: string, dataDirOverride?: string): Promise<Npc> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.npcs || [], idOrKey, gameId, 'NPC')
}

export async function createNpc(gameId: string, input: NpcInput, options?: WriteOptions): Promise<{ record: Npc }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.npcs) pipeline.npcs = []
    const character = resolveCharacterRef(pipeline, gameId, String(input.characterId || ''))
    if (!character.id) throw new Error(character.error || 'Character was not found')
    const known: Npc = {
      id: newId(),
      gameId,
      characterId: character.id,
      displayName: String(input.displayName || '').trim(),
      role: String(input.role || '').trim(),
      placements: bindPlacements(pipeline, gameId, input.placements),
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    if (input.key) known.key = input.key
    if (input.defaultDialogueId) {
      const dlg = findRecord(pipeline.dialogues || [], input.defaultDialogueId, gameId)
      known.defaultDialogueId = dlg?.id || input.defaultDialogueId
    }
    if (input.notes) known.notes = String(input.notes)
    throwIssues(validateNpc(pipeline, known))
    pipeline.npcs.push(known)
    return known
  })
  return { record }
}

export async function updateNpc(
  gameId: string,
  idOrKey: string,
  patch: NpcInput,
  options?: WriteOptions
): Promise<{ record: Npc }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.npcs || [], idOrKey, gameId, 'NPC')
    let characterId = existing.characterId
    if (patch.characterId !== undefined) {
      const resolved = resolveCharacterRef(pipeline, gameId, String(patch.characterId))
      if (!resolved.id) throw new Error(resolved.error || 'Character was not found')
      characterId = resolved.id
    }
    const next: Npc = overlayRecord(existing, {
      ...existing,
      displayName: patch.displayName !== undefined ? String(patch.displayName).trim() : existing.displayName,
      role: patch.role !== undefined ? String(patch.role).trim() : existing.role,
      characterId,
      key: patch.key !== undefined ? patch.key : existing.key,
      placements:
        patch.placements !== undefined ? bindPlacements(pipeline, gameId, patch.placements) : existing.placements,
      notes: patch.notes !== undefined ? (patch.notes ? String(patch.notes) : undefined) : existing.notes,
      updatedAt: nowIso()
    })
    if (patch.defaultDialogueId !== undefined) {
      if (!patch.defaultDialogueId) delete next.defaultDialogueId
      else {
        const dlg = findRecord(pipeline.dialogues || [], patch.defaultDialogueId, gameId)
        next.defaultDialogueId = dlg?.id || patch.defaultDialogueId
      }
    }
    if (patch.key === '') delete next.key
    if (patch.notes === '' || patch.notes === null) delete next.notes
    throwIssues(validateNpc(pipeline, next))
    const idx = (pipeline.npcs || []).findIndex((n) => n.id === existing.id)
    if (idx >= 0) pipeline.npcs![idx] = next
    return next
  })
  return { record }
}

export async function removeNpc(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  return mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const npc = requireIdOrKey(pipeline.npcs || [], idOrKey, gameId, 'NPC')
    assertCanRemoveNpc(pipeline, npc.id, npc.displayName)
    pipeline.npcs = (pipeline.npcs || []).filter((n) => n.id !== npc.id)
    return { removed: npc.id }
  })
}
