/**
 * Isolated CLI roundtrip for Library preview path selection.
 * Expects FORGE_DATA_DIR from test-library-preview-mac.sh.
 * Run: npx tsx src/shared/storyboard/libraryPreview.cli-roundtrip.ts
 */

import { existsSync } from 'fs'
import { getAssetPipeline, getAssetStatesForGame } from '../../core/storage/studioStorage'
import { resolveLibraryPreviewPath } from './layerValidation'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

async function main() {
  const gameId = process.env.LIBRARY_PREVIEW_GAME || 'game-test'
  const pipeline = await getAssetPipeline()
  const assets = (pipeline.visualAssets || []).filter((a) => a.gameId === gameId)
  const states = pipeline.assetStates || []

  const staticAsset = assets.find((a) => a.name === 'Static Logo')
  assert(!!staticAsset, 'Static Logo missing')
  assert(!!staticAsset!.thumbnail, 'Static Logo must keep root thumbnail')
  const staticPath = resolveLibraryPreviewPath(staticAsset!, states, { gameId }).path
  assert(staticPath === staticAsset!.thumbnail, `static preview is thumbnail, got ${staticPath}`)
  assert(existsSync(staticPath!), `static thumbnail file exists: ${staticPath}`)

  const housing = assets.find((a) => a.name === 'Keypad Housing')
  assert(!!housing, 'Keypad Housing missing')
  assert(!housing!.thumbnail, 'set-default-state must not write root thumbnail')
  assert(!housing!.image, 'set-default-state must not write root image')
  assert(!!housing!.defaultStateId, 'Keypad Housing needs defaultStateId')
  const def = states.find((s) => s.id === housing!.defaultStateId && s.assetId === housing!.id)
  assert(!!def, 'default state record missing')
  assert(existsSync(def!.file), `default state.file exists: ${def!.file}`)
  const housingPath = resolveLibraryPreviewPath(housing!, states, { gameId }).path
  assert(housingPath === def!.file, `housing preview is default file, got ${housingPath}`)

  const idle = states.find((s) => s.assetId === housing!.id && s.name === 'Idle')
  const locked = states.find((s) => s.assetId === housing!.id && s.name === 'Locked')
  if (idle && locked) {
    assert(
      housing!.defaultStateId === locked.id,
      'expected default switched to Locked for change check'
    )
    assert(housingPath === locked.file, 'preview follows Locked default')
    const idlePreview = resolveLibraryPreviewPath(
      { ...housing!, defaultStateId: idle.id },
      states,
      { gameId }
    ).path
    assert(idlePreview === idle.file, 'Idle default still selectable without writing records')
  }

  const wrongGame = resolveLibraryPreviewPath(housing!, states, { gameId: 'game-other' })
  assert(wrongGame.path === undefined, 'wrong-game option yields no path')

  const scoped = await getAssetStatesForGame(gameId)
  assert(
    scoped.every((s) => assets.some((a) => a.id === s.assetId)),
    'listForGame states belong to selected Game assets'
  )
  const otherGameStates = await getAssetStatesForGame('game-other')
  assert(otherGameStates.length === 0, 'wrong Game has no imported states')

  console.log('✓ CLI roundtrip: static thumb preferred; default-state fallback; no root thumb write')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
