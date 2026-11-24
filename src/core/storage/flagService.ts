/**
 * Story flag CRUD (Step 3). Writes go through updateAssetPipeline.
 */

import type { AssetPipelineProject, GameFlag } from '@shared/types/assetPipeline'
import { getAssetPipeline, readStudio, updateAssetPipeline } from './studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { nowIso } from '@shared/worldContent/keys'
import { overlayRecord } from '@shared/worldContent/apply'
import { RECORD_SCHEMA_VERSION, requireIdOrKey } from '@shared/worldContent/validate'
import { errorMessages, type ContentIssue } from '@shared/worldContent/issues'
import {
  assertCanRemoveFlag,
  flagsOf,
  parseFlagDefault,
  parseFlagScope,
  parseFlagType,
  validateGameFlag
} from '@shared/story/flags'

export interface WriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
}

export interface FlagInput {
  name?: string
  key?: string
  type?: string
  default?: boolean | number | string
  scope?: string
  description?: string | null
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

export async function listFlags(gameId: string, dataDirOverride?: string): Promise<GameFlag[]> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return flagsOf(pipeline, gameId).slice().sort((a, b) => a.name.localeCompare(b.name))
}

export async function showFlag(gameId: string, idOrKey: string, dataDirOverride?: string): Promise<GameFlag> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.flags || [], idOrKey, gameId, 'Flag')
}

export async function createFlag(
  gameId: string,
  input: FlagInput,
  options?: WriteOptions
): Promise<{ record: GameFlag }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.flags) pipeline.flags = []
    const type = parseFlagType(input.type, 'bool')
    const known: GameFlag = {
      id: newId(),
      gameId,
      name: String(input.name || '').trim(),
      type,
      default: parseFlagDefault(type, input.default),
      scope: parseFlagScope(input.scope, 'game'),
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    if (input.key) known.key = input.key
    if (input.description) known.description = String(input.description)
    throwIssues(validateGameFlag(pipeline, known))
    pipeline.flags.push(known)
    return known
  })
  return { record }
}

export async function updateFlag(
  gameId: string,
  idOrKey: string,
  patch: FlagInput,
  options?: WriteOptions
): Promise<{ record: GameFlag }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.flags || [], idOrKey, gameId, 'Flag')
    const type = patch.type !== undefined ? parseFlagType(patch.type, existing.type) : existing.type
    const next: GameFlag = overlayRecord(existing, {
      ...existing,
      name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
      type,
      default:
        patch.default !== undefined ? parseFlagDefault(type, patch.default) : existing.default,
      scope: patch.scope !== undefined ? parseFlagScope(patch.scope, existing.scope) : existing.scope,
      key: patch.key !== undefined ? patch.key : existing.key,
      description:
        patch.description !== undefined
          ? patch.description
            ? String(patch.description)
            : undefined
          : existing.description,
      updatedAt: nowIso()
    })
    if (patch.key === '') delete next.key
    if (patch.description === '' || patch.description === null) delete next.description
    throwIssues(validateGameFlag(pipeline, next))
    const idx = (pipeline.flags || []).findIndex((f) => f.id === existing.id)
    if (idx >= 0) pipeline.flags![idx] = next
    return next
  })
  return { record }
}

export async function removeFlag(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  return mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const flag = requireIdOrKey(pipeline.flags || [], idOrKey, gameId, 'Flag')
    assertCanRemoveFlag(pipeline, flag.id, flag.name)
    pipeline.flags = (pipeline.flags || []).filter((f) => f.id !== flag.id)
    return { removed: flag.id }
  })
}
