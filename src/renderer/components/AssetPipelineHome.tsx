import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'

/**
 * Phase 0 placeholder: Home screen listing games from the new asset pipeline model.
 * Future phases will add UI for characters, poses, clips, etc.
 */
export function AssetPipelineHome() {
  const { projectId } = useParams()
  const { activeProject, openProject } = useProjectStore()

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  if (!activeProject) {
    return <p style={{ color: 'var(--muted)' }}>Loading project…</p>
  }

  const games = activeProject.assetPipeline?.games ?? []

  return (
    <div className="asset-pipeline-home">
      <div className="page-header">
        <h2>{activeProject.name}</h2>
        <p style={{ color: 'var(--muted)' }}>
          Adventure Lens Games Asset Pipeline (Phase 0)
        </p>
      </div>

      <section className="panel-section">
        <h3>Games ({games.length})</h3>
        {games.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            No games yet. Future phases will add UI for creating games, characters, poses, and clips.
          </p>
        ) : (
          <div className="game-list">
            {games.map((game) => (
              <div key={game.id} className="game-card">
                <h4>{game.name}</h4>
                <p>
                  <strong>Engine:</strong> {game.engine}
                </p>
                <p>
                  <strong>Export root:</strong> {game.exportRoot}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel-section" style={{ marginTop: '1.5rem' }}>
        <h3>Legacy Project Data</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          This project still contains legacy scenes and assets. Future phases will provide migration tools.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <Link to={`/projects/${projectId}/scenes`} className="secondary">
            View Scenes ({activeProject.scenes.length})
          </Link>
          <Link to={`/projects/${projectId}/assets`} className="secondary">
            View Assets ({activeProject.assets.length})
          </Link>
        </div>
      </section>
    </div>
  )
}
