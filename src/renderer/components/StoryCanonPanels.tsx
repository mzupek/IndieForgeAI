/**
 * Story circles and reveal tokens on /studio/story/:gameId.
 */

import { useState } from 'react'
import { ConditionBuilder } from './ConditionBuilder'
import { HARMON_STEP_LABELS, emptyCircleSteps } from '@shared/story/circles'
import { revealTokenLabel } from '@shared/story/revealTokens'
import type {
  AssetPipelineProject,
  CanonStatus,
  Condition,
  RevealToken,
  StoryCircle,
  StoryCircleScope,
  StoryCircleStep
} from '@shared/types/assetPipeline'

type FormMode = 'idle' | 'new' | 'edit'

function createdRecord<T extends { id: string; gameId: string }>(
  updated: unknown,
  collection: 'storyCircles' | 'revealTokens',
  gameId: string,
  knownIds: Set<string>
): T | undefined {
  const rows = ((updated as { assetPipeline?: AssetPipelineProject } | null)?.assetPipeline?.[collection] ||
    []) as unknown as T[]
  return rows.find((row) => row.gameId === gameId && !knownIds.has(row.id))
}

function CanonSelect({
  value,
  onChange,
  disabled
}: {
  value: CanonStatus
  onChange: (v: CanonStatus) => void
  disabled?: boolean
}) {
  return (
    <label>
      Canon
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as CanonStatus)}>
        <option value="draft">draft</option>
        <option value="approved">approved</option>
      </select>
    </label>
  )
}

