/**
 * 2c encounter enemy links + tuning conflict. Isolated, game-agnostic.
 * Run: npx tsx src/shared/worldContent/encounterLinks.test.ts
 */
import assert from 'node:assert/strict'
import { emptyGameSettings } from '../studio/schema'
import type { AssetPipelineProject, Encounter, Enemy } from '../types/assetPipeline'
import { applyContentBundleIsolated } from './apply'
import {
  encounterFlowExtras,
  encounterTuningConflict,
  validateEncounterLinks
} from './encounterLinks'
import { validateEncounter } from './validate'

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
              starKinds: ['win'],
              winConditions: ['locks']
            },
            { id: 'duel', label: 'Duel', typeIds: ['battle'] }
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
        createdAt: now,
        updatedAt: now
      }
    ],
    poses: [],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [],
    storyboardShots: [],
    exportProfiles: [],
    gameDefinitions: [
      {
        id: 'def-a',
        gameId: 'game-a',
        stage: 'MVP',
        pillars: [],
        puzzleCore: '',
        storySynopsis: '',
        cast: [],
        linkedAssets: { poses: [], clips: [], presets: [] },
        themeSlots: [],
        interactions: [],
        tuningProfiles: [{ id: 'tune-a', name: 'Pad Tune', params: { enemyHP: 20, rounds: 10 } }],
        keepCutInvent: { keep: [], cut: [], invent: [] },
        mvpBoard: [],
        markdownSource: '',
        createdAt: now,
        updatedAt: now
      }
    ],
    visualAssets: [],
    assetStates: [],
    fonts: [],
    palettes: [],
    eventDefinitions: [],
    eventBindings: [],
    audioAssets: [],
    worlds: [
      {
        id: 'world-a',
        gameId: 'game-a',
        name: 'World 1',
        order: 1,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    stages: [
      {
        id: 'stage-a',
        gameId: 'game-a',
        worldId: 'world-a',
        name: 'The Gate',
        order: 1,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    encounters: [],
    regions: [],
    enemies: [
      {
        id: 'en-scout',
        gameId: 'game-a',
        key: 'scout-en',
        name: 'Scout',
        characterId: 'char-a',
        moduleId: 'pad',
        winCondition: { kind: 'locks', params: { count: 3 } },
        stats: {},
        poses: {},
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      } as Enemy
    ],
    attackTables: [
      {
        id: 'tbl-pad',
        gameId: 'game-a',
        key: 'pad-table',
        name: 'Pad table',
        moduleId: 'pad',
        selection: 'weighted',
        noRepeatInARow: false,
        reveal: 'roundStart',
        skipFinalRound: false,
        rows: [],
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    difficultyProfiles: [
      {
        id: 'diff-story',
        gameId: 'game-a',
        key: 'story',
        name: 'Story',
        heroHpMultiplier: 1.5,
        playbackSpeed: 0.85,
        attackWeightScale: 0.75,
        hintCharges: 3,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  }
}

function encounter(over: Partial<Encounter> = {}): Encounter {
  return {
    id: 'enc-1',
    gameId: 'game-a',
    stageId: 'stage-a',
    name: 'Pad fight',
    typeId: 'battle',
    moduleId: 'pad',
    stars: [{ id: 's1', label: 'Win', kind: 'win' }],
    order: 1,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...over
  }
}

{
  const issues = validateEncounterLinks(pipeline(), encounter({ enemies: [{ enemyId: 'en-scout' }] }))
  assert.equal(issues.filter((i) => i.level === 'error').length, 0)
}

{
  const issues = validateEncounterLinks(
    pipeline(),
    encounter({ enemies: [{ enemyId: 'en-scout', attackTableId: 'tbl-pad' }] })
  )
  assert.equal(issues.filter((i) => i.level === 'error').length, 0)
}

{
  const p = pipeline()
  p.enemies![0].moduleId = 'duel'
  const issues = validateEncounterLinks(p, encounter({ enemies: [{ enemyId: 'en-scout' }] }))
  assert.ok(issues.some((i) => i.message.includes('module')))
}

{
  const issues = validateEncounter(pipeline(), encounter({ difficultyProfileId: 'missing' }))
  assert.ok(issues.some((i) => i.path.includes('difficultyProfileId')))
}

{
  const issues = validateEncounter(pipeline(), encounter({ difficultyProfileId: '@story' }))
  assert.equal(issues.filter((i) => i.level === 'error').length, 0)
}

{
  const enc = encounter({
    enemies: [{ enemyId: 'en-scout' }],
    tuningProfileId: 'tune-a'
  })
  const warnings = encounterTuningConflict(pipeline(), enc)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0]!.level, 'warning')
  assert.ok(warnings[0]!.message.includes('enemyHP=20'))
  assert.ok(warnings[0]!.message.includes('locks'))
  assert.ok(warnings[0]!.message.includes('count=3'))
}

{
  const extras = encounterFlowExtras(
    pipeline(),
    encounter({ enemies: [{ enemyId: 'en-scout' }, { enemyId: 'en-scout' }] }),
    'encounter'
  )
  assert.ok(extras.label.includes('Scout'))
  assert.ok(extras.label.includes('+1'))
  assert.ok(extras.issues.some((i) => i.message.includes('checklist is not ready')))
}

{
  const p = pipeline()
  const { pipeline: next, result } = applyContentBundleIsolated(p, 'game-a', {
    difficultyProfiles: [
      {
        key: 'hard',
        name: 'Hard',
        heroHpMultiplier: 0.7,
        playbackSpeed: 1.15,
        attackWeightScale: 1.25,
        hintCharges: 0
      }
    ],
    encounters: [
      {
        key: 'enc-pad',
        stageId: 'stage-a',
        name: 'Pad fight',
        typeId: 'battle',
        moduleId: 'pad',
        enemies: [{ enemyId: '@scout-en', attackTableId: '@pad-table' }],
        difficultyProfileId: '@hard'
      }
    ]
  })
  assert.equal(result.creates.length, 2)
  const enc = next.encounters!.find((e) => e.key === 'enc-pad')!
  assert.equal(enc.enemies![0]!.enemyId, 'en-scout')
  assert.equal(enc.enemies![0]!.attackTableId, 'tbl-pad')
  const hard = next.difficultyProfiles!.find((d) => d.key === 'hard')!
  assert.equal(enc.difficultyProfileId, hard.id)
  const second = applyContentBundleIsolated(next, 'game-a', {
    difficultyProfiles: [
      {
        key: 'hard',
        name: 'Hard',
        heroHpMultiplier: 0.7,
        playbackSpeed: 1.15,
        attackWeightScale: 1.25,
        hintCharges: 0
      }
    ],
    encounters: [
      {
        key: 'enc-pad',
        stageId: 'stage-a',
        name: 'Pad fight',
        typeId: 'battle',
        moduleId: 'pad',
        enemies: [{ enemyId: '@scout-en', attackTableId: '@pad-table' }],
        difficultyProfileId: '@hard'
      }
    ]
  })
  assert.deepEqual(second.result.creates, [])
  assert.deepEqual(second.result.updates, [])
}

console.log('\n✓ encounter link tests passed')
