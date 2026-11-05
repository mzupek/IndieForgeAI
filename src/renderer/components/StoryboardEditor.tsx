import { useEffect, useState, useRef, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'
import type {
  Storyboard,
  StoryboardShot,
  StoryboardLayer,
  Character,
  Pose,
  Clip,
  CameraKeyframe,
  EffectMarker,
  ScenePreset
} from '@shared/types/assetPipeline'

type EditorMode = 'layout' | 'camera'
type PlaybackState = 'stopped' | 'playing' | 'paused'

interface Transform {
  x: number
  y: number
  scale: number
  rotation: number
}

interface CameraState {
  target: { x: number; y: number }
  zoom: number
  framingRect?: { x: number; y: number; width: number; height: number }
}

export function StoryboardEditor() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  
  const [storyboards, setStoryboards] = useState<Storyboard[]>([])
  const [selectedStoryboardId, setSelectedStoryboardId] = useState<string | null>(null)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('layout')
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped')
  const [playbackTime, setPlaybackTime] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (activeProject?.assetPipeline?.storyboards) {
      const filtered = activeProject.assetPipeline.storyboards.filter(sb => sb.gameId === gameId)
      setStoryboards(filtered)
      if (filtered.length > 0 && !selectedStoryboardId) {
        setSelectedStoryboardId(filtered[0].id)
      }
    }
  }, [activeProject, gameId, selectedStoryboardId])

  const selectedStoryboard = storyboards.find(sb => sb.id === selectedStoryboardId)
  const shots = activeProject?.assetPipeline?.storyboardShots?.filter(
    shot => selectedStoryboard?.shotIds.includes(shot.id)
  ) ?? []
  const selectedShot = shots.find(s => s.id === selectedShotId)
  const selectedLayer = selectedShot?.layers.find(l => l.id === selectedLayerId)
  
  const characters = activeProject?.assetPipeline?.characters?.filter(c => c.gameId === gameId) ?? []
  const poses = activeProject?.assetPipeline?.poses ?? []
  const clips = activeProject?.assetPipeline?.clips ?? []
  const presets = activeProject?.assetPipeline?.scenePresets ?? []

  // Render stage canvas
  useEffect(() => {
    if (!canvasRef.current || !selectedShot) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw layers (sorted by z-order)
    const sortedLayers = [...selectedShot.layers].sort((a, b) => a.zOrder - b.zOrder)
    
    sortedLayers.forEach(layer => {
      ctx.save()
      
      // Apply transform
      const stageX = layer.x * canvas.width
      const stageY = layer.y * canvas.height
      ctx.translate(stageX, stageY)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.scale(layer.flipX ? -1 : 1, 1)
      ctx.globalAlpha = layer.opacity

      // Draw placeholder (actual images loaded separately)
      const size = 100 * layer.scale
      ctx.fillStyle = layer.id === selectedLayerId ? '#FFC800' : '#4a4a4a'
      ctx.fillRect(-size / 2, -size / 2, size, size)
      
      // Draw layer info
      ctx.fillStyle = '#fff'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`z${layer.zOrder}`, 0, 0)
      
      ctx.restore()

      // Draw selection handles
      if (layer.id === selectedLayerId && mode === 'layout') {
        ctx.strokeStyle = '#FFC800'
        ctx.lineWidth = 2
        ctx.strokeRect(stageX - size / 2, stageY - size / 2, size, size)
        
        // Draw corner handles
        const handleSize = 8
        ctx.fillStyle = '#FFC800'
        ctx.fillRect(stageX - size / 2 - handleSize / 2, stageY - size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(stageX + size / 2 - handleSize / 2, stageY - size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(stageX - size / 2 - handleSize / 2, stageY + size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(stageX + size / 2 - handleSize / 2, stageY + size / 2 - handleSize / 2, handleSize, handleSize)
      }
    })

    // Draw camera framing rect in camera mode
    if (mode === 'camera' && selectedShot.cameraTrack.length > 0) {
      const currentKeyframe = getCurrentCameraKeyframe()
      if (currentKeyframe?.framingRect) {
        ctx.strokeStyle = '#00AAFF'
        ctx.lineWidth = 3
        ctx.strokeRect(
          currentKeyframe.framingRect.x * canvas.width,
          currentKeyframe.framingRect.y * canvas.height,
          currentKeyframe.framingRect.width * canvas.width,
          currentKeyframe.framingRect.height * canvas.height
        )
      }
    }
  }, [selectedShot, selectedLayerId, mode, playbackTime])

  const getCurrentCameraKeyframe = (): CameraKeyframe | null => {
    if (!selectedShot || selectedShot.cameraTrack.length === 0) return null
    
    // Find keyframes around current time
    const sorted = [...selectedShot.cameraTrack].sort((a, b) => a.t - b.t)
    const before = sorted.filter(k => k.t <= playbackTime).pop()
    const after = sorted.find(k => k.t > playbackTime)
    
    if (!before) return sorted[0]
    if (!after) return before
    
    // Interpolate (simplified - just return before for now)
    return before
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !selectedShot) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / canvas.width
    const y = (e.clientY - rect.top) / canvas.height

    if (mode === 'layout') {
      // Find clicked layer
      const sortedLayers = [...selectedShot.layers].sort((a, b) => b.zOrder - a.zOrder)
      for (const layer of sortedLayers) {
        const size = 100 * layer.scale / canvas.width
        if (
          x >= layer.x - size / 2 &&
          x <= layer.x + size / 2 &&
          y >= layer.y - size / 2 &&
          y <= layer.y + size / 2
        ) {
          setSelectedLayerId(layer.id)
          return
        }
      }
      setSelectedLayerId(null)
    } else if (mode === 'camera') {
      // Set camera target
      // Would add camera keyframe at current time
      console.log('Set camera target:', x, y)
    }
  }

  const handleAddLayer = () => {
    if (!selectedShot) return
    
    const newLayer: StoryboardLayer = {
      id: `layer-${Date.now()}`,
      zOrder: Math.max(...selectedShot.layers.map(l => l.zOrder), 0) + 1,
      x: 0.5,
      y: 0.5,
      scale: 1.0,
      rotation: 0,
      flipX: false,
      opacity: 1.0
    }
    
    // In real implementation, would call IPC to update
    console.log('Add layer:', newLayer)
  }

  const handlePlayAnimatic = () => {
    if (playbackState === 'stopped') {
      setPlaybackState('playing')
      setPlaybackTime(0)
      animatePlayback()
    } else if (playbackState === 'playing') {
      setPlaybackState('paused')
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    } else {
      setPlaybackState('playing')
      animatePlayback()
    }
  }

  const animatePlayback = () => {
    const animate = () => {
      setPlaybackTime(t => {
        if (!selectedShot) return 0
        const newTime = t + 0.016 // ~60fps
        if (newTime >= selectedShot.durationSec) {
          setPlaybackState('stopped')
          return 0
        }
        return newTime
      })
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    animationFrameRef.current = requestAnimationFrame(animate)
  }

  const handleStopPlayback = () => {
    setPlaybackState('stopped')
    setPlaybackTime(0)
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  if (!activeProject || !gameId) {
    return <p style={{ color: 'var(--muted)' }}>Loading...</p>
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: '1rem' }}>
      {/* Left sidebar - storyboard & shot list */}
      <div style={{ width: '250px', borderRight: '1px solid var(--border)', paddingRight: '1rem', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Storyboards</h3>
        {storyboards.map(sb => (
          <div
            key={sb.id}
            onClick={() => {
              setSelectedStoryboardId(sb.id)
              setSelectedShotId(null)
            }}
            style={{
              padding: '0.5rem',
              marginBottom: '0.5rem',
              background: selectedStoryboardId === sb.id ? 'var(--forge-gold)' : 'var(--bg-secondary)',
              color: selectedStoryboardId === sb.id ? 'var(--bg)' : 'var(--text)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            {sb.name}
          </div>
        ))}
        
        {selectedStoryboard && (
          <>
            <h3 style={{ fontSize: '1rem', margin: '1.5rem 0 0.75rem 0' }}>Shots</h3>
            {shots.map((shot, idx) => (
              <div
                key={shot.id}
                onClick={() => setSelectedShotId(shot.id)}
                style={{
                  padding: '0.5rem',
                  marginBottom: '0.5rem',
                  background: selectedShotId === shot.id ? 'var(--forge-gold)' : 'var(--bg-secondary)',
                  color: selectedShotId === shot.id ? 'var(--bg)' : 'var(--text)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                <div style={{ fontWeight: 'bold' }}>{idx + 1}. {shot.name}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{shot.durationSec}s</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Center - stage canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedShot ? (
          <>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{selectedShot.name}</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setMode('layout')}
                  style={{
                    background: mode === 'layout' ? 'var(--forge-gold)' : 'var(--bg-secondary)',
                    color: mode === 'layout' ? 'var(--bg)' : 'var(--text)'
                  }}
                >
                  Layout
                </button>
                <button
                  type="button"
                  onClick={() => setMode('camera')}
                  style={{
                    background: mode === 'camera' ? 'var(--forge-gold)' : 'var(--bg-secondary)',
                    color: mode === 'camera' ? 'var(--bg)' : 'var(--text)'
                  }}
                >
                  Camera
                </button>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={handlePlayAnimatic}>
                  {playbackState === 'playing' ? '⏸' : '▶'} {playbackState === 'stopped' ? 'Play' : 'Pause'}
                </button>
                <button type="button" onClick={handleStopPlayback}>
                  ⏹ Stop
                </button>
              </div>
            </div>

            <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: '8px', padding: '1rem', position: 'relative' }}>
              <canvas
                ref={canvasRef}
                width={800}
                height={450}
                onClick={handleCanvasClick}
                style={{
                  width: '100%',
                  height: 'auto',
                  border: '2px solid var(--border)',
                  borderRadius: '4px',
                  background: '#1a1a1a'
                }}
              />
              
              {mode === 'layout' && (
                <div style={{
                  position: 'absolute',
                  top: '1.5rem',
                  right: '1.5rem',
                  background: 'rgba(0, 0, 0, 0.8)',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.85rem'
                }}>
                  <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>Controls</div>
                  <div>Click layer to select</div>
                  <div>Drag to move</div>
                  <div>Handles to resize/rotate</div>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Timeline</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {playbackTime.toFixed(2)}s / {selectedShot.durationSec}s
                </span>
              </div>
              
              <div style={{ position: 'relative', height: '60px', background: 'var(--bg)', borderRadius: '4px' }}>
                {/* Playhead */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${(playbackTime / selectedShot.durationSec) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: '#FFC800',
                    zIndex: 10
                  }}
                />
                
                {/* Camera keyframes */}
                {selectedShot.cameraTrack.map((kf, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `${(kf.t / selectedShot.durationSec) * 100}%`,
                      top: '10px',
                      width: '8px',
                      height: '8px',
                      background: '#00AAFF',
                      borderRadius: '50%',
                      transform: 'translateX(-50%)',
                      cursor: 'pointer'
                    }}
                    title={`Camera @ ${kf.t}s`}
                  />
                ))}
                
                {/* Effect markers */}
                {selectedShot.effectsTrack.map((ef, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `${(ef.t / selectedShot.durationSec) * 100}%`,
                      bottom: '10px',
                      width: '8px',
                      height: '8px',
                      background: '#FF6B6B',
                      borderRadius: '50%',
                      transform: 'translateX(-50%)',
                      cursor: 'pointer'
                    }}
                    title={`Effect @ ${ef.t}s`}
                  />
                ))}
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <div style={{ width: '8px', height: '8px', background: '#00AAFF', borderRadius: '50%' }} />
                  <span>Camera keyframe</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <div style={{ width: '8px', height: '8px', background: '#FF6B6B', borderRadius: '50%' }} />
                  <span>Effect marker</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            Select a shot to edit
          </div>
        )}
      </div>

      {/* Right sidebar - layer panel */}
      {selectedShot && (
        <div style={{ width: '280px', borderLeft: '1px solid var(--border)', paddingLeft: '1rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1rem', margin: 0 }}>Layers</h3>
            <button type="button" onClick={handleAddLayer} style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}>
              + Add
            </button>
          </div>
          
          {selectedShot.layers
            .sort((a, b) => b.zOrder - a.zOrder)
            .map(layer => {
              const character = layer.characterId ? characters.find(c => c.id === layer.characterId) : null
              const pose = layer.poseId ? poses.find(p => p.id === layer.poseId) : null
              const clip = layer.clipId ? clips.find(c => c.id === layer.clipId) : null
              
              let label = 'Empty'
              if (character && pose) label = `${character.name} (${pose.slot})`
              else if (clip) label = `Clip: ${clip.moment}`
              else if (layer.imagePath) label = `Image: ${layer.imagePath.split('/').pop()}`
              
              return (
                <div
                  key={layer.id}
                  onClick={() => setSelectedLayerId(layer.id)}
                  style={{
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    background: selectedLayerId === layer.id ? 'var(--forge-gold)' : 'var(--bg-secondary)',
                    color: selectedLayerId === layer.id ? 'var(--bg)' : 'var(--text)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 'bold' }}>z{layer.zOrder}</span>
                    <span style={{ opacity: 0.7 }}>{(layer.opacity * 100).toFixed(0)}%</span>
                  </div>
                  <div>{label}</div>
                  {selectedLayerId === layer.id && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.8 }}>
                      <div>Scale: {layer.scale.toFixed(2)}</div>
                      <div>Rotation: {layer.rotation.toFixed(0)}°</div>
                    </div>
                  )}
                </div>
              )
            })}
          
          {selectedShot.layers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
              No layers yet
            </div>
          )}
          
          {selectedLayerId && selectedLayer && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
              <h4 style={{ fontSize: '0.9rem', margin: '0 0 0.75rem 0' }}>Layer Properties</h4>
              <div style={{ fontSize: '0.85rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedLayer.flipX}
                    onChange={() => console.log('Toggle flipX')}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Flip X
                </label>
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ marginBottom: '0.25rem' }}>Opacity</div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={selectedLayer.opacity}
                    onChange={() => console.log('Change opacity')}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>
          )}
          
          {mode === 'layout' && selectedLayer && (
            <div style={{ marginTop: '1rem', fontSize: '0.85rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Quick Actions</div>
              <button type="button" style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                Change Pose
              </button>
              <button type="button" style={{ width: '100%', fontSize: '0.85rem' }}>
                Delete Layer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
