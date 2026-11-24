/**
 * Dialogue CRUD + play (Step 4). Writes go through updateAssetPipeline.
 */

import type {
  AssetPipelineProject,
  Dialogue,
  DialogueChoice,
  DialogueEntryVariant,
  DialogueNode
} from '@shared/types/assetPipeline'
import { getAssetPipeline, readStudio, updateAssetPipeline } from './studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { nowIso } from '@shared/worldContent/keys'
import { overlayRecord } from '@shared/worldContent/apply'
import { RECORD_SCHEMA_VERSION, requireIdOrKey } from '@shared/worldContent/validate'
import { errorMessages, type ContentIssue } from '@shared/worldContent/issues'
import {
  assertCanRemoveDialogue,
  bindDialogueTree,
  dialoguesOf,
  playDialogue,
  validateDialogue,
  type DialoguePlayResult
} from '@shared/story/dialogue'
import { parseCanonStatus } from '@shared/story/canon'

export interface WriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
}

export interface DialogueInput {
  name?: string
  key?: string
  startNodeId?: string
  nodes?: DialogueNode[]
  entryVariants?: DialogueEntryVariant[] | null
  notes?: string | null
  canonStatus?: string | null
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

function saveDialogue(pipeline: AssetPipelineProject, gameId: string, dialogue: Dialogue): Dialogue {
  const bound = bindDialogueTree(pipeline, gameId, dialogue)
  throwIssues(validateDialogue(pipeline, bound))
  const idx = (pipeline.dialogues || []).findIndex((d) => d.id === bound.id)
  if (idx >= 0) pipeline.dialogues![idx] = bound
  else {
    if (!pipeline.dialogues) pipeline.dialogues = []
    pipeline.dialogues.push(bound)
  }
  return bound
}

export async function listDialogues(gameId: string, dataDirOverride?: string): Promise<Dialogue[]> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return dialoguesOf(pipeline, gameId).slice().sort((a, b) => a.name.localeCompare(b.name))
}

export async function showDialogue(gameId: string, idOrKey: string, dataDirOverride?: string): Promise<Dialogue> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.dialogues || [], idOrKey, gameId, 'Dialogue')
}

export async function createDialogue(
  gameId: string,
  input: DialogueInput,
  options?: WriteOptions
): Promise<{ record: Dialogue }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.dialogues) pipeline.dialogues = []
    const known: Dialogue = {
      id: newId(),
      gameId,
      name: String(input.name || '').trim(),
      startNodeId: String(input.startNodeId || (input.nodes && input.nodes[0]?.id) || ''),
      nodes: input.nodes || [],
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    if (input.key) known.key = input.key
    if (input.entryVariants) known.entryVariants = input.entryVariants
    if (input.notes) known.notes = String(input.notes)
    if (input.canonStatus) known.canonStatus = parseCanonStatus(input.canonStatus)
    return saveDialogue(pipeline, gameId, known)
  })
  return { record }
}

export async function updateDialogue(
  gameId: string,
  idOrKey: string,
  patch: DialogueInput,
  options?: WriteOptions
): Promise<{ record: Dialogue }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.dialogues || [], idOrKey, gameId, 'Dialogue')
    const next: Dialogue = overlayRecord(existing, {
      ...existing,
      name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
      startNodeId: patch.startNodeId !== undefined ? String(patch.startNodeId) : existing.startNodeId,
      nodes: patch.nodes !== undefined ? patch.nodes : existing.nodes,
      key: patch.key !== undefined ? patch.key : existing.key,
      notes: patch.notes !== undefined ? (patch.notes ? String(patch.notes) : undefined) : existing.notes,
      updatedAt: nowIso()
    })
    if (patch.entryVariants !== undefined) {
      if (patch.entryVariants && patch.entryVariants.length) next.entryVariants = patch.entryVariants
      else delete next.entryVariants
    }
    if (patch.key === '') delete next.key
    if (patch.notes === '' || patch.notes === null) delete next.notes
    if (patch.canonStatus !== undefined) {
      if (!patch.canonStatus) delete next.canonStatus
      else next.canonStatus = parseCanonStatus(patch.canonStatus)
    }
    return saveDialogue(pipeline, gameId, next)
  })
  return { record }
}

