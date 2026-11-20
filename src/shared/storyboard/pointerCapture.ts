/**
 * Pointer capture lifecycle for canvas + timeline.
 *
 * React nulls `event.currentTarget` after an async handler's first `await`.
 * Releasing capture after persist therefore throws and leaves the pointer
 * captured on the timeline, so later canvas clicks never select layers.
 * Release synchronously on pointerup/cancel, before any await.
 */

export type PointerSessionEvent = {
  pointerId: number
  currentTarget: EventTarget | null
}

export type PointerSession = {
  target: EventTarget | null
  pointerId: number
}

export const LAYER_DRAG_THRESHOLD_PX = 3

export function isDragPastThreshold(
  pixelDx: number,
  pixelDy: number,
  thresholdPx = LAYER_DRAG_THRESHOLD_PX
): boolean {
  return Math.abs(pixelDx) >= thresholdPx || Math.abs(pixelDy) >= thresholdPx
}

export function snapshotPointerSession(e: PointerSessionEvent): PointerSession {
  return { target: e.currentTarget, pointerId: e.pointerId }
}

export function isPointerCaptureHeld(target: EventTarget | null, pointerId: number): boolean {
  if (!target || typeof (target as Element).hasPointerCapture !== 'function') return false
  try {
    return (target as Element).hasPointerCapture(pointerId)
  } catch {
    return false
  }
}

export function releasePointerCaptureIfHeld(target: EventTarget | null, pointerId: number): boolean {
  if (!isPointerCaptureHeld(target, pointerId)) return false
  try {
    ;(target as Element).releasePointerCapture(pointerId)
    return true
  } catch {
    return false
  }
}

/**
 * Snapshot + release. Must run in the synchronous portion of pointerup/cancel.
 * Safe to call again (unmount / finally) if capture is already gone.
 */
export function endPointerCaptureNow(e: PointerSessionEvent): PointerSession {
  const session = snapshotPointerSession(e)
  releasePointerCaptureIfHeld(session.target, session.pointerId)
  return session
}

/**
 * Models the editor contract: persist may be async; capture must already be
 * released so a later canvas click is not retargeted to the timeline.
 */
export async function finishPointerGestureAfterAsync<T>(
  e: PointerSessionEvent,
  persist: () => Promise<T>
): Promise<{ session: PointerSession; persistResult: T }> {
  const session = endPointerCaptureNow(e)
  const persistResult = await persist()
  return { session, persistResult }
}

/** If any element still holds this pointer, the browser sends events there, not the canvas. */
export function pointerEventGoesTo(
  heldTarget: EventTarget | null,
  pointerId: number,
  canvas: EventTarget,
  timeline: EventTarget
): 'canvas' | 'timeline' | 'none' {
  if (isPointerCaptureHeld(timeline, pointerId)) return 'timeline'
  if (isPointerCaptureHeld(canvas, pointerId)) return 'canvas'
  if (isPointerCaptureHeld(heldTarget, pointerId)) {
    return heldTarget === timeline ? 'timeline' : heldTarget === canvas ? 'canvas' : 'none'
  }
  return 'canvas'
}
