/**
 * Story circles (Dan Harmon 8-step). Game-agnostic. Two-layer goals live on the circle.
 */

import type {
  AssetPipelineProject,
  HarmonStepLabel,
  StoryCircle,
  StoryCircleScope,
  StoryCircleStep
} from '../types/assetPipeline'
import { assertRecordKey } from '../worldContent/keys'
import { errorIssue, warningIssue, type ContentIssue } from '../worldContent/issues'
import { findRecord } from './conditions'
import { canonOf } from './canon'

export const HARMON_STEP_LABELS: readonly HarmonStepLabel[] = [
  'You',
  'Need',
  'Go',
  'Search',
  'Find',
  'Take',
  'Return',
  'Change'
]

export const STORY_CIRCLE_SCOPES: readonly StoryCircleScope[] = ['game', 'world', 'stage']

export function storyCirclesOf(pipeline: AssetPipelineProject, gameId: string): StoryCircle[] {
  return (pipeline.storyCircles || []).filter((c) => c.gameId === gameId)
}

export function emptyCircleSteps(): StoryCircleStep[] {
  return HARMON_STEP_LABELS.map((label, i) => ({
    index: (i + 1) as StoryCircleStep['index'],
    label,
    beat: ''
  }))
}

export function mergeCircleSteps(raw?: StoryCircleStep[] | null): StoryCircleStep[] {
  const steps = emptyCircleSteps()
  for (const row of raw || []) {
    const index = Number(row?.index)
    if (!Number.isInteger(index) || index < 1 || index > 8) continue
    const i = index - 1
    steps[i] = {
      ...steps[i]!,
      ...row,
      index: steps[i]!.index,
      label: steps[i]!.label
    }
  }
  return steps
}

export function parseStoryCircleScope(raw: unknown, fallback?: StoryCircleScope): StoryCircleScope {
  const value = String(raw ?? fallback ?? '').trim()
  if (value !== 'game' && value !== 'world' && value !== 'stage') {
    throw new Error("Story circle scope must be 'game', 'world', or 'stage'")
  }
  return value
}

export function step6Of(circle: StoryCircle): StoryCircleStep | undefined {
  return (circle.steps || []).find((s) => s.index === 6)
}

/**
 * Stage-scoped Step 6 (Take) must link an encounter in that stage.
 * Draft circles warn so content can land before the encounter exists.
 * Approved circles error — that is locked canon.
 */
export function validateStageCircleStep6(
  pipeline: AssetPipelineProject,
  circle: StoryCircle,
  path = 'storyCircle'
): ContentIssue[] {
  if (circle.scope !== 'stage') return []
  const issues: ContentIssue[] = []
  const step = step6Of(circle)
  const encounterId = String(step?.encounterId || '').trim()
  const stage = findRecord(pipeline.stages || [], circle.refId || '', circle.gameId)
  const level = canonOf(circle) === 'approved' ? errorIssue : warningIssue
  if (!encounterId) {
    issues.push(
      level(
        `${path}.steps[6].encounterId`,
        `Step 6 (Take) must link an encounter in this stage`
      )
    )
    return issues
  }
  const enc = findRecord(pipeline.encounters || [], encounterId, circle.gameId)
  if (!enc) {
    issues.push(level(`${path}.steps[6].encounterId`, `Step 6 encounter '${encounterId}' was not found`))
    return issues
  }
  if (stage && enc.stageId && enc.stageId !== stage.id) {
    issues.push(
      level(
        `${path}.steps[6].encounterId`,
        `Step 6 encounter '${enc.name}' is not in stage '${stage.name}'`
      )
    )
  }
  return issues
}

function parseStepIndex(raw: unknown): StoryCircleStep['index'] | undefined {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 8) return undefined
  return n as StoryCircleStep['index']
}

