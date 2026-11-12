/**
 * A1 audio catalog validation (no Electron decode, no mixer).
 * Run: npx tsx src/shared/storyboard/audioValidation.test.ts
 */

import type { AssetPipelineProject, AudioAsset, EventBinding, StoryboardShot } from '../types/assetPipeline'
import {
  AUDIO_KINDS,
  audioAssetsForGame,
  collectAudioUsage,
  formatAudioInUseError,
  isSupportedAudioMedia,
  parseAudioKind,
  unsupportedAudioMediaMessage
} from './audioValidation'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

const now = '2026-01-01T00:00:00.000Z'

function audio(partial: Partial<AudioAsset> & Pick<AudioAsset, 'id' | 'gameId'>): AudioAsset {
  return {
    name: 'Hit',
    kind: 'sfx',
    tags: [],
    file: '/tmp/audio/hit.wav',
    durationSec: 0.5,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

function testKindsAndExtensions() {
  assert(AUDIO_KINDS.includes('music') && AUDIO_KINDS.includes('sfx'), 'kinds')
  assert(parseAudioKind('music') === 'music', 'music')
  assert(parseAudioKind('SFX') === 'sfx', 'sfx case')
  try {
    parseAudioKind('voice')
    throw new Error('expected throw')
  } catch (err) {
    assert(String(err).includes('music') || String(err).includes("sfx"), 'bad kind')
  }
  assert(isSupportedAudioMedia('a.wav'), 'wav')
  assert(isSupportedAudioMedia('a.ogg'), 'ogg')
  assert(isSupportedAudioMedia('a.mp3'), 'mp3')
  assert(isSupportedAudioMedia('a.m4a'), 'm4a')
  assert(!isSupportedAudioMedia('a.txt'), 'txt')
  assert(unsupportedAudioMediaMessage('x.aiff').includes('Unsupported'), 'message')
  console.log('✓ kinds and supported extensions')
}

function testGameScope() {
  const pipeline = {
    audioAssets: [
      audio({ id: 'a1', gameId: 'game-a', name: 'A' }),
      audio({ id: 'b1', gameId: 'game-b', name: 'B' })
    ]
  } as AssetPipelineProject
  const listed = audioAssetsForGame(pipeline, 'game-a')
  assert(listed.length === 1 && listed[0].id === 'a1', 'game-a only')
  console.log('✓ Game-scoped list')
}

function testDeleteGuardsForwardCompatible() {
  const unused = audio({ id: 'hit', gameId: 'game-a' })
  const pipeline = {
    audioAssets: [unused],
    storyboardShots: [] as StoryboardShot[],
    eventBindings: [] as EventBinding[]
  } as AssetPipelineProject
  assert(collectAudioUsage(pipeline, 'hit').labels.length === 0, 'unused')

  const used = {
    ...pipeline,
    storyboardShots: [
      {
        id: 'shot-a',
        name: 'Gate',
        audioTrack: [{ id: 'blk', audioId: 'hit', t: 0.2 }]
      }
    ]
  } as unknown as AssetPipelineProject
  const usage = collectAudioUsage(used, 'hit')
  assert(usage.labels.length === 1, 'shot audioTrack counts')
  assert(formatAudioInUseError('Hit', usage.labels).includes('Cannot delete'), 'error text')

  const bound = {
    ...pipeline,
    eventBindings: [{ id: 'bind-1', action: { type: 'playSfx', audioId: 'hit' } }]
  } as unknown as AssetPipelineProject
  assert(collectAudioUsage(bound, 'hit').labels.length === 1, 'playSfx counts')
  console.log('✓ delete guards (unused + forward audioTrack/playSfx)')
}

function main() {
  testKindsAndExtensions()
  testGameScope()
  testDeleteGuardsForwardCompatible()
  console.log('\nAll A1 audio validation tests passed')
}

main()
