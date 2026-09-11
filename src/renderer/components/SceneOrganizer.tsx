import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AssetThumbnail, NavButton, StatusBadge } from './shared'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

export function SceneOrganizer() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { activeProject, openProject, setActiveProject } = useProjectStore()
  const { setError } = useUIStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !newName.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.indieForge.scenes.create(projectId, {
        name: newName.trim(),
        description: newDescription.trim()
      })
      setActiveProject(result.project)
      setCreating(false)
      setNewName('')
      setNewDescription('')
      navigate(`/projects/${projectId}/scenes/${result.scene.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scene')
    } finally {
      setBusy(false)
    }
  }

  if (!activeProject) return <p>Loading project...</p>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <h2>Scene Organizer — {activeProject.name}</h2>
        <button type="button" onClick={() => setCreating((v) => !v)} disabled={busy}>
          {creating ? 'Cancel' : 'Create scene'}
        </button>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 0 }}>
        Scenes are blueprints: layout slots, generate assets into place, then export a placement-aware package.
      </p>

      {creating && (
        <form className="card form-grid" style={{ marginBottom: '1rem' }} onSubmit={handleCreate}>
          <label>
            Scene name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Main At-Bat"
              required
              autoFocus
            />
          </label>
          <label>
            Description
            <textarea
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Player views a pitch from behind the umpire and calls ball or strike…"
            />
          </label>
          <button type="submit" disabled={busy || !newName.trim()}>
            Create & open composer
          </button>
        </form>
      )}

      <div className="stats">
        <div className="stat">
          <strong>{activeProject.scenes.length}</strong>
          Scenes
        </div>
        <div className="stat">
          <strong>{activeProject.assets.length}</strong>
          Assets
        </div>
        <div className="stat">
          <strong>
            {activeProject.assets.filter((a) => a.status === 'generated' || a.status === 'approved').length}
          </strong>
          Completed
        </div>
      </div>

      <div className="scene-grid">
        {activeProject.scenes.map((scene) => {
          const slotAssets =
            scene.assetSlots
              ?.map((s) => (s.assetId ? activeProject.assets.find((a) => a.id === s.assetId) : undefined))
              .filter(Boolean) ?? []
          const assets = scene.assetIds
            .map((id) => activeProject.assets.find((a) => a.id === id))
            .filter(Boolean)
          const displayAssets = slotAssets.length ? slotAssets : assets
          const completed = displayAssets.filter((a) => a!.status !== 'planned')
          const missing =
            (scene.assetSlots?.filter((s) => s.status === 'missing').length ?? 0) ||
            assets.filter((a) => a!.status === 'planned').length
          const slotCount = scene.assetSlots?.length ?? 0

          return (
            <article key={scene.id} className="card scene-card">
              <div className="card-body">
                <h3>{scene.name}</h3>
                <p>{scene.description || 'No description yet.'}</p>
                <p>
                  <StatusBadge status={scene.status} />
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {slotCount} slots · {completed.length} filled · {missing} missing
                  {scene.viewport
                    ? ` · ${scene.viewport.width}×${scene.viewport.height}`
                    : ''}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {displayAssets.slice(0, 6).map((asset) => (
                    <AssetThumbnail key={asset!.id} asset={asset!} />
                  ))}
                </div>
              </div>
              <div className="card-footer" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <NavButton
                  to={`/projects/${projectId}/scenes/${scene.id}`}
                  className="btn-block"
                >
                  Open composer
                </NavButton>
                <NavButton
                  to={`/projects/${projectId}/assets?scene=${scene.id}`}
                  className="btn-block"
                  variant="secondary"
                >
                  View assets
                </NavButton>
              </div>
            </article>
          )
        })}
      </div>

      {activeProject.scenes.length === 0 && !creating && (
        <p style={{ color: 'var(--muted)' }}>
          No scenes yet. Create one, or run an AI Plan to draft scenes from your game description.
        </p>
      )}
    </div>
  )
}