export function validateStoryCircle(
  pipeline: AssetPipelineProject,
  circle: StoryCircle,
  path = 'storyCircle'
): ContentIssue[] {
  const issues: ContentIssue[] = []
  if (!String(circle.name || '').trim()) {
    issues.push(errorIssue(`${path}.name`, 'Story circle name is required'))
  }
  if (!STORY_CIRCLE_SCOPES.includes(circle.scope)) {
    issues.push(errorIssue(`${path}.scope`, "scope must be 'game', 'world', or 'stage'"))
  }
  try {
    assertRecordKey(circle.key, 'Story circle')
  } catch (err) {
    issues.push(errorIssue(`${path}.key`, err instanceof Error ? err.message : String(err)))
  }
  if (circle.key) {
    const clash = storyCirclesOf(pipeline, circle.gameId).find((c) => c.key === circle.key && c.id !== circle.id)
    if (clash) {
      issues.push(errorIssue(`${path}.key`, `Story circle key '${circle.key}' is already used by '${clash.name}'`))
    }
  }

  if (circle.scope === 'world') {
    const world = findRecord(pipeline.worlds || [], circle.refId || '', circle.gameId)
    if (!world) issues.push(errorIssue(`${path}.refId`, 'World-scoped circle needs a world refId in this game'))
  } else if (circle.scope === 'stage') {
    const stage = findRecord(pipeline.stages || [], circle.refId || '', circle.gameId)
    if (!stage) issues.push(errorIssue(`${path}.refId`, 'Stage-scoped circle needs a stage refId in this game'))
  }

  const steps = circle.steps || []
  if (steps.length !== 8) {
    issues.push(errorIssue(`${path}.steps`, 'Story circle must have exactly 8 steps (You through Change)'))
  }
  const seen = new Set<number>()
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    const sp = `${path}.steps[${i}]`
    const index = parseStepIndex(step.index)
    if (!index) {
      issues.push(errorIssue(`${sp}.index`, 'Step index must be 1..8'))
      continue
    }
    if (seen.has(index)) issues.push(errorIssue(`${sp}.index`, `Duplicate step ${index}`))
    seen.add(index)
    const expected = HARMON_STEP_LABELS[index - 1]
    if (step.label !== expected) {
      issues.push(errorIssue(`${sp}.label`, `Step ${index} label must be '${expected}'`))
    }
    if (step.sceneId) {
      const scenes = (pipeline.scenes || []).filter((s) => s.gameId === circle.gameId)
      const found =
        scenes.find((s) => s.id === step.sceneId) ||
        scenes.find((s) => s.key === step.sceneId) ||
        scenes.find((s) => s.name === step.sceneId)
      if (!found) issues.push(errorIssue(`${sp}.sceneId`, `Scene '${step.sceneId}' was not found`))
    }
    if (step.dialogueId) {
      const dlg = findRecord(pipeline.dialogues || [], step.dialogueId, circle.gameId)
      if (!dlg) issues.push(errorIssue(`${sp}.dialogueId`, `Dialogue '${step.dialogueId}' was not found`))
    }
    if (step.encounterId) {
      const enc = findRecord(pipeline.encounters || [], step.encounterId, circle.gameId)
      if (!enc) issues.push(errorIssue(`${sp}.encounterId`, `Encounter '${step.encounterId}' was not found`))
    }
    if (step.flagId) {
      const flag = findRecord(pipeline.flags || [], step.flagId, circle.gameId)
      if (!flag) issues.push(errorIssue(`${sp}.flagId`, `Flag '${step.flagId}' was not found`))
    }
    if (step.advancesCircleId) {
      const parent = findRecord(pipeline.storyCircles || [], step.advancesCircleId, circle.gameId)
      if (!parent) {
        issues.push(errorIssue(`${sp}.advancesCircleId`, `Circle '${step.advancesCircleId}' was not found`))
      } else if (parent.id === circle.id) {
        issues.push(errorIssue(`${sp}.advancesCircleId`, 'A circle cannot advance itself'))
      } else if (circle.scope === 'stage' && parent.scope === 'stage') {
        issues.push(errorIssue(`${sp}.advancesCircleId`, 'A stage circle must advance a game or world circle'))
      }
    }
    if (step.advancesStep !== undefined && !parseStepIndex(step.advancesStep)) {
      issues.push(errorIssue(`${sp}.advancesStep`, 'advancesStep must be 1..8'))
    }
  }
  issues.push(...validateStageCircleStep6(pipeline, circle, path))
  return issues
}

export function bindStoryCircle(
  pipeline: AssetPipelineProject,
  gameId: string,
  circle: StoryCircle
): StoryCircle {
  const bind = <T extends { id: string; key?: string; gameId: string }>(
    list: T[] | undefined,
    raw: string | undefined
  ): string | undefined => {
    if (!raw) return undefined
    return findRecord(list || [], raw, gameId)?.id || raw
  }
  const next: StoryCircle = {
    ...circle,
    refId: bind(
      circle.scope === 'world' ? pipeline.worlds : circle.scope === 'stage' ? pipeline.stages : undefined,
      circle.refId
    )
  }
  next.steps = (circle.steps || emptyCircleSteps()).map((step) => {
    const bound: StoryCircleStep = { ...step }
    if (step.dialogueId) bound.dialogueId = bind(pipeline.dialogues, step.dialogueId)
    if (step.encounterId) bound.encounterId = bind(pipeline.encounters, step.encounterId)
    if (step.flagId) bound.flagId = bind(pipeline.flags, step.flagId)
    if (step.advancesCircleId) bound.advancesCircleId = bind(pipeline.storyCircles, step.advancesCircleId)
    if (step.sceneId) {
      const scenes = (pipeline.scenes || []).filter((s) => s.gameId === gameId)
      const found =
        scenes.find((s) => s.id === step.sceneId) ||
        scenes.find((s) => s.key === step.sceneId) ||
        scenes.find((s) => s.name === step.sceneId)
      if (found) bound.sceneId = found.id
    }
    return bound
  })
  return next
}
