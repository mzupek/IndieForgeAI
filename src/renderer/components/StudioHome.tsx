import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'

/**
 * Phase 1.5: Studio home with game switcher
 * Opens directly to the studio workspace, no projects list
 */
export function StudioHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeProject, openProject } = useProjectStore()
  const [selectedGameId, setSelectedGameId] = useState<string>('')

  // Load the first available project (or create one if none exists)
  useEffect(() => {
    const loadStudio = async () => {
      if (activeProject) return

      try {
        const projects = await window.indieForge.projects.list()
        
        if (projects.length === 0) {
          // Create default studio project if none exists
          const newProject = await window.indieForge.projects.create({
            name: 'Adventure Lens Studio',
            description: 'Character cards, poses, clips, and scene presets',
            targetPlatform: 'Multi-platform (Unity & Godot)',
            engine: 'unity',
            craftPath: 'engine_materials',
            styleGuide: {
              artStyle: 'Adventure Lens Games style',
              perspective: 'side_view',
              defaultSpriteWidth: 256,
              defaultSpriteHeight: 256,
              defaultBackgroundWidth: 1920,
              defaultBackgroundHeight: 1080,
              notes: 'Asset pipeline for multiple games'
            }
          })
          await openProject(newProject.id)
        } else {
          // Open the first project
          await openProject(projects[0].id)
        }
      } catch (err) {
        console.error('Failed to load studio:', err)
      }
    }

    loadStudio()
  }, [activeProject, openProject])

  useEffect(() => {
    if (activeProject?.assetPipeline?.games.length && !selectedGameId) {
      // Select first game by default
      setSelectedGameId(activeProject.assetPipeline.games[0].id)
    }
  }, [activeProject, selectedGameId])

  if (!activeProject) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
        Loading studio...
      </div>
    )
  }

  const games = activeProject.assetPipeline?.games ?? []
  const currentGame = games.find((g) => g.id === selectedGameId) || games[0]

  const handleGameChange = (gameId: string) => {
    setSelectedGameId(gameId)
    // Navigate to the current view but with the new game
    const path = location.pathname
    if (path === '/' || path === '/studio') {
      navigate(`/studio/characters/${gameId}`)
    } else if (path.startsWith('/studio/characters/')) {
      navigate(`/studio/characters/${gameId}`)
    } else if (path.startsWith('/studio/poses/')) {
      navigate(`/studio/poses/${gameId}`)
    } else if (path.startsWith('/studio/clips/')) {
      navigate(`/studio/clips/${gameId}`)
    } else if (path.startsWith('/studio/library/') || path.startsWith('/studio/assets/')) {
      navigate(`/studio/library/${gameId}`)
    } else if (path.startsWith('/studio/scenes/')) {
      navigate(`/studio/scenes/${gameId}`)
    } else if (path.startsWith('/studio/storyboards/')) {
      navigate(`/studio/storyboards/${gameId}`)
    } else if (path.startsWith('/studio/definitions/')) {
      navigate(`/studio/definitions/${gameId}`)
    } else if (path.startsWith('/studio/export/')) {
      navigate(`/studio/export/${gameId}`)
    }
  }

  return (
    <div className="studio-layout">
      <div className="studio-header" style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        background: 'var(--bg-secondary)'
      }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--forge-gold)' }}>
          Adventure Lens Studio
        </h2>
        
        {games.length > 0 && (
          <>
            <span style={{ color: 'var(--muted)' }}>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label htmlFor="game-switcher" style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                Game:
              </label>
              <select
                id="game-switcher"
                value={selectedGameId}
                onChange={(e) => handleGameChange(e.target.value)}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                {games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name} ({game.engine})
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div className="studio-content" style={{ flex: 1, overflow: 'auto' }}>
        <Outlet context={{ projectId: activeProject.id, gameId: currentGame?.id }} />
      </div>
    </div>
  )
}
