/**
 * Seeded attack-table picker. Run: npx tsx src/shared/attackTables/simulate.test.ts
 */
import assert from 'node:assert/strict'
import type { AttackRow, AttackTable } from '../types/assetPipeline'
import { simulateAttackTable } from './simulate'

const now = '2026-01-01T00:00:00.000Z'

function row(partial: Partial<AttackRow> & Pick<AttackRow, 'id' | 'label' | 'kind' | 'weight'>): AttackRow {
  return {
    telegraph: '',
    ...partial
  }
}

function table(over: Partial<AttackTable> & { rows: AttackRow[] }): AttackTable {
  return {
    id: 'table-1',
    gameId: 'game-a',
    name: 'Pattern',
    moduleId: 'pad',
    selection: 'weighted',
    noRepeatInARow: true,
    reveal: 'roundStart',
    skipFinalRound: true,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...over
  }
}

const gateRows: AttackRow[] = [
  row({ id: 'taser_arc', label: 'Taser Arc', kind: 'damage', weight: 60, damage: 8 }),
  row({ id: 'scan_jam', label: 'Scan Jam', kind: 'extendPattern', weight: 25, minRound: 2, params: { by: 1 } }),
  row({ id: 'alarm_pulse', label: 'Alarm Pulse', kind: 'damage', weight: 15, damage: 12, minRound: 2 })
]

const seed42 = simulateAttackTable(table({ rows: gateRows }), 3, 42)
assert.equal(seed42.results[0]?.picked?.id, 'taser_arc')
assert.equal(seed42.results[0]?.possible.length, 1)
assert.equal(seed42.results[2]?.skipped, true)
assert.equal(seed42.results[2]?.reason, 'skipFinalRound')
const again = simulateAttackTable(table({ rows: gateRows }), 3, 42)
assert.deepEqual(
  again.results.map((r) => r.picked?.id || r.reason),
  seed42.results.map((r) => r.picked?.id || r.reason)
)

const heavier = gateRows.map((r) =>
  r.id === 'alarm_pulse' ? { ...r, weight: 80 } : r
)
const changed = simulateAttackTable(table({ rows: heavier }), 3, 42)
assert.equal(changed.results[0]?.picked?.id, 'taser_arc')
assert.notEqual(changed.results[1]?.picked?.id, seed42.results[1]?.picked?.id)

const sequenced = simulateAttackTable(
  table({
    selection: 'sequence',
    skipFinalRound: false,
    noRepeatInARow: false,
    rows: gateRows
  }),
  4,
  99
)
assert.equal(sequenced.results[0]?.picked?.id, 'taser_arc')
assert.equal(sequenced.results[1]?.picked?.id, 'scan_jam')
assert.equal(sequenced.results[2]?.picked?.id, 'alarm_pulse')
assert.equal(sequenced.results[3]?.picked?.id, 'taser_arc')

const noRepeatSeq = simulateAttackTable(
  table({
    selection: 'sequence',
    skipFinalRound: false,
    noRepeatInARow: true,
    rows: [
      row({ id: 'a', label: 'A', kind: 'damage', weight: 1 }),
      row({ id: 'b', label: 'B', kind: 'damage', weight: 1 })
    ]
  }),
  3,
  1
)
assert.equal(noRepeatSeq.results[0]?.picked?.id, 'a')
assert.equal(noRepeatSeq.results[1]?.picked?.id, 'b')
assert.equal(noRepeatSeq.results[2]?.picked?.id, 'a')

console.log('seed42 round2', seed42.results[1]?.picked?.id, seed42.results[1]?.possible.map((p) => p.id))
console.log('✓ attack table simulate tests passed')
