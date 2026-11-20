/**
 * World map background path + native aspect (no Electron, no production data).
 * Run: npx tsx src/shared/worldContent/mapBackground.test.ts
 */

import type { AssetState, VisualAsset } from '../types/assetPipeline'
import {
  DEFAULT_MAP_ASPECT,
  mapSurfaceAspect,
  resolveWorldMapBackgroundPath
} from './mapBackground'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

const now = '2026-01-01T00:00:00.000Z'

function asset(partial: Partial<VisualAsset> & Pick<VisualAsset, 'id'>): VisualAsset {
  return {
    gameId: 'game-a',
    name: 'World 1 map',
    category: 'background',
    tags: [],
    defaultStateId: null,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

function state(partial: Partial<AssetState> & Pick<AssetState, 'id' | 'assetId'>): AssetState {
  return {
    name: 'Default',
    file: `/tmp/assets/${partial.assetId}/state_${partial.id}.png`,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

function testPrefersFullImageOverThumbnail() {
  const a = asset({
    id: 'world-1-map',
    image: '/tmp/assets/world-1-map/image.png',
    thumbnail: '/tmp/assets/world-1-map/thumbnail.png',
    pixelSize: { width: 1920, height: 1080 }
  })
  const resolved = resolveWorldMapBackgroundPath(a, [], { gameId: 'game-a' })
  assert(
    resolved.path === '/tmp/assets/world-1-map/image.png',
    `full image preferred, got ${resolved.path}`
  )
  console.log('✓ static full image preferred over 256² thumbnail')
}

function testPrefersDefaultStateFile() {
  const a = asset({
    id: 'map-states',
    thumbnail: '/tmp/assets/map-states/thumbnail.png',
    defaultStateId: 'st-day'
  })
  const def = state({
    id: 'st-day',
    assetId: 'map-states',
    name: 'Day',
    file: '/tmp/assets/map-states/state_st-day.png'
  })
  const resolved = resolveWorldMapBackgroundPath(a, [def], { gameId: 'game-a' })
  assert(
    resolved.path === '/tmp/assets/map-states/state_st-day.png',
    `default state file, got ${resolved.path}`
  )
  console.log('✓ default state file preferred over thumbnail')
}

function testFallsBackToThumbnail() {
  const a = asset({
    id: 'thumb-only',
    thumbnail: '/tmp/assets/thumb-only/thumbnail.png'
  })
  const resolved = resolveWorldMapBackgroundPath(a, [], { gameId: 'game-a' })
  assert(
    resolved.path === '/tmp/assets/thumb-only/thumbnail.png',
    `thumbnail fallback, got ${resolved.path}`
  )
  console.log('✓ thumbnail used only when no full image exists')
}

function testMissingDefaultStateFallsThroughToImage() {
  const a = asset({
    id: 'map-missing-state',
    defaultStateId: 'st-missing',
    image: '/tmp/assets/map-missing-state/image.png',
    thumbnail: '/tmp/assets/map-missing-state/thumbnail.png'
  })
  const resolved = resolveWorldMapBackgroundPath(a, [], { gameId: 'game-a' })
  assert(
    resolved.path === '/tmp/assets/map-missing-state/image.png',
    `image after missing default state, got ${resolved.path}`
  )
  console.log('✓ missing default state falls through to asset.image')
}

function testGameMismatch() {
  const a = asset({
    id: 'other-map',
    gameId: 'game-b',
    image: '/tmp/assets/other-map/image.png'
  })
  const resolved = resolveWorldMapBackgroundPath(a, [], { gameId: 'game-a' })
  assert(!resolved.path, `other-game asset should be empty, got ${resolved.path}`)
  console.log('✓ other-game asset returns no path')
}

function testEmptyAsset() {
  const resolved = resolveWorldMapBackgroundPath(undefined, [])
  assert(!resolved.path, 'missing asset should be empty')
  console.log('✓ missing asset returns no path')
}

function testAspectFromPixelSize() {
  const aspect = mapSurfaceAspect({ width: 1920, height: 1080 }, { width: 256, height: 256 })
  assert(aspect.width === 1920 && aspect.height === 1080, `pixelSize first, got ${JSON.stringify(aspect)}`)
  console.log('✓ pixelSize wins over decoded natural size')
}

function testAspectFromNatural() {
  const aspect = mapSurfaceAspect(undefined, { width: 1920, height: 1080 })
  assert(aspect.width === 1920 && aspect.height === 1080, `natural, got ${JSON.stringify(aspect)}`)
  console.log('✓ natural size used when pixelSize is absent')
}

function testAspectDefault16x9() {
  const aspect = mapSurfaceAspect({ width: 0, height: 0 }, { width: -1, height: 10 })
  assert(
    aspect.width === DEFAULT_MAP_ASPECT.width && aspect.height === DEFAULT_MAP_ASPECT.height,
    `16:9 fallback, got ${JSON.stringify(aspect)}`
  )
  console.log('✓ 16:9 when pixelSize and natural are missing or invalid')
}

function run() {
  testPrefersFullImageOverThumbnail()
  testPrefersDefaultStateFile()
  testFallsBackToThumbnail()
  testMissingDefaultStateFallsThroughToImage()
  testGameMismatch()
  testEmptyAsset()
  testAspectFromPixelSize()
  testAspectFromNatural()
  testAspectDefault16x9()
  console.log('mapBackground tests passed')
}

run()
