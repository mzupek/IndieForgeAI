/**
 * Deterministic attack-table round picker. Unity must match this exactly.
 *
 * PRNG: Mulberry32. Seed is a uint32. Each `next()` mutates the state in place
 * and returns a float in [0, 1). Weighted picks consume one `next()` only when
 * two or more rows remain after filters. Sequence mode and skipFinalRound never
 * consume a roll. See CLI.md "Attack tables (2b)" for the walk-through and
 * sample seeds.
 */

import type { AttackRow, AttackTable } from '../types/assetPipeline'

export interface SimulatePossibleRow {
  id: string
  label: string
  kind: string
  weight: number
}

export interface SimulateRound {
  round: number
  skipped: boolean
  reason?: string
  picked?: SimulatePossibleRow
  possible: SimulatePossibleRow[]
}

export interface SimulateResult {
  tableId: string
  tableName: string
  selection: AttackTable['selection']
  seed: number
  rounds: number
  results: SimulateRound[]
}

const MULBERRY_INC = 0x6d2b79f5

/** One step of Mulberry32. Mutates `state[0]` (uint32). Returns [0, 1). */
export function mulberry32Next(state: Uint32Array): number {
  let s = (state[0]! + MULBERRY_INC) >>> 0
  state[0] = s
  let t = Math.imul(s ^ (s >>> 15), s | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function createMulberry32(seed: number): () => number {
  const state = new Uint32Array([seed >>> 0])
  return () => mulberry32Next(state)
}

function rowEligible(row: AttackRow, round: number): boolean {
  const min = row.minRound ?? 1
  const max = row.maxRound ?? Number.POSITIVE_INFINITY
  return min <= round && round <= max
}

function asPossible(row: AttackRow): SimulatePossibleRow {
  return { id: row.id, label: row.label, kind: row.kind, weight: row.weight }
}

/**
 * Weighted pick: walk eligible rows in table order, subtracting each weight
 * from `u = next() * totalWeight` until `u < 0`. Last row wins on float dust.
 * A single remaining row is returned without calling `next()`.
 */
export function pickWeighted(rows: AttackRow[], next: () => number): AttackRow {
  if (rows.length === 1) return rows[0]!
  const total = rows.reduce((sum, row) => sum + row.weight, 0)
  let u = next() * total
  for (const row of rows) {
    u -= row.weight
    if (u < 0) return row
  }
  return rows[rows.length - 1]!
}

/**
 * Sequence pick: first eligible after `lastIndex` in table order, wrapping.
 * `lastIndex` is the index in the full `table.rows` array, or -1 at start.
 */
export function pickSequence(tableRows: AttackRow[], eligible: AttackRow[], lastIndex: number): AttackRow {
  const ids = new Set(eligible.map((r) => r.id))
  const n = tableRows.length
  if (n === 0) throw new Error('sequence pick needs at least one row')
  const start = lastIndex < 0 ? 0 : (lastIndex + 1) % n
  for (let i = 0; i < n; i++) {
    const row = tableRows[(start + i) % n]!
    if (ids.has(row.id)) return row
  }
  return eligible[0]!
}

export function simulateAttackTable(
  table: AttackTable,
  rounds: number,
  seed: number
): SimulateResult {
  const n = Math.floor(Number(rounds))
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('rounds must be an integer >= 1')
  }
  const seedU = Number(seed)
  if (!Number.isFinite(seedU)) {
    throw new Error('seed must be a finite number')
  }
  const next = createMulberry32(seedU)
  const results: SimulateRound[] = []
  let lastId: string | undefined
  let lastIndex = -1

  for (let round = 1; round <= n; round++) {
    if (table.skipFinalRound && round === n) {
      results.push({
        round,
        skipped: true,
        reason: 'skipFinalRound',
        possible: []
      })
      continue
    }

    let eligible = (table.rows || []).filter((row) => rowEligible(row, round))
    if (table.noRepeatInARow && lastId && eligible.length > 1) {
      eligible = eligible.filter((row) => row.id !== lastId)
    }

    const possible = eligible.map(asPossible)
    if (eligible.length === 0) {
      results.push({
        round,
        skipped: true,
        reason: 'noEligibleRows',
        possible
      })
      continue
    }

    const picked =
      table.selection === 'sequence'
        ? pickSequence(table.rows || [], eligible, lastIndex)
        : pickWeighted(eligible, next)

    lastId = picked.id
    lastIndex = (table.rows || []).findIndex((r) => r.id === picked.id)
    results.push({
      round,
      skipped: false,
      picked: asPossible(picked),
      possible
    })
  }

  return {
    tableId: table.id,
    tableName: table.name,
    selection: table.selection,
    seed: seedU >>> 0,
    rounds: n,
    results
  }
}
