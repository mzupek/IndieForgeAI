import { useEffect, useState, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import type { Clip, ClipMoment, Character } from '@shared/types/assetPipeline'
import { CLIP_MOMENTS, getMomentDisplayName, formatDuration, validateClipDuration } from '@shared/clipValidation'

export function ClipsView() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  const [filterCharacter, setFilterCharacter] = useState<string>('')
  const [filterMoment, setFilterMoment] = useState<ClipMoment | ''>('')
  const [importing, setImporting] = useState(false)
  const [selectedMoment, setSelectedMoment] = useState<ClipMoment | null>(null)
  const [selectedCharacter, setSelectedCharacter] = useState<string>('')
  const [dragActive, setDragActive] = useState(false)
  const [playingClip, setPlayingClip] = useState<Clip | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!activeProject || !gameId) {
    return <p style={{ color: 'var(--muted)' }}>Loading...</p>
  }

  const game = activeProject.assetPipeline?.games.find((g) => g.id === gameId)
  const characters = activeProject.assetPipeline?.characters.filter((c) => c.gameId === gameId) ?? []
  const allClips = activeProject.assetPipeline?.clips ?? []
  
  // Filter clips by game (via characters)
  const gameCharacterIds = characters.map(c => c.id)
  let clips = allClips.filter(c => !c.characterId || gameCharacterIds.includes(c.characterId))
  
  // Apply filters
  if (filterCharacter) {
    clips = clips.filter(c => c.characterId === filterCharacter)
  }
  if (filterMoment) {
    clips = clips.filter(c => c.moment === filterMoment)
  }

  if (!game) {
    return <p style={{ color: 'var(--error)' }}>Game not found</p>
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedMoment) return
    
    setImporting(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.includes('video')) continue
        
        await window.indieForge.pipeline.importClip(file.path, selectedMoment, {
          gameId,
          characterId: selectedCharacter || undefined,
          tags: []
        })
      }
      
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setSelectedMoment(null)
      setSelectedCharacter('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import clips')
    } finally {
      setImporting(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    
    if (!selectedMoment) {
      alert('Please select a moment before dropping files')
      return
    }
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.includes('video'))
    if (files.length === 0) return
    
    setImporting(true)
    try {
      for (const file of files) {
        await window.indieForge.pipeline.importClip(file.path, selectedMoment, {
          gameId,
          characterId: selectedCharacter || undefined,
          tags: []
        })
      }
      
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setSelectedMoment(null)
      setSelectedCharacter('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import clips')
    } finally {
      setImporting(false)
    }
  }

  const handleRemoveClip = async (clipId: string) => {
    if (!confirm('Remove this clip?')) return
    
    try {
      await window.indieForge.pipeline.removeClip(clipId)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove clip')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Clips</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {game.name} • {game.engine} • Runway video clips
          </p>
        </div>
      </div>

      <div className="panel-section">
        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '0.9rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem' }}>
              Filter by Character:
            </label>
            <select
              value={filterCharacter}
              onChange={(e) => setFilterCharacter(e.target.value)}
              style={{
                padding: '0.5rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '4px'
              }}
            >
              <option value="">All Characters</option>
              {characters.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.9rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem' }}>
              Filter by Moment:
            </label>
            <select
              value={filterMoment}
              onChange={(e) => setFilterMoment(e.target.value as ClipMoment | '')}
              style={{
                padding: '0.5rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '4px'
              }}
            >
              <option value="">All Moments</option>
              {CLIP_MOMENTS.map((moment) => (
                <option key={moment} value={moment}>
                  {getMomentDisplayName(moment)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div 
          style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            border: dragActive ? '2px dashed var(--forge-gold)' : '2px dashed var(--border)',
            borderRadius: '4px',
            background: dragActive ? 'rgba(255, 200, 0, 0.05)' : 'var(--bg-secondary)',
            textAlign: 'center'
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <h4 style={{ margin: '0 0 1rem 0' }}>Import Clips</h4>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <select
              value={selectedMoment || ''}
              onChange={(e) => setSelectedMoment(e.target.value as ClipMoment)}
              style={{
                padding: '0.5rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '4px'
              }}
            >
              <option value="">Select Moment...</option>
              {CLIP_MOMENTS.map((moment) => (
                <option key={moment} value={moment}>
                  {getMomentDisplayName(moment)}
                </option>
              ))}
            </select>

            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              style={{
                padding: '0.5rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '4px'
              }}
            >
              <option value="">No Character</option>
              {characters.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name}
                </option>
              ))}
            </select>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedMoment || importing}
          >
            {importing ? 'Importing...' : 'Choose Videos (mp4/webm)'}
          </button>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Recommended: 0.5s - 2s duration
          </p>
        </div>

        {clips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
            <p>No clips found</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                character={clip.characterId ? characters.find(c => c.id === clip.characterId) : undefined}
                onRemove={() => handleRemoveClip(clip.id)}
                onPlay={() => setPlayingClip(clip)}
              />
            ))}
          </div>
        )}
      </div>

      {playingClip && (
        <VideoPlayerModal
          clip={playingClip}
          character={playingClip.characterId ? characters.find(c => c.id === playingClip.characterId) : undefined}
          onClose={() => setPlayingClip(null)}
        />
      )}
    </div>
  )
}

