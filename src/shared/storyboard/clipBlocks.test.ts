/**
 * Clip-block timing: before/during/after, reverse seek, loop, trim, bounds.
 * Pure functions — no Electron video playback.
 * Run: npx tsx src/shared/storyboard/clipBlocks.test.ts
 */

import type { AssetPipelineProject, Clip, ShotClipBlock, StoryboardShot } from '../types/assetPipeline'
import {
  assertShotDurationFitsClipBlocks,
  clipVisibleInGame,
  implicitClipBlocks,
  isClipBlockActive,
  isSupportedClipMedia,
  sampleClipBlocks,
  sampleLayerClip,
  sourceTimeForBlock,
  unsupportedClipMediaMessage,
  validateShotClipBlock
} from './clipBlocks'

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

const clip: Clip = {
  id: 'clip-intro',
  moment: 'intro',
  file: '/data/clips/clip-intro_clip.mp4',
  durationSec: 1.5,
  tags: [],
  createdAt: now,
  updatedAt: now
}

const otherGameClip: Clip = {
  id: 'clip-other',
  characterId: 'char-other',
  moment: 'hit',
  file: '/data/clips/other.mp4',
  durationSec: 1,
  tags: [],
  createdAt: now,
  updatedAt: now
}

function block(partial: Partial<ShotClipBlock> & Pick<ShotClipBlock, 'id'>): ShotClipBlock {
  return {
    clipId: 'clip-intro',
    role: 'layer',
    layerId: 'layer-clip',
    t: 1,
    durationSec: 1.5,
    sourceInSec: 0,
    sourceOutSec: 1.5,
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
    layers: [
      {
        id: 'layer-clip',
        zOrder: 1,
        clipId: 'clip-intro',
        visible: true,
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        flipX: false,
        opacity: 1
      }
    ],
    cameraTrack: [],
    effectsTrack: [],
    clipTrack: [],
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

const pipeline = {
  storyboardShots: [shot()],
  storyboards: [{ id: 'sb', gameId: 'game-a', name: 'B', shotIds: ['shot-a'], createdAt: now, updatedAt: now }],
  clips: [clip, otherGameClip],
  characters: [
    { id: 'char-a', gameId: 'game-a', name: 'Hero', role: 'player', tags: [], createdAt: now, updatedAt: now },
    { id: 'char-other', gameId: 'game-b', name: 'Other', role: 'player', tags: [], createdAt: now, updatedAt: now }
  ]
} as unknown as AssetPipelineProject

function testHalfOpenInterval() {
  const b = block({ id: 'b1', t: 1, durationSec: 1.5 })
  assert(!isClipBlockActive(b, 0.999), 'before start')
  assert(isClipBlockActive(b, 1.0), 'at start')
  assert(isClipBlockActive(b, 1.75), 'during')
  assert(isClipBlockActive(b, 2.499), 'just before end')
  assert(!isClipBlockActive(b, 2.5), 'at end exclusive')
  assert(!isClipBlockActive(b, 3), 'after')
  console.log('✓ half-open [t, t+duration) before/during/after')
}

function testSourceTimeTrimAndSeek() {
  const b = block({ id: 'b1', t: 1, sourceInSec: 0.2, sourceOutSec: 1.2, durationSec: 1 })
  assert(Math.abs(sourceTimeForBlock(b, 1.0) - 0.2) < 1e-9, 'at block start = source in')
  assert(Math.abs(sourceTimeForBlock(b, 1.5) - 0.7) < 1e-9, 'mid')
  const s = shot({ clipTrack: [b] })
  const forward = [0, 1, 1.5, 2, 2.5].map((t) => sampleLayerClip(s, [clip], 'layer-clip', t)?.sourceTimeSec)
  const reverse = [2.5, 2, 1.5, 1, 0].map((t) => sampleLayerClip(s, [clip], 'layer-clip', t)?.sourceTimeSec)
  assert(forward[0] === undefined, 'before: hidden')
  assert(forward[4] === undefined, 'after: hidden')
  assert(reverse[0] === undefined && reverse[4] === undefined, 'reverse same hide')
  assert(forward[1] === reverse[3], 'seek both directions at t=1')
  assert(forward[2] === reverse[2], 'seek both directions at t=1.5')
  console.log('✓ trim + reverse seek is a function of time')
}

function testLoopWrap() {
  const b = block({ id: 'b1', t: 2, durationSec: 1.5, sourceOutSec: 1.5 })
  const s = shot({ clipTrack: [b] })
  assert(sampleLayerClip(s, [clip], 'layer-clip', 2.5)?.sourceTimeSec !== undefined, 'late in shot')
  assert(sampleLayerClip(s, [clip], 'layer-clip', 0) === undefined, 'loop wrap to t=0 hides (block starts at 2)')
  console.log('✓ loop wrap resamples t=0, does not keep last frame')
}

function testImplicitLegacyPlaysWithoutExtendingShot() {
  const s = shot({ clipTrack: [], durationSec: 1.0 })
  const implicit = implicitClipBlocks(s, [clip])
  assert(implicit.length === 1, 'one implicit layer block')
  assert(implicit[0].durationSec === 1.0, 'clamped to shot, never silent extend')
  const samples = sampleClipBlocks(s, [clip], 0.5)
  assert(samples[0]?.clipId === 'clip-intro', 'implicit plays during shot')
  assert(sampleClipBlocks(s, [clip], 1.0).length === 0, 'hidden at shot end')
  const bgShot = shot({
    backgroundClipId: 'clip-intro',
    layers: [],
    durationSec: 4
  })
  const bg = implicitClipBlocks(bgShot, [clip])
  assert(bg[0].role === 'background', 'legacy backgroundClipId implicit')
  assert(bg[0].durationSec === 1.5, 'uses clip duration when shorter than shot')
  console.log('✓ implicit legacy play; never silent-extend shot')
}

function testExplicitReplacesImplicit() {
  const b = block({ id: 'explicit', t: 2, durationSec: 1.5, sourceOutSec: 1.5 })
  const s = shot({ clipTrack: [b] })
  const implicit = implicitClipBlocks(s, [clip])
  assert(implicit.length === 0, 'explicit layer block suppresses implicit')
  assert(sampleLayerClip(s, [clip], 'layer-clip', 0.5) === undefined, 'before explicit hidden')
  assert(sampleLayerClip(s, [clip], 'layer-clip', 2.1) !== undefined, 'during explicit')
  console.log('✓ explicit block replaces implicit for that target')
}

function testExtendShotRequired() {
  const s = shot({ durationSec: 2, clipTrack: [] })
  const b = block({ id: 'long', t: 1, durationSec: 1.5, sourceOutSec: 1.5 })
  pipeline.storyboardShots = [s]
  assertThrows(
    () => validateShotClipBlock(b, s, pipeline, 'shot-a'),
    '--extend-shot',
    'overflow without flag'
  )
  validateShotClipBlock(b, s, pipeline, 'shot-a', { extendShot: true })
  s.clipTrack = [block({ id: 'ok', t: 0, durationSec: 1.5, sourceOutSec: 1.5 })]
  assertThrows(() => assertShotDurationFitsClipBlocks(s, 1.0), 'clip block ends', 'shrink duration')
  console.log('✓ overflow requires --extend-shot; shrink rejected')
}

function testOverlapAndRefs() {
  const existing = block({ id: 'a', t: 1, durationSec: 1, sourceOutSec: 1 })
  const s = shot({ clipTrack: [existing] })
  pipeline.storyboardShots = [s]
  assertThrows(
    () =>
      validateShotClipBlock(
        block({ id: 'b', t: 1.5, durationSec: 1, sourceOutSec: 1 }),
        s,
        pipeline,
        'shot-a'
      ),
    'overlaps',
    'overlap same layer'
  )
  assertThrows(
    () =>
      validateShotClipBlock(
        block({ id: 'miss', clipId: 'nope', t: 0, durationSec: 0.5, sourceOutSec: 0.5 }),
        s,
        pipeline,
        'shot-a'
      ),
    'Clip not found',
    'missing clip'
  )
  assertThrows(
    () =>
      validateShotClipBlock(
        block({
          id: 'wrong',
          clipId: 'clip-other',
          t: 0,
          durationSec: 1,
          sourceOutSec: 1
        }),
        s,
        pipeline,
        'shot-a'
      ),
    'not in game',
    'wrong-game clip'
  )
  assert(clipVisibleInGame(clip, pipeline, 'game-a'), 'unassigned clip visible in game')
  assert(!clipVisibleInGame(otherGameClip, pipeline, 'game-a'), 'other game hidden')
  console.log('✓ overlap, missing, wrong-game refs')
}

function testUnsupportedMedia() {
  assert(isSupportedClipMedia('a.mp4'), 'mp4')
  assert(isSupportedClipMedia('a.webm'), 'webm')
  assert(isSupportedClipMedia('a.mov'), 'mov listed')
  assert(!isSupportedClipMedia('a.gif'), 'gif unsupported')
  assert(unsupportedClipMediaMessage('a.avi').includes('Unsupported'), 'message')
  console.log('✓ supported media list; unsupported not promised')
}

function testDurationMatchesTrim() {
  const s = shot({ clipTrack: [] })
  pipeline.storyboardShots = [s]
  assertThrows(
    () =>
      validateShotClipBlock(
        block({ id: 'mismatch', t: 0, durationSec: 1, sourceInSec: 0, sourceOutSec: 1.5 }),
        s,
        pipeline,
        'shot-a',
        { extendShot: true }
      ),
    'must equal source out-in',
    'duration mismatch'
  )
  console.log('✓ duration must equal trim window')
}

function main() {
  testHalfOpenInterval()
  testSourceTimeTrimAndSeek()
  testLoopWrap()
  testImplicitLegacyPlaysWithoutExtendingShot()
  testExplicitReplacesImplicit()
  testExtendShotRequired()
  testOverlapAndRefs()
  testUnsupportedMedia()
  testDurationMatchesTrim()
  console.log('\nAll clipBlocks timing tests passed')
}

main()
