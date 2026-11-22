/**
 * Enemies screen — Attack tables tab (2b). List + idle/new/edit, row editor, simulate.
 */

import { useState } from 'react'
import { simulateAttackTable } from '@shared/attackTables/simulate'
import {
  attemptSaveAttackRow,
  attemptSaveAttackTable,
  fieldErrorsFromIssues,
  issuesForRow
} from '@shared/attackTables/formSave'
import { effectivePoseSlots } from '@shared/gameSettings/poseSlots'
import { BATTLE_TYPE_ID } from '@shared/enemies/validate'
import { formErrorFromIssues } from '@shared/studio/formErrors'
import type {
  AssetPipelineProject,
  AttackRow,
  AttackSelection,
  AttackTable,
  Character,
  Game,
  ModuleAttackKind
} from '@shared/types/assetPipeline'
import type { ContentIssue } from '@shared/worldContent/issues'
import type { IndieForgeProject } from '@shared/types/project'

type FormMode = 'idle' | 'new' | 'edit'

interface RowDraft {
  id: string
  label: string
  telegraph: string
  kind: string
  params: Record<string, string>
  damage: string
  weight: string
  minRound: string
  maxRound: string
  counterKind: string
  counterResult: '' | 'cancel' | 'halve'
  poseSlot: string
  heroPoseSlot: string
  cueEventId: string
  sfxAudioId: string
}

function emptyRow(kind = ''): RowDraft {
  return {
    id: '',
    label: '',
    telegraph: '',
    kind,
    params: {},
    damage: '',
    weight: '1',
    minRound: '',
    maxRound: '',
    counterKind: '',
    counterResult: '',
    poseSlot: '',
    heroPoseSlot: '',
    cueEventId: '',
    sfxAudioId: ''
  }
}

function draftFromRow(row: AttackRow): RowDraft {
  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(row.params || {})) params[k] = String(v)
  return {
    id: row.id,
    label: row.label,
    telegraph: row.telegraph || '',
    kind: row.kind,
    params,
    damage: row.damage === undefined ? '' : String(row.damage),
    weight: String(row.weight),
    minRound: row.minRound === undefined ? '' : String(row.minRound),
    maxRound: row.maxRound === undefined ? '' : String(row.maxRound),
    counterKind: row.counter?.kind || '',
    counterResult: row.counter?.result || '',
    poseSlot: row.poseSlot || '',
    heroPoseSlot: row.heroPoseSlot || '',
    cueEventId: row.cueEventId || '',
    sfxAudioId: row.sfxAudioId || ''
  }
}

function rowPayload(draft: RowDraft) {
  const params: Record<string, number> = {}
  for (const [k, v] of Object.entries(draft.params)) {
    if (!k.trim() || v.trim() === '') continue
    const n = Number(v)
    if (Number.isFinite(n)) params[k.trim()] = n
  }
  return {
    id: draft.id.trim() || undefined,
    label: draft.label.trim(),
    telegraph: draft.telegraph.trim(),
    kind: draft.kind,
    params,
    damage: draft.damage.trim() === '' ? null : Number(draft.damage),
    weight: Number(draft.weight),
    minRound: draft.minRound.trim() === '' ? null : Number(draft.minRound),
    maxRound: draft.maxRound.trim() === '' ? null : Number(draft.maxRound),
    counterKind: draft.counterKind || null,
    counterResult: draft.counterResult || null,
    poseSlot: draft.poseSlot || null,
    heroPoseSlot: draft.heroPoseSlot || null,
    cueEventId: draft.cueEventId || null,
    sfxAudioId: draft.sfxAudioId || null
  }
}

function createdTable(updated: unknown, gameId: string, knownIds: Set<string>): AttackTable | undefined {
  const rows =
    ((updated as { assetPipeline?: AssetPipelineProject } | null)?.assetPipeline?.attackTables || []) as AttackTable[]
  return rows.find((row) => row.gameId === gameId && !knownIds.has(row.id))
}

