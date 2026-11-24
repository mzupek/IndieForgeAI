/**
 * 2a enemy validation. Isolated, game-agnostic.
 * Run: npx tsx src/shared/enemies/validate.test.ts
 */
import assert from 'node:assert/strict'
import { emptyGameSettings } from '../studio/schema'
import type { AssetPipelineProject, Enemy } from '../types/assetPipeline'
import {
  buildEnemyChecklist,
  collectCharacterEnemyUsers,
  collectWinConditionUsers,
  validateEnemy
} from './validate'

const now = '2026-01-01T00:00:00.000Z'

function pipeline(): AssetPipelineProject {
  return {
    schemaVersion: 2,
    id: 'studio',
    name: 'Studio',
    description: '',
    games: [
      {
        id: 'game-a',
        name: 'Game A',
        engine: 'unity',
        exportRoot: './a',
        settings: {
          ...emptyGameSettings(),
          modules: [
            {
              id: 'pad',
              label: 'Pad',
              typeIds: ['battle'],
              winConditions: ['locks', 'enemyHp', 'either']
            },
            { id: 'story-mod', label: 'Story', typeIds: ['story'] }
          ]
        },
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'game-b',
        name: 'Game B',
        engine: 'godot',
        exportRoot: './b',
        settings: emptyGameSettings(),
        createdAt: now,
        updatedAt: now
      }
    ],
    characters: [
      {
        id: 'char-a',
        gameId: 'game-a',
        key: 'scout',
        name: 'Scout',
        role: 'enemy',
        tags: [],
        poseSlots: [{ key: 'arc', label: 'Arc' }],
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'char-b',
        gameId: 'game-b',
        name: 'Other',
        role: 'npc',
        tags: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    poses: [
      {
        id: 'pose-ready',
        characterId: 'char-a',
        slot: 'ready',
        file: '/tmp/ready.png',
        status: 'approved',
        source: 'import',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'pose-hurt',
        characterId: 'char-a',
        slot: 'hurt',
        file: '/tmp/hurt.png',
        status: 'approved',
        source: 'import',
        createdAt: now,
        updatedAt: now
      }
    ],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [],
    storyboardShots: [],
    exportProfiles: [],
    gameDefinitions: [],
    visualAssets: [
      {
        id: 'asset-sigil',
        gameId: 'game-a',
        name: 'Sigil',
        category: 'prop',
        tags: [],
        defaultStateId: 'st-on',
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    assetStates: [
      {
        id: 'st-on',
        assetId: 'asset-sigil',
        name: 'on',
        file: '/tmp/on.png',
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    fonts: [],
    palettes: [],
    eventDefinitions: [],
    eventBindings: [],
    audioAssets: [],
    worlds: [],
    stages: [],
    encounters: [],
    regions: [],
    enemies: [],
    createdAt: now,
    updatedAt: now
  }
}

function enemy(over: Partial<Enemy> = {}): Enemy {
  return {
    id: 'en-1',
    gameId: 'game-a',
    name: 'Scout',
    characterId: 'char-a',
    moduleId: 'pad',
    winCondition: { kind: 'locks', params: { count: 3 } },
    stats: { hp: 10 },
    poses: { hit: 'hurt', defeat: 'defeat' },
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...over
  }
}

const p = pipeline()

assert.equal(validateEnemy(p, enemy()).length, 0)

assert.ok(
  validateEnemy(p, enemy({ characterId: 'char-b' })).some((i) =>
    i.message.includes("belongs to game 'game-b'")
  )
)

assert.ok(
  validateEnemy(p, enemy({ moduleId: 'story-mod' })).some((i) =>
    i.message.includes("does not support type 'battle'")
  )
)

assert.ok(
  validateEnemy(p, enemy({ winCondition: { kind: 'nope', params: {} } })).some((i) =>
    i.message.includes("not in module 'pad' winConditions")
  )
)

assert.ok(
  validateEnemy(p, enemy({ poses: { attack: 'missing_slot' } })).some((i) =>
    i.message.includes("Pose slot 'missing_slot' is not one of this character's slots")
  )
)

assert.equal(validateEnemy(p, enemy({ poses: { attack: 'arc' } })).length, 0)

assert.ok(
  validateEnemy(p, enemy({ assets: [{ role: 'sigil', assetId: 'asset-sigil', states: ['missing'] }] })).some(
    (i) => i.message.includes("has no state 'missing'")
  )
)

const listed = buildEnemyChecklist(
  p,
  enemy({ poses: { attack: 'arc', hit: 'hurt', defeat: 'defeat' } })
)
assert.equal(listed.ready, false)
assert.equal(listed.poses.find((row) => row.slot === 'arc')?.have, false)
assert.equal(listed.poses.find((row) => row.slot === 'hurt')?.have, true)
assert.equal(listed.usedBy.length, 0)

p.enemies = [enemy()]
assert.equal(collectCharacterEnemyUsers(p, 'char-a')[0]?.name, 'Scout')
assert.equal(collectWinConditionUsers(p, 'game-a', 'pad', 'locks').length, 1)
assert.equal(collectWinConditionUsers(p, 'game-a', 'pad', 'enemyHp').length, 0)

console.log('✓ enemy validate tests passed')
