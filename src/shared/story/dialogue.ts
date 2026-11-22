/**
 * Dialogue trees and deterministic play (Step 4). Game-agnostic.
 */

import type {
  AssetPipelineProject,
  Character,
  Dialogue,
  DialogueChoice,
  DialogueNode,
  Effect,
  Npc,
  Pose
} from '../types/assetPipeline'
import { assertRecordKey, RECORD_KEY_PATTERN } from '../worldContent/keys'
import { errorIssue, formatInUseError, warningIssue, type ContentIssue, type NamedUser } from '../worldContent/issues'
import {
  bindCondition,
  bindEffects,
  evaluateCondition,
  findRecord,
  flagsOf,
  type EvalContext,
  validateCondition,
  validateEffects
} from './conditions'
import { effectivePoseSlots } from '../gameSettings/poseSlots'
import { parseFlagAssignments } from './simulate'

const NODE_ID_PATTERN = RECORD_KEY_PATTERN
const HERO = 'hero'
const NARRATOR = 'narrator'

export function dialoguesOf(pipeline: AssetPipelineProject, gameId: string): Dialogue[] {
  return (pipeline.dialogues || []).filter((d) => d.gameId === gameId)
}

export function heroCharacter(pipeline: AssetPipelineProject, gameId: string): Character | undefined {
  const chars = (pipeline.characters || []).filter((c) => c.gameId === gameId)
  return (
    chars.find((c) => /^(player|hero|protagonist)$/i.test(c.role)) ||
    chars.find((c) => c.role.toLowerCase() === 'player')
  )
}

export function speakerCharacter(
  pipeline: AssetPipelineProject,
  gameId: string,
  speaker: string
): Character | undefined {
  const token = String(speaker || '').trim()
  if (!token || token === NARRATOR) return undefined
  if (token === HERO) return heroCharacter(pipeline, gameId)
  const npc = findRecord(pipeline.npcs || [], token, gameId) || (pipeline.npcs || []).find((n) => n.id === token)
  if (!npc) return undefined
  return (pipeline.characters || []).find((c) => c.id === npc.characterId && c.gameId === gameId)
}

export function poseForSlot(pipeline: AssetPipelineProject, character: Character | undefined, slot: string | undefined): Pose | undefined {
  if (!character || !slot) return undefined
  return (pipeline.poses || []).find((p) => p.characterId === character.id && p.slot === slot)
}

