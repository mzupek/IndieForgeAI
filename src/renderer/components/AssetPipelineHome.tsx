import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'

/**
 * Phase 1: Home screen listing games with character count
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
  const characters = activeProject.assetPipeline?.characters ?? []

  return (
    <div className="asset-pipeline-home">
      <div className="page-header">
        <h2>{activeProject.name}</h2>
        <p style={{ color: 'var(--muted)' }}>
          Adventure Lens Games Asset Pipeline
        </p>
      </div>

      <section className="panel-section">
        <h3>Games ({games.length})</h3>
        {games.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            No games yet. Create games to organize your character roster.
          </p>
        ) : (
          <div className="game-list" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {games.map((game) => {
              const gameCharacters = characters.filter((c) => c.gameId === game.id)
              return (
                <Link
                  key={game.id}
                  to={`/projects/${projectId}/pipeline/games/${game.id}/roster`}
                  className="game-card"
                  style={{
                    display: 'block',
                    padding: '1.5rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'border-color 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--forge-gold)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                  }}
                >
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>{game.name}</h4>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
                    <strong>Engine:</strong> {game.engine}
                  </p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
                    {gameCharacters.length} character{gameCharacters.length !== 1 ? 's' : ''}
                  </p>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {game.exportRoot}
                  </p>
                </Link>
              )
            })}
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
