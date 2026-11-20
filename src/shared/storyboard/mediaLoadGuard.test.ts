/**
 * Stale background / stuck video load guards.
 * Run: npx tsx src/shared/storyboard/mediaLoadGuard.test.ts
 */

import {
  backgroundSourceKey,
  clampVideoSeekTime,
  shouldApplyLoadedBackground,
  shouldClearBackgroundForKeyChange,
  shouldEvictVideoEntry,
  shouldSkipVideoReload,
  videoHasDecodableFrame
} from './mediaLoadGuard'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function simulateEditorApply(opts: {
  shotId: string
  path: string
  /** 6f28e5a regression: a later selectedShotId effect emptied the expected key. */
  wipeExpectedKeyAfterStart?: boolean
  switchToShotId?: string
  switchToPath?: string
}): boolean {
  const loadKey = backgroundSourceKey(opts.shotId, opts.path)
  let expected = loadKey
  if (opts.wipeExpectedKeyAfterStart) expected = ''
  if (opts.switchToShotId !== undefined) {
    expected = backgroundSourceKey(opts.switchToShotId, opts.switchToPath ?? opts.path)
  }
  return shouldApplyLoadedBackground(expected, loadKey)
}

function testBackgroundKeyAndStaleApply(): void {
  const a1 = backgroundSourceKey('shot-a', '/tmp/a.png')
  const a2 = backgroundSourceKey('shot-a', '/tmp/b.png')
  const b1 = backgroundSourceKey('shot-b', '/tmp/a.png')
  assert(a1 !== a2, 'different source → different key')
  assert(a1 !== b1, 'different shot → different key even with same file')
  assert(shouldApplyLoadedBackground(a1, a1), 'matching in-flight still applies')
  assert(!shouldApplyLoadedBackground(a2, a1), 'out-of-order still from previous shot ignored')
  assert(!shouldApplyLoadedBackground(b1, a1), 'previous shot bitmap ignored after switch')
  assert(!shouldApplyLoadedBackground(backgroundSourceKey('shot-a', ''), a1), 'clip-only shot rejects still')
  assert(
    !shouldApplyLoadedBackground(backgroundSourceKey('shot-a', null), backgroundSourceKey('shot-a', null)),
    'empty path never applies a bitmap'
  )
  console.log('✓ background load key ignores stale/out-of-order stills')
}

function testMatchingLoadIsAccepted(): void {
  const path = 'backgrounds/1793895282747.png'
  assert(
    simulateEditorApply({ shotId: 'establish', path }) === true,
    'matching shot+source onload is accepted (not only stale rejected)'
  )
  assert(
    simulateEditorApply({ shotId: 'establish', path, wipeExpectedKeyAfterStart: true }) === false,
    'emptying expected key after load start would reject the matching still'
  )
  assert(
    simulateEditorApply({
      shotId: 'establish',
      path,
      switchToShotId: 'other',
      switchToPath: 'backgrounds/other.png'
    }) === false,
    'previous shot onload rejected after a real shot switch'
  )
  const same = backgroundSourceKey('establish', path)
  assert(
    !shouldClearBackgroundForKeyChange(same, same),
    'same shot+source does not blank the displayed still'
  )
  assert(
    shouldClearBackgroundForKeyChange(same, backgroundSourceKey('other', path)),
    'shot switch blanks immediately so the previous still cannot stick'
  )
  console.log('✓ matching still load is accepted; wipe/stale still rejected')
}

function testStuckVideoEvictAndRetry(): void {
  const needed = { clipId: 'clip-1', file: '/tmp/a.mp4' }
  const ready = { clipId: 'clip-1', file: '/tmp/a.mp4', status: 'ready' as const }
  assert(shouldSkipVideoReload(ready, needed, 1000), 'ready same file skipped')
  const loading = {
    clipId: 'clip-1',
    file: '/tmp/a.mp4',
    status: 'loading' as const,
    loadingStartedAt: 0
  }
  assert(shouldSkipVideoReload(loading, needed, 100), 'fresh loading skipped')
  assert(shouldEvictVideoEntry(loading, needed, 9000), 'stuck loading evicted')
  assert(!shouldSkipVideoReload(loading, needed, 9000), 'stuck loading retried')
  const moved = { clipId: 'clip-1', file: '/tmp/other.mp4', status: 'ready' as const }
  assert(shouldEvictVideoEntry(moved, needed, 0), 'file change evicted')
  const other = { clipId: 'clip-2', file: '/tmp/a.mp4', status: 'ready' as const }
  assert(shouldEvictVideoEntry(other, needed, 0), 'wrong clipId evicted')
  console.log('✓ stuck/stale video entries evicted for retry')
}

function testSeekClampAndDecodableFrame(): void {
  assert(clampVideoSeekTime(-1, 0.12) === 0.12, 'clamp to first presentable')
  assert(clampVideoSeekTime(0, 0) === 0, 't=0 allowed when seekable starts at 0')
  assert(clampVideoSeekTime(9, 0, 4) === 4, 'clamp to seekable end')
  assert(videoHasDecodableFrame(2, 320), 'HAVE_CURRENT_DATA + width is a frame')
  assert(!videoHasDecodableFrame(2, 0), 'readyState without width is not a frame')
  assert(!videoHasDecodableFrame(1, 320), 'HAVE_METADATA only is not a frame')
  console.log('✓ seek clamp + decodable-frame check')
}

function main(): void {
  testBackgroundKeyAndStaleApply()
  testMatchingLoadIsAccepted()
  testStuckVideoEvictAndRetry()
  testSeekClampAndDecodableFrame()
  console.log('\nAll media load guard tests passed')
}

main()
