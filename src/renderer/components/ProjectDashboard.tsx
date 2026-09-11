import { useEffect, useState } from 'react'
import { NavButton, EmptyState } from './shared'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

export function ProjectDashboard() {
  const { projects, loadProjects } = useProjectStore()
  const { loading, error, setError } = useUIStore()
  const [apiKey, setApiKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const openaiConfigured = useProjectStore((s) => s.openaiConfigured)

  useEffect(() => {
    loadProjects()
    useProjectStore.getState().refreshOpenAIConfig()
  }, [loadProjects])

  const handleDelete = async (projectId: string, name: string) => {
    if (!confirm(`Delete project "${name}"?`)) return
    try {
      await window.indieForge.projects.delete(projectId)
      await loadProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const handleDuplicate = async (projectId: string) => {
    try {
      await window.indieForge.projects.duplicate(projectId)
      await loadProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Duplicate failed')
    }
  }

  const handleSeed = async (kind: 'ring-em-up' | 'neon-recall') => {
    try {
      await window.indieForge.projects.seedSample(kind)
      await loadProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seed failed')
    }
  }

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return
    try {
      await window.indieForge.config.setOpenAIKey(apiKey.trim())
      setApiKey('')
      setKeySaved(true)
      await useProjectStore.getState().refreshOpenAIConfig()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save API key')
    }
  }

  return (
    <div className="standalone-page dashboard-page">
      <div className="page-header">
        <div>
          <h2>Projects</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
            Studio brain for Godot (Ring&apos;Em Up) and Unity (Neon Recall)
          </p>
        </div>
        <div className="toolbar">
          <button type="button" className="secondary btn-sm" onClick={() => void handleSeed('ring-em-up')}>
            Seed Ring&apos;Em Up
          </button>
          <button type="button" className="secondary btn-sm" onClick={() => void handleSeed('neon-recall')}>
            Seed Neon Recall
          </button>
          <NavButton to="/projects/new">New Project</NavButton>
        </div>
      </div>

      <section className="panel-section">
        <h3>OpenAI Configuration</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', margin: '0 0 0.65rem' }}>
          {openaiConfigured
            ? 'API key saved locally and ready for generation.'
            : 'Add your OpenAI key to enable AI planning and image generation.'}
        </p>
        {keySaved && (
          <p style={{ color: 'var(--success)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
            Key saved successfully.
          </p>
        )}
        <div className="panel-section-toolbar">
          <input
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button type="button" onClick={handleSaveKey}>
            Save Key
          </button>
        </div>
      </section>

      {loading && <p style={{ color: 'var(--muted)' }}>Loading projects…</p>}

      {!loading && projects.length === 0 && (
        <EmptyState
          title="No projects yet"
          description="Create a new project or load the Ring'Em Up sample to get started."
          action={<NavButton to="/projects/new">New Project</NavButton>}
        />
      )}

      <div className="card-grid">
        {projects.map((project) => (
          <article key={project.id} className="card project-card">
            <div className="card-body">
              <h3>{project.name}</h3>
              <p className="project-card-desc">{project.description}</p>
              <div className="meta-chips">
                <span className="meta-chip">{project.engine}</span>
                <span className="meta-chip">{project.sceneCount} scenes</span>
                <span className="meta-chip">{project.assetCount} assets</span>
              </div>
              <p className="project-card-platform">{project.targetPlatform}</p>
            </div>
            <div className="card-footer">
              <NavButton to={`/projects/${project.id}/scenes`} className="btn-block">
                Open Project
              </NavButton>
              <div className="card-footer-row">
                <button
                  type="button"
                  className="ghost btn-sm"
                  onClick={() => handleDuplicate(project.id)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="danger btn-sm"
                  onClick={() => handleDelete(project.id, project.name)}
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}
