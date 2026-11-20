/**
 * A3 event SFX mixer lifecycle with HTMLAudioElement doubles.
 * Run: npx tsx src/shared/storyboard/eventSfxPlayback.test.ts
 */

import type { EventPreviewSnapshot } from './eventPreview'
import {
  applyEventSfxPlayback,
  cancelEventSfxVoices,
  disposeEventSfxVoices,
  markEventSfxEnded,
  type EventSfxVoice
} from './eventSfxPlayback'
import type { AudioElementLike } from './audioPlayback'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

class FakeAudio implements AudioElementLike {
  paused = true
  currentTime = 0
  volume = 1
  src = ''
  playCalls = 0
  pauseCalls = 0
  rejectPlay = false
  delayedReject: { error: Error; generationAtPlay: number } | null = null
  play(): Promise<void> {
    this.playCalls += 1
    if (this.rejectPlay) {
      return Promise.reject(Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' }))
    }
    this.paused = false
    return Promise.resolve()
  }
  pause(): void {
    this.pauseCalls += 1
    this.paused = true
  }
}

function voice(el: FakeAudio, bindingId = 'bind-sfx'): EventSfxVoice {
  return {
    bindingId,
    audioId: 'aud-hit',
    element: el,
    url: 'forge-file://local/tmp/hit.wav',
    status: 'ready',
    playGeneration: 0,
    appliedGeneration: 0,
    completedGeneration: -1
  }
}

function snapshot(sfx: EventPreviewSnapshot['sfx']): EventPreviewSnapshot {
  return { shotId: 'shot-a', generation: 1, overrides: {}, holds: [], sfx }
}

function sfx(partial?: Partial<EventPreviewSnapshot['sfx'][0]>): EventPreviewSnapshot['sfx'][0] {
  return {
    bindingId: 'bind-sfx',
    eventId: 'evt-hit',
    audioId: 'aud-hit',
    volume: 1,
    generation: 1,
    startedAtMs: 0,
    expiresAtMs: null,
    durationSec: 0,
    returnPolicy: 'default',
    stopOnExpiry: false,
    ...partial
  }
}

function testFirePlaysOnce(): void {
  const el = new FakeAudio()
  const voices = new Map([['bind-sfx', voice(el)]])
  applyEventSfxPlayback(snapshot([sfx()]), voices)
  assert(el.playCalls === 1, 'play() on fire')
  assert(!el.paused, 'playing')
  applyEventSfxPlayback(snapshot([sfx()]), voices)
  assert(el.playCalls === 1, 'same generation does not restart')
  console.log('✓ fire plays once; same generation keeps the voice')
}

function testRepeatRestartsAndStalePlayIgnored(): void {
  const el = new FakeAudio()
  const voices = new Map([['bind-sfx', voice(el)]])
  applyEventSfxPlayback(snapshot([sfx({ generation: 1 })]), voices)
  const firstGen = voices.get('bind-sfx')!.playGeneration
  applyEventSfxPlayback(snapshot([sfx({ generation: 2 })]), voices)
  assert(el.playCalls === 2, 'repeat restarts play()')
  assert(el.currentTime === 0, 'restart seeks 0')
  assert(voices.get('bind-sfx')!.playGeneration > firstGen, 'generation token advanced')
  console.log('✓ same-binding repeat cancels and restarts from 0')
}

async function testStalePlayDoesNotResurrect(): Promise<void> {
  const el = new FakeAudio()
  let resolvePlay: (() => void) | undefined
  el.play = () => {
    el.playCalls += 1
    el.paused = false
    return new Promise((resolve, reject) => {
      resolvePlay = () => reject(Object.assign(new Error('late'), { name: 'NotAllowedError' }))
    })
  }
  const voices = new Map([['bind-sfx', voice(el)]])
  const rejected: string[] = []
  applyEventSfxPlayback(snapshot([sfx({ generation: 1 })]), voices, {
    onPlayRejected: (id) => rejected.push(id)
  })
  cancelEventSfxVoices(voices)
  resolvePlay?.()
  await Promise.resolve()
  await Promise.resolve()
  assert(rejected.length === 0, 'stale play() rejection ignored after cancel')
  console.log('✓ stale async play() does not resurrect after cancel')
}

function testOverlapUnrelated(): void {
  const a = new FakeAudio()
  const b = new FakeAudio()
  const voices = new Map([
    ['bind-a', voice(a, 'bind-a')],
    ['bind-b', voice(b, 'bind-b')]
  ])
  applyEventSfxPlayback(
    snapshot([
      sfx({ bindingId: 'bind-a', generation: 1 }),
      sfx({ bindingId: 'bind-b', generation: 2, audioId: 'aud-whoosh' })
    ]),
    voices
  )
  assert(!a.paused && !b.paused, 'unrelated voices overlap')
  applyEventSfxPlayback(
    snapshot([
      sfx({ bindingId: 'bind-a', generation: 3 }),
      sfx({ bindingId: 'bind-b', generation: 2, audioId: 'aud-whoosh' })
    ]),
    voices
  )
  assert(a.playCalls === 2, 'repeat restarts only that binding')
  assert(b.playCalls === 1, 'unrelated voice not restarted')
  assert(!b.paused, 'unrelated voice still playing')
  console.log('✓ unrelated event SFX voices overlap; repeat does not cancel others')
}

function testExpiryResetDispose(): void {
  const el = new FakeAudio()
  const voices = new Map([['bind-sfx', voice(el)]])
  applyEventSfxPlayback(snapshot([sfx()]), voices)
  applyEventSfxPlayback(snapshot([]), voices)
  assert(el.paused, 'removed from snapshot pauses')
  el.paused = false
  cancelEventSfxVoices(voices)
  assert(el.paused, 'reset/stop pauses')
  disposeEventSfxVoices(voices)
  assert(voices.size === 0, 'dispose clears')
  assert(el.src === '', 'src cleared')
  console.log('✓ expiry / reset / dispose cancel event voices')
}

function testEndedDoesNotLoop(): void {
  const el = new FakeAudio()
  const v = voice(el)
  const voices = new Map([['bind-sfx', v]])
  applyEventSfxPlayback(snapshot([sfx({ generation: 3 })]), voices)
  markEventSfxEnded(v)
  assert(el.paused, 'ended pauses')
  applyEventSfxPlayback(snapshot([sfx({ generation: 3 })]), voices)
  assert(el.playCalls === 1, 'ended does not loop or replay same generation')
  console.log('✓ ended file does not implicitly loop')
}

function testDoesNotMutateSnapshot(): void {
  const snap = snapshot([sfx()])
  const before = JSON.stringify(snap)
  const voices = new Map([['bind-sfx', voice(new FakeAudio())]])
  applyEventSfxPlayback(snap, voices)
  assert(JSON.stringify(snap) === before, 'mixer does not mutate snapshot')
  console.log('✓ mixer does not mutate preview snapshot')
}

async function main(): Promise<void> {
  testFirePlaysOnce()
  testRepeatRestartsAndStalePlayIgnored()
  await testStalePlayDoesNotResurrect()
  testOverlapUnrelated()
  testExpiryResetDispose()
  testEndedDoesNotLoop()
  testDoesNotMutateSnapshot()
  const bad = new FakeAudio()
  bad.rejectPlay = true
  const rejected: string[] = []
  const voices = new Map([['bind-sfx', voice(bad)]])
  applyEventSfxPlayback(snapshot([sfx()]), voices, {
    onPlayRejected: (id) => rejected.push(id)
  })
  await Promise.resolve()
  await Promise.resolve()
  assert(rejected.includes('bind-sfx'), 'play() rejection surfaced')
  assert(voices.get('bind-sfx')?.status === 'error', 'voice marked error')
  console.log('✓ rejected play() surfaced')
  console.log('\nAll A3 event SFX playback tests passed')
}

void main()
