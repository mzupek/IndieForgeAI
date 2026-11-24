/**
 * /studio/story/:gameId — Flags, Triggers, NPCs, and Dialogue (Steps 3–4).
 */

import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'
import { ConditionBuilder, EffectList } from './ConditionBuilder'
import { plainErrorMessage } from '@shared/studio/formErrors'
import { TRIGGER_KINDS } from '@shared/story/conditions'
import { summarizeCondition, summarizeEffects } from '@shared/story/conditions'
import { DialoguePanel, NpcPanel } from './NpcDialoguePanels'
import { CirclesPanel, TokensPanel } from './StoryCanonPanels'
import type {
  AssetPipelineProject,
  Condition,
  Effect,
  FlagScope,
  FlagType,
  GameFlag,
  Trigger,
  TriggerKind
} from '@shared/types/assetPipeline'

type TabId = 'flags' | 'triggers' | 'npcs' | 'dialogue' | 'circles' | 'tokens'
type FormMode = 'idle' | 'new' | 'edit'

function createdRecord<T extends { id: string; gameId: string }>(
  updated: unknown,
  collection: 'flags' | 'triggers' | 'npcs' | 'dialogues',
  gameId: string,
  knownIds: Set<string>
): T | undefined {
  const rows = ((updated as { assetPipeline?: AssetPipelineProject } | null)?.assetPipeline?.[collection] ||
    []) as unknown as T[]
  return rows.find((row) => row.gameId === gameId && !knownIds.has(row.id))
}

export function StoryView() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  const [tab, setTab] = useState<TabId>('flags')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pipeline = activeProject?.assetPipeline as AssetPipelineProject | undefined
  const game = pipeline?.games.find((g) => g.id === gameId)

  async function refreshAfter(mutator: () => Promise<typeof activeProject>) {
    setBusy(true)
    setError(null)
    try {
      const updated = await mutator()
      if (updated) setActiveProject(updated)
      return updated
    } catch (err) {
      setError(plainErrorMessage(err))
      return null
    } finally {
      setBusy(false)
    }
  }

  if (!activeProject || !gameId || !pipeline || !game) {
    return <p style={{ color: 'var(--muted)' }}>Loading...</p>
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Story</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {game.name} • flags, triggers, NPCs, dialogue, circles, and reveal tokens. Progress is flags
            earned through play.
          </p>
        </div>
      </div>
      {error && (
        <div
          style={{
            margin: '0 0 1rem 0',
            padding: '0.75rem',
            background: 'var(--error-bg, #3a1a1a)',
            border: '1px solid var(--error)',
            borderRadius: '4px',
            color: 'var(--error)',
            whiteSpace: 'pre-wrap'
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
        {(['flags', 'triggers', 'npcs', 'dialogue', 'circles', 'tokens'] as TabId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              padding: '0.5rem 1rem',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === id ? '2px solid var(--forge-gold)' : '2px solid transparent',
              color: tab === id ? 'var(--text)' : 'var(--muted)',
              cursor: 'pointer'
            }}
          >
            {id === 'flags'
              ? 'Flags'
              : id === 'triggers'
                ? 'Triggers'
                : id === 'npcs'
                  ? 'NPCs'
                  : id === 'dialogue'
                    ? 'Dialogue'
                    : id === 'circles'
                      ? 'Circles'
                      : 'Tokens'}
          </button>
        ))}
      </div>
      {tab === 'flags' && (
        <FlagsPanel projectId={projectId} gameId={gameId} pipeline={pipeline} busy={busy} refreshAfter={refreshAfter} />
      )}
      {tab === 'triggers' && (
        <TriggersPanel
          projectId={projectId}
          gameId={gameId}
          pipeline={pipeline}
          busy={busy}
          refreshAfter={refreshAfter}
        />
      )}
      {tab === 'npcs' && (
        <NpcPanel projectId={projectId} gameId={gameId} pipeline={pipeline} busy={busy} refreshAfter={refreshAfter} />
      )}
      {tab === 'dialogue' && (
        <DialoguePanel
          projectId={projectId}
          gameId={gameId}
          pipeline={pipeline}
          busy={busy}
          refreshAfter={refreshAfter}
        />
      )}
      {tab === 'circles' && (
        <CirclesPanel
          projectId={projectId}
          gameId={gameId}
          pipeline={pipeline}
          busy={busy}
          refreshAfter={refreshAfter}
        />
      )}
      {tab === 'tokens' && (
        <TokensPanel
          projectId={projectId}
          gameId={gameId}
          pipeline={pipeline}
          busy={busy}
          refreshAfter={refreshAfter}
        />
      )}
    </div>
  )
}

