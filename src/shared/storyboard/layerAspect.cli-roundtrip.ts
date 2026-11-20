/**
 * Isolated CLI roundtrip: wide/tall/square source sizes vs stale thumb box.
 * Expects FORGE_DATA_DIR from test-layer-aspect-mac.sh.
 */

import { getAssetPipeline } from '../../core/storage/studioStorage'
import { planLayerDraw } from './layerRender'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function approx(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) > 1) {
    throw new Error(`${message}: expected ~${expected}, got ${actual}`)
  }
}

async function main() {
  const pipeline = await getAssetPipeline()
  const shot = (pipeline.storyboardShots || []).find((s) => s.name === 'Aspect Shot')
  assert(!!shot, 'Aspect Shot missing')

  const wide = (pipeline.visualAssets || []).find((a) => a.name === 'Wide Housing')
  assert(!!wide, 'Wide Housing missing')
  assert(wide!.pixelSize?.width === 200 && wide!.pixelSize?.height === 40, `static pixelSize source, got ${JSON.stringify(wide!.pixelSize)}`)
  assert(wide!.pixelSize?.width !== 256 || wide!.pixelSize?.height !== 256, 'static pixelSize must not be thumb 256²')

  const strip = (pipeline.visualAssets || []).find((a) => a.name === 'Lock Strip')
  assert(!!strip, 'Lock Strip missing')
  const locked = (pipeline.assetStates || []).find((s) => s.assetId === strip!.id && s.name === 'Locked')
  assert(!!locked?.boundingBox, 'Locked boundingBox')
  assert(
    locked!.boundingBox!.width === 200 && locked!.boundingBox!.height === 40,
    `state boundingBox must be source 200x40, got ${JSON.stringify(locked!.boundingBox)}`
  )

  const wideLayer = (shot!.layers || []).find((l) => l.visualAssetId === wide!.id)
  assert(!!wideLayer, 'wide layer')
  const widePlan = planLayerDraw(wideLayer!, pipeline, 'game-test')
  approx(widePlan.pixelSize.width, 200 * wideLayer!.scale, 'wide plan w')
  approx(widePlan.pixelSize.height, 40 * wideLayer!.scale, 'wide plan h')
  assert(wideLayer!.scale !== undefined, 'scale present')

  const stripLayer = (shot!.layers || []).find((l) => l.visualAssetId === strip!.id)
  assert(!!stripLayer, 'strip layer')
  const stripPlan = planLayerDraw(stripLayer!, pipeline, 'game-test')
  approx(stripPlan.pixelSize.width, 200 * stripLayer!.scale, 'strip plan w')
  approx(stripPlan.pixelSize.height, 40 * stripLayer!.scale, 'strip plan h')

  const stale = (pipeline.assetStates || []).find((s) => s.name === 'StaleThumb')
  if (stale) {
    const natural = planLayerDraw(
      { ...stripLayer!, assetStateId: stale.id, visualAssetId: strip!.id },
      pipeline,
      'game-test',
      { naturalSize: { width: 200, height: 40 } }
    )
    approx(natural.pixelSize.height, 40 * stripLayer!.scale, 'decoded size wins over stale 256²')
  }

  console.log('✓ CLI roundtrip: source pixelSize/boundingBox; draw contain; stale thumb overridden')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
