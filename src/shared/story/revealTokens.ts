/**
 * Reveal tokens: story facts granted through play (never pickups / currency / XP).
 * Per-game display label lives on GameSettings.revealTokenLabel.
 */

import type {
  AssetPipelineProject,
  Effect,
  Game,
  GameFlag,
  RevealToken,
  RevealTokenMediaKind
} from '../types/assetPipeline'
import { assertRecordKey } from '../worldContent/keys'
import { errorIssue, formatInUseError, type ContentIssue, type NamedUser } from '../worldContent/issues'
import {
  bindCondition,
  collectConditionFlagIds,
  findRecord,
  validateCondition
} from './conditions'
import { RECORD_SCHEMA_VERSION } from '../worldContent/validate'
import { nowIso } from '../worldContent/keys'

export const DEFAULT_REVEAL_TOKEN_LABEL = 'Reveal token'

export function revealTokenLabel(game?: Pick<Game, 'settings'> | undefined): string {
  const label = String(game?.settings?.revealTokenLabel || '').trim()
  return label || DEFAULT_REVEAL_TOKEN_LABEL
}

export function revealTokensOf(pipeline: AssetPipelineProject, gameId: string): RevealToken[] {
  return (pipeline.revealTokens || []).filter((t) => t.gameId === gameId)
}

export function autoFlagKeyForToken(tokenKey: string | undefined): string | undefined {
  if (!tokenKey) return undefined
  return `revealed_${tokenKey}`
}

export function parseMediaKind(raw: unknown): RevealTokenMediaKind | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const value = String(raw).trim()
  if (value !== 'image' && value !== 'clip') {
    throw new Error("mediaKind must be 'image' or 'clip'")
  }
  return value
}

export function resolveRevealTokenRef(
  pipeline: AssetPipelineProject,
  gameId: string,
  raw: string
): { id?: string; error?: string } {
  const found = findRecord(pipeline.revealTokens || [], raw, gameId)
  if (found) return { id: found.id }
  return { error: `Reveal token '${raw}' was not found` }
}

export function collectGrantRevealTokenIds(effects: Effect[] | undefined, into: Set<string>): void {
  for (const effect of effects || []) {
    if ('grantRevealToken' in effect) into.add(effect.grantRevealToken.tokenId)
  }
}

export function collectGrantedRevealTokens(
  pipeline: AssetPipelineProject,
  gameId: string,
  effects: Effect[] | undefined
): RevealToken[] {
  const ids = new Set<string>()
  collectGrantRevealTokenIds(effects, ids)
  const tokens = revealTokensOf(pipeline, gameId)
  const out: RevealToken[] = []
  for (const id of ids) {
    const token = tokens.find((t) => t.id === id) || tokens.find((t) => t.key === id)
    if (token && !out.some((t) => t.id === token.id)) out.push(token)
  }
  return out
}

export function applyGrantRevealToken(
  pipeline: AssetPipelineProject,
  gameId: string,
  effects: Effect[] | undefined,
  flags: Map<string, boolean | number>
): RevealToken[] {
  const granted = collectGrantedRevealTokens(pipeline, gameId, effects)
  for (const token of granted) {
    if (token.flagId) flags.set(token.flagId, true)
  }
  return granted
}

