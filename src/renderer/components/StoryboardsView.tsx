import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'
import type { Storyboard, StoryboardShot, Character, Pose, Clip } from '@shared/types/assetPipeline'

export function StoryboardsView() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  const [selectedStoryboard, setSelectedStoryboard] = useState<Storyboard | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  if (!activeProject || !gameId) {
    return <p style={{ color: 'var(--muted)' }}>Loading...</p>
  }

  const game = activeProject.assetPipeline?.games.find((g) => g.id === gameId)
  const storyboards = activeProject.assetPipeline?.storyboards?.filter((sb) => sb.gameId === gameId) ?? []
  const allShots = activeProject.assetPipeline?.storyboardShots ?? []
  const characters = activeProject.assetPipeline?.characters?.filter((c) => c.gameId === gameId) ?? []
  const poses = activeProject.assetPipeline?.poses ?? []
  const clips = activeProject.assetPipeline?.clips ?? []

  if (!game) {
    return <p style={{ color: 'var(--error)' }}>Game not found</p>
  }

  const handleCreateStoryboard = async () => {
    if (!newName.trim()) {
      alert('Please enter a name')
      return
    }

    setCreating(true)
    try {
      // In a real implementation, this would call an IPC handler
      // For now, just show a placeholder
      alert('Storyboard creation will be implemented via IPC handlers')
      setNewName('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create storyboard')
    } finally {
      setCreating(false)
    }
  }

  const selectedShots = selectedStoryboard
    ? allShots.filter((s) => selectedStoryboard.shotIds.includes(s.id))
    : []

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Storyboards</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {game.name} • {game.engine} • Scene sequences with shots and cinematography
          </p>
        </div>
      </div>

      <div className="panel-section">
        <div style={{ marginBottom: '2rem', padding: '1.5rem', border: '2px dashed var(--border)', borderRadius: '4px', background: 'var(--bg-secondary)' }}>
          <h4 style={{ margin: '0 0 1rem 0' }}>Create Storyboard</h4>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Storyboard name (e.g., 'Gate Drone Battle')"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text)'
              }}
            />
            <button type="button" onClick={handleCreateStoryboard} disabled={creating || !newName.trim()}>
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>

        {storyboards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
            <p>No storyboards yet</p>
            <p style={{ fontSize: '0.9rem' }}>Create a storyboard to sequence shots with characters, poses, clips, and effects</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>
            {/* Storyboard list */}
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Storyboards</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {storyboards.map((sb) => (
                  <button
                    key={sb.id}
                    type="button"
                    onClick={() => setSelectedStoryboard(sb)}
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem',
                      background: selectedStoryboard?.id === sb.id ? 'var(--forge-gold)' : 'var(--bg-secondary)',
                      color: selectedStoryboard?.id === sb.id ? 'var(--bg)' : 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{sb.name}</div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                      {sb.shotIds.length} shot{sb.shotIds.length !== 1 ? 's' : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Storyboard details */}
            <div>
              {selectedStoryboard ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.25rem 0' }}>{selectedStoryboard.name}</h3>
                      {selectedStoryboard.description && (
                        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                          {selectedStoryboard.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {selectedShots.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
                      <p>No shots in this storyboard</p>
                      <p style={{ fontSize: '0.9rem' }}>Use CLI: forge shot add --storyboard {selectedStoryboard.id} --name "Shot 1"</p>
                    </div>
                  ) : (
                    <div>
                      <h4 style={{ margin: '0 0 1rem 0' }}>Shot Sequence</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {selectedShots.map((shot, idx) => (
                          <ShotCard
                            key={shot.id}
                            shot={shot}
                            index={idx + 1}
                            characters={characters}
                            poses={poses}
                            clips={clips}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
                  <p>Select a storyboard to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ShotCard({
  shot,
  index,
  characters,
  poses,
  clips
}: {
  shot: StoryboardShot
  index: number
  characters: Character[]
  poses: Pose[]
  clips: Clip[]
}) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '1rem',
      background: 'var(--bg-secondary)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
            Shot {index}
          </div>
          <h4 style={{ margin: 0 }}>{shot.name}</h4>
        </div>
        <div style={{
          padding: '0.25rem 0.5rem',
          background: 'var(--bg)',
          borderRadius: '4px',
          fontSize: '0.85rem'
        }}>
          {shot.durationSec}s • {shot.aspectRatio.width}:{shot.aspectRatio.height}
        </div>
      </div>

      {shot.notes && (
        <div style={{
          padding: '0.75rem',
          background: 'var(--bg)',
          borderRadius: '4px',
          marginBottom: '0.75rem',
          fontSize: '0.9rem',
          fontStyle: 'italic'
        }}>
          📝 {shot.notes}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Layers
          </div>
          {shot.layers.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>No layers</div>
          ) : (
            <div>
              {shot.layers.map((layer) => {
                let content = ''
                if (layer.characterId) {
                  const character = characters.find(c => c.id === layer.characterId)
                  const pose = layer.poseId ? poses.find(p => p.id === layer.poseId) : null
                  content = `${character?.name || 'Unknown'} (${pose?.slot || 'no pose'})`
                } else if (layer.clipId) {
                  const clip = clips.find(c => c.id === layer.clipId)
                  content = `Clip: ${clip?.moment || 'unknown'}`
                } else if (layer.imagePath) {
                  content = `Image: ${layer.imagePath.split('/').pop()}`
                } else {
                  content = 'Empty layer'
                }

                return (
                  <div key={layer.id} style={{ padding: '0.25rem 0' }}>
                    • z{layer.zOrder}: {content}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Camera & Effects
          </div>
          {shot.cameraTrack.length === 0 && shot.effectsTrack.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>None</div>
          ) : (
            <div>
              {shot.cameraTrack.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  🎥 {shot.cameraTrack.length} camera keyframe{shot.cameraTrack.length !== 1 ? 's' : ''}
                </div>
              )}
              {shot.effectsTrack.length > 0 && (
                <div>
                  ✨ {shot.effectsTrack.length} effect{shot.effectsTrack.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
