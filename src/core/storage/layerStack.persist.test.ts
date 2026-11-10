/**
 * Persist Photoshop-style layer reorder via updateShot.
 * Isolated tmpdir + FORGE_DATA_DIR. Does not touch real studio data.
 * Run: npx tsx src/core/storage/layerStack.persist.test.ts
 */

import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { getAssetPipeline, updateAssetPipeline } from './studioStorage'
import { addLayer, createShot, createStoryboard, getShot, updateShot } from './storyboardService'
import { reorderLayerToIndex, toggleLayerVisible } from '../../shared/storyboard/layerStack'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

async function main(): Promise<void> {
  const dir = join(tmpdir(), `forge-layer-stack-${randomUUID()}`)
  const previous = process.env.FORGE_DATA_DIR
  process.env.FORGE_DATA_DIR = dir
  await mkdir(dir, { recursive: true })
  const now = new Date().toISOString()
  try {
    const pipeline = await getAssetPipeline(dir)
    pipeline.games.push({
      id: 'game-a',
      name: 'Game A',
      engine: 'unity',
      exportRoot: './exports',
      createdAt: now,
      updatedAt: now
    })
    pipeline.visualAssets = pipeline.visualAssets || []
    pipeline.visualAssets.push({
      id: 'vis-a',
      gameId: 'game-a',
      name: 'Door',
      category: 'prop',
      tags: [],
      defaultStateId: null,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    })
    await updateAssetPipeline(pipeline, dir)

    const sb = await createStoryboard('game-a', { name: 'SB', dataDirOverride: dir })
    const shot = await createShot(sb.id, { name: 'Shot', dataDirOverride: dir })
    const a = await addLayer(
      shot.id,
      {
        zOrder: 1,
        visualAssetId: 'vis-a',
        visible: true,
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        flipX: false,
        opacity: 1
      },
      dir
    )
    const b = await addLayer(
      shot.id,
      {
        zOrder: 2,
        visualAssetId: 'vis-a',
        visible: true,
        x: 0.4,
        y: 0.5,
        scale: 1,
        rotation: 0,
        flipX: false,
        opacity: 1
      },
      dir
    )
    const loaded = await getShot(shot.id, dir)
    assert(!!loaded, 'shot exists')
    const broughtFront = reorderLayerToIndex(loaded!.layers, a.id, 0)
    assert(broughtFront.find((l) => l.id === a.id)!.zOrder > broughtFront.find((l) => l.id === b.id)!.zOrder, 'a in front')
    await updateShot(shot.id, { layers: broughtFront }, dir)
    const afterReorder = await getShot(shot.id, dir)
    assert(afterReorder!.layers.find((l) => l.id === a.id)!.zOrder === 2, 'persisted z 2')
    assert(afterReorder!.layers.find((l) => l.id === b.id)!.zOrder === 1, 'persisted z 1')

    const hidden = toggleLayerVisible(afterReorder!.layers, b.id, false)
    await updateShot(shot.id, { layers: hidden }, dir)
    const afterHide = await getShot(shot.id, dir)
    assert(afterHide!.layers.find((l) => l.id === b.id)!.visible === false, 'visibility persisted')
    console.log('✓ updateShot persists layer z-order and visibility (isolated FORGE_DATA_DIR)')
  } finally {
    if (previous === undefined) delete process.env.FORGE_DATA_DIR
    else process.env.FORGE_DATA_DIR = previous
    await rm(dir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
