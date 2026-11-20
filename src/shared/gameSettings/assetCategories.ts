/**
 * Extensible visual-asset categories: built-ins + game.settings.assetCategories.
 * Game-agnostic: no title-specific keys live here.
 */

import type { Game, GameAssetCategoryDef } from '../types/assetPipeline'
import { assertLabel, assertSettingsKey } from './keys'

export const CORE_ASSET_CATEGORIES: GameAssetCategoryDef[] = [
  { key: 'logo', label: 'Logo' },
  { key: 'symbol', label: 'Symbol' },
  { key: 'item', label: 'Item' },
  { key: 'weapon', label: 'Weapon' },
  { key: 'prop', label: 'Prop' },
  { key: 'background', label: 'Background' }
]

export const CORE_ASSET_CATEGORY_KEYS: string[] = CORE_ASSET_CATEGORIES.map((c) => c.key)

export const BACKGROUND_CATEGORY_KEY = 'background'

export function isCoreAssetCategory(key: string): boolean {
  return CORE_ASSET_CATEGORY_KEYS.includes(key)
}

export function gameAssetCategoryDefs(game: Game | undefined | null): GameAssetCategoryDef[] {
  return Array.isArray(game?.settings?.assetCategories) ? game!.settings!.assetCategories : []
}

export function effectiveAssetCategories(game?: Game | null): GameAssetCategoryDef[] {
  const seen = new Set<string>()
  const out: GameAssetCategoryDef[] = []

  const push = (def: GameAssetCategoryDef) => {
    const key = String(def.key || '').trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    const next: GameAssetCategoryDef = { key, label: def.label || key }
    if (def.base) next.base = def.base
    out.push(next)
  }

  for (const cat of CORE_ASSET_CATEGORIES) push(cat)
  for (const cat of gameAssetCategoryDefs(game)) push(cat)
  return out
}

export function effectiveAssetCategoryKeys(game?: Game | null): string[] {
  return effectiveAssetCategories(game).map((c) => c.key)
}

export function findAssetCategory(
  key: string,
  game?: Game | null
): GameAssetCategoryDef | undefined {
  const normalized = String(key || '').trim().toLowerCase()
  return effectiveAssetCategories(game).find((c) => c.key === normalized)
}

export function isValidAssetCategory(key: string, game?: Game | null): boolean {
  return Boolean(findAssetCategory(key, game))
}

export function assertKnownAssetCategory(key: string, game?: Game | null): string {
  const normalized = assertSettingsKey(key, 'Asset category')
  if (!isValidAssetCategory(normalized, game)) {
    const available = effectiveAssetCategoryKeys(game).join(', ')
    throw new Error(`Unknown asset category '${key}'. Available categories: ${available}`)
  }
  return normalized
}

/**
 * Built-in `background`, or a custom category with base: 'background' (Region picker in 1c).
 */
export function isBackgroundCategory(def: GameAssetCategoryDef | undefined | null): boolean {
  if (!def) return false
  return def.key === BACKGROUND_CATEGORY_KEY || def.base === BACKGROUND_CATEGORY_KEY
}

export function isBackgroundCategoryKey(key: string, game?: Game | null): boolean {
  return isBackgroundCategory(findAssetCategory(key, game))
}

export function occupiedAssetCategoryKeys(game?: Game | null): Set<string> {
  return new Set(effectiveAssetCategoryKeys(game))
}

export function assertAddableCategoryKey(key: string, occupied: Set<string>): string {
  const normalized = assertSettingsKey(key, 'Asset category')
  if (occupied.has(normalized)) {
    throw new Error(`Asset category '${normalized}' already exists (built-in or game)`)
  }
  return normalized
}

export function normalizeAssetCategoryDef(input: {
  key: string
  label: string
  base?: string
}): GameAssetCategoryDef {
  const key = assertSettingsKey(input.key, 'Asset category')
  const label = assertLabel(input.label, 'Asset category')
  const def: GameAssetCategoryDef = { key, label }
  if (input.base && input.base.trim()) {
    def.base = assertSettingsKey(input.base, 'Asset category base')
  }
  return def
}
