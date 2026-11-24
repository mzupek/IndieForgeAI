/**
 * Storyboard data model validation tests
 * Run with: npx tsx src/shared/types/storyboard.test.ts
 */

import type {
  Storyboard,
  StoryboardShot,
  StoryboardLayer,
  CameraKeyframe,
  EffectMarker
} from './assetPipeline'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function testStoryboardStructure() {
  const storyboard: Storyboard = {
    id: 'sb-test',
    gameId: 'game-test',
    name: 'Test Storyboard',
    description: 'Test description',
    shotIds: ['shot-1', 'shot-2'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  assert(storyboard.id === 'sb-test', 'Storyboard ID')
  assert(storyboard.shotIds.length === 2, 'Shot count')
  console.log('✓ Storyboard structure')
}

function testShotStructure() {
  const layer: StoryboardLayer = {
    id: 'layer-1',
    zOrder: 10,
    characterId: 'char-1',
    poseId: 'pose-1',
    visible: true,
    x: 0.5,
    y: 0.5,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    opacity: 1.0
  }

  const cameraKeyframe: CameraKeyframe = {
    t: 0.0,
    target: 'layer-1',
    zoom: 1.0,
    framingRect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
  }

  const effectMarker: EffectMarker = {
    t: 1.5,
    moment: 'hit',
    presetId: 'preset-shake'
  }

  const shot: StoryboardShot = {
    id: 'shot-1',
    name: 'Test Shot',
    durationSec: 3.0,
    aspectRatio: { width: 16, height: 9 },
    layers: [layer],
    cameraTrack: [cameraKeyframe],
    effectsTrack: [effectMarker],
    eventCues: [{ id: 'cue-1', t: 1.2, eventId: 'evt-touch', schemaVersion: 1 }],
    notes: 'Test notes',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  assert(shot.layers.length === 1, 'Layer count')
  assert(shot.layers[0].x >= 0 && shot.layers[0].x <= 1, 'Layer X normalized')
  assert(shot.layers[0].y >= 0 && shot.layers[0].y <= 1, 'Layer Y normalized')
  assert(shot.layers[0].opacity >= 0 && shot.layers[0].opacity <= 1, 'Layer opacity normalized')
  assert(shot.cameraTrack.length === 1, 'Camera keyframe count')
  assert(shot.effectsTrack.length === 1, 'Effect marker count')
  assert(shot.eventCues?.length === 1, 'Event cue count')
  assert(shot.aspectRatio.width === 16, 'Aspect ratio width')
  assert(shot.aspectRatio.height === 9, 'Aspect ratio height')
  console.log('✓ Shot structure with layers, camera, effects')
}

function testLayerTypes() {
  const characterLayer: StoryboardLayer = {
    id: 'layer-char',
    zOrder: 10,
    characterId: 'char-1',
    poseId: 'pose-ready',
    visible: true,
    x: 0.3,
    y: 0.5,
    scale: 1.2,
    rotation: 15,
    flipX: true,
    opacity: 1.0
  }

  const clipLayer: StoryboardLayer = {
    id: 'layer-clip',
    zOrder: 5,
    clipId: 'clip-intro',
    visible: true,
    x: 0.7,
    y: 0.4,
    scale: 0.8,
    rotation: 0,
    flipX: false,
    opacity: 0.9
  }

  const imageLayer: StoryboardLayer = {
    id: 'layer-bg',
    zOrder: 1,
    imagePath: './backgrounds/city.png',
    visible: true,
    x: 0.5,
    y: 0.5,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    opacity: 1.0
  }

  assert(characterLayer.characterId === 'char-1', 'Character layer has characterId')
  assert(characterLayer.poseId === 'pose-ready', 'Character layer has poseId')
  assert(clipLayer.clipId === 'clip-intro', 'Clip layer has clipId')
  assert(imageLayer.imagePath === './backgrounds/city.png', 'Image layer has imagePath')
  console.log('✓ Layer types (character, clip, image)')
}

function testCameraTargets() {
  const layerTarget: CameraKeyframe = {
    t: 0.0,
    target: 'layer-1',
    zoom: 1.0
  }

  const pointTarget: CameraKeyframe = {
    t: 2.0,
    target: { x: 0.7, y: 0.3 },
    zoom: 1.5
  }

  assert(typeof layerTarget.target === 'string', 'Layer target is string')
  assert(typeof pointTarget.target === 'object', 'Point target is object')
  assert(pointTarget.target !== null && 'x' in pointTarget.target, 'Point target has x')
  assert(pointTarget.target !== null && 'y' in pointTarget.target, 'Point target has y')
  console.log('✓ Camera targets (layer ID and explicit point)')
}

function testEffectMarkers() {
  const presetEffect: EffectMarker = {
    t: 1.0,
    presetId: 'preset-shake',
    moment: 'hit'
  }

  const inlineEffect: EffectMarker = {
    t: 2.5,
    inlineType: 'flash',
    inlineParams: { intensity: 0.8, durationMs: 200 }
  }

  assert(presetEffect.presetId === 'preset-shake', 'Preset effect has presetId')
  assert(inlineEffect.inlineType === 'flash', 'Inline effect has inlineType')
  assert(inlineEffect.inlineParams !== undefined, 'Inline effect has params')
  console.log('✓ Effect markers (preset ref and inline)')
}

console.log('Running storyboard data model tests...')
testStoryboardStructure()
testShotStructure()
testLayerTypes()
testCameraTargets()
testEffectMarkers()
console.log('\n✅ All storyboard data model tests passed!')
