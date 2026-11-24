/**
 * Reveal token CRUD. Granting sets an auto flag (revealed_<key>).
 */

import type { AssetPipelineProject, Condition, RevealToken } from '@shared/types/assetPipeline'
import { getAssetPipeline, readStudio, updateAssetPipeline } from './studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { nowIso } from '@shared/worldContent/keys'
import { overlayRecord } from '@shared/worldContent/apply'
import { RECORD_SCHEMA_VERSION, requireIdOrKey } from '@shared/worldContent/validate'
import { errorMessages, type ContentIssue } from '@shared/worldContent/issues'
import { bindCondition } from '@shared/story/conditions'
import { parseCanonStatus, matchesCanonFilter } from '@shared/story/canon'
import {
  assertCanRemoveRevealToken,
  bindRevealToken,
  ensureRevealTokenFlag,
  parseMediaKind,
  revealTokensOf,
  validateRevealToken
} from '@shared/story/revealTokens'
import { collectConditionUsers } from '@shared/story/conditions'

export interface WriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
}

export interface RevealTokenInput {
  title?: string
  key?: string
  text?: string
  mediaAssetId?: string | null
  mediaKind?: string | null
  unlockedBy?: Condition | null
  order?: number
  chapter?: string | null
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

export async function listRevealTokens(
  gameId: string,
  dataDirOverride?: string,
  canon?: string
): Promise<RevealToken[]> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return revealTokensOf(pipeline, gameId)
    .filter((t) => matchesCanonFilter(t, canon))
    .slice()
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
}

export async function showRevealToken(
  gameId: string,
  idOrKey: string,
  dataDirOverride?: string
): Promise<RevealToken> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.revealTokens || [], idOrKey, gameId, 'Reveal token')
}

export async function createRevealToken(
  gameId: string,
  input: RevealTokenInput,
  options?: WriteOptions
): Promise<{ record: RevealToken }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.revealTokens) pipeline.revealTokens = []
    const id = newId()
    const known: RevealToken = {
      id,
      gameId,
      title: String(input.title || '').trim(),
      text: String(input.text ?? ''),
      order: input.order ?? pipeline.revealTokens.filter((t) => t.gameId === gameId).length,
      flagId: '',
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    if (input.key) known.key = input.key
    if (input.chapter) known.chapter = String(input.chapter)
    if (input.mediaAssetId) known.mediaAssetId = input.mediaAssetId
    if (input.mediaKind) known.mediaKind = parseMediaKind(input.mediaKind)
    if (input.unlockedBy) known.unlockedBy = bindCondition(pipeline, gameId, input.unlockedBy)
    if (input.canonStatus) known.canonStatus = parseCanonStatus(input.canonStatus)
    const flag = ensureRevealTokenFlag(pipeline, gameId, known)
    known.flagId = flag.id
    const bound = bindRevealToken(pipeline, gameId, known)
    throwIssues(validateRevealToken(pipeline, bound))
    pipeline.revealTokens.push(bound)
    return bound
  })
  return { record }
}

export async function updateRevealToken(
  gameId: string,
  idOrKey: string,
  patch: RevealTokenInput,
  options?: WriteOptions
): Promise<{ record: RevealToken }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.revealTokens || [], idOrKey, gameId, 'Reveal token')
    const next: RevealToken = overlayRecord(existing, {
      ...existing,
      title: patch.title !== undefined ? String(patch.title).trim() : existing.title,
      text: patch.text !== undefined ? String(patch.text) : existing.text,
      key: patch.key !== undefined ? patch.key : existing.key,
      order: patch.order !== undefined ? Number(patch.order) : existing.order,
      updatedAt: nowIso()
    })
    if (patch.chapter !== undefined) {
      if (!patch.chapter) delete next.chapter
      else next.chapter = String(patch.chapter)
    }
    if (patch.mediaAssetId !== undefined) {
      if (!patch.mediaAssetId) {
        delete next.mediaAssetId
        delete next.mediaKind
      } else next.mediaAssetId = patch.mediaAssetId
    }
    if (patch.mediaKind !== undefined) {
      if (!patch.mediaKind) delete next.mediaKind
      else next.mediaKind = parseMediaKind(patch.mediaKind)
    }
    if (patch.unlockedBy !== undefined) {
      if (!patch.unlockedBy) delete next.unlockedBy
      else next.unlockedBy = bindCondition(pipeline, gameId, patch.unlockedBy)
    }
    if (patch.canonStatus !== undefined) {
      if (!patch.canonStatus) delete next.canonStatus
      else next.canonStatus = parseCanonStatus(patch.canonStatus)
    }
    if (patch.key === '') delete next.key
    const flag = ensureRevealTokenFlag(pipeline, gameId, next)
    next.flagId = flag.id
    const bound = bindRevealToken(pipeline, gameId, next)
    throwIssues(validateRevealToken(pipeline, bound))
    const idx = (pipeline.revealTokens || []).findIndex((t) => t.id === existing.id)
    if (idx >= 0) pipeline.revealTokens![idx] = bound
    return bound
  })
  return { record }
}

export async function removeRevealToken(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  return mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const token = requireIdOrKey(pipeline.revealTokens || [], idOrKey, gameId, 'Reveal token')
    assertCanRemoveRevealToken(pipeline, token.id, token.title)
    pipeline.revealTokens = (pipeline.revealTokens || []).filter((t) => t.id !== token.id)
    const flag = (pipeline.flags || []).find((f) => f.id === token.flagId)
    if (flag) {
      const others = collectConditionUsers(pipeline, flag.id).filter((u) => u.id !== token.id)
      if (others.length === 0) {
        pipeline.flags = (pipeline.flags || []).filter((f) => f.id !== flag.id)
      }
    }
    return { removed: token.id }
  })
}
