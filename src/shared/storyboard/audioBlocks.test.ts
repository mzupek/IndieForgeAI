/**
 * A2 audio-block timing: half-open, loop wrap, fade, overlap, shrink/extend.
 * Pure functions — no HTMLAudioElement.
 * Run: npx tsx src/shared/storyboard/audioBlocks.test.ts
 */

import type {
  AssetPipelineProject,
  AudioAsset,
  ShotAudioBlock,
  StoryboardShot
} from '../types/assetPipeline'
import {
  assertShotDurationFitsAudioBlocks,
  fadeGainForAudioBlock,
  isAudioBlockActive,
  sampleAudioBlocks,
  sourceTimeForAudioBlock,
  validateShotAudioBlock
} from './audioBlocks'

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

const hit: AudioAsset = {
  id: 'aud-hit',
  gameId: 'game-a',
  name: 'Hit',
  kind: 'sfx',
  tags: [],
  file: '/data/audio/hit/audio.wav',
  durationSec: 0.5,
  schemaVersion: 1,
  createdAt: now,
  updatedAt: now
}

const bed: AudioAsset = {
  id: 'aud-bed',
  gameId: 'game-a',
  name: 'Bed',
  kind: 'music',
  tags: [],
  file: '/data/audio/bed/audio.ogg',
  durationSec: 0.5,
  schemaVersion: 1,
  createdAt: now,
  updatedAt: now
}

const otherGame: AudioAsset = {
  id: 'aud-other',
  gameId: 'game-b',
  name: 'Other',
  kind: 'sfx',
  tags: [],
  file: '/data/audio/other/audio.wav',
  durationSec: 0.5,
  schemaVersion: 1,
  createdAt: now,
  updatedAt: now
}

