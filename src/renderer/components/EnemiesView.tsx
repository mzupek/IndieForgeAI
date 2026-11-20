/**
 * /studio/enemies/:gameId — enemy records (2a) and attack tables (2b).
 * Difficulty lands in 2c.
 */

import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import { effectivePoseSlots } from '@shared/gameSettings/poseSlots'
import { BATTLE_TYPE_ID, buildEnemyChecklist, FALLBACK_BATTLE_POSE_SLOT } from '@shared/enemies/validate'
import { AttackTablesPanel } from './AttackTablesPanel'
import type {
  AssetPipelineProject,
  BattleMoment,
  Character,
  Enemy,
  EnemyAssetRef,
  Game,
  Pose
} from '@shared/types/assetPipeline'
import { BATTLE_MOMENTS } from '@shared/types/assetPipeline'

type TabId = 'enemies' | 'tables' | 'difficulty'
type FormMode = 'idle' | 'new' | 'edit'

interface KvRow {
  key: string
  value: string
}

interface AssetRow {
  role: string
  assetId: string
  states: string
}

function kvFromRecord(record: Record<string, number> | undefined): KvRow[] {
  const rows = Object.entries(record || {}).map(([key, value]) => ({ key, value: String(value) }))
  return rows.length ? rows : [{ key: '', value: '' }]
}

function recordFromKv(rows: KvRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (!key) continue
    const n = Number(row.value)
    if (Number.isFinite(n)) out[key] = n
  }
  return out
}

function parseStates(raw: string): string[] | undefined {
  const states = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return states.length ? states : undefined
}

function createdEnemy(updated: unknown, gameId: string, knownIds: Set<string>): Enemy | undefined {
  const rows =
    ((updated as { assetPipeline?: AssetPipelineProject } | null)?.assetPipeline?.enemies || []) as Enemy[]
  return rows.find((row) => row.gameId === gameId && !knownIds.has(row.id))
}

