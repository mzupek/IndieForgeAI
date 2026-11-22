/**
 * /studio/world/:gameId — Worlds & Stages, Encounters, Regions.
 * Refreshes the project store after every create/update/remove.
 */

import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import { isBackgroundCategoryKey } from '@shared/gameSettings/assetCategories'
import { resolveLibraryPreviewPath } from '@shared/storyboard/layerValidation'
import type {
  AssetPipelineProject,
  AttackTable,
  Condition,
  DifficultyProfile,
  Effect,
  Encounter,
  EncounterEnemyLink,
  EncounterStar,
  Enemy,
  GameEncounterModule,
  Region,
  Stage,
  Trigger,
  World
} from '@shared/types/assetPipeline'
import { ConditionBuilder, EffectList } from './ConditionBuilder'
import { WorldMapPanel } from './WorldMapPanel'
import { WorldFlowPreview, type FlowOpenTarget } from './WorldFlowPreview'
import { validateEncounter } from '@shared/worldContent/validate'
import { encounterTuningConflict } from '@shared/worldContent/encounterLinks'
import { formatParamSpec, validateParamsAgainstSpecs } from '@shared/gameSettings/paramSpecs'
import { fieldErrorsFromIssues, formErrorFromIssues, plainErrorMessage } from '@shared/studio/formErrors'

type TabId = 'structure' | 'encounters' | 'regions' | 'map' | 'flow'
type FormMode = 'idle' | 'new' | 'edit'

function moveIdToIndex(ids: string[], fromId: string, toIndex: number): string[] {
  const from = ids.indexOf(fromId)
  if (from < 0) return ids
  const next = ids.filter((id) => id !== fromId)
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, fromId)
  return next
}

function swapId(ids: string[], id: string, dir: -1 | 1): string[] | null {
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return null
  const next = ids.slice()
  const tmp = next[i]
  next[i] = next[j]!
  next[j] = tmp!
  return next
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

export function WorldsView() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  const [tab, setTab] = useState<TabId>('structure')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null)
  const [focusStageId, setFocusStageId] = useState<string | null>(null)
  const [focusEncounterId, setFocusEncounterId] = useState<string | null>(null)
  const [focusRegionId, setFocusRegionId] = useState<string | null>(null)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)

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

  const worlds = (pipeline.worlds || []).filter((w) => w.gameId === gameId).sort((a, b) => a.order - b.order)
  const stages = (pipeline.stages || []).filter((s) => s.gameId === gameId).sort((a, b) => a.order - b.order)
  const encounters = (pipeline.encounters || []).filter((e) => e.gameId === gameId)
  const regions = (pipeline.regions || []).filter((r) => r.gameId === gameId)
  const types = game.settings?.encounterTypes || []
  const modules = game.settings?.modules || []
  const scenes = (pipeline.scenes || []).filter((s) => s.gameId === gameId)
  const tuning = (pipeline.gameDefinitions || []).find((d) => d.gameId === gameId)?.tuningProfiles || []
  const backgrounds = (pipeline.visualAssets || []).filter(
    (a) => a.gameId === gameId && isBackgroundCategoryKey(a.category, game)
  )

  const tabs: { id: TabId; label: string }[] = [
    { id: 'structure', label: 'Worlds & Stages' },
    { id: 'map', label: 'World Map' },
    { id: 'encounters', label: 'Encounters' },
    { id: 'regions', label: 'Regions' },
    { id: 'flow', label: 'Flow' }
  ]

  function openFlowTarget(target: FlowOpenTarget) {
    setTab(target.tab)
    if (target.worldId) setSelectedWorldId(target.worldId)
    if (target.stageId) setFocusStageId(target.stageId)
    if (target.encounterId) setFocusEncounterId(target.encounterId)
    if (target.regionId) setFocusRegionId(target.regionId)
    if (target.nodeId) setFocusNodeId(target.nodeId)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Worlds</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {game.name} • Game &gt; World &gt; Stage &gt; Region &gt; Encounter
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

      {tab === 'structure' && (
        <WorldStagePanel
          projectId={projectId}
          gameId={gameId}
          pipeline={pipeline}
          worlds={worlds}
          stages={stages}
          regions={regions}
          encounters={encounters}
          busy={busy}
          selectedWorldId={selectedWorldId || worlds[0]?.id || null}
          focusStageId={focusStageId}
          onSelectWorld={setSelectedWorldId}
          refreshAfter={refreshAfter}
        />
      )}
      {tab === 'map' && (
        <WorldMapPanel
          projectId={projectId}
          gameId={gameId}
          pipeline={pipeline}
          worlds={worlds}
          stages={stages}
          backgrounds={backgrounds.map((a) => ({ id: a.id, name: a.name }))}
          busy={busy}
          selectedWorldId={selectedWorldId || worlds[0]?.id || null}
          onSelectWorld={setSelectedWorldId}
          focusNodeId={focusNodeId}
          refreshAfter={refreshAfter}
        />
      )}
      {tab === 'encounters' && (
        <EncounterPanel
          projectId={projectId}
          gameId={gameId}
          pipeline={pipeline}
          stages={stages}
          encounters={encounters}
          types={types}
          modules={modules}
          scenes={scenes.map((s) => ({ id: s.id, name: s.name }))}
          tuning={tuning.map((t) => ({ id: t.id, name: t.name, params: t.params }))}
          busy={busy}
          focusId={focusEncounterId}
          refreshAfter={refreshAfter}
        />
      )}
      {tab === 'regions' && (
        <RegionPanel
          projectId={projectId}
          gameId={gameId}
          pipeline={pipeline}
          stages={stages}
          regions={regions}
          encounters={encounters}
          backgrounds={backgrounds.map((a) => ({ id: a.id, name: a.name }))}
          busy={busy}
          focusId={focusRegionId}
          refreshAfter={refreshAfter}
        />
      )}
      {tab === 'flow' && (
        <WorldFlowPreview
          pipeline={pipeline}
          worlds={worlds}
          selectedWorldId={selectedWorldId || worlds[0]?.id || null}
          onSelectWorld={setSelectedWorldId}
          onOpen={openFlowTarget}
        />
      )}
    </div>
  )
}

