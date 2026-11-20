/**
 * 2b attack table validation. Isolated, game-agnostic.
 * Run: npx tsx src/shared/attackTables/validate.test.ts
 */
import assert from 'node:assert/strict'
import { emptyGameSettings } from '../studio/schema'
import type { AssetPipelineProject, AttackTable, Enemy } from '../types/assetPipeline'
import { validateAttackTable, validateEnemyAttackTable } from './validate'
import { validateEnemy, buildEnemyChecklist } from '../enemies/validate'

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
              winConditions: ['locks'],
              attackKinds: [
                { key: 'damage', label: 'Damage' },
                { key: 'extendPattern', label: 'Extend', params: [{ key: 'by', type: 'number', min: 1, max: 3 }] }
              ],
              counterKinds: [{ key: 'perfectRound', label: 'Perfect round' }]
            }
          ]
        },
        createdAt: now,
        updatedAt: now
      }
    ],
    characters: [
      {
        id: 'char-a',
        gameId: 'game-a',
        name: 'Scout',
        role: 'enemy',
        tags: [],
        poseSlots: [{ key: 'attack_arc', label: 'Arc' }],
        createdAt: now,
        updatedAt: now
      }
    ],
    poses: [
      {
        id: 'pose-arc',
        characterId: 'char-a',
        slot: 'attack_arc',
        file: '/tmp/arc.png',
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
    visualAssets: [],
    assetStates: [],
    fonts: [],
    palettes: [],
    eventDefinitions: [
      {
        id: 'evt-1',
        gameId: 'game-a',
        key: 'jam',
        name: 'Jam cue',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
    eventBindings: [],
    audioAssets: [
      {
        id: 'aud-1',
        gameId: 'game-a',
        name: 'Zap',
        kind: 'sfx',
        tags: [],
        file: '/tmp/zap.wav',
        durationSec: 0.2,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
    worlds: [],
    stages: [],
    encounters: [],
    regions: [],
    enemies: [],
    attackTables: [],
    createdAt: now,
    updatedAt: now
  }
}

function table(over: Partial<AttackTable> = {}): AttackTable {
  return {
    id: 'table-1',
    gameId: 'game-a',
    name: 'Pattern',
    moduleId: 'pad',
    selection: 'weighted',
    noRepeatInARow: true,
    reveal: 'roundStart',
    skipFinalRound: true,
    rows: [
      {
        id: 'taser_arc',
        label: 'Taser Arc',
        telegraph: 'arc',
        kind: 'damage',
        damage: 8,
        weight: 60,
        counter: { kind: 'perfectRound', result: 'cancel' }
      }
    ],
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...over
  }
}

const p = pipeline()
assert.equal(validateAttackTable(p, table()).length, 0)

assert.ok(
  validateAttackTable(
    p,
    table({
      rows: [
        {
          id: 'bad',
          label: 'Bad',
          telegraph: '',
          kind: 'extendPattern',
          params: { by: 5 },
          weight: 10
        }
      ]
    })
  ).some((i) => i.message.includes("must be <= 3"))
)

assert.ok(
  validateAttackTable(
    p,
    table({
      rows: [{ id: 'zero', label: 'Zero', telegraph: '', kind: 'damage', weight: 0 }]
    })
  ).some((i) => i.message.includes('greater than 0'))
)

assert.ok(
  validateAttackTable(
    p,
    table({
      rows: [{ id: 'nope', label: 'Nope', telegraph: '', kind: 'laser', weight: 10 }]
    })
  ).some((i) => i.message.includes("not in module 'pad' attackKinds"))
)

p.attackTables = [table()]
p.enemies = [
  {
    id: 'en-1',
    gameId: 'game-a',
    name: 'Scout',
    characterId: 'char-a',
    moduleId: 'pad',
    winCondition: { kind: 'locks', params: {} },
    stats: {},
    poses: {},
    attackTableId: 'table-1',
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now
  } satisfies Enemy
]

assert.equal(validateEnemy(p, p.enemies[0]!).length, 0)
assert.ok(
  validateEnemy(p, { ...p.enemies[0]!, attackTableId: 'missing' }).some((i) =>
    i.message.includes('was not found')
  )
)

const withPose = table({
  rows: [
    {
      id: 'taser_arc',
      label: 'Taser Arc',
      telegraph: 'arc',
      kind: 'damage',
      weight: 60,
      poseSlot: 'attack_arc',
      heroPoseSlot: 'hurt',
      cueEventId: '@jam',
      sfxAudioId: 'Zap'
    }
  ]
})
p.attackTables = [withPose]
assert.equal(validateAttackTable(p, withPose).length, 0)
assert.equal(withPose.rows[0]!.cueEventId, 'evt-1')
assert.equal(withPose.rows[0]!.sfxAudioId, 'aud-1')

const listed = buildEnemyChecklist(p, p.enemies[0]!)
assert.ok(listed.poses.some((row) => row.slot === 'attack_arc' && row.have && row.usedBy?.includes('Taser Arc')))
assert.equal(listed.cueEvents[0]?.have, true)
assert.equal(listed.sfx[0]?.have, true)

assert.equal(validateEnemyAttackTable(p, 'game-a', 'pad', 'table-1', 'attackTableId').length, 0)

console.log('✓ attack table validate tests passed')