function VideoPlayerModal({
  clip,
  character,
  onClose
}: {
  clip: Clip
  character?: Character
  onClose: () => void
}) {
  const videoPath = useLocalFilePreview(clip.file)

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg)',
          padding: '2rem',
          borderRadius: '8px',
          maxWidth: '800px',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>{getMomentDisplayName(clip.moment)}</h3>
          <button type="button" onClick={onClose} style={{ padding: '0.5rem 1rem' }}>
            Close
          </button>
        </div>

        {videoPath && (
          <video
            src={videoPath}
            controls
            autoPlay
            loop
            style={{ width: '100%', maxHeight: '600px', borderRadius: '4px', background: '#000' }}
            onError={(e) => {
              console.error('Video load error (detail modal):', {
                src: videoPath,
                error: e.currentTarget.error,
                networkState: e.currentTarget.networkState,
                readyState: e.currentTarget.readyState
              })
            }}
          />
        )}

        <div style={{ marginTop: '1rem' }}>
          <p style={{ margin: '0.5rem 0' }}>Duration: {formatDuration(clip.durationSec)}</p>
          {character && <p style={{ margin: '0.5rem 0' }}>Character: {character.name}</p>}
          {clip.tags.length > 0 && <p style={{ margin: '0.5rem 0' }}>Tags: {clip.tags.join(', ')}</p>}
        </div>
      </div>
    </div>
  )
}

function ClipCard({
  clip,
  character,
  onRemove,
  onPlay
}: {
  clip: Clip
  character?: Character
  onRemove: () => void
  onPlay: () => void
}) {
  const [isHovering, setIsHovering] = useState(false)
  const thumbnail = useLocalFilePreview(clip.thumbnail)
  const videoPath = useLocalFilePreview(clip.file)
  const issues = validateClipDuration(clip.durationSec)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      if (isHovering) {
        videoRef.current.play().catch(() => {})
      } else {
        videoRef.current.pause()
        videoRef.current.currentTime = 0
      }
    }
  }, [isHovering])

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '1rem',
      background: 'var(--bg-secondary)'
    }}>
      <div 
        style={{
          width: '100%',
          height: '150px',
          background: 'var(--bg)',
          borderRadius: '4px',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
          cursor: 'pointer'
        }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onClick={onPlay}
      >
        {isHovering && videoPath ? (
          <video
            ref={videoRef}
            src={videoPath}
            muted
            loop
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              console.error('Video load error (card hover):', {
                src: videoPath,
                error: e.currentTarget.error,
                networkState: e.currentTarget.networkState,
                readyState: e.currentTarget.readyState
              })
            }}
          />
        ) : thumbnail ? (
          <img
            src={thumbnail}
            alt={`${clip.moment} clip`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ color: 'var(--muted)' }}>📹</span>
        )}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          color: '#fff'
        }}>
          Click to play
        </div>
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <span style={{
          display: 'inline-block',
          padding: '0.25rem 0.5rem',
          background: 'var(--forge-gold)',
          color: 'var(--bg)',
          borderRadius: '4px',
          fontSize: '0.75rem',
          fontWeight: 'bold'
        }}>
          {getMomentDisplayName(clip.moment)}
        </span>
      </div>

      <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
        Duration: {formatDuration(clip.durationSec)}
        {issues.length > 0 && (
          <span style={{ marginLeft: '0.5rem', color: 'var(--error)', fontSize: '0.8rem' }}>⚠</span>
        )}
      </p>

      {character && (
        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
          {character.name}
        </p>
      )}

      {clip.tags.length > 0 && (
        <p style={{ margin: '0.5rem 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
          Tags: {clip.tags.join(', ')}
        </p>
      )}

      <button
        type="button"
        className="ghost"
        onClick={onRemove}
        style={{ marginTop: '0.5rem', width: '100%', color: 'var(--error)' }}
      >
        Remove
      </button>
    </div>
  )
}
