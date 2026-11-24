/**
 * Enemies screen — Difficulty tab (2c). List + idle/new/edit.
 */

import { useState } from 'react'
import { fieldErrorsFromIssues, formErrorFromIssues, plainErrorMessage } from '@shared/studio/formErrors'
import { validateDifficultyProfile } from '@shared/difficulty/validate'
import type { AssetPipelineProject, DifficultyProfile } from '@shared/types/assetPipeline'
import type { IndieForgeProject } from '@shared/types/project'

type FormMode = 'idle' | 'new' | 'edit'

function createdProfile(
  updated: unknown,
  gameId: string,
  knownIds: Set<string>
): DifficultyProfile | undefined {
  const rows =
    ((updated as { assetPipeline?: AssetPipelineProject } | null)?.assetPipeline?.difficultyProfiles ||
      []) as DifficultyProfile[]
  return rows.find((row) => row.gameId === gameId && !knownIds.has(row.id))
}

export function DifficultyPanel({
  projectId,
  gameId,
  pipeline,
  busy,
  error,
  onError,
  refreshAfter
}: {
  projectId: string
  gameId: string
  pipeline: AssetPipelineProject
  busy: boolean
  error: string | null
  onError: (message: string | null) => void
  refreshAfter: (mutator: () => Promise<IndieForgeProject | null | undefined>) => Promise<IndieForgeProject | null>
}) {
  const [formMode, setFormMode] = useState<FormMode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [heroHpMultiplier, setHeroHpMultiplier] = useState('1')
  const [playbackSpeed, setPlaybackSpeed] = useState('1')
  const [attackWeightScale, setAttackWeightScale] = useState('1')
  const [hintCharges, setHintCharges] = useState('0')
  const [notes, setNotes] = useState('')

  const profiles = (pipeline.difficultyProfiles || [])
    .filter((p) => p.gameId === gameId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const selected = formMode === 'edit' ? profiles.find((p) => p.id === selectedId) || null : null

  function clearSaveErrors() {
    setFormError(null)
    setFieldErrors({})
    onError(null)
  }

  function showSaveErrors(message: string, fields?: Record<string, string>) {
    setFormError(message)
    onError(message)
    setFieldErrors(fields || {})
  }

  function hideForm() {
    clearSaveErrors()
    setFormMode('idle')
    setSelectedId(null)
  }

  function fill(profile: DifficultyProfile) {
    setName(profile.name)
    setKey(profile.key || '')
    setHeroHpMultiplier(String(profile.heroHpMultiplier))
    setPlaybackSpeed(String(profile.playbackSpeed))
    setAttackWeightScale(String(profile.attackWeightScale))
    setHintCharges(String(profile.hintCharges))
    setNotes(profile.notes || '')
  }

  function beginNew() {
    clearSaveErrors()
    setFormMode('new')
    setSelectedId(null)
    setName('')
    setKey('')
    setHeroHpMultiplier('1')
    setPlaybackSpeed('1')
    setAttackWeightScale('1')
    setHintCharges('0')
    setNotes('')
  }

  function selectRow(profile: DifficultyProfile) {
    if (formMode === 'edit' && selectedId === profile.id) return
    clearSaveErrors()
    setFormMode('edit')
    setSelectedId(profile.id)
    fill(profile)
  }

  function draftProfile(): DifficultyProfile {
    return {
      id: selected?.id || 'draft',
      gameId,
      name: name.trim() || 'Untitled',
      key: key.trim() || undefined,
      heroHpMultiplier: Number(heroHpMultiplier),
      playbackSpeed: Number(playbackSpeed),
      attackWeightScale: Number(attackWeightScale),
      hintCharges: Number(hintCharges),
      notes: notes.trim() || undefined,
      schemaVersion: selected?.schemaVersion || 2,
      createdAt: selected?.createdAt || '',
      updatedAt: selected?.updatedAt || ''
    }
  }

  function payload() {
    return {
      name: name.trim(),
      key: key.trim() || undefined,
      heroHpMultiplier: Number(heroHpMultiplier),
      playbackSpeed: Number(playbackSpeed),
      attackWeightScale: Number(attackWeightScale),
      hintCharges: Number(hintCharges),
      notes: notes.trim() || null
    }
  }

  function fieldNote(field: string) {
    const message = fieldErrors[field]
    if (!message) return null
    return (
      <div style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{message}</div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
      <div className="panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Difficulty</h3>
          <button type="button" className="ghost" disabled={busy} onClick={beginNew}>
            + New
          </button>
        </div>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {profiles.map((p) => {
            const selectedRow = formMode === 'edit' && p.id === selectedId
            return (
              <li
                key={p.id}
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
                onClick={() => selectRow(p)}
              >
                <span>
                  {p.name}
                  {p.key ? <code style={{ marginLeft: '0.5rem' }}>@{p.key}</code> : null}
                </span>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  style={{ color: 'var(--error)' }}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    const removingSelected = p.id === selectedId
                    void refreshAfter(async () => {
                      try {
                        const updated = await window.indieForge.difficulty.remove(projectId, gameId, p.id)
                        if (removingSelected) hideForm()
                        return updated
                      } catch (err) {
                        showSaveErrors(plainErrorMessage(err))
                        throw err
                      }
                    })
                  }}
                >
                  Remove
                </button>
              </li>
            )
          })}
          {profiles.length === 0 && <li style={{ color: 'var(--muted)' }}>No profiles yet</li>}
        </ul>
        {formMode === 'idle' && (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Select a profile to edit, or click + New
          </p>
        )}
      </div>

      {formMode === 'idle' ? null : (
        <form
          className="panel-section"
          style={{ display: 'grid', gap: '0.5rem', maxWidth: '36rem' }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            const issues = validateDifficultyProfile(pipeline, draftProfile())
            const message = formErrorFromIssues(issues)
            if (message) {
              showSaveErrors(message, fieldErrorsFromIssues(issues))
              return
            }
            void refreshAfter(async () => {
              const body = payload()
              try {
                if (selected) {
                  const updated = await window.indieForge.difficulty.update(
                    projectId,
                    gameId,
                    selected.id,
                    body
                  )
                  clearSaveErrors()
                  return updated
                }
                const knownIds = new Set(profiles.map((row) => row.id))
                const updated = await window.indieForge.difficulty.create(projectId, gameId, body)
                const created = createdProfile(updated, gameId, knownIds)
                if (created) {
                  setFormMode('edit')
                  setSelectedId(created.id)
                  fill(created)
                }
                clearSaveErrors()
                return updated
              } catch (err) {
                showSaveErrors(plainErrorMessage(err))
                throw err
              }
            })
          }}
        >
          <h3 style={{ margin: 0 }}>{selected ? 'Edit profile' : 'New profile'}</h3>
          {(formError || error) && (
            <div style={{ color: 'var(--error)', whiteSpace: 'pre-wrap' }}>{formError || error}</div>
          )}
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          {fieldNote('name')}
          <input
            placeholder="key (optional)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={busy}
          />
          {fieldNote('key')}
          <label>
            Hero HP multiplier
            <input
              type="number"
              step="any"
              value={heroHpMultiplier}
              onChange={(e) => setHeroHpMultiplier(e.target.value)}
              disabled={busy}
            />
          </label>
          {fieldNote('heroHpMultiplier')}
          <label>
            Playback speed
            <input
              type="number"
              step="any"
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(e.target.value)}
              disabled={busy}
            />
          </label>
          {fieldNote('playbackSpeed')}
          <label>
            Attack weight scale
            <input
              type="number"
              step="any"
              value={attackWeightScale}
              onChange={(e) => setAttackWeightScale(e.target.value)}
              disabled={busy}
            />
          </label>
          {fieldNote('attackWeightScale')}
          <label>
            Hint charges
            <input
              type="number"
              step="1"
              min="0"
              value={hintCharges}
              onChange={(e) => setHintCharges(e.target.value)}
              disabled={busy}
            />
          </label>
          {fieldNote('hintCharges')}
          <textarea
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            rows={3}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy || !name.trim()}>
              {selected ? 'Save' : 'Create'}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={hideForm}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
