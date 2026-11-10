/**
 * Event cue forward-play crossings + preview fire (no authored mutation).
 * Run: npx tsx src/shared/storyboard/eventCuePlayback.test.ts
 */

import { collectEventCueCrossings } from './eventCuePlayback'
import { EventPreviewEngine } from './eventPreview'
import {
  applyEventSfxPlayback,
  cancelEventSfxVoices,
  type EventSfxVoice
} from './eventSfxPlayback'
import type { AudioElementLike } from './audioPlayback'
import type { EventBinding, EventDefinition } from '../types/assetPipeline'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

const cues = [
  { id: 'c1', t: 1, eventId: 'evt-touch' },
  { id: 'c2', t: 2, eventId: 'evt-touch' },
  { id: 'c-same-a', t: 1.5, eventId: 'evt-a' },
  { id: 'c-same-b', t: 1.5, eventId: 'evt-b' }
]

const play = { transport: 'playing' as const, shotDurationSec: 3 }

function ids(
  prev: number | undefined,
  now: number,
  extra?: { transport?: 'playing' | 'paused' | 'stopped'; scrubbing?: boolean }
) {
  return collectEventCueCrossings(cues, prev, now, {
    ...play,
    ...extra
  }).map((c) => c.id)
}

function testForwardOnce(): void {
  assert(ids(undefined, 1.1).length === 0, 'no previousTime is seek-into, no fire')
  assert(ids(0, 0.5).length === 0, 'before first cue')
  assert(JSON.stringify(ids(0.9, 1.05)) === JSON.stringify(['c1']), 'cross 1s once')
  assert(ids(1.05, 1.2).length === 0, 'already past, no repeat')
  assert(JSON.stringify(ids(1.9, 2.1)) === JSON.stringify(['c2']), 'cross 2s')
  console.log('✓ forward play fires once per crossing')
}

function testPauseReverseSeek(): void {
  assert(ids(0.9, 1.1, { transport: 'paused' }).length === 0, 'paused no fire')
  assert(ids(0.9, 1.1, { transport: 'stopped' }).length === 0, 'stopped no fire')
  assert(ids(0.9, 1.1, { scrubbing: true }).length === 0, 'playhead scrub no fire')
  assert(ids(2, 0.5).length === 0, 'reverse scrub no fire')
  assert(ids(0.2, 2.5, { transport: 'paused' }).length === 0, 'seek-into while paused no burst')
  console.log('✓ pause / reverse / seek-into / scrub do not fire')
}

function testLoopWrapRearms(): void {
  const firstPass = ids(0.95, 1.1)
  assert(firstPass.includes('c1'), 'first pass fires')
  const wrap = collectEventCueCrossings(cues, 2.95, 0.02, play)
  assert(wrap.length === 0, 'wrap re-arms without reverse-sweep fire')
  const secondPass = ids(0.02, 1.1)
  assert(secondPass.includes('c1'), 'loop wrap re-arms; second pass fires again')
  console.log('✓ loop wrap re-arms; no reverse burst')
}

function testMultipleAtSameTime(): void {
  const hit = collectEventCueCrossings(cues, 1.4, 1.55, play)
  const ev = hit.map((c) => c.eventId).sort()
  assert(ev[0] === 'evt-a' && ev[1] === 'evt-b', 'two cues at the same t both fire')
  console.log('✓ multiple cues at the same time all fire')
}

class FakeAudio implements AudioElementLike {
  paused = true
  currentTime = 0
  volume = 1
  src = ''
  playCalls = 0
  play(): Promise<void> {
    this.playCalls += 1
    this.paused = false
    return Promise.resolve()
  }
  pause(): void {
    this.paused = true
  }
}

function testLifecycleWithPreviewAndSfx(): void {
  const now = '2026-01-01T00:00:00.000Z'
  const events: EventDefinition[] = [
    {
      id: 'evt-touch',
      gameId: 'game-a',
      name: 'button_touch',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    }
  ]
  const bindings: EventBinding[] = [
    {
      id: 'bind-pose',
      shotId: 'shot-a',
      eventId: 'evt-touch',
      targetLayerId: 'layer-btn',
      action: { type: 'setState', stateId: 'state-press' },
      durationSec: 0.5,
      returnPolicy: 'default',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'bind-sfx',
      shotId: 'shot-a',
      eventId: 'evt-touch',
      action: { type: 'playSfx', audioId: 'aud-beep', volume: 1 },
      durationSec: 0,
      returnPolicy: 'default',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    }
  ]
  const authored = {
    id: 'layer-btn',
    assetStateId: 'state-idle',
    eventCues: [{ id: 'c1', t: 1, eventId: 'evt-touch' }]
  }
  const before = JSON.stringify(authored)
  const engine = new EventPreviewEngine()
  engine.setCatalog(events, bindings)
  engine.setShot('shot-a')
  const el = new FakeAudio()
  const voices = new Map<string, EventSfxVoice>([
    [
      'bind-sfx',
      {
        bindingId: 'bind-sfx',
        audioId: 'aud-beep',
        element: el,
        url: 'forge-file://x',
        status: 'ready',
        playGeneration: 0,
        appliedGeneration: 0,
        completedGeneration: -1
      }
    ]
  ])

  const crossed = collectEventCueCrossings(
    authored.eventCues,
    0.9,
    1.05,
    { transport: 'playing', shotDurationSec: 3 }
  )
  assert(crossed.length === 1, 'one cue crossed')
  const fire = engine.fire(crossed[0].eventId, 1000)
  assert(fire.matched === 2 && fire.sfxStarted === 1, 'all bindings: visual + playSfx')
  applyEventSfxPlayback(engine.snapshot(), voices)
  assert(el.playCalls === 1 && !el.paused, 'SFX play()')
  assert(JSON.stringify(authored) === before, 'authored JSON unchanged')

  engine.reset()
  cancelEventSfxVoices(voices)
  assert(el.paused, 'reset/stop cancels event voice')
  assert(engine.snapshot().sfx.length === 0, 'preview sfx cleared')
  assert(JSON.stringify(authored) === before, 'reset does not mutate authored')
  console.log('✓ crossing fires all bindings + SFX; reset cancels; no authored mutation')
}

function main(): void {
  testForwardOnce()
  testPauseReverseSeek()
  testLoopWrapRearms()
  testMultipleAtSameTime()
  testLifecycleWithPreviewAndSfx()
  console.log('\nAll event cue playback tests passed')
}

main()
