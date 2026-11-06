/**
 * P3 event/binding validation: game scope, wrong-parent, missing refs, in-use.
 * Run: npx tsx src/shared/storyboard/eventValidation.test.ts
 */

import type {
  AssetPipelineProject,
  AssetState,
  Character,
  EventBinding,
  EventDefinition,
  Pose,
  Storyboard,
  StoryboardLayer,
  StoryboardShot,
  VisualAsset
} from '../types/assetPipeline'
import {
  collectEventBindingUsage,
  collectPoseBindingUsage,
  collectStateBindingUsage,
  formatBindingInUseError,
  validateBindingReferences,
  validateEventDefinitionInput
} from './eventValidation'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function assertThrows(fn: () => void, includes: string, message: string): void {
  try {
    fn()
    throw new Error(`${message}: expected throw matching "${includes}"`)
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    if (text.includes('expected throw')) throw err
    assert(text.includes(includes), `${message}: got "${text}"`)
  }
}

const now = '2026-01-01T00:00:00.000Z'

function layer(partial: Partial<StoryboardLayer> & Pick<StoryboardLayer, 'id'>): StoryboardLayer {
  return {
    zOrder: 1,
    visible: true,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    flipX: false,
    opacity: 1,
    ...partial
  }
}

function makePipeline(): AssetPipelineProject {
  const character: Character = {
    id: 'char-a',
    gameId: 'game-a',
    name: 'Hero',
    role: 'player',
    tags: [],
    createdAt: now,
    updatedAt: now
  }
  const idle: Pose = {
    id: 'pose-idle',
    characterId: 'char-a',
    slot: 'ready',
    file: '/tmp/idle.png',
    status: 'approved',
    createdAt: now,
    updatedAt: now
  }
  const hurt: Pose = {
    id: 'pose-hurt',
    characterId: 'char-a',
    slot: 'hurt',
    file: '/tmp/hurt.png',
    status: 'approved',
    createdAt: now,
    updatedAt: now
  }
  const otherPose: Pose = {
    id: 'pose-other',
    characterId: 'char-b',
    slot: 'ready',
    file: '/tmp/other.png',
    status: 'approved',
    createdAt: now,
    updatedAt: now
  }
  const assetA: VisualAsset = {
    id: 'asset-a',
    gameId: 'game-a',
    name: 'Door',
    category: 'prop',
    tags: [],
    defaultStateId: 'state-closed',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const closed: AssetState = {
    id: 'state-closed',
    assetId: 'asset-a',
    name: 'closed',
    file: '/tmp/closed.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const open: AssetState = {
    id: 'state-open',
    assetId: 'asset-a',
    name: 'open',
    file: '/tmp/open.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const foreignState: AssetState = {
    id: 'state-foreign',
    assetId: 'asset-b',
    name: 'x',
    file: '/tmp/x.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const storyboard: Storyboard = {
    id: 'sb-a',
    gameId: 'game-a',
    name: 'Board',
    shotIds: ['shot-a'],
    createdAt: now,
    updatedAt: now
  }
  const shot: StoryboardShot = {
    id: 'shot-a',
    name: 'Shot One',
    durationSec: 4,
    aspectRatio: { width: 16, height: 9 },
    layers: [
      layer({ id: 'layer-hero', characterId: 'char-a', poseId: 'pose-idle' }),
      layer({ id: 'layer-door', visualAssetId: 'asset-a', assetStateId: 'state-closed' }),
      layer({ id: 'layer-text', text: 'Hello' })
    ],
    cameraTrack: [],
    effectsTrack: [],
    createdAt: now,
    updatedAt: now
  }
  const evt: EventDefinition = {
    id: 'evt-hit',
    gameId: 'game-a',
    name: 'hit_received',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const foreignEvt: EventDefinition = {
    id: 'evt-other-game',
    gameId: 'game-b',
    name: 'hit_received',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const bind: EventBinding = {
    id: 'bind-hurt',
    shotId: 'shot-a',
    eventId: 'evt-hit',
    targetLayerId: 'layer-hero',
    action: { type: 'setPose', poseId: 'pose-hurt' },
    durationSec: 0.5,
    returnPolicy: 'default',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }

  return {
    schemaVersion: 1,
    id: 'proj',
    name: 'Test',
    description: '',
    games: [
      { id: 'game-a', name: 'A', engine: 'unity', exportRoot: '.', createdAt: now, updatedAt: now },
      { id: 'game-b', name: 'B', engine: 'godot', exportRoot: '.', createdAt: now, updatedAt: now }
    ],
    characters: [character, { ...character, id: 'char-b', gameId: 'game-b', name: 'Other' }],
    poses: [idle, hurt, otherPose],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [storyboard],
    storyboardShots: [shot],
    exportProfiles: [],
    gameDefinitions: [],
    visualAssets: [assetA],
    assetStates: [closed, open, foreignState],
    fonts: [],
    palettes: [],
    eventDefinitions: [evt, foreignEvt],
    eventBindings: [bind],
    audioAssets: [],
    createdAt: now,
    updatedAt: now
  }
}

function testValidBindings() {
  const pipeline = makePipeline()
  validateBindingReferences(
    {
      shotId: 'shot-a',
      eventId: 'evt-hit',
      targetLayerId: 'layer-hero',
      action: { type: 'setPose', poseId: 'pose-hurt' },
      durationSec: 0.5,
      returnPolicy: 'default'
    },
    pipeline,
    'game-a'
  )
  validateBindingReferences(
    {
      shotId: 'shot-a',
      eventId: 'evt-hit',
      targetLayerId: 'layer-door',
      action: { type: 'setState', stateId: 'state-open' },
      durationSec: 0,
      returnPolicy: 'hold'
    },
    pipeline
  )
  validateBindingReferences(
    {
      shotId: 'shot-a',
      eventId: 'evt-hit',
      targetLayerId: 'layer-text',
      action: { type: 'setText', text: 'Ouch' },
      durationSec: 0,
      returnPolicy: 'default'
    },
    pipeline
  )
  console.log('✓ valid pose/state/text bindings accepted')
}

function testWrongParentAndMissing() {
  const pipeline = makePipeline()
  assertThrows(
    () =>
      validateBindingReferences(
        {
          shotId: 'shot-a',
          eventId: 'evt-hit',
          targetLayerId: 'layer-hero',
          action: { type: 'setPose', poseId: 'pose-other' },
          durationSec: 0,
          returnPolicy: 'default'
        },
        pipeline
      ),
    'belongs to character',
    'wrong-parent pose'
  )
  assertThrows(
    () =>
      validateBindingReferences(
        {
          shotId: 'shot-a',
          eventId: 'evt-hit',
          targetLayerId: 'layer-door',
          action: { type: 'setState', stateId: 'state-foreign' },
          durationSec: 0,
          returnPolicy: 'default'
        },
        pipeline
      ),
    'belongs to asset',
    'wrong-parent state'
  )
  assertThrows(
    () =>
      validateBindingReferences(
        {
          shotId: 'shot-a',
          eventId: 'evt-hit',
          targetLayerId: 'layer-hero',
          action: { type: 'setPose', poseId: 'missing-pose' },
          durationSec: 0,
          returnPolicy: 'default'
        },
        pipeline
      ),
    'Pose not found',
    'missing pose'
  )
  assertThrows(
    () =>
      validateBindingReferences(
        {
          shotId: 'shot-a',
          eventId: 'missing-event',
          targetLayerId: 'layer-hero',
          action: { type: 'setPose', poseId: 'pose-hurt' },
          durationSec: 0,
          returnPolicy: 'default'
        },
        pipeline
      ),
    'Event not found',
    'missing event'
  )
  assertThrows(
    () =>
      validateBindingReferences(
        {
          shotId: 'shot-a',
          eventId: 'evt-other-game',
          targetLayerId: 'layer-hero',
          action: { type: 'setPose', poseId: 'pose-hurt' },
          durationSec: 0,
          returnPolicy: 'default'
        },
        pipeline,
        'game-a'
      ),
    'belongs to game',
    'wrong-game event'
  )
  assertThrows(
    () =>
      validateBindingReferences(
        {
          shotId: 'shot-a',
          eventId: 'evt-hit',
          targetLayerId: 'not-a-layer',
          action: { type: 'setVisibility', visible: false },
          durationSec: 0,
          returnPolicy: 'default'
        },
        pipeline
      ),
    'is not in shot',
    'missing layer'
  )
  console.log('✓ wrong-parent, missing, and wrong-game refs rejected')
}

function testInUseGuards() {
  const pipeline = makePipeline()
  const eventUsage = collectEventBindingUsage(pipeline, 'evt-hit')
  assert(eventUsage.bindingIds.length === 1, 'event in use')
  const poseUsage = collectPoseBindingUsage(pipeline, 'pose-hurt')
  assert(poseUsage.bindingIds.length === 1, 'pose in use')
  const idleUsage = collectPoseBindingUsage(pipeline, 'pose-idle')
  assert(idleUsage.bindingIds.length === 0, 'idle pose not referenced by binding')
  const msg = formatBindingInUseError('event', 'hit_received', eventUsage.labels)
  assert(msg.includes('referenced by 1 event binding'), 'in-use message')
  const stateUsage = collectStateBindingUsage(pipeline, 'state-open')
  assert(stateUsage.bindingIds.length === 0, 'open state unused until bound')
  console.log('✓ in-use collectors for event/pose/state')
}

function testDuplicateEventName() {
  const pipeline = makePipeline()
  assertThrows(
    () => validateEventDefinitionInput(pipeline, { gameId: 'game-a', name: 'hit_received' }),
    'already exists',
    'duplicate name'
  )
  validateEventDefinitionInput(pipeline, { gameId: 'game-b', name: 'door_opened' })
  console.log('✓ event names unique per game, not globally')
}

function testSetPoseOnAssetRejected() {
  const pipeline = makePipeline()
  assertThrows(
    () =>
      validateBindingReferences(
        {
          shotId: 'shot-a',
          eventId: 'evt-hit',
          targetLayerId: 'layer-door',
          action: { type: 'setPose', poseId: 'pose-hurt' },
          durationSec: 0,
          returnPolicy: 'default'
        },
        pipeline
      ),
    'character layer',
    'setPose on asset layer'
  )
  console.log('✓ setPose on non-character layer rejected')
}

function main() {
  testValidBindings()
  testWrongParentAndMissing()
  testInUseGuards()
  testDuplicateEventName()
  testSetPoseOnAssetRejected()
  console.log('\nAll eventValidation tests passed')
}

main()