export function validateRevealToken(
  pipeline: AssetPipelineProject,
  token: RevealToken,
  path = 'revealToken'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  if (!String(token.title || '').trim()) {
    issues.push(errorIssue(`${path}.title`, 'Reveal token title is required'))
  }
  if (typeof token.text !== 'string') {
    issues.push(errorIssue(`${path}.text`, 'Reveal token text is required'))
  }
  if (!Number.isInteger(token.order)) {
    issues.push(errorIssue(`${path}.order`, 'order must be an integer'))
  }
  try {
    assertRecordKey(token.key, 'Reveal token')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  if (!token.key) {
    issues.push(errorIssue(`${path}.key`, 'Reveal token key is required (auto flag is revealed_<key>)'))
  } else {
    const clash = revealTokensOf(pipeline, token.gameId).find((t) => t.key === token.key && t.id !== token.id)
    if (clash) {
      issues.push(errorIssue(`${path}.key`, `Reveal token key '${token.key}' is already used by '${clash.title}'`))
    }
  }
  if (!token.flagId) {
    issues.push(errorIssue(`${path}.flagId`, 'Reveal token is missing its auto flag'))
  } else {
    const flag = findRecord(pipeline.flags || [], token.flagId, token.gameId)
    if (!flag) issues.push(errorIssue(`${path}.flagId`, `Auto flag '${token.flagId}' was not found`))
    else if (flag.type !== 'bool') {
      issues.push(errorIssue(`${path}.flagId`, `Auto flag '${flag.name}' must be bool`))
    }
  }
  if (token.mediaKind && token.mediaKind !== 'image' && token.mediaKind !== 'clip') {
    issues.push(errorIssue(`${path}.mediaKind`, "mediaKind must be 'image' or 'clip'"))
  }
  if (token.mediaAssetId) {
    if (token.mediaKind === 'clip') {
      const clip = (pipeline.clips || []).find(
        (c) => c.id === token.mediaAssetId || (c as { key?: string }).key === token.mediaAssetId
      )
      if (!clip) issues.push(errorIssue(`${path}.mediaAssetId`, `Clip '${token.mediaAssetId}' was not found`))
    } else {
      const assets = (pipeline.visualAssets || []).filter((a) => a.gameId === token.gameId)
      const found =
        assets.find((a) => a.id === token.mediaAssetId) ||
        assets.find((a) => a.key === token.mediaAssetId) ||
        assets.find((a) => a.name === token.mediaAssetId)
      if (!found) issues.push(errorIssue(`${path}.mediaAssetId`, `Image asset '${token.mediaAssetId}' was not found`))
    }
  }
  issues.push(...validateCondition(pipeline, token.gameId, token.unlockedBy, `${path}.unlockedBy`))
  return issues
}

export function bindRevealToken(
  pipeline: AssetPipelineProject,
  gameId: string,
  token: RevealToken
): RevealToken {
  const next: RevealToken = { ...token }
  if (token.flagId) {
    const flag = findRecord(pipeline.flags || [], token.flagId, gameId)
    if (flag) next.flagId = flag.id
  }
  if (token.unlockedBy) next.unlockedBy = bindCondition(pipeline, gameId, token.unlockedBy)
  return next
}

export function ensureRevealTokenFlag(
  pipeline: AssetPipelineProject,
  gameId: string,
  token: Pick<RevealToken, 'id' | 'key' | 'title' | 'flagId'>
): GameFlag {
  if (!pipeline.flags) pipeline.flags = []
  const existing =
    (token.flagId ? findRecord(pipeline.flags, token.flagId, gameId) : undefined) ||
    pipeline.flags.find((f) => f.gameId === gameId && f.key === autoFlagKeyForToken(token.key))
  if (existing) return existing
  const now = nowIso()
  const flag: GameFlag = {
    id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `flag-${Date.now().toString(36)}`,
    gameId,
    key: autoFlagKeyForToken(token.key),
    name: token.title,
    type: 'bool',
    default: false,
    scope: 'game',
    description: `Auto flag for reveal token ${token.key || token.id}`,
    schemaVersion: RECORD_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now
  }
  pipeline.flags.push(flag)
  return flag
}

export function collectRevealTokenUsers(
  pipeline: AssetPipelineProject,
  tokenId: string
): NamedUser[] {
  const users: NamedUser[] = []
  const add = (id: string, name: string, kind: string) => {
    if (!users.some((u) => u.id === id && u.kind === kind)) users.push({ id, name, kind })
  }
  const uses = (effects: Effect[] | undefined) => {
    const ids = new Set<string>()
    collectGrantRevealTokenIds(effects, ids)
    return ids.has(tokenId)
  }
  for (const t of pipeline.triggers || []) {
    if (uses(t.effects)) add(t.id, t.name, 'trigger')
  }
  for (const e of pipeline.encounters || []) {
    if (uses(e.onWin) || uses(e.onLose)) add(e.id, e.name, 'encounter')
  }
  for (const d of pipeline.dialogues || []) {
    for (const node of d.nodes || []) {
      if (uses(node.effects)) add(d.id, d.name, 'dialogue')
      for (const choice of node.choices || []) {
        if (uses(choice.effects)) add(d.id, d.name, 'dialogue')
      }
    }
  }
  return users
}

export function assertCanRemoveRevealToken(
  pipeline: AssetPipelineProject,
  tokenId: string,
  title: string
): void {
  const users = collectRevealTokenUsers(pipeline, tokenId)
  if (users.length > 0) throw new Error(formatInUseError('reveal token', title, users))
}

/** Conditions that test a token's auto flag also count as users of that flag. */
export function tokenOwnsFlag(pipeline: AssetPipelineProject, flagId: string): RevealToken | undefined {
  return (pipeline.revealTokens || []).find((t) => t.flagId === flagId)
}

export function collectTokenUnlockedByFlag(pipeline: AssetPipelineProject, flagId: string): NamedUser[] {
  const users: NamedUser[] = []
  for (const token of pipeline.revealTokens || []) {
    const ids = new Set<string>()
    collectConditionFlagIds(token.unlockedBy, ids)
    if (ids.has(flagId) || token.flagId === flagId) {
      users.push({ id: token.id, name: token.title, kind: 'revealToken' })
    }
  }
  return users
}
