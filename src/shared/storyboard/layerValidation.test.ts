/**
 * P2 layer validation + render plan tests (no Electron).
 * Run: npx tsx src/shared/storyboard/layerValidation.test.ts
 */

import type {
  AssetPipelineProject,
  AssetState,
  Character,
  Font,
  Palette,
  Pose,
  Storyboard,
  StoryboardLayer,
  StoryboardShot,
  VisualAsset
} from '../types/assetPipeline'
import {
  validateLayerReferences,
  resolveVisualAssetImagePath,
  resolveLayerImagePath,
  resolveTextStyle,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TEXT_COLOR
} from './layerValidation'
import { describeLayerLabel, hitTestLayer, planLayerDraw } from './layerRender'

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
    ...partial
  }
}

function makePipeline(): AssetPipelineProject {
  const gameA = 'game-a'
  const gameB = 'game-b'
  const assetA: VisualAsset = {
    id: 'asset-a',
    gameId: gameA,
    name: 'Logo A',
    category: 'logo',
    tags: [],
    defaultStateId: null,
    image: '/tmp/assets/asset-a/image.png',
    thumbnail: '/tmp/assets/asset-a/thumbnail.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const assetB: VisualAsset = {
    id: 'asset-b',
    gameId: gameB,
    name: 'Logo B',
    category: 'logo',
    tags: [],
    defaultStateId: 'state-b1',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const stateA1: AssetState = {
    id: 'state-a1',
    assetId: 'asset-a',
    name: 'on',
    file: '/tmp/assets/asset-a/state_on.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const stateB1: AssetState = {
    id: 'state-b1',
    assetId: 'asset-b',
    name: 'idle',
    file: '/tmp/assets/asset-b/idle.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const character: Character = {
    id: 'char-a',
    gameId: gameA,
    name: 'Hero',
    role: 'player',
    tags: [],
    createdAt: now,
    updatedAt: now
  }
  const pose: Pose = {
    id: 'pose-a',
    characterId: 'char-a',
    slot: 'ready',
    file: '/tmp/poses/hero-ready.png',
    status: 'approved',
    createdAt: now,
    updatedAt: now
  }
  const font: Font = {
    id: 'font-a',
    gameId: gameA,
    name: 'Arcade',
    family: 'Press Start 2P',
    fallback: 'monospace',
    source: 'system',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const palette: Palette = {
    id: 'palette-a',
    gameId: gameA,
    name: 'Neon',
    colors: {
      primary: '#00ffff',
      secondary: '#ff00ff',
      accent: '#ffff00',
      background: '#000000',
      text: '#00ffaa'
    },
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const storyboard: Storyboard = {
    id: 'sb-a',
    gameId: gameA,
    name: 'Board',
    shotIds: ['shot-a'],
    createdAt: now,
    updatedAt: now
  }
  const shot: StoryboardShot = {
    id: 'shot-a',
    name: 'Shot 1',
    durationSec: 3,
    aspectRatio: { width: 16, height: 9 },
    layers: [],
    cameraTrack: [],
    effectsTrack: [],
    createdAt: now,
    updatedAt: now
  }

  return {
    schemaVersion: 1,
    id: 'proj',
    name: 'Test',
    description: '',
    games: [
      { id: gameA, name: 'A', engine: 'unity', exportRoot: '.', createdAt: now, updatedAt: now },
      { id: gameB, name: 'B', engine: 'godot', exportRoot: '.', createdAt: now, updatedAt: now }
    ],
    characters: [character],
    poses: [pose],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [storyboard],
    storyboardShots: [shot],
    exportProfiles: [],
    gameDefinitions: [],
    visualAssets: [assetA, assetB],
    assetStates: [stateA1, stateB1],
    fonts: [font],
    palettes: [palette],
    eventDefinitions: [],
    eventBindings: [],
    audioAssets: [],
    createdAt: now,
    updatedAt: now
  }
}

function testIndependentDefaults() {
  const pipeline = makePipeline()
  const l1 = layer({ id: 'l1', visualAssetId: 'asset-a', assetStateId: 'state-a1' })
  const l2 = layer({ id: 'l2', visualAssetId: 'asset-a', assetStateId: null })
  validateLayerReferences(l1, pipeline, 'shot-a')
  validateLayerReferences(l2, pipeline, 'shot-a')
  const p1 = resolveLayerImagePath(l1, pipeline)
  const p2 = resolveLayerImagePath(l2, pipeline)
  assert(p1.path === '/tmp/assets/asset-a/state_on.png', 'instance 1 uses authored state')
  assert(p2.path === '/tmp/assets/asset-a/image.png', 'instance 2 uses static image')
  assert(l1.assetStateId !== l2.assetStateId, 'independent authored defaults')
  console.log('✓ two instances of same asset keep independent state defaults')
}

function testWrongGameAsset() {
  const pipeline = makePipeline()
  assertThrows(
    () => validateLayerReferences(layer({ id: 'l', visualAssetId: 'asset-b' }), pipeline, 'shot-a'),
    'belongs to game',
    'wrong-game asset'
  )
  console.log('✓ wrong-game asset rejected')
}

function testWrongParentState() {
  const pipeline = makePipeline()
  assertThrows(
    () =>
      validateLayerReferences(
        layer({ id: 'l', visualAssetId: 'asset-a', assetStateId: 'state-b1' }),
        pipeline,
        'shot-a'
      ),
    'belongs to asset',
    'wrong-parent state'
  )
  console.log('✓ wrong-parent state rejected')
}

function testWrongParentPose() {
  const pipeline = makePipeline()
  assertThrows(
    () =>
      validateLayerReferences(
        layer({ id: 'l', characterId: 'char-a', poseId: 'missing-pose' }),
        pipeline,
        'shot-a'
      ),
    'Pose not found',
    'missing pose'
  )
  console.log('✓ wrong/missing pose rejected')
}

function testTextDefaultFallback() {
  const pipeline = makePipeline()
  const textLayer = layer({
    id: 't1',
    text: 'HELLO',
    fontRef: 'default',
    paletteRef: 'default'
  })
  validateLayerReferences(textLayer, pipeline, 'shot-a')
  const style = resolveTextStyle(textLayer, pipeline, 'game-a')
  assert(style.family === DEFAULT_FONT_FAMILY, 'default font family')
  assert(style.color === DEFAULT_TEXT_COLOR, 'default text color')
  assert(!style.fontError && !style.paletteError, 'no fallback errors')
  console.log('✓ text default font/palette fallback')
}

function testTextAuthoredRefs() {
  const pipeline = makePipeline()
  const textLayer = layer({
    id: 't2',
    text: 'NEON',
    fontRef: 'font-a',
    paletteRef: 'palette-a'
  })
  validateLayerReferences(textLayer, pipeline, 'shot-a')
  const style = resolveTextStyle(textLayer, pipeline, 'game-a')
  assert(style.family === 'Press Start 2P', 'authored font family')
  assert(style.fallback === 'monospace', 'authored fallback')
  assert(style.color === '#00ffaa', 'authored palette text color')
  console.log('✓ text authored font/palette refs')
}

function testOrphanFontRejected() {
  const pipeline = makePipeline()
  assertThrows(
    () =>
      validateLayerReferences(
        layer({ id: 't', text: 'x', fontRef: 'invented-font' }),
        pipeline,
        'shot-a'
      ),
    'not a Font id',
    'orphan font'
  )
  console.log('✓ orphan font id rejected')
}

function testStaticImageFallbackFromThumbnail() {
  const asset: VisualAsset = {
    id: 'asset-legacy',
    gameId: 'game-a',
    name: 'Legacy',
    category: 'prop',
    tags: [],
    defaultStateId: null,
    thumbnail: '/tmp/assets/asset-legacy/thumbnail.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const resolved = resolveVisualAssetImagePath(asset, null, [])
  assert(
    resolved.path === '/tmp/assets/asset-legacy/image.png',
    `sibling image from thumbnail, got ${resolved.path}`
  )
  console.log('✓ P1 thumbnail-only asset resolves sibling image.png')
}

function testSpacesInMediaPath() {
  const asset: VisualAsset = {
    id: 'asset-space',
    gameId: 'game-a',
    name: 'Spaced',
    category: 'logo',
    tags: [],
    defaultStateId: null,
    image: '/tmp/assets/asset space/image.png',
    thumbnail: '/tmp/assets/asset space/thumbnail.png',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const resolved = resolveVisualAssetImagePath(asset, null, [])
  assert(resolved.path?.includes('asset space') === true, 'path with spaces preserved')
  console.log('✓ media path with spaces preserved')
}

function testRenderPlanAndHit() {
  const pipeline = makePipeline()
  const hidden = layer({ id: 'h', visualAssetId: 'asset-a', visible: false })
  const plan = planLayerDraw(hidden, pipeline, 'game-a')
  assert(plan.visible === false, 'hidden plan')
  assert(hitTestLayer(hidden, 0.5, 0.5, 800, true) === false, 'hidden not hittable')

  const text = layer({ id: 't', text: 'Title Card', x: 0.5, y: 0.5, scale: 1 })
  const textPlan = planLayerDraw(text, pipeline, 'game-a')
  assert(textPlan.kind === 'text', 'text kind')
  assert((textPlan.pixelSize.width) > 0 && textPlan.pixelSize.height > 0, 'text bounds')
  assert(hitTestLayer(text, 0.5, 0.5, 800, false) === true, 'text center hits')
  assert(hitTestLayer(text, 0.01, 0.01, 800, false) === false, 'far corner misses text')

  const assetLayer = layer({ id: 'a', visualAssetId: 'asset-a' })
  assert(describeLayerLabel(assetLayer, pipeline).includes('Logo A'), 'asset label')
  assert(describeLayerLabel(text, pipeline).includes('Title Card'), 'text label')
  console.log('✓ render plan, bounds, hit testing')
}

function testMissingMediaError() {
  const pipeline = makePipeline()
  pipeline.visualAssets[0].image = undefined
  pipeline.visualAssets[0].thumbnail = undefined
  const l = layer({ id: 'm', visualAssetId: 'asset-a' })
  const resolved = resolveLayerImagePath(l, pipeline)
  assert(!!resolved.error, 'missing media error visible')
  const plan = planLayerDraw(l, pipeline, 'game-a')
  assert(!!plan.error, 'draw plan surfaces missing media')
  console.log('✓ missing media error visible on resolve/draw')
}

async function main() {
  testIndependentDefaults()
  testWrongGameAsset()
  testWrongParentState()
  testWrongParentPose()
  testTextDefaultFallback()
  testTextAuthoredRefs()
  testOrphanFontRejected()
  testStaticImageFallbackFromThumbnail()
  testSpacesInMediaPath()
  testRenderPlanAndHit()
  testMissingMediaError()
  console.log('\nAll P2 layer validation/render tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
