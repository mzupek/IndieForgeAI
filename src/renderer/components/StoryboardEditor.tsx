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

function CameraInspector({
  keyframe,
  layers,
  onSave,
  onClose,
  onDelete
}: {
  keyframe: CameraKeyframe
  layers: StoryboardLayer[]
  onSave: (updated: CameraKeyframe) => void
  onClose: () => void
  onDelete: () => void
}) {
  const [zoom, setZoom] = useState(keyframe.zoom)
  const [targetType, setTargetType] = useState<'layer' | 'point'>(
    typeof keyframe.target === 'string' ? 'layer' : 'point'
  )
  const [targetLayer, setTargetLayer] = useState(
    typeof keyframe.target === 'string' ? keyframe.target : ''
  )
  const [targetX, setTargetX] = useState(
    typeof keyframe.target === 'object' ? keyframe.target.x : 0.5
  )
  const [targetY, setTargetY] = useState(
    typeof keyframe.target === 'object' ? keyframe.target.y : 0.5
  )

  // Live preview - update immediately on change (Matt's fix)
  const updateLive = (newZoom?: number, newType?: 'layer' | 'point', newLayer?: string, newX?: number, newY?: number) => {
    const updated: CameraKeyframe = {
      t: keyframe.t,
      zoom: newZoom ?? zoom,
      target: (newType ?? targetType) === 'layer' 
        ? (newLayer ?? targetLayer) || { x: 0.5, y: 0.5 }
        : { x: newX ?? targetX, y: newY ?? targetY },
      framingRect: keyframe.framingRect
    }
    onSave(updated)
  }

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom)
    updateLive(newZoom)
  }

  const handleTargetTypeChange = (newType: 'layer' | 'point') => {
    setTargetType(newType)
    updateLive(undefined, newType)
  }

  const handleTargetLayerChange = (newLayer: string) => {
    setTargetLayer(newLayer)
    updateLive(undefined, undefined, newLayer)
  }

  const handleTargetXChange = (newX: number) => {
    setTargetX(newX)
    updateLive(undefined, undefined, undefined, newX)
  }

  const handleTargetYChange = (newY: number) => {
    setTargetY(newY)
    updateLive(undefined, undefined, undefined, undefined, newY)
  }

  return (
    <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid #00AAFF' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
        Edit Camera @ {keyframe.t.toFixed(1)}s
      </div>
      
      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        Zoom:
        <input
          type="number"
          step="0.1"
          min="0.5"
          max="5"
          value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          style={{ width: '100%', marginTop: '0.25rem' }}
        />
      </label>
      
      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        Target Type:
        <select
          value={targetType}
          onChange={(e) => handleTargetTypeChange(e.target.value as 'layer' | 'point')}
          style={{ width: '100%', marginTop: '0.25rem' }}
        >
          <option value="layer">Layer</option>
          <option value="point">Point</option>
        </select>
      </label>
      
      {targetType === 'layer' ? (
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
          Target Layer:
          <select
            value={targetLayer}
            onChange={(e) => handleTargetLayerChange(e.target.value)}
            style={{ width: '100%', marginTop: '0.25rem' }}
          >
            <option value="">Center (no layer)</option>
            {layers.map(layer => (
              <option key={layer.id} value={layer.id}>
                z{layer.zOrder} - {layer.characterId ? 'Character' : layer.clipId ? 'Clip' : 'Image'}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            Target X:
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={targetX}
              onChange={(e) => handleTargetXChange(Number(e.target.value))}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            Target Y:
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={targetY}
              onChange={(e) => handleTargetYChange(Number(e.target.value))}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
        </>
      )}
      
      {keyframe.framingRect && (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
          Framing: {keyframe.framingRect.width.toFixed(2)} × {keyframe.framingRect.height.toFixed(2)}
        </div>
      )}
      
      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.5rem', fontStyle: 'italic' }}>
        💡 Changes apply instantly as you edit
      </div>
      
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button type="button" onClick={onClose} style={{ flex: 1 }}>
          Close
        </button>
        <button 
          type="button" 
          onClick={onDelete} 
          style={{ flex: 1, background: 'var(--danger)', color: 'white' }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function EffectInspector({
  effect,
  presets,
  onSave,
  onClose
}: {
  effect: EffectMarker
  presets: ScenePreset[]
  onSave: (params: Record<string, unknown>) => void
  onClose: () => void
}) {
  const preset = effect.presetId ? presets.find(p => p.id === effect.presetId) : null
  if (!preset) {
    return (
      <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid var(--forge-gold)' }}>
        <p style={{ color: 'var(--error)' }}>Effect preset not found</p>
        <button type="button" onClick={onClose} style={{ width: '100%', marginTop: '0.5rem' }}>Close</button>
      </div>
    )
  }

  const [params, setParams] = useState(preset.params)

  // Live preview - update immediately on change (Matt's fix)
  const updateParam = (key: string, value: unknown) => {
    const newParams = { ...params, [key]: value }
    setParams(newParams)
    onSave(newParams)
  }

  return (
    <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid var(--forge-gold)' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
        Edit Effect: {preset.type} @ {effect.t.toFixed(1)}s
      </div>
      
      {preset.type === 'shake' && (
        <>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            Intensity:
            <input
              type="number"
              value={params.intensity as number || 10}
              onChange={(e) => updateParam('intensity', Number(e.target.value))}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            Duration (ms):
            <input
              type="number"
              value={params.durationMs as number || 300}
              onChange={(e) => updateParam('durationMs', Number(e.target.value))}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
        </>
      )}
      
      {preset.type === 'flash' && (
        <>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            Color:
            <input
              type="text"
              value={params.color as string || 'white'}
              onChange={(e) => updateParam('color', e.target.value)}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            Duration (ms):
            <input
              type="number"
              value={params.durationMs as number || 200}
              onChange={(e) => updateParam('durationMs', Number(e.target.value))}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
        </>
      )}
      
      {preset.type === 'freeze' && (
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
          Duration (ms):
          <input
            type="number"
            value={params.durationMs as number || 500}
            onChange={(e) => updateParam('durationMs', Number(e.target.value))}
            style={{ width: '100%', marginTop: '0.25rem' }}
          />
        </label>
      )}
      
      {preset.type === 'zoom_punch' && (
        <>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            Scale:
            <input
              type="number"
              step="0.05"
              value={params.scale as number || 1.15}
              onChange={(e) => updateParam('scale', Number(e.target.value))}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            Duration (ms):
            <input
              type="number"
              value={params.durationMs as number || 300}
              onChange={(e) => updateParam('durationMs', Number(e.target.value))}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
        </>
      )}
      
      {preset.type === 'versus' && (
        <>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            Zoom:
            <input
              type="number"
              step="0.1"
              value={params.zoom as number || 1.0}
              onChange={(e) => updateParam('zoom', Number(e.target.value))}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.5rem 0' }}>
            Note: Character setup not editable in inspector
          </p>
        </>
      )}
      
      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.5rem', fontStyle: 'italic' }}>
        💡 Changes apply instantly as you edit
      </div>
      
      <button type="button" onClick={onClose} style={{ width: '100%', marginTop: '1rem' }}>
        Close
      </button>
    </div>
  )
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
  const [loopPlayback, setLoopPlayback] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'background' | 'camera'>('background')
  
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [dragStart, setDragStart] = useState<any>(null)
  const [draggedMarker, setDraggedMarker] = useState<{ type: 'camera' | 'effect'; index: number } | null>(null)
  
  const [loadedImages, setLoadedImages] = useState<Map<string, LoadedImage>>(new Map())
  const [backgroundImage, setBackgroundImage] = useState<LoadedImage | null>(null)
  const [showAddCharacter, setShowAddCharacter] = useState(false)
  const [showAddEffect, setShowAddEffect] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesText, setNotesText] = useState('')
  const [creatingStoryboard, setCreatingStoryboard] = useState(false)
  const [newStoryboardName, setNewStoryboardName] = useState('')
  const [creatingShot, setCreatingShot] = useState(false)
  const [newShotName, setNewShotName] = useState('')
  const [linkingScene, setLinkingScene] = useState<string | null>(null)
  const [selectedEffectIndex, setSelectedEffectIndex] = useState<number | null>(null)
  const [editingEffect, setEditingEffect] = useState(false)
  const [selectedCameraIndex, setSelectedCameraIndex] = useState<number | null>(null)
  const [editingCamera, setEditingCamera] = useState(false)
  const [cameraManuallySelected, setCameraManuallySelected] = useState(false)
  
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
    // Check for ?storyboardId= query param first
    const urlParams = new URLSearchParams(window.location.search)
    const queryStoryboardId = urlParams.get('storyboardId')
    
    if (queryStoryboardId && storyboards.find(sb => sb.id === queryStoryboardId)) {
      setSelectedStoryboardId(queryStoryboardId)
    } else if (storyboards.length > 0 && !selectedStoryboardId) {
      setSelectedStoryboardId(storyboards[0].id)
    }
  }, [storyboards.length])

  useEffect(() => {
    if (selectedShot && editingNotes) {
      setNotesText(selectedShot.notes || '')
    }
  }, [selectedShot, editingNotes])

  // Load background image
  useEffect(() => {
    if (!selectedShot?.backgroundImage) {
      setBackgroundImage(null)
      return
    }

    const loadBg = async () => {
      try {
        const { localUrl } = await window.indieForge.files.getLocalUrl(selectedShot.backgroundImage!)
        const img = new Image()
        img.onload = () => {
          setBackgroundImage({ element: img, url: localUrl, width: img.width, height: img.height })
        }
        img.onerror = () => {
          console.error('Failed to load background image:', selectedShot.backgroundImage)
          setBackgroundImage(null)
        }
        img.src = localUrl
      } catch (err) {
        console.error('Error loading background image:', err)
        setBackgroundImage(null)
      }
    }
    loadBg()
  }, [selectedShot?.backgroundImage])

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
  
  // Get active effects at current time (Matt's fix - evaluate effects)
  const getActiveEffects = useCallback((time: number) => {
    if (!selectedShot) return []
    
    return selectedShot.effectsTrack.filter(ef => {
      const preset = ef.presetId ? presets.find(p => p.id === ef.presetId) : null
      const params = preset?.params || ef.inlineParams || {}
      const durationMs = (params.durationMs as number) || 300
      const durationSec = durationMs / 1000
      
      return time >= ef.t && time <= ef.t + durationSec
    }).map(ef => {
      const preset = ef.presetId ? presets.find(p => p.id === ef.presetId) : null
      const type = preset?.type || ef.inlineType
      const params = preset?.params || ef.inlineParams || {}
      const durationMs = (params.durationMs as number) || 300
      const progress = Math.min(1, (time - ef.t) / (durationMs / 1000))
      
      return { type, params, progress, t: ef.t }
    })
  }, [selectedShot, presets])

  // Render canvas - runs whenever playbackTime, layers, camera, or effects change
  useEffect(() => {
    if (!canvasRef.current || !selectedShot) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas completely
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    // Draw background image if present (before camera transform)
    if (backgroundImage) {
      const bgAspect = backgroundImage.width / backgroundImage.height
      const canvasAspect = canvas.width / canvas.height
      
      let drawWidth, drawHeight, drawX, drawY
      
      if (bgAspect > canvasAspect) {
        // Background is wider - fit height
        drawHeight = canvas.height
        drawWidth = drawHeight * bgAspect
        drawX = (canvas.width - drawWidth) / 2
        drawY = 0
      } else {
        // Background is taller - fit width
        drawWidth = canvas.width
        drawHeight = drawWidth / bgAspect
        drawX = 0
        drawY = (canvas.height - drawHeight) / 2
      }
      
      ctx.drawImage(backgroundImage.element, drawX, drawY, drawWidth, drawHeight)
      
      // Apply stage treatment effects to background only (Phase C.1)
      if (selectedShot.stageTreatment) {
        const { bgDim, vignette } = selectedShot.stageTreatment
        
        // bgDim: darken background with black overlay
        if (bgDim && bgDim > 0) {
          ctx.fillStyle = `rgba(0, 0, 0, ${bgDim})`
          ctx.fillRect(drawX, drawY, drawWidth, drawHeight)
        }
        
        // Vignette: radial gradient darkening toward edges
        if (vignette && vignette > 0) {
          const centerX = canvas.width / 2
          const centerY = canvas.height / 2
          const radius = Math.max(canvas.width, canvas.height) * 0.7
          
          const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
          gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
          gradient.addColorStop(1, `rgba(0, 0, 0, ${vignette})`)
          
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
      }
    }

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
      
      const img = loadedImages.get(layer.id)
      const size = img ? 200 * layer.scale : 100 * layer.scale
      
      // Phase C.3a: Dual-pass rendering for outerGlow + dropShadow
      // Pass 1: Outer glow (if present)
      if (layer.fx?.outerGlow) {
        const glow = layer.fx.outerGlow
        ctx.shadowBlur = glow.blur
        ctx.shadowColor = glow.color
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.globalAlpha = layer.opacity * glow.alpha
        
        if (img) {
          ctx.drawImage(img.element, -size / 2, -size / 2, size, size)
          // Draw again for stronger glow if strength > 1
          if (glow.strength && glow.strength > 1) {
            for (let i = 1; i < glow.strength; i++) {
              ctx.drawImage(img.element, -size / 2, -size / 2, size, size)
            }
          }
        } else {
          ctx.fillStyle = layer.id === selectedLayerId ? '#FFC800' : '#4a4a4a'
          ctx.fillRect(-size / 2, -size / 2, size, size)
        }
        
        // Clear shadow state for next pass
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.shadowColor = 'transparent'
      }
      
      // Pass 2: Drop shadow (if present)
      if (layer.fx?.dropShadow) {
        const shadow = layer.fx.dropShadow
        ctx.shadowOffsetX = shadow.offsetX
        ctx.shadowOffsetY = shadow.offsetY
        ctx.shadowBlur = shadow.blur
        ctx.shadowColor = shadow.color
        ctx.globalAlpha = layer.opacity * shadow.alpha
        
        if (img) {
          ctx.drawImage(img.element, -size / 2, -size / 2, size, size)
        } else {
          ctx.fillStyle = layer.id === selectedLayerId ? '#FFC800' : '#4a4a4a'
          ctx.fillRect(-size / 2, -size / 2, size, size)
        }
        
        // Clear shadow state
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.shadowColor = 'transparent'
      }
      
      // Pass 3: No effects (if neither glow nor shadow)
      if (!layer.fx?.outerGlow && !layer.fx?.dropShadow) {
        ctx.globalAlpha = layer.opacity
        if (img) {
          ctx.drawImage(img.element, -size / 2, -size / 2, size, size)
        } else {
          ctx.fillStyle = layer.id === selectedLayerId ? '#FFC800' : '#4a4a4a'
          ctx.fillRect(-size / 2, -size / 2, size, size)
        }
      }
      
      ctx.restore()

      // Selection handles (Phase C.3a: account for rotation)
      if (layer.id === selectedLayerId && mode === 'layout' && playbackState === 'stopped') {
        const size = (img ? 200 : 100) * layer.scale
        const cx = stageX
        const cy = stageY
        const rotRad = (layer.rotation * Math.PI) / 180
        
        const handleSize = 10 / (getInterpolatedCamera(playbackTime)?.zoom || 1)
        ctx.strokeStyle = '#FFC800'
        ctx.lineWidth = 2 / (getInterpolatedCamera(playbackTime)?.zoom || 1)
        ctx.fillStyle = '#FFC800'
        
        // Draw rotated bounding box
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(rotRad)
        ctx.strokeRect(-size / 2, -size / 2, size, size)
        
        // Corner handles (scale) - at rotated corners
        ctx.fillRect(-size / 2 - handleSize / 2, -size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(size / 2 - handleSize / 2, -size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(-size / 2 - handleSize / 2, size / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(size / 2 - handleSize / 2, size / 2 - handleSize / 2, handleSize, handleSize)
        
        // Rotation handle - above top edge
        ctx.beginPath()
        ctx.arc(0, -size / 2 - 20, 6 / (getInterpolatedCamera(playbackTime)?.zoom || 1), 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    ctx.restore()
    
    // Apply active effects (Matt's fix - make effects visible)
    const activeEffects = getActiveEffects(playbackTime)
    for (const effect of activeEffects) {
      if (effect.type === 'shake') {
        const intensity = (effect.params.intensity as number) || 10
        const shakeX = (Math.random() - 0.5) * intensity * (1 - effect.progress)
        const shakeY = (Math.random() - 0.5) * intensity * (1 - effect.progress)
        ctx.save()
        ctx.translate(shakeX, shakeY)
        ctx.restore()
      } else if (effect.type === 'flash') {
        const color = (effect.params.color as string) || 'white'
        const opacity = ((effect.params.opacity as number) || 0.8) * (1 - effect.progress)
        ctx.fillStyle = color
        ctx.globalAlpha = opacity
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.globalAlpha = 1
      } else if (effect.type === 'freeze') {
        // Visual indicator that time is frozen
        ctx.strokeStyle = '#00FFFF'
        ctx.lineWidth = 3
        ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10)
      } else if (effect.type === 'zoom_punch') {
        // Already handled by camera zoom interpolation, but add flash
        const opacity = 0.3 * (1 - effect.progress)
        ctx.fillStyle = 'rgba(255, 255, 255, ' + opacity + ')'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    }

    // Draw framing rect overlay in camera mode (persistent - Matt's fix v2)
    if (mode === 'camera') {
      const cam = getInterpolatedCamera(playbackTime)
      if (cam) {
        // Use explicit framingRect if present, otherwise calculate from zoom
        let rect = cam.framingRect
        if (!rect) {
          // Calculate viewport from zoom: higher zoom = smaller viewport
          const viewWidth = 1 / cam.zoom
          const viewHeight = 1 / cam.zoom
          rect = {
            x: cam.target.x - viewWidth / 2,
            y: cam.target.y - viewHeight / 2,
            width: viewWidth,
            height: viewHeight
          }
        }
        
        // Draw the framing rect
        ctx.strokeStyle = '#00AAFF'
        ctx.lineWidth = 4
        ctx.setLineDash([8, 4])
        const rectX = rect.x * canvas.width
        const rectY = rect.y * canvas.height
        const rectW = rect.width * canvas.width
        const rectH = rect.height * canvas.height
        ctx.strokeRect(rectX, rectY, rectW, rectH)
        ctx.setLineDash([])
        
        // Draw corner handles for visibility (especially when zoom ≈ 1)
        const handleSize = 20
        ctx.fillStyle = '#00AAFF'
        // Top-left
        ctx.fillRect(rectX - 2, rectY - 2, handleSize, 4)
        ctx.fillRect(rectX - 2, rectY - 2, 4, handleSize)
        // Top-right
        ctx.fillRect(rectX + rectW - handleSize + 2, rectY - 2, handleSize, 4)
        ctx.fillRect(rectX + rectW - 2, rectY - 2, 4, handleSize)
        // Bottom-left
        ctx.fillRect(rectX - 2, rectY + rectH - 2, handleSize, 4)
        ctx.fillRect(rectX - 2, rectY + rectH - handleSize + 2, 4, handleSize)
        // Bottom-right
        ctx.fillRect(rectX + rectW - handleSize + 2, rectY + rectH - 2, handleSize, 4)
        ctx.fillRect(rectX + rectW - 2, rectY + rectH - handleSize + 2, 4, handleSize)
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
      const rotRad = (selectedLayer.rotation * Math.PI) / 180
      
      // Helper: rotate point around layer center
      const rotatePoint = (px: number, py: number) => {
        const dx = px - lx
        const dy = py - ly
        return {
          x: lx + dx * Math.cos(rotRad) - dy * Math.sin(rotRad),
          y: ly + dx * Math.sin(rotRad) + dy * Math.cos(rotRad)
        }
      }
      
      // Helper: inverse rotate point (world to local)
      const invRotatePoint = (px: number, py: number) => {
        const dx = px - lx
        const dy = py - ly
        return {
          x: lx + dx * Math.cos(-rotRad) - dy * Math.sin(-rotRad),
          y: ly + dx * Math.sin(-rotRad) + dy * Math.cos(-rotRad)
        }
      }
      
      // Check rotation handle (rotated position above top edge)
      const rotHandle = rotatePoint(lx, ly - size / 2 - 20 / canvas.width)
      if (Math.hypot(x - rotHandle.x, y - rotHandle.y) < handleSize / 2) {
        setDragMode('rotate')
        setDragStart({ x, y, clientX: e.clientX, clientY: e.clientY, layerX: lx, layerY: ly, layerRotation: selectedLayer.rotation })
        return
      }
      
      // Check corner handles (rotated corners)
      const corners = [
        rotatePoint(lx - size / 2, ly - size / 2),
        rotatePoint(lx + size / 2, ly - size / 2),
        rotatePoint(lx - size / 2, ly + size / 2),
        rotatePoint(lx + size / 2, ly + size / 2)
      ]
      
      for (const corner of corners) {
        if (Math.hypot(x - corner.x, y - corner.y) < handleSize / 2) {
          setDragMode('scale')
          setDragStart({ x, y, clientX: e.clientX, clientY: e.clientY, layerX: lx, layerY: ly, layerScale: selectedLayer.scale })
          return
        }
      }
      
      // Check body (move) - use inverse rotation to check if click is inside unrotated rect
      const localPoint = invRotatePoint(x, y)
      if (Math.abs(localPoint.x - lx) <= size / 2 && Math.abs(localPoint.y - ly) <= size / 2) {
        setDragMode('move')
        setDragStart({ x, y, clientX: e.clientX, clientY: e.clientY, layerX: lx, layerY: ly })
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
      setDragStart({ x, y, clientX: e.clientX, clientY: e.clientY })
    }
  }

  const handlePointerMove = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !selectedShot || !dragStart) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    if (dragMode === 'move' && selectedLayer) {
      // Calculate delta in pixel space first, then convert to normalized coordinates
      // This gives precise 1:1 pixel-to-visual movement feel
      const pixelDx = e.clientX - dragStart.clientX
      const pixelDy = e.clientY - dragStart.clientY
      
      // Apply drag threshold to prevent accidental nudges on clicks
      if (Math.abs(pixelDx) < 3 && Math.abs(pixelDy) < 3) return
      
      const dx = pixelDx / rect.width
      const dy = pixelDy / rect.height
      
      const updates = {
        x: Math.max(0, Math.min(1, dragStart.layerX + dx)),
        y: Math.max(0, Math.min(1, dragStart.layerY + dy))
      }
      
      await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayerId!, updates)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setDragStart({ ...dragStart, clientX: e.clientX, clientY: e.clientY, layerX: updates.x, layerY: updates.y })
    } else if (dragMode === 'scale' && selectedLayer) {
      // Phase C.3a: Use pixel distance for accurate scaling
      const pixelDist = Math.hypot(e.clientX - dragStart.layerX * rect.width, e.clientY - dragStart.layerY * rect.height)
      const startPixelDist = Math.hypot(dragStart.clientX - dragStart.layerX * rect.width, dragStart.clientY - dragStart.layerY * rect.height)
      const scaleFactor = startPixelDist > 0 ? pixelDist / startPixelDist : 1
      
      const newScale = Math.max(0.1, Math.min(5, dragStart.layerScale * scaleFactor))
      
      await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayerId!, { scale: newScale })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    } else if (dragMode === 'rotate' && selectedLayer) {
      // Phase C.3a: Calculate rotation angle from pointer movement
      const angle = Math.atan2(y - dragStart.layerY, x - dragStart.layerX) * (180 / Math.PI)
      const startAngle = Math.atan2(dragStart.y - dragStart.layerY, dragStart.x - dragStart.layerX) * (180 / Math.PI)
      const rotation = ((dragStart.layerRotation + (angle - startAngle)) % 360 + 360) % 360
      
      await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayerId!, { rotation })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    }
  }

  const handlePointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragMode === 'framingRect' && dragStart && selectedShot) {
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
          t: selectedCameraIndex !== null && selectedShot.cameraTrack[selectedCameraIndex]
            ? selectedShot.cameraTrack[selectedCameraIndex].t
            : playbackTime,
          target: { x: rectX + width / 2, y: rectY + height / 2 },
          zoom: 1.0 / Math.max(width, height),
          framingRect: { x: rectX, y: rectY, width, height }
        }
        
        // Update existing keyframe if one is selected, otherwise add new
        if (selectedCameraIndex !== null && 
            Math.abs(selectedShot.cameraTrack[selectedCameraIndex].t - keyframe.t) < 0.01) {
          await handleUpdateCameraKeyframe(selectedCameraIndex, keyframe)
        } else {
          await window.indieForge.pipeline.addCameraKeyframe(projectId!, selectedShotId!, keyframe)
          const updated = await window.indieForge.projects.open(projectId!)
          setActiveProject(updated)
        }
      }
    }

    setDragMode(null)
    setDragStart(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedShot) return
    
    // Prevent text selection and native drag
    e.preventDefault()
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const clickTime = x * selectedShot.durationSec
    
    // Check camera markers (wider hit area)
    for (let i = 0; i < selectedShot.cameraTrack.length; i++) {
      const kf = selectedShot.cameraTrack[i]
      const markerX = kf.t / selectedShot.durationSec
      if (Math.abs(x - markerX) < 0.03) {
        setDraggedMarker({ type: 'camera', index: i })
        setDragMode('marker' as any)
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }
    }
    
    // Check effect markers (wider hit area)
    for (let i = 0; i < selectedShot.effectsTrack.length; i++) {
      const ef = selectedShot.effectsTrack[i]
      const markerX = ef.t / selectedShot.durationSec
      if (Math.abs(x - markerX) < 0.03) {
        setDraggedMarker({ type: 'effect', index: i })
        setDragMode('marker' as any)
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }
    }
    
    // Start playhead scrubbing
    setDragMode('playhead' as any)
    setPlaybackTime(clickTime)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedShot || !dragMode) return
    
    // Prevent text selection during drag
    e.preventDefault()
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newTime = x * selectedShot.durationSec
    
    // Handle playhead scrubbing
    if (dragMode === 'playhead' as any) {
      setPlaybackTime(newTime)
      return
    }
    
    // Handle marker dragging - update local state immediately for smooth preview
    if (dragMode === 'marker' as any && draggedMarker) {
      if (draggedMarker.type === 'camera') {
        const updated = [...selectedShot.cameraTrack]
        updated[draggedMarker.index] = { ...updated[draggedMarker.index], t: newTime }
        
        // Update local state immediately - setActiveProject takes object, not function!
        if (activeProject && activeProject.assetPipeline) {
          const updatedProject = {
            ...activeProject,
            assetPipeline: {
              ...activeProject.assetPipeline,
              storyboardShots: activeProject.assetPipeline.storyboardShots?.map(s => 
                s.id === selectedShotId ? { ...s, cameraTrack: updated } : s
              )
            }
          }
          setActiveProject(updatedProject)
        }
      } else {
        const updated = [...selectedShot.effectsTrack]
        updated[draggedMarker.index] = { ...updated[draggedMarker.index], t: newTime }
        
        // Update local state immediately - setActiveProject takes object, not function!
        if (activeProject && activeProject.assetPipeline) {
          const updatedProject = {
            ...activeProject,
            assetPipeline: {
              ...activeProject.assetPipeline,
              storyboardShots: activeProject.assetPipeline.storyboardShots?.map(s => 
                s.id === selectedShotId ? { ...s, effectsTrack: updated } : s
              )
            }
          }
          setActiveProject(updatedProject)
        }
      }
    }
  }

  const handleTimelinePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedShot) return
    
    // Persist marker changes to disk
    if (dragMode === 'marker' as any && draggedMarker) {
      if (draggedMarker.type === 'camera') {
        // Remember which key we were editing by time (not index, as it may change after sort)
        const editedKeyTime = selectedShot.cameraTrack[draggedMarker.index]?.t
        
        // Sort camera track by time to maintain consistent order
        const sortedTrack = [...selectedShot.cameraTrack].sort((a, b) => a.t - b.t)
        
        await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, { 
          cameraTrack: sortedTrack
        })
        
        // Reload to ensure consistency
        const proj = await window.indieForge.projects.open(projectId!)
        setActiveProject(proj)
        
        // Update selectedCameraIndex to match new sorted position
        if (editedKeyTime !== undefined) {
          const newShot = proj.assetPipeline?.storyboardShots?.find(s => s.id === selectedShotId)
          if (newShot) {
            const newIndex = newShot.cameraTrack.findIndex(k => Math.abs(k.t - editedKeyTime) < 0.001)
            if (newIndex >= 0) {
              setSelectedCameraIndex(newIndex)
            }
          }
        }
      } else {
        // Sort effects track by time too
        const sortedTrack = [...selectedShot.effectsTrack].sort((a, b) => a.t - b.t)
        
        await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, { 
          effectsTrack: sortedTrack 
        })
        
        // Reload to ensure consistency
        const proj = await window.indieForge.projects.open(projectId!)
        setActiveProject(proj)
      }
    }
    
    // Clean up drag state
    setDragMode(null)
    setDraggedMarker(null)
    
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleAddCameraKeyframe = async () => {
    if (!selectedShot) return
    
    // Use interpolated camera state if available, otherwise default to center
    const currentCam = getInterpolatedCamera(playbackTime)
    const keyframe: CameraKeyframe = {
      t: playbackTime,
      target: currentCam?.target || { x: 0.5, y: 0.5 },
      zoom: currentCam?.zoom || 1.0,
      framingRect: currentCam?.framingRect
    }
    
    await window.indieForge.pipeline.addCameraKeyframe(projectId!, selectedShotId!, keyframe)
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
  }
  
  const handleUpdateCameraKeyframe = async (index: number, updated: CameraKeyframe) => {
    if (!selectedShot) return
    
    const newTrack = [...selectedShot.cameraTrack]
    newTrack[index] = updated
    
    await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, { cameraTrack: newTrack })
    const proj = await window.indieForge.projects.open(projectId!)
    setActiveProject(proj)
    
    // Keep inspector open and jump to key time so user sees the change
    setPlaybackTime(updated.t)
    // Don't close inspector - let user iteratively adjust
  }
  
  const handleDeleteCameraKeyframe = async (index: number) => {
    if (!selectedShot || !confirm('Delete this camera keyframe?')) return
    
    const time = selectedShot.cameraTrack[index].t
    await window.indieForge.pipeline.removeCameraKeyframe(projectId!, selectedShotId!, time)
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
    setEditingCamera(false)
    setSelectedCameraIndex(null)
  }

  const handleAddEffect = async (presetId?: string, inlineType?: ScenePresetType) => {
    if (!selectedShot) return

    let finalPresetId = presetId
    
    // If inline type, create a quick preset
    if (inlineType && !presetId) {
      try {
        const newPreset = await window.indieForge.pipeline.createPreset(inlineType, {})
        finalPresetId = newPreset.id
        const updated = await window.indieForge.projects.open(projectId!)
        setActiveProject(updated)
      } catch (err) {
        console.error('Failed to create preset:', err)
        alert('Failed to create effect preset')
        return
      }
    }

    const effect: EffectMarker = {
      t: playbackTime,
      presetId: finalPresetId
    }
    
    await window.indieForge.pipeline.addEffectMarker(projectId!, selectedShotId!, effect)
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
    setShowAddEffect(false)
  }

  const handleUpdateEffectParams = async (effectIndex: number, params: Record<string, unknown>) => {
    if (!selectedShot || effectIndex < 0 || effectIndex >= selectedShot.effectsTrack.length) return
    
    const effect = selectedShot.effectsTrack[effectIndex]
    if (!effect.presetId) return
    
    try {
      const preset = presets.find(p => p.id === effect.presetId)
      if (!preset) return
      
      // Replace params for this type (don't merge)
      await window.indieForge.pipeline.updatePreset(effect.presetId, { params })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      
      // Keep inspector open and jump to effect time so user sees the result
      setPlaybackTime(effect.t)
      // Don't close inspector - let user iteratively adjust
    } catch (err) {
      console.error('Failed to update effect:', err)
      alert(err instanceof Error ? err.message : 'Failed to update effect')
    }
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

  const handleDeleteStoryboard = async (storyboardId: string) => {
    const sb = storyboards.find(s => s.id === storyboardId)
    if (!sb) return
    
    const linkedScene = sb.sceneId ? scenes.find(s => s.id === sb.sceneId) : null
    const confirmMsg = linkedScene
      ? `Delete storyboard "${sb.name}"? This will clear the storyboard link from scene "${linkedScene.name}".`
      : `Delete storyboard "${sb.name}"?`
    
    if (!confirm(confirmMsg)) return

    try {
      // If linked to a scene, clear the scene's storyboardId first
      if (sb.sceneId) {
        await window.indieForge.pipeline.updateScene(sb.sceneId, { storyboardId: undefined })
      }
      
      await window.indieForge.pipeline.deleteStoryboard(projectId!, storyboardId)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setSelectedStoryboardId(null)
      setSelectedShotId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete storyboard')
    }
  }

  const handleDeleteShot = async (shotId: string) => {
    if (!selectedStoryboardId) return
    
    const shot = shots.find(s => s.id === shotId)
    if (!shot) return
    
    if (!confirm(`Delete shot "${shot.name}"?`)) return

    try {
      await window.indieForge.pipeline.deleteShot(projectId!, selectedStoryboardId, shotId)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setSelectedShotId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete shot')
    }
  }

  const handleLinkToScene = async (storyboardId: string, sceneId: string) => {
    try {
      await window.indieForge.pipeline.updateStoryboard(projectId!, storyboardId, { sceneId })
      await window.indieForge.pipeline.updateScene(sceneId, { storyboardId })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setLinkingScene(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to link storyboard to scene')
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
    let lastTime = performance.now()
    
    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000 // Convert to seconds
      lastTime = currentTime
      
      setPlaybackTime(t => {
        if (!selectedShot) return 0
        const newTime = t + deltaTime
        
        if (newTime >= selectedShot.durationSec) {
          if (loopPlayback) {
            // Loop: restart from beginning
            return 0
          } else {
            // Stop: clamp to duration and stop playback
            setTimeout(() => setPlaybackState('stopped'), 0)
            return selectedShot.durationSec
          }
        }
        return newTime
      })
      
      // Continue animation - check will happen on next render
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    animationFrameRef.current = requestAnimationFrame(animate)
  }
  
  // Stop animation when playback stops
  useEffect(() => {
    if (playbackState !== 'playing' && animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [playbackState])

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
  
  // Auto-select camera keyframe when playhead is on one (Phase C.3b - fixed for Matt)
  useEffect(() => {
    if (!selectedShot || playbackState === 'playing' || cameraManuallySelected) return
    
    const onKeyframe = selectedShot.cameraTrack.findIndex(kf => 
      Math.abs(kf.t - playbackTime) < 0.05
    )
    
    if (onKeyframe >= 0 && !editingCamera) {
      setSelectedCameraIndex(onKeyframe)
      setEditingCamera(true)
      setCameraManuallySelected(false)
    } else if (onKeyframe < 0 && editingCamera && !cameraManuallySelected) {
      // Only auto-close if not manually selected
      setEditingCamera(false)
      setSelectedCameraIndex(null)
    }
  }, [playbackTime, selectedShot, playbackState, editingCamera, cameraManuallySelected])
  
  // Keyboard support for deleting selected camera keyframe
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && 
          selectedCameraIndex !== null && 
          editingCamera &&
          mode === 'camera') {
        // Don't delete if user is typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        
        e.preventDefault()
        handleDeleteCameraKeyframe(selectedCameraIndex)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedCameraIndex, editingCamera, mode])

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
          storyboards.map(sb => {
          const sbScene = sb.sceneId ? scenes.find(s => s.id === sb.sceneId) : null
          const isOrphan = !sb.sceneId
          return (
            <div
              key={sb.id}
              style={{
                marginBottom: '0.5rem',
                border: selectedStoryboardId === sb.id ? '2px solid var(--forge-gold)' : '1px solid var(--border)',
                borderRadius: '4px',
                background: 'var(--bg-secondary)'
              }}
            >
              <div
                onClick={() => {
                  setSelectedStoryboardId(sb.id)
                  setSelectedShotId(null)
                }}
                style={{
                  padding: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                <div style={{ fontWeight: selectedStoryboardId === sb.id ? 'bold' : 'normal' }}>
                  {sb.name}
                </div>
                {sbScene ? (
                  <div style={{ 
                    fontSize: '0.75rem', 
                    marginTop: '0.25rem',
                    color: 'var(--success)'
                  }}>
                    ✓ Scene: {sbScene.name}
                  </div>
                ) : (
                  <div style={{ 
                    fontSize: '0.75rem', 
                    marginTop: '0.25rem',
                    color: 'var(--muted)'
                  }}>
                    ⚠ Not linked to a scene
                  </div>
                )}
              </div>
              {isOrphan && (
                <div style={{ 
                  padding: '0 0.5rem 0.5rem', 
                  display: 'flex', 
                  gap: '0.25rem',
                  fontSize: '0.75rem'
                }}>
                  <button
                    type="button"
                    onClick={() => setLinkingScene(sb.id)}
                    style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem' }}
                  >
                    Link to Scene
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteStoryboard(sb.id)
                    }}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }}
                  >
                    Delete
                  </button>
                </div>
              )}
              {!isOrphan && selectedStoryboardId === sb.id && (
                <div style={{ 
                  padding: '0 0.5rem 0.5rem',
                  fontSize: '0.75rem'
                }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteStoryboard(sb.id)
                    }}
                    style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }}
                  >
                    Delete Storyboard
                  </button>
                </div>
              )}
            </div>
          )
        })
        )}
        
        {linkingScene && (
          <div style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.5)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{ 
              background: 'var(--bg)', 
              padding: '1.5rem', 
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%'
            }}>
              <h3 style={{ margin: '0 0 1rem 0' }}>Link to Scene</h3>
              <div style={{ marginBottom: '1rem' }}>
                {scenes.length === 0 ? (
                  <p style={{ color: 'var(--muted)' }}>No scenes available. Create a scene first.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                    {scenes.map(scene => (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() => handleLinkToScene(linkingScene, scene.id)}
                        style={{ 
                          padding: '0.75rem', 
                          textAlign: 'left',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px'
                        }}
                      >
                        <div>{scene.name}</div>
                        {scene.storyboardId && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                            Already has storyboard (will be replaced)
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLinkingScene(null)}
                style={{ width: '100%' }}
              >
                Cancel
              </button>
            </div>
          </div>
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
                style={{
                  marginBottom: '0.5rem',
                  border: selectedShotId === shot.id ? '2px solid var(--forge-gold)' : '1px solid var(--border)',
                  borderRadius: '4px',
                  background: 'var(--bg-secondary)'
                }}
              >
                <div
                  onClick={() => setSelectedShotId(shot.id)}
                  style={{
                    padding: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{idx + 1}. {shot.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{shot.durationSec}s · {shot.layers.length} layer{shot.layers.length !== 1 ? 's' : ''}</div>
                </div>
                {selectedShotId === shot.id && (
                  <div style={{ padding: '0 0.5rem 0.5rem' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteShot(shot.id)
                      }}
                      style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }}
                    >
                      Delete Shot
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Center */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedShot ? (
          <>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', alignItems: 'center' }}>
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
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button type="button" onClick={handlePlayAnimatic}>
                  {playbackState === 'playing' ? '⏸ Pause' : '▶ Play'}
                </button>
                <button type="button" onClick={handleStopPlayback}>
                  ⏹ Stop
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={loopPlayback}
                    onChange={(e) => setLoopPlayback(e.target.checked)}
                  />
                  Loop
                </label>
              </div>
            </div>
            
            {mode === 'camera' && (
              <div style={{ 
                marginBottom: '0.5rem', 
                padding: '0.5rem', 
                background: 'rgba(0, 170, 255, 0.1)', 
                borderLeft: '3px solid #00AAFF',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)'
              }}>
                💡 <strong>Camera mode:</strong> Shows framing preview. Drag timeline or playback to see camera zoom/position change.
                {selectedShot && selectedShot.cameraTrack.length > 1 && (
                  <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', fontStyle: 'italic' }}>
                    Camera smoothly interpolates between keys. Scrub timeline to preview each moment.
                  </div>
                )}
                {selectedShot && selectedShot.cameraTrack.length === 0 && (
                  <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', fontStyle: 'italic' }}>
                    Add camera keyframes with "+ Camera" button. First key sets the camera position.
                  </div>
                )}
              </div>
            )}
            {mode === 'layout' && selectedShot && selectedShot.cameraTrack.length > 0 && (
              <div style={{ 
                marginBottom: '0.5rem', 
                padding: '0.5rem', 
                background: 'rgba(255, 200, 0, 0.1)', 
                borderLeft: '3px solid #FFC800',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)'
              }}>
                💡 Switch to <strong>Camera mode</strong> to preview camera zoom/framing. Layout mode shows unframed view.
              </div>
            )}

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
              
              {mode === 'camera' && (() => {
                const cam = getInterpolatedCamera(playbackTime)
                if (!cam) return null
                
                // Find which keys are active for interpolation
                const sorted = [...selectedShot.cameraTrack].sort((a, b) => a.t - b.t)
                let interpolationInfo = ''
                if (sorted.length > 0) {
                  const onKey = sorted.find(k => Math.abs(k.t - playbackTime) < 0.01)
                  if (onKey) {
                    interpolationInfo = ' (on key)'
                  } else {
                    const before = sorted.filter(k => k.t <= playbackTime).pop()
                    const after = sorted.find(k => k.t > playbackTime)
                    if (before && after) {
                      interpolationInfo = ` (blend ${before.t.toFixed(1)}s → ${after.t.toFixed(1)}s)`
                    }
                  }
                }
                
                const targetLabel = typeof cam.target === 'string' 
                  ? selectedShot?.layers.find(l => l.id === cam.target)?.characterId || 'layer'
                  : `(${cam.target.x.toFixed(2)}, ${cam.target.y.toFixed(2)})`
                return (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    background: 'rgba(0, 170, 255, 0.15)',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    color: '#00AAFF',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>
                      <strong>Camera:</strong> Zoom {cam.zoom.toFixed(2)}x · Target: {targetLabel}{interpolationInfo}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                      @ {playbackTime.toFixed(2)}s
                    </span>
                  </div>
                )
              })()}
            </div>

              {/* Timeline - inspector moved to sidebar */}
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Timeline</span>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    onClick={() => {
                      handleAddCameraKeyframe()
                      if (mode !== 'camera') {
                        setMode('camera')
                      }
                    }} 
                    style={{ 
                      fontSize: '0.8rem', 
                      padding: '0.25rem 0.5rem',
                      background: mode === 'camera' ? 'var(--forge-gold)' : 'var(--bg-secondary)',
                      color: mode === 'camera' ? 'var(--bg)' : 'var(--text)',
                      border: mode === 'camera' ? 'none' : '1px solid var(--border)'
                    }}
                    title={mode === 'camera' ? 'Add camera keyframe at current time' : 'Add camera keyframe (switches to Camera mode)'}
                  >
                    + Camera @ {playbackTime.toFixed(1)}s
                  </button>
                  <button type="button" onClick={() => setShowAddEffect(true)} style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}>
                    + Effect
                  </button>
                  <span style={{ color: 'var(--muted)' }}>
                    {playbackTime.toFixed(2)}s / {selectedShot.durationSec}s
                  </span>
                </div>
              </div>
              
              <div 
                style={{ 
                  position: 'relative', 
                  height: '90px', 
                  background: 'var(--bg)', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none'
                }}
                onPointerDown={handleTimelinePointerDown}
                onPointerMove={handleTimelinePointerMove}
                onPointerUp={handleTimelinePointerUp}
              >
                {/* Track Labels - pointerEvents none to not block marker clicks */}
                <div style={{ position: 'absolute', left: '0.5rem', top: '5px', fontSize: '0.7rem', fontWeight: 'bold', color: '#00AAFF', zIndex: 5, pointerEvents: 'none' }}>
                  Camera
                </div>
                <div style={{ position: 'absolute', left: '0.5rem', bottom: '5px', fontSize: '0.7rem', fontWeight: 'bold', color: '#FF6B6B', zIndex: 5, pointerEvents: 'none' }}>
                  Effects
                </div>
                
                {/* Track Divider - pointerEvents none to not block marker clicks */}
                <div style={{ position: 'absolute', left: 0, right: 0, top: '45px', height: '1px', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
                
                {/* Playhead - visual indicator, clicks handled by timeline */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${(playbackTime / selectedShot.durationSec) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: '12px',
                    transform: 'translateX(-6px)',
                    cursor: 'ew-resize',
                    zIndex: 10,
                    pointerEvents: 'none'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    left: '5px',
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: '#FFC800',
                    pointerEvents: 'none'
                  }} />
                  <div style={{
                    position: 'absolute',
                    left: '0',
                    top: '0',
                    width: '12px',
                    height: '12px',
                    background: '#FFC800',
                    clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
                    pointerEvents: 'none'
                  }} />
                </div>
                
                {/* Camera keyframes */}
                {selectedShot.cameraTrack.map((kf, idx) => {
                  const targetLabel = typeof kf.target === 'string' 
                    ? `layer ${kf.target.slice(0, 8)}...` 
                    : `(${kf.target.x.toFixed(2)}, ${kf.target.y.toFixed(2)})`
                  const tooltip = `Camera @ ${kf.t.toFixed(1)}s\nZoom: ${kf.zoom.toFixed(1)}x\nTarget: ${targetLabel}`
                  
                  return (
                    <div
                      key={idx}
                      onPointerDown={(e) => {
                        // Don't stopPropagation - let timeline handle dragging
                        // Select this camera marker, clear effect selection
                        setSelectedCameraIndex(idx)
                        setEditingCamera(true)
                        setCameraManuallySelected(true)
                        // Clear effect selection to show only one inspector
                        setEditingEffect(false)
                        setSelectedEffectIndex(null)
                        // Auto-switch to Camera & Effects tab
                        setSidebarTab('camera')
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleDeleteCameraKeyframe(idx)
                      }}
                      style={{
                        position: 'absolute',
                        left: `${(kf.t / selectedShot.durationSec) * 100}%`,
                        top: '15px',
                        width: '20px',
                        height: '20px',
                        background: selectedCameraIndex === idx ? '#FFD700' : '#00AAFF',
                        borderRadius: '50%',
                        transform: 'translateX(-50%)',
                        cursor: 'move',
                        border: selectedCameraIndex === idx ? '3px solid #FFF' : '2px solid #fff',
                        boxShadow: selectedCameraIndex === idx ? '0 0 8px rgba(255, 215, 0, 0.6)' : '0 2px 4px rgba(0,0,0,0.3)',
                        zIndex: selectedCameraIndex === idx ? 11 : 5
                      }}
                      title={tooltip}
                    />
                  )
                })}
                
                {/* Effect markers */}
                {selectedShot.effectsTrack.map((ef, idx) => {
                  const preset = ef.presetId ? presets.find(p => p.id === ef.presetId) : null
                  const label = preset ? preset.type : 'effect'
                  return (
                    <div
                      key={idx}
                      onPointerDown={(e) => {
                        // Don't stopPropagation - let timeline handle dragging
                        // Select this effect marker, clear camera selection
                        setSelectedEffectIndex(idx)
                        setEditingEffect(true)
                        // Clear camera selection to show only one inspector
                        setEditingCamera(false)
                        setSelectedCameraIndex(null)
                        // Auto-switch to Camera & Effects tab
                        setSidebarTab('camera')
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleDeleteMarker('effect', idx)
                      }}
                      style={{
                        position: 'absolute',
                        left: `${(ef.t / selectedShot.durationSec) * 100}%`,
                        bottom: '15px',
                        width: '20px',
                        height: '20px',
                        background: selectedEffectIndex === idx ? '#FFD700' : '#FF6B6B',
                        borderRadius: '50%',
                        transform: 'translateX(-50%)',
                        cursor: 'move',
                        border: selectedEffectIndex === idx ? '3px solid #FFF' : '2px solid #fff',
                        boxShadow: selectedEffectIndex === idx ? '0 0 8px rgba(255, 215, 0, 0.6)' : '0 2px 4px rgba(0,0,0,0.3)',
                        zIndex: selectedEffectIndex === idx ? 11 : 5
                      }}
                      title={`${label} @ ${ef.t.toFixed(1)}s (drag to move, right-click to delete)`}
                    />
                  )
                })}
              </div>
              
              {showAddEffect && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid var(--forge-gold)' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Add Effect at {playbackTime.toFixed(1)}s</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
                    {(['shake', 'flash', 'freeze', 'zoom_punch', 'versus'] as ScenePresetType[]).map(type => (
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
                      <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Or use existing recipe:</div>
                      <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '0.5rem' }}>
                        {presets.map(preset => {
                          const tag = preset.tags.length > 0 ? preset.tags[0] : preset.type
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handleAddEffect(preset.id)}
                              style={{ width: '100%', marginBottom: '0.25rem', fontSize: '0.8rem', textAlign: 'left', padding: '0.5rem' }}
                            >
                              {tag} ({preset.type})
                            </button>
                          )
                        })}
                      </div>
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

      {/* Right sidebar with tabs */}
      {selectedShot && (
        <div style={{ width: '280px', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
          {/* Tab headers */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setSidebarTab('background')}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: sidebarTab === 'background' ? 'var(--forge-gold)' : 'transparent',
                color: sidebarTab === 'background' ? 'var(--bg)' : 'var(--text)',
                border: 'none',
                borderBottom: sidebarTab === 'background' ? '3px solid var(--forge-gold)' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 'bold'
              }}
            >
              Background / Layers
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('camera')}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: sidebarTab === 'camera' ? 'var(--forge-gold)' : 'transparent',
                color: sidebarTab === 'camera' ? 'var(--bg)' : 'var(--text)',
                border: 'none',
                borderBottom: sidebarTab === 'camera' ? '3px solid var(--forge-gold)' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 'bold'
              }}
            >
              Camera & Effects
            </button>
          </div>
          
          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
            {sidebarTab === 'background' ? (
              <>
                {/* Background Section */}
                <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: '1rem', margin: '0 0 0.75rem 0' }}>Background</h3>
            
            {/* Background Image */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem', fontWeight: 'bold' }}>Image:</div>
              {selectedShot.backgroundImage ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ flex: 1, fontSize: '0.75rem', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedShot.backgroundImage.split('/').pop()}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, { backgroundImage: undefined })
                      const updated = await window.indieForge.projects.open(projectId!)
                      setActiveProject(updated)
                    }}
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'var(--danger)', color: 'white' }}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const paths = await window.indieForge.dialog.openFile({ 
                      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
                      properties: ['openFile']
                    })
                    if (paths && paths.length > 0) {
                      // Pass absolute path; updateShot will copy it into studio storage
                      await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, { backgroundImage: paths[0] })
                      const updated = await window.indieForge.projects.open(projectId!)
                      setActiveProject(updated)
                    }
                  }}
                  style={{ width: '100%', fontSize: '0.85rem', padding: '0.4rem' }}
                >
                  + Import Image
                </button>
              )}
            </div>

            {/* Background Clip */}
            <div>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem', fontWeight: 'bold' }}>Clip:</div>
              <select
                value={selectedShot.backgroundClipId || ''}
                onChange={async (e) => {
                  const clipId = e.target.value || undefined
                  await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, { backgroundClipId: clipId })
                  const updated = await window.indieForge.projects.open(projectId!)
                  setActiveProject(updated)
                }}
                style={{
                  width: '100%',
                  padding: '0.4rem',
                  fontSize: '0.85rem',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text)'
                }}
              >
                <option value="">None</option>
                {clips.map(clip => (
                  <option key={clip.id} value={clip.id}>
                    {clip.moment || 'clip'} ({clip.durationSec}s)
                  </option>
                ))}
              </select>
              {selectedShot.backgroundImage && selectedShot.backgroundClipId && (
                <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                  Clip plays over static image
                </div>
              )}
            </div>
            
            {/* Stage Treatment (Phase C.1) */}
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <h4 style={{ fontSize: '0.85rem', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>Stage Treatment</h4>
              
              {/* BG Dim Slider */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                  BG Dim: {Math.round((selectedShot.stageTreatment?.bgDim ?? 0) * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={(selectedShot.stageTreatment?.bgDim ?? 0) * 100}
                  onChange={async (e) => {
                    const value = parseInt(e.target.value) / 100
                    await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, {
                      stageTreatment: {
                        ...selectedShot.stageTreatment,
                        bgDim: value
                      }
                    })
                    const updated = await window.indieForge.projects.open(projectId!)
                    setActiveProject(updated)
                  }}
                  style={{ width: '100%' }}
                />
              </div>
              
              {/* Vignette Slider */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                  Vignette: {Math.round((selectedShot.stageTreatment?.vignette ?? 0) * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={(selectedShot.stageTreatment?.vignette ?? 0) * 100}
                  onChange={async (e) => {
                    const value = parseInt(e.target.value) / 100
                    await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, {
                      stageTreatment: {
                        ...selectedShot.stageTreatment,
                        vignette: value
                      }
                    })
                    const updated = await window.indieForge.projects.open(projectId!)
                    setActiveProject(updated)
                  }}
                  style={{ width: '100%' }}
                />
              </div>
              
              {/* Clear Button */}
              {(selectedShot.stageTreatment?.bgDim || selectedShot.stageTreatment?.vignette) && (
                <button
                  onClick={async () => {
                    await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, {
                      stageTreatment: undefined
                    })
                    const updated = await window.indieForge.projects.open(projectId!)
                    setActiveProject(updated)
                  }}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                >
                  Clear Treatment
                </button>
              )}
            </div>
          </div>

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
              
              {/* Phase C.3a: Scale and Rotation numeric controls */}
              <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                    Scale: {selectedLayer.scale.toFixed(2)}x
                  </label>
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <input
                      type="range"
                      min="0.1"
                      max="5"
                      step="0.1"
                      value={selectedLayer.scale}
                      onChange={async (e) => {
                        const value = parseFloat(e.target.value)
                        await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, { scale: value })
                        const updated = await window.indieForge.projects.open(projectId!)
                        setActiveProject(updated)
                      }}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="number"
                      min="0.1"
                      max="5"
                      step="0.1"
                      value={selectedLayer.scale}
                      onChange={async (e) => {
                        const value = Math.max(0.1, Math.min(5, parseFloat(e.target.value) || 1))
                        await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, { scale: value })
                        const updated = await window.indieForge.projects.open(projectId!)
                        setActiveProject(updated)
                      }}
                      style={{ width: '60px', padding: '0.2rem', fontSize: '0.75rem' }}
                    />
                  </div>
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                    Rotation: {selectedLayer.rotation.toFixed(0)}°
                  </label>
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="1"
                      value={selectedLayer.rotation}
                      onChange={async (e) => {
                        const value = parseFloat(e.target.value)
                        await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, { rotation: value })
                        const updated = await window.indieForge.projects.open(projectId!)
                        setActiveProject(updated)
                      }}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="number"
                      min="0"
                      max="360"
                      step="1"
                      value={selectedLayer.rotation}
                      onChange={async (e) => {
                        const value = ((parseFloat(e.target.value) || 0) % 360 + 360) % 360
                        await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, { rotation: value })
                        const updated = await window.indieForge.projects.open(projectId!)
                        setActiveProject(updated)
                      }}
                      style={{ width: '60px', padding: '0.2rem', fontSize: '0.75rem' }}
                    />
                  </div>
                </div>
              </div>
              
              <button type="button" onClick={handleFlipLayer} style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                {selectedLayer.flipX ? 'Unflip' : 'Flip'} Horizontal
              </button>
              <button 
                type="button" 
                onClick={handleDeleteLayer} 
                style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.85rem', background: 'var(--error)', color: '#fff' }}
              >
                Delete Layer
              </button>
              
              {/* Layer Effects (Phase C.2) */}
              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h4 style={{ fontSize: '0.85rem', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>Effects</h4>
                
                {/* Drop Shadow */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Drop Shadow</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.7rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', marginBottom: '0.1rem' }}>Offset X</label>
                      <input
                        type="number"
                        value={selectedLayer.fx?.dropShadow?.offsetX ?? 0}
                        onChange={async (e) => {
                          const value = parseFloat(e.target.value) || 0
                          await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                            fx: {
                              ...selectedLayer.fx,
                              dropShadow: {
                                offsetX: value,
                                offsetY: selectedLayer.fx?.dropShadow?.offsetY ?? 6,
                                blur: selectedLayer.fx?.dropShadow?.blur ?? 10,
                                color: selectedLayer.fx?.dropShadow?.color ?? '#000000',
                                alpha: selectedLayer.fx?.dropShadow?.alpha ?? 0.5
                              }
                            }
                          })
                          const updated = await window.indieForge.projects.open(projectId!)
                          setActiveProject(updated)
                        }}
                        style={{ width: '100%', padding: '0.2rem', fontSize: '0.7rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', marginBottom: '0.1rem' }}>Offset Y</label>
                      <input
                        type="number"
                        value={selectedLayer.fx?.dropShadow?.offsetY ?? 0}
                        onChange={async (e) => {
                          const value = parseFloat(e.target.value) || 0
                          await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                            fx: {
                              ...selectedLayer.fx,
                              dropShadow: {
                                offsetX: selectedLayer.fx?.dropShadow?.offsetX ?? 4,
                                offsetY: value,
                                blur: selectedLayer.fx?.dropShadow?.blur ?? 10,
                                color: selectedLayer.fx?.dropShadow?.color ?? '#000000',
                                alpha: selectedLayer.fx?.dropShadow?.alpha ?? 0.5
                              }
                            }
                          })
                          const updated = await window.indieForge.projects.open(projectId!)
                          setActiveProject(updated)
                        }}
                        style={{ width: '100%', padding: '0.2rem', fontSize: '0.7rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', marginBottom: '0.1rem' }}>Blur</label>
                      <input
                        type="number"
                        value={selectedLayer.fx?.dropShadow?.blur ?? 0}
                        onChange={async (e) => {
                          const value = parseFloat(e.target.value) || 0
                          await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                            fx: {
                              ...selectedLayer.fx,
                              dropShadow: {
                                offsetX: selectedLayer.fx?.dropShadow?.offsetX ?? 4,
                                offsetY: selectedLayer.fx?.dropShadow?.offsetY ?? 6,
                                blur: value,
                                color: selectedLayer.fx?.dropShadow?.color ?? '#000000',
                                alpha: selectedLayer.fx?.dropShadow?.alpha ?? 0.5
                              }
                            }
                          })
                          const updated = await window.indieForge.projects.open(projectId!)
                          setActiveProject(updated)
                        }}
                        style={{ width: '100%', padding: '0.2rem', fontSize: '0.7rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', marginBottom: '0.1rem' }}>Alpha {Math.round((selectedLayer.fx?.dropShadow?.alpha ?? 0) * 100)}%</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={(selectedLayer.fx?.dropShadow?.alpha ?? 0) * 100}
                        onChange={async (e) => {
                          const value = parseInt(e.target.value) / 100
                          await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                            fx: {
                              ...selectedLayer.fx,
                              dropShadow: {
                                offsetX: selectedLayer.fx?.dropShadow?.offsetX ?? 4,
                                offsetY: selectedLayer.fx?.dropShadow?.offsetY ?? 6,
                                blur: selectedLayer.fx?.dropShadow?.blur ?? 10,
                                color: selectedLayer.fx?.dropShadow?.color ?? '#000000',
                                alpha: value
                              }
                            }
                          })
                          const updated = await window.indieForge.projects.open(projectId!)
                          setActiveProject(updated)
                        }}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Outer Glow */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Outer Glow</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.7rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', marginBottom: '0.1rem' }}>Blur</label>
                      <input
                        type="number"
                        value={selectedLayer.fx?.outerGlow?.blur ?? 0}
                        onChange={async (e) => {
                          const value = parseFloat(e.target.value) || 0
                          await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                            fx: {
                              ...selectedLayer.fx,
                              outerGlow: {
                                blur: value,
                                color: selectedLayer.fx?.outerGlow?.color ?? '#00ffff',
                                alpha: selectedLayer.fx?.outerGlow?.alpha ?? 0.8,
                                strength: selectedLayer.fx?.outerGlow?.strength ?? 1
                              }
                            }
                          })
                          const updated = await window.indieForge.projects.open(projectId!)
                          setActiveProject(updated)
                        }}
                        style={{ width: '100%', padding: '0.2rem', fontSize: '0.7rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', marginBottom: '0.1rem' }}>Alpha {Math.round((selectedLayer.fx?.outerGlow?.alpha ?? 0) * 100)}%</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={(selectedLayer.fx?.outerGlow?.alpha ?? 0) * 100}
                        onChange={async (e) => {
                          const value = parseInt(e.target.value) / 100
                          await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                            fx: {
                              ...selectedLayer.fx,
                              outerGlow: {
                                blur: selectedLayer.fx?.outerGlow?.blur ?? 12,
                                color: selectedLayer.fx?.outerGlow?.color ?? '#00ffff',
                                alpha: value,
                                strength: selectedLayer.fx?.outerGlow?.strength ?? 1
                              }
                            }
                          })
                          const updated = await window.indieForge.projects.open(projectId!)
                          setActiveProject(updated)
                        }}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: '0.65rem', marginBottom: '0.1rem' }}>Color</label>
                      <select
                        value={selectedLayer.fx?.outerGlow?.color ?? '#00ffff'}
                        onChange={async (e) => {
                          await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                            fx: {
                              ...selectedLayer.fx,
                              outerGlow: {
                                blur: selectedLayer.fx?.outerGlow?.blur ?? 12,
                                color: e.target.value,
                                alpha: selectedLayer.fx?.outerGlow?.alpha ?? 0.8,
                                strength: selectedLayer.fx?.outerGlow?.strength ?? 1
                              }
                            }
                          })
                          const updated = await window.indieForge.projects.open(projectId!)
                          setActiveProject(updated)
                        }}
                        style={{ width: '100%', padding: '0.2rem', fontSize: '0.7rem' }}
                      >
                        <option value="#00ffff">Cyan</option>
                        <option value="#ff00ff">Magenta</option>
                        <option value="#ffff00">Yellow</option>
                        <option value="#ffffff">White</option>
                        <option value="#ff0000">Red</option>
                        <option value="#00ff00">Green</option>
                        <option value="#0000ff">Blue</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                {/* Clear Effects */}
                {(selectedLayer.fx?.dropShadow || selectedLayer.fx?.outerGlow) && (
                  <button
                    onClick={async () => {
                      await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, { fx: undefined })
                      const updated = await window.indieForge.projects.open(projectId!)
                      setActiveProject(updated)
                    }}
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', width: '100%' }}
                  >
                    Clear Effects
                  </button>
                )}
              </div>
            </div>
          )}
              </>
            ) : (
              <>
                {/* Camera & Effects Tab Content */}
                <div>
                  {(editingCamera || editingEffect) ? (
                    <div style={{ 
                      padding: '1rem', 
                      background: 'var(--bg)', 
                      borderRadius: '8px',
                      border: editingCamera ? '2px solid #00AAFF' : '2px solid #FF6B6B'
                    }}>
                      {editingCamera && selectedCameraIndex !== null && selectedShot.cameraTrack[selectedCameraIndex] ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                            <h4 style={{ margin: 0, color: '#00AAFF', fontSize: '0.9rem' }}>
                              📷 Camera Key @ {selectedShot.cameraTrack[selectedCameraIndex].t.toFixed(2)}s
                            </h4>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCamera(false)
                                setSelectedCameraIndex(null)
                              }}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              Close
                            </button>
                          </div>
                          <CameraInspector
                            keyframe={selectedShot.cameraTrack[selectedCameraIndex]}
                            layers={selectedShot.layers}
                            onSave={(updated) => handleUpdateCameraKeyframe(selectedCameraIndex, updated)}
                            onClose={() => {
                              setEditingCamera(false)
                              setSelectedCameraIndex(null)
                            }}
                            onDelete={() => handleDeleteCameraKeyframe(selectedCameraIndex)}
                          />
                        </>
                      ) : editingEffect && selectedEffectIndex !== null && selectedShot.effectsTrack[selectedEffectIndex] ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                            <h4 style={{ margin: 0, color: '#FF6B6B', fontSize: '0.9rem' }}>
                              ⚡ Effect @ {selectedShot.effectsTrack[selectedEffectIndex].t.toFixed(2)}s
                            </h4>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEffect(false)
                                setSelectedEffectIndex(null)
                              }}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              Close
                            </button>
                          </div>
                          <EffectInspector
                            effect={selectedShot.effectsTrack[selectedEffectIndex]}
                            presets={presets}
                            onSave={(updated) => handleUpdateEffectMarker(selectedEffectIndex, updated)}
                            onClose={() => {
                              setEditingEffect(false)
                              setSelectedEffectIndex(null)
                            }}
                            onDelete={() => handleDeleteMarker('effect', selectedEffectIndex)}
                          />
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
                      Select a camera or effect marker on the timeline to edit
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
