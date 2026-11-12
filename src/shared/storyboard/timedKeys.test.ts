/**
 * P4 timed pose/state keys: sampling, reverse scrub, loop, event precedence.
 * Run: npx tsx src/shared/storyboard/timedKeys.test.ts
 */

import type { EventBinding, EventDefinition, StoryboardLayer } from '../types/assetPipeline'
import { EventPreviewEngine, applyLayerPreview } from './eventPreview'
import {
  applyEffectiveLayer,
  applyTimedSample,
  assertShotDurationFitsTimedKeys,
  collectPoseTimedKeyUsage,
  collectStateTimedKeyUsage,
  sampleLayerTimedKeys,
  validateLayerTimedKey,
  validateTimedKeyTime
} from './timedKeys'
import type { AssetPipelineProject, LayerTimedKey } from '../types/assetPipeline'

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
    characterId: 'char-a',
    poseId: 'pose-idle',
    timedKeys: [],
    ...partial
  }
}

function key(
  id: string,
  t: number,
  poseId: string
): LayerTimedKey {
  return { id, t, action: { type: 'setPose', poseId }, schemaVersion: 1 }
}

const hero = layer({
  id: 'layer-hero',
  timedKeys: [
    key('k-ready', 1.0, 'pose-ready'),
    key('k-hurt', 2.0, 'pose-hurt'),
    key('k-win', 3.5, 'pose-win')
  ]
})

function samplePose(t: number): string | undefined {
  return sampleLayerTimedKeys(hero, t)?.poseId
}

function testSamplingBeforeAtBetweenAfter() {
  assert(samplePose(-0.01) === undefined, 'before 0: authored')
  assert(samplePose(0) === undefined, 'at 0 before first key: authored')
  assert(samplePose(0.999) === undefined, 'just before first key: authored')
  assert(samplePose(1.0) === 'pose-ready', 'at first key')
  assert(samplePose(1.5) === 'pose-ready', 'between 1 and 2: hold ready')
  assert(samplePose(1.999) === 'pose-ready', 'just before second key: still ready')
  assert(samplePose(2.0) === 'pose-hurt', 'at second key')
  assert(samplePose(3.0) === 'pose-hurt', 'between 2 and 3.5: hold hurt')
  assert(samplePose(3.5) === 'pose-win', 'at last key')
  assert(samplePose(10) === 'pose-win', 'after last key: hold last')
  console.log('✓ sampling before/at/between/after keys (step/hold)')
}

function testReverseScrubDeterministic() {
  const forward = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4].map((t) => samplePose(t) ?? 'authored')
  const reverse = [4, 3.5, 3, 2, 1.5, 1, 0.5, 0].map((t) => samplePose(t) ?? 'authored')
  assert(forward.join() === 'authored,authored,pose-ready,pose-ready,pose-hurt,pose-hurt,pose-win,pose-win', 'forward')
  assert(reverse.join() === 'pose-win,pose-win,pose-hurt,pose-hurt,pose-ready,pose-ready,authored,authored', 'reverse')
  console.log('✓ reverse scrub uses the same function of time')
}

function testLoopResamplesFromZero() {
  assert(samplePose(3.5) === 'pose-win', 'end of shot')
  assert(samplePose(0) === undefined, 'loop wrap samples t=0 authored, not last key')
  console.log('✓ loop wrap resamples from t=0')
}

function testApplyDoesNotMutateAuthored() {
  const authored = layer({ id: 'layer-hero', poseId: 'pose-idle', timedKeys: [key('k1', 1, 'pose-hurt')] })
  const sampled = applyTimedSample(authored, 1.2)
  assert(sampled.poseId === 'pose-hurt', 'sampled pose')
  assert(authored.poseId === 'pose-idle', 'authored default unchanged')
  assert(sampled !== authored, 'copy')
  console.log('✓ timed sample does not write authored default')
}

function testEventHoldOverridesTimedThenReturnsToCurrentSample() {
  const events: EventDefinition[] = [{
    id: 'evt-hit',
    gameId: 'game-a',
    name: 'hit_received',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }]
  const binding: EventBinding = {
    id: 'bind-hurt',
    shotId: 'shot-a',
    eventId: 'evt-hit',
    targetLayerId: 'layer-hero',
    action: { type: 'setPose', poseId: 'pose-event' },
    durationSec: 0.5,
    returnPolicy: 'default',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const engine = new EventPreviewEngine()
  engine.setCatalog(events, [binding])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)

  // Playhead is at 2.5s (hurt key holds) while event is active
  const during = applyEffectiveLayer(hero, 2.5, engine.snapshot().overrides['layer-hero'])
  assert(during.poseId === 'pose-event', 'event hold beats timed sample')

  engine.tick(500)
  const after = applyEffectiveLayer(hero, 2.5, engine.snapshot().overrides['layer-hero'])
  assert(after.poseId === 'pose-hurt', 'event end uses CURRENT timed sample, not authored idle')
  assert(hero.poseId === 'pose-idle', 'authored still idle')
  console.log('✓ event hold > timed sample; expiry resolves current sample')
}

