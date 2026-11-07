/**
 * Combined shot-duration shrink guards (audio/clips/keys/camera/effects).
 * User-entered duration only — no previous-length history.
 * Run: npx tsx src/shared/storyboard/shotDuration.test.ts
 */

import type { ShotAudioBlock, ShotClipBlock, StoryboardLayer, StoryboardShot } from '../types/assetPipeline'
import { assertShotDurationFitsContent, collectShotDurationBlockers } from './shotDuration'

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

function audio(partial: Partial<ShotAudioBlock> & Pick<ShotAudioBlock, 'id'>): ShotAudioBlock {
  return {
    audioId: 'aud-long',
    role: 'music',
    t: 0,
    durationSec: 22,
    sourceInSec: 0,
    sourceOutSec: 22,
    loop: true,
    volume: 1,
    fadeInSec: 0,
    fadeOutSec: 0,
    schemaVersion: 1,
    ...partial
  }
}

function clip(partial: Partial<ShotClipBlock> & Pick<ShotClipBlock, 'id'>): ShotClipBlock {
  return {
    clipId: 'clip-a',
    role: 'layer',
    layerId: 'layer-hero',
    t: 0,
    durationSec: 4,
    sourceInSec: 0,
    sourceOutSec: 4,
    schemaVersion: 1,
    ...partial
  }
}

function shot(partial?: Partial<StoryboardShot>): StoryboardShot {
  return {
    id: 'shot-a',
    name: 'Shot',
    durationSec: 22,
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

function testAudioAndClipBlockers(): void {
  const s = shot({
    audioTrack: [audio({ id: 'a1' })],
    clipTrack: [clip({ id: 'c1', t: 1, durationSec: 5, sourceOutSec: 5 })]
  })
  const blockers = collectShotDurationBlockers(s, 3)
  assert(blockers.some((b) => b.kind === 'audio' && b.id === 'a1'), 'audio blocker')
  assert(blockers.some((b) => b.kind === 'clip' && b.id === 'c1'), 'clip blocker')
  assertThrows(
    () => assertShotDurationFitsContent(s, 3),
    'an audio block ends at t=',
    'audio listed'
  )
  assertThrows(
    () => assertShotDurationFitsContent(s, 3),
    'a clip block ends at t=',
    'clip listed'
  )
  assertThrows(
    () => assertShotDurationFitsContent(s, 3),
    'does not restore a previous duration from history',
    'no invented history'
  )
  console.log('✓ audio and clip shrink blockers listed; no history restore')
}

function testKeysCameraEffects(): void {
  const s = shot({
    durationSec: 8,
    layers: [
      layer({
        id: 'layer-hero',
        timedKeys: [{ id: 'k1', t: 4.5, action: { type: 'setPose', poseId: 'pose-win' }, schemaVersion: 1 }]
      })
    ],
    cameraTrack: [{ t: 4.2, target: { x: 0.5, y: 0.5 }, zoom: 1 }],
    effectsTrack: [{ t: 3.8, inlineType: 'shake' }]
  })
  const blockers = collectShotDurationBlockers(s, 3)
  assert(blockers.some((b) => b.kind === 'timed-key' && b.id === 'k1'), 'timed key')
  assert(blockers.some((b) => b.kind === 'camera'), 'camera')
  assert(blockers.some((b) => b.kind === 'effect'), 'effect')
  assertThrows(() => assertShotDurationFitsContent(s, 3), 'a timed key exists at t=4.5s', 'key message')
  assertThrows(() => assertShotDurationFitsContent(s, 3), 'camera keyframe at t=4.2s', 'camera message')
  assertThrows(() => assertShotDurationFitsContent(s, 3), 'effect marker at t=3.8s', 'effect message')
  assertShotDurationFitsContent(s, 4.5)
  assertShotDurationFitsContent(s, 8)
  console.log('✓ timed keys, camera, and effects listed; exact-end allowed')
}

function testUserEnteredRecoveryWithoutHistory(): void {
  const accidental = shot({
    durationSec: 22,
    audioTrack: [audio({ id: 'bed', durationSec: 22, sourceOutSec: 22, loop: true })]
  })
  assertThrows(
    () => assertShotDurationFitsContent(accidental, 3),
    'an audio block ends at t=22s',
    'must shorten audio first'
  )
  const shortened = shot({
    durationSec: 22,
    audioTrack: [audio({ id: 'bed', durationSec: 3, sourceOutSec: 22, loop: true })]
  })
  assertShotDurationFitsContent(shortened, 3)
  const withCamera = shot({
    durationSec: 22,
    audioTrack: [audio({ id: 'bed', durationSec: 3, sourceOutSec: 22, loop: true })],
    cameraTrack: [{ t: 5, target: { x: 0.5, y: 0.5 }, zoom: 1.2 }]
  })
  assertThrows(
    () => assertShotDurationFitsContent(withCamera, 3),
    'camera keyframe at t=5s',
    'unrelated camera not silently truncated'
  )
  assertThrows(() => assertShotDurationFitsContent(shot(), 0), 'positive number', 'reject zero')
  console.log('✓ recovery is user-entered: shorten this audio, then duration; unrelated content protected')
}

function main(): void {
  testAudioAndClipBlockers()
  testKeysCameraEffects()
  testUserEnteredRecoveryWithoutHistory()
  console.log('\nAll shot duration shrink-guard tests passed')
}

main()
