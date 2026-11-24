/**
 * 2d module param spec validation. Isolated, game-agnostic.
 * Run: npx tsx src/shared/gameSettings/paramSpecs.test.ts
 */
import assert from 'node:assert/strict'
import { emptyGameSettings } from '../studio/schema'
import type { AssetPipelineProject, Encounter, GameEncounterModule } from '../types/assetPipeline'
import {
  normalizeParamSpec,
  normalizeParamSpecs,
  validateEncounterParamSpecs,
  validateParamsAgainstSpecs
} from './paramSpecs'

const now = '2026-01-01T00:00:00.000Z'

function testNormalize() {
  const spec = normalizeParamSpec(
    { key: 'rounds', type: 'int', min: 1, max: 20, default: 10, required: true },
    'mini'
  )
  assert.deepEqual(spec, { key: 'rounds', type: 'int', min: 1, max: 20, default: 10, required: true })

  const mode = normalizeParamSpec(
    { key: 'mode', type: 'enum', options: ['easy', 'hard'], default: 'easy' },
    'mini'
  )
  assert.equal(mode.type, 'enum')
  assert.deepEqual(mode.options, ['easy', 'hard'])

  const flag = normalizeParamSpec({ key: 'turbo', type: 'bool', default: false }, 'mini')
  assert.equal(flag.default, false)

  assert.throws(() => normalizeParamSpec({ key: 'x', type: 'bytes' }, 'mini'), /int, float, bool, enum, string/)
  assert.throws(() => normalizeParamSpec({ key: 'mode', type: 'enum' }, 'mini'), /requires options/)
  assert.throws(
    () => normalizeParamSpec({ key: 'rounds', type: 'int', min: 5, max: 1 }, 'mini'),
    /min cannot be greater than max/
  )
  assert.throws(
    () => normalizeParamSpec({ key: 'rounds', type: 'int', default: 1.5 }, 'mini'),
    /default must be an integer/
  )
  assert.throws(
    () => normalizeParamSpecs(
      [
        { key: 'a', type: 'int' },
        { key: 'A', type: 'float' }
      ],
      'mini'
    ),
    /duplicate param/
  )
  console.log('✓ normalize param specs')
}

function testValueWarnings() {
  const specs: GameEncounterModule['paramSpecs'] = [
    { key: 'rounds', type: 'int', min: 1, max: 3, required: true },
    { key: 'speed', type: 'float', min: 0.5, max: 2 },
    { key: 'mode', type: 'enum', options: ['a', 'b'] },
    { key: 'label', type: 'string' },
    { key: 'on', type: 'bool' }
  ]
  const missing = validateParamsAgainstSpecs(specs, {}, 'params')
  assert.equal(missing.length, 1)
  assert.match(missing[0]!.message, /Required param 'rounds' is missing/)
  assert.equal(missing[0]!.level, 'warning')

  const out = validateParamsAgainstSpecs(specs, { rounds: 9 }, 'params')
  assert.match(out[0]!.message, /must be <= 3/)

  const badEnum = validateParamsAgainstSpecs(specs, { rounds: 2, mode: 'z' }, 'params')
  assert.match(badEnum[0]!.message, /must be one of a, b/)

  const ok = validateParamsAgainstSpecs(
    specs,
    { rounds: 2, speed: 1.25, mode: 'a', label: 'go', on: true },
    'params'
  )
  assert.equal(ok.length, 0)
  console.log('✓ value warnings (missing required, range, enum)')
}

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
          encounterTypes: ['battle', 'minigame'],
          modules: [
            {
              id: 'mini',
              label: 'Mini',
              typeIds: ['minigame'],
              paramSpecs: [{ key: 'lanes', type: 'int', min: 1, max: 4, required: true }]
            }
          ]
        },
        createdAt: now,
        updatedAt: now
      }
    ],
    characters: [],
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
        tuningProfiles: [
          { id: 'tune-ok', name: 'Ok', params: { lanes: 3 } },
          { id: 'tune-bad', name: 'Bad', params: { lanes: 9 } }
        ],
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
    worlds: [],
    stages: [],
    encounters: [],
    regions: [],
    createdAt: now,
    updatedAt: now
  }
}

function enc(tuningProfileId?: string): Encounter {
  return {
    id: 'enc-1',
    gameId: 'game-a',
    stageId: 'st-1',
    name: 'Test run',
    typeId: 'minigame',
    moduleId: 'mini',
    tuningProfileId,
    stars: [],
    order: 1,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now
  }
}

function testEncounterTuning() {
  const p = pipeline()
  const missing = validateEncounterParamSpecs(p, enc(), 'encounter')
  assert.equal(missing.length, 1)
  assert.match(missing[0]!.message, /Required param 'lanes' is missing/)

  const bad = validateEncounterParamSpecs(p, enc('tune-bad'), 'encounter')
  assert.match(bad[0]!.message, /must be <= 4/)

  const ok = validateEncounterParamSpecs(p, enc('tune-ok'), 'encounter')
  assert.equal(ok.length, 0)
  console.log('✓ encounter tuning row vs module param specs')
}

function main() {
  testNormalize()
  testValueWarnings()
  testEncounterTuning()
  console.log('\n✓ paramSpecs tests passed')
}

main()