function testRepeatEventStillInterrupts() {
  const events: EventDefinition[] = [{
    id: 'evt-hit',
    gameId: 'game-a',
    name: 'hit_received',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }]
  const binding: EventBinding = {
    id: 'bind-hurt',
    shotId: 'shot-a',
    eventId: 'evt-hit',
    targetLayerId: 'layer-hero',
    action: { type: 'setPose', poseId: 'pose-event' },
    durationSec: 1,
    returnPolicy: 'default',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const engine = new EventPreviewEngine()
  engine.setCatalog(events, [binding])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)
  engine.fire('evt-hit', 400)
  engine.tick(1000)
  const still = applyEffectiveLayer(hero, 2.0, engine.snapshot().overrides['layer-hero'])
  assert(still.poseId === 'pose-event', 'restarted hold still active at 1000ms')
  engine.tick(1400)
  const done = applyEffectiveLayer(hero, 2.0, engine.snapshot().overrides['layer-hero'])
  assert(done.poseId === 'pose-hurt', 'after restarted expiry, current timed sample')
  console.log('✓ repeat-event cancellation still restarts; then current sample')
}

function testResetClearsHoldKeepsTimedSample() {
  const events: EventDefinition[] = [{
    id: 'evt-hit',
    gameId: 'game-a',
    name: 'hit_received',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }]
  const binding: EventBinding = {
    id: 'bind-hurt',
    shotId: 'shot-a',
    eventId: 'evt-hit',
    targetLayerId: 'layer-hero',
    action: { type: 'setPose', poseId: 'pose-event' },
    durationSec: 5,
    returnPolicy: 'hold',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const engine = new EventPreviewEngine()
  engine.setCatalog(events, [binding])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)
  engine.reset()
  const atTwo = applyEffectiveLayer(hero, 2.0, engine.snapshot().overrides['layer-hero'])
  assert(atTwo.poseId === 'pose-hurt', 'reset clears event; timed sample remains')
  engine.setShot('shot-b')
  const afterShot = applyEffectiveLayer(hero, 2.0, engine.snapshot().overrides['layer-hero'])
  assert(afterShot.poseId === 'pose-hurt', 'shot-change cleared holds; sampling still from layer keys')
  console.log('✓ reset/shot-change clear event holds; timed keys still sample')
}

function testTimeValidation() {
  validateTimedKeyTime(0, 4)
  validateTimedKeyTime(4, 4)
  assertThrows(() => validateTimedKeyTime(-0.01, 4), 'before the shot start', 'negative')
  assertThrows(() => validateTimedKeyTime(4.01, 4), 'after shot duration', 'past end')
  console.log('✓ time boundaries 0..duration')
}

function testDuplicateTimestampRejected() {
  const pipeline = {
    storyboardShots: [{
      id: 'shot-a',
      name: 'Shot',
      durationSec: 4,
      aspectRatio: { width: 16, height: 9 },
      layers: [hero],
      cameraTrack: [],
      effectsTrack: [],
      createdAt: now,
      updatedAt: now
    }],
    storyboards: [{
      id: 'sb',
      gameId: 'game-a',
      name: 'B',
      shotIds: ['shot-a'],
      createdAt: now,
      updatedAt: now
    }],
    poses: [
      { id: 'pose-idle', characterId: 'char-a', slot: 'ready', file: 'x', status: 'approved', createdAt: now, updatedAt: now },
      { id: 'pose-ready', characterId: 'char-a', slot: 'ready', file: 'x', status: 'approved', createdAt: now, updatedAt: now }
    ]
  } as unknown as AssetPipelineProject

  assertThrows(
    () =>
      validateLayerTimedKey(
        { id: 'new', t: 1.0, action: { type: 'setPose', poseId: 'pose-idle' } },
        hero,
        pipeline,
        'shot-a'
      ),
    'already exists at t=1',
    'duplicate t'
  )
  validateLayerTimedKey(
    { id: 'k-ready', t: 1.0, action: { type: 'setPose', poseId: 'pose-idle' } },
    hero,
    pipeline,
    'shot-a',
    { excludeKeyId: 'k-ready' }
  )
  console.log('✓ duplicate timestamps rejected; self-update allowed')
}

