/**
 * Event cue validation. Run: npx tsx src/shared/storyboard/eventCues.test.ts
 */

import type { AssetPipelineProject, ShotEventCue } from '../types/assetPipeline'
import {
  collectEventCueUsage,
  parseEventCueTime,
  validateEventCue
} from './eventCues'
import { eventCueOutsideDuration } from './shotDuration'

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

const now = '2026-01-01T00:00:00.000Z'

function pipeline(): AssetPipelineProject {
  return {
    schemaVersion: 1,
    id: 'proj',
    name: 'Proj',
    description: '',
    games: [{ id: 'game-a', name: 'Game', engine: 'unity', exportRoot: './exports', createdAt: now, updatedAt: now }],
    characters: [],
    poses: [],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [{ id: 'sb-a', gameId: 'game-a', name: 'SB', shotIds: ['shot-a'], createdAt: now, updatedAt: now }],
    storyboardShots: [
      {
        id: 'shot-a',
        name: 'Shot',
        durationSec: 4,
        aspectRatio: { width: 16, height: 9 },
        layers: [],
        cameraTrack: [],
        effectsTrack: [],
        eventCues: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    eventDefinitions: [
      {
        id: 'evt-touch',
        gameId: 'game-a',
        name: 'button_touch',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
    eventBindings: [
      {
        id: 'bind-sfx',
        shotId: 'shot-a',
        eventId: 'evt-touch',
        action: { type: 'playSfx', audioId: 'aud-1' },
        durationSec: 0,
        returnPolicy: 'default',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
    exportProfiles: [],
    gameDefinitions: [],
    visualAssets: [],
    assetStates: [],
    fonts: [],
    palettes: [],
    audioAssets: [],
    createdAt: now,
    updatedAt: now
  }
}

function testParseAndValidate(): void {
  const p = pipeline()
  assert(parseEventCueTime(1.25, 4) === 1.25, 'in-range time')
  assertThrows(() => parseEventCueTime(-0.1, 4), '>= 0', 'negative t')
  assertThrows(() => parseEventCueTime(5, 4), 'after shot duration', 'past end')
  const ok = validateEventCue({ t: 1, eventId: 'evt-touch' }, p, 'shot-a')
  assert(!ok.warning, 'bound event: no warning')
  p.eventBindings = []
  const warn = validateEventCue({ t: 1, eventId: 'evt-touch' }, p, 'shot-a')
  assert(!!warn.warning && warn.warning.includes('no bindings'), 'unbound event warns')
  assertThrows(
    () => validateEventCue({ t: 1, eventId: 'missing' }, p, 'shot-a'),
    'Event not found',
    'unknown event'
  )
  console.log('✓ parse + validate (exists / no bindings warn / duration)')
}

function testUsageAndShrink(): void {
  const p = pipeline()
  const cue: ShotEventCue = {
    id: 'cue-1',
    t: 3.5,
    eventId: 'evt-touch',
    schemaVersion: 1
  }
  p.storyboardShots[0].eventCues = [cue]
  const usage = collectEventCueUsage(p, 'evt-touch')
  assert(usage.cueIds[0] === 'cue-1', 'usage ids')
  assert(usage.labels[0].includes('event cue'), 'usage labels')
  assert(!eventCueOutsideDuration(cue, 4), 'fits current duration')
  assert(!!eventCueOutsideDuration(cue, 3), 'shrink guard')
  console.log('✓ cue usage + shot-shrink guard')
}

function main(): void {
  testParseAndValidate()
  testUsageAndShrink()
  console.log('\nAll event cue validation tests passed')
}

main()
