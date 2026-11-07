/**
 * A2 playback lifecycle with HTMLAudioElement doubles.
 * Verifies play()/pause() (not paused seeks), reverse silence, drift seek, cleanup.
 * Run: npx tsx src/shared/storyboard/audioPlayback.test.ts
 */

import type { ShotAudioBlock, StoryboardShot } from '../types/assetPipeline'
import {
  applyAudioPlayback,
  disposeAudioVoices,
  evaluateAudioPlayback,
  isReverseScrub,
  silenceAudioVoices,
  tickAudioPlayback,
  type AudioElementLike,
  type AudioVoice
} from './audioPlayback'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

const now = '2026-01-01T00:00:00.000Z'

class FakeAudio implements AudioElementLike {
  paused = true
  currentTime = 0
  volume = 1
  src = ''
  playCalls = 0
  pauseCalls = 0
  rejectPlay = false
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

function block(partial?: Partial<ShotAudioBlock>): ShotAudioBlock {
  return {
    id: 'blk-hit',
    audioId: 'aud-hit',
    role: 'sfx',
    t: 1,
    durationSec: 0.5,
    sourceInSec: 0,
    sourceOutSec: 0.5,
    loop: false,
    volume: 1,
    fadeInSec: 0,
    fadeOutSec: 0,
    schemaVersion: 1,
    ...partial
  }
}

function shot(audioTrack: ShotAudioBlock[], durationSec = 4): StoryboardShot {
  return {
    id: 'shot-a',
    name: 'Shot',
    durationSec,
    aspectRatio: { width: 16, height: 9 },
    layers: [],
    cameraTrack: [],
    effectsTrack: [],
    clipTrack: [],
    audioTrack,
    createdAt: now,
    updatedAt: now
  }
}

function voice(el: FakeAudio, blockId = 'blk-hit'): AudioVoice {
  return {
    blockId,
    audioId: 'aud-hit',
    element: el,
    url: 'forge-file://local/tmp/hit.wav',
    status: 'ready',
    playGeneration: 0
  }
}

function testPausedSeekIsSilent(): void {
  const s = shot([block()])
  const cmds = evaluateAudioPlayback(s, 1.2, { transport: 'paused' })
  assert(cmds[0].active, 'active while paused')
  assert(!cmds[0].audible, 'paused is not audible')
  assert(Math.abs(cmds[0].sourceTimeSec - 0.2) < 1e-9, 'source still evaluated')
  const el = new FakeAudio()
  const voices = new Map([['blk-hit', voice(el)]])
  applyAudioPlayback(cmds, voices)
  assert(el.playCalls === 0, 'paused must not call play()')
  assert(el.paused, 'stays paused')
  assert(Math.abs(el.currentTime - 0.2) < 1e-9, 'silent seek to source')
  console.log('✓ paused currentTime seek is silent (no play())')
}

function testPlayingCallsPlay(): void {
  const s = shot([block()])
  const el = new FakeAudio()
  const voices = new Map([['blk-hit', voice(el)]])
  const r = tickAudioPlayback(s, 1.2, voices, { transport: 'playing' })
  assert(r.played.includes('blk-hit'), 'play() scheduled')
  assert(!el.paused, 'element playing')
  assert(el.playCalls === 1, 'one play')
  assert(el.volume === 1, 'full gain')
  tickAudioPlayback(s, 1.25, voices, { transport: 'playing', previousTimeSec: 1.2 })
  assert(el.playCalls === 1, 'already playing: no extra play()')
  console.log('✓ playing transport calls play() and keeps the voice')
}

function testReverseAndScrubSilent(): void {
  assert(isReverseScrub(1.4, 1.1, 4), 'reverse')
  assert(!isReverseScrub(3.99, 0.01, 4), 'shot loop wrap is not reverse')
  const s = shot([block()])
  const el = new FakeAudio()
  el.paused = false
  el.playCalls = 1
  const voices = new Map([['blk-hit', voice(el)]])
  tickAudioPlayback(s, 1.1, voices, { transport: 'playing', previousTimeSec: 1.4 })
  assert(el.paused, 'reverse pauses')
  assert(el.pauseCalls >= 1, 'pause called')
  el.paused = false
  tickAudioPlayback(s, 1.2, voices, { transport: 'playing', scrubbing: true, previousTimeSec: 1.15 })
  assert(el.paused, 'scrubbing pauses')
  console.log('✓ reverse scrub and pointer scrub stay silent; loop wrap is not reverse')
}

function testStopEndShotChangeCleanup(): void {
  const s = shot([block()])
  const el = new FakeAudio()
  const voices = new Map([['blk-hit', voice(el)]])
  tickAudioPlayback(s, 1.2, voices, { transport: 'playing' })
  assert(!el.paused, 'playing')
  tickAudioPlayback(s, 1.2, voices, { transport: 'stopped', previousTimeSec: 1.2 })
  assert(el.paused, 'stop pauses')
  el.paused = false
  tickAudioPlayback(s, 1.5, voices, { transport: 'playing', previousTimeSec: 1.4 })
  assert(el.paused, 'outside half-open interval pauses')
  el.paused = false
  const paused = silenceAudioVoices(voices)
  assert(paused.includes('blk-hit'), 'silence on shot change')
  disposeAudioVoices(voices)
  assert(voices.size === 0, 'dispose clears')
  assert(el.src === '', 'src cleared')
  console.log('✓ stop / end / shot-change / dispose silence voices')
}

function testOverlapSfxTwoVoices(): void {
  const a = block({ id: 'a', t: 1, durationSec: 0.5 })
  const b = block({ id: 'b', t: 1.1, durationSec: 0.5 })
  const s = shot([a, b])
  const elA = new FakeAudio()
  const elB = new FakeAudio()
  const voices = new Map([
    ['a', voice(elA, 'a')],
    ['b', voice(elB, 'b')]
  ])
  tickAudioPlayback(s, 1.2, voices, { transport: 'playing' })
  assert(!elA.paused && !elB.paused, 'overlapping SFX both play')
  console.log('✓ overlapping SFX use independent voices')
}

function testEvaluateDoesNotMutate(): void {
  const s = shot([block()])
  const before = JSON.stringify(s.audioTrack)
  evaluateAudioPlayback(s, 1.2, { transport: 'playing' })
  evaluateAudioPlayback(s, 0, { transport: 'stopped' })
  assert(JSON.stringify(s.audioTrack) === before, 'evaluate does not mutate authored track')
  console.log('✓ playback evaluation does not mutate authored timeline')
}

async function main(): Promise<void> {
  testPausedSeekIsSilent()
  testPlayingCallsPlay()
  testReverseAndScrubSilent()
  testStopEndShotChangeCleanup()
  testOverlapSfxTwoVoices()
  testEvaluateDoesNotMutate()
  const faded = block({ fadeInSec: 0.5, durationSec: 0.5, volume: 1 })
  const s = shot([faded])
  const el = new FakeAudio()
  const voices = new Map([['blk-hit', voice(el)]])
  tickAudioPlayback(s, 1.25, voices, { transport: 'playing' })
  assert(Math.abs(el.volume - 0.5) < 1e-9, `fade gain applied, got ${el.volume}`)
  assert(Math.abs(el.currentTime - 0.25) < 1e-9, 'drift seek on play')
  const bad = new FakeAudio()
  bad.rejectPlay = true
  const rejected: string[] = []
  const voices2 = new Map([['blk-hit', voice(bad)]])
  tickAudioPlayback(s, 1.2, voices2, {
    transport: 'playing',
    onPlayRejected: (id) => rejected.push(id)
  })
  await Promise.resolve()
  await Promise.resolve()
  assert(rejected.includes('blk-hit'), 'play() rejection surfaced')
  assert(voices2.get('blk-hit')?.status === 'error', 'voice marked error')
  console.log('✓ drift seek + fade gain + rejected play()')
  console.log('\nAll A2 audio playback lifecycle tests passed')
}

void main()
