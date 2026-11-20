/**
 * P3 preview engine: dispatch, hold/return, repeat interrupt, reset, shot change.
 * Run: npx tsx src/shared/storyboard/eventPreview.test.ts
 */

import type { EventBinding, EventDefinition, StoryboardLayer } from '../types/assetPipeline'
import {
  applyLayerPreview,
  EventPreviewEngine,
  payloadMatchesFilter,
  simulateEventFire
} from './eventPreview'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

const now = '2026-01-01T00:00:00.000Z'

function event(partial: Partial<EventDefinition> & Pick<EventDefinition, 'id' | 'name'>): EventDefinition {
  return {
    gameId: 'game-a',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

function binding(
  partial: Partial<EventBinding> & Pick<EventBinding, 'id' | 'eventId' | 'action'>
): EventBinding {
  return {
    shotId: 'shot-a',
    durationSec: 0,
    returnPolicy: 'default',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

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
    ...partial
  }
}

const hit = event({ id: 'evt-hit', name: 'hit_received' })
const other = event({ id: 'evt-other', name: 'other_event' })
const hurtBinding = binding({
  id: 'bind-hurt',
  eventId: 'evt-hit',
  targetLayerId: 'layer-hero',
  action: { type: 'setPose', poseId: 'pose-hurt' },
  durationSec: 0.5,
  returnPolicy: 'default'
})

function testFireAppliesOverrideWithoutMutatingLayer() {
  const authored = layer({ id: 'layer-hero', poseId: 'pose-idle' })
  const originalPose = authored.poseId
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit], [hurtBinding])
  engine.setShot('shot-a')
  const result = engine.fire('evt-hit', 0)
  assert(result.matched === 1, 'one binding matched')
  const effective = engine.effectiveLayer(authored)
  assert(effective.poseId === 'pose-hurt', 'preview pose is Hurt')
  assert(authored.poseId === originalPose, 'authored default unchanged')
  assert(effective !== authored, 'preview returns a copy')
  console.log('✓ fire applies override without mutating authored layer')
}

function testTimedReturnToDefault() {
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit], [hurtBinding])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)
  assert(engine.snapshot().overrides['layer-hero']?.poseId === 'pose-hurt', 'held at t=0')
  engine.tick(499)
  assert(engine.snapshot().overrides['layer-hero']?.poseId === 'pose-hurt', 'still held before expiry')
  const changed = engine.tick(500)
  assert(changed === true, 'tick reports expiry')
  assert(engine.snapshot().overrides['layer-hero'] === undefined, 'returned to authored default')
  console.log('✓ timed hold returns to authored default at duration')
}

function testHoldPolicyDoesNotReturn() {
  const holdBind = binding({
    ...hurtBinding,
    id: 'bind-hold',
    durationSec: 0.5,
    returnPolicy: 'hold'
  })
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit], [holdBind])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)
  engine.tick(10_000)
  assert(engine.snapshot().overrides['layer-hero']?.poseId === 'pose-hurt', 'hold stays after duration')
  console.log('✓ hold returnPolicy never auto-returns')
}

function testInstantStaysUntilReset() {
  const instant = binding({
    ...hurtBinding,
    id: 'bind-instant',
    durationSec: 0,
    returnPolicy: 'default'
  })
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit], [instant])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)
  engine.tick(10_000)
  assert(engine.snapshot().overrides['layer-hero']?.poseId === 'pose-hurt', 'instant stays')
  engine.reset()
  assert(Object.keys(engine.snapshot().overrides).length === 0, 'reset clears preview')
  console.log('✓ instant action stays until reset')
}