function OrderControls({
  disabled,
  isFirst,
  isLast,
  onDragStart,
  onMove
}: {
  disabled: boolean
  isFirst: boolean
  isLast: boolean
  onDragStart: (e: DragEvent) => void
  onMove: (dir: -1 | 1) => void
}) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <span
        draggable={!disabled}
        title="Drag to reorder"
        onDragStart={onDragStart}
        style={{
          cursor: disabled ? 'default' : 'grab',
          color: 'var(--muted)',
          userSelect: 'none',
          padding: '0 0.2rem',
          letterSpacing: '-0.12em',
          fontSize: '0.95rem'
        }}
      >
        ⋮⋮
      </span>
      <button
        type="button"
        className="ghost"
        title="Move up"
        disabled={disabled || isFirst}
        onClick={() => onMove(-1)}
        style={{ padding: '0 0.28rem', lineHeight: 1.1, fontSize: '0.7rem' }}
      >
        ▲
      </button>
      <button
        type="button"
        className="ghost"
        title="Move down"
        disabled={disabled || isLast}
        onClick={() => onMove(1)}
        style={{ padding: '0 0.28rem', lineHeight: 1.1, fontSize: '0.7rem' }}
      >
        ▼
      </button>
    </span>
  )
}

function WorldStagePanel({
  projectId,
  gameId,
  pipeline,
  worlds,
  stages,
  regions,
  encounters,
  busy,
  selectedWorldId,
  focusStageId,
  onSelectWorld,
  refreshAfter
}: {
  projectId: string
  gameId: string
  pipeline: AssetPipelineProject
  worlds: World[]
  stages: Stage[]
  regions: Region[]
  encounters: Encounter[]
  busy: boolean
  selectedWorldId: string | null
  focusStageId: string | null
  onSelectWorld: (id: string) => void
  refreshAfter: (m: () => Promise<any>) => Promise<void>
}) {
  const selectedWorld = worlds.find((w) => w.id === selectedWorldId) || null
  const worldStages = stages.filter((s) => s.worldId === selectedWorldId)
  const initialStage = worldStages.find((s) => s.id === focusStageId) || null

  const [worldFormMode, setWorldFormMode] = useState<FormMode>('idle')
  const [wName, setWName] = useState('')
  const [wKey, setWKey] = useState('')
  const [wDesc, setWDesc] = useState('')
  const [wOrder, setWOrder] = useState('1')
  const [stageFormMode, setStageFormMode] = useState<FormMode>(initialStage ? 'edit' : 'idle')
  const [selectedStageId, setSelectedStageId] = useState<string | null>(initialStage?.id || null)
  const [sName, setSName] = useState(initialStage?.name || '')
  const [sKey, setSKey] = useState(initialStage?.key || '')
  const [sOrder, setSOrder] = useState(initialStage ? String(initialStage.order) : '1')
  const [sLevel, setSLevel] = useState(
    initialStage?.recommendedLevel !== undefined ? String(initialStage.recommendedLevel) : ''
  )
  const [sOptional, setSOptional] = useState(Boolean(initialStage?.optional))
  const [entryRegionId, setEntryRegionId] = useState(initialStage?.entryRegionId || '')
  const [entryAnchor, setEntryAnchor] = useState(initialStage?.entryAnchor || '')
  const [returnToNode, setReturnToNode] = useState(initialStage?.returnToNode || '')
  const [clearedBy, setClearedBy] = useState<string[]>(initialStage?.clearedBy || [])
  const [unlockCondition, setUnlockCondition] = useState<Condition | undefined>(initialStage?.unlockCondition)
  const [worldDragOverId, setWorldDragOverId] = useState<string | null>(null)
  const [stageDragOverId, setStageDragOverId] = useState<string | null>(null)

  const editingWorld = worldFormMode === 'edit' ? selectedWorld : null
  const selectedStage = stageFormMode === 'edit' ? worldStages.find((s) => s.id === selectedStageId) || null : null
  const stageRegions = regions.filter((r) => r.stageId === selectedStage?.id)
  const stageEncounters = encounters.filter((e) => e.stageId === selectedStage?.id)
  const mapNodes = selectedWorld?.map?.nodes || []
  const worldIds = worlds.map((w) => w.id)
  const stageIds = worldStages.map((s) => s.id)

  function nextWorldOrder() {
    return worlds.reduce((max, w) => Math.max(max, w.order), 0) + 1
  }

  function nextStageOrder(list = worldStages) {
    return list.reduce((max, s) => Math.max(max, s.order), 0) + 1
  }

  function createdRecord<T extends { id: string }>(
    updated: unknown,
    collection: 'worlds' | 'stages',
    knownIds: Set<string>,
    match: (row: T) => boolean
  ): T | undefined {
    const rows = ((updated as { assetPipeline?: AssetPipelineProject } | null)?.assetPipeline?.[collection] ||
      []) as T[]
    return rows.find((row) => !knownIds.has(row.id) && match(row))
  }

  function fillWorld(w: World) {
    setWName(w.name)
    setWKey(w.key || '')
    setWDesc(w.description || '')
    setWOrder(String(w.order))
  }

  function hideWorldForm() {
    setWorldFormMode('idle')
    setWName('')
    setWKey('')
    setWDesc('')
    setWOrder(String(nextWorldOrder()))
  }

  function beginNewWorld() {
    setWorldFormMode('new')
    setWName('')
    setWKey('')
    setWDesc('')
    setWOrder(String(nextWorldOrder()))
  }

  function selectWorldRow(w: World) {
    if (worldFormMode === 'edit' && w.id === selectedWorldId) {
      hideWorldForm()
      return
    }
    const switching = w.id !== selectedWorldId
    onSelectWorld(w.id)
    setWorldFormMode('edit')
    fillWorld(w)
    if (switching) hideStageForm()
  }

  function loadStage(s: Stage) {
    setStageFormMode('edit')
    setSelectedStageId(s.id)
    setSName(s.name)
    setSKey(s.key || '')
    setSOrder(String(s.order))
    setSLevel(s.recommendedLevel !== undefined ? String(s.recommendedLevel) : '')
    setSOptional(Boolean(s.optional))
    setEntryRegionId(s.entryRegionId || '')
    setEntryAnchor(s.entryAnchor || '')
    setReturnToNode(s.returnToNode || '')
    setClearedBy(s.clearedBy || [])
    setUnlockCondition(s.unlockCondition)
  }

  function hideStageForm(list = worldStages) {
    setStageFormMode('idle')
    setSelectedStageId(null)
    setSName('')
    setSKey('')
    setSOrder(String(nextStageOrder(list)))
    setSLevel('')
    setSOptional(false)
    setEntryRegionId('')
    setEntryAnchor('')
    setReturnToNode('')
    setClearedBy([])
    setUnlockCondition(undefined)
  }

  function beginNewStage(list = worldStages) {
    hideStageForm(list)
    setStageFormMode('new')
    setSOrder(String(nextStageOrder(list)))
  }

  function selectStageRow(s: Stage) {
    if (stageFormMode === 'edit' && s.id === selectedStageId) {
      hideStageForm()
      return
    }
    loadStage(s)
  }

  function persistWorldOrder(ids: string[]) {
    if (ids.length !== worldIds.length || sameOrder(ids, worldIds)) return
    void refreshAfter(async () => {
      const updated = await window.indieForge.worldContent.reorderWorlds(projectId, gameId, ids)
      if (editingWorld) {
        const idx = ids.indexOf(editingWorld.id)
        if (idx >= 0) setWOrder(String(idx + 1))
      }
      return updated
    })
  }

  function persistStageOrder(ids: string[]) {
    if (!selectedWorld) return
    if (ids.length !== stageIds.length || sameOrder(ids, stageIds)) return
    void refreshAfter(async () => {
      const updated = await window.indieForge.worldContent.reorderStages(
        projectId,
        gameId,
        selectedWorld.id,
        ids
      )
      if (selectedStageId) {
        const idx = ids.indexOf(selectedStageId)
        if (idx >= 0) setSOrder(String(idx + 1))
      }
      return updated
    })
  }

  function onRowDragStart(e: DragEvent, id: string) {
    e.stopPropagation()
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.setData('text/forge-order-id', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onRowDragOver(e: DragEvent, id: string, kind: 'world' | 'stage') {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (kind === 'world') setWorldDragOverId(id)
    else setStageDragOverId(id)
  }

  function onWorldDrop(e: DragEvent, toIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    setWorldDragOverId(null)
    const fromId = e.dataTransfer.getData('text/forge-order-id') || e.dataTransfer.getData('text/plain')
    if (!fromId) return
    persistWorldOrder(moveIdToIndex(worldIds, fromId, toIndex))
  }

  function onStageDrop(e: DragEvent, toIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    setStageDragOverId(null)
    const fromId = e.dataTransfer.getData('text/forge-order-id') || e.dataTransfer.getData('text/plain')
    if (!fromId) return
    persistStageOrder(moveIdToIndex(stageIds, fromId, toIndex))
  }

  useEffect(() => {
    if (!focusStageId) return
    const s = stages.find((st) => st.id === focusStageId)
    if (s) loadStage(s)
  }, [focusStageId])

  useEffect(() => {
    const still = worldStages.find((s) => s.id === selectedStageId)
    if (!still) hideStageForm()
  }, [selectedWorldId])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      <div className="panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Worlds</h3>
          <button type="button" className="ghost" disabled={busy} onClick={beginNewWorld}>
            + New world
          </button>
        </div>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {worlds.map((w, index) => {
            const selected = w.id === selectedWorldId && worldFormMode === 'edit'
            const dragOver = worldDragOverId === w.id
            return (
              <li
                key={w.id}
                style={{
                  padding: '0.4rem 0.5rem',
                  cursor: 'pointer',
                  background: selected ? 'var(--bg-secondary)' : 'transparent',
                  boxShadow: selected
                    ? 'inset 3px 0 0 var(--forge-gold)'
                    : dragOver
                      ? 'inset 0 2px 0 var(--forge-gold)'
                      : 'none',
                  borderRadius: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                onClick={() => selectWorldRow(w)}
                onDragOver={(e) => onRowDragOver(e, w.id, 'world')}
                onDragLeave={() => setWorldDragOverId((cur) => (cur === w.id ? null : cur))}
                onDrop={(e) => onWorldDrop(e, index)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                  <OrderControls
                    disabled={busy}
                    isFirst={index === 0}
                    isLast={index === worlds.length - 1}
                    onDragStart={(e) => onRowDragStart(e, w.id)}
                    onMove={(dir) => {
                      const next = swapId(worldIds, w.id, dir)
                      if (next) persistWorldOrder(next)
                    }}
                  />
                  <span>
                    {w.order}. {w.name}
                    {w.key ? <code style={{ marginLeft: '0.5rem' }}>@{w.key}</code> : null}
                  </span>
                </span>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  style={{ color: 'var(--error)' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    const removingSelected = w.id === selectedWorldId
                    void refreshAfter(async () => {
                      const updated = await window.indieForge.worldContent.removeWorld(projectId, gameId, w.id)
                      if (removingSelected) hideWorldForm()
                      return updated
                    })
                  }}
                >
                  Remove
                </button>
              </li>
            )
          })}
          {worlds.length === 0 && <li style={{ color: 'var(--muted)' }}>No worlds yet</li>}
        </ul>
        {worldFormMode === 'idle' && (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Select a world to edit, or click + New world
          </p>
        )}
        {worldFormMode !== 'idle' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!wName.trim()) return
            void refreshAfter(async () => {
              if (editingWorld) {
                return window.indieForge.worldContent.updateWorld(projectId, gameId, editingWorld.id, {
                  name: wName.trim(),
                  key: wKey.trim() || undefined,
                  description: wDesc.trim() || undefined,
                  order: Number(wOrder) || 1
                })
              }
              const knownIds = new Set(worlds.map((w) => w.id))
              const updated = await window.indieForge.worldContent.createWorld(projectId, gameId, {
                name: wName.trim(),
                key: wKey.trim() || undefined,
                description: wDesc.trim() || undefined,
                order: Number(wOrder) || undefined
              })
              const created = createdRecord<World>(updated, 'worlds', knownIds, (w) => w.gameId === gameId)
              if (created) {
                onSelectWorld(created.id)
                setWorldFormMode('edit')
                fillWorld(created)
              }
              return updated
            })
          }}
          style={{ display: 'grid', gap: '0.4rem', marginTop: '0.75rem' }}
        >
          <h4 style={{ margin: 0 }}>{editingWorld ? 'Edit world' : 'New world'}</h4>
          <label>
            Name
            <input value={wName} onChange={(e) => setWName(e.target.value)} disabled={busy} />
          </label>
          <label>
            Key
            <input value={wKey} onChange={(e) => setWKey(e.target.value)} disabled={busy} />
          </label>
          <label>
            Description
            <input value={wDesc} onChange={(e) => setWDesc(e.target.value)} disabled={busy} />
          </label>
          <label>
            Order
            <input value={wOrder} onChange={(e) => setWOrder(e.target.value)} disabled={busy} />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy || !wName.trim()}>
              {editingWorld ? 'Save world' : 'Create world'}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={hideWorldForm}>
              Cancel
            </button>
          </div>
        </form>
        )}
      </div>

      <div className="panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Stages {selectedWorld ? `in ${selectedWorld.name}` : ''}</h3>
          {selectedWorld && (
            <button type="button" className="ghost" disabled={busy} onClick={() => beginNewStage()}>
              + New stage
            </button>
          )}
        </div>
        {!selectedWorld && <p style={{ color: 'var(--muted)' }}>Select a world first</p>}
        {selectedWorld && (
          <>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {worldStages.map((s, index) => {
                const selected = stageFormMode === 'edit' && s.id === selectedStageId
                const dragOver = stageDragOverId === s.id
                return (
                  <li
                    key={s.id}
                    style={{
                      padding: '0.35rem 0.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: selected ? 'var(--bg-secondary)' : 'transparent',
                      boxShadow: selected
                        ? 'inset 3px 0 0 var(--forge-gold)'
                        : dragOver
                          ? 'inset 0 2px 0 var(--forge-gold)'
                          : 'none',
                      borderRadius: 4,
                      gap: '0.5rem'
                    }}
                    onClick={() => selectStageRow(s)}
                    onDragOver={(e) => onRowDragOver(e, s.id, 'stage')}
                    onDragLeave={() => setStageDragOverId((cur) => (cur === s.id ? null : cur))}
                    onDrop={(e) => onStageDrop(e, index)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                      <OrderControls
                        disabled={busy}
                        isFirst={index === 0}
                        isLast={index === worldStages.length - 1}
                        onDragStart={(e) => onRowDragStart(e, s.id)}
                        onMove={(dir) => {
                          const next = swapId(stageIds, s.id, dir)
                          if (next) persistStageOrder(next)
                        }}
                      />
                      <span>
                        {s.order}. {s.name}
                        {s.key ? <code style={{ marginLeft: '0.5rem' }}>@{s.key}</code> : null}
                        {s.optional ? ' (optional)' : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
                      style={{ color: 'var(--error)' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        const removingSelected = s.id === selectedStageId
                        void refreshAfter(async () => {
                          const updated = await window.indieForge.worldContent.removeStage(projectId, gameId, s.id)
                          if (removingSelected) hideStageForm(worldStages.filter((row) => row.id !== s.id))
                          return updated
                        })
                      }}
                    >
                      Remove
                    </button>
                  </li>
                )
              })}
              {worldStages.length === 0 && <li style={{ color: 'var(--muted)' }}>No stages</li>}
            </ul>
            {stageFormMode === 'idle' && (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                Select a stage to edit, or click + New stage
              </p>
            )}
            {stageFormMode !== 'idle' && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!sName.trim() || !selectedWorld) return
                void refreshAfter(async () => {
                  if (selectedStage) {
                    return window.indieForge.worldContent.updateStage(projectId, gameId, selectedStage.id, {
                      name: sName.trim() || selectedStage.name,
                      key: sKey.trim() || undefined,
                      order: Number(sOrder) || selectedStage.order,
                      recommendedLevel: sLevel ? Number(sLevel) : undefined,
                      optional: sOptional,
                      entryRegionId: entryRegionId || null,
                      entryAnchor: entryAnchor || null,
                      returnToNode: returnToNode || null,
                      clearedBy,
                      unlockCondition: unlockCondition || null
                    })
                  }
                  const knownIds = new Set(worldStages.map((s) => s.id))
                  const updated = await window.indieForge.worldContent.createStage(projectId, gameId, {
                    worldId: selectedWorld.id,
                    name: sName.trim(),
                    key: sKey.trim() || undefined,
                    order: Number(sOrder) || undefined,
                    recommendedLevel: sLevel ? Number(sLevel) : undefined,
                    optional: sOptional
                  })
                  const created = createdRecord<Stage>(
                    updated,
                    'stages',
                    knownIds,
                    (s) => s.gameId === gameId && s.worldId === selectedWorld.id
                  )
                  if (created) loadStage(created)
                  return updated
                })
              }}
              style={{ display: 'grid', gap: '0.4rem', marginTop: '0.75rem' }}
            >
              <h4 style={{ margin: 0 }}>{selectedStage ? 'Edit stage' : 'New stage'}</h4>
              <label>
                Name
                <input value={sName} onChange={(e) => setSName(e.target.value)} disabled={busy} />
              </label>
              <label>
                Key
                <input value={sKey} onChange={(e) => setSKey(e.target.value)} disabled={busy} />
              </label>
              <label>
                Order
                <input value={sOrder} onChange={(e) => setSOrder(e.target.value)} disabled={busy} />
              </label>
              <label>
                Recommended level
                <input value={sLevel} onChange={(e) => setSLevel(e.target.value)} disabled={busy} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={sOptional}
                  onChange={(e) => setSOptional(e.target.checked)}
                  disabled={busy}
                />
                Optional
              </label>
              {selectedStage && (
                <>
                  <h4>Stage entry / clear</h4>
                  <label>
                    Entry region
                    <select value={entryRegionId} onChange={(e) => setEntryRegionId(e.target.value)} disabled={busy}>
                      <option value="">(none)</option>
                      {stageRegions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Entry anchor
                    <select value={entryAnchor} onChange={(e) => setEntryAnchor(e.target.value)} disabled={busy}>
                      <option value="">(spawn default)</option>
                      {(stageRegions.find((r) => r.id === entryRegionId)?.anchors || []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Return to node
                    <select value={returnToNode} onChange={(e) => setReturnToNode(e.target.value)} disabled={busy}>
                      <option value="">(this stage&apos;s node)</option>
                      {mapNodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label || n.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Unlock condition</div>
                    <ConditionBuilder
                      pipeline={pipeline}
                      gameId={gameId}
                      value={unlockCondition}
                      onChange={setUnlockCondition}
                      disabled={busy}
                    />
                    <p style={{ color: 'var(--muted)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
                      Lives beside unlockAfter. When both are set, both must pass.
                    </p>
                  </div>
                  <fieldset style={{ border: '1px solid var(--border)', padding: '0.5rem' }}>
                    <legend>Cleared by</legend>
                    {stageEncounters.length === 0 && (
                      <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                        Default: every hotspot-linked encounter
                      </p>
                    )}
                    {stageEncounters.map((enc) => (
                      <label key={enc.id} style={{ display: 'flex', gap: '0.35rem', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={clearedBy.includes(enc.id)}
                          onChange={(e) => {
                            setClearedBy(
                              e.target.checked ? [...clearedBy, enc.id] : clearedBy.filter((id) => id !== enc.id)
                            )
                          }}
                        />
                        {enc.name}
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" disabled={busy || !sName.trim()}>
                  {selectedStage ? 'Save stage' : 'Create stage'}
                </button>
                <button type="button" className="ghost" disabled={busy} onClick={() => hideStageForm()}>
                  Cancel
                </button>
              </div>
            </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EncounterPanel({
  projectId,
  gameId,
  pipeline,
  stages,
  encounters,
  types,
  modules,
  scenes,
  tuning,
  busy,
  focusId,
  refreshAfter
}: {
  projectId: string
  gameId: string
  pipeline: AssetPipelineProject
  stages: Stage[]
  encounters: Encounter[]
  types: string[]
  modules: GameEncounterModule[]
  scenes: { id: string; name: string }[]
  tuning: { id: string; name: string; params?: Record<string, number | string | boolean> }[]
  busy: boolean
  focusId: string | null
  refreshAfter: (m: () => Promise<any>) => Promise<any>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = encounters.find((e) => e.id === selectedId) || null
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [stageId, setStageId] = useState(stages[0]?.id || '')
  const [typeId, setTypeId] = useState(types[0] || '')
  const [moduleId, setModuleId] = useState('')
  const [sceneId, setSceneId] = useState('')
  const [tuningId, setTuningId] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [enemyLinks, setEnemyLinks] = useState<EncounterEnemyLink[]>([])
  const [addEnemyId, setAddEnemyId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [stars, setStars] = useState<[EncounterStar | null, EncounterStar | null, EncounterStar | null]>([
    null,
    null,
    null
  ])
  const [onWin, setOnWin] = useState<Effect[]>([])
  const [onLose, setOnLose] = useState<Effect[]>([])

  const availableModules = modules.filter((m) => !typeId || m.typeIds.includes(typeId))
  const matchingEnemies = ((pipeline.enemies || []) as Enemy[]).filter(
    (e) => e.gameId === gameId && e.moduleId === moduleId
  )
  const matchingTables = ((pipeline.attackTables || []) as AttackTable[]).filter(
    (t) => t.gameId === gameId && t.moduleId === moduleId
  )
  const difficultyProfiles = ((pipeline.difficultyProfiles || []) as DifficultyProfile[])
    .filter((p) => p.gameId === gameId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  function load(enc: Encounter) {
    setSelectedId(enc.id)
    setName(enc.name)
    setKey(enc.key || '')
    setStageId(enc.stageId)
    setTypeId(enc.typeId)
    setModuleId(enc.moduleId)
    setSceneId(enc.sceneId || '')
    setTuningId(enc.tuningProfileId || '')
    setDifficulty(enc.difficultyProfileId || '')
    setEnemyLinks((enc.enemies || []).map((l) => ({ ...l })))
    setAddEnemyId('')
    setFormError(null)
    setFieldErrors({})
    setStars([enc.stars[0] || null, enc.stars[1] || null, enc.stars[2] || null])
    setOnWin(enc.onWin || [])
    setOnLose(enc.onLose || [])
  }

  useEffect(() => {
    if (!focusId) return
    const enc = encounters.find((e) => e.id === focusId)
    if (enc) load(enc)
  }, [focusId])

  function starPayload(): EncounterStar[] {
    return stars
      .map((s, i) =>
        s && s.label.trim() && s.kind.trim()
          ? { id: s.id || `s${i + 1}`, label: s.label, kind: s.kind, params: s.params }
          : null
      )
      .filter((s): s is EncounterStar => Boolean(s))
  }

  const draftEncounter: Encounter = {
    id: selected?.id || 'draft',
    gameId,
    stageId,
    name: name.trim() || 'Untitled',
    typeId,
    moduleId,
    sceneId: sceneId || undefined,
    tuningProfileId: tuningId || undefined,
    difficultyProfileId: difficulty || undefined,
    enemies: enemyLinks.length ? enemyLinks : undefined,
    onWin: onWin.length ? onWin : undefined,
    onLose: onLose.length ? onLose : undefined,
    stars: starPayload(),
    order: selected?.order ?? 1,
    schemaVersion: selected?.schemaVersion || 2,
    createdAt: selected?.createdAt || '',
    updatedAt: selected?.updatedAt || ''
  }
  const tuningWarnings = encounterTuningConflict(pipeline, draftEncounter)
  const leadEnemy = matchingEnemies.find((e) => e.id === enemyLinks[0]?.enemyId)
  const tuningRow = tuning.find((t) => t.id === tuningId)
  const selectedModule = modules.find((m) => m.id === moduleId)
  const paramSpecs = selectedModule?.paramSpecs || []
  const paramIssues = validateParamsAgainstSpecs(paramSpecs, tuningRow?.params, 'params')

  function moveLink(index: number, dir: -1 | 1) {
    setEnemyLinks((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      const tmp = next[index]!
      next[index] = next[j]!
      next[j] = tmp
      return next
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
      <div className="panel-section">
        <h3>Encounters</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {encounters.map((e) => (
            <li
              key={e.id}
              style={{
                padding: '0.4rem',
                cursor: 'pointer',
                background: e.id === selectedId ? 'var(--bg-secondary)' : 'transparent'
              }}
              onClick={() => {
                if (e.id === selectedId) return
                load(e)
              }}
            >
              {e.name} <span style={{ color: 'var(--muted)' }}>{e.typeId}/{e.moduleId}</span>
            </li>
          ))}
          {encounters.length === 0 && <li style={{ color: 'var(--muted)' }}>None yet</li>}
        </ul>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setSelectedId(null)
            setName('')
            setKey('')
            setDifficulty('')
            setEnemyLinks([])
            setAddEnemyId('')
            setFormError(null)
            setFieldErrors({})
            setStars([null, null, null])
            setOnWin([])
            setOnLose([])
          }}
        >
          New encounter
        </button>
      </div>
      <div className="panel-section">
        <h3>{selected ? 'Edit encounter' : 'New encounter'}</h3>
        <form
          style={{ display: 'grid', gap: '0.5rem', maxWidth: '40rem' }}
          onSubmit={(e) => {
            e.preventDefault()
            const issues = validateEncounter(pipeline, draftEncounter)
            const message = formErrorFromIssues(issues)
            if (message) {
              setFormError(message)
              setFieldErrors(fieldErrorsFromIssues(issues))
              return
            }
            const input = {
              stageId,
              name: name.trim(),
              typeId,
              moduleId,
              key: key.trim() || undefined,
              sceneId: sceneId || undefined,
              tuningProfileId: tuningId || undefined,
              difficultyProfileId: difficulty || '',
              enemies: enemyLinks,
              onWin,
              onLose,
              stars: starPayload()
            }
            void refreshAfter(() =>
              selected
                ? window.indieForge.worldContent.updateEncounter(projectId, gameId, selected.id, input)
                : window.indieForge.worldContent.createEncounter(projectId, gameId, input)
            )
          }}
        >
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          <input placeholder="key (optional)" value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} />
          <label>
            Stage
            <select value={stageId} onChange={(e) => setStageId(e.target.value)} disabled={busy}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={busy}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Module
            <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} disabled={busy}>
              <option value="">Select module</option>
              {availableModules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.id})
                </option>
              ))}
            </select>
          </label>
          <label>
            Scene
            <select value={sceneId} onChange={(e) => setSceneId(e.target.value)} disabled={busy}>
              <option value="">(none)</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {formError && (
            <div style={{ color: 'var(--error)', whiteSpace: 'pre-wrap' }}>{formError}</div>
          )}
          <label>
            Tuning profile
            <select value={tuningId} onChange={(e) => setTuningId(e.target.value)} disabled={busy}>
              <option value="">(none)</option>
              {tuning.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {paramSpecs.length > 0 && (
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>
                Module params
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                    <th style={{ padding: '0.15rem 0.35rem 0.15rem 0' }}>Spec</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {paramSpecs.map((spec) => {
                    const hasValue = Boolean(tuningRow && Object.prototype.hasOwnProperty.call(tuningRow.params || {}, spec.key))
                    const value = hasValue ? tuningRow?.params?.[spec.key] : undefined
                    const issue = paramIssues.find((i) => i.path === `params.${spec.key}`)
                    return (
                      <tr key={spec.key}>
                        <td style={{ padding: '0.15rem 0.35rem 0.15rem 0', verticalAlign: 'top' }}>
                          {formatParamSpec(spec)}
                        </td>
                        <td style={{ verticalAlign: 'top', color: issue ? 'var(--forge-gold)' : undefined }}>
                          {hasValue ? String(value) : spec.required ? 'missing' : '—'}
                          {issue ? ` — ${issue.message}` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <label>
            Difficulty
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} disabled={busy}>
              <option value="">Player's choice</option>
              {difficultyProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {fieldErrors.difficultyProfileId && (
            <div style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{fieldErrors.difficultyProfileId}</div>
          )}
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>
              Enemies (first is lead). Only enemies on this module are listed.
            </div>
            {enemyLinks.map((link, index) => {
              const enemy = matchingEnemies.find((e) => e.id === link.enemyId)
              return (
                <div
                  key={`${link.enemyId}-${index}`}
                  style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', alignItems: 'center' }}
                >
                  <span style={{ minWidth: '3.5rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {index === 0 ? 'Lead' : `#${index + 1}`}
                  </span>
                  <span style={{ flex: 1 }}>{enemy?.name || link.enemyId}</span>
                  <select
                    value={link.attackTableId || ''}
                    disabled={busy}
                    onChange={(e) => {
                      const next = [...enemyLinks]
                      const row = { ...link }
                      if (e.target.value) row.attackTableId = e.target.value
                      else delete row.attackTableId
                      next[index] = row
                      setEnemyLinks(next)
                    }}
                  >
                    <option value="">Enemy default table</option>
                    {matchingTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="ghost" disabled={busy || index === 0} onClick={() => moveLink(index, -1)}>
                    Up
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy || index === enemyLinks.length - 1}
                    onClick={() => moveLink(index, 1)}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    style={{ color: 'var(--error)' }}
                    disabled={busy}
                    onClick={() => setEnemyLinks(enemyLinks.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <select
                value={addEnemyId}
                onChange={(e) => setAddEnemyId(e.target.value)}
                disabled={busy || !moduleId}
              >
                <option value="">{moduleId ? 'Add enemy…' : 'Pick a module first'}</option>
                {matchingEnemies.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ghost"
                disabled={busy || !addEnemyId}
                onClick={() => {
                  setEnemyLinks([...enemyLinks, { enemyId: addEnemyId }])
                  setAddEnemyId('')
                }}
              >
                Add
              </button>
            </div>
            {matchingEnemies.length === 0 && moduleId && (
              <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>No enemies on this module.</div>
            )}
            {fieldErrors.enemyId && (
              <div style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{fieldErrors.enemyId}</div>
            )}
          </div>
          {tuningWarnings.length > 0 && (
            <div
              style={{
                padding: '0.75rem',
                border: '1px solid var(--forge-gold)',
                borderRadius: 4,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                fontSize: '0.85rem'
              }}
            >
              <div>
                <div style={{ color: 'var(--muted)', marginBottom: '0.25rem' }}>Encounter tuning</div>
                <div>{tuningRow?.name || tuningId}</div>
                {tuningRow?.params &&
                  Object.entries(tuningRow.params).map(([k, v]) => (
                    <div key={k}>
                      {k}: {String(v)}
                    </div>
                  ))}
              </div>
              <div>
                <div style={{ color: 'var(--muted)', marginBottom: '0.25rem' }}>Lead enemy win condition</div>
                <div>{leadEnemy?.name || enemyLinks[0]?.enemyId}</div>
                {leadEnemy?.winCondition && (
                  <div>
                    {leadEnemy.winCondition.kind}{' '}
                    {Object.entries(leadEnemy.winCondition.params || {})
                      .map(([k, v]) => `${k}=${v}`)
                      .join(', ')}
                  </div>
                )}
              </div>
              <div style={{ gridColumn: '1 / -1', color: 'var(--forge-gold)' }}>
                {tuningWarnings[0]?.message}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>On win</div>
            <EffectList pipeline={pipeline} gameId={gameId} value={onWin} onChange={setOnWin} disabled={busy} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>On lose</div>
            <EffectList pipeline={pipeline} gameId={gameId} value={onLose} onChange={setOnLose} disabled={busy} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>Stars (up to 3)</div>
            {[0, 1, 2].map((i) => {
              const star = stars[i] || { id: `s${i + 1}`, label: '', kind: '' }
              return (
                <div key={i} style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem' }}>
                  <input
                    placeholder="label"
                    value={star.label}
                    onChange={(e) => {
                      const next = [...stars] as typeof stars
                      next[i] = { ...star, label: e.target.value, id: star.id || `s${i + 1}` }
                      setStars(next)
                    }}
                    disabled={busy}
                  />
                  <input
                    placeholder="kind"
                    value={star.kind}
                    onChange={(e) => {
                      const next = [...stars] as typeof stars
                      next[i] = { ...star, kind: e.target.value, id: star.id || `s${i + 1}` }
                      setStars(next)
                    }}
                    disabled={busy}
                  />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy || !name.trim() || !stageId || !typeId || !moduleId}>
              {selected ? 'Save' : 'Create'}
            </button>
            {selected && (
              <button
                type="button"
                className="ghost"
                style={{ color: 'var(--error)' }}
                disabled={busy}
                onClick={() =>
                  refreshAfter(() => window.indieForge.worldContent.removeEncounter(projectId, gameId, selected.id))
                }
              >
                Remove
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function RegionPanel({
  projectId,
  gameId,
  pipeline,
  stages,
  regions,
  encounters,
  backgrounds,
  busy,
  focusId,
  refreshAfter
}: {
  projectId: string
  gameId: string
  pipeline: AssetPipelineProject
  stages: Stage[]
  regions: Region[]
  encounters: Encounter[]
  backgrounds: { id: string; name: string }[]
  busy: boolean
  focusId: string | null
  refreshAfter: (m: () => Promise<any>) => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = regions.find((r) => r.id === selectedId) || null
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [stageId, setStageId] = useState('')
  const [backgroundAssetId, setBackgroundAssetId] = useState(backgrounds[0]?.id || '')
  const [spawn, setSpawn] = useState('')
  const [anchorsJson, setAnchorsJson] = useState('[]')
  const [edgesJson, setEdgesJson] = useState('[]')
  const [hotspotsJson, setHotspotsJson] = useState('[]')
  const [exitsJson, setExitsJson] = useState('[]')
  const [jsonError, setJsonError] = useState<string | null>(null)

  const asset = (pipeline.visualAssets || []).find((a) => a.id === backgroundAssetId)
  const previewPath = asset
    ? resolveLibraryPreviewPath(asset, pipeline.assetStates || [], { gameId }).path
    : undefined
  const previewSrc = useLocalFilePreview(previewPath)
  const parsedAnchors = useMemo(() => {
    try {
      const parsed = JSON.parse(anchorsJson || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [anchorsJson])

  function load(region: Region) {
    setSelectedId(region.id)
    setName(region.name)
    setKey(region.key || '')
    setStageId(region.stageId || '')
    setBackgroundAssetId(region.backgroundAssetId)
    setSpawn(region.spawn)
    setAnchorsJson(JSON.stringify(region.anchors, null, 2))
    setEdgesJson(JSON.stringify(region.edges, null, 2))
    setHotspotsJson(JSON.stringify(region.hotspots, null, 2))
    setExitsJson(JSON.stringify(region.exits, null, 2))
    setJsonError(null)
  }

  useEffect(() => {
    if (!focusId) return
    const region = regions.find((r) => r.id === focusId)
    if (region) load(region)
  }, [focusId])

  function parseFields() {
    try {
      const anchors = JSON.parse(anchorsJson || '[]')
      const edges = JSON.parse(edgesJson || '[]')
      const hotspots = JSON.parse(hotspotsJson || '[]')
      const exits = JSON.parse(exitsJson || '[]')
      setJsonError(null)
      return { anchors, edges, hotspots, exits }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setJsonError(message)
      throw new Error(`Invalid JSON: ${message}`)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 280px', gap: '1rem' }}>
      <div className="panel-section">
        <h3>Regions</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {regions.map((r) => (
            <li
              key={r.id}
              style={{
                padding: '0.4rem',
                cursor: 'pointer',
                background: r.id === selectedId ? 'var(--bg-secondary)' : 'transparent'
              }}
              onClick={() => load(r)}
            >
              {r.name}
            </li>
          ))}
          {regions.length === 0 && <li style={{ color: 'var(--muted)' }}>None yet</li>}
        </ul>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setSelectedId(null)
            setName('')
            setKey('')
            setSpawn('')
            setAnchorsJson('[]')
            setEdgesJson('[]')
            setHotspotsJson('[]')
            setExitsJson('[]')
          }}
        >
          New region
        </button>
      </div>
      <div className="panel-section">
        <h3>{selected ? 'Edit region' : 'New region'}</h3>
        {jsonError && <p style={{ color: 'var(--error)' }}>{jsonError}</p>}
        <form
          style={{ display: 'grid', gap: '0.45rem' }}
          onSubmit={(e) => {
            e.preventDefault()
            try {
              const fields = parseFields()
              const input = {
                name: name.trim(),
                key: key.trim() || undefined,
                stageId: stageId || undefined,
                backgroundAssetId,
                spawn: spawn.trim(),
                ...fields
              }
              void refreshAfter(() =>
                selected
                  ? window.indieForge.worldContent.updateRegion(projectId, gameId, selected.id, input)
                  : window.indieForge.worldContent.createRegion(projectId, gameId, input)
              )
            } catch (err) {
              setJsonError(err instanceof Error ? err.message : String(err))
            }
          }}
        >
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          <input placeholder="key (optional)" value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} />
          <label>
            Stage
            <select value={stageId} onChange={(e) => setStageId(e.target.value)} disabled={busy}>
              <option value="">(none)</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Background asset
            <select value={backgroundAssetId} onChange={(e) => setBackgroundAssetId(e.target.value)} disabled={busy}>
              {backgrounds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <input placeholder="spawn anchor id" value={spawn} onChange={(e) => setSpawn(e.target.value)} disabled={busy} />
          <label>
            Anchors JSON
            <textarea rows={5} value={anchorsJson} onChange={(e) => setAnchorsJson(e.target.value)} disabled={busy} />
          </label>
          <label>
            Edges JSON
            <textarea rows={4} value={edgesJson} onChange={(e) => setEdgesJson(e.target.value)} disabled={busy} />
          </label>
          <label>
            Hotspots JSON
            <textarea rows={4} value={hotspotsJson} onChange={(e) => setHotspotsJson(e.target.value)} disabled={busy} />
          </label>
          <HotspotEncounterPickers
            hotspotsJson={hotspotsJson}
            setHotspotsJson={setHotspotsJson}
            encounters={encounters.filter((e) => !stageId || e.stageId === stageId)}
            triggers={((pipeline.triggers || []) as Trigger[]).filter(
              (t) => t.gameId === gameId && t.kind === 'onHotspot'
            )}
            busy={busy}
          />
          <label>
            Exits JSON
            <textarea rows={4} value={exitsJson} onChange={(e) => setExitsJson(e.target.value)} disabled={busy} />
          </label>
          <ExitWorldMapPickers exitsJson={exitsJson} setExitsJson={setExitsJson} busy={busy} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy || !name.trim() || !backgroundAssetId || !spawn.trim()}>
              {selected ? 'Save' : 'Create'}
            </button>
            {selected && (
              <button
                type="button"
                className="ghost"
                style={{ color: 'var(--error)' }}
                disabled={busy}
                onClick={() =>
                  refreshAfter(() => window.indieForge.worldContent.removeRegion(projectId, gameId, selected.id))
                }
              >
                Remove
              </button>
            )}
          </div>
        </form>
      </div>
      <div className="panel-section">
        <h3>Preview</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>View only — map editor is step 6</p>
        <div
          style={{
            position: 'relative',
            width: '100%',
            paddingBottom: '56%',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            overflow: 'hidden'
          }}
        >
          {previewSrc && (
            <img
              src={previewSrc}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {parsedAnchors.map((a: { id?: string; pos?: [number, number] }) => {
            if (!a?.pos) return null
            return (
              <div
                key={a.id}
                title={a.id}
                style={{
                  position: 'absolute',
                  left: `${a.pos[0] * 100}%`,
                  top: `${a.pos[1] * 100}%`,
                  width: 10,
                  height: 10,
                  marginLeft: -5,
                  marginTop: -5,
                  borderRadius: '50%',
                  background: 'var(--forge-gold)',
                  border: '1px solid #000'
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function HotspotEncounterPickers({
  hotspotsJson,
  setHotspotsJson,
  encounters,
  triggers,
  busy
}: {
  hotspotsJson: string
  setHotspotsJson: (v: string) => void
  encounters: Encounter[]
  triggers: Trigger[]
  busy: boolean
}) {
  let hotspots: Array<{ id?: string; encounterId?: string; triggerId?: string }> = []
  try {
    const parsed = JSON.parse(hotspotsJson || '[]')
    if (Array.isArray(parsed)) hotspots = parsed
  } catch {
    return null
  }
  if (hotspots.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Hotspot encounter / trigger</div>
      {hotspots.map((hs, i) => (
        <div key={hs.id || i} style={{ display: 'grid', gap: '0.2rem', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          {hs.id || `hotspot ${i + 1}`}
          <select
            value={hs.encounterId || ''}
            disabled={busy}
            onChange={(e) => {
              const next = hotspots.map((h, idx) =>
                idx === i ? { ...h, encounterId: e.target.value || undefined } : h
              )
              setHotspotsJson(JSON.stringify(next, null, 2))
            }}
          >
            <option value="">(no encounter)</option>
            {encounters.map((enc) => (
              <option key={enc.id} value={enc.id}>
                {enc.name}
              </option>
            ))}
          </select>
          <select
            value={hs.triggerId || ''}
            disabled={busy}
            onChange={(e) => {
              const next = hotspots.map((h, idx) =>
                idx === i ? { ...h, triggerId: e.target.value || undefined } : h
              )
              setHotspotsJson(JSON.stringify(next, null, 2))
            }}
          >
            <option value="">(no trigger)</option>
            {triggers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

function ExitWorldMapPickers({
  exitsJson,
  setExitsJson,
  busy
}: {
  exitsJson: string
  setExitsJson: (v: string) => void
  busy: boolean
}) {
  let exits: Array<{ id?: string; toWorldMap?: boolean; toRegionId?: string }> = []
  try {
    const parsed = JSON.parse(exitsJson || '[]')
    if (Array.isArray(parsed)) exits = parsed
  } catch {
    return null
  }
  if (exits.length === 0) return null
  return (
    <div>
      {exits.map((ex, i) => (
        <label key={ex.id || i} style={{ display: 'flex', gap: '0.35rem', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={Boolean(ex.toWorldMap)}
            disabled={busy}
            onChange={(e) => {
              const next = exits.map((item, idx) => {
                if (idx !== i) return item
                if (e.target.checked) {
                  const { toRegionId: _drop, ...rest } = item
                  return { ...rest, toWorldMap: true }
                }
                const { toWorldMap: _drop, ...rest } = item
                return rest
              })
              setExitsJson(JSON.stringify(next, null, 2))
            }}
          />
          {ex.id || `exit ${i + 1}`}: back to world map
        </label>
      ))}
    </div>
  )
}