export function EnemiesView() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  const [tab, setTab] = useState<TabId>('enemies')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [characterId, setCharacterId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [winKind, setWinKind] = useState('')
  const [winParams, setWinParams] = useState<KvRow[]>([{ key: 'count', value: '' }])
  const [stats, setStats] = useState<KvRow[]>([{ key: '', value: '' }])
  const [poses, setPoses] = useState<Partial<Record<BattleMoment, string>>>({})
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [notes, setNotes] = useState('')
  const [attackTableId, setAttackTableId] = useState('')

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
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setBusy(false)
    }
  }

  if (!activeProject || !gameId || !pipeline || !game) {
    return <p style={{ color: 'var(--muted)' }}>Loading...</p>
  }

  const enemies = (pipeline.enemies || [])
    .filter((e) => e.gameId === gameId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const characters = (pipeline.characters || []).filter((c) => c.gameId === gameId)
  const battleModules = (game.settings?.modules || []).filter((m) => m.typeIds.includes(BATTLE_TYPE_ID))
  const visualAssets = (pipeline.visualAssets || []).filter((a) => a.gameId === gameId)
  const selected = formMode === 'edit' ? enemies.find((e) => e.id === selectedId) || null : null
  const selectedCharacter = characters.find((c) => c.id === characterId) || null
  const selectedModule = battleModules.find((m) => m.id === moduleId)
  const winKinds = selectedModule?.winConditions || []

  function hideForm() {
    setFormMode('idle')
    setSelectedId(null)
  }

  function fill(enemy: Enemy) {
    setName(enemy.name)
    setKey(enemy.key || '')
    setCharacterId(enemy.characterId)
    setModuleId(enemy.moduleId)
    setWinKind(enemy.winCondition?.kind || '')
    setWinParams(
      Object.keys(enemy.winCondition?.params || {}).length
        ? kvFromRecord(enemy.winCondition.params)
        : [{ key: 'count', value: '' }]
    )
    setStats(kvFromRecord(enemy.stats))
    setPoses({ ...(enemy.poses || {}) })
    setAssets(
      (enemy.assets || []).map((a) => ({
        role: a.role,
        assetId: a.assetId,
        states: (a.states || []).join(', ')
      }))
    )
    setNotes(enemy.notes || '')
    setAttackTableId(enemy.attackTableId || '')
  }

  function beginNew() {
    setFormMode('new')
    setSelectedId(null)
    setName('')
    setKey('')
    setCharacterId(characters[0]?.id || '')
    setModuleId(battleModules[0]?.id || '')
    setWinKind(battleModules[0]?.winConditions?.[0] || '')
    setWinParams([{ key: 'count', value: '' }])
    setStats([{ key: '', value: '' }])
    setPoses({})
    setAssets([])
    setNotes('')
    setAttackTableId('')
  }

  function selectRow(enemy: Enemy) {
    setFormMode('edit')
    setSelectedId(enemy.id)
    fill(enemy)
  }

  function payload() {
    const assetRefs: EnemyAssetRef[] = assets
      .filter((a) => a.role.trim() && a.assetId.trim())
      .map((a) => {
        const ref: EnemyAssetRef = { role: a.role.trim(), assetId: a.assetId.trim() }
        const states = parseStates(a.states)
        if (states) ref.states = states
        return ref
      })
    return {
      name: name.trim(),
      key: key.trim() || undefined,
      characterId,
      moduleId,
      winKind,
      winParams: recordFromKv(winParams),
      stats: recordFromKv(stats),
      poses,
      assets: assetRefs,
      notes: notes.trim() || undefined,
      attackTableId: attackTableId || null
    }
  }

  const draftEnemy: Enemy = {
    id: selected?.id || 'draft',
    gameId,
    name: name.trim() || 'Untitled',
    characterId,
    moduleId,
    winCondition: { kind: winKind, params: recordFromKv(winParams) },
    stats: recordFromKv(stats),
    poses,
    assets: payload().assets,
    notes: notes.trim() || undefined,
    attackTableId: attackTableId || undefined,
    key: key.trim() || undefined,
    schemaVersion: 2,
    createdAt: selected?.createdAt || '',
    updatedAt: selected?.updatedAt || ''
  }
  const checklist = buildEnemyChecklist(pipeline, draftEnemy)

  const tabs: { id: TabId; label: string }[] = [
    { id: 'enemies', label: 'Enemies' },
    { id: 'tables', label: 'Attack tables' },
    { id: 'difficulty', label: 'Difficulty' }
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Enemies</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {game.name} • still poses wrapping a character. Attack tables on this screen; encounter links in 2c.
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
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '0.5rem 1rem',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--forge-gold)' : '2px solid transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--muted)',
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tables' && (
        <AttackTablesPanel
          projectId={projectId}
          gameId={gameId}
          pipeline={pipeline}
          game={game}
          busy={busy}
          refreshAfter={refreshAfter}
        />
      )}
      {tab === 'difficulty' && (
        <p style={{ color: 'var(--muted)' }}>Difficulty profiles come in step 2c.</p>
      )}

      {tab === 'enemies' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.9fr', gap: '1.5rem' }}>
          <div className="panel-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>Enemies</h3>
              <button type="button" className="ghost" disabled={busy} onClick={beginNew}>
                + New
              </button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {enemies.map((e) => {
                const selectedRow = formMode === 'edit' && e.id === selectedId
                return (
                  <li
                    key={e.id}
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
                    onClick={() => selectRow(e)}
                  >
                    <span>
                      {e.name}
                      {e.key ? <code style={{ marginLeft: '0.5rem' }}>@{e.key}</code> : null}
                    </span>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
                      style={{ color: 'var(--error)' }}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        const removingSelected = e.id === selectedId
                        void refreshAfter(async () => {
                          const updated = await window.indieForge.enemies.remove(projectId, gameId, e.id)
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
              {enemies.length === 0 && <li style={{ color: 'var(--muted)' }}>No enemies yet</li>}
            </ul>
            {formMode === 'idle' && (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                Select an enemy to edit, or click + New
              </p>
            )}
          </div>

          {formMode === 'idle' ? null : (
            <form
              className="panel-section"
              onSubmit={(e) => {
                e.preventDefault()
                if (!name.trim() || !characterId || !moduleId || !winKind) return
                void refreshAfter(async () => {
                  const body = payload()
                  if (selected) {
                    return window.indieForge.enemies.update(projectId, gameId, selected.id, body)
                  }
                  const knownIds = new Set(enemies.map((row) => row.id))
                  const updated = await window.indieForge.enemies.create(projectId, gameId, body)
                  const created = createdEnemy(updated, gameId, knownIds)
                  if (created) {
                    setFormMode('edit')
                    setSelectedId(created.id)
                    fill(created)
                  }
                  return updated
                })
              }}
              style={{ display: 'grid', gap: '0.5rem', alignContent: 'start' }}
            >
              <h4 style={{ margin: 0 }}>{selected ? 'Edit enemy' : 'New enemy'}</h4>
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
              </label>
              <label>
                Key
                <input value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} />
              </label>
              <label>
                Character
                <select
                  value={characterId}
                  disabled={busy}
                  onChange={(e) => {
                    setCharacterId(e.target.value)
                    setPoses({})
                  }}
                >
                  <option value="">Select character</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Module
                <select
                  value={moduleId}
                  disabled={busy}
                  onChange={(e) => {
                    const next = e.target.value
                    setModuleId(next)
                    const kinds = battleModules.find((m) => m.id === next)?.winConditions || []
                    if (!kinds.some((k) => k.toLowerCase() === winKind.toLowerCase())) {
                      setWinKind(kinds[0] || '')
                    }
                  }}
                >
                  <option value="">Select module</option>
                  {battleModules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.id})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Win condition
                <select value={winKind} disabled={busy || !winKinds.length} onChange={(e) => setWinKind(e.target.value)}>
                  <option value="">{winKinds.length ? 'Select kind' : 'Add win conditions on the module first'}</option>
                  {winKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <KvEditor label="Win params" rows={winParams} onChange={setWinParams} busy={busy} />
              <label>
                Attack table
                <select
                  value={attackTableId}
                  disabled={busy}
                  onChange={(e) => setAttackTableId(e.target.value)}
                >
                  <option value="">(none)</option>
                  {(pipeline.attackTables || [])
                    .filter((t) => t.gameId === gameId && (!moduleId || t.moduleId === moduleId))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.key ? ` @${t.key}` : ''}
                      </option>
                    ))}
                </select>
              </label>
              <KvEditor label="Stats" rows={stats} onChange={setStats} busy={busy} />
              <BattlePoseRow
                game={game}
                character={selectedCharacter}
                poses={pipeline.poses || []}
                mapping={poses}
                busy={busy}
                onChange={setPoses}
              />
              <AssetEditor
                rows={assets}
                assets={visualAssets}
                states={pipeline.assetStates || []}
                busy={busy}
                onChange={setAssets}
              />
              <label>
                Notes
                <input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" disabled={busy || !name.trim() || !characterId || !moduleId || !winKind}>
                  {selected ? 'Save enemy' : 'Create enemy'}
                </button>
                <button type="button" className="ghost" disabled={busy} onClick={hideForm}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {formMode !== 'idle' && (
          <ChecklistPanel
            checklist={checklist}
            character={selectedCharacter}
            poses={pipeline.poses || []}
            projectId={projectId}
            busy={busy}
            onImported={async () => {
              const updated = await window.indieForge.projects.open(projectId)
              setActiveProject(updated)
            }}
            onError={setError}
          />
          )}
        </div>
      )}
    </div>
  )
}

function KvEditor({
  label,
  rows,
  onChange,
  busy
}: {
  label: string
  rows: KvRow[]
  onChange: (rows: KvRow[]) => void
  busy: boolean
}) {
  return (
    <div>
      <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>{label}</div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.25rem' }}>
          <input
            placeholder="key"
            value={row.key}
            disabled={busy}
            onChange={(e) => {
              const next = rows.slice()
              next[i] = { ...row, key: e.target.value }
              onChange(next)
            }}
          />
          <input
            placeholder="number"
            value={row.value}
            disabled={busy}
            onChange={(e) => {
              const next = rows.slice()
              next[i] = { ...row, value: e.target.value }
              onChange(next)
            }}
          />
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => onChange(rows.filter((_, j) => j !== i).length ? rows.filter((_, j) => j !== i) : [{ key: '', value: '' }])}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="ghost" disabled={busy} onClick={() => onChange([...rows, { key: '', value: '' }])}>
        + Add
      </button>
    </div>
  )
}

