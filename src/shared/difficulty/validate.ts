/**
 * Difficulty profile records (2c). Game-agnostic numeric ranges only.
 */

import type { AssetPipelineProject, DifficultyProfile } from '../types/assetPipeline'
import { assertRecordKey, isAliasRef, normalizeRecordKey } from '../worldContent/keys'
import { errorIssue, formatInUseError, type ContentIssue, type NamedUser } from '../worldContent/issues'

export function difficultyProfilesOf(
  pipeline: AssetPipelineProject,
  gameId: string
): DifficultyProfile[] {
  return (pipeline.difficultyProfiles || []).filter((p) => p.gameId === gameId)
}

export function resolveDifficultyRef(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string | undefined | null
): { id?: string; profile?: DifficultyProfile; error?: string } {
  const value = String(raw ?? '').trim()
  if (!value) return { error: 'difficultyProfileId is required' }
  const inGame = difficultyProfilesOf(pipeline, gameId)
  if (isAliasRef(value) || value.startsWith('@')) {
    const key = normalizeRecordKey(value.replace(/^@/, ''))
    const found = inGame.find((p) => p.key === key)
    if (!found) return { error: `Difficulty profile alias '@${key}' was not found in this game` }
    return { id: found.id, profile: found }
  }
  const byId = inGame.find((p) => p.id === value)
  if (byId) return { id: byId.id, profile: byId }
  const byKey = inGame.find((p) => p.key === value || p.key === normalizeRecordKey(value))
  if (byKey) return { id: byKey.id, profile: byKey }
  const byName = inGame.filter((p) => p.name === value)
  if (byName.length === 1) return { id: byName[0]!.id, profile: byName[0] }
  if (byName.length > 1) {
    return { error: `Difficulty profile name '${value}' is not unique in this game` }
  }
  const other = (pipeline.difficultyProfiles || []).find((p) => p.id === value)
  if (other && other.gameId !== gameId) {
    return {
      error: `Difficulty profile '${other.name}' belongs to game '${other.gameId}', not '${gameId}'`
    }
  }
  return { error: `Difficulty profile '${value}' was not found in this game` }
}

function assertPositiveMultiplier(
  value: number,
  path: string,
  issues: ContentIssue[]
): void {
  if (!Number.isFinite(value) || value <= 0) {
    issues.push(errorIssue(path, 'must be a finite number greater than 0'))
  }
}

export function validateDifficultyProfile(
  pipeline: AssetPipelineProject,
  profile: DifficultyProfile,
  path = 'difficultyProfile'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  if (!String(profile.name || '').trim()) {
    issues.push(errorIssue(`${path}.name`, 'Difficulty profile name is required'))
  }
  try {
    if (profile.key) assertRecordKey(profile.key, 'Difficulty profile')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  assertPositiveMultiplier(profile.heroHpMultiplier, `${path}.heroHpMultiplier`, issues)
  assertPositiveMultiplier(profile.playbackSpeed, `${path}.playbackSpeed`, issues)
  assertPositiveMultiplier(profile.attackWeightScale, `${path}.attackWeightScale`, issues)
  if (!Number.isInteger(profile.hintCharges) || profile.hintCharges < 0) {
    issues.push(errorIssue(`${path}.hintCharges`, 'hintCharges must be an integer >= 0'))
  }
  try {
    assertDifficultyKeyUnique(pipeline, profile.gameId, profile.key, profile.id)
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  return issues
}

export function collectDifficultyEncounterUsers(
  pipeline: AssetPipelineProject,
  profileId: string
): NamedUser[] {
  return (pipeline.encounters || [])
    .filter((enc) => enc.difficultyProfileId === profileId)
    .map((enc) => ({ id: enc.id, name: enc.name, kind: 'encounter' }))
}

export function assertCanRemoveDifficultyProfile(
  pipeline: AssetPipelineProject,
  profileId: string
): void {
  const users = collectDifficultyEncounterUsers(pipeline, profileId)
  if (users.length > 0) {
    const profile = (pipeline.difficultyProfiles || []).find((p) => p.id === profileId)
    throw new Error(formatInUseError('difficulty profile', profile?.name || profileId, users))
  }
}

export function assertDifficultyKeyUnique(
  pipeline: AssetPipelineProject,
  gameId: string,
  key: string | undefined,
  excludeId: string | undefined
): void {
  if (!key) return
  const clash = difficultyProfilesOf(pipeline, gameId).find((p) => p.key === key && p.id !== excludeId)
  if (clash) {
    throw new Error(`Difficulty profile key '${key}' already used by ${clash.id}`)
  }
}