export function validateDialogue(
  pipeline: AssetPipelineProject,
  dialogue: Dialogue,
  path = 'dialogue'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  if (!String(dialogue.name || '').trim()) issues.push(errorIssue(`${path}.name`, 'Dialogue name is required'))
  try {
    assertRecordKey(dialogue.key, 'Dialogue')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  if (dialogue.key) {
    const clash = dialoguesOf(pipeline, dialogue.gameId).find((d) => d.key === dialogue.key && d.id !== dialogue.id)
    if (clash) issues.push(errorIssue(`${path}.key`, `Dialogue key '${dialogue.key}' is already used by '${clash.name}'`))
  }
  const nodes = dialogue.nodes || []
  if (nodes.length === 0) {
    issues.push(errorIssue(`${path}.nodes`, 'Dialogue needs at least one node'))
    return issues
  }
  const byId = new Map<string, DialogueNode>()
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!
    const p = `${path}.nodes[${i}]`
    if (!NODE_ID_PATTERN.test(String(node.id || ''))) {
      issues.push(errorIssue(`${p}.id`, 'Node id must be a lowercase slug starting with a letter'))
      continue
    }
    if (byId.has(node.id)) issues.push(errorIssue(`${p}.id`, `Duplicate node id '${node.id}'`))
    byId.set(node.id, node)
    if (!String(node.speaker || '').trim()) issues.push(errorIssue(`${p}.speaker`, 'speaker is required'))
    if (!String(node.text || '').trim()) issues.push(errorIssue(`${p}.text`, 'text is required'))
    if (node.next && node.choices && node.choices.length) {
      issues.push(errorIssue(p, 'Node cannot have both next and choices'))
    }
    issues.push(...validateSpeaker(pipeline, dialogue.gameId, node, p))
    if (node.effects?.length) {
      issues.push(...validateEffects(pipeline, dialogue.gameId, node.effects, `${p}.effects`))
    }
    if (node.choices) {
      for (let c = 0; c < node.choices.length; c++) {
        issues.push(...validateChoice(pipeline, dialogue.gameId, node.choices[c]!, `${p}.choices[${c}]`))
      }
    }
  }
  if (!dialogue.startNodeId || !byId.has(dialogue.startNodeId)) {
    issues.push(errorIssue(`${path}.startNodeId`, `startNodeId '${dialogue.startNodeId || ''}' was not found`))
  }
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!
    const p = `${path}.nodes[${i}]`
    if (node.next && !byId.has(node.next)) {
      issues.push(errorIssue(`${p}.next`, `next '${node.next}' was not found`))
    }
    for (let c = 0; c < (node.choices || []).length; c++) {
      const choice = node.choices![c]!
      if (choice.next && !byId.has(choice.next)) {
        issues.push(errorIssue(`${p}.choices[${c}].next`, `next '${choice.next}' was not found`))
      }
    }
  }
  for (let i = 0; i < (dialogue.entryVariants || []).length; i++) {
    const variant = dialogue.entryVariants![i]!
    const p = `${path}.entryVariants[${i}]`
    issues.push(...validateCondition(pipeline, dialogue.gameId, variant.condition, `${p}.condition`))
    if (!variant.startNodeId || !byId.has(variant.startNodeId)) {
      issues.push(errorIssue(`${p}.startNodeId`, `startNodeId '${variant.startNodeId || ''}' was not found`))
    }
  }
  const reachable = reachableNodeIds(dialogue)
  for (const node of nodes) {
    if (!reachable.has(node.id)) {
      issues.push(warningIssue(`${path}.nodes.${node.id}`, `Node '${node.id}' is unreachable`))
    }
  }
  const hasEnd = nodes.some((n) => !n.next && !(n.choices && n.choices.length))
  if (!hasEnd) issues.push(errorIssue(`${path}.nodes`, 'Dialogue needs at least one end node (no next / choices)'))
  return issues
}

function validateSpeaker(
  pipeline: AssetPipelineProject,
  gameId: string,
  node: DialogueNode,
  path: string
): ContentIssue[] {
  const issues: ContentIssue[] = []
  const speaker = String(node.speaker || '').trim()
  if (speaker === NARRATOR) {
    if (node.poseSlot) issues.push(errorIssue(`${path}.poseSlot`, 'narrator has no pose slots'))
    return issues
  }
  if (speaker === HERO) {
    const hero = heroCharacter(pipeline, gameId)
    if (!hero) issues.push(warningIssue(`${path}.speaker`, 'No hero character (role player/hero/protagonist) in this game'))
    issues.push(...validatePoseSlot(pipeline, gameId, hero, node.poseSlot, path))
    return issues
  }
  const npc = findRecord(pipeline.npcs || [], speaker, gameId)
  if (!npc) {
    issues.push(errorIssue(`${path}.speaker`, `Speaker '${speaker}' was not found (npc id, hero, or narrator)`))
    return issues
  }
  const character = (pipeline.characters || []).find((c) => c.id === npc.characterId)
  issues.push(...validatePoseSlot(pipeline, gameId, character, node.poseSlot, path))
  return issues
}

function validatePoseSlot(
  pipeline: AssetPipelineProject,
  gameId: string,
  character: Character | undefined,
  poseSlot: string | undefined,
  path: string
): ContentIssue[] {
  if (!poseSlot) return []
  if (!character) return [errorIssue(`${path}.poseSlot`, `poseSlot '${poseSlot}' needs a speaker character`)]
  const game = pipeline.games.find((g) => g.id === gameId)
  const slots = effectivePoseSlots(game, character)
  if (!slots.some((s) => s.key === poseSlot)) {
    return [errorIssue(`${path}.poseSlot`, `poseSlot '${poseSlot}' is not on '${character.name}'`)]
  }
  return []
}

