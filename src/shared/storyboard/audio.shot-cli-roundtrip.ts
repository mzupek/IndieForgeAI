/**
 * Isolated persist/reload of authored shot.audioTrack.
 * Args: shotId blockId audioId. Expects FORGE_DATA_DIR from test-shot-audio-mac.sh.
 */

import { getAssetPipeline } from '../../core/storage/studioStorage'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

async function main() {
  const [shotId, blockId, audioId] = process.argv.slice(2)
  const pipeline = await getAssetPipeline()
  const shot = (pipeline.storyboardShots || []).find((s) => s.id === shotId)
  assert(!!shot, `shot ${shotId} missing`)
  const block = (shot!.audioTrack || []).find((b) => b.id === blockId)
  assert(!!block, `block ${blockId} missing after reload`)
  assert(block!.audioId === audioId, 'audioId persisted')
  assert(block!.role === 'sfx', 'role persisted')
  assert(Math.abs(block!.t - 0.6) < 1e-9, `t persisted, got ${block!.t}`)
  assert(block!.schemaVersion === 1, 'schemaVersion')
  console.log('✓ CLI roundtrip: authored audioTrack persisted + reloaded')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
