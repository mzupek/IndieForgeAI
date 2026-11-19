/**
 * Layered pose slots (1b). Isolated, no studio I/O.
 * Example keys ride/ride_boost are docs/test-only.
 */
import assert from 'node:assert/strict'
import type { Character, Game } from '../types/assetPipeline'
import { emptyGameSettings } from '../studio/schema'
import {
  CORE_POSE_SLOT_KEYS,
  assertAddablePoseSlotKey,
  assertKnownPoseSlot,
  effectivePoseSlotKeys,
  effectivePoseSlots,
  isKnownPoseSlot,
  mapFilenameToSlotKey,
  occupiedPoseSlotKeys,
  requiredPoseSlots
} from './poseSlots'
import { checkPoseCompleteness, mapFilenameToSlot } from '../poseValidation'

const now = '2026-01-01T00:00:00.000Z'

function gameWithSlots(keys: Array<{ key: string; label: string; required?: boolean }>): Game {
  return {
    id: 'game-a',
    name: 'Game A',
    engine: 'unity',
    exportRoot: './exports/a',
    settings: { ...emptyGameSettings(), poseSlots: keys },
    createdAt: now,
    updatedAt: now
  }
}

function character(partial: Partial<Character> = {}): Character {
  return {
    id: 'char-hero',
    gameId: 'game-a',
    name: 'Hero',
    role: 'player',
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...partial
  }
}

function pose(slot: string, status: 'approved' | 'draft' = 'approved') {
  return {
    id: `pose-${slot}`,
    characterId: 'char-hero',
    slot,
    file: `/tmp/${slot}.png`,
    status,
    source: 'import' as const,
    createdAt: now,
    updatedAt: now
  }
}

function testEffectiveLayers() {
  const game = gameWithSlots([{ key: 'ride', label: 'Ride' }])
  const char = character({ poseSlots: [{ key: 'ride_boost', label: 'Ride Boost' }] })
  const keys = effectivePoseSlotKeys(game, char)
  assert.deepEqual(keys.slice(0, 5), CORE_POSE_SLOT_KEYS)
  assert.equal(keys.includes('ride'), true)
  assert.equal(keys.includes('ride_boost'), true)
  const layers = effectivePoseSlots(game, char)
  assert.equal(layers.find((s) => s.key === 'ready')?.layer, 'core')
  assert.equal(layers.find((s) => s.key === 'ride')?.layer, 'game')
  assert.equal(layers.find((s) => s.key === 'ride_boost')?.layer, 'character')
  console.log('✓ effective slots = core + game + character')
}

function testOtherGameIsolation() {
  const gameA = gameWithSlots([{ key: 'ride', label: 'Ride' }])
  const gameB: Game = {
    id: 'game-b',
    name: 'Game B',
    engine: 'godot',
    exportRoot: './exports/b',
    settings: emptyGameSettings(),
    createdAt: now,
    updatedAt: now
  }
  assert.equal(isKnownPoseSlot('ride', gameA, character()), true)
  assert.equal(isKnownPoseSlot('ride', gameB, character({ gameId: 'game-b' })), false)
  assert.deepEqual(effectivePoseSlotKeys(gameB), CORE_POSE_SLOT_KEYS)
  console.log('✓ game B does not inherit game A slots')
}

function testDuplicatesFirstLayerWins() {
  const game = gameWithSlots([{ key: 'ready', label: 'Should not replace' }])
  const char = character({ poseSlots: [{ key: 'ride', label: 'Char ride' }] })
  const gameWithRide = gameWithSlots([
    { key: 'ride', label: 'Game ride' },
    { key: 'ride', label: 'Dup' }
  ])
  const slots = effectivePoseSlots(gameWithRide, char)
  assert.equal(slots.filter((s) => s.key === 'ride').length, 1)
  assert.equal(slots.find((s) => s.key === 'ride')?.layer, 'game')
  assert.equal(effectivePoseSlots(game, character()).find((s) => s.key === 'ready')?.layer, 'core')
  console.log('✓ duplicate keys keep the earlier layer')
}

