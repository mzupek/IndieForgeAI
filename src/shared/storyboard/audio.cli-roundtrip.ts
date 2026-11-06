/**
 * Isolated CLI roundtrip: imported audio is studio-owned with probed duration.
 * Expects FORGE_DATA_DIR from test-audio-library-mac.sh.
 */

import { existsSync } from 'fs'
import { getAssetPipeline } from '../../core/storage/studioStorage'
import { audioAssetsForGame, isSupportedAudioMedia } from './audioValidation'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

async function main() {
  const pipeline = await getAssetPipeline()
  const assets = audioAssetsForGame(pipeline, 'game-test')
  assert(assets.length >= 2, `expected at least wav+ogg in game-test, got ${assets.length}`)

  const wav = assets.find((a) => a.name === 'Hit Wav')
  assert(!!wav, 'Hit Wav missing')
  assert(wav!.kind === 'sfx', 'wav kind sfx')
  assert(wav!.gameId === 'game-test', 'game scoped')
  assert(isSupportedAudioMedia(wav!.file), 'wav extension supported')
  assert(existsSync(wav!.file), 'studio-owned wav exists')
  assert(wav!.file.includes('/audio/'), `copied under audio/, got ${wav!.file}`)
  assert(Math.abs(wav!.durationSec - 0.5) < 0.08, `wav duration ~0.5s, got ${wav!.durationSec}`)
  assert(wav!.tags.includes('battle'), 'tags persisted')
  assert(wav!.engineNotes === 'tile_synth', 'engineNotes persisted')

  const ogg = assets.find((a) => a.name === 'Loop Ogg')
  assert(!!ogg, 'Loop Ogg missing')
  assert(ogg!.kind === 'music', 'ogg kind music')
  assert(existsSync(ogg!.file), 'studio-owned ogg exists')
  assert(ogg!.durationSec > 0.2, `ogg duration probed, got ${ogg!.durationSec}`)

  const other = audioAssetsForGame(pipeline, 'game-other')
  assert(other.length === 0, 'other game must not see game-test audio')

  console.log('✓ CLI roundtrip: source files copied; duration probed; Game-scoped')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