function block(partial: Partial<ShotAudioBlock> & Pick<ShotAudioBlock, 'id'>): ShotAudioBlock {
  return {
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

function shot(partial?: Partial<StoryboardShot>): StoryboardShot {
  return {
    id: 'shot-a',
    name: 'Shot',
    durationSec: 4,
    aspectRatio: { width: 16, height: 9 },
    layers: [],
    cameraTrack: [],
    effectsTrack: [],
    clipTrack: [],
    audioTrack: [],
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

const pipeline = {
  storyboardShots: [shot()],
  storyboards: [
    { id: 'sb', gameId: 'game-a', name: 'B', shotIds: ['shot-a'], createdAt: now, updatedAt: now }
  ],
  audioAssets: [hit, bed, otherGame],
  characters: [],
  clips: []
} as unknown as AssetPipelineProject

function testHalfOpen(): void {
  const b = block({ id: 'b1', t: 1, durationSec: 0.5 })
  assert(!isAudioBlockActive(b, 0.999), 'before')
  assert(isAudioBlockActive(b, 1.0), 'at start')
  assert(isAudioBlockActive(b, 1.25), 'during')
  assert(isAudioBlockActive(b, 1.499), 'just before end')
  assert(!isAudioBlockActive(b, 1.5), 'at end exclusive')
  assert(!isAudioBlockActive(b, 2), 'after')
  const s = shot({ audioTrack: [b] })
  assert(sampleAudioBlocks(s, 0.5).length === 0, 'silence before')
  assert(sampleAudioBlocks(s, 1.1).length === 1, 'active')
  assert(sampleAudioBlocks(s, 1.5).length === 0, 'silence after')
  console.log('✓ half-open interval; silence outside')
}

function testSourceAndLoop(): void {
  const oneShot = block({ id: 'noloop', t: 1, durationSec: 0.5, sourceInSec: 0, sourceOutSec: 0.5 })
  assert(Math.abs(sourceTimeForAudioBlock(oneShot, 1.2) - 0.2) < 1e-9, '1x source')
  assert(sourceTimeForAudioBlock(oneShot, 0.5) === 0, 'before clamps to in')
  const looped = block({
    id: 'loop',
    audioId: 'aud-bed',
    role: 'music',
    t: 0,
    durationSec: 1.5,
    sourceInSec: 0,
    sourceOutSec: 0.5,
    loop: true
  })
  assert(Math.abs(sourceTimeForAudioBlock(looped, 0.2) - 0.2) < 1e-9, 'first pass')
  assert(Math.abs(sourceTimeForAudioBlock(looped, 0.5) - 0) < 1e-9, 'wrap at trim')
  assert(Math.abs(sourceTimeForAudioBlock(looped, 1.1) - 0.1) < 1e-9, 'second wrap')
  const reverse = sourceTimeForAudioBlock(looped, -0.1)
  assert(Math.abs(reverse - 0.4) < 1e-9, `reverse wrap maps deterministically, got ${reverse}`)
  console.log('✓ 1x source; loop wraps trim; reverse position deterministic')
}

function testFade(): void {
  const b = block({
    id: 'fade',
    t: 0,
    durationSec: 1,
    sourceInSec: 0,
    sourceOutSec: 1,
    volume: 0.8,
    fadeInSec: 0.2,
    fadeOutSec: 0.2
  })
  assert(Math.abs(fadeGainForAudioBlock(b, 0) - 0) < 1e-9, 'fade in at start')
  assert(Math.abs(fadeGainForAudioBlock(b, 0.1) - 0.4) < 1e-9, 'mid fade in')
  assert(Math.abs(fadeGainForAudioBlock(b, 0.5) - 0.8) < 1e-9, 'full volume')
  assert(Math.abs(fadeGainForAudioBlock(b, 0.9) - 0.4) < 1e-9, 'mid fade out')
  assert(fadeGainForAudioBlock(b, 1) === 0, 'inactive at end')
  console.log('✓ fade in/out multiply volume')
}

function testOverlapAndScope(): void {
  const musicA = block({
    id: 'm1',
    audioId: 'aud-bed',
    role: 'music',
    t: 0,
    durationSec: 0.5,
    sourceInSec: 0,
    sourceOutSec: 0.5
  })
  const musicB = block({
    id: 'm2',
    audioId: 'aud-bed',
    role: 'music',
    t: 0.25,
    durationSec: 0.5,
    sourceInSec: 0,
    sourceOutSec: 0.5
  })
  const s = shot({ audioTrack: [musicA] })
  assertThrows(
    () => validateShotAudioBlock(musicB, s, pipeline, 'shot-a'),
    'one music bed',
    'music overlap'
  )
  const sfxA = block({ id: 's1', t: 0, durationSec: 0.5 })
  const sfxB = block({ id: 's2', t: 0.1, durationSec: 0.5 })
  const sfxShot = shot({ audioTrack: [sfxA] })
  validateShotAudioBlock(sfxB, sfxShot, pipeline, 'shot-a')
  const wrong = block({ id: 'w', audioId: 'aud-other', t: 0, durationSec: 0.5 })
  assertThrows(
    () => validateShotAudioBlock(wrong, shot(), pipeline, 'shot-a'),
    'belongs to game',
    'wrong game'
  )
  const mismatch = block({
    id: 'mm',
    audioId: 'aud-hit',
    role: 'music',
    t: 0,
    durationSec: 0.5
  })
  assertThrows(
    () => validateShotAudioBlock(mismatch, shot(), pipeline, 'shot-a'),
    'must match library kind',
    'role/kind'
  )
  console.log('✓ music overlap rejected; SFX overlap allowed; game/kind guards')
}

function testExtendShrinkNonLoop(): void {
  const b = block({ id: 'long', t: 1.8, durationSec: 0.5 })
  const s = shot({ durationSec: 2, audioTrack: [] })
  assertThrows(
    () => validateShotAudioBlock(b, s, pipeline, 'shot-a'),
    '--extend-shot',
    'overflow'
  )
  validateShotAudioBlock(b, s, pipeline, 'shot-a', { extendShot: true })
  const withBlock = shot({ durationSec: 2.3, audioTrack: [b] })
  assertThrows(
    () => assertShotDurationFitsAudioBlocks(withBlock, 2.0),
    'audio block ends',
    'shrink'
  )
  const noloopBad = block({ id: 'bad', t: 0, durationSec: 1.0, sourceInSec: 0, sourceOutSec: 0.5, loop: false })
  assertThrows(
    () => validateShotAudioBlock(noloopBad, shot(), pipeline, 'shot-a'),
    'must equal source out-in',
    'non-loop duration'
  )
  const looped = block({
    id: 'loop-ok',
    audioId: 'aud-bed',
    role: 'music',
    t: 0,
    durationSec: 1.5,
    sourceInSec: 0,
    sourceOutSec: 0.5,
    loop: true
  })
  validateShotAudioBlock(looped, shot(), pipeline, 'shot-a')
  console.log('✓ extend required; shrink guarded; non-loop duration matches trim; loop may be longer')
}

function testSampleDoesNotMutate(): void {
  const b = block({ id: 'keep', t: 0.2 })
  const s = shot({ audioTrack: [b] })
  const before = JSON.stringify(s.audioTrack)
  sampleAudioBlocks(s, 0.3)
  sampleAudioBlocks(s, 3)
  assert(JSON.stringify(s.audioTrack) === before, 'sample does not mutate authored track')
  console.log('✓ sampling does not mutate authored timeline')
}

function main(): void {
  testHalfOpen()
  testSourceAndLoop()
  testFade()
  testOverlapAndScope()
  testExtendShrinkNonLoop()
  testSampleDoesNotMutate()
  console.log('\nAll A2 audio block timing tests passed')
}

main()
