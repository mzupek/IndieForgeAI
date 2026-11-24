/**
 * Trigger CRUD (Step 3). Writes go through updateAssetPipeline.
 */

import type { AssetPipelineProject, Condition, Effect, Trigger } from '@shared/types/assetPipeline'
import { getAssetPipeline, readStudio, updateAssetPipeline } from './studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { nowIso } from '@shared/worldContent/keys'
import { overlayRecord } from '@shared/worldContent/apply'
import { RECORD_SCHEMA_VERSION, requireIdOrKey } from '@shared/worldContent/validate'
import { errorMessages, type ContentIssue } from '@shared/worldContent/issues'
import { bindCondition, bindEffects, parseCondition, parseEffects } from '@shared/story/conditions'
import {
  assertCanRemoveTrigger,
  parseTriggerKind,
  triggersOf,
  validateTrigger
} from '@shared/story/triggers'

export interface WriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
}

export interface TriggerInput {
  name?: string
  key?: string
  kind?: string
  sourceRef?: string
  condition?: unknown
  once?: boolean | string
  effects?: unknown
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

function parseOnce(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null || raw === '') return fallback
  if (typeof raw === 'boolean') return raw
  const t = String(raw).trim().toLowerCase()
  if (t === 'true' || t === '1') return true
  if (t === 'false' || t === '0') return false
  throw new Error('once must be a boolean')
}

function parseOptionalCondition(raw: unknown, path: string): Condition | undefined {
  const issues: ContentIssue[] = []
  const condition = parseCondition(raw, path, issues)
  throwIssues(issues)
  return condition
}

function parseOptionalEffects(raw: unknown, path: string): Effect[] {
  const issues: ContentIssue[] = []
  const effects = parseEffects(raw, path, issues)
  throwIssues(issues)
  return effects
}

export async function listTriggers(gameId: string, dataDirOverride?: string): Promise<Trigger[]> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return triggersOf(pipeline, gameId).slice().sort((a, b) => a.name.localeCompare(b.name))
}

export async function showTrigger(gameId: string, idOrKey: string, dataDirOverride?: string): Promise<Trigger> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.triggers || [], idOrKey, gameId, 'Trigger')
}

export async function createTrigger(
  gameId: string,
  input: TriggerInput,
  options?: WriteOptions
): Promise<{ record: Trigger }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.triggers) pipeline.triggers = []
    const known: Trigger = {
      id: newId(),
      gameId,
      name: String(input.name || '').trim(),
      kind: parseTriggerKind(input.kind),
      sourceRef: String(input.sourceRef || '').trim(),
      once: parseOnce(input.once, false),
      effects:
        input.effects !== undefined
          ? bindEffects(pipeline, gameId, parseOptionalEffects(input.effects, 'effects'))
          : [],
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    if (input.key) known.key = input.key
    if (input.condition !== undefined) {
      known.condition = bindCondition(
        pipeline,
        gameId,
        parseOptionalCondition(input.condition, 'condition')
      )
    }
    if (input.notes) known.notes = String(input.notes)
    throwIssues(validateTrigger(pipeline, known))
    pipeline.triggers.push(known)
    return known
  })
  return { record }
}

export async function updateTrigger(
  gameId: string,
  idOrKey: string,
  patch: TriggerInput,
  options?: WriteOptions
): Promise<{ record: Trigger }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.triggers || [], idOrKey, gameId, 'Trigger')
    const next: Trigger = overlayRecord(existing, {
      ...existing,
      name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
      kind: patch.kind !== undefined ? parseTriggerKind(patch.kind) : existing.kind,
      sourceRef: patch.sourceRef !== undefined ? String(patch.sourceRef).trim() : existing.sourceRef,
      once: patch.once !== undefined ? parseOnce(patch.once, existing.once) : existing.once,
      effects:
        patch.effects !== undefined
          ? bindEffects(pipeline, gameId, parseOptionalEffects(patch.effects, 'effects'))
          : existing.effects,
      key: patch.key !== undefined ? patch.key : existing.key,
      notes: patch.notes !== undefined ? (patch.notes ? String(patch.notes) : undefined) : existing.notes,
      updatedAt: nowIso()
    })
    if (patch.condition !== undefined) {
      const cond = bindCondition(
        pipeline,
        gameId,
        parseOptionalCondition(patch.condition, 'condition')
      )
      if (cond) next.condition = cond
      else delete next.condition
    }
    if (patch.key === '') delete next.key
    if (patch.notes === '' || patch.notes === null) delete next.notes
    throwIssues(validateTrigger(pipeline, next))
    const idx = (pipeline.triggers || []).findIndex((t) => t.id === existing.id)
    if (idx >= 0) pipeline.triggers![idx] = next
    return next
  })
  return { record }
}

export async function removeTrigger(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  return mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const trigger = requireIdOrKey(pipeline.triggers || [], idOrKey, gameId, 'Trigger')
    assertCanRemoveTrigger(pipeline, trigger.id, trigger.name)
    pipeline.triggers = (pipeline.triggers || []).filter((t) => t.id !== trigger.id)
    return { removed: trigger.id }
  })
}
