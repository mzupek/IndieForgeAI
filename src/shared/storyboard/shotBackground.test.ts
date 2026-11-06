/**
 * Shot Library / legacy background path selection (no Electron, no production data).
 * Run: npx tsx src/shared/storyboard/shotBackground.test.ts
 */

import type {
  AssetPipelineProject,
  AssetState,
  Storyboard,
  StoryboardShot,
  VisualAsset
} from '../types/assetPipeline'
import { collectAssetLayerUsage, collectAssetStateLayerUsage } from './layerValidation'
import { resolveShotBackgroundImagePath, validateShotBackgroundReferences } from './shotBackground'

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

function shot(partial: Partial<StoryboardShot> & Pick<StoryboardShot, 'id'>): StoryboardShot {
  return {
    name: 'Shot',
    durationSec: 3,
    aspectRatio: { width: 16, height: 9 },
    layers: [],
    cameraTrack: [],
    effectsTrack: [],
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

function makePipeline(): AssetPipelineProject {
  const staticAsset: VisualAsset = {
    id: 'logo',
    gameId: 'game-a',
    name: 'Static Logo',
    category: 'logo',
    tags: [],
    defaultStateId: null,
    image: '/tmp/assets/logo/image.png',
    thumbnail: '/tmp/assets/logo/thumbnail.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const housing: VisualAsset = {
    id: 'housing',
    gameId: 'game-a',
    name: 'Keypad Housing',
    category: 'prop',
    tags: [],
    defaultStateId: 'st-normal',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const otherGame: VisualAsset = {
    id: 'other-logo',
    gameId: 'game-b',
    name: 'Other Logo',
    category: 'logo',
    tags: [],
    defaultStateId: null,
    image: '/tmp/assets/other/image.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const normal: AssetState = {
    id: 'st-normal',
    assetId: 'housing',
    name: 'Normal',
    file: '/tmp/assets/housing/state_normal.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const locked: AssetState = {
    id: 'st-locked',
    assetId: 'housing',
    name: 'Locked',
    file: '/tmp/assets/housing/state_locked.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const orphan: AssetState = {
    id: 'st-orphan',
    assetId: 'other-logo',
    name: 'Idle',
    file: '/tmp/assets/other/idle.png',
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
  return {
    schemaVersion: 1,
    id: 'proj',
    name: 'Test',
    description: '',
    games: [
      { id: 'game-a', name: 'A', engine: 'unity', exportRoot: '.', createdAt: now, updatedAt: now },
      { id: 'game-b', name: 'B', engine: 'godot', exportRoot: '.', createdAt: now, updatedAt: now }
    ],
    characters: [],
    poses: [],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [storyboard],
    storyboardShots: [shot({ id: 'shot-a', name: 'One' })],
    exportProfiles: [],
    gameDefinitions: [],
    visualAssets: [staticAsset, housing, otherGame],
    assetStates: [normal, locked, orphan],
    fonts: [],
    palettes: [],
    eventDefinitions: [],
    eventBindings: [],
    createdAt: now,
    updatedAt: now
  }
}

function testStaticFullResNotThumbnail() {
  const pipeline = makePipeline()
  const s = shot({
    id: 'shot-a',
    backgroundVisualAssetId: 'logo'
  })
  const resolved = resolveShotBackgroundImagePath(s, pipeline)
  assert(resolved.path === '/tmp/assets/logo/image.png', `static uses image.png, got ${resolved.path}`)
  assert(resolved.path !== '/tmp/assets/logo/thumbnail.png', 'thumbnail is not final art')
  validateShotBackgroundReferences(s, pipeline)
  console.log('✓ static Library asset uses full image, not thumbnail')
}

function testDefaultStateFallback() {
  const pipeline = makePipeline()
  const s = shot({
    id: 'shot-a',
    backgroundVisualAssetId: 'housing'
  })
  const resolved = resolveShotBackgroundImagePath(s, pipeline)
  assert(
    resolved.path === '/tmp/assets/housing/state_normal.png',
    `default state.file, got ${resolved.path}`
  )
  validateShotBackgroundReferences(s, pipeline)
  console.log('✓ empty state id falls back to default state.file')
}

function testExplicitState() {
  const pipeline = makePipeline()
  const s = shot({
    id: 'shot-a',
    backgroundVisualAssetId: 'housing',
    backgroundAssetStateId: 'st-locked'
  })
  const resolved = resolveShotBackgroundImagePath(s, pipeline)
  assert(resolved.path === '/tmp/assets/housing/state_locked.png', `explicit Locked, got ${resolved.path}`)
  validateShotBackgroundReferences(s, pipeline)
  console.log('✓ explicit state file is used')
}

function testLegacyBackgroundImage() {
  const pipeline = makePipeline()
  const s = shot({
    id: 'shot-a',
    backgroundImage: 'backgrounds/copied.png'
  })
  const resolved = resolveShotBackgroundImagePath(s, pipeline)
  assert(resolved.path === 'backgrounds/copied.png', `legacy path, got ${resolved.path}`)
  validateShotBackgroundReferences(s, pipeline)
  console.log('✓ legacy backgroundImage path still resolves')
}

function testLibraryPrefersOverLegacyPath() {
  const pipeline = makePipeline()
  const s = shot({
    id: 'shot-a',
    backgroundVisualAssetId: 'logo',
    backgroundImage: 'backgrounds/orphan-external.png'
  })
  const resolved = resolveShotBackgroundImagePath(s, pipeline)
  assert(resolved.path === '/tmp/assets/logo/image.png', 'library asset wins over leftover path')
  console.log('✓ Library asset ref preferred over leftover backgroundImage')
}

function testMissingWrongParentWrongGame() {
  const pipeline = makePipeline()
  const missing = resolveShotBackgroundImagePath(
    shot({ id: 'shot-a', backgroundVisualAssetId: 'nope' }),
    pipeline
  )
  assert(!!missing.error && !missing.path, 'missing asset → error, no path')
  assertThrows(
    () =>
      validateShotBackgroundReferences(
        shot({ id: 'shot-a', backgroundVisualAssetId: 'nope' }),
        pipeline
      ),
    'not found',
    'missing asset'
  )

  const wrongParent = resolveShotBackgroundImagePath(
    shot({
      id: 'shot-a',
      backgroundVisualAssetId: 'housing',
      backgroundAssetStateId: 'st-orphan'
    }),
    pipeline
  )
  assert(!!wrongParent.error && !wrongParent.path, 'wrong-parent state → error')

  const wrongGame = resolveShotBackgroundImagePath(
    shot({ id: 'shot-a', backgroundVisualAssetId: 'other-logo' }),
    pipeline
  )
  assert(!!wrongGame.error && wrongGame.error.includes('belongs to game'), 'wrong-game rejected')
  assertThrows(
    () =>
      validateShotBackgroundReferences(
        shot({ id: 'shot-a', backgroundVisualAssetId: 'other-logo' }),
        pipeline
      ),
    'belongs to game',
    'wrong-game validate'
  )

  const stateOnly = resolveShotBackgroundImagePath(
    shot({ id: 'shot-a', backgroundAssetStateId: 'st-locked' }),
    pipeline
  )
  assert(!!stateOnly.error && stateOnly.error.includes('requires'), 'state without asset')

  const empty = resolveShotBackgroundImagePath(shot({ id: 'shot-a' }), pipeline)
  assert(!empty.path && !empty.error, 'no background is valid')
  validateShotBackgroundReferences(shot({ id: 'shot-a' }), pipeline)
  console.log('✓ missing / wrong-parent / wrong-game / empty refs')
}

function testDoesNotMutateRecords() {
  const pipeline = makePipeline()
  const s = shot({ id: 'shot-a', backgroundVisualAssetId: 'housing' })
  const asset = pipeline.visualAssets.find((a) => a.id === 'housing')!
  resolveShotBackgroundImagePath(s, pipeline)
  assert(asset.thumbnail === undefined, 'must not write asset.thumbnail')
  assert(asset.image === undefined, 'must not write asset.image')
  assert(s.backgroundImage === undefined, 'must not copy onto shot.backgroundImage')
  console.log('✓ resolver does not copy onto thumbnail or backgroundImage')
}

function testInUseCollectors() {
  const pipeline = makePipeline()
  pipeline.storyboardShots[0] = shot({
    id: 'shot-a',
    name: 'One',
    backgroundVisualAssetId: 'housing',
    backgroundAssetStateId: 'st-locked'
  })
  const assetUse = collectAssetLayerUsage(pipeline, 'housing')
  assert(assetUse.labels.some((l) => l.includes('background')), `asset in-use labels: ${assetUse.labels}`)
  const unused = collectAssetLayerUsage(pipeline, 'logo')
  assert(unused.labels.length === 0, 'unreferenced static not in use')
  const stateUse = collectAssetStateLayerUsage(pipeline, 'st-locked')
  assert(stateUse.labels.some((l) => l.includes('background')), 'explicit state in use')
  const defaultState = collectAssetStateLayerUsage(pipeline, 'st-normal')
  assert(defaultState.labels.length === 0, 'implicit default is not extra state usage')
  console.log('✓ in-use collectors include shot background refs')
}

function main() {
  testStaticFullResNotThumbnail()
  testDefaultStateFallback()
  testExplicitState()
  testLegacyBackgroundImage()
  testLibraryPrefersOverLegacyPath()
  testMissingWrongParentWrongGame()
  testDoesNotMutateRecords()
  testInUseCollectors()
  console.log('\nAll shot background path tests passed')
}

main()
