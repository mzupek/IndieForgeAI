import { useEffect, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import type { Character, Pose, PoseSlot } from '@shared/types/assetPipeline'
import type { PoseMetadata } from '@shared/poseValidation'
import { POSE_SLOTS, mapFilenameToSlot } from '@shared/poseValidation'
import { PoseSlotStrip } from './PoseSlotStrip'

export function PosesView() {
  const [searchParams] = useSearchParams()
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<PoseSlot | null>(null)
  const [poseMetadata, setPoseMetadata] = useState<Record<string, PoseMetadata>>({})
  const [importing, setImporting] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const characterParam = searchParams.get('character')

  useEffect(() => {
    if (characterParam) {
      setSelectedCharacterId(characterParam)
    } else if (activeProject?.assetPipeline?.characters.length) {
      const firstChar = activeProject.assetPipeline.characters.find((c) => c.gameId === gameId)
      if (firstChar) {
        setSelectedCharacterId(firstChar.id)
      }
    }
  }, [characterParam, activeProject, gameId])

  useEffect(() => {
    const loadMetadata = async () => {
      if (!projectId || !selectedCharacterId) return
      
      try {
        const metadata = await window.indieForge.pipeline.getPoseMetadata(projectId, selectedCharacterId)
        setPoseMetadata(metadata)
      } catch (err) {
        console.error('Failed to load pose metadata:', err)
      }
    }
    
    loadMetadata()
  }, [projectId, selectedCharacterId, activeProject])

  if (!activeProject || !gameId) {
    return <p style={{ color: 'var(--muted)' }}>Loading...</p>
  }

  const game = activeProject.assetPipeline?.games.find((g) => g.id === gameId)
  const characters = activeProject.assetPipeline?.characters.filter((c) => c.gameId === gameId) ?? []
  const character = characters.find((c) => c.id === selectedCharacterId)
  const poses = activeProject.assetPipeline?.poses.filter((p) => p.characterId === selectedCharacterId) ?? []

  if (!game) {
    return <p style={{ color: 'var(--error)' }}>Game not found</p>
  }

  const handleImportSingle = async () => {
    if (!selectedSlot || !character) return
    
    setImporting(true)
    try {
      const { filePath } = await window.indieForge.files.chooseImage()
      if (filePath) {
        await window.indieForge.pipeline.importPose(
          projectId!,
          character.id,
          selectedSlot,
          filePath,
          { replace: true }
        )
        const updated = await window.indieForge.projects.open(projectId!)
        setActiveProject(updated)
        setSelectedSlot(null)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import pose')
    } finally {
      setImporting(false)
    }
  }

  const handleImportBatch = async () => {
    if (!character) return
    
    setImporting(true)
    try {
      // Note: Electron's dialog doesn't support multi-select in our current setup
      // For now, we'll import one at a time
      const { filePath } = await window.indieForge.files.chooseImage()
      if (filePath) {
        const filename = filePath.split('/').pop() || filePath.split('\\').pop() || ''
        const slot = mapFilenameToSlot(filename)
        
        if (slot) {
          await window.indieForge.pipeline.importPose(
            projectId!,
            character.id,
            slot,
            filePath,
            { replace: true }
          )
          const updated = await window.indieForge.projects.open(projectId!)
          setActiveProject(updated)
        } else {
          alert(`Could not determine slot from filename: ${filename}\nUse format like: character_ready.png`)
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import pose')
    } finally {
      setImporting(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    
    if (!character) return
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    
    setImporting(true)
    try {
      for (const file of files) {
        const slot = mapFilenameToSlot(file.name)
        if (slot) {
          // Note: We need the file path, not the File object
          // In a real scenario, we'd save to temp and import
          console.log(`Would import ${file.name} to ${slot}`)
        }
      }
      // For now, show message about batch import
      alert('Batch import via drag-drop is not yet implemented. Use file picker with auto-mapped filenames.')
    } finally {
      setImporting(false)
    }
  }

  const handleRemovePose = async (poseId: string) => {
    if (!confirm('Remove this pose?')) return
    
    try {
      await window.indieForge.pipeline.removePose(projectId!, poseId)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove pose')
    }
  }

  const handleApprovePose = async (poseId: string) => {
    try {
      await window.indieForge.pipeline.updatePose(projectId!, poseId, { status: 'approved' })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve pose')
    }
  }

  const handleApproveAll = async () => {
    if (!character) return
    if (!confirm(`Approve all ${poses.length} poses for ${character.name}?`)) return
    
    try {
      for (const pose of poses) {
        if (pose.status !== 'approved') {
          await window.indieForge.pipeline.updatePose(projectId!, pose.id, { status: 'approved' })
        }
      }
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve poses')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Poses</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {game.name} • {game.engine} • Five-pose sets
          </p>
        </div>
      </div>

      <div className="panel-section">
        {characters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No characters yet</p>
            <p style={{ fontSize: '0.9rem' }}>
              Create characters first, then manage their poses here.
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <label>
                <span style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '0.5rem', display: 'block' }}>
                  Select Character:
                </span>
                <select
                  value={selectedCharacterId}
                  onChange={(e) => setSelectedCharacterId(e.target.value)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    width: '100%',
                    maxWidth: '400px'
                  }}
                >
                  {characters.map((char) => (
                    <option key={char.id} value={char.id}>
                      {char.name} ({char.role})
                    </option>
                  ))}
                </select>
              </label>
            </div>

                {character && (
              <>
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>{character.name} - Five-Pose Set</h3>
                    {poses.some(p => p.status !== 'approved') && (
                      <button type="button" onClick={handleApproveAll} style={{ fontSize: '0.9rem' }}>
                        Approve All Poses
                      </button>
                    )}
                  </div>
                  <PoseSlotStrip
                    character={character}
                    poses={poses}
                    poseMetadata={poseMetadata}
                    size="large"
                    showBadge={true}
                    onSlotClick={(slot) => setSelectedSlot(slot)}
                  />
                </div>

                {selectedSlot && (
                  <div style={{
                    marginBottom: '2rem',
                    padding: '1rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--forge-gold)',
                    borderRadius: '4px'
                  }}>
                    <p style={{ margin: '0 0 0.75rem 0', color: 'var(--forge-gold)', fontWeight: 'bold' }}>
                      Selected: {selectedSlot} pose
                      {poses.find(p => p.slot === selectedSlot) && (
                        <span style={{ marginLeft: '1rem', fontSize: '0.85rem', fontWeight: 'normal', color: 'var(--muted)' }}>
                          Status: {poses.find(p => p.slot === selectedSlot)?.status}
                        </span>
                      )}
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" onClick={handleImportSingle} disabled={importing}>
                        {importing ? 'Importing...' : 'Import / Replace'}
                      </button>
                      {poses.find(p => p.slot === selectedSlot && p.status !== 'approved') && (
                        <button
                          type="button"
                          onClick={() => {
                            const pose = poses.find(p => p.slot === selectedSlot)
                            if (pose) handleApprovePose(pose.id)
                          }}
                          style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                        >
                          Approve
                        </button>
                      )}
                      <button type="button" className="secondary" onClick={() => setSelectedSlot(null)}>
                        Cancel
                      </button>
                      {poses.find(p => p.slot === selectedSlot) && (
                        <button
                          type="button"
                          className="ghost"
                          style={{ color: 'var(--error)' }}
                          onClick={() => {
                            const pose = poses.find(p => p.slot === selectedSlot)
                            if (pose) handleRemovePose(pose.id)
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    marginTop: '2rem',
                    padding: '1.5rem',
                    border: dragActive ? '2px dashed var(--forge-gold)' : '2px dashed var(--border)',
                    borderRadius: '4px',
                    background: dragActive ? 'rgba(255, 200, 0, 0.05)' : 'var(--bg-secondary)',
                    textAlign: 'center',
                    transition: 'all 0.2s'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragActive(true)
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                >
                  <h4 style={{ margin: '0 0 0.75rem 0' }}>Import Poses</h4>
                  <p style={{ margin: '0 0 1rem 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
                    {dragActive ? 'Drop images here to import' : 'Click a pose slot above to import, or use batch import'}
                  </p>
                  <button type="button" onClick={handleImportBatch} disabled={importing}>
                    Batch Import (Auto-map by Filename)
                  </button>
                  <p style={{ margin: '1rem 0 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    Filename examples: <code>hero_ready.png</code>, <code>boss-hurt.png</code>, <code>npc_win.png</code>
                  </p>
                </div>

                <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0' }}>Requirements</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
                    <li>All five poses must be present</li>
                    <li>Each pose must be 1024×1024 pixels</li>
                    <li>Transparent background required (alpha channel + transparent corners)</li>
                    <li>Consistent facing direction recommended</li>
                    <li>All poses must be "approved" status to count as complete</li>
                  </ul>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
