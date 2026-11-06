/**
 * P3: Event / binding reference validation and in-use collectors.
 * Shared by storage, CLI, IPC, and the renderer (no Node APIs).
 */

import type {
  AssetPipelineProject,
  EventBinding,
  EventBindingAction,
  EventDefinition,
  EventPayloadSchema,
  EventReturnPolicy,
  StoryboardLayer
} from '../types/assetPipeline'
import { getLayerKind, getShotGameId } from './layerValidation'

export function ensureEventArrays(pipeline: AssetPipelineProject): void {
  if (!pipeline.eventDefinitions) pipeline.eventDefinitions = []
  if (!pipeline.eventBindings) pipeline.eventBindings = []
}

export function describeBindingAction(action: EventBindingAction): string {
  switch (action.type) {
    case 'setPose':
      return `setPose ${action.poseId}`
    case 'setState':
      return `setState ${action.stateId}`
    case 'setVisibility':
      return `setVisibility ${action.visible}`
    case 'setText':
      return `setText ${JSON.stringify(action.text)}`
  }
}

export function parseReturnPolicy(value: string | undefined): EventReturnPolicy {
  const policy = value ?? 'default'
  if (policy !== 'default' && policy !== 'hold') {
    throw new Error(`returnPolicy must be 'default' or 'hold', got '${policy}'`)
  }
  return policy
}

export function parseDurationSec(value: number | string | undefined): number {
  const n = value === undefined || value === '' ? 0 : Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`durationSec must be a number >= 0, got '${value}'`)
  }
  return n
}

export function parsePayloadFilter(
  value: unknown
): Record<string, string | number | boolean> | undefined {
  if (value === undefined || value === null || value === '') return undefined
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('payloadFilter must be JSON object of primitive values')
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('payloadFilter must be an object of primitive values')
  }
  const out: Record<string, string | number | boolean> = {}
  for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') {
      throw new Error(`payloadFilter.${key} must be string, number, or boolean`)
    }
    out[key] = val
  }
  return out
}

export function parsePayloadSchema(value: unknown): EventPayloadSchema | undefined {
  if (value === undefined || value === null || value === '') return undefined
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('payloadSchema must be JSON')
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('payloadSchema must be an object')
  }
  const obj = parsed as { type?: string; properties?: Record<string, unknown> }
  if (obj.type !== 'object' || !obj.properties || typeof obj.properties !== 'object') {
    throw new Error("payloadSchema must be { type: 'object', properties: { ... } }")
  }
  const properties: EventPayloadSchema['properties'] = {}
  for (const [key, val] of Object.entries(obj.properties)) {
    const typeName = typeof val === 'string' ? val : (val as { type?: string })?.type
    if (typeName !== 'string' && typeName !== 'number' && typeName !== 'boolean') {
      throw new Error(`payloadSchema.properties.${key} must be string|number|boolean`)
    }
    properties[key] = typeName
  }
  return { type: 'object', properties }
}

function findLayerInShot(
  pipeline: AssetPipelineProject,
  shotId: string,
  layerId: string
): { layer: StoryboardLayer } {
  const shot = (pipeline.storyboardShots || []).find((s) => s.id === shotId)
  if (!shot) {
    throw new Error(`Shot not found: ${shotId}`)
  }
  const layer = (shot.layers || []).find((l) => l.id === layerId)
  if (!layer) {
    throw new Error(`Layer '${layerId}' is not in shot '${shotId}'`)
  }
  return { layer }
}

export function validateEventDefinitionInput(
  pipeline: AssetPipelineProject,
  input: { gameId: string; name: string },
  excludeEventId?: string
): void {
  const name = input.name.trim()
  if (!name) {
    throw new Error('Event name is required')
  }
  const game = (pipeline.games || []).find((g) => g.id === input.gameId)
  if (!game) {
    throw new Error(`Game not found: ${input.gameId}`)
  }
  const clash = (pipeline.eventDefinitions || []).find(
    (e) =>
      e.gameId === input.gameId &&
      e.name === name &&
      e.id !== excludeEventId
  )
  if (clash) {
    throw new Error(`Event name '${name}' already exists in this game`)
  }
}

