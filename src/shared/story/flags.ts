/**
 * Per-game story flags (Step 3). Game-agnostic. Progress is flags earned through play.
 */

import type { AssetPipelineProject, FlagScope, FlagType, GameFlag } from '../types/assetPipeline'
import { assertRecordKey } from '../worldContent/keys'
import { errorIssue, formatInUseError, warningIssue, type ContentIssue } from '../worldContent/issues'
import {
  collectConditionFlagIds,
  collectConditionUsers,
  collectEffectFlagWrites,
  flagsOf
} from './conditions'

export { flagsOf }

export function validateGameFlag(
  pipeline: AssetPipelineProject,
  flag: GameFlag,
  path = 'flag'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  if (!String(flag.name || '').trim()) {
    issues.push(errorIssue(`${path}.name`, 'Flag name is required'))
  }
  const type = flag.type
  if (type !== 'bool' && type !== 'int') {
    issues.push(errorIssue(`${path}.type`, "type must be 'bool' or 'int'"))
  }
  const scope: FlagScope = flag.scope
  if (scope !== 'game' && scope !== 'world') {
    issues.push(errorIssue(`${path}.scope`, "scope must be 'game' or 'world'"))
  }
  if (type === 'bool' && typeof flag.default !== 'boolean') {
    issues.push(errorIssue(`${path}.default`, 'bool flags require a boolean default'))
  }
  if (type === 'int' && (typeof flag.default !== 'number' || !Number.isInteger(flag.default))) {
    issues.push(errorIssue(`${path}.default`, 'int flags require an integer default'))
  }
  try {
    assertRecordKey(flag.key, 'Flag')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  if (flag.key) {
    const clash = flagsOf(pipeline, flag.gameId).find((f) => f.key === flag.key && f.id !== flag.id)
    if (clash) issues.push(errorIssue(`${path}.key`, `Flag key '${flag.key}' is already used by '${clash.name}'`))
  }
  return issues
}

export function assertCanRemoveFlag(pipeline: AssetPipelineProject, flagId: string, flagName: string): void {
  const users = collectConditionUsers(pipeline, flagId)
  if (users.length > 0) throw new Error(formatInUseError('flag', flagName, users))
}

export function parseFlagType(raw: unknown, fallback: FlagType = 'bool'): FlagType {
  const value = String(raw ?? fallback).trim()
  if (value !== 'bool' && value !== 'int') throw new Error("Flag type must be 'bool' or 'int'")
  return value
}

export function parseFlagScope(raw: unknown, fallback: FlagScope = 'game'): FlagScope {
  const value = String(raw ?? fallback).trim()
  if (value !== 'game' && value !== 'world') throw new Error("Flag scope must be 'game' or 'world'")
  return value
}

export function collectFlagUsageWarnings(
  pipeline: AssetPipelineProject,
  gameId: string
): ContentIssue[] {
  const reads = new Set<string>()
  const writes = new Set<string>()
  for (const t of pipeline.triggers || []) {
    if (t.gameId !== gameId) continue
    collectConditionFlagIds(t.condition, reads)
    collectEffectFlagWrites(t.effects, writes)
  }
  for (const s of pipeline.stages || []) {
    if (s.gameId !== gameId) continue
    collectConditionFlagIds(s.unlockCondition, reads)
  }
  for (const e of pipeline.encounters || []) {
    if (e.gameId !== gameId) continue
    collectEffectFlagWrites(e.onWin, writes)
    collectEffectFlagWrites(e.onLose, writes)
  }
  for (const d of pipeline.dialogues || []) {
    if (d.gameId !== gameId) continue
    for (const variant of d.entryVariants || []) collectConditionFlagIds(variant.condition, reads)
    for (const node of d.nodes || []) {
      collectEffectFlagWrites(node.effects, writes)
      for (const choice of node.choices || []) {
        collectConditionFlagIds(choice.condition, reads)
        collectEffectFlagWrites(choice.effects, writes)
      }
    }
  }
  for (const n of pipeline.npcs || []) {
    if (n.gameId !== gameId) continue
    for (const p of n.placements || []) collectConditionFlagIds(p.condition, reads)
  }
  const issues: ContentIssue[] = []
  for (const flag of flagsOf(pipeline, gameId)) {
    const read = reads.has(flag.id)
    const written = writes.has(flag.id)
    if (read && !written) {
      issues.push(
        warningIssue(`flags.${flag.key || flag.id}`, `Flag '${flag.name}' is read but never set`)
      )
    }
    if (written && !read) {
      issues.push(
        warningIssue(`flags.${flag.key || flag.id}`, `Flag '${flag.name}' is set but never read`)
      )
    }
  }
  return issues
}

export function parseFlagDefault(type: FlagType, raw: unknown): boolean | number {
  if (raw === undefined || raw === null || raw === '') return type === 'bool' ? false : 0
  if (type === 'bool') {
    if (typeof raw === 'boolean') return raw
    const t = String(raw).trim().toLowerCase()
    if (t === 'true' || t === '1') return true
    if (t === 'false' || t === '0') return false
    throw new Error('bool default must be true or false')
  }
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(n)) throw new Error('int default must be an integer')
  return n
}
