/**
 * Character story profiles. Optional on Character. Game-agnostic.
 */

import type {
  AssetPipelineProject,
  Character,
  CharacterRelationship,
  CharacterStoryProfile
} from '../types/assetPipeline'
import { errorIssue, type ContentIssue } from '../worldContent/issues'
import { findRecord } from './conditions'
import { parseCanonStatus, validateCanonStatus } from './canon'

export function parseRelationships(raw: unknown, path: string, issues: ContentIssue[]): CharacterRelationship[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    issues.push(errorIssue(path, 'relationships must be an array of { characterId, relation }'))
    return []
  }
  const out: CharacterRelationship[] = []
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      issues.push(errorIssue(`${path}[${i}]`, 'relationship must be an object'))
      continue
    }
    const obj = row as Record<string, unknown>
    const characterId = String(obj.characterId ?? '').trim()
    const relation = String(obj.relation ?? '').trim()
    if (!characterId || !relation) {
      issues.push(errorIssue(`${path}[${i}]`, 'relationship needs characterId and relation'))
      continue
    }
    out.push({ characterId, relation })
  }
  return out
}

export function parseStoryProfile(raw: unknown, path: string, issues: ContentIssue[]): CharacterStoryProfile | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push(errorIssue(path, 'storyProfile must be an object'))
    return undefined
  }
  const obj = raw as Record<string, unknown>
  const optional = (key: string): string | undefined => {
    if (obj[key] === undefined || obj[key] === null) return undefined
    const value = String(obj[key]).trim()
    return value || undefined
  }
  const profile: CharacterStoryProfile = {}
  const summary = optional('summary')
  const bio = optional('bio')
  const motivation = optional('motivation')
  const want = optional('want')
  const need = optional('need')
  const arc = optional('arc')
  const voiceNotes = optional('voiceNotes')
  const faction = optional('faction')
  if (summary) profile.summary = summary
  if (bio) profile.bio = bio
  if (motivation) profile.motivation = motivation
  if (want) profile.want = want
  if (need) profile.need = need
  if (arc) profile.arc = arc
  if (voiceNotes) profile.voiceNotes = voiceNotes
  if (faction) profile.faction = faction
  if (obj.relationships !== undefined) {
    profile.relationships = parseRelationships(obj.relationships, `${path}.relationships`, issues)
  }
  issues.push(...validateCanonStatus(obj.canonStatus, `${path}.canonStatus`))
  if (obj.canonStatus !== undefined && obj.canonStatus !== null && obj.canonStatus !== '') {
    try {
      profile.canonStatus = parseCanonStatus(obj.canonStatus)
    } catch {
      /* already recorded */
    }
  }
  return profile
}

export function bindStoryProfile(
  pipeline: AssetPipelineProject,
  gameId: string,
  profile: CharacterStoryProfile | undefined
): CharacterStoryProfile | undefined {
  if (!profile) return undefined
  const next: CharacterStoryProfile = { ...profile }
  if (profile.relationships) {
    next.relationships = profile.relationships.map((rel) => {
      const found = findRecord(pipeline.characters || [], rel.characterId, gameId)
      return { characterId: found?.id || rel.characterId, relation: rel.relation }
    })
  }
  return next
}

export function validateStoryProfile(
  pipeline: AssetPipelineProject,
  gameId: string,
  character: Character,
  path = 'character.storyProfile'
): ContentIssue[] {
  const profile = character.storyProfile
  if (!profile) return []
  const issues: ContentIssue[] = []
  for (let i = 0; i < (profile.relationships || []).length; i++) {
    const rel = profile.relationships![i]!
    const found = findRecord(pipeline.characters || [], rel.characterId, gameId)
    if (!found) {
      issues.push(errorIssue(`${path}.relationships[${i}].characterId`, `Character '${rel.characterId}' was not found`))
    } else if (found.id === character.id) {
      issues.push(errorIssue(`${path}.relationships[${i}].characterId`, 'A character cannot list a relationship to itself'))
    }
    if (!String(rel.relation || '').trim()) {
      issues.push(errorIssue(`${path}.relationships[${i}].relation`, 'relation is required'))
    }
  }
  return issues
}