function validateChoice(
  pipeline: AssetPipelineProject,
  gameId: string,
  choice: DialogueChoice,
  path: string
): ContentIssue[] {
  const issues: ContentIssue[] = []
  if (!String(choice.text || '').trim()) issues.push(errorIssue(`${path}.text`, 'Choice text is required'))
  if (!choice.next) issues.push(errorIssue(`${path}.next`, 'Choice next is required'))
  if (choice.condition) issues.push(...validateCondition(pipeline, gameId, choice.condition, `${path}.condition`))
  if (choice.effects?.length) issues.push(...validateEffects(pipeline, gameId, choice.effects, `${path}.effects`))
  return issues
}

export function reachableNodeIds(dialogue: Dialogue): Set<string> {
  const byId = new Map((dialogue.nodes || []).map((n) => [n.id, n]))
  const out = new Set<string>()
  const starts = [dialogue.startNodeId, ...(dialogue.entryVariants || []).map((v) => v.startNodeId)]
  const queue = starts.filter((id) => byId.has(id))
  for (const id of queue) out.add(id)
  while (queue.length) {
    const id = queue.shift()!
    const node = byId.get(id)
    if (!node) continue
    const nexts = [
      node.next,
      ...(node.choices || []).map((c) => c.next)
    ].filter((x): x is string => Boolean(x))
    for (const n of nexts) {
      if (out.has(n) || !byId.has(n)) continue
      out.add(n)
      queue.push(n)
    }
  }
  return out
}

export function collectDialogueUsers(pipeline: AssetPipelineProject, dialogueId: string): NamedUser[] {
  const users: NamedUser[] = []
  for (const n of pipeline.npcs || []) {
    if (n.defaultDialogueId === dialogueId) users.push({ id: n.id, name: n.displayName, kind: 'npc' })
  }
  for (const t of pipeline.triggers || []) {
    if (t.kind === 'onDialogueEnd' && (t.sourceRef === dialogueId || t.sourceRef.replace(/^@/, '') === (pipeline.dialogues || []).find((d) => d.id === dialogueId)?.key)) {
      users.push({ id: t.id, name: t.name, kind: 'trigger' })
    }
    for (const effect of t.effects || []) {
      if ('startDialogue' in effect && effect.startDialogue.dialogueId === dialogueId) {
        users.push({ id: t.id, name: t.name, kind: 'trigger' })
      }
    }
  }
  for (const e of pipeline.encounters || []) {
    for (const list of [e.onWin || [], e.onLose || []]) {
      if (list.some((ef) => 'startDialogue' in ef && ef.startDialogue.dialogueId === dialogueId)) {
        users.push({ id: e.id, name: e.name, kind: 'encounter' })
      }
    }
  }
  return users
}

export function assertCanRemoveDialogue(pipeline: AssetPipelineProject, dialogueId: string, name: string): void {
  const users = collectDialogueUsers(pipeline, dialogueId)
  if (users.length) throw new Error(formatInUseError('dialogue', name, users))
}

export function bindDialogueTree(
  pipeline: AssetPipelineProject,
  gameId: string,
  dialogue: Dialogue
): Dialogue {
  const nodes = (dialogue.nodes || []).map((node) => {
    const speakerNpc = findRecord(pipeline.npcs || [], node.speaker, gameId)
    const speaker =
      node.speaker === HERO || node.speaker === NARRATOR ? node.speaker : speakerNpc?.id || node.speaker
    return {
      ...node,
      speaker,
      effects: node.effects?.length ? bindEffects(pipeline, gameId, node.effects) : node.effects,
      choices: (node.choices || []).map((c) => ({
        ...c,
        condition: c.condition ? bindCondition(pipeline, gameId, c.condition) : c.condition,
        effects: c.effects?.length ? bindEffects(pipeline, gameId, c.effects) : c.effects
      }))
    }
  })
  return {
    ...dialogue,
    nodes,
    entryVariants: (dialogue.entryVariants || []).map((v) => ({
      ...v,
      condition: bindCondition(pipeline, gameId, v.condition) || v.condition
    }))
  }
}

export interface DialoguePlayStep {
  nodeId: string
  speaker: string
  speakerName: string
  text: string
  poseSlot?: string
  effects: Effect[]
  choiceText?: string
}

export interface DialoguePlayResult {
  dialogueId: string
  name: string
  startNodeId: string
  steps: DialoguePlayStep[]
  ended: boolean
  endReason: string
  flags: { id: string; key?: string; name: string; value: boolean | number }[]
  appliedEffects: string[]
}