export function validateBindingReferences(
  binding: Pick<
    EventBinding,
    'shotId' | 'eventId' | 'targetLayerId' | 'action' | 'durationSec' | 'returnPolicy'
  >,
  pipeline: AssetPipelineProject,
  requestedGameId?: string
): void {
  ensureEventArrays(pipeline)
  if (binding.durationSec < 0 || !Number.isFinite(binding.durationSec)) {
    throw new Error(`durationSec must be >= 0, got ${binding.durationSec}`)
  }
  if (binding.returnPolicy !== 'default' && binding.returnPolicy !== 'hold') {
    throw new Error(`returnPolicy must be 'default' or 'hold'`)
  }

  const shotGameId = getShotGameId(pipeline, binding.shotId)
  if (requestedGameId && requestedGameId !== shotGameId) {
    throw new Error(
      `Shot belongs to game '${shotGameId}', not requested game '${requestedGameId}'`
    )
  }

  const event = (pipeline.eventDefinitions || []).find((e) => e.id === binding.eventId)
  if (!event) {
    throw new Error(`Event not found: ${binding.eventId}`)
  }
  if (event.gameId !== shotGameId) {
    throw new Error(
      `Event '${event.name}' belongs to game '${event.gameId}', not shot game '${shotGameId}'`
    )
  }

  const { layer } = findLayerInShot(pipeline, binding.shotId, binding.targetLayerId)
  const kind = getLayerKind(layer)
  const action = binding.action

  if (action.type === 'setPose') {
    if (!layer.characterId) {
      throw new Error(`setPose requires a character layer (layer '${layer.id}' has no characterId)`)
    }
    const pose = (pipeline.poses || []).find((p) => p.id === action.poseId)
    if (!pose) {
      throw new Error(`Pose not found: ${action.poseId}`)
    }
    if (pose.characterId !== layer.characterId) {
      throw new Error(
        `Pose '${action.poseId}' belongs to character '${pose.characterId}', not '${layer.characterId}'`
      )
    }
  } else if (action.type === 'setState') {
    if (!layer.visualAssetId) {
      throw new Error(
        `setState requires a visual-asset layer (layer '${layer.id}' has no visualAssetId)`
      )
    }
    const state = (pipeline.assetStates || []).find((s) => s.id === action.stateId)
    if (!state) {
      throw new Error(`Asset state not found: ${action.stateId}`)
    }
    if (state.assetId !== layer.visualAssetId) {
      throw new Error(
        `State '${action.stateId}' belongs to asset '${state.assetId}', not '${layer.visualAssetId}'`
      )
    }
  } else if (action.type === 'setText') {
    if (kind !== 'text' && layer.text === undefined) {
      throw new Error(`setText requires a text layer (layer '${layer.id}' has no text)`)
    }
  } else if (action.type !== 'setVisibility') {
    throw new Error(`Unknown binding action type`)
  }
}

export function describeBindingRef(pipeline: AssetPipelineProject, binding: EventBinding): string {
  const shot = (pipeline.storyboardShots || []).find((s) => s.id === binding.shotId)
  const event = (pipeline.eventDefinitions || []).find((e) => e.id === binding.eventId)
  const shotName = shot?.name || binding.shotId
  const eventName = event?.name || binding.eventId
  return `${shotName}/${eventName}/${binding.targetLayerId}`
}

export function collectEventBindingUsage(
  pipeline: AssetPipelineProject,
  eventId: string
): { bindingIds: string[]; labels: string[] } {
  const bindingIds: string[] = []
  const labels: string[] = []
  for (const binding of pipeline.eventBindings || []) {
    if (binding.eventId === eventId) {
      bindingIds.push(binding.id)
      labels.push(describeBindingRef(pipeline, binding))
    }
  }
  return { bindingIds, labels }
}

export function collectPoseBindingUsage(
  pipeline: AssetPipelineProject,
  poseId: string
): { bindingIds: string[]; labels: string[] } {
  const bindingIds: string[] = []
  const labels: string[] = []
  for (const binding of pipeline.eventBindings || []) {
    if (binding.action.type === 'setPose' && binding.action.poseId === poseId) {
      bindingIds.push(binding.id)
      labels.push(describeBindingRef(pipeline, binding))
    }
  }
  return { bindingIds, labels }
}

export function collectStateBindingUsage(
  pipeline: AssetPipelineProject,
  stateId: string
): { bindingIds: string[]; labels: string[] } {
  const bindingIds: string[] = []
  const labels: string[] = []
  for (const binding of pipeline.eventBindings || []) {
    if (binding.action.type === 'setState' && binding.action.stateId === stateId) {
      bindingIds.push(binding.id)
      labels.push(describeBindingRef(pipeline, binding))
    }
  }
  return { bindingIds, labels }
}

export function collectLayerBindingUsage(
  pipeline: AssetPipelineProject,
  layerId: string
): EventBinding[] {
  return (pipeline.eventBindings || []).filter((b) => b.targetLayerId === layerId)
}

export function formatBindingInUseError(kind: string, name: string, labels: string[]): string {
  const preview = labels.slice(0, 3).join(', ')
  const extra = labels.length > 3 ? '...' : ''
  return `Cannot delete ${kind} '${name}': referenced by ${labels.length} event binding(s): ${preview}${extra}`
}

export function bindingActionIssues(
  binding: EventBinding,
  pipeline: AssetPipelineProject
): string | null {
  try {
    validateBindingReferences(binding, pipeline)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export function eventForGame(
  pipeline: AssetPipelineProject,
  gameId: string
): EventDefinition[] {
  return (pipeline.eventDefinitions || []).filter((e) => e.gameId === gameId)
}

export function bindingsForShot(
  pipeline: AssetPipelineProject,
  shotId: string
): EventBinding[] {
  return (pipeline.eventBindings || []).filter((b) => b.shotId === shotId)
}
