/**
 * NPCs, dialogue editor, and in-app dialogue preview (Step 4).
 */

import { useMemo, useState } from 'react'
import { ConditionBuilder, EffectList } from './ConditionBuilder'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import {
  playDialogue,
  poseForSlot,
  speakerCharacter,
  visibleChoices
} from '@shared/story/dialogue'
import { flagsOf } from '@shared/story/conditions'
import { parseFlagAssignments } from '@shared/story/simulate'
import { effectivePoseSlots } from '@shared/gameSettings/poseSlots'
import type {
  AssetPipelineProject,
  Dialogue,
  DialogueNode,
  Effect,
  Npc,
  NpcPlacement
} from '@shared/types/assetPipeline'

type FormMode = 'idle' | 'new' | 'edit'

function createdRecord<T extends { id: string; gameId: string }>(
  updated: unknown,
  collection: 'npcs' | 'dialogues',
  gameId: string,
  knownIds: Set<string>
): T | undefined {
  const rows = ((updated as { assetPipeline?: AssetPipelineProject } | null)?.assetPipeline?.[collection] ||
    []) as unknown as T[]
  return rows.find((row) => row.gameId === gameId && !knownIds.has(row.id))
}

export function NpcPanel({
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
  const npcs = ((pipeline.npcs || []) as Npc[])
    .filter((n) => n.gameId === gameId)
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  const characters = (pipeline.characters || []).filter((c) => c.gameId === gameId)
  const regions = (pipeline.regions || []).filter((r) => r.gameId === gameId)
  const dialogues = (pipeline.dialogues || []).filter((d) => d.gameId === gameId)
  const triggers = (pipeline.triggers || []).filter((t) => t.gameId === gameId && t.kind === 'onHotspot')
  const [formMode, setFormMode] = useState<FormMode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [key, setKey] = useState('')
  const [characterId, setCharacterId] = useState('')
  const [role, setRole] = useState('mentor')
  const [placements, setPlacements] = useState<NpcPlacement[]>([])
  const [defaultDialogueId, setDefaultDialogueId] = useState('')
  const [notes, setNotes] = useState('')
  const selected = formMode === 'edit' ? npcs.find((n) => n.id === selectedId) || null : null

  function load(npc: Npc) {
    setFormMode('edit')
    setSelectedId(npc.id)
    setDisplayName(npc.displayName)
    setKey(npc.key || '')
    setCharacterId(npc.characterId)
    setRole(npc.role)
    setPlacements((npc.placements || []).map((p) => ({ ...p })))
    setDefaultDialogueId(npc.defaultDialogueId || '')
    setNotes(npc.notes || '')
  }

  function hide() {
    setFormMode('idle')
    setSelectedId(null)
    setDisplayName('')
    setKey('')
    setCharacterId(characters[0]?.id || '')
    setRole('mentor')
    setPlacements([])
    setDefaultDialogueId('')
    setNotes('')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
      <div className="panel-section">
        <h3>NPCs</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {npcs.map((n) => (
            <li
              key={n.id}
              style={{
                padding: '0.4rem',
                cursor: 'pointer',
                background: n.id === selectedId ? 'var(--bg-secondary)' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between'
              }}
              onClick={() => (n.id === selectedId && formMode === 'edit' ? hide() : load(n))}
            >
              <span>
                {n.displayName} <span style={{ color: 'var(--muted)' }}>{n.role}</span>
              </span>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                style={{ color: 'var(--error)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  void refreshAfter(async () => {
                    const updated = await window.indieForge.npcs.remove(projectId, gameId, n.id)
                    if (n.id === selectedId) hide()
                    return updated
                  })
                }}
              >
                Remove
              </button>
            </li>
          ))}
          {npcs.length === 0 && <li style={{ color: 'var(--muted)' }}>No NPCs</li>}
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
          + New NPC
        </button>
      </div>
      {formMode !== 'idle' && (
        <form
          className="panel-section"
          style={{ display: 'grid', gap: '0.5rem', maxWidth: '40rem' }}
          onSubmit={(e) => {
            e.preventDefault()
            const body = {
              displayName: displayName.trim(),
              key: key.trim() || undefined,
              characterId,
              role: role.trim(),
              placements,
              defaultDialogueId: defaultDialogueId || null,
              notes: notes.trim() || undefined
            }
            void refreshAfter(async () => {
              if (selected) return window.indieForge.npcs.update(projectId, gameId, selected.id, body)
              const known = new Set(npcs.map((n) => n.id))
              const updated = await window.indieForge.npcs.create(projectId, gameId, body)
              const created = createdRecord<Npc>(updated, 'npcs', gameId, known)
              if (created) load(created)
              return updated
            })
          }}
        >
          <h3>{selected ? 'Edit NPC' : 'New NPC'}</h3>
          <label>
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={busy} />
          </label>
          <label>
            Key
            <input value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} />
          </label>
          <label>
            Character
            <select value={characterId} disabled={busy} onChange={(e) => setCharacterId(e.target.value)}>
              <option value="">Select character</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>
          </label>
          <label>
            Role
            <input value={role} onChange={(e) => setRole(e.target.value)} disabled={busy} />
          </label>
          <label>
            Default dialogue
            <select value={defaultDialogueId} disabled={busy} onChange={(e) => setDefaultDialogueId(e.target.value)}>
              <option value="">(none)</option>
              {dialogues.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Placements</div>
            {placements.map((p, i) => {
              const region = regions.find((r) => r.id === p.regionId)
              return (
                <div key={i} style={{ display: 'grid', gap: '0.35rem', border: '1px solid var(--border)', padding: '0.5rem', marginBottom: '0.35rem' }}>
                  <select
                    value={p.regionId}
                    disabled={busy}
                    onChange={(e) => {
                      const next = placements.slice()
                      next[i] = { ...p, regionId: e.target.value, anchorId: '' }
                      setPlacements(next)
                    }}
                  >
                    <option value="">Select region</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={p.anchorId}
                    disabled={busy}
                    onChange={(e) => {
                      const next = placements.slice()
                      next[i] = { ...p, anchorId: e.target.value }
                      setPlacements(next)
                    }}
                  >
                    <option value="">Select anchor</option>
                    {(region?.anchors || []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id}
                      </option>
                    ))}
                  </select>
                  <select
                    value={p.interactTriggerId || ''}
                    disabled={busy}
                    onChange={(e) => {
                      const next = placements.slice()
                      next[i] = { ...p, interactTriggerId: e.target.value || undefined }
                      setPlacements(next)
                    }}
                  >
                    <option value="">(no interact trigger)</option>
                    {triggers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <ConditionBuilder
                    pipeline={pipeline}
                    gameId={gameId}
                    value={p.condition}
                    onChange={(condition) => {
                      const next = placements.slice()
                      next[i] = { ...p, condition }
                      setPlacements(next)
                    }}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => setPlacements(placements.filter((_, idx) => idx !== i))}
                  >
                    Remove placement
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => setPlacements([...placements, { regionId: regions[0]?.id || '', anchorId: '' }])}
            >
              + placement
            </button>
          </div>
          <label>
            Notes
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy || !displayName.trim() || !characterId}>
              {selected ? 'Save NPC' : 'Create NPC'}
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

export function DialoguePanel({
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
  const dialogues = ((pipeline.dialogues || []) as Dialogue[])
    .filter((d) => d.gameId === gameId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const npcs = ((pipeline.npcs || []) as Npc[]).filter((n) => n.gameId === gameId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [startNodeId, setStartNodeId] = useState('')
  const [nodes, setNodes] = useState<DialogueNode[]>([])
  const [nodeId, setNodeId] = useState<string | null>(null)
  const selected = dialogues.find((d) => d.id === selectedId) || null
  const editing = nodeId ? nodes.find((n) => n.id === nodeId) || null : null
  const game = pipeline.games.find((g) => g.id === gameId)

  function load(d: Dialogue) {
    setSelectedId(d.id)
    setName(d.name)
    setKey(d.key || '')
    setStartNodeId(d.startNodeId)
    setNodes((d.nodes || []).map((n) => ({ ...n, choices: n.choices ? n.choices.map((c) => ({ ...c })) : undefined })))
    setNodeId(d.nodes[0]?.id || null)
  }

  function persist(nextNodes = nodes, extra: Partial<Dialogue> = {}) {
    if (!selected) return
    void refreshAfter(() =>
      window.indieForge.dialogues.update(projectId, gameId, selected.id, {
        name: name.trim() || selected.name,
        key: key.trim() || undefined,
        startNodeId,
        nodes: nextNodes,
        ...extra
      })
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: '1rem' }}>
      <div className="panel-section">
        <h3>Dialogues</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {dialogues.map((d) => (
            <li
              key={d.id}
              style={{
                padding: '0.4rem',
                cursor: 'pointer',
                background: d.id === selectedId ? 'var(--bg-secondary)' : 'transparent'
              }}
              onClick={() => load(d)}
            >
              {d.name}
            </li>
          ))}
          {dialogues.length === 0 && <li style={{ color: 'var(--muted)' }}>None yet</li>}
        </ul>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => {
            void refreshAfter(async () => {
              const known = new Set(dialogues.map((d) => d.id))
              const updated = await window.indieForge.dialogues.create(projectId, gameId, {
                name: 'New dialogue',
                startNodeId: 'start',
                nodes: [{ id: 'start', speaker: 'narrator', text: '…' }]
              })
              const created = createdRecord<Dialogue>(updated, 'dialogues', gameId, known)
              if (created) load(created)
              return updated
            })
          }}
        >
          + New dialogue
        </button>
        {selected && (
          <button
            type="button"
            className="ghost"
            disabled={busy}
            style={{ color: 'var(--error)' }}
            onClick={() => {
              void refreshAfter(async () => {
                const updated = await window.indieForge.dialogues.remove(projectId, gameId, selected.id)
                setSelectedId(null)
                return updated
              })
            }}
          >
            Remove
          </button>
        )}
      </div>
      {selected && (
        <div className="panel-section" style={{ display: 'grid', gap: '0.5rem' }}>
          <h3>Nodes</h3>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => persist()} disabled={busy} />
          </label>
          <label>
            Key
            <input value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => persist()} disabled={busy} />
          </label>
          <label>
            Start node
            <select
              value={startNodeId}
              disabled={busy}
              onChange={(e) => {
                setStartNodeId(e.target.value)
                persist(nodes, { startNodeId: e.target.value })
              }}
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id}
                </option>
              ))}
            </select>
          </label>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {nodes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="ghost"
                  style={{ fontWeight: n.id === nodeId ? 700 : 400 }}
                  onClick={() => setNodeId(n.id)}
                >
                  {n.id} · {n.speaker}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => {
              const id = `n${nodes.length + 1}`
              const next = [...nodes, { id, speaker: 'narrator', text: '' }]
              setNodes(next)
              setNodeId(id)
              persist(next)
            }}
          >
            + node
          </button>
          {editing && (
            <NodeForm
              pipeline={pipeline}
              gameId={gameId}
              game={game}
              npcs={npcs}
              node={editing}
              busy={busy}
              onChange={(node) => {
                const next = nodes.map((n) => (n.id === node.id ? node : n))
                setNodes(next)
              }}
              onSave={(node) => {
                const next = nodes.map((n) => (n.id === node.id ? node : n))
                setNodes(next)
                persist(next)
              }}
              onRemove={() => {
                const next = nodes.filter((n) => n.id !== editing.id)
                setNodes(next)
                setNodeId(next[0]?.id || null)
                persist(next, { startNodeId: startNodeId === editing.id ? next[0]?.id : startNodeId })
              }}
            />
          )}
        </div>
      )}
      {selected && (
        <DialoguePreview pipeline={pipeline} gameId={gameId} dialogue={{ ...selected, name, startNodeId, nodes }} />
      )}
    </div>
  )
}