function speakerName(pipeline: AssetPipelineProject, gameId: string, speaker: string): string {
  if (speaker === NARRATOR) return 'Narrator'
  if (speaker === HERO) return heroCharacter(pipeline, gameId)?.name || 'Hero'
  const npc = (pipeline.npcs || []).find((n) => n.id === speaker) as Npc | undefined
  return npc?.displayName || speaker
}

export function resolveDialogueStart(dialogue: Dialogue, ctx: EvalContext): string {
  for (const variant of dialogue.entryVariants || []) {
    if (evaluateCondition(variant.condition, ctx)) return variant.startNodeId
  }
  return dialogue.startNodeId
}

export function visibleChoices(node: DialogueNode, ctx: EvalContext): DialogueChoice[] {
  return (node.choices || []).filter((c) => evaluateCondition(c.condition, ctx))
}

function applyEffectFlags(effects: Effect[] | undefined, flags: Map<string, boolean | number>): void {
  for (const effect of effects || []) {
    if ('setFlag' in effect) flags.set(effect.setFlag.flagId, effect.setFlag.value)
    else if ('incFlag' in effect) {
      const cur = flags.get(effect.incFlag.flagId)
      const n = typeof cur === 'number' ? cur : 0
      flags.set(effect.incFlag.flagId, n + effect.incFlag.by)
    } else if ('clearFlag' in effect) {
      const cur = flags.get(effect.clearFlag.flagId)
      flags.set(effect.clearFlag.flagId, typeof cur === 'number' ? 0 : false)
    }
  }
}

export function playDialogue(
  pipeline: AssetPipelineProject,
  dialogue: Dialogue,
  options?: { flags?: string; choices?: number[] }
): DialoguePlayResult {
  const defs = flagsOf(pipeline, dialogue.gameId)
  const values = parseFlagAssignments(options?.flags, defs)
  const ctx: EvalContext = { flags: values, clearedStages: new Set(), wonEncounters: new Set() }
  const byId = new Map((dialogue.nodes || []).map((n) => [n.id, n]))
  const choiceQueue = [...(options?.choices || [])]
  const steps: DialoguePlayStep[] = []
  const appliedEffects: string[] = []
  const seen = new Set<string>()
  const startNodeId = resolveDialogueStart(dialogue, ctx)
  let current = startNodeId
  let ended = false
  let endReason = 'in progress'
  while (current) {
    if (seen.has(current)) {
      ended = true
      endReason = `cycle at node '${current}'`
      break
    }
    seen.add(current)
    const node = byId.get(current)
    if (!node) {
      ended = true
      endReason = `missing node '${current}'`
      break
    }
    applyEffectFlags(node.effects, values)
    if (node.effects?.length) appliedEffects.push(`${node.id}: node`)
    const step: DialoguePlayStep = {
      nodeId: node.id,
      speaker: node.speaker,
      speakerName: speakerName(pipeline, dialogue.gameId, node.speaker),
      text: node.text,
      poseSlot: node.poseSlot,
      effects: node.effects || []
    }
    const choices = visibleChoices(node, ctx)
    if (choices.length) {
      const pick = choiceQueue.shift()
      if (pick === undefined) {
        steps.push(step)
        endReason = 'waiting for choice'
        break
      }
      const index = Number(pick)
      if (!Number.isInteger(index) || index < 1 || index > choices.length) {
        steps.push(step)
        ended = true
        endReason = `choice ${pick} out of range (1..${choices.length}) at '${node.id}'`
        break
      }
      const chosen = choices[index - 1]!
      applyEffectFlags(chosen.effects, values)
      if (chosen.effects?.length) appliedEffects.push(`${node.id}: choice ${index}`)
      step.choiceText = chosen.text
      step.effects = [...(node.effects || []), ...(chosen.effects || [])]
      steps.push(step)
      current = chosen.next
      continue
    }
    steps.push(step)
    if (node.next) {
      current = node.next
      continue
    }
    ended = true
    endReason = 'end'
    break
  }
  return {
    dialogueId: dialogue.id,
    name: dialogue.name,
    startNodeId,
    steps,
    ended,
    endReason,
    flags: defs.map((f) => ({ id: f.id, key: f.key, name: f.name, value: values.get(f.id) ?? f.default })),
    appliedEffects
  }
}
