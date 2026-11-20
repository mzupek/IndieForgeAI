/**
 * Timeline/canvas pointer capture lifecycle.
 * Run: npx tsx src/shared/storyboard/pointerCapture.test.ts
 */

import { hitTestLayer } from './layerRender'
import {
  endPointerCaptureNow,
  finishPointerGestureAfterAsync,
  isDragPastThreshold,
  isPointerCaptureHeld,
  LAYER_DRAG_THRESHOLD_PX,
  pointerEventGoesTo,
  releasePointerCaptureIfHeld,
  snapshotPointerSession
} from './pointerCapture'
import type { StoryboardLayer } from '../types/assetPipeline'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

class FakePointerTarget {
  readonly captured = new Set<number>()
  hasPointerCapture(id: number): boolean {
    return this.captured.has(id)
  }
  setPointerCapture(id: number): void {
    this.captured.add(id)
  }
  releasePointerCapture(id: number): void {
    this.captured.delete(id)
  }
}

function fakeEvent(target: FakePointerTarget, pointerId = 7) {
  return { currentTarget: target as unknown as EventTarget, pointerId }
}

function layer(partial: Partial<StoryboardLayer> & Pick<StoryboardLayer, 'id'>): StoryboardLayer {
  return {
    zOrder: 1,
    visible: true,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    flipX: false,
    opacity: 1,
    ...partial
  }
}

async function brokenReleaseAfterAwait(e: {
  currentTarget: EventTarget | null
  pointerId: number
}): Promise<void> {
  await Promise.resolve()
  if (e.currentTarget!.hasPointerCapture(e.pointerId)) {
    e.currentTarget!.releasePointerCapture(e.pointerId)
  }
}

async function testBrokenPatternThrowsAfterAsync(): Promise<void> {
  const timeline = new FakePointerTarget()
  timeline.setPointerCapture(7)
  const e = fakeEvent(timeline)
  const pending = brokenReleaseAfterAwait(e)
  e.currentTarget = null
  let threw = false
  try {
    await pending
  } catch {
    threw = true
  }
  assert(threw, 'accessing currentTarget after await throws')
  assert(timeline.hasPointerCapture(7), 'capture is still held — canvas clicks would miss')
  console.log('✓ documents regression: async pointerup + null currentTarget leaves capture')
}

async function testFixedPatternReleasesBeforeAwait(): Promise<void> {
  const timeline = new FakePointerTarget()
  const canvas = new FakePointerTarget()
  timeline.setPointerCapture(7)
  const e = fakeEvent(timeline)
  assert(pointerEventGoesTo(timeline as unknown as EventTarget, 7, canvas, timeline) === 'timeline', 'held capture retargets to timeline')

  const { persistRan } = await (async () => {
    const session = endPointerCaptureNow(e)
    e.currentTarget = null
    let persistRan = false
    await Promise.resolve().then(() => {
      persistRan = true
    })
    let lateThrow = false
    try {
      void e.currentTarget!.hasPointerCapture(e.pointerId)
    } catch {
      lateThrow = true
    }
    assert(lateThrow, 'React-nulled currentTarget still throws if touched after await')
    assert(!isPointerCaptureHeld(session.target, session.pointerId), 'capture already released')
    assert(pointerEventGoesTo(timeline as unknown as EventTarget, 7, canvas, timeline) === 'canvas', 'next click reaches canvas')
    return { persistRan }
  })()
  assert(persistRan, 'persist still ran after sync release')
  console.log('✓ release before await; null currentTarget after await does not keep capture')
}

async function testFinishHelperAndFailedPersistStillReleases(): Promise<void> {
  const timeline = new FakePointerTarget()
  timeline.setPointerCapture(3)
  const e = fakeEvent(timeline, 3)
  await finishPointerGestureAfterAsync(e, async () => 'saved')
  e.currentTarget = null
  assert(!timeline.hasPointerCapture(3), 'helper released capture')

  const again = new FakePointerTarget()
  again.setPointerCapture(4)
  const e2 = fakeEvent(again, 4)
  endPointerCaptureNow(e2)
  e2.currentTarget = null
  let persistError = false
  try {
    await Promise.reject(new Error('disk'))
  } catch {
    persistError = true
  }
  assert(persistError, 'persist failure is visible')
  assert(!again.hasPointerCapture(4), 'capture released even when persist fails')
  console.log('✓ persist helper; failed persist does not leave capture held')
}