function FlagsPanel({
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
  const flags = ((pipeline.flags || []) as GameFlag[])
    .filter((f) => f.gameId === gameId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const [formMode, setFormMode] = useState<FormMode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [type, setType] = useState<FlagType>('bool')
  const [defaultValue, setDefaultValue] = useState('false')
  const [scope, setScope] = useState<FlagScope>('game')
  const [description, setDescription] = useState('')
  const selected = formMode === 'edit' ? flags.find((f) => f.id === selectedId) || null : null

  function load(flag: GameFlag) {
    setFormMode('edit')
    setSelectedId(flag.id)
    setName(flag.name)
    setKey(flag.key || '')
    setType(flag.type)
    setDefaultValue(String(flag.default))
    setScope(flag.scope)
    setDescription(flag.description || '')
  }

  function hide() {
    setFormMode('idle')
    setSelectedId(null)
    setName('')
    setKey('')
    setType('bool')
    setDefaultValue('false')
    setScope('game')
    setDescription('')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
      <div className="panel-section">
        <h3>Flags</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {flags.map((f) => (
            <li
              key={f.id}
              style={{
                padding: '0.4rem',
                cursor: 'pointer',
                background: f.id === selectedId ? 'var(--bg-secondary)' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem'
              }}
              onClick={() => {
                if (f.id === selectedId && formMode === 'edit') hide()
                else load(f)
              }}
            >
              <span>
                {f.name}{' '}
                <span style={{ color: 'var(--muted)' }}>
                  {f.key ? `@${f.key}` : ''} {f.type}
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
                    const updated = await window.indieForge.flags.remove(projectId, gameId, f.id)
                    if (f.id === selectedId) hide()
                    return updated
                  })
                }}
              >
                Remove
              </button>
            </li>
          ))}
          {flags.length === 0 && <li style={{ color: 'var(--muted)' }}>No flags</li>}
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
          + New flag
        </button>
      </div>
      {formMode !== 'idle' && (
        <form
          className="panel-section"
          style={{ display: 'grid', gap: '0.5rem', maxWidth: '32rem' }}
          onSubmit={(e) => {
            e.preventDefault()
            const body = {
              name: name.trim(),
              key: key.trim() || undefined,
              type,
              default: type === 'bool' ? defaultValue === 'true' : Number(defaultValue),
              scope,
              description: description.trim() || undefined
            }
            void refreshAfter(async () => {
              if (selected) {
                return window.indieForge.flags.update(projectId, gameId, selected.id, body)
              }
              const known = new Set(flags.map((f) => f.id))
              const updated = await window.indieForge.flags.create(projectId, gameId, body)
              const created = createdRecord<GameFlag>(updated, 'flags', gameId, known)
              if (created) load(created)
              return updated
            })
          }}
        >
          <h3>{selected ? 'Edit flag' : 'New flag'}</h3>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          </label>
          <label>
            Key
            <input value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} />
          </label>
          <label>
            Type
            <select
              value={type}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as FlagType
                setType(next)
                setDefaultValue(next === 'bool' ? 'false' : '0')
              }}
            >
              <option value="bool">bool</option>
              <option value="int">int</option>
            </select>
          </label>
          <label>
            Default
            {type === 'bool' ? (
              <select value={defaultValue} disabled={busy} onChange={(e) => setDefaultValue(e.target.value)}>
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : (
              <input value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} disabled={busy} />
            )}
          </label>
          <label>
            Scope
            <select value={scope} disabled={busy} onChange={(e) => setScope(e.target.value as FlagScope)}>
              <option value="game">game</option>
              <option value="world">world</option>
            </select>
          </label>
          <label>
            Description
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy || !name.trim()}>
              {selected ? 'Save flag' : 'Create flag'}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={hide}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function TriggersPanel({
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
  const triggers = ((pipeline.triggers || []) as Trigger[])
    .filter((t) => t.gameId === gameId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const regions = (pipeline.regions || []).filter((r) => r.gameId === gameId)
  const [formMode, setFormMode] = useState<FormMode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [kind, setKind] = useState<TriggerKind>('onHotspot')
  const [sourceRef, setSourceRef] = useState('')
  const [once, setOnce] = useState(false)
  const [condition, setCondition] = useState<Condition | undefined>(undefined)
  const [effects, setEffects] = useState<Effect[]>([])
  const [notes, setNotes] = useState('')
  const selected = formMode === 'edit' ? triggers.find((t) => t.id === selectedId) || null : null

  const hotspotOptions: string[] = []
  for (const region of regions) {
    for (const hs of region.hotspots || []) {
      hotspotOptions.push(`${region.key || region.id}:${hs.id}`)
    }
  }

  function load(trigger: Trigger) {
    setFormMode('edit')
    setSelectedId(trigger.id)
    setName(trigger.name)
    setKey(trigger.key || '')
    setKind(trigger.kind)
    setSourceRef(trigger.sourceRef)
    setOnce(trigger.once)
    setCondition(trigger.condition)
    setEffects(trigger.effects || [])
    setNotes(trigger.notes || '')
  }

  function hide() {
    setFormMode('idle')
    setSelectedId(null)
    setName('')
    setKey('')
    setKind('onHotspot')
    setSourceRef('')
    setOnce(false)
    setCondition(undefined)
    setEffects([])
    setNotes('')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>
      <div className="panel-section">
        <h3>Triggers</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {triggers.map((t) => (
            <li
              key={t.id}
              style={{
                padding: '0.4rem',
                cursor: 'pointer',
                background: t.id === selectedId ? 'var(--bg-secondary)' : 'transparent'
              }}
              onClick={() => {
                if (t.id === selectedId && formMode === 'edit') hide()
                else load(t)
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span>
                  {t.name} <span style={{ color: 'var(--muted)' }}>{t.kind}</span>
                </span>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  style={{ color: 'var(--error)' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    void refreshAfter(async () => {
                      const updated = await window.indieForge.triggers.remove(projectId, gameId, t.id)
                      if (t.id === selectedId) hide()
                      return updated
                    })
                  }}
                >
                  Remove
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                {summarizeCondition(pipeline, gameId, t.condition)} → {summarizeEffects(pipeline, gameId, t.effects)}
              </div>
            </li>
          ))}
          {triggers.length === 0 && <li style={{ color: 'var(--muted)' }}>No triggers</li>}
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
          + New trigger
        </button>
      </div>
      {formMode !== 'idle' && (
        <form
          className="panel-section"
          style={{ display: 'grid', gap: '0.5rem', maxWidth: '40rem' }}
          onSubmit={(e) => {
            e.preventDefault()
            const body = {
              name: name.trim(),
              key: key.trim() || undefined,
              kind,
              sourceRef: sourceRef.trim(),
              once,
              condition: condition || null,
              effects,
              notes: notes.trim() || undefined
            }
            void refreshAfter(async () => {
              if (selected) {
                return window.indieForge.triggers.update(projectId, gameId, selected.id, body)
              }
              const known = new Set(triggers.map((t) => t.id))
              const updated = await window.indieForge.triggers.create(projectId, gameId, body)
              const created = createdRecord<Trigger>(updated, 'triggers', gameId, known)
              if (created) load(created)
              return updated
            })
          }}
        >
          <h3>{selected ? 'Edit trigger' : 'New trigger'}</h3>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          </label>
          <label>
            Key
            <input value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} />
          </label>
          <label>
            Kind
            <select value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as TriggerKind)}>
              {TRIGGER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source
            {kind === 'onHotspot' && hotspotOptions.length > 0 ? (
              <select value={sourceRef} disabled={busy} onChange={(e) => setSourceRef(e.target.value)}>
                <option value="">Select hotspot</option>
                {hotspotOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder="id, @key, or region:hotspot"
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                disabled={busy}
              />
            )}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} disabled={busy} />
            Once
          </label>
          <div>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Condition</div>
            <ConditionBuilder
              pipeline={pipeline}
              gameId={gameId}
              value={condition}
              onChange={setCondition}
              disabled={busy}
            />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Effects</div>
            <EffectList pipeline={pipeline} gameId={gameId} value={effects} onChange={setEffects} disabled={busy} />
          </div>
          <label>
            Notes
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy || !name.trim() || !sourceRef.trim()}>
              {selected ? 'Save trigger' : 'Create trigger'}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={hide}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