function testRepeatCancelsOldTimer() {
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit], [hurtBinding])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)
  const firstGen = engine.snapshot().holds[0].generation
  engine.fire('evt-hit', 400)
  const snap = engine.snapshot()
  assert(snap.holds.length === 1, 'one hold per layer')
  assert(snap.holds[0].generation > firstGen, 'generation advanced')
  assert(snap.holds[0].startedAtMs === 400, 'timer restarted at second fire')
  assert(snap.holds[0].expiresAtMs === 900, 'new expiry is 400+500')
  engine.tick(500)
  assert(
    engine.snapshot().overrides['layer-hero']?.poseId === 'pose-hurt',
    'first expiry time does not clear the restarted hold'
  )
  engine.tick(899)
  assert(engine.snapshot().overrides['layer-hero']?.poseId === 'pose-hurt', 'still held at 899')
  engine.tick(900)
  assert(engine.snapshot().overrides['layer-hero'] === undefined, 'returns at restarted expiry')
  console.log('✓ repeat cancels old return timer and restarts deterministically')
}

function testCompetingEventOnSameLayerInterrupts() {
  const idleBind = binding({
    id: 'bind-idle',
    eventId: 'evt-other',
    targetLayerId: 'layer-hero',
    action: { type: 'setPose', poseId: 'pose-idle' },
    durationSec: 1,
    returnPolicy: 'default'
  })
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit, other], [hurtBinding, idleBind])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)
  engine.fire('evt-other', 100)
  assert(engine.snapshot().overrides['layer-hero']?.poseId === 'pose-idle', 'later event wins')
  engine.tick(500)
  assert(engine.snapshot().overrides['layer-hero']?.poseId === 'pose-idle', 'old hurt timer did not win')
  engine.tick(1100)
  assert(engine.snapshot().overrides['layer-hero'] === undefined, 'new timer expired')
  console.log('✓ later event on same layer interrupts previous hold')
}

function testIndependentLayers() {
  const visBind = binding({
    id: 'bind-hide',
    eventId: 'evt-hit',
    targetLayerId: 'layer-fx',
    action: { type: 'setVisibility', visible: false },
    durationSec: 0.2,
    returnPolicy: 'default'
  })
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit], [hurtBinding, visBind])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)
  const snap = engine.snapshot()
  assert(snap.overrides['layer-hero']?.poseId === 'pose-hurt', 'hero pose')
  assert(snap.overrides['layer-fx']?.visible === false, 'fx hidden')
  engine.tick(200)
  assert(engine.snapshot().overrides['layer-fx'] === undefined, 'fx returned')
  assert(engine.snapshot().overrides['layer-hero']?.poseId === 'pose-hurt', 'hero still held')
  console.log('✓ two layers keep independent holds')
}

function testPayloadFilter() {
  const filtered = binding({
    ...hurtBinding,
    id: 'bind-filter',
    payloadFilter: { source: 'player' }
  })
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit], [filtered])
  engine.setShot('shot-a')
  const skip = engine.fire('evt-hit', 0, { source: 'enemy' })
  assert(skip.matched === 0 && skip.skippedFilter === 1, 'filter mismatch skipped')
  const hitOk = engine.fire('evt-hit', 0, { source: 'player' })
  assert(hitOk.matched === 1, 'filter match applied')
  console.log('✓ payload filter primitive equality')
}

function testShotChangeResets() {
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit], [hurtBinding])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)
  engine.setShot('shot-b')
  assert(Object.keys(engine.snapshot().overrides).length === 0, 'shot change clears preview')
  const otherShotBind = binding({
    ...hurtBinding,
    id: 'bind-b',
    shotId: 'shot-b'
  })
  engine.setCatalog([hit], [hurtBinding, otherShotBind])
  engine.setShot('shot-a')
  const r = engine.fire('evt-hit', 0)
  assert(r.matched === 1 && r.skippedWrongShot === 1, 'other-shot binding ignored')
  console.log('✓ shot change resets; wrong-shot bindings ignored')
}

