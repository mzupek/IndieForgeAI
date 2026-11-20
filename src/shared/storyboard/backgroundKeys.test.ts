/**
 * Timed still-background keys: step/hold sample, static t=0 default, validation.
 * Run: npx tsx src/shared/storyboard/backgroundKeys.test.ts
 */

import type { AssetPipelineProject, ShotBackgroundKey, StoryboardShot } from '../types/assetPipeline'
import {
  collectShotBackgroundStillPaths,
  resolveShotBackgroundAtTime,
  sampleBackgroundKey,
  validateBackgroundKey
} from './backgroundKeys'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function assertThrows(fn: () => void, match: string, message: string): void {
  try {
    fn()
    throw new Error(`Assertion failed: ${message} (no throw)`)
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    if (text.startsWith('Assertion failed:')) throw err
    if (!text.includes(match)) {
      throw new Error(`Assertion failed: ${message} (got: ${text})`)
    }
  }
}

const now = '2026-01-01T00:00:00.000Z'

function key(partial: Partial<ShotBackgroundKey> & Pick<ShotBackgroundKey, 'id' | 't'>): ShotBackgroundKey {
  return { schemaVersion: 1, ...partial }
}

function shot(partial?: Partial<StoryboardShot>): StoryboardShot {
  return {
    id: 'shot-a',
    name: 'Establish',
    durationSec: 4,
    aspectRatio: { width: 16, height: 9 },
    layers: [],
    cameraTrack: [],
    effectsTrack: [],
    backgroundImage: 'backgrounds/static.png',
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

function pipeline(s: StoryboardShot): AssetPipelineProject {
  return {
    schemaVersion: 1,
    id: 'proj',
    name: 'Proj',
    description: '',
    games: [{ id: 'game-a', name: 'Game', engine: 'unity', exportRoot: './exports', createdAt: now, updatedAt: now }],
    characters: [],
    poses: [],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [{ id: 'sb-a', gameId: 'game-a', name: 'SB', shotIds: [s.id], createdAt: now, updatedAt: now }],
    storyboardShots: [s],
    visualAssets: [
      {
        id: 'logo',
        gameId: 'game-a',
        name: 'Logo',
        category: 'logo',
        tags: [],
        defaultStateId: null,
        image: '/tmp/assets/logo/image.png',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
    assetStates: [],
    exportProfiles: []
  }
}

function testOldShotsHaveNoKeys(): void {
  const s = shot({ backgroundKeys: undefined })
  assert(sampleBackgroundKey(s, 0) === null, 'missing array samples as no key')
  assert(sampleBackgroundKey(s, 2) === null, 'mid-shot without keys uses static')
  const resolved = resolveShotBackgroundAtTime(s, pipeline(s), 1.5)
  assert(resolved.path === 'backgrounds/static.png', 'static still at t>0 when no keys')
  assert(!resolved.keyId, 'no key id when using static')
  console.log('✓ old shots without backgroundKeys load unchanged')
}

function testStepHoldAndPreload(): void {
  const k1 = key({
    id: 'k1',
    t: 1,
    backgroundVisualAssetId: 'logo'
  })
  const k2 = key({
    id: 'k2',
    t: 2.5,
    backgroundImage: 'backgrounds/cut.png'
  })
  const s = shot({ backgroundKeys: [k2, k1] })
  assert(sampleBackgroundKey(s, 0) === null, 'before first key → static')
  assert(sampleBackgroundKey(s, 0.99)?.id !== 'k1' || sampleBackgroundKey(s, 0.99) === null, 'just before first')
  assert(sampleBackgroundKey(s, 1)?.id === 'k1', 'at first key holds k1')
  assert(sampleBackgroundKey(s, 2)?.id === 'k1', 'until next key holds k1')
  assert(sampleBackgroundKey(s, 2.5)?.id === 'k2', 'at second key cuts to k2')
  assert(sampleBackgroundKey(s, 4)?.id === 'k2', 'holds through end')

  const pipe = pipeline(s)
  assert(resolveShotBackgroundAtTime(s, pipe, 0.2).path === 'backgrounds/static.png', 't=0 static path')
  assert(resolveShotBackgroundAtTime(s, pipe, 1.2).path === '/tmp/assets/logo/image.png', 'key 1 library path')
  assert(resolveShotBackgroundAtTime(s, pipe, 3).path === 'backgrounds/cut.png', 'key 2 image path')
  const paths = collectShotBackgroundStillPaths(s, pipe)
  assert(paths.includes('backgrounds/static.png'), 'preload includes static')
  assert(paths.includes('/tmp/assets/logo/image.png'), 'preload includes key 1')
  assert(paths.includes('backgrounds/cut.png'), 'preload includes key 2')
  console.log('✓ step/hold sample; static is t=0 default; unique paths collected for preload')
}

function testValidation(): void {
  const s = shot()
  const pipe = pipeline(s)
  assertThrows(
    () => validateBackgroundKey({ t: 9, backgroundImage: 'backgrounds/x.png' }, pipe, 'shot-a'),
    'after shot duration',
    'time past duration'
  )
  assertThrows(
    () => validateBackgroundKey({ t: 1 }, pipe, 'shot-a'),
    'requires',
    'missing still'
  )
  assertThrows(
    () =>
      validateBackgroundKey(
        { t: 1, backgroundVisualAssetId: 'logo', backgroundImage: 'backgrounds/x.png' },
        pipe,
        'shot-a'
      ),
    'not both',
    'asset and image together'
  )
  validateBackgroundKey({ t: 0, backgroundVisualAssetId: 'logo' }, pipe, 'shot-a')
  validateBackgroundKey({ t: 4, backgroundImage: 'backgrounds/x.png' }, pipe, 'shot-a')
  console.log('✓ key validation: time, require still, exclusive asset/image')
}

function main(): void {
  testOldShotsHaveNoKeys()
  testStepHoldAndPreload()
  testValidation()
  console.log('\nAll background key tests passed')
}

main()
