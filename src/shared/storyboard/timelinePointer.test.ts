/**
 * Seven-track timeline hit-test: click selects, empty time scrubs playhead, edges trim.
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
  eventCues: [{ id: 'cue-touch', t: 1.2 }],
  backgroundKeys: [{ id: 'bgk-1', t: 1.5 }],
  layerRange: { layerId: 'layer-hero', fromSec: 0.5, toSec: 3 }
}

function hit(xRatio: number, yRatio: number) {
  return hitTestTimeline({ ...shot, xRatio, yRatio })
}

function testTrackBands(): void {
  assert(timelineTrackAtYRatio(0.07) === 'camera', 'camera band')
  assert(timelineTrackAtYRatio(0.21) === 'background', 'background band')
  assert(timelineTrackAtYRatio(0.36) === 'pose', 'pose band')
  assert(timelineTrackAtYRatio(0.5) === 'effects', 'effects band')
  assert(timelineTrackAtYRatio(0.64) === 'clips', 'clips band')
  assert(timelineTrackAtYRatio(0.78) === 'audio', 'audio band')
  assert(timelineTrackAtYRatio(0.93) === 'events', 'events band')
  console.log('✓ seven timeline track bands')
}

function testMarkerClicksSelect(): void {
  const cam = hit(0.4 / 4, 0.07)
  assert(cam.kind === 'camera' && cam.index === 0, 'camera key click')
  const bg = hit(1.5 / 4, 0.21)
  assert(bg.kind === 'backgroundKey' && bg.keyId === 'bgk-1', 'background key click')
  const pose = hit(1.2 / 4, 0.36)
  assert(pose.kind === 'timedKey' && pose.keyId === 'key-hurt', 'pose key click')
  const fx = hit(2 / 4, 0.5)
  assert(fx.kind === 'effect' && fx.index === 0, 'effect click')
  const clip = hit((0.5 + 0.5) / 4, 0.64)
  assert(clip.kind === 'clipBlock' && clip.blockId === 'clip-a' && clip.clipDrag === 'move', 'clip body is move')
  const audio = hit((1 + 1) / 4, 0.78)
  assert(audio.kind === 'audioBlock' && audio.blockId === 'aud-a' && audio.clipDrag === 'move', 'audio body is move')
  const cue = hit(1.2 / 4, 0.93)
  assert(cue.kind === 'eventCue' && cue.cueId === 'cue-touch', 'event cue click')
  console.log('✓ click on each of 7 tracks selects the item')
}

function testEmptyTrackIsPlayhead(): void {
  const camEmpty = hit(0.9, 0.07)
  assert(camEmpty.kind === 'playhead' && camEmpty.track === 'camera', 'empty camera → playhead')
  const bgEmpty = hit(0.05, 0.21)
  assert(bgEmpty.kind === 'playhead' && bgEmpty.track === 'background', 'empty background → playhead')
  const poseEmpty = hit(0.05, 0.36)
  assert(poseEmpty.kind === 'playhead' && poseEmpty.track === 'pose', 'empty pose → playhead')
  const fxEmpty = hit(0.1, 0.5)
  assert(fxEmpty.kind === 'playhead' && fxEmpty.track === 'effects', 'empty effects → playhead')
  const clipEmpty = hit(0.95, 0.64)
  assert(clipEmpty.kind === 'playhead' && clipEmpty.track === 'clips', 'empty clips → playhead')
  const audioEmpty = hit(0.05, 0.78)
  assert(audioEmpty.kind === 'playhead' && audioEmpty.track === 'audio', 'empty audio → playhead')
  const eventsEmpty = hit(0.9, 0.93)
  assert(eventsEmpty.kind === 'playhead' && eventsEmpty.track === 'events', 'empty events → playhead')
  console.log('✓ empty track time scrubs playhead (click, not item drag)')
}

function testTrimEdgesVsMove(): void {
  const clipStart = 0.5 / 4
  const clipEnd = 1.5 / 4
  const trimIn = hit(clipStart + 0.002, 0.64)
  assert(trimIn.kind === 'clipBlock' && trimIn.clipDrag === 'trimIn', 'clip left edge trimIn')
  const trimOut = hit(clipEnd - 0.002, 0.64)
  assert(trimOut.kind === 'clipBlock' && trimOut.clipDrag === 'trimOut', 'clip right edge trimOut')
  const audioStart = 1 / 4
  const audioEnd = 3 / 4
  const aIn = hit(audioStart + 0.001, 0.78)
  assert(aIn.kind === 'audioBlock' && aIn.clipDrag === 'trimIn', 'audio left edge trimIn')
  const aOut = hit(audioEnd - 0.001, 0.78)
  assert(aOut.kind === 'audioBlock' && aOut.clipDrag === 'trimOut', 'audio right edge trimOut')
  console.log('✓ clip/audio edges trim; body moves')
}

function testLayerRangeEdges(): void {
  const from = 0.5 / 4
  const to = 3 / 4
  const left = hit(from + 0.001, 0.36)
  assert(left.kind === 'layerRange' && left.clipDrag === 'trimIn' && left.layerId === 'layer-hero', 'range left trim')
  const right = hit(to - 0.001, 0.36)
  assert(right.kind === 'layerRange' && right.clipDrag === 'trimOut', 'range right trim')
  const body = hit((0.5 + 1.5) / 4, 0.36)
  assert(body.kind === 'playhead' && body.track === 'pose', 'range body does not steal playhead')
  const poseWins = hit(1.2 / 4, 0.36)
  assert(poseWins.kind === 'timedKey', 'pose key still wins over range')
  console.log('✓ selected-layer range edges trim; body scrubs; pose keys win')
}

function testImplicitClipSelectsWithoutTrim(): void {
  const result = hitTestTimeline({
    ...shot,
    clipBlocks: [{ id: 'imp', t: 0, durationSec: 2, implicit: true }],
    xRatio: 0.002,
    yRatio: 0.64
  })
  assert(result.kind === 'clipBlock' && result.implicit && result.clipDrag === 'move', 'implicit clip is select, not trim')
  console.log('✓ implicit clip click selects without starting a trim')
}

function testTopmostBlockWins(): void {
  const result = hitTestTimeline({
    durationSec: 4,
    xRatio: 0.5,
    yRatio: 0.78,
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

function testInsertedBackgroundTrackKeepsNeighbors(): void {
  assert(hit(0.4 / 4, 0.07).kind === 'camera', 'camera still top band')
  assert(hit(1.5 / 4, 0.21).kind === 'backgroundKey', 'new background band under camera')
  assert(hit(1.2 / 4, 0.36).kind === 'timedKey', 'pose sits under background')
  const midClip = hit((0.5 + 0.5) / 4, 0.64)
  assert(midClip.kind === 'clipBlock', 'clip band at 0.64')
  const midAudio = hit((1 + 1) / 4, 0.78)
  assert(midAudio.kind === 'audioBlock', 'audio band at 0.78')
  console.log('✓ inserting background keeps camera/pose/clip/audio unambiguous at mid-band ratios')
}

function main(): void {
  testTrackBands()
  testMarkerClicksSelect()
  testEmptyTrackIsPlayhead()
  testTrimEdgesVsMove()
  testLayerRangeEdges()
  testImplicitClipSelectsWithoutTrim()
  testTopmostBlockWins()
  testInsertedBackgroundTrackKeepsNeighbors()
  console.log('\nAll timeline pointer hit tests passed')
}

main()
