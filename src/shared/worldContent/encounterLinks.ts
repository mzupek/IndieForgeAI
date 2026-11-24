/**
 * Encounter enemy links + difficulty refs (2c). Game-agnostic.
 */

import type {
  AssetPipelineProject,
  Encounter,
  EncounterEnemyLink
} from '../types/assetPipeline'
import { resolveAttackTableRef } from '../attackTables/validate'
import { resolveDifficultyRef } from '../difficulty/validate'
import { buildEnemyChecklist, resolveEnemyRef } from '../enemies/validate'
import { errorIssue, formatInUseError, warningIssue, type ContentIssue, type NamedUser } from './issues'

const LEGACY_TUNING_KEYS = ['enemyHP', 'hp', 'rounds', 'patternLength', 'targetDurationSec']

export function parseEncounterEnemies(
  raw: unknown,
  path: string,
  issues: ContentIssue[]
): EncounterEnemyLink[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    issues.push(errorIssue(path, 'enemies must be an array of { enemyId, attackTableId? }'))
    return []
  }
  const out: EncounterEnemyLink[] = []
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    const rowPath = `${path}[${i}]`
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      issues.push(errorIssue(rowPath, 'enemy link must be { enemyId, attackTableId? }'))
      continue
    }
    const obj = row as Record<string, unknown>
    const enemyId = String(obj.enemyId ?? '').trim()
    if (!enemyId) {
      issues.push(errorIssue(`${rowPath}.enemyId`, 'enemyId is required'))
      continue
    }
    const link: EncounterEnemyLink = { enemyId }
    const table = String(obj.attackTableId ?? '').trim()
    if (table) link.attackTableId = table
    out.push(link)
  }
  return out
}

export function resolveEncounterEnemyLinks(
  pipeline: AssetPipelineProject,
  gameId: string,
  links: EncounterEnemyLink[],
  path: string,
  issues: ContentIssue[]
): EncounterEnemyLink[] {
  const out: EncounterEnemyLink[] = []
  for (let i = 0; i < links.length; i++) {
    const link = links[i]!
    const enemy = resolveEnemyRef(pipeline, gameId, link.enemyId)
    if (enemy.error || !enemy.id) {
      issues.push(errorIssue(`${path}[${i}].enemyId`, enemy.error || 'enemyId is required'))
      continue
    }
    const next: EncounterEnemyLink = { enemyId: enemy.id }
    if (link.attackTableId) {
      const table = resolveAttackTableRef(pipeline, gameId, link.attackTableId)
      if (table.error || !table.id) {
        issues.push(
          errorIssue(`${path}[${i}].attackTableId`, table.error || 'attackTableId was not found')
        )
      } else {
        next.attackTableId = table.id
      }
    }
    out.push(next)
  }
  return out
}

export function validateEncounterLinks(
  pipeline: AssetPipelineProject,
  encounter: Encounter,
  path = 'encounter'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  const links = encounter.enemies || []
  for (let i = 0; i < links.length; i++) {
    const link = links[i]!
    const enemy = resolveEnemyRef(pipeline, encounter.gameId, link.enemyId)
    if (enemy.error || !enemy.enemy) {
      issues.push(errorIssue(`${path}.enemies[${i}].enemyId`, enemy.error || 'enemy was not found'))
      continue
    }
    if (enemy.enemy.moduleId !== encounter.moduleId) {
      issues.push(
        errorIssue(
          `${path}.enemies[${i}].enemyId`,
          `Enemy '${enemy.enemy.name}' module '${enemy.enemy.moduleId}' does not match this encounter's module '${encounter.moduleId}'`
        )
      )
    }
    if (link.attackTableId) {
      const table = resolveAttackTableRef(pipeline, encounter.gameId, link.attackTableId)
      if (table.error || !table.table) {
        issues.push(
          errorIssue(
            `${path}.enemies[${i}].attackTableId`,
            table.error || 'attack table was not found'
          )
        )
      } else if (table.table.moduleId !== encounter.moduleId) {
        issues.push(
          errorIssue(
            `${path}.enemies[${i}].attackTableId`,
            `Attack table '${table.table.name}' module '${table.table.moduleId}' does not match this encounter's module '${encounter.moduleId}'`
          )
        )
      }
    }
  }

  if (encounter.difficultyProfileId) {
    const difficulty = resolveDifficultyRef(pipeline, encounter.gameId, encounter.difficultyProfileId)
    if (difficulty.error) {
      issues.push(errorIssue(`${path}.difficultyProfileId`, difficulty.error))
    }
  }

  issues.push(...encounterTuningConflict(pipeline, encounter, path))
  return issues
}