function testSimulateHelperTick() {
  const { snapshot: held } = simulateEventFire({
    events: [hit],
    bindings: [hurtBinding],
    shotId: 'shot-a',
    eventId: 'evt-hit',
    nowMs: 0
  })
  assert(held.overrides['layer-hero']?.poseId === 'pose-hurt', 'simulate holds')
  const { snapshot: after } = simulateEventFire({
    events: [hit],
    bindings: [hurtBinding],
    shotId: 'shot-a',
    eventId: 'evt-hit',
    nowMs: 0,
    tickMs: 500
  })
  assert(after.overrides['layer-hero'] === undefined, 'simulate tick returns')
  console.log('✓ simulateEventFire helper hold then tick')
}

function testApplyLayerPreviewCopy() {
  const authored = layer({ id: 'layer-hero', poseId: 'pose-idle', visible: true, text: 'Hi' })
  const preview = applyLayerPreview(authored, {
    poseId: 'pose-hurt',
    visible: false,
    bindingId: 'b',
    eventId: 'e'
  })
  assert(preview.poseId === 'pose-hurt', 'pose overlay')
  assert(preview.visible === false, 'visibility overlay')
  assert(authored.poseId === 'pose-idle', 'authored pose intact')
  assert(authored.visible === true, 'authored visibility intact')
  assert(preview.text === 'Hi', 'unrelated fields preserved')
  console.log('✓ applyLayerPreview overlays without mutating defaults')
}

function testPayloadMatches() {
  assert(payloadMatchesFilter(undefined, undefined) === true, 'no filter')
  assert(payloadMatchesFilter({ a: 1 }, undefined) === false, 'missing payload')
  assert(payloadMatchesFilter({ a: 1 }, { a: 1, b: 2 }) === true, 'extra keys ok')
  assert(payloadMatchesFilter({ a: 1 }, { a: 2 }) === false, 'mismatch')
  console.log('✓ payloadMatchesFilter')
}

function testPlaySfxWithPoseSameEvent() {
  const authored = layer({ id: 'layer-hero', poseId: 'pose-idle' })
  const sfxBind = binding({
    id: 'bind-sfx',
    eventId: 'evt-hit',
    action: { type: 'playSfx', audioId: 'aud-hit', volume: 0.7 },
    durationSec: 0,
    returnPolicy: 'default'
  })
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit], [hurtBinding, sfxBind])
  engine.setShot('shot-a')
  const before = JSON.stringify(authored)
  const audioTrack = [{ id: 'blk', audioId: 'aud-bed' }]
  const trackBefore = JSON.stringify(audioTrack)
  const result = engine.fire('evt-hit', 0)
  assert(result.matched === 2, 'pose + sfx matched')
  assert(result.sfxStarted === 1, 'one sfx started')
  const snap = engine.snapshot()
  assert(snap.overrides['layer-hero']?.poseId === 'pose-hurt', 'pose override')
  assert(snap.sfx.length === 1, 'sfx in snapshot')
  assert(snap.sfx[0].audioId === 'aud-hit', 'sfx audioId')
  assert(snap.sfx[0].volume === 0.7, 'sfx volume')
  assert(snap.sfx[0].expiresAtMs === null, 'duration 0 does not auto-stop')
  assert(JSON.stringify(authored) === before, 'authored layer JSON unchanged')
  assert(JSON.stringify(audioTrack) === trackBefore, 'audioTrack JSON unchanged')
  const firstGen = snap.sfx[0].generation
  engine.fire('evt-hit', 100)
  const again = engine.snapshot()
  assert(again.sfx.length === 1, 'repeat replaces same binding voice')
  assert(again.sfx[0].generation > firstGen, 'generation advanced (restart)')
  assert(again.sfx[0].startedAtMs === 100, 'restarted clock')
  engine.reset()
  assert(engine.snapshot().sfx.length === 0, 'reset clears sfx')
  assert(JSON.stringify(authored) === before, 'reset does not mutate authored')
  console.log('✓ same event changes pose and sounds; repeat restarts; no authored JSON mutation')
}

