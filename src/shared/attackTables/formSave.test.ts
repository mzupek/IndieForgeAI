/**
 * GUI error-surfacing path for attack-table saves (no Electron / no DOM).
 * Invalid drafts must keep their typed values and return the validator's
 * plain message — the same text the CLI prints.
 * Run: npx tsx src/shared/attackTables/formSave.test.ts
 */
import assert from 'node:assert/strict'
import { emptyGameSettings } from '../studio/schema'
import { attemptSync, formErrorFromIssues, plainErrorMessage } from '../studio/formErrors'
import { normalizeAttackKind } from '../gameSettings/encounterSettings'
import type { AssetPipelineProject, AttackTable } from '../types/assetPipeline'
import {
  attemptSaveAttackRow,
  attemptSaveAttackTable,
  fieldErrorsFromIssues,
  fieldKeyFromIssue
} from './formSave'

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
    characters: [],
    poses: [],
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
    eventDefinitions: [],
    eventBindings: [],
    audioAssets: [],
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
        id: 'extend',
        label: 'Extend',
        telegraph: 'grow',
        kind: 'extendPattern',
        params: { by: 1 },
        weight: 10
      }
    ],
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...over
  }
}

const p = pipeline()
const saved = table()
p.attackTables = [saved]

const typed = { ...saved.rows[0]!, params: { by: 5 } }
const outOfRange = attemptSaveAttackRow(p, saved, typed, 'extend')
assert.equal(outOfRange.ok, false)
if (!outOfRange.ok) {
  assert.equal(outOfRange.message, "param 'by' must be <= 3")
  assert.equal(fieldErrorsFromIssues(outOfRange.issues)['params.by'], "param 'by' must be <= 3")
  assert.equal(fieldKeyFromIssue(outOfRange.issues[0]!), 'params.by')
}
assert.equal(saved.rows[0]!.params!.by, 1, 'saved row must not be mutated on failed save')
assert.equal(typed.params.by, 5, 'typed draft must be left as entered')

const valid = attemptSaveAttackRow(p, saved, { ...saved.rows[0]!, params: { by: 2 } }, 'extend')
assert.equal(valid.ok, true)
if (valid.ok) assert.equal(valid.value.params!.by, 2)
assert.equal(saved.rows[0]!.params!.by, 1, 'valid preview must not write through to the saved table')

const weightedZero = attemptSaveAttackRow(
  p,
  saved,
  { id: 'extend', label: 'Extend', telegraph: 'grow', kind: 'extendPattern', params: { by: 2 }, weight: 0 },
  'extend'
)
assert.equal(weightedZero.ok, false)
if (!weightedZero.ok) {
  assert.match(weightedZero.message, /weight must be greater than 0/)
}

const rangeFlip = attemptSaveAttackRow(
  p,
  saved,
  {
    id: 'extend',
    label: 'Extend',
    telegraph: 'grow',
    kind: 'extendPattern',
    params: { by: 2 },
    weight: 10,
    minRound: 4,
    maxRound: 2
  },
  'extend'
)
assert.equal(rangeFlip.ok, false)
if (!rangeFlip.ok) {
  assert.match(rangeFlip.message, /minRound cannot be greater than maxRound/)
}

const unknownKind = attemptSaveAttackRow(
  p,
  saved,
  { id: 'extend', label: 'Extend', telegraph: 'grow', kind: 'laser', params: { by: 2 }, weight: 10 },
  'extend'
)
assert.equal(unknownKind.ok, false)
if (!unknownKind.ok) {
  assert.match(unknownKind.message, /not in module 'pad' attackKinds/)
}

const tableFail = attemptSaveAttackTable(p, saved, [
  { id: 'extend', label: 'Extend', telegraph: 'grow', kind: 'extendPattern', params: { by: 5 }, weight: 10 }
])
assert.equal(tableFail.ok, false)
if (!tableFail.ok) assert.equal(tableFail.message, "param 'by' must be <= 3")
assert.equal(saved.rows[0]!.params!.by, 1)

const tableOk = attemptSaveAttackTable(p, saved, [
  { id: 'extend', label: 'Extend', telegraph: 'grow', kind: 'extendPattern', params: { by: 3 }, weight: 10 }
])
assert.equal(tableOk.ok, true)

assert.equal(
  plainErrorMessage(
    new Error("Error invoking remote method 'attackTable:rowUpdate': Error: param 'by' must be <= 3")
  ),
  "param 'by' must be <= 3"
)
assert.equal(plainErrorMessage(new Error("param 'by' must be <= 3")), "param 'by' must be <= 3")
assert.equal(formErrorFromIssues(outOfRange.ok ? [] : outOfRange.issues), "param 'by' must be <= 3")

const kindRange = attemptSync(() =>
  normalizeAttackKind(
    { key: 'extendPattern', label: 'Extend', params: [{ key: 'by', type: 'number', min: 3, max: 1 }] },
    'pad'
  )
)
assert.equal(kindRange.ok, false)
if (!kindRange.ok) assert.match(kindRange.message, /min cannot be greater than max/)

console.log('✓ attack table form-save error-surfacing tests passed')
