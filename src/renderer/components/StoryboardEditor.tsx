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
type DragMode = 'move' | 'scale' | 'rotate' | 'framingRect' | 'timelineMarker' | null

interface LoadedImage {
  element: HTMLImageElement
  url: string
  width: number
  height: number
}

export function StoryboardEditor() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  
  const [selectedStoryboardId, setSelectedStoryboardId] = useState<string | null>(null)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('layout')
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing' | 'paused'>('stopped')
  const [playbackTime, setPlaybackTime] = useState(0)
  
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number; layerX?: number; layerY?: number; layerScale?: number; layerRotation?: number } | null>(null)
  const [dragTimelineMarker, setDragTimelineMarker] = useState<{ type: 'camera' | 'effect'; index: number } | null>(null)
  
  const [loadedImages, setLoadedImages] = useState<Map<string, LoadedImage>>(new Map())
  const [showAddCharacter, setShowAddCharacter] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesText, setNotesText] = useState('')
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  const storyboards = activeProject?.assetPipeline?.storyboards?.filter(sb => sb.gameId === gameId) ?? []
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

  useEffect(() => {
    if (storyboards.length > 0 && !selectedStoryboardId) {
      setSelectedStoryboardId(storyboards[0].id)
    }
  }, [storyboards, selectedStoryboardId])

  useEffect(() => {
    if (selectedShot && editingNotes) {
      setNotesText(selectedShot.notes || '')
    }
  }, [selectedShot, editingNotes])

  // Load images for poses and clips
  useEffect(() => {
    if (!selectedShot) return

    const loadImage = async (path: string): Promise<LoadedImage | null> => {
      try {
        const { localUrl } = await window.indieForge.files.getLocalUrl(path)
        return new Promise((resolve) => {
          const img = new Image()
          img.onload = () => resolve({ element: img, url: localUrl, width: img.width, height: img.height })
          img.onerror = () => resolve(null)
          img.src = localUrl
        })
      } catch {
        return null
      }
    }

    const loadAllImages = async () => {
      const newImages = new Map<string, LoadedImage>()
      
      for (const layer of selectedShot.layers) {
        if (layer.poseId) {
          const pose = poses.find(p => p.id === layer.poseId)
          if (pose?.file) {
            const loaded = await loadImage(pose.file)
            if (loaded) newImages.set(layer.id, loaded)
          }
        } else if (layer.clipId) {
          const clip = clips.find(c => c.id === layer.clipId)
          if (clip?.thumbnail) {
            const loaded = await loadImage(clip.thumbnail)
            if (loaded) newImages.set(layer.id, loaded)
          }
        }
      }
      
      setLoadedImages(newImages)
    }

    loadAllImages()
  }, [selectedShot, poses, clips])

  // Render canvas
  useEffect(() => {
    if (!canvasRef.current || !selectedShot) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Apply camera transform in camera mode
    let cameraTransform = { offsetX: 0, offsetY: 0, scale: 1 }
    if (mode === 'camera' && selectedShot.cameraTrack.length > 0) {
      const kf = getCurrentCameraKeyframe()
      if (kf) {
        const target = typeof kf.target === 'string' 
          ? selectedShot.layers.find(l => l.id === kf.target)
          : null
        const targetX = target ? target.x : (typeof kf.target === 'object' ? kf.target.x : 0.5)
        const targetY = target ? target.y : (typeof kf.target === 'object' ? kf.target.y : 0.5)
        
        cameraTransform = {
          offsetX: (0.5 - targetX) * canvas.width * kf.zoom,
          offsetY: (0.5 - targetY) * canvas.height * kf.zoom,
          scale: kf.zoom
        }
      }
    }

    ctx.save()
    ctx.translate(cameraTransform.offsetX, cameraTransform.offsetY)
    ctx.scale(cameraTransform.scale, cameraTransform.scale)

    // Draw layers
    const sortedLayers = [...selectedShot.layers].sort((a, b) => a.zOrder - b.zOrder)
    
    for (const layer of sortedLayers) {
      ctx.save()
      
      const stageX = layer.x * canvas.width
      const stageY = layer.y * canvas.height
      
      ctx.translate(stageX, stageY)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.scale(layer.flipX ? -1 : 1, 1)
      ctx.globalAlpha = layer.opacity

      const img = loadedImages.get(layer.id)
      if (img) {
        const size = 200 * layer.scale
        ctx.drawImage(img.element, -size / 2, -size / 2, size, size)
      } else {
        const size = 100 * layer.scale
        ctx.fillStyle = layer.id === selectedLayerId ? '#FFC800' : '#4a4a4a'
        ctx.fillRect(-size / 2, -size / 2, size, size)
      }
      
      ctx.restore()

      // Selection handles
      if (layer.id === selectedLayerId && mode === 'layout') {
        const size = (img ? 200 : 100) * layer.scale
        const x = stageX
        const y = stageY
        
        ctx.strokeStyle = '#FFC800'
        ctx.lineWidth = 2
        ctx.strokeRect(x - size / 2, y - size / 2, size, size)
        
        // Corner handles for scaling
        const handleSize = 10
        ctx.fillStyle = '#FFC800'
        ctx.fillRect(x - size / 2 - handleSize / 2, y - size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(x + size / 2 - handleSize / 2, y - size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(x - size / 2 - handleSize / 2, y + size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(x + size / 2 - handleSize / 2, y + size / 2 - handleSize / 2, handleSize, handleSize)
        
        // Rotation handle
        ctx.beginPath()
        ctx.arc(x, y - size / 2 - 20, 8, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.restore()

    // Draw framing rect in camera mode
    if (mode === 'camera' && selectedShot.cameraTrack.length > 0) {
      const kf = getCurrentCameraKeyframe()
      if (kf?.framingRect) {
        ctx.strokeStyle = '#00AAFF'
        ctx.lineWidth = 3
        ctx.setLineDash([5, 5])
        ctx.strokeRect(
          kf.framingRect.x * canvas.width,
          kf.framingRect.y * canvas.height,
          kf.framingRect.width * canvas.width,
          kf.framingRect.height * canvas.height
        )
        ctx.setLineDash([])
      }
    }
  }, [selectedShot, selectedLayerId, mode, playbackTime, loadedImages, dragStart])

  const getCurrentCameraKeyframe = (): CameraKeyframe | null => {
    if (!selectedShot || selectedShot.cameraTrack.length === 0) return null
    const sorted = [...selectedShot.cameraTrack].sort((a, b) => a.t - b.t)
    return sorted.filter(k => k.t <= playbackTime).pop() || sorted[0]
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !selectedShot) return
    e.currentTarget.setPointerCapture(e.pointerId)

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    if (mode === 'layout') {
      // Check if clicking a handle or layer
      const sortedLayers = [...selectedShot.layers].sort((a, b) => b.zOrder - a.zOrder)
      
      for (const layer of sortedLayers) {
        const size = ((loadedImages.has(layer.id) ? 200 : 100) * layer.scale) / canvas.width
        const dx = Math.abs(x - layer.x)
        const dy = Math.abs(y - layer.y)
        
        if (dx <= size / 2 && dy <= size / 2) {
          setSelectedLayerId(layer.id)
          setDragMode('move')
          setDragStart({ 
            x, 
            y, 
            layerX: layer.x, 
            layerY: layer.y, 
            layerScale: layer.scale, 
            layerRotation: layer.rotation 
          })
          return
        }
      }
    } else if (mode === 'camera') {
      // Start drawing framing rect
      setDragMode('framingRect')
      setDragStart({ x, y })
    }
  }

  const handlePointerMove = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !selectedShot || !dragStart) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    if (dragMode === 'move' && selectedLayer) {
      const dx = x - dragStart.x
      const dy = y - dragStart.y
      
      const updates = {
        x: Math.max(0, Math.min(1, dragStart.layerX! + dx)),
        y: Math.max(0, Math.min(1, dragStart.layerY! + dy))
      }
      
      await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayerId!, updates)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    } else if (dragMode === 'framingRect') {
      // Update framing rect preview
      const width = Math.abs(x - dragStart.x)
      const height = Math.abs(y - dragStart.y)
      const rectX = Math.min(x, dragStart.x)
      const rectY = Math.min(y, dragStart.y)
      
      // Would update preview, for now just visual feedback
    }
  }

  const handlePointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragMode === 'framingRect' && dragStart) {
      const canvas = canvasRef.current!
      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      
      const width = Math.abs(x - dragStart.x)
      const height = Math.abs(y - dragStart.y)
      const rectX = Math.min(x, dragStart.x)
      const rectY = Math.min(y, dragStart.y)
      
      // Add camera keyframe with framing rect
      const keyframe: CameraKeyframe = {
        t: playbackTime,
        target: { x: rectX + width / 2, y: rectY + height / 2 },
        zoom: 1.0,
        framingRect: { x: rectX, y: rectY, width, height }
      }
      
      await window.indieForge.pipeline.addCameraKeyframe(projectId!, selectedShotId!, keyframe)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    }

    setDragMode(null)
    setDragStart(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleAddCharacter = async (characterId: string) => {
    if (!selectedShot) return
    
    const character = characters.find(c => c.id === characterId)
    const approvedPoses = poses.filter(p => p.characterId === characterId && p.status === 'approved')
    
    if (approvedPoses.length === 0) {
      alert(`No approved poses for ${character?.name || 'character'}`)
      return
    }

    const layer: Omit<StoryboardLayer, 'id'> = {
      zOrder: Math.max(...selectedShot.layers.map(l => l.zOrder), 0) + 1,
      characterId,
      poseId: approvedPoses[0].id,
      x: 0.5,
      y: 0.5,
      scale: 1.0,
      rotation: 0,
      flipX: false,
      opacity: 1.0
    }
    
    await window.indieForge.pipeline.addLayer(projectId!, selectedShotId!, layer)
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
    setShowAddCharacter(false)
  }

  const handleChangePose = async (poseId: string) => {
    if (!selectedLayer) return
    await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayerId!, { poseId })
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
  }

  const handleFlipLayer = async () => {
    if (!selectedLayer) return
    await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayerId!, { flipX: !selectedLayer.flipX })
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
  }

  const handleDeleteLayer = async () => {
    if (!selectedLayerId || !confirm('Delete this layer?')) return
    await window.indieForge.pipeline.deleteLayer(projectId!, selectedShotId!, selectedLayerId)
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
    setSelectedLayerId(null)
  }

  const handleSaveNotes = async () => {
    if (!selectedShot) return
    await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, { notes: notesText })
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
    setEditingNotes(false)
  }

  const handlePlayAnimatic = () => {
    if (playbackState === 'stopped') {
      setPlaybackState('playing')
      setPlaybackTime(0)
      animatePlayback()
    } else if (playbackState === 'playing') {
      setPlaybackState('paused')
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    } else {
      setPlaybackState('playing')
      animatePlayback()
    }
  }

  const animatePlayback = () => {
    const animate = () => {
      setPlaybackTime(t => {
        if (!selectedShot) return 0
        const newTime = t + 0.016
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
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
  }

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  if (!activeProject || !gameId) {
    return <p style={{ color: 'var(--muted)' }}>Loading...</p>
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: '1rem' }}>
      {/* Left sidebar */}
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

      {/* Center */}
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
                  {playbackState === 'playing' ? '⏸ Pause' : '▶ Play'}
                </button>
                <button type="button" onClick={handleStopPlayback}>
                  ⏹ Stop
                </button>
              </div>
            </div>

            <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: '8px', padding: '1rem' }}>
              <canvas
                ref={canvasRef}
                width={800}
                height={450}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{
                  width: '100%',
                  height: 'auto',
                  border: '2px solid var(--border)',
                  borderRadius: '4px',
                  background: '#1a1a1a',
                  cursor: dragMode ? 'grabbing' : 'grab',
                  touchAction: 'none'
                }}
              />
            </div>

            {/* Timeline */}
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Timeline</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {playbackTime.toFixed(2)}s / {selectedShot.durationSec}s
                </span>
              </div>
              
              <div 
                style={{ position: 'relative', height: '60px', background: 'var(--bg)', borderRadius: '4px', cursor: 'pointer' }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const clickX = (e.clientX - rect.left) / rect.width
                  setPlaybackTime(clickX * selectedShot.durationSec)
                }}
              >
                {/* Playhead */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${(playbackTime / selectedShot.durationSec) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: '#FFC800',
                    zIndex: 10,
                    pointerEvents: 'none'
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
                      width: '12px',
                      height: '12px',
                      background: '#00AAFF',
                      borderRadius: '50%',
                      transform: 'translateX(-50%)',
                      cursor: 'pointer',
                      border: '2px solid #fff'
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
                      width: '12px',
                      height: '12px',
                      background: '#FF6B6B',
                      borderRadius: '50%',
                      transform: 'translateX(-50%)',
                      cursor: 'pointer',
                      border: '2px solid #fff'
                    }}
                    title={`Effect @ ${ef.t}s`}
                  />
                ))}
              </div>
            </div>

            {/* Notes */}
            {editingNotes ? (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Engineer Notes</h4>
                <textarea
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '0.5rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                  placeholder="Notes for the engineer..."
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" onClick={handleSaveNotes}>Save Notes</button>
                  <button type="button" onClick={() => setEditingNotes(false)}>Cancel</button>
                </div>
              </div>
            ) : selectedShot.notes ? (
              <div 
                style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', cursor: 'pointer' }}
                onClick={() => setEditingNotes(true)}
              >
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Engineer Notes (click to edit)</div>
                <div style={{ fontSize: '0.9rem' }}>{selectedShot.notes}</div>
              </div>
            ) : (
              <button 
                type="button" 
                onClick={() => setEditingNotes(true)}
                style={{ marginTop: '1rem', width: '100%' }}
              >
                + Add Engineer Notes
              </button>
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            Select a shot to edit
          </div>
        )}
      </div>

      {/* Right sidebar */}
      {selectedShot && (
        <div style={{ width: '280px', borderLeft: '1px solid var(--border)', paddingLeft: '1rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1rem', margin: 0 }}>Layers</h3>
            <button 
              type="button" 
              onClick={() => setShowAddCharacter(true)} 
              style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}
            >
              + Character
            </button>
          </div>
          
          {showAddCharacter && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid var(--forge-gold)' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Add Character</div>
              {characters.map(char => (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => handleAddCharacter(char.id)}
                  style={{ width: '100%', marginBottom: '0.25rem', fontSize: '0.85rem', textAlign: 'left' }}
                >
                  {char.name}
                </button>
              ))}
              <button type="button" onClick={() => setShowAddCharacter(false)} style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Cancel
              </button>
            </div>
          )}
          
          {selectedShot.layers
            .sort((a, b) => b.zOrder - a.zOrder)
            .map(layer => {
              const character = layer.characterId ? characters.find(c => c.id === layer.characterId) : null
              const pose = layer.poseId ? poses.find(p => p.id === layer.poseId) : null
              const clip = layer.clipId ? clips.find(c => c.id === layer.clipId) : null
              
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
                  {character && <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{character.name}</div>}
                  {pose && <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{pose.slot}</div>}
                  {selectedLayerId === layer.id && character && (
                    <select
                      value={layer.poseId || ''}
                      onChange={(e) => handleChangePose(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        marginTop: '0.5rem',
                        padding: '0.25rem',
                        fontSize: '0.8rem',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        color: 'var(--text)'
                      }}
                    >
                      {poses.filter(p => p.characterId === character.id && p.status === 'approved').map(p => (
                        <option key={p.id} value={p.id}>{p.slot}</option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
          
          {selectedLayerId && selectedLayer && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
              <h4 style={{ fontSize: '0.9rem', margin: '0 0 0.75rem 0' }}>Layer Controls</h4>
              <button type="button" onClick={handleFlipLayer} style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                {selectedLayer.flipX ? 'Unflip' : 'Flip'} Horizontal
              </button>
              <button 
                type="button" 
                onClick={handleDeleteLayer} 
                style={{ width: '100%', fontSize: '0.85rem', background: 'var(--error)', color: '#fff' }}
              >
                Delete Layer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