function FormBanner({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div
      style={{
        padding: '0.6rem 0.75rem',
        background: 'var(--error-bg, #3a1a1a)',
        border: '1px solid var(--error)',
        borderRadius: 4,
        color: 'var(--error)',
        whiteSpace: 'pre-wrap',
        fontSize: '0.85rem'
      }}
    >
      {message}
    </div>
  )
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p style={{ color: 'var(--error)', fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap' }}>{message}</p>
  )
}

export function AttackTablesPanel({
  projectId,
  gameId,
  pipeline,
  game,
  busy,
  error,
  onError,
  refreshAfter
}: {
  projectId: string
  gameId: string
  pipeline: AssetPipelineProject
  game: Game
  busy: boolean
  error?: string | null
  onError: (message: string | null) => void
  refreshAfter: (mutator: () => Promise<IndieForgeProject | null | undefined>) => Promise<IndieForgeProject | null | undefined>
}) {
  const [formMode, setFormMode] = useState<FormMode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [selection, setSelection] = useState<AttackSelection>('weighted')
  const [noRepeat, setNoRepeat] = useState(true)
  const [skipFinal, setSkipFinal] = useState(true)
  const [rows, setRows] = useState<RowDraft[]>([])
  const [simRounds, setSimRounds] = useState('3')
  const [simSeed, setSimSeed] = useState('42')
  const [formError, setFormError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [rowFieldErrors, setRowFieldErrors] = useState<Record<number, Record<string, string>>>({})

  const tables = (pipeline.attackTables || [])
    .filter((t) => t.gameId === gameId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const battleModules = (game.settings?.modules || []).filter((m) => m.typeIds.includes(BATTLE_TYPE_ID))
  const selected = formMode === 'edit' ? tables.find((t) => t.id === selectedId) || null : null
  const selectedModule = battleModules.find((m) => m.id === moduleId)
  const linkedEnemies = (pipeline.enemies || []).filter((e) => e.attackTableId === selected?.id)
  const linkedEncounters = (pipeline.encounters || []).filter((enc) =>
    (enc.enemies || []).some((link) => link.attackTableId === selected?.id)
  )
  const linkedCharacters: Character[] = []
  for (const enemy of linkedEnemies) {
    const ch = (pipeline.characters || []).find((c) => c.id === enemy.characterId)
    if (ch && !linkedCharacters.some((x) => x.id === ch.id)) linkedCharacters.push(ch)
  }
  const enemySlots = linkedCharacters.length
    ? linkedCharacters.flatMap((ch) => effectivePoseSlots(game, ch))
    : effectivePoseSlots(game, null)
  const seenSlots = new Set<string>()
  const poseSlots = enemySlots.filter((s) => {
    if (seenSlots.has(s.key)) return false
    seenSlots.add(s.key)
    return true
  })
  const heroSlots = effectivePoseSlots(game, null)
  const events = (pipeline.eventDefinitions || []).filter((e) => e.gameId === gameId)
  const audios = (pipeline.audioAssets || []).filter((a) => a.gameId === gameId)
  const attackKinds = selectedModule?.attackKinds || []
  const counterKinds = selectedModule?.counterKinds || []

  function clearSaveErrors() {
    setFormError(null)
    setRowErrors({})
    setRowFieldErrors({})
    onError(null)
  }

  function showSaveErrors(message: string, issuesByRow?: Record<number, { message: string; fields: Record<string, string> }>) {
    setFormError(message)
    onError(message)
    if (!issuesByRow) return
    const nextRow: Record<number, string> = {}
    const nextFields: Record<number, Record<string, string>> = {}
    for (const [index, info] of Object.entries(issuesByRow)) {
      const i = Number(index)
      nextRow[i] = info.message
      nextFields[i] = info.fields
    }
    setRowErrors(nextRow)
    setRowFieldErrors(nextFields)
  }

  function hideForm() {
    clearSaveErrors()
    setFormMode('idle')
    setSelectedId(null)
  }

  function fill(table: AttackTable) {
    setName(table.name)
    setKey(table.key || '')
    setModuleId(table.moduleId)
    setSelection(table.selection)
    setNoRepeat(table.noRepeatInARow)
    setSkipFinal(table.skipFinalRound)
    setRows(table.rows.map(draftFromRow))
  }

  function beginNew() {
    clearSaveErrors()
    setFormMode('new')
    setSelectedId(null)
    setName('')
    setKey('')
    setModuleId(battleModules[0]?.id || '')
    setSelection('weighted')
    setNoRepeat(true)
    setSkipFinal(true)
    setRows([])
  }

  function selectRow(table: AttackTable) {
    if (formMode === 'edit' && selectedId === table.id) return
    clearSaveErrors()
    setFormMode('edit')
    setSelectedId(table.id)
    fill(table)
  }

  function tablePayload() {
    return {
      name: name.trim(),
      key: key.trim() || undefined,
      moduleId,
      selection,
      noRepeatInARow: noRepeat,
      skipFinalRound: skipFinal,
      reveal: 'roundStart' as const,
      rows: formMode === 'new' ? rows.map((r) => rowPayload(r)) : undefined
    }
  }

  function draftTableRecord(base: AttackTable | null): AttackTable {
    return {
      id: base?.id || 'draft',
      gameId,
      name: name.trim() || 'Untitled',
      key: key.trim() || undefined,
      moduleId,
      selection,
      noRepeatInARow: noRepeat,
      reveal: 'roundStart',
      skipFinalRound: skipFinal,
      rows: base ? base.rows.map((row) => ({ ...row, params: row.params ? { ...row.params } : undefined, counter: row.counter ? { ...row.counter } : undefined })) : [],
      schemaVersion: 2,
      createdAt: base?.createdAt || '',
      updatedAt: base?.updatedAt || ''
    }
  }

  function rowIssueMap(issues: ContentIssue[]): Record<number, { message: string; fields: Record<string, string> }> {
    const byRow: Record<number, { message: string; fields: Record<string, string> }> = {}
    for (let i = 0; i < rows.length; i++) {
      const rowIssues = issuesForRow(issues, i)
      if (!rowIssues.length) continue
      byRow[i] = {
        message: formErrorFromIssues(rowIssues) || 'Invalid row',
        fields: fieldErrorsFromIssues(rowIssues)
      }
    }
    return byRow
  }

  async function saveTable() {
    if (!name.trim() || !moduleId) return
    const preview = draftTableRecord(selected)
    const rawRows = rows.map((r) => rowPayload(r))
    const result = attemptSaveAttackTable(pipeline, preview, formMode === 'new' || rows.length ? rawRows : undefined)
    if (!result.ok) {
      showSaveErrors(result.message, rowIssueMap(result.issues))
      return
    }
    clearSaveErrors()
    await refreshAfter(async () => {
      const body = tablePayload()
      if (selected) {
        return window.indieForge.attackTables.update(projectId, gameId, selected.id, body)
      }
      const knownIds = new Set(tables.map((row) => row.id))
      const updated = await window.indieForge.attackTables.create(projectId, gameId, body)
      const created = createdTable(updated, gameId, knownIds)
      if (created) {
        setFormMode('edit')
        setSelectedId(created.id)
        fill(created)
      }
      return updated
    })
  }

  async function saveRow(index: number, table: AttackTable, draft: RowDraft) {
    const persisted = table.rows.some((r) => r.id === draft.id)
    const result = attemptSaveAttackRow(pipeline, table, rowPayload(draft), persisted ? draft.id : undefined)
    if (!result.ok) {
      showSaveErrors(result.message, {
        [index]: { message: result.message, fields: fieldErrorsFromIssues(result.issues) }
      })
      return
    }
    clearSaveErrors()
    await refreshAfter(async () => {
      const payload = rowPayload(draft)
      if (persisted) {
        return window.indieForge.attackTables.updateRow(projectId, gameId, table.id, draft.id, payload)
      }
      return window.indieForge.attackTables.addRow(projectId, gameId, table.id, payload)
    })
  }

  const simTable: AttackTable | null = selected
    ? {
        ...selected,
        name: name.trim() || selected.name,
        selection,
        noRepeatInARow: noRepeat,
        skipFinalRound: skipFinal,
        rows: selected.rows
      }
    : null
  let simError: string | null = null
  let simResult = null
  if (simTable && formMode === 'edit') {
    try {
      simResult = simulateAttackTable(simTable, Number(simRounds) || 1, Number(simSeed) || 0)
    } catch (err) {
      simError = err instanceof Error ? err.message : String(err)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 0.9fr', gap: '1.5rem' }}>
      <div className="panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Attack tables</h3>
          <button type="button" className="ghost" disabled={busy} onClick={beginNew}>
            + New
          </button>
        </div>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {tables.map((t) => {
            const selectedRow = formMode === 'edit' && t.id === selectedId
            return (
              <li
                key={t.id}
                style={{
                  padding: '0.4rem 0.5rem',
                  cursor: 'pointer',
                  background: selectedRow ? 'var(--bg-secondary)' : 'transparent',
                  boxShadow: selectedRow ? 'inset 3px 0 0 var(--forge-gold)' : 'none',
                  borderRadius: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                onClick={() => selectRow(t)}
              >
                <span>
                  {t.name}
                  {t.key ? <code style={{ marginLeft: '0.5rem' }}>@{t.key}</code> : null}
                  <span style={{ color: 'var(--muted)', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                    {t.rows.length} rows
                  </span>
                </span>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  style={{ color: 'var(--error)' }}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    const removingSelected = t.id === selectedId
                    void refreshAfter(async () => {
                      const updated = await window.indieForge.attackTables.remove(projectId, gameId, t.id)
                      if (removingSelected) hideForm()
                      return updated
                    })
                  }}
                >
                  Remove
                </button>
              </li>
            )
          })}
          {tables.length === 0 && <li style={{ color: 'var(--muted)' }}>No attack tables yet</li>}
        </ul>
        {formMode === 'idle' && (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Select a table to edit, or click + New
          </p>
        )}
      </div>

      {formMode === 'idle' ? null : (
        <div className="panel-section" style={{ display: 'grid', gap: '0.5rem', alignContent: 'start' }}>
          <h4 style={{ margin: 0 }}>{selected ? 'Edit attack table' : 'New attack table'}</h4>
          <FormBanner message={formError || error} />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void saveTable()
            }}
            style={{ display: 'grid', gap: '0.5rem' }}
          >
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
            </label>
            <label>
              Key
              <input value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} />
            </label>
            <label>
              Module
              <select value={moduleId} disabled={busy} onChange={(e) => setModuleId(e.target.value)}>
                <option value="">Select module</option>
                {battleModules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.id})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Selection
              <select
                value={selection}
                disabled={busy}
                onChange={(e) => setSelection(e.target.value as AttackSelection)}
              >
                <option value="weighted">weighted (seeded random)</option>
                <option value="sequence">sequence</option>
              </select>
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="checkbox" checked={noRepeat} disabled={busy} onChange={(e) => setNoRepeat(e.target.checked)} />
              noRepeatInARow
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="checkbox" checked={skipFinal} disabled={busy} onChange={(e) => setSkipFinal(e.target.checked)} />
              skipFinalRound
            </label>
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: 0 }}>reveal: roundStart</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={busy || !name.trim() || !moduleId}>
                {selected ? 'Save table' : 'Create table'}
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={hideForm}>
                Cancel
              </button>
            </div>
          </form>

          <h5 style={{ margin: '0.5rem 0 0' }}>Rows</h5>
          {rows.map((row, i) => (
            <RowEditor
              key={i}
              draft={row}
              busy={busy}
              attackKinds={attackKinds}
              counterKinds={counterKinds}
              poseSlots={poseSlots}
              heroSlots={heroSlots}
              events={events}
              audios={audios}
              persisted={formMode === 'edit' && !!selected?.rows.some((r) => r.id === row.id)}
              error={rowErrors[i]}
              fieldErrors={rowFieldErrors[i]}
              onChange={(next) => {
                const copy = rows.slice()
                copy[i] = next
                setRows(copy)
                setRowErrors((cur) => {
                  if (!(i in cur)) return cur
                  const n = { ...cur }
                  delete n[i]
                  return n
                })
                setRowFieldErrors((cur) => {
                  if (!(i in cur)) return cur
                  const n = { ...cur }
                  delete n[i]
                  return n
                })
              }}
              onSave={
                formMode === 'edit' && selected
                  ? () => {
                      void saveRow(i, selected, row)
                    }
                  : undefined
              }
              onRemove={() => {
                setRowErrors((cur) => {
                  const n: Record<number, string> = {}
                  for (const [key, value] of Object.entries(cur)) {
                    const idx = Number(key)
                    if (idx === i) continue
                    n[idx > i ? idx - 1 : idx] = value
                  }
                  return n
                })
                setRowFieldErrors((cur) => {
                  const n: Record<number, Record<string, string>> = {}
                  for (const [key, value] of Object.entries(cur)) {
                    const idx = Number(key)
                    if (idx === i) continue
                    n[idx > i ? idx - 1 : idx] = value
                  }
                  return n
                })
                if (formMode === 'edit' && selected && selected.rows.some((r) => r.id === row.id)) {
                  void refreshAfter(async () => {
                    const updated = await window.indieForge.attackTables.removeRow(
                      projectId,
                      gameId,
                      selected.id,
                      row.id
                    )
                    setRows(rows.filter((_, j) => j !== i))
                    return updated
                  })
                } else {
                  setRows(rows.filter((_, j) => j !== i))
                }
              }}
            />
          ))}
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => setRows([...rows, emptyRow(attackKinds[0]?.key || '')])}
          >
            + Add row
          </button>
        </div>
      )}

      {formMode === 'edit' && simTable && (
        <div className="panel-section">
          <h4 style={{ margin: '0 0 0.5rem 0' }}>Simulate</h4>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 0 }}>
            Read-only. Uses saved rows. Changing a weight and saving changes picks.
          </p>
          <label>
            Rounds
            <input value={simRounds} onChange={(e) => setSimRounds(e.target.value)} disabled={busy} />
          </label>
          <label>
            Seed
            <input value={simSeed} onChange={(e) => setSimSeed(e.target.value)} disabled={busy} />
          </label>
          {simError && <p style={{ color: 'var(--error)' }}>{simError}</p>}
          {simResult &&
            simResult.results.map((round) => (
              <div key={round.round} style={{ fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                <div>
                  Round {round.round}:{' '}
                  {round.skipped ? (
                    <span style={{ color: 'var(--muted)' }}>skipped ({round.reason})</span>
                  ) : (
                    <strong>{round.picked?.label}</strong>
                  )}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                  possible: {round.possible.length ? round.possible.map((p) => p.label).join(', ') : '(none)'}
                </div>
              </div>
            ))}
          {linkedEnemies.length > 0 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
              Linked enemies: {linkedEnemies.map((e) => e.name).join(', ')}
            </p>
          )}
          {linkedEncounters.length > 0 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
              Linked encounters: {linkedEncounters.map((e) => e.name).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function RowEditor({
  draft,
  busy,
  attackKinds,
  counterKinds,
  poseSlots,
  heroSlots,
  events,
  audios,
  persisted,
  error,
  fieldErrors,
  onChange,
  onSave,
  onRemove
}: {
  draft: RowDraft
  busy: boolean
  attackKinds: ModuleAttackKind[]
  counterKinds: { key: string; label: string }[]
  poseSlots: { key: string; label: string }[]
  heroSlots: { key: string; label: string }[]
  events: { id: string; name: string; key?: string }[]
  audios: { id: string; name: string }[]
  persisted: boolean
  error?: string
  fieldErrors?: Record<string, string>
  onChange: (next: RowDraft) => void
  onSave?: () => void
  onRemove: () => void
}) {
  const kindDef = attackKinds.find((k) => k.key === draft.kind)
  const paramDefs = kindDef?.params || []
  const fields = fieldErrors || {}
  return (
    <div
      style={{
        border: error ? '1px solid var(--error)' : '1px solid var(--border)',
        borderRadius: 4,
        padding: '0.5rem',
        display: 'grid',
        gap: '0.35rem'
      }}
    >
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        <input
          placeholder="id slug"
          value={draft.id}
          disabled={busy || persisted}
          onChange={(e) => onChange({ ...draft, id: e.target.value })}
        />
        <input
          placeholder="label"
          value={draft.label}
          disabled={busy}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
        />
      </div>
      <FieldError message={fields.id || fields.label} />
      <input
        placeholder="telegraph"
        value={draft.telegraph}
        disabled={busy}
        onChange={(e) => onChange({ ...draft, telegraph: e.target.value })}
      />
      <select
        value={draft.kind}
        disabled={busy}
        onChange={(e) => {
          const kind = e.target.value
          const nextParams: Record<string, string> = {}
          const def = attackKinds.find((k) => k.key === kind)
          for (const p of def?.params || []) nextParams[p.key] = draft.params[p.key] || ''
          onChange({ ...draft, kind, params: nextParams })
        }}
      >
        <option value="">{attackKinds.length ? 'kind' : 'Add attack kinds on the module first'}</option>
        {attackKinds.map((k) => (
          <option key={k.key} value={k.key}>
            {k.label} ({k.key})
          </option>
        ))}
      </select>
      <FieldError message={fields.kind} />
      {paramDefs.map((p) => (
        <label key={p.key}>
          {p.key}
          {p.min !== undefined || p.max !== undefined ? ` (${p.min ?? ''}–${p.max ?? ''})` : ''}
          <input
            value={draft.params[p.key] || ''}
            disabled={busy}
            aria-invalid={fields[`params.${p.key}`] ? true : undefined}
            onChange={(e) => onChange({ ...draft, params: { ...draft.params, [p.key]: e.target.value } })}
          />
          <FieldError message={fields[`params.${p.key}`]} />
        </label>
      ))}
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        <input
          placeholder="weight"
          value={draft.weight}
          disabled={busy}
          aria-invalid={fields.weight ? true : undefined}
          onChange={(e) => onChange({ ...draft, weight: e.target.value })}
        />
        <input
          placeholder="damage"
          value={draft.damage}
          disabled={busy}
          onChange={(e) => onChange({ ...draft, damage: e.target.value })}
        />
        <input
          placeholder="minRound"
          value={draft.minRound}
          disabled={busy}
          aria-invalid={fields.minRound ? true : undefined}
          onChange={(e) => onChange({ ...draft, minRound: e.target.value })}
        />
        <input
          placeholder="maxRound"
          value={draft.maxRound}
          disabled={busy}
          aria-invalid={fields.maxRound ? true : undefined}
          onChange={(e) => onChange({ ...draft, maxRound: e.target.value })}
        />
      </div>
      <FieldError message={fields.weight || fields.minRound || fields.maxRound || fields.damage} />
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        <select
          value={draft.counterKind}
          disabled={busy}
          onChange={(e) => onChange({ ...draft, counterKind: e.target.value })}
        >
          <option value="">counter kind</option>
          {counterKinds.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
        <select
          value={draft.counterResult}
          disabled={busy || !draft.counterKind}
          onChange={(e) => onChange({ ...draft, counterResult: e.target.value as RowDraft['counterResult'] })}
        >
          <option value="">result</option>
          <option value="cancel">cancel</option>
          <option value="halve">halve</option>
        </select>
      </div>
      <FieldError message={fields.counterKind || fields.counterResult} />
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        <select value={draft.poseSlot} disabled={busy} onChange={(e) => onChange({ ...draft, poseSlot: e.target.value })}>
          <option value="">enemy pose</option>
          {poseSlots.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label} ({s.key})
            </option>
          ))}
        </select>
        <select
          value={draft.heroPoseSlot}
          disabled={busy}
          onChange={(e) => onChange({ ...draft, heroPoseSlot: e.target.value })}
        >
          <option value="">hero pose</option>
          {heroSlots.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label} ({s.key})
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        <select
          value={draft.cueEventId}
          disabled={busy}
          onChange={(e) => onChange({ ...draft, cueEventId: e.target.value })}
        >
          <option value="">cue event</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
              {ev.key ? ` @${ev.key}` : ''}
            </option>
          ))}
        </select>
        <select
          value={draft.sfxAudioId}
          disabled={busy}
          onChange={(e) => onChange({ ...draft, sfxAudioId: e.target.value })}
        >
          <option value="">sfx</option>
          {audios.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <FieldError message={error} />
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        {onSave ? (
          <button type="button" className="ghost" disabled={busy || !draft.label.trim() || !draft.kind} onClick={onSave}>
            Save row
          </button>
        ) : null}
        <button type="button" className="ghost" disabled={busy} style={{ color: 'var(--error)' }} onClick={onRemove}>
          Remove row
        </button>
      </div>
    </div>
  )
}