function testLongestFilename() {
  const keys = [...CORE_POSE_SLOT_KEYS, 'ride', 'ride_boost']
  assert.equal(mapFilenameToSlotKey('hero_ride_boost.png', keys), 'ride_boost')
  assert.equal(mapFilenameToSlotKey('hero_ride.png', keys), 'ride')
  assert.equal(mapFilenameToSlot('hero_ready.png'), 'ready')
  assert.equal(mapFilenameToSlot('hero_ride_boost.png', keys), 'ride_boost')
  console.log('✓ longest-key filename mapping')
}

function testUnknownAndAddable() {
  const game = gameWithSlots([{ key: 'ride', label: 'Ride' }])
  const char = character()
  assert.throws(() => assertKnownPoseSlot('nope', game, char), /Unknown pose slot/)
  const occupied = occupiedPoseSlotKeys(game, char)
  assert.throws(() => assertAddablePoseSlotKey('ready', occupied, 'Pose slot'), /already exists/)
  assert.throws(() => assertAddablePoseSlotKey('ride', occupied, 'Pose slot'), /already exists/)
  assert.equal(assertAddablePoseSlotKey('portrait', occupied, 'Pose slot'), 'portrait')
  assert.throws(() => assertAddablePoseSlotKey('Ride Boost', occupied, 'Pose slot'), /lowercase slug/)
  console.log('✓ unknown + duplicate add refused')
}

function testCompletenessCoreAndCustom() {
  const game = gameWithSlots([
    { key: 'ride', label: 'Ride', required: true },
    { key: 'portrait', label: 'Portrait' }
  ])
  const hero = character()
  const five = CORE_POSE_SLOT_KEYS.map((s) => pose(s))
  const incomplete = checkPoseCompleteness(hero, five, undefined, { game })
  assert.equal(incomplete.complete, false)
  assert.equal(incomplete.issues.some((i) => i.slot === 'ride' && i.type === 'missing'), true)
  assert.equal(incomplete.issues.some((i) => i.slot === 'portrait'), false)

  const withRide = checkPoseCompleteness(hero, [...five, pose('ride')], undefined, { game })
  assert.equal(withRide.complete, true)

  const npcGame = gameWithSlots([])
  const npc = character({
    id: 'char-npc',
    corePosesRequired: false,
    poseSlots: [{ key: 'mugshot', label: 'Mugshot', required: true }]
  })
  const npcMissing = checkPoseCompleteness(npc, [], undefined, { game: npcGame })
  assert.equal(npcMissing.issues.some((i) => i.slot === 'ready'), false)
  assert.equal(npcMissing.issues.some((i) => i.slot === 'mugshot'), true)
  const npcOk = checkPoseCompleteness(
    npc,
    [{ ...pose('mugshot'), characterId: 'char-npc' }],
    undefined,
    { game: npcGame }
  )
  assert.equal(npcOk.complete, true)

  const defaultCore = checkPoseCompleteness(character(), [pose('ready')])
  assert.equal(defaultCore.complete, false)
  assert.equal(defaultCore.issues.length, 4)
  console.log('✓ completeness: core default, custom required, corePosesRequired false')
}

function testRequiredSlots() {
  const game = gameWithSlots([{ key: 'ride', label: 'Ride' }])
  const req = requiredPoseSlots(game, character())
  assert.deepEqual(req.map((s) => s.key), CORE_POSE_SLOT_KEYS)
  const reqCustom = requiredPoseSlots(
    gameWithSlots([{ key: 'ride', label: 'Ride', required: true }]),
    character()
  )
  assert.equal(reqCustom.map((s) => s.key).includes('ride'), true)
  console.log('✓ required slots skip optional custom')
}

function main() {
  testEffectiveLayers()
  testOtherGameIsolation()
  testDuplicatesFirstLayerWins()
  testLongestFilename()
  testUnknownAndAddable()
  testCompletenessCoreAndCustom()
  testRequiredSlots()
  console.log('\n✓ poseSlots tests passed')
}

main()
