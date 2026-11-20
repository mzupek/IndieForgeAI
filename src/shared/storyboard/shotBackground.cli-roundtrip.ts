/**
 * Isolated CLI roundtrip for shot Library / direct-import backgrounds.
 * Expects FORGE_DATA_DIR from test-shot-background-mac.sh.
 * Run: npx tsx src/shared/storyboard/shotBackground.cli-roundtrip.ts
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { getDataDir } from '../../core/storage/dataDir'
import { getAssetPipeline } from '../../core/storage/studioStorage'
import { resolveShotBackgroundImagePath } from './shotBackground'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function isAbs(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:/.test(p)
}

async function main() {
  const pipeline = await getAssetPipeline()
  const shotName = process.env.SHOT_BACKGROUND_SHOT || 'BG Shot'
  const expectMode = process.env.SHOT_BACKGROUND_MODE || 'library'
  const shot = (pipeline.storyboardShots || []).find((s) => s.name === shotName)
  assert(!!shot, `shot '${shotName}' missing`)

  const resolved = resolveShotBackgroundImagePath(shot!, pipeline)
  assert(!!resolved.path, `expected resolved path, got ${resolved.error || 'empty'}`)
  const onDisk =
    resolved.path!.startsWith('/') || /^[A-Za-z]:/.test(resolved.path!)
      ? resolved.path!
      : join(getDataDir(), resolved.path!)
  assert(existsSync(onDisk), `resolved file exists: ${onDisk}`)
  assert(
    !/thumbnail\.png$/i.test(resolved.path!),
    `canvas path must not be thumbnail: ${resolved.path}`
  )

  if (expectMode === 'library') {
    assert(!!shot!.backgroundVisualAssetId, 'library mode stores backgroundVisualAssetId')
    const asset = (pipeline.visualAssets || []).find((a) => a.id === shot!.backgroundVisualAssetId)
    assert(!!asset, 'backgroundVisualAssetId must point at a visual asset')
    const gameId = process.env.SHOT_BACKGROUND_GAME || 'game-test'
    assert(asset!.gameId === gameId, `asset game ${asset!.gameId} !== ${gameId}`)
    assert(!shot!.backgroundImage, 'library select must not write backgroundImage')
    if (shot!.backgroundAssetStateId) {
      const st = (pipeline.assetStates || []).find((s) => s.id === shot!.backgroundAssetStateId)
      assert(!!st && st.assetId === asset!.id, 'explicit state belongs to the asset')
      assert(resolved.path === st!.file, `explicit state.file, got ${resolved.path}`)
    } else if (asset!.defaultStateId) {
      const st = (pipeline.assetStates || []).find((s) => s.id === asset!.defaultStateId)
      assert(!!st, 'default state record')
      assert(resolved.path === st!.file, `default state.file, got ${resolved.path}`)
    } else {
      assert(resolved.path === asset!.image, `static image.png, got ${resolved.path}`)
    }
  } else {
    assert(!!shot!.backgroundImage, 'direct import stores backgroundImage')
    assert(
      shot!.backgroundImage!.startsWith('backgrounds/'),
      `direct import is studio-relative, got ${shot!.backgroundImage}`
    )
    assert(!isAbs(shot!.backgroundImage!), 'must not persist the original external source path')
    assert(!shot!.backgroundVisualAssetId, 'direct import clears library asset ref')
  }

  console.log('✓ CLI roundtrip: resolved path persisted; library/full-res or copied relative import')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
