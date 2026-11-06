/**
 * P3: Event definition and binding CRUD against studio.json.
 */

import { randomUUID } from 'crypto'
import type {
  EventBinding,
  EventBindingAction,
  EventDefinition,
  EventPayloadSchema
} from '../../shared/types/assetPipeline'
import {
  bindingsForShot,
  collectEventBindingUsage,
  ensureEventArrays,
  eventForGame,
  formatBindingInUseError,
  parseDurationSec,
  parsePayloadFilter,
  parsePayloadSchema,
  parseReturnPolicy,
  validateBindingReferences,
  validateEventDefinitionInput
} from '../../shared/storyboard/eventValidation'
import { getAssetPipeline, updateAssetPipeline } from './studioStorage'

export interface CreateEventInput {
  gameId: string
  name: string
  description?: string
  payloadSchema?: EventPayloadSchema | string
}

export interface CreateBindingInput {
  gameId?: string
  shotId: string
  eventId: string
  targetLayerId?: string
  action: EventBindingAction
  payloadFilter?: Record<string, string | number | boolean> | string
  durationSec?: number | string
  returnPolicy?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function listEvents(
  gameId: string,
  dataDirOverride?: string
): Promise<EventDefinition[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureEventArrays(pipeline)
  const game = (pipeline.games || []).find((g) => g.id === gameId)
  if (!game) {
    throw new Error(`Game not found: ${gameId}`)
  }
  return eventForGame(pipeline, gameId)
}

export async function getEvent(
  eventId: string,
  dataDirOverride?: string
): Promise<EventDefinition | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureEventArrays(pipeline)
  return pipeline.eventDefinitions.find((e) => e.id === eventId)
}

export async function createEvent(
  input: CreateEventInput,
  dataDirOverride?: string
): Promise<EventDefinition> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureEventArrays(pipeline)
  const name = input.name.trim()
  validateEventDefinitionInput(pipeline, { gameId: input.gameId, name })
  const now = nowIso()
  const event: EventDefinition = {
    id: randomUUID(),
    gameId: input.gameId,
    name,
    description: input.description?.trim() || undefined,
    payloadSchema: parsePayloadSchema(input.payloadSchema),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  pipeline.eventDefinitions.push(event)
  await updateAssetPipeline(pipeline, dataDirOverride)
  return event
}

export async function updateEvent(
  eventId: string,
  patch: { name?: string; description?: string; payloadSchema?: EventPayloadSchema | string | null },
  dataDirOverride?: string
): Promise<EventDefinition> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureEventArrays(pipeline)
  const index = pipeline.eventDefinitions.findIndex((e) => e.id === eventId)
  if (index < 0) {
    throw new Error(`Event not found: ${eventId}`)
  }
  const existing = pipeline.eventDefinitions[index]
  const name = patch.name !== undefined ? patch.name.trim() : existing.name
  validateEventDefinitionInput(pipeline, { gameId: existing.gameId, name }, eventId)
  const next: EventDefinition = {
    ...existing,
    name,
    description:
      patch.description !== undefined
        ? patch.description.trim() || undefined
        : existing.description,
    payloadSchema:
      patch.payloadSchema === null
        ? undefined
        : patch.payloadSchema !== undefined
          ? parsePayloadSchema(patch.payloadSchema)
          : existing.payloadSchema,
    updatedAt: nowIso()
  }
  pipeline.eventDefinitions[index] = next
  await updateAssetPipeline(pipeline, dataDirOverride)
  return next
}

export async function removeEvent(
  eventId: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureEventArrays(pipeline)
  const event = pipeline.eventDefinitions.find((e) => e.id === eventId)
  if (!event) {
    throw new Error(`Event not found: ${eventId}`)
  }
  const usage = collectEventBindingUsage(pipeline, eventId)
  if (usage.labels.length > 0) {
    throw new Error(formatBindingInUseError('event', event.name, usage.labels))
  }
  pipeline.eventDefinitions = pipeline.eventDefinitions.filter((e) => e.id !== eventId)
  await updateAssetPipeline(pipeline, dataDirOverride)
}

export async function listBindings(
  shotId: string,
  dataDirOverride?: string
): Promise<EventBinding[]> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureEventArrays(pipeline)
  const shot = (pipeline.storyboardShots || []).find((s) => s.id === shotId)
  if (!shot) {
    throw new Error(`Shot not found: ${shotId}`)
  }
  return bindingsForShot(pipeline, shotId)
}