function testPlaySfxExpiryHoldAndShotChange() {
  const sfxDefault = binding({
    id: 'bind-sfx-d',
    eventId: 'evt-hit',
    action: { type: 'playSfx', audioId: 'aud-hit' },
    durationSec: 0.2,
    returnPolicy: 'default'
  })
  const sfxHold = binding({
    id: 'bind-sfx-h',
    eventId: 'evt-other',
    action: { type: 'playSfx', audioId: 'aud-hit' },
    durationSec: 0.2,
    returnPolicy: 'hold'
  })
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit, other], [sfxDefault, sfxHold])
  engine.setShot('shot-a')
  engine.fire('evt-hit', 0)
  assert(engine.snapshot().sfx[0].stopOnExpiry === true, 'default stops at expiry')
  engine.tick(199)
  assert(engine.snapshot().sfx.length === 1, 'still playing before expiry')
  engine.tick(200)
  assert(engine.snapshot().sfx.length === 0, 'default expired stops sfx')
  engine.fire('evt-other', 300)
  engine.tick(10_000)
  assert(engine.snapshot().sfx.length === 1, 'hold plays past duration until reset/stop')
  engine.setShot('shot-b')
  assert(engine.snapshot().sfx.length === 0, 'shot change disposes sfx')
  console.log('✓ SFX default expiry, hold-to-completion, shot-change disposal')
}

function testTwoPlaySfxOnSameEventOverlap() {
  const a = binding({
    id: 'bind-sfx-a',
    eventId: 'evt-hit',
    action: { type: 'playSfx', audioId: 'aud-hit' }
  })
  const b = binding({
    id: 'bind-sfx-b',
    eventId: 'evt-hit',
    action: { type: 'playSfx', audioId: 'aud-whoosh' }
  })
  const engine = new EventPreviewEngine()
  engine.setCatalog([hit], [a, b])
  engine.setShot('shot-a')
  const result = engine.fire('evt-hit', 0)
  assert(result.sfxStarted === 2, 'both sfx started')
  const snap = engine.snapshot()
  assert(snap.sfx.length === 2, 'two voices in snapshot')
  assert(snap.sfx.some((s) => s.audioId === 'aud-hit'), 'hit present')
  assert(snap.sfx.some((s) => s.audioId === 'aud-whoosh'), 'whoosh present')
  const firstGens = snap.sfx.map((s) => s.generation).sort((x, y) => x - y)
  engine.fire('evt-hit', 50)
  const again = engine.snapshot()
  assert(again.sfx.length === 2, 'repeat keeps two voices')
  const nextGens = again.sfx.map((s) => s.generation).sort((x, y) => x - y)
  assert(nextGens[0] > firstGens[0] && nextGens[1] > firstGens[1], 'both generations advanced')
  console.log('✓ two playSfx on the same event overlap; repeat restarts each')
}

function testMissingEventThrows() {
  const engine = new EventPreviewEngine()
  engine.setCatalog([], [])
  engine.setShot('shot-a')
  let threw = false
  try {
    engine.fire('missing', 0)
  } catch (err) {
    threw = String(err).includes('Event not found')
  }
  assert(threw, 'missing event throws')
  console.log('✓ missing event is surfaced')
}

function main() {
  testFireAppliesOverrideWithoutMutatingLayer()
  testTimedReturnToDefault()
  testHoldPolicyDoesNotReturn()
  testInstantStaysUntilReset()
  testRepeatCancelsOldTimer()
  testCompetingEventOnSameLayerInterrupts()
  testIndependentLayers()
  testPayloadFilter()
  testShotChangeResets()
  testSimulateHelperTick()
  testApplyLayerPreviewCopy()
  testPayloadMatches()
  testPlaySfxWithPoseSameEvent()
  testPlaySfxExpiryHoldAndShotChange()
  testTwoPlaySfxOnSameEventOverlap()
  testMissingEventThrows()
  console.log('\nAll eventPreview tests passed')
}

main()
