/**
 * Six-track timeline hit-test: click selects, empty time scrubs playhead, edges trim.
 * Run: npx tsx src/shared/storyboard/timelinePointer.test.ts
 */

import { hitTestTimeline, timelineTrackAtYRatio } from './timelinePointer'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

const shot = {
  durationSec: 4,
  cameraTimes: [0.4],
  timedKeys: [{ layerId: 'layer-hero', keyId: 'key-hurt', t: 1.2 }],
  effectTimes: [2],
  clipBlocks: [{ id: 'clip-a', t: 0.5, durationSec: 1, implicit: false }],
  audioBlocks: [{ id: 'aud-a', t: 1, durationSec: 2 }],
  eventCues: [{ id: 'cue-touch', t: 1.2 }]
}

function hit(xRatio: number, yRatio: number) {
  return hitTestTimeline({ ...shot, xRatio, yRatio })
}

function testTrackBands(): void {
  assert(timelineTrackAtYRatio(0.08) === 'camera', 'camera band')
  assert(timelineTrackAtYRatio(0.25) === 'pose', 'pose band')
  assert(timelineTrackAtYRatio(0.42) === 'effects', 'effects band')
  assert(timelineTrackAtYRatio(0.58) === 'clips', 'clips band')
  assert(timelineTrackAtYRatio(0.75) === 'audio', 'audio band')
  assert(timelineTrackAtYRatio(0.92) === 'events', 'events band')
  console.log('✓ six timeline track bands')
}

function testMarkerClicksSelect(): void {
  const cam = hit(0.4 / 4, 0.08)
  assert(cam.kind === 'camera' && cam.index === 0, 'camera key click')
  const pose = hit(1.2 / 4, 0.25)
  assert(pose.kind === 'timedKey' && pose.keyId === 'key-hurt', 'pose key click')
  const fx = hit(2 / 4, 0.42)
  assert(fx.kind === 'effect' && fx.index === 0, 'effect click')
  const clip = hit((0.5 + 0.5) / 4, 0.58)
  assert(clip.kind === 'clipBlock' && clip.blockId === 'clip-a' && clip.clipDrag === 'move', 'clip body is move')
  const audio = hit((1 + 1) / 4, 0.75)
  assert(audio.kind === 'audioBlock' && audio.blockId === 'aud-a' && audio.clipDrag === 'move', 'audio body is move')
  const cue = hit(1.2 / 4, 0.92)
  assert(cue.kind === 'eventCue' && cue.cueId === 'cue-touch', 'event cue click')
  console.log('✓ click on each of 6 tracks selects the item')
}

function testEmptyTrackIsPlayhead(): void {
  const camEmpty = hit(0.9, 0.08)
  assert(camEmpty.kind === 'playhead' && camEmpty.track === 'camera', 'empty camera → playhead')
  const poseEmpty = hit(0.05, 0.25)
  assert(poseEmpty.kind === 'playhead' && poseEmpty.track === 'pose', 'empty pose → playhead')
  const fxEmpty = hit(0.1, 0.42)
  assert(fxEmpty.kind === 'playhead' && fxEmpty.track === 'effects', 'empty effects → playhead')
  const clipEmpty = hit(0.95, 0.58)
  assert(clipEmpty.kind === 'playhead' && clipEmpty.track === 'clips', 'empty clips → playhead')
  const audioEmpty = hit(0.05, 0.75)
  assert(audioEmpty.kind === 'playhead' && audioEmpty.track === 'audio', 'empty audio → playhead')
  const eventsEmpty = hit(0.9, 0.92)
  assert(eventsEmpty.kind === 'playhead' && eventsEmpty.track === 'events', 'empty events → playhead')
  console.log('✓ empty track time scrubs playhead (click, not item drag)')
}

function testTrimEdgesVsMove(): void {
  const clipStart = 0.5 / 4
  const clipEnd = 1.5 / 4
  const trimIn = hit(clipStart + 0.002, 0.58)
  assert(trimIn.kind === 'clipBlock' && trimIn.clipDrag === 'trimIn', 'clip left edge trimIn')
  const trimOut = hit(clipEnd - 0.002, 0.58)
  assert(trimOut.kind === 'clipBlock' && trimOut.clipDrag === 'trimOut', 'clip right edge trimOut')
  const audioStart = 1 / 4
  const audioEnd = 3 / 4
  const aIn = hit(audioStart + 0.001, 0.75)
  assert(aIn.kind === 'audioBlock' && aIn.clipDrag === 'trimIn', 'audio left edge trimIn')
  const aOut = hit(audioEnd - 0.001, 0.75)
  assert(aOut.kind === 'audioBlock' && aOut.clipDrag === 'trimOut', 'audio right edge trimOut')
  console.log('✓ clip/audio edges trim; body moves')
}

function testImplicitClipSelectsWithoutTrim(): void {
  const result = hitTestTimeline({
    ...shot,
    clipBlocks: [{ id: 'imp', t: 0, durationSec: 2, implicit: true }],
    xRatio: 0.002,
    yRatio: 0.58
  })
  assert(result.kind === 'clipBlock' && result.implicit && result.clipDrag === 'move', 'implicit clip is select, not trim')
  console.log('✓ implicit clip click selects without starting a trim')
}

function testTopmostBlockWins(): void {
  const result = hitTestTimeline({
    durationSec: 4,
    xRatio: 0.5,
    yRatio: 0.75,
    cameraTimes: [],
    timedKeys: [],
    effectTimes: [],
    clipBlocks: [],
    audioBlocks: [
      { id: 'under', t: 0, durationSec: 4 },
      { id: 'over', t: 1.5, durationSec: 1 }
    ]
  })
  assert(result.kind === 'audioBlock' && result.blockId === 'over', 'later overlapping audio wins')
  console.log('✓ overlapping blocks: last (top) wins')
}

function testFiveTrackHitsStayUnambiguous(): void {
  assert(hit(0.4 / 4, 0.1).kind === 'camera', 'legacy camera y still camera')
  assert(hit(1.2 / 4, 0.3).kind === 'timedKey', 'legacy pose y still pose')
  const midClip = hit((0.5 + 0.5) / 4, 0.55)
  assert(midClip.kind === 'clipBlock', 'clip band still clips at 0.55')
  const midAudio = hit((1 + 1) / 4, 0.72)
  assert(midAudio.kind === 'audioBlock', 'audio band still audio at 0.72')
  console.log('✓ original 5-track hits remain unambiguous at mid-band ratios')
}

function main(): void {
  testTrackBands()
  testMarkerClicksSelect()
  testEmptyTrackIsPlayhead()
  testTrimEdgesVsMove()
  testImplicitClipSelectsWithoutTrim()
  testTopmostBlockWins()
  testFiveTrackHitsStayUnambiguous()
  console.log('\nAll timeline pointer hit tests passed')
}

main()