function testReferenceValidationAndGuards() {
  const door = layer({
    id: 'layer-door',
    characterId: undefined,
    poseId: undefined,
    visualAssetId: 'asset-door',
    assetStateId: 'state-closed',
    timedKeys: [{ id: 'k-open', t: 1.5, action: { type: 'setState', stateId: 'state-open' }, schemaVersion: 1 }]
  })
  const text = layer({
    id: 'layer-text',
    characterId: undefined,
    poseId: undefined,
    text: 'HP',
    timedKeys: []
  })
  const pipeline = {
    storyboardShots: [{
      id: 'shot-a',
      name: 'Shot',
      durationSec: 4,
      aspectRatio: { width: 16, height: 9 },
      layers: [hero, door, text],
      cameraTrack: [],
      effectsTrack: [],
      createdAt: now,
      updatedAt: now
    }],
    storyboards: [{
      id: 'sb',
      gameId: 'game-a',
      name: 'B',
      shotIds: ['shot-a'],
      createdAt: now,
      updatedAt: now
    }],
    poses: [
      { id: 'pose-idle', characterId: 'char-a', slot: 'ready', file: 'x', status: 'approved', createdAt: now, updatedAt: now },
      { id: 'pose-ready', characterId: 'char-a', slot: 'ready', file: 'x', status: 'approved', createdAt: now, updatedAt: now },
      { id: 'pose-other', characterId: 'char-b', slot: 'hurt', file: 'x', status: 'approved', createdAt: now, updatedAt: now }
    ],
    assetStates: [
      { id: 'state-closed', assetId: 'asset-door', name: 'closed', file: 'x', createdAt: now, updatedAt: now },
      { id: 'state-open', assetId: 'asset-door', name: 'open', file: 'x', createdAt: now, updatedAt: now },
      { id: 'state-crate', assetId: 'asset-crate', name: 'open', file: 'x', createdAt: now, updatedAt: now }
    ]
  } as unknown as AssetPipelineProject

  assertThrows(
    () =>
      validateLayerTimedKey(
        { id: 'bad', t: 0.5, action: { type: 'setPose', poseId: 'pose-other' } },
        hero,
        pipeline,
        'shot-a'
      ),
    "belongs to character 'char-b'",
    'wrong-parent pose'
  )
  assertThrows(
    () =>
      validateLayerTimedKey(
        { id: 'bad', t: 0.5, action: { type: 'setPose', poseId: 'nope' } },
        hero,
        pipeline,
        'shot-a'
      ),
    'Pose not found',
    'missing pose'
  )
  assertThrows(
    () =>
      validateLayerTimedKey(
        { id: 'bad', t: 0.5, action: { type: 'setPose', poseId: 'pose-idle' } },
        text,
        pipeline,
        'shot-a'
      ),
    'character layer',
    'text layer setPose'
  )
  assertThrows(
    () =>
      validateLayerTimedKey(
        { id: 'bad', t: 0.5, action: { type: 'setState', stateId: 'state-crate' } },
        door,
        pipeline,
        'shot-a'
      ),
    "belongs to asset 'asset-crate'",
    'wrong-parent state'
  )
  assertThrows(
    () => assertShotDurationFitsTimedKeys(pipeline.storyboardShots[0], 1.0),
    'timed key exists at t=3.5s',
    'duration shrink'
  )
  assertShotDurationFitsTimedKeys(pipeline.storyboardShots[0], 3.5)
  const poseUsage = collectPoseTimedKeyUsage(pipeline, 'pose-hurt')
  assert(poseUsage.keyIds.includes('k-hurt'), 'hurt pose timed usage')
  const idleUsage = collectPoseTimedKeyUsage(pipeline, 'pose-idle')
  assert(idleUsage.keyIds.length === 0, 'authored idle not a timed ref')
  const stateUsage = collectStateTimedKeyUsage(pipeline, 'state-open')
  assert(stateUsage.keyIds.includes('k-open'), 'open state timed usage')
  const sample = sampleLayerTimedKeys(door, 2)
  assert(sample?.assetStateId === 'state-open', 'state key hold')
  assert(applyTimedSample(door, 0.2).assetStateId === 'state-closed', 'before state key uses authored')
  console.log('✓ reference validation, duration guard, in-use collectors, state sampling')
}

function testPreviewHelperStillSeparatesEventFromTimed() {
  const sampled = applyTimedSample(hero, 2)
  const withEvent = applyLayerPreview(sampled, {
    poseId: 'pose-event',
    bindingId: 'b',
    eventId: 'e'
  })
  assert(withEvent.poseId === 'pose-event', 'event on top of timed')
  assert(sampled.poseId === 'pose-hurt', 'timed unchanged')
  console.log('✓ applyLayerPreview still overlays event on a timed sample copy')
}

function main() {
  testSamplingBeforeAtBetweenAfter()
  testReverseScrubDeterministic()
  testLoopResamplesFromZero()
  testApplyDoesNotMutateAuthored()
  testEventHoldOverridesTimedThenReturnsToCurrentSample()
  testRepeatEventStillInterrupts()
  testResetClearsHoldKeepsTimedSample()
  testTimeValidation()
  testDuplicateTimestampRejected()
  testReferenceValidationAndGuards()
  testPreviewHelperStillSeparatesEventFromTimed()
  console.log('\nAll timedKeys tests passed')
}

main()