function BattlePoseRow({
  game,
  character,
  poses,
  mapping,
  busy,
  onChange
}: {
  game: Game
  character: Character | null
  poses: Pose[]
  mapping: Partial<Record<BattleMoment, string>>
  busy: boolean
  onChange: (next: Partial<Record<BattleMoment, string>>) => void
}) {
  const slots = character ? effectivePoseSlots(game, character) : []
  return (
    <div>
      <div style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>Battle poses</div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        {BATTLE_MOMENTS.map((moment) => {
          const slot = mapping[moment] || ''
          const pose = character ? poses.find((p) => p.characterId === character.id && p.slot === (slot || FALLBACK_BATTLE_POSE_SLOT)) : undefined
          return (
            <label key={moment} style={{ display: 'grid', gap: '0.25rem', justifyItems: 'center', width: 88 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{moment}</span>
              <PoseThumb pose={pose} />
              <select
                value={slot}
                disabled={busy || !character}
                onChange={(e) => {
                  const next = { ...mapping }
                  if (e.target.value) next[moment] = e.target.value
                  else delete next[moment]
                  onChange(next)
                }}
              >
                <option value="">ready (fallback)</option>
                {slots.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.key}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function PoseThumb({ pose }: { pose?: Pose }) {
  const src = useLocalFilePreview(pose?.file)
  return (
    <div
      style={{
        width: 64,
        height: 64,
        border: '1px solid var(--border)',
        borderRadius: 4,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)'
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{pose?.slot || '—'}</span>
      )}
    </div>
  )
}

function AssetEditor({
  rows,
  assets,
  states,
  busy,
  onChange
}: {
  rows: AssetRow[]
  assets: { id: string; name: string }[]
  states: { id: string; assetId: string; name: string }[]
  busy: boolean
  onChange: (rows: AssetRow[]) => void
}) {
  return (
    <div>
      <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Extra assets</div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.35rem', marginBottom: '0.25rem' }}>
          <input
            placeholder="role"
            value={row.role}
            disabled={busy}
            onChange={(e) => {
              const next = rows.slice()
              next[i] = { ...row, role: e.target.value }
              onChange(next)
            }}
          />
          <select
            value={row.assetId}
            disabled={busy}
            onChange={(e) => {
              const next = rows.slice()
              next[i] = { ...row, assetId: e.target.value }
              onChange(next)
            }}
          >
            <option value="">asset</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            placeholder="states (comma)"
            value={row.states}
            disabled={busy}
            onChange={(e) => {
              const next = rows.slice()
              next[i] = { ...row, states: e.target.value }
              onChange(next)
            }}
            list={`enemy-asset-states-${i}`}
          />
          <datalist id={`enemy-asset-states-${i}`}>
            {states
              .filter((s) => s.assetId === row.assetId)
              .map((s) => (
                <option key={s.id} value={s.name} />
              ))}
          </datalist>
          <button type="button" className="ghost" disabled={busy} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ghost"
        disabled={busy}
        onClick={() => onChange([...rows, { role: '', assetId: '', states: '' }])}
      >
        + Asset
      </button>
    </div>
  )
}

function ChecklistPanel({
  checklist,
  character,
  poses,
  projectId,
  busy,
  onImported,
  onError
}: {
  checklist: ReturnType<typeof buildEnemyChecklist>
  character: Character | null
  poses: Pose[]
  projectId: string
  busy: boolean
  onImported: () => Promise<void>
  onError: (message: string) => void
}) {
  const poseBySlot = useMemo(() => {
    const map = new Map<string, Pose>()
    if (!character) return map
    for (const pose of poses) {
      if (pose.characterId === character.id) map.set(pose.slot, pose)
    }
    return map
  }, [character, poses])

  return (
    <div className="panel-section">
      <h4 style={{ margin: '0 0 0.5rem 0' }}>Checklist</h4>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
        {checklist.character || 'No character'} • {checklist.ready ? 'ready' : 'missing art'}
      </p>
      {checklist.poses.map((row) => {
        const pose = poseBySlot.get(row.slot)
        return (
          <div
            key={row.slot}
            style={{
              display: 'grid',
              gridTemplateColumns: '64px 1fr auto',
              gap: '0.5rem',
              alignItems: 'center',
              marginBottom: '0.4rem'
            }}
          >
            <PoseThumb pose={pose} />
            <div>
              <div>
                {row.slot}{' '}
                <span style={{ color: row.have ? 'var(--forge-gold)' : 'var(--error)' }}>
                  {row.have ? 'have' : 'missing'}
                </span>
              </div>
              {row.usedBy ? (
                <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{row.usedBy}</div>
              ) : null}
            </div>
            {!row.have && character ? (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    try {
                      const { filePath } = await window.indieForge.files.chooseImage()
                      if (!filePath) return
                      await window.indieForge.pipeline.importPose(projectId, character.id, row.slot, filePath, {
                        replace: true
                      })
                      await onImported()
                    } catch (err) {
                      onError(err instanceof Error ? err.message : String(err))
                    }
                  })()
                }}
              >
                Import
              </button>
            ) : (
              <span />
            )}
          </div>
        )
      })}
      {checklist.assets.map((a) => (
        <div key={a.role} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
          asset {a.role}: {a.have ? 'have' : 'missing'}
        </div>
      ))}
      {checklist.cueEvents.map((c) => (
        <div key={`cue-${c.id}-${c.usedBy}`} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
          cue {c.name}: {c.have ? 'have' : 'missing'}{' '}
          <span style={{ color: 'var(--muted)' }}>({c.usedBy})</span>
        </div>
      ))}
      {checklist.sfx.map((s) => (
        <div key={`sfx-${s.id}-${s.usedBy}`} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
          sfx {s.name}: {s.have ? 'have' : 'missing'}{' '}
          <span style={{ color: 'var(--muted)' }}>({s.usedBy})</span>
        </div>
      ))}
      <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>usedBy encounters: none until 2c</p>
    </div>
  )
}
