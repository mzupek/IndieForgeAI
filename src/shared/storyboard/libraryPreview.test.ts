/**
 * Library preview path selection (no Electron, no production data).
 * Run: npx tsx src/shared/storyboard/libraryPreview.test.ts
 */

import type { AssetState, VisualAsset } from '../types/assetPipeline'
import { resolveLibraryPreviewPath } from './layerValidation'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

const now = '2026-01-01T00:00:00.000Z'

function asset(partial: Partial<VisualAsset> & Pick<VisualAsset, 'id'>): VisualAsset {
  return {
    gameId: 'game-neon-recall',
    name: 'Asset',
    category: 'prop',
    tags: [],
    defaultStateId: null,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

function state(partial: Partial<AssetState> & Pick<AssetState, 'id' | 'assetId'>): AssetState {
  return {
    name: 'Normal',
    file: `/tmp/assets/${partial.assetId}/state_${partial.id}.png`,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

function testStaticThumbnailPreferred() {
  const a = asset({
    id: 'logo',
    category: 'logo',
    image: '/tmp/assets/logo/image.png',
    thumbnail: '/tmp/assets/logo/thumbnail.png',
    defaultStateId: 'st-extra'
  })
  const extra = state({
    id: 'st-extra',
    assetId: 'logo',
    file: '/tmp/assets/logo/state_st-extra.png'
  })
  const resolved = resolveLibraryPreviewPath(a, [extra], { gameId: 'game-neon-recall' })
  assert(
    resolved.path === '/tmp/assets/logo/thumbnail.png',
    `static thumb preferred, got ${resolved.path}`
  )
  console.log('✓ static root thumbnail preferred over default state file')
}

function testDefaultStateFallback() {
  const a = asset({
    id: 'housing',
    name: 'Keypad Housing',
    defaultStateId: 'ccc67123'
  })
  const def = state({
    id: 'ccc67123',
    assetId: 'housing',
    name: 'Normal',
    file: '/tmp/assets/housing/state_ccc67123.png'
  })
  const resolved = resolveLibraryPreviewPath(a, [def], { gameId: 'game-neon-recall' })
  assert(
    resolved.path === '/tmp/assets/housing/state_ccc67123.png',
    `default state file, got ${resolved.path}`
  )
  console.log('✓ empty root thumb falls back to default state.file')
}

function testDefaultStateChange() {
  const a = asset({
    id: 'lock',
    name: 'Lock Indicator',
    defaultStateId: 'idle'
  })
  const idle = state({
    id: 'idle',
    assetId: 'lock',
    name: 'Idle',
    file: '/tmp/assets/lock/idle.png'
  })
  const locked = state({
    id: 'locked',
    assetId: 'lock',
    name: 'Locked',
    file: '/tmp/assets/lock/locked.png'
  })
  const before = resolveLibraryPreviewPath(a, [idle, locked], { gameId: 'game-neon-recall' })
  assert(before.path === idle.file, 'first default is Idle')
  const after = resolveLibraryPreviewPath(
    { ...a, defaultStateId: 'locked' },
    [idle, locked],
    { gameId: 'game-neon-recall' }
  )
  assert(after.path === locked.file, 'changing default changes preview path')
  console.log('✓ changing defaultStateId changes preview path')
}

function testMissingAndWrongParent() {
  const a = asset({
    id: 'btn',
    name: 'Button1',
    defaultStateId: 'missing-id'
  })
  const missing = resolveLibraryPreviewPath(a, [], { gameId: 'game-neon-recall' })
  assert(missing.path === undefined, 'missing defaultStateId → no path')

  const orphan = state({
    id: 'b28660cb',
    assetId: 'other-asset',
    name: 'Idle',
    file: '/tmp/assets/other/idle.png'
  })
  const wrongParent = resolveLibraryPreviewPath(
    { ...a, defaultStateId: 'b28660cb' },
    [orphan],
    { gameId: 'game-neon-recall' }
  )
  assert(wrongParent.path === undefined, 'wrong-parent state is not used')

  const noDefault = resolveLibraryPreviewPath(
    asset({ id: 'empty', defaultStateId: null }),
    [orphan],
    { gameId: 'game-neon-recall' }
  )
  assert(noDefault.path === undefined, 'no media and no default → no path')

  const emptyFile = resolveLibraryPreviewPath(
    { ...a, defaultStateId: 'empty-file' },
    [state({ id: 'empty-file', assetId: 'btn', file: '' })],
    { gameId: 'game-neon-recall' }
  )
  assert(emptyFile.path === undefined, 'empty state.file → no path')

  const malformed = resolveLibraryPreviewPath(a, null as unknown as AssetState[], {
    gameId: 'game-neon-recall'
  })
  assert(malformed.path === undefined, 'null states list → no throw')
  console.log('✓ missing / wrong-parent / empty refs fall back with no throw')
}

function testWrongGame() {
  const a = asset({
    id: 'housing',
    gameId: 'game-ring-em-up',
    defaultStateId: 'ccc67123'
  })
  const def = state({
    id: 'ccc67123',
    assetId: 'housing',
    file: '/tmp/assets/housing/state_ccc67123.png'
  })
  const resolved = resolveLibraryPreviewPath(a, [def], { gameId: 'game-neon-recall' })
  assert(resolved.path === undefined, 'wrong-game asset yields no preview')
  console.log('✓ wrong-game asset is not previewed')
}

function testNoDestructiveThumbnailWrite() {
  const a = asset({
    id: 'housing',
    defaultStateId: 'ccc67123'
  })
  const def = state({ id: 'ccc67123', assetId: 'housing' })
  resolveLibraryPreviewPath(a, [def], { gameId: 'game-neon-recall' })
  assert(a.thumbnail === undefined, 'resolver must not write asset.thumbnail')
  assert(a.image === undefined, 'resolver must not write asset.image')
  assert(a.defaultStateId === 'ccc67123', 'defaultStateId unchanged')
  console.log('✓ resolver does not write root thumbnail/image')
}

function main() {
  testStaticThumbnailPreferred()
  testDefaultStateFallback()
  testDefaultStateChange()
  testMissingAndWrongParent()
  testWrongGame()
  testNoDestructiveThumbnailWrite()
  console.log('\nAll library preview path tests passed')
}

main()
