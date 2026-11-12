/**
 * Layer stack reorder. Run: npx tsx src/shared/storyboard/layerStack.test.ts
 */

import type { StoryboardLayer } from '../types/assetPipeline'
import {
  layersFrontToBack,
  moveLayerInStack,
  reorderLayerToIndex,
  toggleLayerVisible
} from './layerStack'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function layer(id: string, zOrder: number): StoryboardLayer {
  return {
    id,
    zOrder,
    visible: true,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    flipX: false,
    opacity: 1,
    visualAssetId: `asset-${id}`
  }
}

function testFrontToBackAndMove(): void {
  const layers = [layer('a', 1), layer('c', 14), layer('b', 10)]
  const front = layersFrontToBack(layers)
  assert(front.map((l) => l.id).join('') === 'cba', 'display order high-z first')
  const upB = moveLayerInStack(layers, 'b', 'front')
  assert(
    layersFrontToBack(upB).map((l) => l.id).join('') === 'bca',
    'front button moves toward top of list'
  )
  assert(upB.find((l) => l.id === 'b')!.zOrder > upB.find((l) => l.id === 'c')!.zOrder, 'z increased')
  const downC = moveLayerInStack(layers, 'c', 'back')
  assert(layersFrontToBack(downC)[0].id === 'b', 'back moves toward bottom')
  console.log('✓ front-to-back display + up/down')
}

function testDragReorderAndVisibility(): void {
  const layers = [layer('a', 1), layer('b', 2), layer('c', 3)]
  const dragged = reorderLayerToIndex(layers, 'a', 0)
  assert(layersFrontToBack(dragged)[0].id === 'a', 'drag to front')
  assert(
    dragged.map((l) => l.zOrder).sort().join(',') === '1,2,3',
    'z compacted 1..n'
  )
  const hidden = toggleLayerVisible(layers, 'b', false)
  assert(hidden.find((l) => l.id === 'b')!.visible === false, 'eye toggle')
  assert(hidden.find((l) => l.id === 'a')!.visible === true, 'others unchanged')
  const noop = moveLayerInStack(layers, 'c', 'front')
  assert(layersFrontToBack(noop)[0].id === 'c', 'already front')
  console.log('✓ drag reorder + visibility; no lock field')
}

function main(): void {
  testFrontToBackAndMove()
  testDragReorderAndVisibility()
  console.log('\nAll layer stack tests passed')
}

main()
