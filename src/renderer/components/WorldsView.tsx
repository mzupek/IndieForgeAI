/**
 * /studio/world/:gameId — Worlds & Stages, Encounters, Regions.
 * Refreshes the project store after every create/update/remove.
 */

import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import { isBackgroundCategoryKey } from '@shared/gameSettings/assetCategories'
import { resolveLibraryPreviewPath } from '@shared/storyboard/layerValidation'
import type {
  AssetPipelineProject,
  Encounter,
  EncounterStar,
  GameEncounterModule,
  Region,
  Stage,
  World
} from '@shared/types/assetPipeline'

type TabId = 'structure' | 'encounters' | 'regions'

export function WorldsView() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  const [tab, setTab] = useState<TabId>('structure')
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
    { id: 'encounters', label: 'Encounters' },
    { id: 'regions', label: 'Regions' }
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Worlds</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {game.name} • worlds, stages, encounters, regions
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
          worlds={worlds}
          stages={stages}
          busy={busy}
          refreshAfter={refreshAfter}
        />
      )}
      {tab === 'encounters' && (
        <EncounterPanel
          projectId={projectId}
          gameId={gameId}
          stages={stages}
          encounters={encounters}
          types={types}
          modules={modules}
          scenes={scenes.map((s) => ({ id: s.id, name: s.name }))}
          tuning={tuning.map((t) => ({ id: t.id, name: t.name }))}
          busy={busy}
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
          backgrounds={backgrounds.map((a) => ({ id: a.id, name: a.name }))}
          busy={busy}
          refreshAfter={refreshAfter}
        />
      )}
    </div>
  )
}