export function CirclesPanel({
  projectId,
  gameId,
  pipeline,
  busy,
  refreshAfter
}: {
  projectId: string
  gameId: string
  pipeline: AssetPipelineProject
  busy: boolean
  refreshAfter: (m: () => Promise<any>) => Promise<any>
}) {
  const circles = ((pipeline.storyCircles || []) as StoryCircle[])
    .filter((c) => c.gameId === gameId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const worlds = (pipeline.worlds || []).filter((w) => w.gameId === gameId)
  const stages = (pipeline.stages || []).filter((s) => s.gameId === gameId)
  const encounters = (pipeline.encounters || []).filter((e) => e.gameId === gameId)
  const dialogues = (pipeline.dialogues || []).filter((d) => d.gameId === gameId)
  const flags = (pipeline.flags || []).filter((f) => f.gameId === gameId)
  const [formMode, setFormMode] = useState<FormMode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [scope, setScope] = useState<StoryCircleScope>('game')
  const [refId, setRefId] = useState('')
  const [surfaceGoal, setSurfaceGoal] = useState('')
  const [hiddenGoal, setHiddenGoal] = useState('')
  const [notes, setNotes] = useState('')
  const [canonStatus, setCanonStatus] = useState<CanonStatus>('draft')
  const [steps, setSteps] = useState<StoryCircleStep[]>(emptyCircleSteps())
  const selected = formMode === 'edit' ? circles.find((c) => c.id === selectedId) || null : null

  function load(circle: StoryCircle) {
    setFormMode('edit')
    setSelectedId(circle.id)
    setName(circle.name)
    setKey(circle.key || '')
    setScope(circle.scope)
    setRefId(circle.refId || '')
    setSurfaceGoal(circle.surfaceGoal || '')
    setHiddenGoal(circle.hiddenGoal || '')
    setNotes(circle.notes || '')
    setCanonStatus(circle.canonStatus === 'approved' ? 'approved' : 'draft')
    const filled = emptyCircleSteps()
    for (const step of circle.steps || []) {
      const i = step.index - 1
      if (i >= 0 && i < 8) filled[i] = { ...filled[i]!, ...step }
    }
    setSteps(filled)
  }

  function hide() {
    setFormMode('idle')
    setSelectedId(null)
    setName('')
    setKey('')
    setScope('game')
    setRefId('')
    setSurfaceGoal('')
    setHiddenGoal('')
    setNotes('')
    setCanonStatus('draft')
    setSteps(emptyCircleSteps())
  }

  function patchStep(index: number, patch: Partial<StoryCircleStep>) {
    setSteps((prev) => prev.map((s) => (s.index === index ? { ...s, ...patch } : s)))
  }

  const refs = scope === 'world' ? worlds : scope === 'stage' ? stages : []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
      <div className="panel-section">
        <h3>Circles</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {circles.map((c) => (
            <li
              key={c.id}
              style={{
                padding: '0.4rem',
                cursor: 'pointer',
                background: c.id === selectedId ? 'var(--bg-secondary)' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between'
              }}
              onClick={() => (c.id === selectedId && formMode === 'edit' ? hide() : load(c))}
            >
              <span>
                {c.name}{' '}
                <span style={{ color: 'var(--muted)' }}>
                  {c.scope} {c.canonStatus || 'draft'}
                </span>
              </span>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                style={{ color: 'var(--error)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  void refreshAfter(async () => {
                    const updated = await window.indieForge.storyCircles.remove(projectId, gameId, c.id)
                    if (c.id === selectedId) hide()
                    return updated
                  })
                }}
              >
                Remove
              </button>
            </li>
          ))}
          {circles.length === 0 && <li style={{ color: 'var(--muted)' }}>No circles</li>}
        </ul>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => {
            hide()
            setFormMode('new')
          }}
        >
          + New circle
        </button>
      </div>
      {formMode !== 'idle' && (
        <form
          className="panel-section"
          style={{ display: 'grid', gap: '0.5rem', maxWidth: '44rem' }}
          onSubmit={(e) => {
            e.preventDefault()
            const body = {
              name: name.trim(),
              key: key.trim() || undefined,
              scope,
              refId: refId || null,
              surfaceGoal: surfaceGoal.trim() || null,
              hiddenGoal: hiddenGoal.trim() || null,
              notes: notes.trim() || null,
              canonStatus,
              steps
            }
            void refreshAfter(async () => {
              if (selected) return window.indieForge.storyCircles.update(projectId, gameId, selected.id, body)
              const known = new Set(circles.map((c) => c.id))
              const updated = await window.indieForge.storyCircles.create(projectId, gameId, body)
              const created = createdRecord<StoryCircle>(updated, 'storyCircles', gameId, known)
              if (created) load(created)
              return updated
            })
          }}
        >
          <h3>{selected ? 'Edit circle' : 'New circle'}</h3>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} required />
          </label>
          <label>
            Key
            <input value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} />
          </label>
          <label>
            Scope
            <select
              value={scope}
              disabled={busy}
              onChange={(e) => {
                setScope(e.target.value as StoryCircleScope)
                setRefId('')
              }}
            >
              <option value="game">game</option>
              <option value="world">world</option>
              <option value="stage">stage</option>
            </select>
          </label>
          {scope !== 'game' && (
            <label>
              {scope}
              <select value={refId} disabled={busy} onChange={(e) => setRefId(e.target.value)}>
                <option value="">Select {scope}</option>
                {refs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Surface goal
            <input value={surfaceGoal} onChange={(e) => setSurfaceGoal(e.target.value)} disabled={busy} />
          </label>
          <label>
            Hidden goal
            <input value={hiddenGoal} onChange={(e) => setHiddenGoal(e.target.value)} disabled={busy} />
          </label>
          <CanonSelect value={canonStatus} onChange={setCanonStatus} disabled={busy} />
          {steps.map((step) => (
            <div key={step.index} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '0.5rem' }}>
              <strong>
                {step.index}. {HARMON_STEP_LABELS[step.index - 1]}
              </strong>
              <textarea
                value={step.beat || ''}
                disabled={busy}
                rows={2}
                placeholder="Beat"
                onChange={(e) => patchStep(step.index, { beat: e.target.value })}
              />
              {step.index === 6 && (
                <label>
                  Encounter (Step 6 Take)
                  <select
                    value={step.encounterId || ''}
                    disabled={busy}
                    onChange={(e) => patchStep(step.index, { encounterId: e.target.value || undefined })}
                  >
                    <option value="">(none)</option>
                    {encounters
                      .filter((enc) => scope !== 'stage' || !refId || enc.stageId === refId)
                      .map((enc) => (
                        <option key={enc.id} value={enc.id}>
                          {enc.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {step.index !== 6 && (
                <label>
                  Encounter
                  <select
                    value={step.encounterId || ''}
                    disabled={busy}
                    onChange={(e) => patchStep(step.index, { encounterId: e.target.value || undefined })}
                  >
                    <option value="">(none)</option>
                    {encounters.map((enc) => (
                      <option key={enc.id} value={enc.id}>
                        {enc.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Dialogue
                <select
                  value={step.dialogueId || ''}
                  disabled={busy}
                  onChange={(e) => patchStep(step.index, { dialogueId: e.target.value || undefined })}
                >
                  <option value="">(none)</option>
                  {dialogues.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Flag
                <select
                  value={step.flagId || ''}
                  disabled={busy}
                  onChange={(e) => patchStep(step.index, { flagId: e.target.value || undefined })}
                >
                  <option value="">(none)</option>
                  {flags.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.key ? ` @${f.key}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} rows={2} />
          </label>
          <button type="submit" disabled={busy}>
            Save
          </button>
        </form>
      )}
    </div>
  )
}

export function TokensPanel({
  projectId,
  gameId,
  pipeline,
  busy,
  refreshAfter
}: {
  projectId: string
  gameId: string
  pipeline: AssetPipelineProject
  busy: boolean
  refreshAfter: (m: () => Promise<any>) => Promise<any>
}) {
  const game = pipeline.games.find((g) => g.id === gameId)
  const label = revealTokenLabel(game)
  const tokens = ((pipeline.revealTokens || []) as RevealToken[])
    .filter((t) => t.gameId === gameId)
    .slice()
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  const [formMode, setFormMode] = useState<FormMode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [key, setKey] = useState('')
  const [text, setText] = useState('')
  const [order, setOrder] = useState('0')
  const [chapter, setChapter] = useState('')
  const [canonStatus, setCanonStatus] = useState<CanonStatus>('draft')
  const [unlockedBy, setUnlockedBy] = useState<Condition | undefined>(undefined)
  const selected = formMode === 'edit' ? tokens.find((t) => t.id === selectedId) || null : null

  function load(token: RevealToken) {
    setFormMode('edit')
    setSelectedId(token.id)
    setTitle(token.title)
    setKey(token.key || '')
    setText(token.text)
    setOrder(String(token.order))
    setChapter(token.chapter || '')
    setCanonStatus(token.canonStatus === 'approved' ? 'approved' : 'draft')
    setUnlockedBy(token.unlockedBy)
  }

  function hide() {
    setFormMode('idle')
    setSelectedId(null)
    setTitle('')
    setKey('')
    setText('')
    setOrder(String(tokens.length))
    setChapter('')
    setCanonStatus('draft')
    setUnlockedBy(undefined)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
      <div className="panel-section">
        <h3>{label}s</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {tokens.map((t) => (
            <li
              key={t.id}
              style={{
                padding: '0.4rem',
                cursor: 'pointer',
                background: t.id === selectedId ? 'var(--bg-secondary)' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between'
              }}
              onClick={() => (t.id === selectedId && formMode === 'edit' ? hide() : load(t))}
            >
              <span>
                {t.title}{' '}
                <span style={{ color: 'var(--muted)' }}>
                  {t.key ? `@${t.key}` : ''} {t.canonStatus || 'draft'}
                </span>
              </span>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                style={{ color: 'var(--error)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  void refreshAfter(async () => {
                    const updated = await window.indieForge.revealTokens.remove(projectId, gameId, t.id)
                    if (t.id === selectedId) hide()
                    return updated
                  })
                }}
              >
                Remove
              </button>
            </li>
          ))}
          {tokens.length === 0 && <li style={{ color: 'var(--muted)' }}>No {label.toLowerCase()}s</li>}
        </ul>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => {
            hide()
            setFormMode('new')
          }}
        >
          + New {label.toLowerCase()}
        </button>
      </div>
      {formMode !== 'idle' && (
        <form
          className="panel-section"
          style={{ display: 'grid', gap: '0.5rem', maxWidth: '36rem' }}
          onSubmit={(e) => {
            e.preventDefault()
            const body = {
              title: title.trim(),
              key: key.trim() || undefined,
              text,
              order: Number(order) || 0,
              chapter: chapter.trim() || null,
              canonStatus,
              unlockedBy: unlockedBy || null
            }
            void refreshAfter(async () => {
              if (selected) return window.indieForge.revealTokens.update(projectId, gameId, selected.id, body)
              const known = new Set(tokens.map((t) => t.id))
              const updated = await window.indieForge.revealTokens.create(projectId, gameId, body)
              const created = createdRecord<RevealToken>(updated, 'revealTokens', gameId, known)
              if (created) load(created)
              return updated
            })
          }}
        >
          <h3>
            {selected ? 'Edit' : 'New'} {label.toLowerCase()}
          </h3>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} required />
          </label>
          <label>
            Key
            <input value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} required={!selected} />
          </label>
          <label>
            Text
            <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={busy} rows={4} />
          </label>
          <label>
            Order
            <input value={order} onChange={(e) => setOrder(e.target.value)} disabled={busy} />
          </label>
          <label>
            Chapter
            <input value={chapter} onChange={(e) => setChapter(e.target.value)} disabled={busy} />
          </label>
          <CanonSelect value={canonStatus} onChange={setCanonStatus} disabled={busy} />
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Unlocked by</div>
            <ConditionBuilder
              pipeline={pipeline}
              gameId={gameId}
              value={unlockedBy}
              onChange={setUnlockedBy}
              disabled={busy}
            />
          </div>
          {selected?.flagId && (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Auto flag: {selected.flagId}</p>
          )}
          <button type="submit" disabled={busy}>
            Save
          </button>
        </form>
      )}
    </div>
  )
}