export function encounterTuningConflict(
  pipeline: AssetPipelineProject,
  encounter: Encounter,
  path = 'encounter'
): ContentIssue[] {
  const leadId = (encounter.enemies || [])[0]?.enemyId
  if (!leadId || !encounter.tuningProfileId) return []
  const enemy = resolveEnemyRef(pipeline, encounter.gameId, leadId).enemy
  if (!enemy?.winCondition?.kind) return []
  const def = (pipeline.gameDefinitions || []).find((d) => d.gameId === encounter.gameId)
  const tuning =
    def?.tuningProfiles?.find((p) => p.id === encounter.tuningProfileId) ||
    def?.tuningProfiles?.find((p) => p.name === encounter.tuningProfileId)
  if (!tuning) return []
  const params = (tuning.params || {}) as Record<string, unknown>
  const legacy = LEGACY_TUNING_KEYS.filter((k) => params[k] !== undefined)
  if (legacy.length === 0) return []
  const tuneSummary = legacy.map((k) => `${k}=${String(params[k])}`).join(', ')
  const winParams = Object.entries(enemy.winCondition.params || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
  const winSummary = winParams
    ? `${enemy.winCondition.kind} (${winParams})`
    : enemy.winCondition.kind
  return [
    warningIssue(
      `${path}.tuningProfileId`,
      `Encounter tuning '${tuning.name}' (${tuneSummary}) disagrees with lead enemy '${enemy.name}' winCondition ${winSummary}. Showing both; not auto-resolved.`
    )
  ]
}

export function encounterFlowExtras(
  pipeline: AssetPipelineProject,
  encounter: Encounter,
  path: string
): { label: string; issues: ContentIssue[] } {
  const links = encounter.enemies || []
  const lead = links[0]
    ? resolveEnemyRef(pipeline, encounter.gameId, links[0].enemyId).enemy
    : undefined
  let label = encounter.name
  if (lead) {
    label += ` — ${lead.name}`
    if (links.length > 1) label += ` (+${links.length - 1})`
  }
  const issues: ContentIssue[] = []
  if (lead) {
    const checklist = buildEnemyChecklist(pipeline, lead)
    if (!checklist.ready) {
      issues.push(
        warningIssue(
          `${path}.enemies[0]`,
          `Lead enemy '${lead.name}' checklist is not ready`
        )
      )
    }
  }
  return { label, issues }
}

export function collectEnemyEncounterUsers(
  pipeline: AssetPipelineProject,
  enemyId: string
): NamedUser[] {
  return (pipeline.encounters || [])
    .filter((enc) => (enc.enemies || []).some((link) => link.enemyId === enemyId))
    .map((enc) => ({ id: enc.id, name: enc.name, kind: 'encounter' }))
}

export function assertCanRemoveEnemy(
  pipeline: AssetPipelineProject,
  enemyId: string,
  enemyName: string
): void {
  const users = collectEnemyEncounterUsers(pipeline, enemyId)
  if (users.length > 0) {
    throw new Error(formatInUseError('enemy', enemyName, users))
  }
}

export function collectAttackTableEncounterUsers(
  pipeline: AssetPipelineProject,
  tableId: string
): NamedUser[] {
  return (pipeline.encounters || [])
    .filter((enc) => (enc.enemies || []).some((link) => link.attackTableId === tableId))
    .map((enc) => ({ id: enc.id, name: enc.name, kind: 'encounter' }))
}
