/**
 * Extensible asset categories (1b). Isolated, no studio I/O.
 */
import assert from 'node:assert/strict'
import type { Game } from '../types/assetPipeline'
import { emptyGameSettings } from '../studio/schema'
import {
  BACKGROUND_CATEGORY_KEY,
  CORE_ASSET_CATEGORY_KEYS,
  assertAddableCategoryKey,
  assertKnownAssetCategory,
  effectiveAssetCategories,
  effectiveAssetCategoryKeys,
  isBackgroundCategory,
  isBackgroundCategoryKey,
  isCoreAssetCategory,
  occupiedAssetCategoryKeys
} from './assetCategories'

const now = '2026-01-01T00:00:00.000Z'

function gameWithCats(cats: Array<{ key: string; label: string; base?: string }>): Game {
  return {
    id: 'game-a',
    name: 'Game A',
    engine: 'unity',
    exportRoot: './exports/a',
    settings: { ...emptyGameSettings(), assetCategories: cats },
    createdAt: now,
    updatedAt: now
  }
}

function testBuiltinsIncludeBackground() {
  assert.equal(CORE_ASSET_CATEGORY_KEYS.includes('logo'), true)
  assert.equal(CORE_ASSET_CATEGORY_KEYS.includes('symbol'), true)
  assert.equal(CORE_ASSET_CATEGORY_KEYS.includes('item'), true)
  assert.equal(CORE_ASSET_CATEGORY_KEYS.includes('weapon'), true)
  assert.equal(CORE_ASSET_CATEGORY_KEYS.includes('prop'), true)
  assert.equal(CORE_ASSET_CATEGORY_KEYS.includes(BACKGROUND_CATEGORY_KEY), true)
  assert.equal(isCoreAssetCategory('background'), true)
  console.log('✓ built-ins include background')
}

function testGameExtras() {
  const game = gameWithCats([
    { key: 'map', label: 'Map', base: 'background' },
    { key: 'sigil', label: 'Sigil' }
  ])
  const keys = effectiveAssetCategoryKeys(game)
  assert.equal(keys.includes('background'), true)
  assert.equal(keys.includes('map'), true)
  assert.equal(keys.includes('sigil'), true)
  const other: Game = {
    id: 'game-b',
    name: 'Game B',
    engine: 'godot',
    exportRoot: './exports/b',
    settings: emptyGameSettings(),
    createdAt: now,
    updatedAt: now
  }
  assert.equal(effectiveAssetCategoryKeys(other).includes('map'), false)
  assert.deepEqual(effectiveAssetCategoryKeys(other), CORE_ASSET_CATEGORY_KEYS)
  console.log('✓ per-game categories do not leak')
}

function testBackgroundBase() {
  const game = gameWithCats([{ key: 'map', label: 'Map', base: 'background' }])
  const map = effectiveAssetCategories(game).find((c) => c.key === 'map')
  assert.equal(isBackgroundCategory(map), true)
  assert.equal(isBackgroundCategoryKey('map', game), true)
  assert.equal(isBackgroundCategoryKey('background', game), true)
  assert.equal(isBackgroundCategoryKey('logo', game), false)
  console.log('✓ base: background is treated as a background category')
}

function testValidation() {
  const game = gameWithCats([{ key: 'sigil', label: 'Sigil' }])
  assert.equal(assertKnownAssetCategory('background', game), 'background')
  assert.equal(assertKnownAssetCategory('sigil', game), 'sigil')
  assert.throws(() => assertKnownAssetCategory('nope', game), /Unknown asset category/)
  const occupied = occupiedAssetCategoryKeys(game)
  assert.throws(() => assertAddableCategoryKey('logo', occupied), /already exists/)
  assert.throws(() => assertAddableCategoryKey('sigil', occupied), /already exists/)
  assert.equal(assertAddableCategoryKey('banner', occupied), 'banner')
  console.log('✓ category validation / duplicate refuse')
}

function main() {
  testBuiltinsIncludeBackground()
  testGameExtras()
  testBackgroundBase()
  testValidation()
  console.log('\n✓ assetCategories tests passed')
}

main()