export async function getBinding(
  bindingId: string,
  dataDirOverride?: string
): Promise<EventBinding | undefined> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureEventArrays(pipeline)
  return pipeline.eventBindings.find((b) => b.id === bindingId)
}

export async function createBinding(
  input: CreateBindingInput,
  dataDirOverride?: string
): Promise<EventBinding> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureEventArrays(pipeline)
  const now = nowIso()
  const binding: EventBinding = {
    id: randomUUID(),
    shotId: input.shotId,
    eventId: input.eventId,
    targetLayerId:
      input.action.type === 'playSfx' ? undefined : input.targetLayerId,
    action: input.action,
    payloadFilter: parsePayloadFilter(input.payloadFilter),
    durationSec: parseDurationSec(input.durationSec),
    returnPolicy: parseReturnPolicy(input.returnPolicy),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  validateBindingReferences(binding, pipeline, input.gameId)
  pipeline.eventBindings.push(binding)
  await updateAssetPipeline(pipeline, dataDirOverride)
  return binding
}

export async function updateBinding(
  bindingId: string,
  patch: Partial<
    Pick<EventBinding, 'eventId' | 'targetLayerId' | 'action' | 'durationSec' | 'returnPolicy'>
  > & {
    gameId?: string
    payloadFilter?: Record<string, string | number | boolean> | string | null
  },
  dataDirOverride?: string
): Promise<EventBinding> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureEventArrays(pipeline)
  const index = pipeline.eventBindings.findIndex((b) => b.id === bindingId)
  if (index < 0) {
    throw new Error(`Binding not found: ${bindingId}`)
  }
  const existing = pipeline.eventBindings[index]
  const next: EventBinding = {
    ...existing,
    eventId: patch.eventId ?? existing.eventId,
    targetLayerId:
      (patch.action ?? existing.action).type === 'playSfx'
        ? undefined
        : patch.targetLayerId ?? existing.targetLayerId,
    action: patch.action ?? existing.action,
    payloadFilter:
      patch.payloadFilter === null || patch.payloadFilter === ''
        ? undefined
        : patch.payloadFilter !== undefined
          ? parsePayloadFilter(patch.payloadFilter)
          : existing.payloadFilter,
    durationSec:
      patch.durationSec !== undefined ? parseDurationSec(patch.durationSec) : existing.durationSec,
    returnPolicy:
      patch.returnPolicy !== undefined ? parseReturnPolicy(patch.returnPolicy) : existing.returnPolicy,
    updatedAt: nowIso()
  }
  validateBindingReferences(next, pipeline, patch.gameId)
  pipeline.eventBindings[index] = next
  await updateAssetPipeline(pipeline, dataDirOverride)
  return next
}

export async function removeBinding(
  bindingId: string,
  dataDirOverride?: string
): Promise<void> {
  const pipeline = await getAssetPipeline(dataDirOverride)
  ensureEventArrays(pipeline)
  const exists = pipeline.eventBindings.some((b) => b.id === bindingId)
  if (!exists) {
    throw new Error(`Binding not found: ${bindingId}`)
  }
  pipeline.eventBindings = pipeline.eventBindings.filter((b) => b.id !== bindingId)
  await updateAssetPipeline(pipeline, dataDirOverride)
}

export function purgeBindingsForShots(
  pipeline: { eventBindings?: EventBinding[] },
  shotIds: string[]
): number {
  if (!pipeline.eventBindings) pipeline.eventBindings = []
  const before = pipeline.eventBindings.length
  const idSet = new Set(shotIds)
  pipeline.eventBindings = pipeline.eventBindings.filter((b) => !idSet.has(b.shotId))
  return before - pipeline.eventBindings.length
}

export function purgeBindingsForLayers(
  pipeline: { eventBindings?: EventBinding[] },
  layerIds: string[]
): number {
  const before = (pipeline.eventBindings || []).length
  const idSet = new Set(layerIds)
  pipeline.eventBindings = (pipeline.eventBindings || []).filter(
    (b) => !b.targetLayerId || !idSet.has(b.targetLayerId)
  )
  return before - pipeline.eventBindings.length
}