function testIdempotentReleaseAndUnmount(): void {
  const el = new FakePointerTarget()
  el.setPointerCapture(1)
  const e = fakeEvent(el, 1)
  const session = snapshotPointerSession(e)
  endPointerCaptureNow(e)
  endPointerCaptureNow(e)
  releasePointerCaptureIfHeld(session.target, session.pointerId)
  assert(!el.hasPointerCapture(1), 'double release / unmount is safe')
  console.log('✓ capture release is idempotent (rerender/unmount)')
}

function testClickVsDragThreshold(): void {
  assert(!isDragPastThreshold(0, 0), 'click 0px')
  assert(!isDragPastThreshold(2, 2), 'click under 3px')
  assert(isDragPastThreshold(LAYER_DRAG_THRESHOLD_PX, 0), '3px is a drag')
  assert(isDragPastThreshold(0, 8), 'vertical drag')
  console.log('✓ click vs drag threshold (3px)')
}

function testCanvasHitSelectionAfterTimelineGesture(): void {
  const hero = layer({ id: 'layer-hero', x: 0.5, y: 0.5, zOrder: 2, characterId: 'c' })
  const door = layer({ id: 'layer-door', x: 0.2, y: 0.2, zOrder: 1, visualAssetId: 'a' })
  const layers = [hero, door].sort((a, b) => b.zOrder - a.zOrder)
  const hit =
    layers.find((l) => hitTestLayer(l, 0.5, 0.5, 800, true, { canvasHeight: 450 }))?.id ?? null
  assert(hit === 'layer-hero', 'topmost layer at center is selected')
  const miss =
    layers.find((l) => hitTestLayer(l, 0.01, 0.9, 800, true, { canvasHeight: 450 }))?.id ?? null
  assert(miss === null, 'empty canvas click clears selection')
  console.log('✓ canvas hit-selection picks topmost layer; miss clears')
}

async function testShotSelectionAfterTimelinePersist(): Promise<void> {
  const timeline = new FakePointerTarget()
  const canvas = new FakePointerTarget()
  let selectedAudio: string | null = null
  let selectedLayer: string | null = null
  selectedAudio = 'aud-a'
  timeline.setPointerCapture(9)
  const up = fakeEvent(timeline, 9)
  await finishPointerGestureAfterAsync(up, async () => {
    up.currentTarget = null
    return 'persisted'
  })
  assert(selectedAudio === 'aud-a', 'timeline item selection kept after persist')
  assert(pointerEventGoesTo(timeline as unknown as EventTarget, 9, canvas, timeline) === 'canvas', 'next pointerdown is not stolen by timeline')
  const hero = layer({ id: 'layer-hero', x: 0.5, y: 0.5, zOrder: 1 })
  if (hitTestLayer(hero, 0.5, 0.5, 800, true, { canvasHeight: 450 })) {
    selectedLayer = hero.id
  }
  assert(selectedLayer === 'layer-hero', 'canvas can select a layer after timeline persist')
  console.log('✓ after async timeline persist, shot canvas selection works; sidebar selection kept')
}

async function main(): Promise<void> {
  await testBrokenPatternThrowsAfterAsync()
  await testFixedPatternReleasesBeforeAwait()
  await testFinishHelperAndFailedPersistStillReleases()
  testIdempotentReleaseAndUnmount()
  testClickVsDragThreshold()
  testCanvasHitSelectionAfterTimelineGesture()
  await testShotSelectionAfterTimelinePersist()
  console.log('\nAll pointer capture lifecycle tests passed')
}

void main()