function WorldStagePanel({
  projectId,
  gameId,
  worlds,
  stages,
  busy,
  refreshAfter
}: {
  projectId: string
  gameId: string
  worlds: World[]
  stages: Stage[]
  busy: boolean
  refreshAfter: (m: () => Promise<any>) => Promise<void>
}) {
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(worlds[0]?.id || null)
  const [wName, setWName] = useState('')
  const [wKey, setWKey] = useState('')
  const [wDesc, setWDesc] = useState('')
  const [wOrder, setWOrder] = useState('1')
  const [sName, setSName] = useState('')
  const [sKey, setSKey] = useState('')
  const [sOrder, setSOrder] = useState('1')
  const [sLevel, setSLevel] = useState('')
  const [sOptional, setSOptional] = useState(false)

  const selectedWorld = worlds.find((w) => w.id === selectedWorldId) || null
  const worldStages = stages.filter((s) => s.worldId === selectedWorldId)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      <div className="panel-section">
        <h3>Worlds</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {worlds.map((w) => (
            <li
              key={w.id}
              style={{
                padding: '0.4rem 0.5rem',
                cursor: 'pointer',
                background: w.id === selectedWorldId ? 'var(--bg-secondary)' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem'
              }}
              onClick={() => {
                setSelectedWorldId(w.id)
                setWName(w.name)
                setWKey(w.key || '')
                setWDesc(w.description || '')
                setWOrder(String(w.order))
              }}
            >
              <span>
                {w.order}. {w.name}
                {w.key ? <code style={{ marginLeft: '0.5rem' }}>@{w.key}</code> : null}
              </span>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                style={{ color: 'var(--error)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  void refreshAfter(() => window.indieForge.worldContent.removeWorld(projectId, gameId, w.id))
                }}
              >
                Remove
              </button>
            </li>
          ))}
          {worlds.length === 0 && <li style={{ color: 'var(--muted)' }}>No worlds yet</li>}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!wName.trim()) return
            void refreshAfter(async () => {
              if (selectedWorld) {
                return window.indieForge.worldContent.updateWorld(projectId, gameId, selectedWorld.id, {
                  name: wName.trim(),
                  key: wKey.trim() || undefined,
                  description: wDesc.trim() || undefined,
                  order: Number(wOrder) || 1
                })
              }
              const updated = await window.indieForge.worldContent.createWorld(projectId, gameId, {
                name: wName.trim(),
                key: wKey.trim() || undefined,
                description: wDesc.trim() || undefined,
                order: Number(wOrder) || undefined
              })
              setWName('')
              setWKey('')
              setWDesc('')
              return updated
            })
          }}
          style={{ display: 'grid', gap: '0.4rem', marginTop: '0.75rem' }}
        >
          <input placeholder="Name" value={wName} onChange={(e) => setWName(e.target.value)} disabled={busy} />
          <input placeholder="key (optional)" value={wKey} onChange={(e) => setWKey(e.target.value)} disabled={busy} />
          <input placeholder="Description" value={wDesc} onChange={(e) => setWDesc(e.target.value)} disabled={busy} />
          <input placeholder="Order" value={wOrder} onChange={(e) => setWOrder(e.target.value)} disabled={busy} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy || !wName.trim()}>
              {selectedWorld ? 'Save world' : 'Add world'}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => {
                setSelectedWorldId(null)
                setWName('')
                setWKey('')
                setWDesc('')
                setWOrder('1')
              }}
            >
              New
            </button>
          </div>
        </form>
      </div>

      <div className="panel-section">
        <h3>Stages {selectedWorld ? `in ${selectedWorld.name}` : ''}</h3>
        {!selectedWorld && <p style={{ color: 'var(--muted)' }}>Select a world first</p>}
        {selectedWorld && (
          <>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {worldStages.map((s) => (
                <li key={s.id} style={{ padding: '0.35rem 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    {s.order}. {s.name}
                    {s.key ? <code style={{ marginLeft: '0.5rem' }}>@{s.key}</code> : null}
                    {s.optional ? ' (optional)' : ''}
                  </span>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    style={{ color: 'var(--error)' }}
                    onClick={() =>
                      refreshAfter(() => window.indieForge.worldContent.removeStage(projectId, gameId, s.id))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
              {worldStages.length === 0 && <li style={{ color: 'var(--muted)' }}>No stages</li>}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!sName.trim() || !selectedWorld) return
                void refreshAfter(async () => {
                  const updated = await window.indieForge.worldContent.createStage(projectId, gameId, {
                    worldId: selectedWorld.id,
                    name: sName.trim(),
                    key: sKey.trim() || undefined,
                    order: Number(sOrder) || undefined,
                    recommendedLevel: sLevel ? Number(sLevel) : undefined,
                    optional: sOptional
                  })
                  setSName('')
                  setSKey('')
                  setSOptional(false)
                  return updated
                })
              }}
              style={{ display: 'grid', gap: '0.4rem', marginTop: '0.75rem' }}
            >
              <input placeholder="Stage name" value={sName} onChange={(e) => setSName(e.target.value)} disabled={busy} />
              <input placeholder="key (optional)" value={sKey} onChange={(e) => setSKey(e.target.value)} disabled={busy} />
              <input placeholder="Order" value={sOrder} onChange={(e) => setSOrder(e.target.value)} disabled={busy} />
              <input
                placeholder="Recommended level"
                value={sLevel}
                onChange={(e) => setSLevel(e.target.value)}
                disabled={busy}
              />
              <label style={{ fontSize: '0.85rem' }}>
                <input type="checkbox" checked={sOptional} onChange={(e) => setSOptional(e.target.checked)} /> Optional
              </label>
              <button type="submit" disabled={busy || !sName.trim()}>
                Add stage
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function EncounterPanel({
  projectId,
  gameId,
  stages,
  encounters,
  types,
  modules,
  scenes,
  tuning,
  busy,
  refreshAfter
}: {
  projectId: string
  gameId: string
  stages: Stage[]
  encounters: Encounter[]
  types: string[]
  modules: GameEncounterModule[]
  scenes: { id: string; name: string }[]
  tuning: { id: string; name: string }[]
  busy: boolean
  refreshAfter: (m: () => Promise<any>) => Promise<void>
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
  const [stars, setStars] = useState<[EncounterStar | null, EncounterStar | null, EncounterStar | null]>([
    null,
    null,
    null
  ])

  const availableModules = modules.filter((m) => !typeId || m.typeIds.includes(typeId))

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
    setStars([enc.stars[0] || null, enc.stars[1] || null, enc.stars[2] || null])
  }

  function starPayload(): EncounterStar[] {
    return stars
      .map((s, i) =>
        s && s.label.trim() && s.kind.trim()
          ? { id: s.id || `s${i + 1}`, label: s.label, kind: s.kind, params: s.params }
          : null
      )
      .filter((s): s is EncounterStar => Boolean(s))
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
              onClick={() => load(e)}
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
            setStars([null, null, null])
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
            const input = {
              stageId,
              name: name.trim(),
              typeId,
              moduleId,
              key: key.trim() || undefined,
              sceneId: sceneId || undefined,
              tuningProfileId: tuningId || undefined,
              difficultyProfileId: difficulty.trim() || undefined,
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
          <input
            placeholder="difficultyProfileId (stored, not checked)"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            disabled={busy}
          />
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
  backgrounds,
  busy,
  refreshAfter
}: {
  projectId: string
  gameId: string
  pipeline: AssetPipelineProject
  stages: Stage[]
  regions: Region[]
  backgrounds: { id: string; name: string }[]
  busy: boolean
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
          <label>
            Exits JSON
            <textarea rows={4} value={exitsJson} onChange={(e) => setExitsJson(e.target.value)} disabled={busy} />
          </label>
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
