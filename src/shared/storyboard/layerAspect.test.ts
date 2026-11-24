/**
 * Visual-asset layer source aspect (no Electron, no production data).
 * Run: npx tsx src/shared/storyboard/layerAspect.test.ts
 */

import type {
  AssetPipelineProject,
  AssetState,
  Storyboard,
  StoryboardLayer,
  StoryboardShot,
  VisualAsset
} from '../types/assetPipeline'
import {
  SOURCE_FIT_SCALE,
  containSourcePixelSize,
  getLayerPixelSize,
  hitTestLayer,
  pickSourceSize,
  planLayerDraw,
  resolveLayerSourceSize
} from './layerRender'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function approx(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) > 0.51) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`)
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
  const staticWide: VisualAsset = {
    id: 'gate-static',
    gameId: 'game-a',
    name: 'Gate Security Housing',
    category: 'prop',
    tags: [],
    defaultStateId: null,
    image: '/tmp/assets/gate-static/image.png',
    thumbnail: '/tmp/assets/gate-static/thumbnail.png',
    pixelSize: { width: 200, height: 40 },
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const strip: VisualAsset = {
    id: 'lock-strip',
    gameId: 'game-a',
    name: 'Lock Indicator strip',
    category: 'prop',
    tags: [],
    defaultStateId: 'st-locked',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const square: VisualAsset = {
    id: 'logo',
    gameId: 'game-a',
    name: 'Logo',
    category: 'logo',
    tags: [],
    defaultStateId: null,
    image: '/tmp/assets/logo/image.png',
    pixelSize: { width: 64, height: 64 },
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const tall: VisualAsset = {
    id: 'tall',
    gameId: 'game-a',
    name: 'Tall',
    category: 'prop',
    tags: [],
    defaultStateId: null,
    image: '/tmp/assets/tall/image.png',
    pixelSize: { width: 40, height: 200 },
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const locked: AssetState = {
    id: 'st-locked',
    assetId: 'lock-strip',
    name: 'Locked',
    file: '/tmp/assets/lock-strip/locked.png',
    boundingBox: { width: 200, height: 40 },
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const idle: AssetState = {
    id: 'st-idle',
    assetId: 'lock-strip',
    name: 'Idle',
    file: '/tmp/assets/lock-strip/idle.png',
    boundingBox: { width: 64, height: 64 },
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const staleThumb: AssetState = {
    id: 'st-stale',
    assetId: 'lock-strip',
    name: 'Stale',
    file: '/tmp/assets/lock-strip/stale.png',
    boundingBox: { width: 256, height: 256 },
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  }
  const storyboard: Storyboard = {
    id: 'sb',
    gameId: 'game-a',
    name: 'Board',
    shotIds: ['shot-a'],
    createdAt: now,
    updatedAt: now
  }
  const shot: StoryboardShot = {
    id: 'shot-a',
    name: 'One',
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
    games: [{ id: 'game-a', name: 'A', engine: 'unity', exportRoot: '.', createdAt: now, updatedAt: now }],
    characters: [],
    poses: [],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [storyboard],
    storyboardShots: [shot],
    exportProfiles: [],
    gameDefinitions: [],
    visualAssets: [staticWide, strip, square, tall],
    assetStates: [locked, idle, staleThumb],
    fonts: [],
    palettes: [],
    eventDefinitions: [],
    eventBindings: [],
    audioAssets: [],
    createdAt: now,
    updatedAt: now
  }
}

function testContain() {
  const wide = containSourcePixelSize(200, 40, 200)
  approx(wide.width, 200, 'wide width')
  approx(wide.height, 40, 'wide height')
  const tall = containSourcePixelSize(40, 200, 200)
  approx(tall.width, 40, 'tall width')
  approx(tall.height, 200, 'tall height')
  const sq = containSourcePixelSize(64, 64, 200)
  approx(sq.width, 200, 'square width')
  approx(sq.height, 200, 'square height')
  console.log('✓ contain wide/tall/square into 200px max-side')
}

function testStaticAndStateMetadata() {
  const pipeline = makePipeline()
  const housing = layer({ id: 'h', visualAssetId: 'gate-static' })
  const plan = planLayerDraw(housing, pipeline, 'game-a')
  approx(plan.pixelSize.width, 200, 'static wide w')
  approx(plan.pixelSize.height, 40, 'static wide h')
  assert(housing.scale === 1, 'authored scale unchanged')

  const locked = layer({ id: 's', visualAssetId: 'lock-strip', assetStateId: 'st-locked' })
  const lockedPlan = planLayerDraw(locked, pipeline, 'game-a')
  approx(lockedPlan.pixelSize.width, 200, 'locked strip w')
  approx(lockedPlan.pixelSize.height, 40, 'locked strip h')

  const def = layer({ id: 'd', visualAssetId: 'lock-strip', assetStateId: null })
  const defPlan = planLayerDraw(def, pipeline, 'game-a')
  approx(defPlan.pixelSize.height, 40, 'default state uses Locked 200x40')

  const logo = layer({ id: 'l', visualAssetId: 'logo' })
  const logoPlan = planLayerDraw(logo, pipeline, 'game-a')
  approx(logoPlan.pixelSize.width, 200, 'square still 200')
  approx(logoPlan.pixelSize.height, 200, 'square still 200')

  const tallL = layer({ id: 't', visualAssetId: 'tall' })
  const tallPlan = planLayerDraw(tallL, pipeline, 'game-a')
  approx(tallPlan.pixelSize.width, 40, 'tall w')
  approx(tallPlan.pixelSize.height, 200, 'tall h')
  console.log('✓ static/state/default/square/tall use source aspect')
}

function testStateSwitchDoesNotMutateScale() {
  const pipeline = makePipeline()
  const l = layer({ id: 's', visualAssetId: 'lock-strip', assetStateId: 'st-locked', scale: 1.5 })
  const locked = planLayerDraw(l, pipeline, 'game-a')
  approx(locked.pixelSize.width, 300, 'scaled wide w')
  approx(locked.pixelSize.height, 60, 'scaled wide h')
  const idle = planLayerDraw({ ...l, assetStateId: 'st-idle' }, pipeline, 'game-a')
  approx(idle.pixelSize.width, 300, 'idle square at same scale')
  approx(idle.pixelSize.height, 300, 'idle square h')
  assert(l.scale === 1.5, 'authored scale not rewritten')
  assert(l.assetStateId === 'st-locked', 'preview state switch does not write default')
  console.log('✓ state switch follows source aspect; authored scale/state untouched')
}

function testStaleThumbMetadataYieldsToNatural() {
  const pipeline = makePipeline()
  const l = layer({ id: 's', visualAssetId: 'lock-strip', assetStateId: 'st-stale' })
  const meta = resolveLayerSourceSize(l, pipeline)
  assert(meta?.width === 256 && meta?.height === 256, 'stale box still on record')
  const stalePlan = planLayerDraw(l, pipeline, 'game-a')
  approx(stalePlan.pixelSize.width, 200, 'stale metadata alone still square')
  const natural = pickSourceSize({ width: 200, height: 40 }, meta)
  assert(natural?.width === 200 && natural?.height === 40, 'decoded full-res wins over 256² thumb box')
  const fixed = planLayerDraw(l, pipeline, 'game-a', { naturalSize: { width: 200, height: 40 } })
  approx(fixed.pixelSize.width, 200, 'natural wide w')
  approx(fixed.pixelSize.height, 40, 'natural wide h')
  console.log('✓ stale 256² boundingBox yields to decoded source pixels')
}

function testExistingLayerNotRewritten() {
  const pipeline = makePipeline()
  const existing = layer({
    id: 'old',
    visualAssetId: 'gate-static',
    x: 0.42,
    y: 0.61,
    scale: 1.25,
    rotation: 15
  })
  const before = { ...existing }
  planLayerDraw(existing, pipeline, 'game-a')
  assert(existing.x === before.x && existing.y === before.y, 'position kept')
  assert(existing.scale === before.scale, 'scale kept (reset is explicit)')
  assert(existing.rotation === before.rotation, 'rotation kept')
  assert(SOURCE_FIT_SCALE === 1, 'reset-to-source-aspect is scale=1')
  console.log('✓ existing layers keep authored transform; no silent rewrite')
}

function testHitGeometryMatchesAspect() {
  const l = layer({ id: 'h', visualAssetId: 'gate-static' })
  const wide = { width: 200, height: 40 }
  assert(hitTestLayer(l, 0.5, 0.5, 800, true, { naturalSize: wide, canvasHeight: 800 }) === true, 'center hits')
  // 200x40 in 800x800: halfW=0.125, halfH=0.025
  assert(hitTestLayer(l, 0.5, 0.5 + 0.08, 800, true, { naturalSize: wide, canvasHeight: 800 }) === false, 'far in Y misses wide strip')
  assert(hitTestLayer(l, 0.5 + 0.1, 0.5, 800, true, { naturalSize: wide, canvasHeight: 800 }) === true, 'along strip still hits')
  const squareSize = getLayerPixelSize(l, true)
  assert(squareSize.width === squareSize.height, 'without source size, legacy square placeholder')
  console.log('✓ hit geometry follows wide source, not a square')
}

function testMissingSourceStaysSquarePlaceholder() {
  const l = layer({ id: 'm', visualAssetId: 'missing' })
  const size = getLayerPixelSize(l, false)
  assert(size.width === size.height && size.width === 100, 'placeholder square')
  console.log('✓ missing media keeps square placeholder')
}

function main() {
  testContain()
  testStaticAndStateMetadata()
  testStateSwitchDoesNotMutateScale()
  testStaleThumbMetadataYieldsToNatural()
  testExistingLayerNotRewritten()
  testHitGeometryMatchesAspect()
  testMissingSourceStaysSquarePlaceholder()
  console.log('\nAll layer source-aspect tests passed')
}

main()