function NodeForm({
  pipeline,
  gameId,
  game,
  npcs,
  node,
  busy,
  onChange,
  onSave,
  onRemove
}: {
  pipeline: AssetPipelineProject
  gameId: string
  game: AssetPipelineProject['games'][number] | undefined
  npcs: Npc[]
  node: DialogueNode
  busy: boolean
  onChange: (n: DialogueNode) => void
  onSave: (n: DialogueNode) => void
  onRemove: () => void
}) {
  const character = speakerCharacter(pipeline, gameId, node.speaker)
  const slots = effectivePoseSlots(game, character)
  return (
    <div style={{ display: 'grid', gap: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
      <h4 style={{ margin: 0 }}>Node {node.id}</h4>
      <label>
        Speaker
        <select
          value={node.speaker}
          disabled={busy}
          onChange={(e) => onChange({ ...node, speaker: e.target.value })}
        >
          <option value="narrator">narrator</option>
          <option value="hero">hero</option>
          {npcs.map((n) => (
            <option key={n.id} value={n.id}>
              {n.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Text
        <textarea rows={3} value={node.text} disabled={busy} onChange={(e) => onChange({ ...node, text: e.target.value })} />
      </label>
      <label>
        Pose slot
        <select
          value={node.poseSlot || ''}
          disabled={busy || node.speaker === 'narrator'}
          onChange={(e) => onChange({ ...node, poseSlot: e.target.value || undefined })}
        >
          <option value="">(none)</option>
          {slots.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label || s.key}
            </option>
          ))}
        </select>
      </label>
      <label>
        Next
        <input
          value={node.next || ''}
          disabled={busy || Boolean(node.choices?.length)}
          onChange={(e) => onChange({ ...node, next: e.target.value || undefined })}
        />
      </label>
      <div>
        <div style={{ fontSize: '0.85rem' }}>Effects</div>
        <EffectList
          pipeline={pipeline}
          gameId={gameId}
          value={node.effects || []}
          onChange={(effects) => onChange({ ...node, effects })}
          disabled={busy}
        />
      </div>
      <div>
        <div style={{ fontSize: '0.85rem' }}>Choices</div>
        {(node.choices || []).map((choice, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', padding: '0.4rem', marginBottom: '0.35rem' }}>
            <input
              value={choice.text}
              disabled={busy}
              onChange={(e) => {
                const choices = [...(node.choices || [])]
                choices[i] = { ...choice, text: e.target.value }
                onChange({ ...node, choices, next: undefined })
              }}
            />
            <input
              placeholder="next"
              value={choice.next}
              disabled={busy}
              onChange={(e) => {
                const choices = [...(node.choices || [])]
                choices[i] = { ...choice, next: e.target.value }
                onChange({ ...node, choices, next: undefined })
              }}
            />
            <ConditionBuilder
              pipeline={pipeline}
              gameId={gameId}
              value={choice.condition}
              onChange={(condition) => {
                const choices = [...(node.choices || [])]
                choices[i] = { ...choice, condition }
                onChange({ ...node, choices })
              }}
              disabled={busy}
            />
            <EffectList
              pipeline={pipeline}
              gameId={gameId}
              value={choice.effects || []}
              onChange={(effects: Effect[]) => {
                const choices = [...(node.choices || [])]
                choices[i] = { ...choice, effects }
                onChange({ ...node, choices })
              }}
              disabled={busy}
            />
            <button
              type="button"
              className="ghost"
              onClick={() => onChange({ ...node, choices: (node.choices || []).filter((_, idx) => idx !== i) })}
            >
              Remove choice
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() =>
            onChange({
              ...node,
              next: undefined,
              choices: [...(node.choices || []), { text: 'Continue', next: '' }]
            })
          }
        >
          + choice
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" disabled={busy} onClick={() => onSave(node)}>
          Save node
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={onRemove}>
          Remove node
        </button>
      </div>
    </div>
  )
}

function DialoguePreview({
  pipeline,
  gameId,
  dialogue
}: {
  pipeline: AssetPipelineProject
  gameId: string
  dialogue: Dialogue
}) {
  const flags = flagsOf(pipeline, gameId)
  const [flagText, setFlagText] = useState(() =>
    flags.map((f) => `${f.key || f.name}=${String(f.default)}`).join(',')
  )
  const [choices, setChoices] = useState<number[]>([])
  const result = useMemo(() => {
    try {
      return playDialogue(pipeline, dialogue, { flags: flagText, choices })
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [pipeline, dialogue, flagText, choices])
  const last = 'steps' in result ? result.steps[result.steps.length - 1] : undefined
  const node = last ? (dialogue.nodes || []).find((n) => n.id === last.nodeId) : undefined
  const ctxFlags = parseFlagAssignments(
    flagText,
    flags
  )
  const visible = node ? visibleChoices(node, { flags: ctxFlags, clearedStages: new Set(), wonEncounters: new Set() }) : []
  const character = last ? speakerCharacter(pipeline, gameId, last.speaker) : undefined
  const pose = poseForSlot(pipeline, character, last?.poseSlot)
  const portrait = useLocalFilePreview(pose?.file || character?.thumbnail)

  return (
    <div className="panel-section" style={{ display: 'grid', gap: '0.5rem' }}>
      <h3>Preview</h3>
      <label>
        Simulated flags
        <input value={flagText} onChange={(e) => { setFlagText(e.target.value); setChoices([]) }} />
      </label>
      {'error' in result && <div style={{ color: 'var(--error)' }}>{result.error}</div>}
      {'steps' in result && (
        <>
          <div
            style={{
              width: 128,
              height: 128,
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}
          >
            {portrait ? (
              <img src={portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>No pose</span>
            )}
          </div>
          {last && (
            <div>
              <strong>{last.speakerName}</strong>
              <p>{last.text}</p>
            </div>
          )}
          {visible.length > 0 && result.endReason === 'waiting for choice' && (
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              {visible.map((c, i) => (
                <button key={i} type="button" onClick={() => setChoices([...choices, i + 1])}>
                  {i + 1}. {c.text}
                </button>
              ))}
            </div>
          )}
          {result.ended && <div style={{ color: 'var(--muted)' }}>{result.endReason}</div>}
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Effects: {result.appliedEffects.join('; ') || '(none)'}
          </div>
          <button type="button" className="ghost" onClick={() => setChoices([])}>
            Restart
          </button>
        </>
      )}
    </div>
  )
}