export async function removeDialogue(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  return mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const dialogue = requireIdOrKey(pipeline.dialogues || [], idOrKey, gameId, 'Dialogue')
    assertCanRemoveDialogue(pipeline, dialogue.id, dialogue.name)
    pipeline.dialogues = (pipeline.dialogues || []).filter((d) => d.id !== dialogue.id)
    return { removed: dialogue.id }
  })
}

export async function addDialogueNode(
  gameId: string,
  idOrKey: string,
  node: DialogueNode,
  options?: WriteOptions
): Promise<{ record: Dialogue }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.dialogues || [], idOrKey, gameId, 'Dialogue')
    const nodes = [...(existing.nodes || []), node]
    const startNodeId = existing.startNodeId || node.id
    return saveDialogue(pipeline, gameId, { ...existing, nodes, startNodeId, updatedAt: nowIso() })
  })
  return { record }
}

export async function updateDialogueNode(
  gameId: string,
  idOrKey: string,
  nodeId: string,
  patch: Partial<DialogueNode>,
  options?: WriteOptions
): Promise<{ record: Dialogue }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.dialogues || [], idOrKey, gameId, 'Dialogue')
    const nodes = (existing.nodes || []).map((n) => (n.id === nodeId ? { ...n, ...patch, id: nodeId } : n))
    if (!(existing.nodes || []).some((n) => n.id === nodeId)) {
      throw new Error(`Node '${nodeId}' was not found`)
    }
    return saveDialogue(pipeline, gameId, { ...existing, nodes, updatedAt: nowIso() })
  })
  return { record }
}

export async function removeDialogueNode(
  gameId: string,
  idOrKey: string,
  nodeId: string,
  options?: WriteOptions
): Promise<{ record: Dialogue }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.dialogues || [], idOrKey, gameId, 'Dialogue')
    const nodes = (existing.nodes || []).filter((n) => n.id !== nodeId)
    const startNodeId = existing.startNodeId === nodeId ? nodes[0]?.id || '' : existing.startNodeId
    return saveDialogue(pipeline, gameId, { ...existing, nodes, startNodeId, updatedAt: nowIso() })
  })
  return { record }
}

export async function addDialogueChoice(
  gameId: string,
  idOrKey: string,
  nodeId: string,
  choice: DialogueChoice,
  options?: WriteOptions
): Promise<{ record: Dialogue }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.dialogues || [], idOrKey, gameId, 'Dialogue')
    const nodes = (existing.nodes || []).map((n) =>
      n.id === nodeId ? { ...n, next: undefined, choices: [...(n.choices || []), choice] } : n
    )
    if (!(existing.nodes || []).some((n) => n.id === nodeId)) throw new Error(`Node '${nodeId}' was not found`)
    return saveDialogue(pipeline, gameId, { ...existing, nodes, updatedAt: nowIso() })
  })
  return { record }
}

export async function updateDialogueChoice(
  gameId: string,
  idOrKey: string,
  nodeId: string,
  index: number,
  patch: Partial<DialogueChoice>,
  options?: WriteOptions
): Promise<{ record: Dialogue }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.dialogues || [], idOrKey, gameId, 'Dialogue')
    const nodes = (existing.nodes || []).map((n) => {
      if (n.id !== nodeId) return n
      const choices = [...(n.choices || [])]
      if (index < 0 || index >= choices.length) throw new Error(`Choice ${index + 1} was not found`)
      choices[index] = { ...choices[index]!, ...patch }
      return { ...n, choices }
    })
    return saveDialogue(pipeline, gameId, { ...existing, nodes, updatedAt: nowIso() })
  })
  return { record }
}

export async function removeDialogueChoice(
  gameId: string,
  idOrKey: string,
  nodeId: string,
  index: number,
  options?: WriteOptions
): Promise<{ record: Dialogue }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.dialogues || [], idOrKey, gameId, 'Dialogue')
    const nodes = (existing.nodes || []).map((n) => {
      if (n.id !== nodeId) return n
      const choices = (n.choices || []).filter((_, i) => i !== index)
      return { ...n, choices: choices.length ? choices : undefined }
    })
    return saveDialogue(pipeline, gameId, { ...existing, nodes, updatedAt: nowIso() })
  })
  return { record }
}

export async function playDialogueRecord(
  gameId: string,
  idOrKey: string,
  opts: { flags?: string; choices?: number[] },
  dataDirOverride?: string
): Promise<DialoguePlayResult> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  const dialogue = requireIdOrKey(pipeline.dialogues || [], idOrKey, gameId, 'Dialogue')
  return playDialogue(pipeline, dialogue, opts)
}
