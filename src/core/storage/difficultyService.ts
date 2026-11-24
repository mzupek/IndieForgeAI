/**
 * Difficulty profile CRUD (2c). Writes go through updateAssetPipeline.
 */

import type { AssetPipelineProject, DifficultyProfile } from '@shared/types/assetPipeline'
import { getAssetPipeline, readStudio, updateAssetPipeline } from './studioStorage'
import { requireGame } from '@shared/worldContent/scope'
import { assertRecordKey, nowIso } from '@shared/worldContent/keys'
import { overlayRecord } from '@shared/worldContent/apply'
import { RECORD_SCHEMA_VERSION, requireIdOrKey } from '@shared/worldContent/validate'
import { errorMessages, type ContentIssue } from '@shared/worldContent/issues'
import {
  assertCanRemoveDifficultyProfile,
  assertDifficultyKeyUnique,
  difficultyProfilesOf,
  validateDifficultyProfile
} from '@shared/difficulty/validate'

export interface WriteOptions {
  dataDirOverride?: string
  dryRun?: boolean
}

export interface DifficultyProfileInput {
  name?: string
  key?: string
  heroHpMultiplier?: number
  playbackSpeed?: number
  attackWeightScale?: number
  hintCharges?: number
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
  if (!options?.dryRun) {
    await updateAssetPipeline(pipeline, options?.dataDirOverride)
  }
  return value
}

function asPositive(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asHintCharges(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export async function listDifficultyProfiles(
  gameId: string,
  dataDirOverride?: string
): Promise<DifficultyProfile[]> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return difficultyProfilesOf(pipeline, gameId).slice().sort((a, b) => a.name.localeCompare(b.name))
}

export async function showDifficultyProfile(
  gameId: string,
  idOrKey: string,
  dataDirOverride?: string
): Promise<DifficultyProfile> {
  const pipeline = (await readStudio(dataDirOverride)).assetPipeline
  requireGame(pipeline, gameId)
  return requireIdOrKey(pipeline.difficultyProfiles || [], idOrKey, gameId, 'Difficulty profile')
}

export async function createDifficultyProfile(
  gameId: string,
  input: DifficultyProfileInput,
  options?: WriteOptions
): Promise<{ record: DifficultyProfile }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    if (!pipeline.difficultyProfiles) pipeline.difficultyProfiles = []
    const now = nowIso()
    const known: DifficultyProfile = {
      id: newId(),
      gameId,
      name: String(input.name || '').trim(),
      heroHpMultiplier: asPositive(input.heroHpMultiplier, 1),
      playbackSpeed: asPositive(input.playbackSpeed, 1),
      attackWeightScale: asPositive(input.attackWeightScale, 1),
      hintCharges: asHintCharges(input.hintCharges, 0),
      schemaVersion: RECORD_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now
    }
    const key = assertRecordKey(input.key, 'Difficulty profile')
    if (key) known.key = key
    if (input.notes) known.notes = String(input.notes)
    assertDifficultyKeyUnique(pipeline, gameId, known.key, known.id)
    throwIssues(validateDifficultyProfile(pipeline, known))
    if (options?.dryRun) return known
    pipeline.difficultyProfiles.push(known)
    return known
  })
  return { record }
}

export async function updateDifficultyProfile(
  gameId: string,
  idOrKey: string,
  patch: DifficultyProfileInput,
  options?: WriteOptions
): Promise<{ record: DifficultyProfile }> {
  const record = await mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const existing = requireIdOrKey(
      pipeline.difficultyProfiles || [],
      idOrKey,
      gameId,
      'Difficulty profile'
    )
    const next: DifficultyProfile = overlayRecord(existing, {
      ...existing,
      name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
      heroHpMultiplier:
        patch.heroHpMultiplier !== undefined
          ? asPositive(patch.heroHpMultiplier, existing.heroHpMultiplier)
          : existing.heroHpMultiplier,
      playbackSpeed:
        patch.playbackSpeed !== undefined
          ? asPositive(patch.playbackSpeed, existing.playbackSpeed)
          : existing.playbackSpeed,
      attackWeightScale:
        patch.attackWeightScale !== undefined
          ? asPositive(patch.attackWeightScale, existing.attackWeightScale)
          : existing.attackWeightScale,
      hintCharges:
        patch.hintCharges !== undefined
          ? asHintCharges(patch.hintCharges, existing.hintCharges)
          : existing.hintCharges,
      updatedAt: nowIso()
    })
    if (patch.key !== undefined) {
      const key = assertRecordKey(patch.key, 'Difficulty profile')
      if (key) next.key = key
      else delete next.key
    }
    if (patch.notes !== undefined) {
      if (patch.notes) next.notes = String(patch.notes)
      else delete next.notes
    }
    assertDifficultyKeyUnique(pipeline, gameId, next.key, next.id)
    throwIssues(validateDifficultyProfile(pipeline, next))
    const idx = (pipeline.difficultyProfiles || []).findIndex((p) => p.id === existing.id)
    if (idx >= 0) pipeline.difficultyProfiles![idx] = next
    return next
  })
  return { record }
}

export async function removeDifficultyProfile(
  gameId: string,
  idOrKey: string,
  options?: WriteOptions
): Promise<{ removed: string }> {
  return mutatePipeline(options, (pipeline) => {
    requireGame(pipeline, gameId)
    const profile = requireIdOrKey(
      pipeline.difficultyProfiles || [],
      idOrKey,
      gameId,
      'Difficulty profile'
    )
    assertCanRemoveDifficultyProfile(pipeline, profile.id)
    if (options?.dryRun) return { removed: profile.id }
    pipeline.difficultyProfiles = (pipeline.difficultyProfiles || []).filter((p) => p.id !== profile.id)
    return { removed: profile.id }
  })
}
