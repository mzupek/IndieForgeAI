/**
 * Story circle CRUD. Writes go through updateAssetPipeline.
 */

import type { AssetPipelineProject, StoryCircle, StoryCircleStep } from '@shared/types/assetPipeline'
import { getAssetPipeline, readStudio, updateAssetPipeline } from './studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { nowIso } from '@shared/worldContent/keys'
import { overlayRecord } from '@shared/worldContent/apply'
import { RECORD_SCHEMA_VERSION, requireIdOrKey } from '@shared/worldContent/validate'
import { errorMessages, type ContentIssue } from '@shared/worldContent/issues'
import {
  bindStoryCircle,
  mergeCircleSteps,
  parseStoryCircleScope,
  storyCirclesOf,
  validateStoryCircle
} from '@shared/story/circles'
import { matchesCanonFilter, parseCanonStatus } from '@shared/story/canon'

export interface WriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
}

export interface StoryCircleInput {
  name?: string
  key?: string
  scope?: string
  refId?: string | null
  surfaceGoal?: string | null
  hiddenGoal?: string | null
  steps?: StoryCircleStep[] | null
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

export async function listStoryCircles(
  gameId: string,
  dataDirOverride?: string,
  canon?: string
): Promise<StoryCircle[]> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return storyCirclesOf(pipeline, gameId)
    .filter((c) => matchesCanonFilter(c, canon))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function showStoryCircle(
  gameId: string,
  idOrKey: string,
  dataDirOverride?: string
): Promise<StoryCircle> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.storyCircles || [], idOrKey, gameId, 'Story circle')
}

export async function createStoryCircle(
  gameId: string,
  input: StoryCircleInput,
  options?: WriteOptions
): Promise<{ record: StoryCircle }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.storyCircles) pipeline.storyCircles = []
    const known: StoryCircle = {
      id: newId(),
      gameId,
      name: String(input.name || '').trim(),
      scope: parseStoryCircleScope(input.scope, 'game'),
      steps: mergeCircleSteps(input.steps),
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    if (input.key) known.key = input.key
    if (input.refId) known.refId = input.refId
    if (input.surfaceGoal) known.surfaceGoal = String(input.surfaceGoal)
    if (input.hiddenGoal) known.hiddenGoal = String(input.hiddenGoal)
    if (input.notes) known.notes = String(input.notes)
    if (input.canonStatus) known.canonStatus = parseCanonStatus(input.canonStatus)
    const bound = bindStoryCircle(pipeline, gameId, known)
    throwIssues(validateStoryCircle(pipeline, bound))
    pipeline.storyCircles.push(bound)
    return bound
  })
  return { record }
}

export async function updateStoryCircle(
  gameId: string,
  idOrKey: string,
  patch: StoryCircleInput,
  options?: WriteOptions
): Promise<{ record: StoryCircle }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(pipeline.storyCircles || [], idOrKey, gameId, 'Story circle')
    const next: StoryCircle = overlayRecord(existing, {
      ...existing,
      name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
      scope: patch.scope !== undefined ? parseStoryCircleScope(patch.scope, existing.scope) : existing.scope,
      key: patch.key !== undefined ? patch.key : existing.key,
      steps: patch.steps !== undefined && patch.steps ? mergeCircleSteps(patch.steps) : existing.steps,
      notes: patch.notes !== undefined ? (patch.notes ? String(patch.notes) : undefined) : existing.notes,
      updatedAt: nowIso()
    })
    if (patch.refId !== undefined) {
      if (!patch.refId) delete next.refId
      else next.refId = patch.refId
    }
    if (patch.surfaceGoal !== undefined) {
      if (!patch.surfaceGoal) delete next.surfaceGoal
      else next.surfaceGoal = String(patch.surfaceGoal)
    }
    if (patch.hiddenGoal !== undefined) {
      if (!patch.hiddenGoal) delete next.hiddenGoal
      else next.hiddenGoal = String(patch.hiddenGoal)
    }
    if (patch.canonStatus !== undefined) {
      if (!patch.canonStatus) delete next.canonStatus
      else next.canonStatus = parseCanonStatus(patch.canonStatus)
    }
    if (patch.key === '') delete next.key
    const bound = bindStoryCircle(pipeline, gameId, next)
    throwIssues(validateStoryCircle(pipeline, bound))
    const idx = (pipeline.storyCircles || []).findIndex((c) => c.id === existing.id)
    if (idx >= 0) pipeline.storyCircles![idx] = bound
    return bound
  })
  return { record }
}

export async function removeStoryCircle(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  return mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const circle = requireIdOrKey(pipeline.storyCircles || [], idOrKey, gameId, 'Story circle')
    const nested = (pipeline.storyCircles || []).filter((c) =>
      (c.steps || []).some((s) => s.advancesCircleId === circle.id)
    )
    if (nested.length) {
      throw new Error(
        `Cannot remove story circle '${circle.name}': advanced by ${nested.map((c) => c.name).join(', ')}`
      )
    }
    pipeline.storyCircles = (pipeline.storyCircles || []).filter((c) => c.id !== circle.id)
    return { removed: circle.id }
  })
}
