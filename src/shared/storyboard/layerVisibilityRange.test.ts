/**
 * Layer timed presence range. Run: npx tsx src/shared/storyboard/layerVisibilityRange.test.ts
 */

import {
  clampVisibilityRange,
  isLayerPresentAtTime,
  validateLayerVisibilityRange
} from './layerVisibilityRange'
import type { StoryboardLayer } from '../types/assetPipeline'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function assertThrows(fn: () => void, match: string, message: string): void {
  try {
    fn()
    throw new Error(`Assertion failed: ${message} (no throw)`)
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    if (text.startsWith('Assertion failed:')) throw err
    if (!text.includes(match)) {
      throw new Error(`Assertion failed: ${message} (got: ${text})`)
    }
  }
}

function layer(
  partial?: Partial<Pick<StoryboardLayer, 'visibleFromSec' | 'visibleToSec' | 'visible'>>
): Pick<StoryboardLayer, 'visibleFromSec' | 'visibleToSec' | 'visible'> {
  return { visible: true, ...partial }
}

function testDefaultWholeShot(): void {
  const l = layer()
  assert(isLayerPresentAtTime(l, 0, 4) === true, 't=0 present')
  assert(isLayerPresentAtTime(l, 2, 4) === true, 'mid present')
  assert(isLayerPresentAtTime(l, 4, 4) === true, 'end of shot present when range omitted')
  console.log('✓ omitted from/to is the whole shot (old layers unchanged)')
}

function testHalfOpen(): void {
  const l = layer({ visibleFromSec: 1, visibleToSec: 3 })
  assert(isLayerPresentAtTime(l, 0.99, 4) === false, 'before from hidden')
  assert(isLayerPresentAtTime(l, 1, 4) === true, 'at from present')
  assert(isLayerPresentAtTime(l, 2.9, 4) === true, 'just before to present')
  assert(isLayerPresentAtTime(l, 3, 4) === false, 'at to hidden (half-open)')
  assert(isLayerPresentAtTime(l, 3.5, 4) === false, 'after to hidden')
  const throughEnd = layer({ visibleFromSec: 2 })
  assert(isLayerPresentAtTime(throughEnd, 4, 4) === true, 'omitted to includes shot end')
  const untilEnd = layer({ visibleToSec: 4 })
  assert(isLayerPresentAtTime(untilEnd, 3.99, 4) === true, 'to=duration present near end')
  assert(isLayerPresentAtTime(untilEnd, 4, 4) === true, 'to=duration present at end')
  console.log('✓ half-open [from, to); duration end is inclusive')
}

function testValidateAndClamp(): void {
  validateLayerVisibilityRange(layer({ visibleFromSec: 0, visibleToSec: 4 }), 4)
  validateLayerVisibilityRange(layer(), 4)
  assertThrows(
    () => validateLayerVisibilityRange(layer({ visibleFromSec: 5 }), 4),
    'after shot duration',
    'from past duration'
  )
  assertThrows(
    () => validateLayerVisibilityRange(layer({ visibleToSec: 9 }), 4),
    'after shot duration',
    'to past duration'
  )
  assertThrows(
    () => validateLayerVisibilityRange(layer({ visibleFromSec: 3, visibleToSec: 1 }), 4),
    'after visibleToSec',
    'from after to'
  )
  const clamped = clampVisibilityRange(1.2, 1.21, 4)
  assert(clamped.to - clamped.from >= 0.05 - 1e-9, 'min range while trimming')
  console.log('✓ range validation + trim clamp')
}

function main(): void {
  testDefaultWholeShot()
  testHalfOpen()
  testValidateAndClamp()
  console.log('\nAll layer visibility range tests passed')
}

main()
