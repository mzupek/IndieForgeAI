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
  ScenePreset,
  ScenePresetType
} from '@shared/types/assetPipeline'

type EditorMode = 'layout' | 'camera'
type DragMode = 'move' | 'scale' | 'rotate' | 'framingRect' | 'cameraMarker' | 'effectMarker' | null

interface LoadedImage {
  element: HTMLImageElement
  url: string
  width: number
  height: number
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
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
  const [dragStart, setDragStart] = useState<any>(null)
  const [draggedMarker, setDraggedMarker] = useState<{ type: 'camera' | 'effect'; index: number } | null>(null)
  
  const [loadedImages, setLoadedImages] = useState<Map<string, LoadedImage>>(new Map())
  const [showAddCharacter, setShowAddCharacter] = useState(false)
  const [showAddEffect, setShowAddEffect] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesText, setNotesText] = useState('')
  const [creatingStoryboard, setCreatingStoryboard] = useState(false)
  const [newStoryboardName, setNewStoryboardName] = useState('')
  const [creatingShot, setCreatingShot] = useState(false)
  const [newShotName, setNewShotName] = useState('')
  
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
  const scenes = activeProject?.assetPipeline?.scenes ?? []
  
  // Phase C: Find scene attached to this storyboard
  const attachedScene = selectedStoryboard?.sceneId 
    ? scenes.find(s => s.id === selectedStoryboard.sceneId)
    : null

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

  // Load images
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

  // Get interpolated camera state
  const getInterpolatedCamera = useCallback((time: number): { target: {x: number, y: number}, zoom: number, framingRect?: any } | null => {
    if (!selectedShot || selectedShot.cameraTrack.length === 0) return null
    
    const sorted = [...selectedShot.cameraTrack].sort((a, b) => a.t - b.t)
    
    if (time <= sorted[0].t) return sorted[0] as any
    if (time >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1] as any
    
    let before: CameraKeyframe | null = null
    let after: CameraKeyframe | null = null
    
    for (let i = 0; i < sorted.length - 1; i++) {
      if (time >= sorted[i].t && time <= sorted[i + 1].t) {
        before = sorted[i]
        after = sorted[i + 1]
        break
      }
    }
    
    if (!before || !after) return sorted[0] as any
    
    const t = (time - before.t) / (after.t - before.t)
    const easedT = easeInOutCubic(t)
    
    const beforeTarget = typeof before.target === 'string'
      ? selectedShot.layers.find(l => l.id === before!.target) || { x: 0.5, y: 0.5 }
      : before.target
    const afterTarget = typeof after.target === 'string'
      ? selectedShot.layers.find(l => l.id === after!.target) || { x: 0.5, y: 0.5 }
      : after.target
    
    return {
      target: {
        x: lerp(beforeTarget.x, afterTarget.x, easedT),
        y: lerp(beforeTarget.y, afterTarget.y, easedT)
      },
      zoom: lerp(before.zoom, after.zoom, easedT),
      framingRect: before.framingRect || after.framingRect
    }
  }, [selectedShot])

  // Render canvas
  useEffect(() => {
    if (!canvasRef.current || !selectedShot) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Apply camera transform
    ctx.save()
    if (mode === 'camera' || playbackState === 'playing') {
      const cam = getInterpolatedCamera(playbackTime)
      if (cam) {
        const targetX = cam.target.x * canvas.width
        const targetY = cam.target.y * canvas.height
        
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.scale(cam.zoom, cam.zoom)
        ctx.translate(-targetX, -targetY)
      }
    }

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

      // Selection handles (in screen space, after camera transform)
      if (layer.id === selectedLayerId && mode === 'layout' && playbackState === 'stopped') {
        const size = (img ? 200 : 100) * layer.scale
        const x = stageX
        const y = stageY
        
        ctx.strokeStyle = '#FFC800'
        ctx.lineWidth = 2 / (getInterpolatedCamera(playbackTime)?.zoom || 1)
        ctx.strokeRect(x - size / 2, y - size / 2, size, size)
        
        const handleSize = 10 / (getInterpolatedCamera(playbackTime)?.zoom || 1)
        ctx.fillStyle = '#FFC800'
        
        // Corner handles (scale)
        ctx.fillRect(x - size / 2 - handleSize / 2, y - size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(x + size / 2 - handleSize / 2, y - size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(x - size / 2 - handleSize / 2, y + size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(x + size / 2 - handleSize / 2, y + size / 2 - handleSize / 2, handleSize, handleSize)
        
        // Rotation handle
        ctx.beginPath()
        ctx.arc(x, y - size / 2 - 20, 6 / (getInterpolatedCamera(playbackTime)?.zoom || 1), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.restore()

    // Draw framing rect overlay in camera mode
    if (mode === 'camera' && playbackState === 'stopped') {
      const cam = getInterpolatedCamera(playbackTime)
      if (cam?.framingRect) {
        ctx.strokeStyle = '#00AAFF'
        ctx.lineWidth = 3
        ctx.setLineDash([5, 5])
        ctx.strokeRect(
          cam.framingRect.x * canvas.width,
          cam.framingRect.y * canvas.height,
          cam.framingRect.width * canvas.width,
          cam.framingRect.height * canvas.height
        )
        ctx.setLineDash([])
      }
    }
  }, [selectedShot, selectedLayerId, mode, playbackTime, loadedImages, dragStart, getInterpolatedCamera])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !selectedShot) return
    e.currentTarget.setPointerCapture(e.pointerId)

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    if (mode === 'layout' && selectedLayer) {
      const img = loadedImages.get(selectedLayerId!)
      const size = ((img ? 200 : 100) * selectedLayer.scale) / canvas.width
      const handleSize = 20 / canvas.width
      
      const lx = selectedLayer.x
      const ly = selectedLayer.y
      
      // Check rotation handle
      const rotHandleY = ly - size / 2 - 20 / canvas.width
      if (Math.hypot(x - lx, y - rotHandleY) < handleSize / 2) {
        setDragMode('rotate')
        setDragStart({ x, y, layerX: lx, layerY: ly, layerRotation: selectedLayer.rotation })
        return
      }
      
      // Check corner handles (scale)
      const corners = [
        { x: lx - size / 2, y: ly - size / 2 },
        { x: lx + size / 2, y: ly - size / 2 },
        { x: lx - size / 2, y: ly + size / 2 },
        { x: lx + size / 2, y: ly + size / 2 }
      ]
      
      for (const corner of corners) {
        if (Math.abs(x - corner.x) < handleSize / 2 && Math.abs(y - corner.y) < handleSize / 2) {
          setDragMode('scale')
          setDragStart({ x, y, layerX: lx, layerY: ly, layerScale: selectedLayer.scale })
          return
        }
      }
      
      // Check body (move)
      if (Math.abs(x - lx) <= size / 2 && Math.abs(y - ly) <= size / 2) {
        setDragMode('move')
        setDragStart({ x, y, layerX: lx, layerY: ly })
        return
      }
    }
    
    if (mode === 'layout') {
      // Select layer
      const sortedLayers = [...selectedShot.layers].sort((a, b) => b.zOrder - a.zOrder)
      for (const layer of sortedLayers) {
        const img = loadedImages.get(layer.id)
        const size = ((img ? 200 : 100) * layer.scale) / canvas.width
        if (Math.abs(x - layer.x) <= size / 2 && Math.abs(y - layer.y) <= size / 2) {
          setSelectedLayerId(layer.id)
          return
        }
      }
      setSelectedLayerId(null)
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
        x: Math.max(0, Math.min(1, dragStart.layerX + dx)),
        y: Math.max(0, Math.min(1, dragStart.layerY + dy))
      }
      
      await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayerId!, updates)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setDragStart({ ...dragStart, layerX: updates.x, layerY: updates.y })
    } else if (dragMode === 'scale' && selectedLayer) {
      const dist = Math.hypot(x - dragStart.layerX, y - dragStart.layerY)
      const startDist = Math.hypot(dragStart.x - dragStart.layerX, dragStart.y - dragStart.layerY)
      const scaleFactor = startDist > 0 ? dist / startDist : 1
      
      const newScale = Math.max(0.1, Math.min(5, dragStart.layerScale * scaleFactor))
      
      await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayerId!, { scale: newScale })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    } else if (dragMode === 'rotate' && selectedLayer) {
      const angle = Math.atan2(y - dragStart.layerY, x - dragStart.layerX) * (180 / Math.PI)
      const startAngle = Math.atan2(dragStart.y - dragStart.layerY, dragStart.x - dragStart.layerX) * (180 / Math.PI)
      const rotation = (dragStart.layerRotation + (angle - startAngle)) % 360
      
      await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayerId!, { rotation })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
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
      
      if (width > 0.05 && height > 0.05) {
        const keyframe: CameraKeyframe = {
          t: playbackTime,
          target: { x: rectX + width / 2, y: rectY + height / 2 },
          zoom: 1.0 / Math.max(width, height),
          framingRect: { x: rectX, y: rectY, width, height }
        }
        
        await window.indieForge.pipeline.addCameraKeyframe(projectId!, selectedShotId!, keyframe)
        const updated = await window.indieForge.projects.open(projectId!)
        setActiveProject(updated)
      }
    }

    setDragMode(null)
    setDragStart(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedShot) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const clickTime = x * selectedShot.durationSec
    
    // Check camera markers
    for (let i = 0; i < selectedShot.cameraTrack.length; i++) {
      const kf = selectedShot.cameraTrack[i]
      const markerX = kf.t / selectedShot.durationSec
      if (Math.abs(x - markerX) < 0.02) {
        setDraggedMarker({ type: 'camera', index: i })
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }
    }
    
    // Check effect markers
    for (let i = 0; i < selectedShot.effectsTrack.length; i++) {
      const ef = selectedShot.effectsTrack[i]
      const markerX = ef.t / selectedShot.durationSec
      if (Math.abs(x - markerX) < 0.02) {
        setDraggedMarker({ type: 'effect', index: i })
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }
    }
    
    // Seek playhead
    setPlaybackTime(clickTime)
  }

  const handleTimelinePointerMove = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggedMarker || !selectedShot) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newTime = x * selectedShot.durationSec
    
    if (draggedMarker.type === 'camera') {
      const updated = [...selectedShot.cameraTrack]
      updated[draggedMarker.index] = { ...updated[draggedMarker.index], t: newTime }
      
      await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, { cameraTrack: updated })
      const proj = await window.indieForge.projects.open(projectId!)
      setActiveProject(proj)
    } else {
      const updated = [...selectedShot.effectsTrack]
      updated[draggedMarker.index] = { ...updated[draggedMarker.index], t: newTime }
      
      await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, { effectsTrack: updated })
      const proj = await window.indieForge.projects.open(projectId!)
      setActiveProject(proj)
    }
  }

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDraggedMarker(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleAddCameraKeyframe = async () => {
    if (!selectedShot) return
    
    const keyframe: CameraKeyframe = {
      t: playbackTime,
      target: { x: 0.5, y: 0.5 },
      zoom: 1.0
    }
    
    await window.indieForge.pipeline.addCameraKeyframe(projectId!, selectedShotId!, keyframe)
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
  }

  const handleAddEffect = async (presetId?: string, inlineType?: ScenePresetType) => {
    if (!selectedShot) return
    
    const effect: EffectMarker = {
      t: playbackTime,
      ...(presetId ? { presetId } : { inlineType, inlineParams: {} })
    }
    
    await window.indieForge.pipeline.addEffectMarker(projectId!, selectedShotId!, effect)
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
    setShowAddEffect(false)
  }

  const handleDeleteMarker = async (type: 'camera' | 'effect', index: number) => {
    if (!selectedShot || !confirm('Delete this marker?')) return
    
    if (type === 'camera') {
      const time = selectedShot.cameraTrack[index].t
      await window.indieForge.pipeline.removeCameraKeyframe(projectId!, selectedShotId!, time)
    } else {
      const time = selectedShot.effectsTrack[index].t
      await window.indieForge.pipeline.removeEffectMarker(projectId!, selectedShotId!, time)
    }
    
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
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

  const handleCreateStoryboard = async () => {
    if (!newStoryboardName.trim()) {
      alert('Please enter a storyboard name')
      return
    }

    try {
      await window.indieForge.pipeline.createStoryboard(projectId!, gameId, { name: newStoryboardName.trim() })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setCreatingStoryboard(false)
      setNewStoryboardName('')
      
      // Select the newly created storyboard
      const newStoryboard = updated.assetPipeline?.storyboards?.filter(sb => sb.gameId === gameId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      if (newStoryboard) {
        setSelectedStoryboardId(newStoryboard.id)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create storyboard')
    }
  }

  const handleCreateShot = async () => {
    if (!selectedStoryboardId || !newShotName.trim()) {
      alert('Please enter a shot name')
      return
    }

    try {
      await window.indieForge.pipeline.createShot(projectId!, selectedStoryboardId, { name: newShotName.trim() })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setCreatingShot(false)
      setNewShotName('')
      
      // Select the newly created shot
      const storyboard = updated.assetPipeline?.storyboards?.find(sb => sb.id === selectedStoryboardId)
      if (storyboard && storyboard.shotIds.length > 0) {
        const lastShotId = storyboard.shotIds[storyboard.shotIds.length - 1]
        setSelectedShotId(lastShotId)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create shot')
    }
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>Storyboards</h3>
          <button
            type="button"
            onClick={() => setCreatingStoryboard(true)}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
          >
            + New
          </button>
        </div>
        
        {creatingStoryboard && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid var(--forge-gold)' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Create Storyboard</div>
            <input
              type="text"
              placeholder="Name"
              value={newStoryboardName}
              onChange={(e) => setNewStoryboardName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateStoryboard()}
              style={{ width: '100%', padding: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleCreateStoryboard}
                style={{ flex: 1, fontSize: '0.85rem', padding: '0.4rem' }}
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => { setCreatingStoryboard(false); setNewStoryboardName('') }}
                style={{ flex: 1, fontSize: '0.85rem', padding: '0.4rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        {storyboards.length === 0 && !creatingStoryboard ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
            No storyboards yet
          </div>
        ) : (
          storyboards.map(sb => (
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
        ))
        )}
        
        {selectedStoryboard && (
          <>
            {attachedScene && (
              <div style={{
                marginTop: '1rem',
                padding: '0.5rem',
                background: 'var(--bg)',
                borderRadius: '4px',
                fontSize: '0.85rem',
                color: 'var(--muted)',
                border: '1px solid var(--border)'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Attached to Scene:</div>
                <div>{attachedScene.name}</div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.5rem 0 0.75rem 0' }}>
              <h3 style={{ fontSize: '1rem', margin: 0 }}>Shots</h3>
              <button
                type="button"
                onClick={() => setCreatingShot(true)}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                + Add
              </button>
            </div>
            
            {creatingShot && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid var(--forge-gold)' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Add Shot</div>
                <input
                  type="text"
                  placeholder="Shot name"
                  value={newShotName}
                  onChange={(e) => setNewShotName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateShot()}
                  style={{ width: '100%', padding: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleCreateShot}
                    style={{ flex: 1, fontSize: '0.85rem', padding: '0.4rem' }}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreatingShot(false); setNewShotName('') }}
                    style={{ flex: 1, fontSize: '0.85rem', padding: '0.4rem' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Timeline</span>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}>
                  {mode === 'camera' && (
                    <button type="button" onClick={handleAddCameraKeyframe} style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}>
                      + Camera @ {playbackTime.toFixed(1)}s
                    </button>
                  )}
                  <button type="button" onClick={() => setShowAddEffect(true)} style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}>
                    + Effect
                  </button>
                  <span style={{ color: 'var(--muted)' }}>
                    {playbackTime.toFixed(2)}s / {selectedShot.durationSec}s
                  </span>
                </div>
              </div>
              
              <div 
                style={{ position: 'relative', height: '60px', background: 'var(--bg)', borderRadius: '4px', cursor: 'pointer' }}
                onPointerDown={handleTimelinePointerDown}
                onPointerMove={handleTimelinePointerMove}
                onPointerUp={handleTimelinePointerUp}
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
                    onContextMenu={(e) => {
                      e.preventDefault()
                      handleDeleteMarker('camera', idx)
                    }}
                    style={{
                      position: 'absolute',
                      left: `${(kf.t / selectedShot.durationSec) * 100}%`,
                      top: '10px',
                      width: '14px',
                      height: '14px',
                      background: '#00AAFF',
                      borderRadius: '50%',
                      transform: 'translateX(-50%)',
                      cursor: 'grab',
                      border: '2px solid #fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                    }}
                    title={`Camera @ ${kf.t.toFixed(1)}s (right-click to delete)`}
                  />
                ))}
                
                {/* Effect markers */}
                {selectedShot.effectsTrack.map((ef, idx) => (
                  <div
                    key={idx}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      handleDeleteMarker('effect', idx)
                    }}
                    style={{
                      position: 'absolute',
                      left: `${(ef.t / selectedShot.durationSec) * 100}%`,
                      bottom: '10px',
                      width: '14px',
                      height: '14px',
                      background: '#FF6B6B',
                      borderRadius: '50%',
                      transform: 'translateX(-50%)',
                      cursor: 'grab',
                      border: '2px solid #fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                    }}
                    title={`Effect @ ${ef.t.toFixed(1)}s (right-click to delete)`}
                  />
                ))}
              </div>
              
              {showAddEffect && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid var(--forge-gold)' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Add Effect at {playbackTime.toFixed(1)}s</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
                    {(['shake', 'flash', 'freeze', 'zoom_punch'] as ScenePresetType[]).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleAddEffect(undefined, type)}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  {presets.length > 0 && (
                    <>
                      <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Or use preset:</div>
                      {presets.slice(0, 3).map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleAddEffect(preset.id)}
                          style={{ width: '100%', marginBottom: '0.25rem', fontSize: '0.8rem', textAlign: 'left' }}
                        >
                          {preset.type}
                        </button>
                      ))}
                    </>
                  )}
                  <button type="button" onClick={() => setShowAddEffect(false)} style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    Cancel
                  </button>
                </div>
              )}
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
                    <span style={{ opacity: 0.7 }}>{layer.scale.toFixed(2)}x • {layer.rotation.toFixed(0)}°</span>
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
