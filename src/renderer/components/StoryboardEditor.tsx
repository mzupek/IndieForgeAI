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
  ShotClipBlock,
  ShotAudioBlock,
  AudioAsset,
  ScenePreset,
  ScenePresetType,
  VisualAsset,
  AssetState,
  Font,
  Palette,
  AssetPipelineProject,
  EventDefinition,
  EventBinding,
  LayerTimedKey
} from '@shared/types/assetPipeline'
import { ConfirmModal } from './ConfirmModal'
import { EventBindingsPanel } from './EventBindingsPanel'
import {
  EMPTY_PREVIEW_SNAPSHOT,
  EventPreviewEngine,
  type EventPreviewSnapshot,
  type PrimitivePayload
} from '@shared/storyboard/eventPreview'
import {
  applyEffectiveLayer,
  flattenShotTimedKeys,
  sampleLayerTimedKeys,
  timedKeyIssues
} from '@shared/storyboard/timedKeys'
import {
  getLayerKind,
  resolveLayerImagePath,
  resolveTextStyle,
  DEFAULT_FONT_REF,
  DEFAULT_PALETTE_REF
} from '@shared/storyboard/layerValidation'
import { resolveShotBackgroundImagePath } from '@shared/storyboard/shotBackground'
import { ShotBackgroundPicker } from './ShotBackgroundPicker'
import {
  describeLayerLabel,
  getLayerPixelSize,
  hitTestLayer,
  planLayerDraw,
  resolveLayerSourceSize,
  SOURCE_FIT_SCALE,
  TEXT_BASE_PX
} from '@shared/storyboard/layerRender'
import {
  clipBlockEnd,
  clipBlockIssues,
  clipsForGame,
  defaultSourceWindow,
  isSupportedClipMedia,
  resolveEffectiveClipBlocks,
  sampleBackgroundClip,
  sampleLayerClip,
  unsupportedClipMediaMessage
} from '@shared/storyboard/clipBlocks'
import {
  audioBlockEnd,
  audioBlockIssues,
  defaultLoopForAudioKind,
  remainingShotTime
} from '@shared/storyboard/audioBlocks'
import { isSupportedAudioMedia, unsupportedAudioMediaMessage } from '@shared/storyboard/audioValidation'
import {
  applyAudioPlayback,
  disposeAudioVoices,
  evaluateAudioPlayback,
  silenceAudioVoices,
  type AudioVoice
} from '@shared/storyboard/audioPlayback'
import {
  applyEventSfxPlayback,
  cancelEventSfxVoices,
  disposeEventSfxVoices,
  markEventSfxEnded,
  type EventSfxVoice
} from '@shared/storyboard/eventSfxPlayback'
import {
  endPointerCaptureNow,
  isDragPastThreshold,
  releasePointerCaptureIfHeld,
  type PointerSessionEvent
} from '@shared/storyboard/pointerCapture'
import { hitTestTimeline } from '@shared/storyboard/timelinePointer'

type EditorMode = 'layout' | 'camera'
type DragMode = 'move' | 'scale' | 'rotate' | 'framingRect' | 'cameraMarker' | 'effectMarker' | null

interface LoadedImage {
  element: HTMLImageElement
  url: string
  width: number
  height: number
}

type ClipVideoStatus = 'loading' | 'ready' | 'error' | 'unsupported' | 'missing'

interface LoadedVideo {
  element: HTMLVideoElement
  url: string
  clipId: string
  status: ClipVideoStatus
  message?: string
  durationSec?: number
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
                z{layer.zOrder} - {layer.visualAssetId ? 'Asset' : layer.text != null && layer.text !== '' ? 'Text' : layer.characterId ? 'Character' : layer.clipId ? 'Clip' : 'Image'}
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
          🗑️ Delete
        </button>
      </div>
    </div>
  )
}

function EffectInspector({
  effect,
  presets,
  onSave,
  onClose,
  onDelete
}: {
  effect: EffectMarker
  presets: ScenePreset[]
  onSave: (params: Record<string, unknown>) => void
  onClose: () => void
  onDelete: () => void
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
      
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button type="button" onClick={onClose} style={{ flex: 1 }}>
          Close
        </button>
        <button 
          type="button" 
          onClick={onDelete} 
          style={{ flex: 1, background: 'var(--danger)', color: 'white' }}
        >
          🗑️ Delete
        </button>
      </div>
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
  const [draggedMarker, setDraggedMarker] = useState<{
    type: 'camera' | 'effect' | 'timedKey' | 'clipBlock' | 'audioBlock'
    index: number
    layerId?: string
    keyId?: string
    blockId?: string
    clipDrag?: 'move' | 'trimIn' | 'trimOut'
    grabOffsetSec?: number
  } | null>(null)
  
  const [loadedImages, setLoadedImages] = useState<Map<string, LoadedImage>>(new Map())
  const [backgroundImage, setBackgroundImage] = useState<LoadedImage | null>(null)
  const [showAddCharacter, setShowAddCharacter] = useState(false)
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [showAddText, setShowAddText] = useState(false)
  const [addAssetId, setAddAssetId] = useState('')
  const [addAssetStateId, setAddAssetStateId] = useState('')
  const [addTextContent, setAddTextContent] = useState('New text')
  const [addTextFont, setAddTextFont] = useState(DEFAULT_FONT_REF)
  const [addTextPalette, setAddTextPalette] = useState(DEFAULT_PALETTE_REF)
  const [layerError, setLayerError] = useState<string | null>(null)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)
  const [confirmDeleteLayer, setConfirmDeleteLayer] = useState(false)
  const [selectedTimedKeyId, setSelectedTimedKeyId] = useState<string | null>(null)
  const [confirmDeleteTimedKeyId, setConfirmDeleteTimedKeyId] = useState<string | null>(null)
  const [timedKeyTimeDraft, setTimedKeyTimeDraft] = useState('')
  const [selectedClipBlockId, setSelectedClipBlockId] = useState<string | null>(null)
  const [showAddClip, setShowAddClip] = useState(false)
  const [addClipId, setAddClipId] = useState('')
  const [addClipRole, setAddClipRole] = useState<'layer' | 'background'>('layer')
  const [addClipSourceIn, setAddClipSourceIn] = useState('0')
  const [addClipSourceOut, setAddClipSourceOut] = useState('')
  const [confirmDeleteClipBlockId, setConfirmDeleteClipBlockId] = useState<string | null>(null)
  const [pendingExtend, setPendingExtend] = useState<{
    message: string
    run: () => Promise<void>
  } | null>(null)
  const [clipTimeDraft, setClipTimeDraft] = useState('')
  const [clipInDraft, setClipInDraft] = useState('')
  const [clipOutDraft, setClipOutDraft] = useState('')
  const [selectedAudioBlockId, setSelectedAudioBlockId] = useState<string | null>(null)
  const [showAddAudio, setShowAddAudio] = useState(false)
  const [addAudioId, setAddAudioId] = useState('')
  const [addAudioLoop, setAddAudioLoop] = useState(false)
  const [addAudioSourceIn, setAddAudioSourceIn] = useState('0')
  const [addAudioSourceOut, setAddAudioSourceOut] = useState('')
  const [addAudioDuration, setAddAudioDuration] = useState('')
  const [addAudioVolume, setAddAudioVolume] = useState('1')
  const [addAudioFadeIn, setAddAudioFadeIn] = useState('0')
  const [addAudioFadeOut, setAddAudioFadeOut] = useState('0')
  const [confirmDeleteAudioBlockId, setConfirmDeleteAudioBlockId] = useState<string | null>(null)
  const [audioTimeDraft, setAudioTimeDraft] = useState('')
  const [audioInDraft, setAudioInDraft] = useState('')
  const [audioOutDraft, setAudioOutDraft] = useState('')
  const [audioDurationDraft, setAudioDurationDraft] = useState('')
  const [audioVolumeDraft, setAudioVolumeDraft] = useState('1')
  const [audioFadeInDraft, setAudioFadeInDraft] = useState('0')
  const [audioFadeOutDraft, setAudioFadeOutDraft] = useState('0')
  const [audioLoopDraft, setAudioLoopDraft] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [shotDurationDraft, setShotDurationDraft] = useState('')
  const [shotDurationError, setShotDurationError] = useState<string | null>(null)
  const audioVoicesRef = useRef<Map<string, AudioVoice>>(new Map())
  const eventSfxVoicesRef = useRef<Map<string, EventSfxVoice>>(new Map())
  const capturedPointerRef = useRef<{ target: Element; pointerId: number } | null>(null)
  const lastPlaybackTimeRef = useRef(0)
  const [audioEpoch, setAudioEpoch] = useState(0)
  const [eventSfxEpoch, setEventSfxEpoch] = useState(0)
  const [eventSfxError, setEventSfxError] = useState<string | null>(null)
  const videosRef = useRef<Map<string, LoadedVideo>>(new Map())
  const [videoEpoch, setVideoEpoch] = useState(0)
  const [previewSnapshot, setPreviewSnapshot] = useState<EventPreviewSnapshot>(EMPTY_PREVIEW_SNAPSHOT)
  const previewEngineRef = useRef(new EventPreviewEngine())
  const wasPlayingRef = useRef(false)
  const previewTickRafRef = useRef<number | null>(null)
  const [libraryAssets, setLibraryAssets] = useState<VisualAsset[]>([])
  const [libraryStates, setLibraryStates] = useState<AssetState[]>([])
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
  const selectedShotIdRef = useRef(selectedShotId)
  const gameIdRef = useRef(gameId)
  selectedShotIdRef.current = selectedShotId
  gameIdRef.current = gameId

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
  const visualAssets = activeProject?.assetPipeline?.visualAssets?.filter(a => a.gameId === gameId) ?? []
  const assetStates = activeProject?.assetPipeline?.assetStates ?? []
  const fonts = (activeProject?.assetPipeline?.fonts ?? []).filter((f: Font) => f.gameId === gameId)
  const palettes = (activeProject?.assetPipeline?.palettes ?? []).filter((p: Palette) => p.gameId === gameId)
  const pipeline = activeProject?.assetPipeline as AssetPipelineProject | undefined
  const gameClips = pipeline ? clipsForGame(pipeline, gameId) : clips
  const audioAssets: AudioAsset[] =
    pipeline?.audioAssets?.filter((a) => a.gameId === gameId) ?? []
  const eventDefinitions: EventDefinition[] =
    pipeline?.eventDefinitions?.filter((e) => e.gameId === gameId) ?? []
  const eventBindings: EventBinding[] =
    pipeline?.eventBindings?.filter((b) => b.shotId === selectedShotId) ?? []

  const previewLayer = (layer: StoryboardLayer): StoryboardLayer =>
    applyEffectiveLayer(layer, playbackTime, previewSnapshot.overrides[layer.id])

  const layerMediaSignature = (selectedShot?.layers || [])
    .map((raw) => {
      const layer = applyEffectiveLayer(raw, playbackTime, previewSnapshot.overrides[raw.id])
      return `${layer.id}:${layer.poseId ?? ''}:${layer.assetStateId ?? ''}:${layer.visible !== false}`
    })
    .join('|')

  const timedKeyRows = selectedShot ? flattenShotTimedKeys(selectedShot) : []
  const selectedTimedKeyRow = timedKeyRows.find((row) => row.key.id === selectedTimedKeyId)
  const clipBlocks = selectedShot ? resolveEffectiveClipBlocks(selectedShot, clips) : []
  const selectedClipBlock = clipBlocks.find((b) => b.id === selectedClipBlockId)
  const audioBlocks = selectedShot?.audioTrack || []
  const selectedAudioBlock = audioBlocks.find((b) => b.id === selectedAudioBlockId)

  const timedKeyActionLabel = (key: LayerTimedKey): string => {
    if (key.action.type === 'setPose') {
      const poseId = key.action.poseId
      const pose = poses.find((p) => p.id === poseId)
      return pose ? `pose ${pose.slot}` : `missing pose ${poseId}`
    }
    const stateId = key.action.stateId
    const state = assetStates.find((s) => s.id === stateId)
    return state ? `state ${state.name}` : `missing state ${stateId}`
  }

  const commitPreview = () => {
    setPreviewSnapshot(previewEngineRef.current.snapshot())
  }

  const resetEventPreview = () => {
    previewEngineRef.current.reset()
    cancelEventSfxVoices(eventSfxVoicesRef.current)
    commitPreview()
    setEventSfxEpoch((n) => n + 1)
  }
  
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

  // Load background image (Library full-res path or legacy/direct-import path)
  useEffect(() => {
    let cancelled = false
    if (!selectedShot) {
      setBackgroundImage(null)
      return
    }

    const resolved = pipeline
      ? resolveShotBackgroundImagePath(selectedShot, pipeline)
      : selectedShot.backgroundImage
        ? { path: selectedShot.backgroundImage }
        : {}

    if (resolved.error) {
      setBackgroundError(resolved.error)
    } else {
      setBackgroundError(null)
    }

    if (!resolved.path) {
      setBackgroundImage(null)
      return
    }

    const path = resolved.path
    const loadBg = async () => {
      try {
        const { localUrl } = await window.indieForge.files.getLocalUrl(path)
        if (cancelled) return
        const img = new Image()
        img.onload = () => {
          if (cancelled) return
          setBackgroundImage({ element: img, url: localUrl, width: img.width, height: img.height })
        }
        img.onerror = () => {
          if (cancelled) return
          console.error('Failed to load background image:', path)
          setBackgroundImage(null)
          setBackgroundError('Failed to load background image')
        }
        img.src = localUrl
      } catch (err) {
        if (cancelled) return
        console.error('Error loading background image:', err)
        setBackgroundImage(null)
        setBackgroundError(err instanceof Error ? err.message : 'Failed to load background image')
      }
    }
    void loadBg()
    return () => {
      cancelled = true
    }
  }, [
    selectedShot?.id,
    selectedShot?.backgroundImage,
    selectedShot?.backgroundVisualAssetId,
    selectedShot?.backgroundAssetStateId,
    pipeline,
    gameId
  ])

  // Keep preview engine catalog in sync; never persist preview holds
  useEffect(() => {
    const engine = previewEngineRef.current
    engine.setCatalog(pipeline?.eventDefinitions || [], pipeline?.eventBindings || [])
  }, [pipeline?.eventDefinitions, pipeline?.eventBindings])

  useEffect(() => {
    const engine = previewEngineRef.current
    engine.setShot(selectedShotId ?? null)
    commitPreview()
    setPlaybackTime(0)
    setSelectedTimedKeyId(null)
    setConfirmDeleteTimedKeyId(null)
    setSelectedClipBlockId(null)
    setConfirmDeleteClipBlockId(null)
    setShowAddClip(false)
    setPendingExtend(null)
  }, [selectedShotId])

  useEffect(() => {
    if (selectedTimedKeyRow) setTimedKeyTimeDraft(selectedTimedKeyRow.key.t.toFixed(2))
  }, [selectedTimedKeyId, selectedTimedKeyRow?.key.t])

  useEffect(() => {
    if (!selectedClipBlock) return
    setClipTimeDraft(selectedClipBlock.t.toFixed(2))
    setClipInDraft(selectedClipBlock.sourceInSec.toFixed(2))
    setClipOutDraft(selectedClipBlock.sourceOutSec.toFixed(2))
  }, [
    selectedClipBlockId,
    selectedClipBlock?.t,
    selectedClipBlock?.sourceInSec,
    selectedClipBlock?.sourceOutSec
  ])

  useEffect(() => {
    if (!selectedAudioBlock) return
    setAudioTimeDraft(selectedAudioBlock.t.toFixed(2))
    setAudioInDraft(selectedAudioBlock.sourceInSec.toFixed(2))
    setAudioOutDraft(selectedAudioBlock.sourceOutSec.toFixed(2))
    setAudioDurationDraft(selectedAudioBlock.durationSec.toFixed(2))
    setAudioVolumeDraft(String(selectedAudioBlock.volume))
    setAudioFadeInDraft(String(selectedAudioBlock.fadeInSec))
    setAudioFadeOutDraft(String(selectedAudioBlock.fadeOutSec))
    setAudioLoopDraft(!!selectedAudioBlock.loop)
  }, [
    selectedAudioBlockId,
    selectedAudioBlock?.t,
    selectedAudioBlock?.sourceInSec,
    selectedAudioBlock?.sourceOutSec,
    selectedAudioBlock?.durationSec,
    selectedAudioBlock?.volume,
    selectedAudioBlock?.fadeInSec,
    selectedAudioBlock?.fadeOutSec,
    selectedAudioBlock?.loop
  ])

  useEffect(() => {
    if (!selectedShot) return
    setShotDurationDraft(String(selectedShot.durationSec))
    setShotDurationError(null)
  }, [selectedShotId, selectedShot?.durationSec])

  // Load clip videos via forge-file:// (never base64, never local-file://)
  useEffect(() => {
    if (!selectedShot) return
    let cancelled = false
    const needed = new Set(clipBlocks.map((b) => b.clipId))
    const loadVideos = async () => {
      for (const clipId of needed) {
        if (cancelled) return
        const existing = videosRef.current.get(clipId)
        if (existing && (existing.status === 'ready' || existing.status === 'loading')) continue
        const clip = clips.find((c) => c.id === clipId)
        if (!clip) {
          videosRef.current.set(clipId, {
            element: document.createElement('video'),
            url: '',
            clipId,
            status: 'missing',
            message: `Clip not found: ${clipId}`
          })
          continue
        }
        if (!clip.file) {
          videosRef.current.set(clipId, {
            element: document.createElement('video'),
            url: '',
            clipId,
            status: 'missing',
            message: `Clip '${clip.moment}' has no media file`
          })
          continue
        }
        if (!isSupportedClipMedia(clip.file)) {
          videosRef.current.set(clipId, {
            element: document.createElement('video'),
            url: '',
            clipId,
            status: 'unsupported',
            message: unsupportedClipMediaMessage(clip.file)
          })
          continue
        }
        try {
          const { localUrl } = await window.indieForge.files.getLocalUrl(clip.file)
          if (cancelled) return
          if (!localUrl || localUrl.startsWith('local-file:')) {
            videosRef.current.set(clipId, {
              element: document.createElement('video'),
              url: localUrl || '',
              clipId,
              status: 'error',
              message: 'Clip URL is not forge-file://; local-file:// is not supported'
            })
            continue
          }
          const video = document.createElement('video')
          video.muted = true
          video.preload = 'auto'
          video.playsInline = true
          const entry: LoadedVideo = {
            element: video,
            url: localUrl,
            clipId,
            status: 'loading'
          }
          video.addEventListener('loadedmetadata', () => {
            entry.status = 'ready'
            entry.durationSec = Number.isFinite(video.duration) ? video.duration : clip.durationSec
            setVideoEpoch((n) => n + 1)
          })
          video.addEventListener('seeked', () => setVideoEpoch((n) => n + 1))
          video.addEventListener('error', () => {
            entry.status = 'error'
            entry.message = 'Video failed to load (missing file, codec, or host decode)'
            setVideoEpoch((n) => n + 1)
          })
          videosRef.current.set(clipId, entry)
          video.src = localUrl
        } catch (err) {
          videosRef.current.set(clipId, {
            element: document.createElement('video'),
            url: '',
            clipId,
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to resolve clip URL'
          })
        }
      }
      if (!cancelled) setVideoEpoch((n) => n + 1)
    }
    void loadVideos()
    return () => {
      cancelled = true
    }
  }, [selectedShot?.id, selectedShot?.clipTrack, selectedShot?.backgroundClipId, selectedShot?.layers, clips])

  // Drive video.currentTime from the playhead (paused); supports reverse scrub.
  useEffect(() => {
    if (!selectedShot) return
      const bg = sampleBackgroundClip(selectedShot, clips, playbackTime)
      for (const layer of selectedShot.layers) {
      const sample = sampleLayerClip(selectedShot, clips, layer.id, playbackTime)
      if (sample) {
        const entry = videosRef.current.get(sample.clipId)
        if (entry?.status === 'ready') {
          const v = entry.element
          if (Math.abs(v.currentTime - sample.sourceTimeSec) > 0.03) {
            try {
              v.currentTime = sample.sourceTimeSec
            } catch {
              /* seek may throw before ready */
            }
          }
        }
      }
    }
    if (bg) {
      const entry = videosRef.current.get(bg.clipId)
      if (entry?.status === 'ready') {
        const v = entry.element
        if (Math.abs(v.currentTime - bg.sourceTimeSec) > 0.03) {
          try {
            v.currentTime = bg.sourceTimeSec
          } catch {
            /* ignore */
          }
        }
      }
    }
  }, [playbackTime, selectedShot, clips, videoEpoch])

  // A2: HTMLAudioElement.play()/pause() synced to master transport (not paused seeks).
  useEffect(() => {
    if (!selectedShot) {
      silenceAudioVoices(audioVoicesRef.current)
      return
    }
    const needed = new Set(audioBlocks.map((b) => b.id))
    for (const [id, voice] of audioVoicesRef.current) {
      if (!needed.has(id)) {
        voice.playGeneration += 1
        voice.element.volume = 0
        if (!voice.element.paused) voice.element.pause()
        try {
          voice.element.src = ''
        } catch {
          /* ignore */
        }
        audioVoicesRef.current.delete(id)
      }
    }
    let cancelled = false
    const load = async () => {
      for (const block of audioBlocks) {
        if (cancelled) return
        const existing = audioVoicesRef.current.get(block.id)
        if (existing && (existing.status === 'ready' || existing.status === 'loading') && existing.audioId === block.audioId) {
          continue
        }
        const asset = (pipeline?.audioAssets || []).find((a) => a.id === block.audioId)
        if (!asset) {
          audioVoicesRef.current.set(block.id, {
            blockId: block.id,
            audioId: block.audioId,
            element: document.createElement('audio'),
            url: '',
            status: 'missing',
            message: `Audio not found: ${block.audioId}`,
            playGeneration: 0
          })
          continue
        }
        if (!asset.file) {
          audioVoicesRef.current.set(block.id, {
            blockId: block.id,
            audioId: block.audioId,
            element: document.createElement('audio'),
            url: '',
            status: 'missing',
            message: `Audio '${asset.name}' has no media file`,
            playGeneration: 0
          })
          continue
        }
        if (!isSupportedAudioMedia(asset.file)) {
          audioVoicesRef.current.set(block.id, {
            blockId: block.id,
            audioId: block.audioId,
            element: document.createElement('audio'),
            url: '',
            status: 'unsupported',
            message: unsupportedAudioMediaMessage(asset.file),
            playGeneration: 0
          })
          continue
        }
        try {
          const { localUrl } = await window.indieForge.files.getLocalUrl(asset.file)
          if (cancelled) return
          if (!localUrl || localUrl.startsWith('local-file:')) {
            audioVoicesRef.current.set(block.id, {
              blockId: block.id,
              audioId: block.audioId,
              element: document.createElement('audio'),
              url: localUrl || '',
              status: 'error',
              message: 'Audio URL is not forge-file://; local-file:// is not supported',
              playGeneration: 0
            })
            continue
          }
          const el = document.createElement('audio')
          el.preload = 'auto'
          const entry: AudioVoice = {
            blockId: block.id,
            audioId: block.audioId,
            element: el,
            url: localUrl,
            status: 'loading',
            playGeneration: 0
          }
          el.addEventListener('loadedmetadata', () => {
            entry.status = 'ready'
            setAudioEpoch((n) => n + 1)
          })
          el.addEventListener('error', () => {
            entry.status = 'error'
            entry.message = 'Audio failed to load (missing file, codec, or host decode)'
            setAudioEpoch((n) => n + 1)
          })
          audioVoicesRef.current.set(block.id, entry)
          el.src = localUrl
        } catch (err) {
          audioVoicesRef.current.set(block.id, {
            blockId: block.id,
            audioId: block.audioId,
            element: document.createElement('audio'),
            url: '',
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to resolve audio URL',
            playGeneration: 0
          })
        }
      }
      if (!cancelled) setAudioEpoch((n) => n + 1)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedShot?.id, selectedShot?.audioTrack, pipeline?.audioAssets])

  useEffect(() => {
    if (!selectedShot) return
    const commands = evaluateAudioPlayback(selectedShot, playbackTime, {
      transport: playbackState,
      previousTimeSec: lastPlaybackTimeRef.current,
      scrubbing: dragMode === ('playhead' as any)
    })
    applyAudioPlayback(commands, audioVoicesRef.current, {
      onPlayRejected: (_blockId, err) => {
        setAudioError(err instanceof Error ? err.message : 'Audio play() was rejected')
        setAudioEpoch((n) => n + 1)
      }
    })
    lastPlaybackTimeRef.current = playbackTime
  }, [playbackTime, playbackState, selectedShot, audioEpoch, dragMode])

  const playSfxBindings = eventBindings.filter((b) => b.action.type === 'playSfx')

  useEffect(() => {
    const needed = new Set(playSfxBindings.map((b) => b.id))
    for (const [id, voice] of eventSfxVoicesRef.current) {
      if (!needed.has(id)) {
        voice.playGeneration += 1
        if (!voice.element.paused) voice.element.pause()
        try {
          voice.element.src = ''
        } catch {
          /* ignore */
        }
        eventSfxVoicesRef.current.delete(id)
      }
    }
    let cancelled = false
    const load = async () => {
      for (const binding of playSfxBindings) {
        if (cancelled) return
        if (binding.action.type !== 'playSfx') continue
        const existing = eventSfxVoicesRef.current.get(binding.id)
        if (
          existing &&
          (existing.status === 'ready' || existing.status === 'loading') &&
          existing.audioId === binding.action.audioId
        ) {
          continue
        }
        if (existing) {
          existing.playGeneration += 1
          if (!existing.element.paused) existing.element.pause()
          try {
            existing.element.src = ''
          } catch {
            /* ignore */
          }
        }
        const asset = (pipeline?.audioAssets || []).find((a) => a.id === binding.action.audioId)
        const makeStub = (status: EventSfxVoice['status'], message: string): EventSfxVoice => ({
          bindingId: binding.id,
          audioId: binding.action.type === 'playSfx' ? binding.action.audioId : '',
          element: document.createElement('audio'),
          url: '',
          status,
          message,
          playGeneration: 0,
          appliedGeneration: 0,
          completedGeneration: -1
        })
        if (!asset) {
          eventSfxVoicesRef.current.set(binding.id, makeStub('missing', `Audio not found: ${binding.action.audioId}`))
          continue
        }
        if (!asset.file) {
          eventSfxVoicesRef.current.set(binding.id, makeStub('missing', `Audio '${asset.name}' has no media file`))
          continue
        }
        if (!isSupportedAudioMedia(asset.file)) {
          eventSfxVoicesRef.current.set(
            binding.id,
            makeStub('unsupported', unsupportedAudioMediaMessage(asset.file))
          )
          continue
        }
        try {
          const { localUrl } = await window.indieForge.files.getLocalUrl(asset.file)
          if (cancelled) return
          if (!localUrl || localUrl.startsWith('local-file:')) {
            eventSfxVoicesRef.current.set(
              binding.id,
              makeStub('error', 'Audio URL is not forge-file://; local-file:// is not supported')
            )
            continue
          }
          const el = document.createElement('audio')
          el.preload = 'auto'
          el.loop = false
          const entry: EventSfxVoice = {
            bindingId: binding.id,
            audioId: binding.action.audioId,
            element: el,
            url: localUrl,
            status: 'loading',
            playGeneration: 0,
            appliedGeneration: 0,
            completedGeneration: -1
          }
          el.addEventListener('loadedmetadata', () => {
            entry.status = 'ready'
            setEventSfxEpoch((n) => n + 1)
          })
          el.addEventListener('error', () => {
            entry.status = 'error'
            entry.message = 'Audio failed to load (missing file, codec, or host decode)'
            setEventSfxEpoch((n) => n + 1)
          })
          el.addEventListener('ended', () => {
            markEventSfxEnded(entry)
            setEventSfxEpoch((n) => n + 1)
          })
          eventSfxVoicesRef.current.set(binding.id, entry)
          el.src = localUrl
        } catch (err) {
          eventSfxVoicesRef.current.set(
            binding.id,
            makeStub('error', err instanceof Error ? err.message : 'Failed to resolve audio URL')
          )
        }
      }
      if (!cancelled) setEventSfxEpoch((n) => n + 1)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedShotId, pipeline?.audioAssets, pipeline?.eventBindings])

  useEffect(() => {
    applyEventSfxPlayback(previewSnapshot, eventSfxVoicesRef.current, {
      onPlayRejected: (_id, err) => {
        setEventSfxError(err instanceof Error ? err.message : 'Event SFX play() was rejected')
        setEventSfxEpoch((n) => n + 1)
      }
    })
  }, [previewSnapshot.generation, previewSnapshot.sfx, eventSfxEpoch])

  useEffect(() => {
    silenceAudioVoices(audioVoicesRef.current)
    cancelEventSfxVoices(eventSfxVoicesRef.current)
    lastPlaybackTimeRef.current = 0
    setEventSfxEpoch((n) => n + 1)
  }, [selectedShotId])

  useEffect(() => {
    return () => {
      disposeAudioVoices(audioVoicesRef.current)
      disposeEventSfxVoices(eventSfxVoicesRef.current)
      const held = capturedPointerRef.current
      capturedPointerRef.current = null
      if (held) releasePointerCaptureIfHeld(held.target, held.pointerId)
    }
  }, [])

  useEffect(() => {
    if (playbackState === 'stopped' && wasPlayingRef.current) {
      resetEventPreview()
    }
    wasPlayingRef.current = playbackState === 'playing'
  }, [playbackState])

  useEffect(() => {
    const engine = previewEngineRef.current
    if (!engine.hasPendingTimers()) return
    const tick = (now: number) => {
      if (engine.tick(now)) {
        commitPreview()
      }
      if (engine.hasPendingTimers()) {
        previewTickRafRef.current = requestAnimationFrame(tick)
      } else {
        previewTickRafRef.current = null
      }
    }
    previewTickRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (previewTickRafRef.current !== null) {
        cancelAnimationFrame(previewTickRafRef.current)
        previewTickRafRef.current = null
      }
    }
  }, [previewSnapshot.generation, previewSnapshot.holds.length, previewSnapshot.sfx.length])

  // Load images from effective pose/state (event hold → timed sample → authored).
  // Depend on media signature, not raw playbackTime, so scrubbing a hold does not reload every frame.
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
      const pipe = activeProject?.assetPipeline
      
      for (const raw of selectedShot.layers) {
        const layer = previewLayer(raw)
        if (layer.visible === false) continue
        let path: string | undefined
        if (pipe && (layer.visualAssetId || layer.poseId || layer.clipId || layer.imagePath)) {
          const resolved = resolveLayerImagePath(layer, pipe)
          path = resolved.path
        } else if (layer.poseId) {
          path = poses.find(p => p.id === layer.poseId)?.file
        } else if (layer.clipId) {
          path = clips.find(c => c.id === layer.clipId)?.thumbnail
        }
        if (path) {
          const loaded = await loadImage(path)
          if (loaded) newImages.set(layer.id, loaded)
        }
      }
      
      setLoadedImages(newImages)
    }

    loadAllImages()
  }, [selectedShot, poses, clips, activeProject?.assetPipeline, previewSnapshot, layerMediaSignature])

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

    // Apply shake effect BEFORE drawing (affects entire canvas)
    ctx.save()
    const activeEffects = getActiveEffects(playbackTime)
    const shakeEffect = activeEffects.find(e => e.type === 'shake')
    if (shakeEffect) {
      const intensity = (shakeEffect.params.intensity as number) || 10
      // Use progress for fade-out: shake strongest at start, fades as progress → 1
      const shakeAmount = intensity * (1 - shakeEffect.progress)
      const shakeX = (Math.random() - 0.5) * shakeAmount
      const shakeY = (Math.random() - 0.5) * shakeAmount
      ctx.translate(shakeX, shakeY)
    }

    const drawCoverMedia = (
      media: CanvasImageSource,
      mediaW: number,
      mediaH: number
    ) => {
      if (!mediaW || !mediaH) return
      const mediaAspect = mediaW / mediaH
      const canvasAspect = canvas.width / canvas.height
      let drawWidth, drawHeight, drawX, drawY
      if (mediaAspect > canvasAspect) {
        drawHeight = canvas.height
        drawWidth = drawHeight * mediaAspect
        drawX = (canvas.width - drawWidth) / 2
        drawY = 0
      } else {
        drawWidth = canvas.width
        drawHeight = drawWidth / mediaAspect
        drawX = 0
        drawY = (canvas.height - drawHeight) / 2
      }
      ctx.drawImage(media, drawX, drawY, drawWidth, drawHeight)
      return { drawX, drawY, drawWidth, drawHeight }
    }

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

    // Background clip overlay: only while the block is active (half-open). Not freeze-last-frame.
    const bgClipSample = sampleBackgroundClip(selectedShot, clips, playbackTime)
    if (bgClipSample) {
      const entry = videosRef.current.get(bgClipSample.clipId)
      if (entry?.status === 'ready' && entry.element.readyState >= 2 && entry.element.videoWidth) {
        drawCoverMedia(entry.element, entry.element.videoWidth, entry.element.videoHeight)
      } else if (entry?.status === 'loading') {
        ctx.fillStyle = 'rgba(0, 40, 70, 0.45)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#9ad'
        ctx.font = '16px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Loading background clip…', canvas.width / 2, canvas.height / 2)
      } else if (entry && entry.status !== 'ready') {
        ctx.fillStyle = 'rgba(80, 16, 16, 0.55)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#ffb4b4'
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(entry.message || 'Background clip unavailable', canvas.width / 2, canvas.height / 2)
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

    // Draw layers (preview overlays pose/state/visibility/text; authored defaults unchanged)
    const sortedLayers = [...selectedShot.layers].map(previewLayer).sort((a, b) => a.zOrder - b.zOrder)
    
    for (const layer of sortedLayers) {
      if (layer.visible === false) continue

      const img = loadedImages.get(layer.id)
      const clipSample = sampleLayerClip(selectedShot, clips, layer.id, playbackTime)
      const clipVideo = clipSample ? videosRef.current.get(clipSample.clipId) : undefined
      const videoReady =
        clipVideo?.status === 'ready' &&
        clipVideo.element.readyState >= 2 &&
        clipVideo.element.videoWidth > 0
      const naturalSize = img
        ? { width: img.width, height: img.height }
        : videoReady && clipVideo
          ? { width: clipVideo.element.videoWidth, height: clipVideo.element.videoHeight }
          : pipeline
            ? resolveLayerSourceSize(layer, pipeline)
            : undefined
      const plan = pipeline
        ? planLayerDraw(layer, pipeline, gameId, { naturalSize })
        : null
      ctx.save()
      
      const stageX = layer.x * canvas.width
      const stageY = layer.y * canvas.height
      
      ctx.translate(stageX, stageY)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.scale(layer.flipX ? -1 : 1, 1)
      
      const pixel = plan?.pixelSize ?? getLayerPixelSize(layer, !!(img || videoReady), naturalSize)
      const hideClipLayer = !!layer.clipId && !clipSample
      
      const drawContent = () => {
        if (hideClipLayer) return
        if (plan?.kind === 'text') {
          const fontSize = TEXT_BASE_PX * layer.scale
          ctx.font = `${fontSize}px ${plan.fontFamily || 'sans-serif'}, ${plan.fontFallback || 'sans-serif'}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = plan.error ? '#ff4d4d' : (plan.color || '#ffffff')
          ctx.fillText(plan.text || '', 0, 0)
          if (plan.error) {
            ctx.font = '12px sans-serif'
            ctx.fillText(plan.error.slice(0, 48), 0, fontSize)
          }
          return
        }
        if (clipSample && videoReady && clipVideo) {
          ctx.drawImage(
            clipVideo.element,
            -pixel.width / 2,
            -pixel.height / 2,
            pixel.width,
            pixel.height
          )
          return
        }
        if (clipSample && clipVideo?.status === 'loading') {
          ctx.fillStyle = '#1a2a3a'
          ctx.fillRect(-pixel.width / 2, -pixel.height / 2, pixel.width, pixel.height)
          ctx.fillStyle = '#9ad'
          ctx.font = '11px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('Loading clip…', 0, 0)
          return
        }
        if (clipSample && clipVideo && clipVideo.status !== 'ready') {
          ctx.fillStyle = '#7a2020'
          ctx.fillRect(-pixel.width / 2, -pixel.height / 2, pixel.width, pixel.height)
          ctx.fillStyle = '#ffb4b4'
          ctx.font = '11px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText((clipVideo.message || 'Clip unavailable').slice(0, 42), 0, 0)
          return
        }
        if (img) {
          ctx.drawImage(img.element, -pixel.width / 2, -pixel.height / 2, pixel.width, pixel.height)
          return
        }
        ctx.fillStyle = plan?.error ? '#7a2020' : (layer.id === selectedLayerId ? '#FFC800' : '#4a4a4a')
        ctx.fillRect(-pixel.width / 2, -pixel.height / 2, pixel.width, pixel.height)
        if (plan?.error) {
          ctx.fillStyle = '#ffb4b4'
          ctx.font = '11px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('Missing media', 0, 0)
        }
      }

      // Phase C.3a: Dual-pass rendering for outerGlow + dropShadow
      if (layer.fx?.outerGlow) {
        const glow = layer.fx.outerGlow
        ctx.shadowBlur = glow.blur
        ctx.shadowColor = glow.color
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.globalAlpha = layer.opacity * glow.alpha
        drawContent()
        if (img && glow.strength && glow.strength > 1) {
          for (let i = 1; i < glow.strength; i++) {
            ctx.drawImage(img.element, -pixel.width / 2, -pixel.height / 2, pixel.width, pixel.height)
          }
        }
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.shadowColor = 'transparent'
      }
      
      if (layer.fx?.dropShadow) {
        const shadow = layer.fx.dropShadow
        ctx.shadowOffsetX = shadow.offsetX
        ctx.shadowOffsetY = shadow.offsetY
        ctx.shadowBlur = shadow.blur
        ctx.shadowColor = shadow.color
        ctx.globalAlpha = layer.opacity * shadow.alpha
        drawContent()
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.shadowColor = 'transparent'
      }
      
      if (!layer.fx?.outerGlow && !layer.fx?.dropShadow) {
        ctx.globalAlpha = layer.opacity
        drawContent()
      }
      
      ctx.restore()

      if (layer.id === selectedLayerId && mode === 'layout' && playbackState === 'stopped') {
        const cx = stageX
        const cy = stageY
        const rotRad = (layer.rotation * Math.PI) / 180
        const handleSize = 10 / (getInterpolatedCamera(playbackTime)?.zoom || 1)
        ctx.strokeStyle = '#FFC800'
        ctx.lineWidth = 2 / (getInterpolatedCamera(playbackTime)?.zoom || 1)
        ctx.fillStyle = '#FFC800'
        
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(rotRad)
        ctx.strokeRect(-pixel.width / 2, -pixel.height / 2, pixel.width, pixel.height)
        ctx.fillRect(-pixel.width / 2 - handleSize / 2, -pixel.height / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(pixel.width / 2 - handleSize / 2, -pixel.height / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(-pixel.width / 2 - handleSize / 2, pixel.height / 2 - handleSize / 2, handleSize, handleSize)
        ctx.fillRect(pixel.width / 2 - handleSize / 2, pixel.height / 2 - handleSize / 2, handleSize, handleSize)
        ctx.beginPath()
        ctx.arc(0, -pixel.height / 2 - 20, 6 / (getInterpolatedCamera(playbackTime)?.zoom || 1), 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    ctx.restore()  // Restore camera transform
    ctx.restore()  // Restore shake transform (applied before drawing)
    
    // Apply overlay effects (flash, freeze, zoom_punch - drawn on top)
    for (const effect of activeEffects) {
      if (effect.type === 'flash') {
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
  }, [selectedShot, selectedLayerId, mode, playbackTime, loadedImages, dragStart, getInterpolatedCamera, pipeline, gameId, previewSnapshot, clips, videoEpoch])

  const capturePointer = (target: EventTarget | null, pointerId: number) => {
    if (!target || typeof (target as Element).setPointerCapture !== 'function') return
    try {
      ;(target as Element).setPointerCapture(pointerId)
      capturedPointerRef.current = { target: target as Element, pointerId }
    } catch {
      /* element may not accept capture */
    }
  }

  const releaseHeldPointer = (e?: PointerSessionEvent) => {
    if (e) endPointerCaptureNow(e)
    const held = capturedPointerRef.current
    capturedPointerRef.current = null
    if (held) releasePointerCaptureIfHeld(held.target, held.pointerId)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !selectedShot) return
    capturePointer(e.currentTarget, e.pointerId)

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    if (mode === 'layout' && selectedLayer) {
      const img = loadedImages.get(selectedLayerId!)
      const naturalSize = img
        ? { width: img.width, height: img.height }
        : pipeline
          ? resolveLayerSourceSize(selectedLayer, pipeline)
          : undefined
      const pixel = getLayerPixelSize(selectedLayer, !!img, naturalSize)
      const halfW = pixel.width / 2 / canvas.width
      const halfH = pixel.height / 2 / canvas.height
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
      const rotHandle = rotatePoint(lx, ly - halfH - 20 / canvas.height)
      if (Math.hypot(x - rotHandle.x, y - rotHandle.y) < handleSize / 2) {
        setDragMode('rotate')
        setDragStart({ x, y, clientX: e.clientX, clientY: e.clientY, layerX: lx, layerY: ly, layerRotation: selectedLayer.rotation })
        return
      }
      
      // Check corner handles (rotated corners)
      const corners = [
        rotatePoint(lx - halfW, ly - halfH),
        rotatePoint(lx + halfW, ly - halfH),
        rotatePoint(lx - halfW, ly + halfH),
        rotatePoint(lx + halfW, ly + halfH)
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
      if (Math.abs(localPoint.x - lx) <= halfW && Math.abs(localPoint.y - ly) <= halfH) {
        setDragMode('move')
        setDragStart({ x, y, clientX: e.clientX, clientY: e.clientY, layerX: lx, layerY: ly })
        return
      }
    }
    
    if (mode === 'layout') {
      // Select layer
      const sortedLayers = [...selectedShot.layers].map(previewLayer).sort((a, b) => b.zOrder - a.zOrder)
      for (const layer of sortedLayers) {
        const img = loadedImages.get(layer.id)
        const naturalSize = img
          ? { width: img.width, height: img.height }
          : pipeline
            ? resolveLayerSourceSize(layer, pipeline)
            : undefined
        if (hitTestLayer(layer, x, y, canvas.width, !!img, { naturalSize, canvasHeight: canvas.height })) {
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
      if (!isDragPastThreshold(pixelDx, pixelDy)) return
      
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
    // Release before any await — React nulls currentTarget after the first await.
    releaseHeldPointer(e)
    try {
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
    } finally {
      setDragMode(null)
      setDragStart(null)
    }
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    releaseHeldPointer(e)
    setDragMode(null)
    setDragStart(null)
  }

  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedShot) return
    
    // Prevent text selection and native drag
    e.preventDefault()
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const yRatio = (e.clientY - rect.top) / rect.height
    const hit = hitTestTimeline({
      durationSec: selectedShot.durationSec,
      xRatio: x,
      yRatio,
      cameraTimes: selectedShot.cameraTrack.map((k) => k.t),
      timedKeys: flattenShotTimedKeys(selectedShot).map((row) => ({
        layerId: row.layerId,
        keyId: row.key.id,
        t: row.key.t
      })),
      effectTimes: selectedShot.effectsTrack.map((ef) => ef.t),
      clipBlocks: clipBlocks.map((b) => ({
        id: b.id,
        t: b.t,
        durationSec: b.durationSec,
        implicit: b.implicit
      })),
      audioBlocks: audioBlocks.map((b) => ({
        id: b.id,
        t: b.t,
        durationSec: b.durationSec
      }))
    })

    if (hit.kind === 'camera') {
      setDraggedMarker({ type: 'camera', index: hit.index })
      setDragMode('marker' as any)
      capturePointer(e.currentTarget, e.pointerId)
      return
    }
    if (hit.kind === 'timedKey') {
      setDraggedMarker({
        type: 'timedKey',
        index: hit.index,
        layerId: hit.layerId,
        keyId: hit.keyId
      })
      setDragMode('marker' as any)
      capturePointer(e.currentTarget, e.pointerId)
      return
    }
    if (hit.kind === 'effect') {
      setDraggedMarker({ type: 'effect', index: hit.index })
      setDragMode('marker' as any)
      capturePointer(e.currentTarget, e.pointerId)
      return
    }
    if (hit.kind === 'clipBlock') {
      setSelectedClipBlockId(hit.blockId)
      setSelectedTimedKeyId(null)
      setSelectedAudioBlockId(null)
      setEditingCamera(false)
      setSelectedCameraIndex(null)
      setEditingEffect(false)
      setSelectedEffectIndex(null)
      if (hit.implicit) {
        capturePointer(e.currentTarget, e.pointerId)
        return
      }
      setDraggedMarker({
        type: 'clipBlock',
        index: clipBlocks.findIndex((b) => b.id === hit.blockId),
        blockId: hit.blockId,
        clipDrag: hit.clipDrag,
        grabOffsetSec: hit.grabOffsetSec
      })
      setDragMode('marker' as any)
      capturePointer(e.currentTarget, e.pointerId)
      return
    }
    if (hit.kind === 'audioBlock') {
      setSelectedAudioBlockId(hit.blockId)
      setSelectedClipBlockId(null)
      setSelectedTimedKeyId(null)
      setEditingCamera(false)
      setSelectedCameraIndex(null)
      setEditingEffect(false)
      setSelectedEffectIndex(null)
      setDraggedMarker({
        type: 'audioBlock',
        index: audioBlocks.findIndex((b) => b.id === hit.blockId),
        blockId: hit.blockId,
        clipDrag: hit.clipDrag,
        grabOffsetSec: hit.grabOffsetSec
      })
      setDragMode('marker' as any)
      capturePointer(e.currentTarget, e.pointerId)
      return
    }

    setDragMode('playhead' as any)
    setPlaybackTime(hit.timeSec)
    capturePointer(e.currentTarget, e.pointerId)
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
      } else if (draggedMarker.type === 'timedKey' && draggedMarker.layerId && draggedMarker.keyId) {
        const layers = selectedShot.layers.map((layer) => {
          if (layer.id !== draggedMarker.layerId) return layer
          return {
            ...layer,
            timedKeys: (layer.timedKeys || []).map((key) =>
              key.id === draggedMarker.keyId ? { ...key, t: newTime } : key
            )
          }
        })
        if (activeProject && activeProject.assetPipeline) {
          const updatedProject = {
            ...activeProject,
            assetPipeline: {
              ...activeProject.assetPipeline,
              storyboardShots: activeProject.assetPipeline.storyboardShots?.map((s) =>
                s.id === selectedShotId ? { ...s, layers } : s
              )
            }
          }
          setActiveProject(updatedProject)
        }
      } else if (draggedMarker.type === 'clipBlock' && draggedMarker.blockId) {
        const orig = (selectedShot.clipTrack || []).find((b) => b.id === draggedMarker.blockId)
        if (!orig) return
        const clip = clips.find((c) => c.id === orig.clipId)
        const clipDur = clip?.durationSec ?? orig.sourceOutSec
        let next: ShotClipBlock = orig
        if (draggedMarker.clipDrag === 'trimIn') {
          const end = clipBlockEnd(orig)
          const newT = Math.max(0, Math.min(end - 0.05, newTime))
          const durationSec = end - newT
          const sourceOutSec = orig.sourceOutSec
          const sourceInSec = Math.max(0, sourceOutSec - durationSec)
          next = {
            ...orig,
            t: newT,
            durationSec: sourceOutSec - sourceInSec,
            sourceInSec,
            sourceOutSec
          }
        } else if (draggedMarker.clipDrag === 'trimOut') {
          const maxEnd = selectedShot.durationSec
          const newEnd = Math.max(orig.t + 0.05, Math.min(maxEnd, newTime))
          const durationSec = newEnd - orig.t
          const sourceOutSec = Math.min(clipDur, orig.sourceInSec + durationSec)
          next = {
            ...orig,
            durationSec: sourceOutSec - orig.sourceInSec,
            sourceOutSec
          }
        } else {
          const maxT = Math.max(0, selectedShot.durationSec - orig.durationSec)
          const rawT = newTime - (draggedMarker.grabOffsetSec || 0)
          const newT = Math.max(0, Math.min(maxT, rawT))
          next = { ...orig, t: newT }
        }
        if (activeProject && activeProject.assetPipeline) {
          const updatedProject = {
            ...activeProject,
            assetPipeline: {
              ...activeProject.assetPipeline,
              storyboardShots: activeProject.assetPipeline.storyboardShots?.map((s) =>
                s.id === selectedShotId
                  ? { ...s, clipTrack: (s.clipTrack || []).map((b) => (b.id === next.id ? next : b)) }
                  : s
              )
            }
          }
          setActiveProject(updatedProject)
        }
      } else if (draggedMarker.type === 'audioBlock' && draggedMarker.blockId) {
        const orig = (selectedShot.audioTrack || []).find((b) => b.id === draggedMarker.blockId)
        if (!orig) return
        const asset = audioAssets.find((a) => a.id === orig.audioId)
        const assetDur = asset?.durationSec ?? orig.sourceOutSec
        let next: ShotAudioBlock = orig
        if (draggedMarker.clipDrag === 'trimIn') {
          const end = audioBlockEnd(orig)
          const newT = Math.max(0, Math.min(end - 0.05, newTime))
          const durationSec = end - newT
          if (orig.loop) {
            next = { ...orig, t: newT, durationSec }
          } else {
            const sourceOutSec = orig.sourceOutSec
            const sourceInSec = Math.max(0, sourceOutSec - durationSec)
            next = {
              ...orig,
              t: newT,
              durationSec: sourceOutSec - sourceInSec,
              sourceInSec,
              sourceOutSec
            }
          }
        } else if (draggedMarker.clipDrag === 'trimOut') {
          const maxEnd = selectedShot.durationSec
          const newEnd = Math.max(orig.t + 0.05, Math.min(maxEnd, newTime))
          const durationSec = newEnd - orig.t
          if (orig.loop) {
            next = { ...orig, durationSec }
          } else {
            const sourceOutSec = Math.min(assetDur, orig.sourceInSec + durationSec)
            next = {
              ...orig,
              durationSec: sourceOutSec - orig.sourceInSec,
              sourceOutSec
            }
          }
        } else {
          const maxT = Math.max(0, selectedShot.durationSec - orig.durationSec)
          const rawT = newTime - (draggedMarker.grabOffsetSec || 0)
          const newT = Math.max(0, Math.min(maxT, rawT))
          next = { ...orig, t: newT }
        }
        if (activeProject && activeProject.assetPipeline) {
          const updatedProject = {
            ...activeProject,
            assetPipeline: {
              ...activeProject.assetPipeline,
              storyboardShots: activeProject.assetPipeline.storyboardShots?.map((s) =>
                s.id === selectedShotId
                  ? { ...s, audioTrack: (s.audioTrack || []).map((b) => (b.id === next.id ? next : b)) }
                  : s
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

  const handleTimelinePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    releaseHeldPointer(e)
    setDragMode(null)
    setDraggedMarker(null)
  }

  const handleTimelinePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    // Must run before any await. After persist, React has nulled currentTarget.
    releaseHeldPointer(e)
    try {
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
      } else if (draggedMarker.type === 'timedKey' && draggedMarker.keyId) {
        const keyId = draggedMarker.keyId
        const layer = selectedShot.layers.find((l) => l.id === draggedMarker.layerId)
        const key = layer?.timedKeys?.find((k) => k.id === keyId)
        try {
          if (key) {
            await window.indieForge.pipeline.updateLayerTimedKey(projectId!, keyId, { t: key.t })
          }
          const proj = await window.indieForge.projects.open(projectId!)
          setActiveProject(proj)
          setSelectedTimedKeyId(keyId)
          setLayerError(null)
        } catch (err) {
          setLayerError(err instanceof Error ? err.message : 'Failed to move timed key')
          const proj = await window.indieForge.projects.open(projectId!)
          setActiveProject(proj)
        }
      } else if (draggedMarker.type === 'clipBlock' && draggedMarker.blockId) {
        const block = (selectedShot.clipTrack || []).find((b) => b.id === draggedMarker.blockId)
        try {
          if (block) {
            await window.indieForge.pipeline.updateShotClipBlock(projectId!, block.id, {
              t: block.t,
              sourceInSec: block.sourceInSec,
              sourceOutSec: block.sourceOutSec
            })
          }
          const proj = await window.indieForge.projects.open(projectId!)
          setActiveProject(proj)
          setSelectedClipBlockId(draggedMarker.blockId)
          setLayerError(null)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to move clip block'
          if (msg.includes('--extend-shot') || msg.includes('never silent')) {
            setPendingExtend({
              message:
                'This clip block would pass the shot end. Extend the shot to fit? Cancel keeps the current duration (never silent).',
              run: async () => {
                if (!block) return
                await window.indieForge.pipeline.updateShotClipBlock(projectId!, block.id, {
                  t: block.t,
                  sourceInSec: block.sourceInSec,
                  sourceOutSec: block.sourceOutSec,
                  extendShot: true
                })
                const proj = await window.indieForge.projects.open(projectId!)
                setActiveProject(proj)
              }
            })
          } else {
            setLayerError(msg)
          }
          const proj = await window.indieForge.projects.open(projectId!)
          setActiveProject(proj)
        }
      } else if (draggedMarker.type === 'audioBlock' && draggedMarker.blockId) {
        const block = (selectedShot.audioTrack || []).find((b) => b.id === draggedMarker.blockId)
        try {
          if (block) {
            await window.indieForge.pipeline.updateShotAudioBlock(projectId!, block.id, {
              t: block.t,
              sourceInSec: block.sourceInSec,
              sourceOutSec: block.sourceOutSec,
              durationSec: block.durationSec,
              loop: block.loop
            })
          }
          const proj = await window.indieForge.projects.open(projectId!)
          setActiveProject(proj)
          setSelectedAudioBlockId(draggedMarker.blockId)
          setLayerError(null)
          setAudioError(null)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to move audio block'
          if (msg.includes('--extend-shot') || msg.includes('never silent')) {
            setPendingExtend({
              message:
                'This audio block would pass the shot end. Extend the shot to fit? Cancel keeps the current duration (never silent).',
              run: async () => {
                if (!block) return
                await window.indieForge.pipeline.updateShotAudioBlock(projectId!, block.id, {
                  t: block.t,
                  sourceInSec: block.sourceInSec,
                  sourceOutSec: block.sourceOutSec,
                  durationSec: block.durationSec,
                  loop: block.loop,
                  extendShot: true
                })
                const proj = await window.indieForge.projects.open(projectId!)
                setActiveProject(proj)
              }
            })
          } else {
            setLayerError(msg)
            setAudioError(msg)
          }
          const proj = await window.indieForge.projects.open(projectId!)
          setActiveProject(proj)
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
    } finally {
      setDragMode(null)
      setDraggedMarker(null)
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
      visible: true,
      x: 0.5,
      y: 0.5,
      scale: 1.0,
      rotation: 0,
      flipX: false,
      opacity: 1.0
    }
    
    try {
      setLayerError(null)
      await window.indieForge.pipeline.addLayer(projectId!, selectedShotId!, layer)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setShowAddCharacter(false)
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : 'Failed to add character layer')
    }
  }

  const applyShotBackgroundUpdate = async (
    shotId: string,
    game: string,
    updates: Record<string, unknown>
  ) => {
    if (!projectId) return
    try {
      setBackgroundError(null)
      const updated = await window.indieForge.pipeline.updateShot(projectId, shotId, updates)
      if (selectedShotIdRef.current !== shotId || gameIdRef.current !== game) return
      setActiveProject(updated)
    } catch (err) {
      if (selectedShotIdRef.current !== shotId || gameIdRef.current !== game) return
      setBackgroundError(err instanceof Error ? err.message : 'Failed to update background')
    }
  }

  const handleSelectLibraryBackground = async (assetId: string, stateId: string | null) => {
    if (!selectedShotId) return
    await applyShotBackgroundUpdate(selectedShotId, gameId, {
      backgroundVisualAssetId: assetId,
      backgroundAssetStateId: stateId,
      backgroundImage: null
    })
  }

  const handleFitSourceAspect = async (layerId: string) => {
    if (!projectId || !selectedShotId) return
    try {
      setLayerError(null)
      await window.indieForge.pipeline.updateLayer(projectId, selectedShotId, layerId, {
        scale: SOURCE_FIT_SCALE
      })
      const updated = await window.indieForge.projects.open(projectId)
      setActiveProject(updated)
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : 'Failed to reset source aspect')
    }
  }

  const handleChangeLibraryBackgroundState = async (stateId: string | null) => {
    if (!selectedShotId) return
    await applyShotBackgroundUpdate(selectedShotId, gameId, {
      backgroundAssetStateId: stateId
    })
  }

  const handleImportBackgroundImage = async () => {
    const shotId = selectedShotId
    const game = gameId
    if (!shotId || !projectId) return
    try {
      setBackgroundError(null)
      const { filePath } = await window.indieForge.files.chooseImage()
      if (!filePath) return
      if (selectedShotIdRef.current !== shotId || gameIdRef.current !== game) return
      const updated = await window.indieForge.pipeline.updateShot(projectId, shotId, {
        backgroundImage: filePath,
        backgroundVisualAssetId: null,
        backgroundAssetStateId: null
      })
      if (selectedShotIdRef.current !== shotId || gameIdRef.current !== game) return
      setActiveProject(updated)
    } catch (err) {
      if (selectedShotIdRef.current !== shotId || gameIdRef.current !== game) return
      setBackgroundError(err instanceof Error ? err.message : 'Failed to import background image')
    }
  }

  const handleClearBackgroundImage = async () => {
    if (!selectedShotId) return
    await applyShotBackgroundUpdate(selectedShotId, gameId, {
      backgroundImage: null,
      backgroundVisualAssetId: null,
      backgroundAssetStateId: null
    })
  }

  const handleAddAssetLayer = async () => {
    if (!selectedShot || !addAssetId) {
      setLayerError('Select a Library visual asset')
      return
    }
    const layer: Omit<StoryboardLayer, 'id'> = {
      zOrder: Math.max(...selectedShot.layers.map(l => l.zOrder), 0) + 1,
      visualAssetId: addAssetId,
      assetStateId: addAssetStateId || null,
      visible: true,
      x: 0.5,
      y: 0.5,
      scale: 1.0,
      rotation: 0,
      flipX: false,
      opacity: 1.0
    }
    try {
      setLayerError(null)
      await window.indieForge.pipeline.addLayer(projectId!, selectedShotId!, layer)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setShowAddAsset(false)
      setAddAssetId('')
      setAddAssetStateId('')
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : 'Failed to add asset layer')
    }
  }

  const handleAddTextLayer = async () => {
    if (!selectedShot) return
    const layer: Omit<StoryboardLayer, 'id'> = {
      zOrder: Math.max(...selectedShot.layers.map(l => l.zOrder), 0) + 1,
      text: addTextContent,
      fontRef: addTextFont || DEFAULT_FONT_REF,
      paletteRef: addTextPalette || DEFAULT_PALETTE_REF,
      visible: true,
      x: 0.5,
      y: 0.5,
      scale: 1.0,
      rotation: 0,
      flipX: false,
      opacity: 1.0
    }
    try {
      setLayerError(null)
      await window.indieForge.pipeline.addLayer(projectId!, selectedShotId!, layer)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setShowAddText(false)
      setAddTextContent('New text')
      setAddTextFont(DEFAULT_FONT_REF)
      setAddTextPalette(DEFAULT_PALETTE_REF)
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : 'Failed to add text layer')
    }
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
    if (!selectedLayerId) return
    setConfirmDeleteLayer(true)
  }

  const confirmDeleteLayerNow = async () => {
    if (!selectedLayerId) return
    try {
      setLayerError(null)
      await window.indieForge.pipeline.deleteLayer(projectId!, selectedShotId!, selectedLayerId)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setSelectedLayerId(null)
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : 'Failed to delete layer')
    } finally {
      setConfirmDeleteLayer(false)
    }
  }

  const handleAddTimedKey = async () => {
    if (!selectedShot || !selectedLayer) {
      setLayerError('Select a character or visual-asset layer to add a pose/state key')
      return
    }
    const kind = getLayerKind(selectedLayer)
    try {
      setLayerError(null)
      let action: LayerTimedKey['action']
      if (kind === 'character' && selectedLayer.characterId) {
        const poseId =
          selectedLayer.poseId ||
          poses.find((p) => p.characterId === selectedLayer.characterId && p.status === 'approved')?.id ||
          poses.find((p) => p.characterId === selectedLayer.characterId)?.id
        if (!poseId) throw new Error('Character layer has no pose to key')
        action = { type: 'setPose', poseId }
      } else if (kind === 'visualAsset' && selectedLayer.visualAssetId) {
        const stateId =
          selectedLayer.assetStateId ||
          assetStates.find((s) => s.assetId === selectedLayer.visualAssetId)?.id
        if (!stateId) throw new Error('Visual-asset layer has no state to key')
        action = { type: 'setState', stateId }
      } else {
        throw new Error('Select a character or visual-asset layer to add a pose/state key')
      }
      await window.indieForge.pipeline.addLayerTimedKey(projectId!, selectedShotId!, selectedLayer.id, {
        t: playbackTime,
        action
      })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      const shot = updated.assetPipeline?.storyboardShots?.find((s) => s.id === selectedShotId)
      const layer = shot?.layers.find((l) => l.id === selectedLayer.id)
      const created = (layer?.timedKeys || []).find((k) => Math.abs(k.t - playbackTime) < 0.001)
      if (created) {
        setSelectedTimedKeyId(created.id)
        setTimedKeyTimeDraft(created.t.toFixed(2))
      }
      setSidebarTab('background')
      setEditingCamera(false)
      setSelectedCameraIndex(null)
      setEditingEffect(false)
      setSelectedEffectIndex(null)
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : 'Failed to add timed key')
      setSidebarTab('background')
    }
  }

  const handleUpdateTimedKey = async (
    keyId: string,
    updates: { t?: number; action?: LayerTimedKey['action'] }
  ) => {
    try {
      setLayerError(null)
      await window.indieForge.pipeline.updateLayerTimedKey(projectId!, keyId, updates)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setSelectedTimedKeyId(keyId)
      if (updates.t !== undefined) setTimedKeyTimeDraft(updates.t.toFixed(2))
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : 'Failed to update timed key')
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    }
  }

  const confirmDeleteTimedKeyNow = async () => {
    if (!confirmDeleteTimedKeyId) return
    try {
      setLayerError(null)
      await window.indieForge.pipeline.deleteLayerTimedKey(projectId!, confirmDeleteTimedKeyId)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      if (selectedTimedKeyId === confirmDeleteTimedKeyId) setSelectedTimedKeyId(null)
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : 'Failed to delete timed key')
    } finally {
      setConfirmDeleteTimedKeyId(null)
    }
  }

  const reloadProject = async () => {
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
    return updated
  }

  const runClipWrite = async (fn: (extendShot: boolean) => Promise<void>): Promise<boolean> => {
    try {
      setLayerError(null)
      await fn(false)
      await reloadProject()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('--extend-shot') || msg.includes('never silent') || msg.includes('extend the shot')) {
        setPendingExtend({
          message:
            'This clip block ends after the shot duration. Extend the shot to fit the block? Cancel keeps the current duration — Forge never silently extends.',
          run: async () => {
            await fn(true)
            await reloadProject()
          }
        })
        await reloadProject()
        return false
      }
      setLayerError(msg)
      await reloadProject()
      return false
    }
  }

  const handleAddClipBlock = async () => {
    if (!selectedShot || !addClipId) {
      setLayerError('Select a clip from this Game')
      return
    }
    const clip = gameClips.find((c) => c.id === addClipId)
    if (!clip) {
      setLayerError('Clip is not in the selected Game')
      return
    }
    const sourceInSec = Number(addClipSourceIn)
    const sourceOutSec = addClipSourceOut === '' ? clip.durationSec : Number(addClipSourceOut)
    const ok = await runClipWrite(async (extendShot) => {
      await window.indieForge.pipeline.addShotClipBlock(projectId!, selectedShotId!, {
        clipId: addClipId,
        role: addClipRole,
        t: playbackTime,
        sourceInSec,
        sourceOutSec,
        extendShot
      })
    })
    if (ok) setShowAddClip(false)
  }

  const handlePromoteImplicitBlock = async () => {
    if (!selectedClipBlock || !selectedClipBlock.implicit) return
    await runClipWrite(async (extendShot) => {
      await window.indieForge.pipeline.addShotClipBlock(projectId!, selectedShotId!, {
        clipId: selectedClipBlock.clipId,
        role: selectedClipBlock.role,
        layerId: selectedClipBlock.layerId || undefined,
        t: selectedClipBlock.t,
        sourceInSec: selectedClipBlock.sourceInSec,
        sourceOutSec: selectedClipBlock.sourceOutSec,
        extendShot
      })
    })
  }

  const handleCommitClipBlockEdits = async () => {
    if (!selectedClipBlock || selectedClipBlock.implicit) return
    const t = Number(clipTimeDraft)
    const sourceInSec = Number(clipInDraft)
    const sourceOutSec = Number(clipOutDraft)
    await runClipWrite(async (extendShot) => {
      await window.indieForge.pipeline.updateShotClipBlock(projectId!, selectedClipBlock.id, {
        t,
        sourceInSec,
        sourceOutSec,
        extendShot
      })
    })
  }

  const confirmDeleteClipBlockNow = async () => {
    if (!confirmDeleteClipBlockId) return
    try {
      setLayerError(null)
      await window.indieForge.pipeline.deleteShotClipBlock(projectId!, confirmDeleteClipBlockId)
      await reloadProject()
      if (selectedClipBlockId === confirmDeleteClipBlockId) setSelectedClipBlockId(null)
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : 'Failed to delete clip block')
    } finally {
      setConfirmDeleteClipBlockId(null)
    }
  }

  const runAudioWrite = async (fn: (extendShot: boolean) => Promise<void>): Promise<boolean> => {
    try {
      setLayerError(null)
      setAudioError(null)
      await fn(false)
      await reloadProject()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('--extend-shot') || msg.includes('never silent') || msg.includes('extend the shot')) {
        setPendingExtend({
          message:
            'This audio block ends after the shot duration. Extend the shot to play the full authored length? Cancel keeps the current shot length — Forge never silently extends. To keep the shot length, Cancel, click Fit remaining shot, then Place (or shorten Duration so the block ends at the shot end). Previous shot length is not restored from history.',
          run: async () => {
            await fn(true)
            await reloadProject()
          }
        })
        await reloadProject()
        return false
      }
      setLayerError(msg)
      setAudioError(msg)
      await reloadProject()
      return false
    }
  }

  const remainingShotForPlayhead = selectedShot
    ? remainingShotTime(selectedShot.durationSec, playbackTime)
    : 0

  const applyFitRemainingToAddForm = () => {
    if (!selectedShot) return
    const remaining = remainingShotTime(selectedShot.durationSec, playbackTime)
    if (remaining <= 0) {
      setAudioError(`Cannot fit audio: playhead ${playbackTime}s is at or after shot duration ${selectedShot.durationSec}s`)
      return
    }
    setAddAudioDuration(String(Number(remaining.toFixed(3))))
    if (!addAudioLoop) {
      const inn = Number(addAudioSourceIn)
      const start = Number.isFinite(inn) ? inn : 0
      setAddAudioSourceOut(String(Number((start + remaining).toFixed(3))))
    }
    setAudioError(null)
  }

  const handleAddAudioBlock = async () => {
    if (!selectedShot || !addAudioId) {
      setAudioError('Select audio from this Game library')
      return
    }
    const asset = audioAssets.find((a) => a.id === addAudioId)
    if (!asset) {
      setAudioError('Audio is not in the selected Game')
      return
    }
    const sourceInSec = Number(addAudioSourceIn)
    const sourceOutSec = addAudioSourceOut === '' ? asset.durationSec : Number(addAudioSourceOut)
    const durationSec = addAudioDuration !== '' ? Number(addAudioDuration) : undefined
    const ok = await runAudioWrite(async (extendShot) => {
      await window.indieForge.pipeline.addShotAudioBlock(projectId!, selectedShotId!, {
        audioId: addAudioId,
        role: asset.kind,
        t: playbackTime,
        sourceInSec,
        sourceOutSec,
        durationSec,
        loop: addAudioLoop,
        volume: Number(addAudioVolume),
        fadeInSec: Number(addAudioFadeIn),
        fadeOutSec: Number(addAudioFadeOut),
        extendShot
      })
    })
    if (ok) setShowAddAudio(false)
  }

  const handleCommitAudioBlockEdits = async (loopOverride?: boolean) => {
    if (!selectedAudioBlock) return
    const t = Number(audioTimeDraft)
    const sourceInSec = Number(audioInDraft)
    let sourceOutSec = Number(audioOutDraft)
    let durationSec = Number(audioDurationDraft)
    const loop = loopOverride !== undefined ? loopOverride : audioLoopDraft
    if (!loop && Number.isFinite(sourceInSec) && Number.isFinite(sourceOutSec) && Number.isFinite(durationSec)) {
      const trim = sourceOutSec - sourceInSec
      const outChanged = Math.abs(sourceOutSec - selectedAudioBlock.sourceOutSec) > 0.001
      const durChanged = Math.abs(durationSec - selectedAudioBlock.durationSec) > 0.001
      if (durChanged && !outChanged) {
        sourceOutSec = sourceInSec + durationSec
      } else if (outChanged) {
        durationSec = trim
      } else if (Math.abs(durationSec - trim) > 0.001) {
        sourceOutSec = sourceInSec + durationSec
      }
    }
    await runAudioWrite(async (extendShot) => {
      await window.indieForge.pipeline.updateShotAudioBlock(projectId!, selectedAudioBlock.id, {
        t,
        sourceInSec,
        sourceOutSec,
        durationSec,
        loop,
        volume: Number(audioVolumeDraft),
        fadeInSec: Number(audioFadeInDraft),
        fadeOutSec: Number(audioFadeOutDraft),
        extendShot
      })
    })
  }

  const handleFitAudioBlockToShot = async () => {
    if (!selectedAudioBlock || !selectedShot) return
    try {
      setLayerError(null)
      setAudioError(null)
      await window.indieForge.pipeline.updateShotAudioBlock(projectId!, selectedAudioBlock.id, {
        fitShot: true
      })
      await reloadProject()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAudioError(msg)
      setLayerError(msg)
    }
  }

  const handleCommitShotDuration = async () => {
    if (!selectedShot || !projectId || !selectedShotId) return
    const n = Number(shotDurationDraft)
    if (!Number.isFinite(n) || n <= 0) {
      setShotDurationError('Shot duration must be a positive number of seconds')
      setShotDurationDraft(String(selectedShot.durationSec))
      return
    }
    if (Math.abs(n - selectedShot.durationSec) < 1e-9) {
      setShotDurationError(null)
      return
    }
    try {
      setShotDurationError(null)
      setLayerError(null)
      await window.indieForge.pipeline.updateShot(projectId, selectedShotId, { durationSec: n })
      await reloadProject()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setShotDurationError(msg)
      setLayerError(msg)
      setShotDurationDraft(String(selectedShot.durationSec))
    }
  }

  const confirmDeleteAudioBlockNow = async () => {
    if (!confirmDeleteAudioBlockId) return
    try {
      setLayerError(null)
      setAudioError(null)
      await window.indieForge.pipeline.deleteShotAudioBlock(projectId!, confirmDeleteAudioBlockId)
      await reloadProject()
      if (selectedAudioBlockId === confirmDeleteAudioBlockId) setSelectedAudioBlockId(null)
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Failed to delete audio block')
    } finally {
      setConfirmDeleteAudioBlockId(null)
    }
  }

  const confirmExtendShotNow = async () => {
    if (!pendingExtend) return
    try {
      setLayerError(null)
      await pendingExtend.run()
    } catch (err) {
      setLayerError(err instanceof Error ? err.message : 'Failed to extend shot')
    } finally {
      setPendingExtend(null)
      setShowAddClip(false)
      setShowAddAudio(false)
    }
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
            queueMicrotask(() => resetEventPreview())
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
    // Fire is not gated on transport; Stop must cancel event SFX even if we were paused.
    resetEventPreview()
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
                    <label
                      style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.35rem' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Duration (s)
                      <input
                        type="number"
                        step="0.05"
                        min="0.05"
                        value={shotDurationDraft}
                        onChange={(e) => setShotDurationDraft(e.target.value)}
                        onBlur={() => void handleCommitShotDuration()}
                        onClick={(e) => e.stopPropagation()}
                        title="Enter a duration. Shrink is refused if audio, clips, keys, camera, or effects would be cut. Previous length is not restored from history."
                        style={{ width: '100%', marginTop: '0.15rem', fontSize: '0.8rem' }}
                      />
                    </label>
                    {shotDurationError && (
                      <div style={{ color: '#ff8a8a', fontSize: '0.7rem', marginBottom: '0.35rem' }}>{shotDurationError}</div>
                    )}
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
                onPointerCancel={handlePointerCancel}
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
              {(() => {
                const bg = sampleBackgroundClip(selectedShot, clips, playbackTime)
                const layerHits = selectedShot.layers
                  .map((layer) => sampleLayerClip(selectedShot, clips, layer.id, playbackTime))
                  .filter(Boolean)
                const samples = [...(bg ? [bg] : []), ...layerHits]
                if (samples.length === 0 && clipBlocks.length === 0) return null
                if (samples.length === 0) {
                  return (
                    <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                      Clips: none active at {playbackTime.toFixed(2)}s (outside block = hidden)
                    </div>
                  )
                }
                return (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#C9A0FF' }}>
                    {samples.map((s, i) => {
                      const video = videosRef.current.get(s!.clipId)
                      const clip = clips.find((c) => c.id === s!.clipId)
                      return (
                        <span key={`${s!.blockId}-${i}`}>
                          {i > 0 ? ' · ' : ''}
                          {s!.role} {clip?.moment || s!.clipId} src {s!.sourceTimeSec.toFixed(2)}s
                          {s!.implicit ? ' (implicit)' : ''}
                          {video?.status === 'ready'
                            ? ''
                            : video
                              ? ` [${video.status}]`
                              : ''}
                        </span>
                      )
                    })}
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
                  <button
                    type="button"
                    onClick={handleAddTimedKey}
                    style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                    title="Add a pose/state key on the selected character or visual-asset layer (not a duplicate layer)"
                  >
                    + Pose/State @ {playbackTime.toFixed(1)}s
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddClip(true)
                      setAddClipId(gameClips[0]?.id || '')
                      setAddClipRole('layer')
                      setAddClipSourceIn('0')
                      const first = gameClips[0]
                      setAddClipSourceOut(first ? String(first.durationSec) : '')
                    }}
                    style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                    title="Place a timed clip block with visible duration (not an instantaneous key)"
                  >
                    + Clip @ {playbackTime.toFixed(1)}s
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddAudio(true)
                      const first = audioAssets[0]
                      const remaining = remainingShotTime(selectedShot.durationSec, playbackTime)
                      setAddAudioId(first?.id || '')
                      setAddAudioLoop(first ? defaultLoopForAudioKind(first.kind) : false)
                      setAddAudioSourceIn('0')
                      setAddAudioSourceOut(first ? String(first.durationSec) : '')
                      setAddAudioDuration(
                        remaining > 0 ? String(Number(remaining.toFixed(3))) : ''
                      )
                      setAddAudioVolume('1')
                      setAddAudioFadeIn('0')
                      setAddAudioFadeOut('0')
                      setAudioError(null)
                    }}
                    style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                    title="Place a timed music or SFX block. Duration defaults to remaining shot time. Playback uses HTMLAudioElement.play()/pause()."
                  >
                    + Audio @ {playbackTime.toFixed(1)}s
                  </button>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {playbackTime.toFixed(2)}s /
                    <input
                      type="number"
                      step="0.05"
                      min="0.05"
                      value={shotDurationDraft}
                      onChange={(e) => setShotDurationDraft(e.target.value)}
                      onBlur={() => void handleCommitShotDuration()}
                      title="Shot duration (seconds). Enter a value to shorten or lengthen. Shrink is refused if other content would be cut."
                      style={{ width: '4.5rem', fontSize: '0.75rem' }}
                    />
                    s
                  </label>
                </div>
              </div>
              {shotDurationError && (
                <div style={{ color: '#ff8a8a', fontSize: '0.75rem', marginBottom: '0.45rem' }}>{shotDurationError}</div>
              )}
              
              <div 
                style={{ 
                  position: 'relative', 
                  height: '200px', 
                  background: 'var(--bg)', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none'
                }}
                onPointerDown={handleTimelinePointerDown}
                onPointerMove={handleTimelinePointerMove}
                onPointerUp={handleTimelinePointerUp}
                onPointerCancel={handleTimelinePointerCancel}
              >
                {/* Track Labels - pointerEvents none to not block marker clicks */}
                <div style={{ position: 'absolute', left: '0.5rem', top: '5px', fontSize: '0.7rem', fontWeight: 'bold', color: '#00AAFF', zIndex: 5, pointerEvents: 'none' }}>
                  Camera
                </div>
                <div style={{ position: 'absolute', left: '0.5rem', top: '45px', fontSize: '0.7rem', fontWeight: 'bold', color: '#7CFFB2', zIndex: 5, pointerEvents: 'none' }}>
                  Pose/State
                </div>
                <div style={{ position: 'absolute', left: '0.5rem', top: '85px', fontSize: '0.7rem', fontWeight: 'bold', color: '#FF6B6B', zIndex: 5, pointerEvents: 'none' }}>
                  Effects
                </div>
                <div style={{ position: 'absolute', left: '0.5rem', top: '125px', fontSize: '0.7rem', fontWeight: 'bold', color: '#C9A0FF', zIndex: 5, pointerEvents: 'none' }}>
                  Clips
                </div>
                <div style={{ position: 'absolute', left: '0.5rem', top: '165px', fontSize: '0.7rem', fontWeight: 'bold', color: '#FFB347', zIndex: 5, pointerEvents: 'none' }}>
                  Audio
                </div>
                
                {/* Track Dividers */}
                <div style={{ position: 'absolute', left: 0, right: 0, top: '40px', height: '1px', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: 0, right: 0, top: '80px', height: '1px', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: 0, right: 0, top: '120px', height: '1px', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: 0, right: 0, top: '160px', height: '1px', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
                
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
                
                {/* Pose/state timed keys (same layer, not duplicate layers) */}
                {timedKeyRows.map((row) => {
                  const selected = selectedTimedKeyId === row.key.id
                  const layer = selectedShot.layers.find((l) => l.id === row.layerId)
                  const layerName = pipeline && layer ? describeLayerLabel(layer, pipeline) : row.layerId
                  const issue = pipeline ? timedKeyIssues(row.key, layer || ({} as StoryboardLayer), pipeline, selectedShot.id) : null
                  const tooltip = `${layerName}\n${timedKeyActionLabel(row.key)} @ ${row.key.t.toFixed(2)}s (step/hold)${issue ? `\n${issue}` : ''}`
                  return (
                    <div
                      key={row.key.id}
                      onPointerDown={() => {
                        setSelectedTimedKeyId(row.key.id)
                        setSelectedLayerId(row.layerId)
                        setSidebarTab('background')
                        setEditingCamera(false)
                        setSelectedCameraIndex(null)
                        setEditingEffect(false)
                        setSelectedEffectIndex(null)
                      }}
                      style={{
                        position: 'absolute',
                        left: `${(row.key.t / selectedShot.durationSec) * 100}%`,
                        top: '50px',
                        width: '18px',
                        height: '18px',
                        background: selected ? '#FFD700' : issue ? '#C44' : '#7CFFB2',
                        borderRadius: '3px',
                        transform: 'translateX(-50%)',
                        cursor: 'move',
                        border: selected ? '3px solid #FFF' : '2px solid #fff',
                        boxShadow: selected ? '0 0 8px rgba(255, 215, 0, 0.6)' : '0 2px 4px rgba(0,0,0,0.3)',
                        zIndex: selected ? 11 : 5
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
                      style={{
                        position: 'absolute',
                        left: `${(ef.t / selectedShot.durationSec) * 100}%`,
                        top: '90px',
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

                {clipBlocks.map((block) => {
                  const duration = selectedShot.durationSec || 1
                  const left = (block.t / duration) * 100
                  const width = Math.max(0.8, (block.durationSec / duration) * 100)
                  const selected = selectedClipBlockId === block.id
                  const clip = clips.find((c) => c.id === block.clipId)
                  const issue = pipeline && !block.implicit
                    ? clipBlockIssues(block, selectedShot, pipeline, selectedShot.id)
                    : null
                  const video = videosRef.current.get(block.clipId)
                  const mediaNote =
                    video?.status === 'ready'
                      ? 'ready'
                      : video?.status === 'loading'
                        ? 'loading'
                        : video?.message || (clip ? '' : 'missing clip')
                  const tooltip = `${block.implicit ? 'Implicit (legacy) ' : ''}${block.role} ${clip?.moment || block.clipId}\n${block.t.toFixed(2)}s–${clipBlockEnd(block).toFixed(2)}s\nsrc ${block.sourceInSec.toFixed(2)}–${block.sourceOutSec.toFixed(2)}\n${mediaNote}${issue ? `\n${issue}` : ''}\nBefore/after block: hidden (not last frame)`
                  return (
                    <div
                      key={block.id}
                      onPointerDown={() => {
                        setSelectedClipBlockId(block.id)
                        if (block.layerId) setSelectedLayerId(block.layerId)
                        setSidebarTab('background')
                        setEditingCamera(false)
                        setSelectedCameraIndex(null)
                        setEditingEffect(false)
                        setSelectedEffectIndex(null)
                        setSelectedTimedKeyId(null)
                        setSelectedAudioBlockId(null)
                      }}
                      style={{
                        position: 'absolute',
                        left: `${left}%`,
                        top: '128px',
                        width: `${width}%`,
                        height: '26px',
                        background: selected ? '#E2C6FF' : block.implicit ? 'transparent' : issue ? '#C44' : '#7B4DFF',
                        border: block.implicit
                          ? `2px dashed ${selected ? '#FFF' : '#C9A0FF'}`
                          : selected
                            ? '3px solid #FFF'
                            : '2px solid #fff',
                        borderRadius: '4px',
                        cursor: block.implicit ? 'pointer' : 'ew-resize',
                        boxSizing: 'border-box',
                        zIndex: selected ? 11 : 5,
                        overflow: 'hidden',
                        fontSize: '0.65rem',
                        color: selected || block.implicit ? '#1a1a1a' : '#fff',
                        padding: '2px 4px',
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis'
                      }}
                      title={tooltip}
                    >
                      {(clip?.moment || block.role).slice(0, 12)}
                    </div>
                  )
                })}

                {audioBlocks.map((block) => {
                  const duration = selectedShot.durationSec || 1
                  const left = (block.t / duration) * 100
                  const width = Math.max(0.8, (block.durationSec / duration) * 100)
                  const selected = selectedAudioBlockId === block.id
                  const asset = audioAssets.find((a) => a.id === block.audioId)
                  const issue = pipeline ? audioBlockIssues(block, selectedShot, pipeline, selectedShot.id) : null
                  const voice = audioVoicesRef.current.get(block.id)
                  const mediaNote =
                    voice?.status === 'ready'
                      ? 'ready'
                      : voice?.status === 'loading'
                        ? 'loading'
                        : voice?.message || (asset ? '' : 'missing audio')
                  const tooltip = `${block.role}${block.loop ? ' loop' : ''} ${asset?.name || block.audioId}\n${block.t.toFixed(2)}s–${audioBlockEnd(block).toFixed(2)}s\nsrc ${block.sourceInSec.toFixed(2)}–${block.sourceOutSec.toFixed(2)}\nvol ${block.volume} fade ${block.fadeInSec}/${block.fadeOutSec}\n${mediaNote}${issue ? `\n${issue}` : ''}\nSilence outside bar. Play uses HTMLAudio play()/pause().`
                  return (
                    <div
                      key={block.id}
                      onPointerDown={() => {
                        setSelectedAudioBlockId(block.id)
                        setSidebarTab('background')
                        setEditingCamera(false)
                        setSelectedCameraIndex(null)
                        setEditingEffect(false)
                        setSelectedEffectIndex(null)
                        setSelectedTimedKeyId(null)
                        setSelectedClipBlockId(null)
                      }}
                      style={{
                        position: 'absolute',
                        left: `${left}%`,
                        top: '168px',
                        width: `${width}%`,
                        height: '26px',
                        background: selected ? '#FFD8A8' : issue ? '#C44' : block.role === 'music' ? '#E07A2F' : '#FFB347',
                        border: selected ? '3px solid #FFF' : '2px solid #fff',
                        borderRadius: '4px',
                        cursor: 'ew-resize',
                        boxSizing: 'border-box',
                        zIndex: selected ? 11 : 5,
                        overflow: 'hidden',
                        fontSize: '0.65rem',
                        color: selected ? '#1a1a1a' : '#1a1a1a',
                        padding: '2px 4px',
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis'
                      }}
                      title={tooltip}
                    >
                      {(asset?.name || block.role).slice(0, 12)}
                    </div>
                  )
                })}
              </div>

              {selectedTimedKeyRow && selectedShot && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <strong>Pose/State key</strong>
                  {' · '}
                  {pipeline
                    ? describeLayerLabel(
                        selectedShot.layers.find((l) => l.id === selectedTimedKeyRow.layerId) || selectedShot.layers[0],
                        pipeline
                      )
                    : selectedTimedKeyRow.layerId}
                  {' · '}
                  {timedKeyActionLabel(selectedTimedKeyRow.key)}
                  {' @ '}
                  {selectedTimedKeyRow.key.t.toFixed(2)}s
                  {' (step/hold; authored starting pose/state unchanged)'}
                </div>
              )}

              {showAddClip && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid #C9A0FF' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.35rem', fontSize: '0.9rem' }}>
                    Add clip block at {playbackTime.toFixed(2)}s
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                    Range bar with duration (not a key). Playhead drives video time so reverse scrub works.
                    Overflow needs an explicit extend — never silent. Before/after the block the clip is hidden.
                  </div>
                  {gameClips.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                      No clips in this Game. Import mp4/webm (mov attempted) in Clips first.
                    </div>
                  ) : (
                    <>
                      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                        Clip
                        <select
                          value={addClipId}
                          onChange={(e) => {
                            setAddClipId(e.target.value)
                            const c = gameClips.find((x) => x.id === e.target.value)
                            if (c) setAddClipSourceOut(String(c.durationSec))
                          }}
                          style={{ width: '100%', marginTop: '0.2rem', fontSize: '0.85rem' }}
                        >
                          {gameClips.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.moment} ({c.durationSec}s){isSupportedClipMedia(c.file) ? '' : ' — unsupported'}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                        Role
                        <select
                          value={addClipRole}
                          onChange={(e) => setAddClipRole(e.target.value as 'layer' | 'background')}
                          style={{ width: '100%', marginTop: '0.2rem', fontSize: '0.85rem' }}
                        >
                          <option value="layer">Layer (creates clip layer if needed)</option>
                          <option value="background">Background</option>
                        </select>
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <label style={{ flex: 1, fontSize: '0.75rem' }}>
                          Source in
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={addClipSourceIn}
                            onChange={(e) => setAddClipSourceIn(e.target.value)}
                            style={{ width: '100%', marginTop: '0.2rem', fontSize: '0.85rem' }}
                          />
                        </label>
                        <label style={{ flex: 1, fontSize: '0.75rem' }}>
                          Source out
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={addClipSourceOut}
                            onChange={(e) => setAddClipSourceOut(e.target.value)}
                            style={{ width: '100%', marginTop: '0.2rem', fontSize: '0.85rem' }}
                          />
                        </label>
                      </div>
                      {(() => {
                        const c = gameClips.find((x) => x.id === addClipId)
                        if (!c) return null
                        const win = defaultSourceWindow(
                          { ...c, durationSec: Number(addClipSourceOut || c.durationSec) - Number(addClipSourceIn || 0) > 0
                            ? c.durationSec
                            : c.durationSec },
                          selectedShot.durationSec,
                          playbackTime
                        )
                        const end = playbackTime + (Number(addClipSourceOut || c.durationSec) - Number(addClipSourceIn || 0))
                        if (end > selectedShot.durationSec) {
                          return (
                            <div style={{ fontSize: '0.75rem', color: '#e8c36a', marginTop: '0.35rem' }}>
                              Block would end at {end.toFixed(2)}s (shot {selectedShot.durationSec}s). You will be asked to extend — never silent.
                            </div>
                          )
                        }
                        return win.needsExtend ? (
                          <div style={{ fontSize: '0.75rem', color: '#e8c36a', marginTop: '0.35rem' }}>
                            Clip is longer than remaining shot time. Extend is opt-in.
                          </div>
                        ) : null
                      })()}
                    </>
                  )}
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={handleAddClipBlock}
                      disabled={!addClipId}
                      style={{ flex: 1, fontSize: '0.85rem', background: '#7B4DFF', color: '#fff' }}
                    >
                      Place block
                    </button>
                    <button type="button" onClick={() => setShowAddClip(false)} style={{ flex: 1, fontSize: '0.85rem' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {selectedClipBlock && selectedShot && (
                <div style={{ marginTop: '0.5rem', padding: '0.6rem', background: 'var(--bg)', borderRadius: '4px', fontSize: '0.8rem' }}>
                  <div>
                    <strong>{selectedClipBlock.implicit ? 'Implicit clip (legacy)' : 'Clip block'}</strong>
                    {' · '}
                    {selectedClipBlock.role}
                    {' · '}
                    {clips.find((c) => c.id === selectedClipBlock.clipId)?.moment || selectedClipBlock.clipId}
                    {' · '}
                    {selectedClipBlock.t.toFixed(2)}s–{clipBlockEnd(selectedClipBlock).toFixed(2)}s
                  </div>
                  <div style={{ color: 'var(--muted)', marginTop: '0.2rem', fontSize: '0.75rem' }}>
                    Half-open [t, t+duration). Outside the bar the clip is not drawn (not freeze-frame).
                    {selectedClipBlock.implicit
                      ? ' Legacy layer.clipId / backgroundClipId plays from 0 without extending the shot until you convert it to an explicit block.'
                      : ' Drag the bar to move (clamped inside the shot). Drag edges to trim. Play/pause/stop/loop and reverse scrub seek source time.'}
                  </div>
                  {(() => {
                    const video = videosRef.current.get(selectedClipBlock.clipId)
                    const clip = clips.find((c) => c.id === selectedClipBlock.clipId)
                    if (!clip) return <div style={{ color: '#ff8a8a', marginTop: '0.25rem' }}>Missing clip library item</div>
                    if (video?.status === 'loading') return <div style={{ color: '#9ad', marginTop: '0.25rem' }}>Loading media… seeking when ready</div>
                    if (video && video.status !== 'ready') {
                      return <div style={{ color: '#ff8a8a', marginTop: '0.25rem' }}>{video.message}</div>
                    }
                    if (video?.status === 'ready' && video.durationSec && Math.abs(video.durationSec - clip.durationSec) > 0.2) {
                      return (
                        <div style={{ color: '#e8c36a', marginTop: '0.25rem' }}>
                          Host duration {video.durationSec.toFixed(2)}s vs library {clip.durationSec}s — using library trim window
                        </div>
                      )
                    }
                    return video?.status === 'ready' ? (
                      <div style={{ color: '#9ad', marginTop: '0.25rem' }}>Seek-ready · forge-file preview</div>
                    ) : null
                  })()}
                  {selectedClipBlock.implicit ? (
                    <button
                      type="button"
                      onClick={handlePromoteImplicitBlock}
                      style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}
                    >
                      Convert to explicit block
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <label style={{ fontSize: '0.75rem' }}>
                        Start
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={clipTimeDraft}
                          onChange={(e) => setClipTimeDraft(e.target.value)}
                          onBlur={handleCommitClipBlockEdits}
                          style={{ width: '4.5rem', marginLeft: '0.25rem' }}
                        />
                      </label>
                      <label style={{ fontSize: '0.75rem' }}>
                        In
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={clipInDraft}
                          onChange={(e) => setClipInDraft(e.target.value)}
                          onBlur={handleCommitClipBlockEdits}
                          style={{ width: '4.5rem', marginLeft: '0.25rem' }}
                        />
                      </label>
                      <label style={{ fontSize: '0.75rem' }}>
                        Out
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={clipOutDraft}
                          onChange={(e) => setClipOutDraft(e.target.value)}
                          onBlur={handleCommitClipBlockEdits}
                          style={{ width: '4.5rem', marginLeft: '0.25rem' }}
                        />
                      </label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        {selectedClipBlock.durationSec.toFixed(2)}s
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteClipBlockId(selectedClipBlock.id)}
                        style={{ fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }}
                      >
                        Delete block
                      </button>
                    </div>
                  )}
                </div>
              )}

              {showAddAudio && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid #FFB347' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Add audio at {playbackTime.toFixed(1)}s
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.45rem' }}>
                    Duration defaults to remaining shot ({remainingShotForPlayhead.toFixed(2)}s). Library file stays full.
                    Loop repeats the source inside the shot. Extend only after confirm.
                  </div>
                  {audioAssets.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      Import audio in Library → Audio for this Game first.
                    </div>
                  ) : (
                    <>
                      <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.35rem' }}>
                        Asset
                        <select
                          value={addAudioId}
                          onChange={(e) => {
                            setAddAudioId(e.target.value)
                            const a = audioAssets.find((x) => x.id === e.target.value)
                            if (a && selectedShot) {
                              setAddAudioLoop(defaultLoopForAudioKind(a.kind))
                              setAddAudioSourceOut(String(a.durationSec))
                              const remaining = remainingShotTime(selectedShot.durationSec, playbackTime)
                              setAddAudioDuration(
                                remaining > 0 ? String(Number(remaining.toFixed(3))) : String(a.durationSec)
                              )
                            }
                          }}
                          style={{ width: '100%', marginTop: '0.2rem' }}
                        >
                          {audioAssets.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.kind} · {a.name} ({a.durationSec.toFixed(2)}s)
                            </option>
                          ))}
                        </select>
                      </label>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: '0.75rem' }}>
                          In
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={addAudioSourceIn}
                            onChange={(e) => setAddAudioSourceIn(e.target.value)}
                            style={{ width: '4.5rem', marginLeft: '0.25rem' }}
                          />
                        </label>
                        <label style={{ fontSize: '0.75rem' }}>
                          Out
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={addAudioSourceOut}
                            onChange={(e) => setAddAudioSourceOut(e.target.value)}
                            style={{ width: '4.5rem', marginLeft: '0.25rem' }}
                          />
                        </label>
                        <label style={{ fontSize: '0.75rem' }}>
                          <input
                            type="checkbox"
                            checked={addAudioLoop}
                            onChange={(e) => setAddAudioLoop(e.target.checked)}
                            style={{ marginRight: '0.25rem' }}
                          />
                          Loop
                        </label>
                        <label style={{ fontSize: '0.75rem' }}>
                          Duration
                          <input
                            type="number"
                            step="0.05"
                            min="0.05"
                            value={addAudioDuration}
                            onChange={(e) => setAddAudioDuration(e.target.value)}
                            style={{ width: '4.5rem', marginLeft: '0.25rem' }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={applyFitRemainingToAddForm}
                          style={{ fontSize: '0.75rem' }}
                          title="Set Duration to remaining shot time. Loop keeps the full library source. Does not extend the shot."
                        >
                          Fit remaining shot
                        </button>
                        <label style={{ fontSize: '0.75rem' }}>
                          Vol
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            value={addAudioVolume}
                            onChange={(e) => setAddAudioVolume(e.target.value)}
                            style={{ width: '3.5rem', marginLeft: '0.25rem' }}
                          />
                        </label>
                        <label style={{ fontSize: '0.75rem' }}>
                          Fade in
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={addAudioFadeIn}
                            onChange={(e) => setAddAudioFadeIn(e.target.value)}
                            style={{ width: '3.5rem', marginLeft: '0.25rem' }}
                          />
                        </label>
                        <label style={{ fontSize: '0.75rem' }}>
                          Fade out
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={addAudioFadeOut}
                            onChange={(e) => setAddAudioFadeOut(e.target.value)}
                            style={{ width: '3.5rem', marginLeft: '0.25rem' }}
                          />
                        </label>
                      </div>
                    </>
                  )}
                  {audioError && (
                    <div style={{ color: '#ff8a8a', fontSize: '0.75rem', marginTop: '0.35rem' }}>{audioError}</div>
                  )}
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={handleAddAudioBlock}
                      disabled={!addAudioId}
                      style={{ flex: 1, fontSize: '0.85rem', background: '#E07A2F', color: '#fff' }}
                    >
                      Place block
                    </button>
                    <button type="button" onClick={() => setShowAddAudio(false)} style={{ flex: 1, fontSize: '0.85rem' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {selectedAudioBlock && selectedShot && (
                <div style={{ marginTop: '0.5rem', padding: '0.6rem', background: 'var(--bg)', borderRadius: '4px', fontSize: '0.8rem' }}>
                  <div>
                    <strong>Audio block</strong>
                    {' · '}
                    {selectedAudioBlock.role}
                    {selectedAudioBlock.loop ? ' loop' : ''}
                    {' · '}
                    {audioAssets.find((a) => a.id === selectedAudioBlock.audioId)?.name || selectedAudioBlock.audioId}
                    {' · '}
                    {selectedAudioBlock.t.toFixed(2)}s–{audioBlockEnd(selectedAudioBlock).toFixed(2)}s
                  </div>
                  <div style={{ color: 'var(--muted)', marginTop: '0.2rem', fontSize: '0.75rem' }}>
                    Half-open [t, t+duration). Silence outside. Paused/reverse scrub seeks silently.
                    Play uses HTMLAudioElement.play()/pause() — not paused currentTime. Clips stay muted.
                    Fit remaining shot clamps this block to the current shot end; it does not restore a previous shot length.
                  </div>
                  {(() => {
                    const voice = audioVoicesRef.current.get(selectedAudioBlock.id)
                    const asset = audioAssets.find((a) => a.id === selectedAudioBlock.audioId)
                    if (!asset) return <div style={{ color: '#ff8a8a', marginTop: '0.25rem' }}>Missing library audio</div>
                    if (voice?.status === 'loading') return <div style={{ color: '#9ad', marginTop: '0.25rem' }}>Loading audio…</div>
                    if (voice && voice.status !== 'ready') {
                      return <div style={{ color: '#ff8a8a', marginTop: '0.25rem' }}>{voice.message}</div>
                    }
                    return voice?.status === 'ready' ? (
                      <div style={{ color: '#9ad', marginTop: '0.25rem' }}>
                        {playbackState === 'playing' ? 'Audible play()/pause() · forge-file' : 'Paused — silent seek'}
                      </div>
                    ) : null
                  })()}
                  {audioError && (
                    <div style={{ color: '#ff8a8a', marginTop: '0.25rem' }}>{audioError}</div>
                  )}
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ fontSize: '0.75rem' }}>
                      Start
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={audioTimeDraft}
                        onChange={(e) => setAudioTimeDraft(e.target.value)}
                        onBlur={() => void handleCommitAudioBlockEdits()}
                        style={{ width: '4.5rem', marginLeft: '0.25rem' }}
                      />
                    </label>
                    <label style={{ fontSize: '0.75rem' }}>
                      In
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={audioInDraft}
                        onChange={(e) => setAudioInDraft(e.target.value)}
                        onBlur={() => void handleCommitAudioBlockEdits()}
                        style={{ width: '4.5rem', marginLeft: '0.25rem' }}
                      />
                    </label>
                    <label style={{ fontSize: '0.75rem' }}>
                      Out
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={audioOutDraft}
                        onChange={(e) => setAudioOutDraft(e.target.value)}
                        onBlur={() => void handleCommitAudioBlockEdits()}
                        style={{ width: '4.5rem', marginLeft: '0.25rem' }}
                      />
                    </label>
                    <label style={{ fontSize: '0.75rem' }}>
                      <input
                        type="checkbox"
                        checked={audioLoopDraft}
                        onChange={(e) => {
                          const loop = e.target.checked
                          setAudioLoopDraft(loop)
                          void handleCommitAudioBlockEdits(loop)
                        }}
                        style={{ marginRight: '0.25rem' }}
                      />
                      Loop
                    </label>
                    <label style={{ fontSize: '0.75rem' }}>
                      Dur
                      <input
                        type="number"
                        step="0.05"
                        min="0.05"
                        value={audioDurationDraft}
                        onChange={(e) => setAudioDurationDraft(e.target.value)}
                        onBlur={() => void handleCommitAudioBlockEdits()}
                        style={{ width: '4.5rem', marginLeft: '0.25rem' }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleFitAudioBlockToShot()}
                      style={{ fontSize: '0.75rem' }}
                      title="Clamp this block to the current shot duration. Library source is kept. Does not restore a previous shot length."
                    >
                      Fit remaining shot
                    </button>
                    <label style={{ fontSize: '0.75rem' }}>
                      Vol
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={audioVolumeDraft}
                        onChange={(e) => setAudioVolumeDraft(e.target.value)}
                        onBlur={() => void handleCommitAudioBlockEdits()}
                        style={{ width: '3.5rem', marginLeft: '0.25rem' }}
                      />
                    </label>
                    <label style={{ fontSize: '0.75rem' }}>
                      Fade in
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={audioFadeInDraft}
                        onChange={(e) => setAudioFadeInDraft(e.target.value)}
                        onBlur={() => void handleCommitAudioBlockEdits()}
                        style={{ width: '3.5rem', marginLeft: '0.25rem' }}
                      />
                    </label>
                    <label style={{ fontSize: '0.75rem' }}>
                      Fade out
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={audioFadeOutDraft}
                        onChange={(e) => setAudioFadeOutDraft(e.target.value)}
                        onBlur={() => void handleCommitAudioBlockEdits()}
                        style={{ width: '3.5rem', marginLeft: '0.25rem' }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAudioBlockId(selectedAudioBlock.id)}
                      style={{ fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }}
                    >
                      Delete block
                    </button>
                  </div>
                </div>
              )}
              
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
            
            <ShotBackgroundPicker
              gameId={gameId}
              shot={selectedShot}
              visualAssets={visualAssets}
              assetStates={assetStates}
              error={backgroundError}
              onSelectLibrary={handleSelectLibraryBackground}
              onChangeState={handleChangeLibraryBackgroundState}
              onImport={handleImportBackgroundImage}
              onClear={handleClearBackgroundImage}
            />

            {/* Background Clip */}
            <div>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem', fontWeight: 'bold' }}>Clip:</div>
              <select
                value={selectedShot.backgroundClipId || ''}
                onChange={async (e) => {
                  const clipId = e.target.value || undefined
                  await window.indieForge.pipeline.updateShot(projectId!, selectedShotId!, { backgroundClipId: clipId || null })
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
                {gameClips.map(clip => (
                  <option key={clip.id} value={clip.id}>
                    {clip.moment || 'clip'} ({clip.durationSec}s){isSupportedClipMedia(clip.file) ? '' : ' — unsupported'}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                Dropdown sets legacy backgroundClipId (implicit play from 0, never extends the shot).
                Timed placement lives on the Clips timeline track. An explicit background block replaces implicit playback.
                {(selectedShot.backgroundImage || selectedShot.backgroundVisualAssetId) && selectedShot.backgroundClipId ? ' Clip draws over the static image while the block is active.' : ''}
              </div>
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.35rem', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '1rem', margin: 0 }}>Layers</h3>
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              <button 
                type="button" 
                onClick={() => { setShowAddCharacter(true); setShowAddAsset(false); setShowAddText(false) }} 
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.4rem' }}
              >
                + Character / Pose
              </button>
              <button 
                type="button" 
                onClick={async () => {
                  setShowAddAsset(true); setShowAddCharacter(false); setShowAddText(false)
                  try {
                    const assets = await window.indieForge.visualAssets.list(gameId)
                    setLibraryAssets(assets)
                  } catch (err) {
                    setLayerError(err instanceof Error ? err.message : 'Failed to list assets')
                  }
                }} 
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.4rem' }}
              >
                + Asset
              </button>
              <button 
                type="button" 
                onClick={() => { setShowAddText(true); setShowAddCharacter(false); setShowAddAsset(false) }} 
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.4rem' }}
              >
                + Text
              </button>
            </div>
          </div>

          {layerError && (
            <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: 'var(--danger, #7a2020)', color: '#fff', borderRadius: '4px', fontSize: '0.8rem' }}>
              {layerError}
            </div>
          )}
          
          {showAddCharacter && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid var(--forge-gold)' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Add Character / Pose</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                Adds the character with its first approved pose. Change the starting pose after adding.
              </div>
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

          {showAddAsset && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid var(--forge-gold)' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Add Visual Asset</div>
              <select
                value={addAssetId}
                onChange={async (e) => {
                  const id = e.target.value
                  setAddAssetId(id)
                  setAddAssetStateId('')
                  if (!id) { setLibraryStates([]); return }
                  try {
                    const states = await window.indieForge.assetStates.list(id)
                    setLibraryStates(states)
                  } catch {
                    setLibraryStates(assetStates.filter(s => s.assetId === id))
                  }
                }}
                style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.85rem' }}
              >
                <option value="">Select asset…</option>
                {(libraryAssets.length ? libraryAssets : visualAssets).map(asset => (
                  <option key={asset.id} value={asset.id}>{asset.name} ({asset.category})</option>
                ))}
              </select>
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                Starting state
                <select
                  value={addAssetStateId}
                  onChange={(e) => setAddAssetStateId(e.target.value)}
                  style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.85rem' }}
                >
                  <option value="">Default / static image</option>
                  {libraryStates.map(state => (
                    <option key={state.id} value={state.id}>{state.name}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={handleAddAssetLayer} style={{ width: '100%', fontSize: '0.85rem', background: 'var(--forge-gold)', color: '#000' }}>
                Add to shot
              </button>
              <button type="button" onClick={() => setShowAddAsset(false)} style={{ width: '100%', marginTop: '0.35rem', fontSize: '0.85rem' }}>
                Cancel
              </button>
            </div>
          )}

          {showAddText && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: '4px', border: '2px solid var(--forge-gold)' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Add Text</div>
              <textarea
                value={addTextContent}
                onChange={(e) => setAddTextContent(e.target.value)}
                rows={3}
                style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.85rem' }}
              />
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                Font
                <select
                  value={addTextFont}
                  onChange={(e) => setAddTextFont(e.target.value)}
                  style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.85rem' }}
                >
                  <option value={DEFAULT_FONT_REF}>default (system sans-serif)</option>
                  {fonts.map(font => (
                    <option key={font.id} value={font.id}>{font.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                Palette
                <select
                  value={addTextPalette}
                  onChange={(e) => setAddTextPalette(e.target.value)}
                  style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.85rem' }}
                >
                  <option value={DEFAULT_PALETTE_REF}>default (#ffffff)</option>
                  {palettes.map(pal => (
                    <option key={pal.id} value={pal.id}>{pal.name}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={handleAddTextLayer} style={{ width: '100%', fontSize: '0.85rem', background: 'var(--forge-gold)', color: '#000' }}>
                Add to shot
              </button>
              <button type="button" onClick={() => setShowAddText(false)} style={{ width: '100%', marginTop: '0.35rem', fontSize: '0.85rem' }}>
                Cancel
              </button>
            </div>
          )}
          
          {selectedShot.layers
            .sort((a, b) => b.zOrder - a.zOrder)
            .map(layer => {
              const character = layer.characterId ? characters.find(c => c.id === layer.characterId) : null
              const pose = layer.poseId ? poses.find(p => p.id === layer.poseId) : null
              const kind = getLayerKind(layer)
              const label = pipeline ? describeLayerLabel(layer, pipeline) : kind
              const mediaErr = pipeline && kind !== 'text' ? resolveLayerImagePath(layer, pipeline).error : undefined
              const textErr = pipeline && kind === 'text' ? resolveTextStyle(layer, pipeline, gameId) : null
              const refError = mediaErr || textErr?.fontError || textErr?.paletteError
              
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
                    fontSize: '0.85rem',
                    opacity: layer.visible === false ? 0.45 : 1
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 'bold' }}>z{layer.zOrder} {layer.visible === false ? '(hidden)' : ''}</span>
                    <span style={{ opacity: 0.7 }}>{layer.scale.toFixed(2)}x • {layer.rotation.toFixed(0)}°</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{label}</div>
                  {character && pose && <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Starting pose: {pose.slot}</div>}
                  {layer.visualAssetId && (
                    <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                      Starting state:{' '}
                      {layer.assetStateId
                        ? assetStates.find((s) => s.id === layer.assetStateId)?.name || layer.assetStateId
                        : 'default / static'}
                    </div>
                  )}
                  {selectedLayerId === layer.id && layer.visualAssetId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleFitSourceAspect(layer.id)
                      }}
                      style={{ width: '100%', marginTop: '0.35rem', fontSize: '0.75rem', padding: '0.3rem' }}
                    >
                      Reset to source aspect
                    </button>
                  )}
                  {layer.clipId && (() => {
                    const sample = sampleLayerClip(selectedShot, clips, layer.id, playbackTime)
                    const video = videosRef.current.get(layer.clipId)
                    if (!sample) {
                      return (
                        <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', opacity: 0.8 }}>
                          CLIP hidden (outside block)
                        </div>
                      )
                    }
                    return (
                      <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', opacity: 0.9 }}>
                        CLIP src {sample.sourceTimeSec.toFixed(2)}s
                        {sample.implicit ? ' (implicit)' : ''}
                        {video?.status === 'loading' ? ' · loading' : ''}
                        {video && video.status !== 'ready' && video.status !== 'loading' ? ' · unavailable' : ''}
                      </div>
                    )
                  })()}
                  {(() => {
                    const sample = sampleLayerTimedKeys(layer, playbackTime)
                    if (!sample) return null
                    return (
                      <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', opacity: 0.9 }}>
                        TIMED @ {sample.t.toFixed(2)}s
                        {sample.poseId
                          ? `: ${poses.find((p) => p.id === sample.poseId)?.slot || sample.poseId}`
                          : sample.assetStateId
                            ? `: ${assetStates.find((s) => s.id === sample.assetStateId)?.name || sample.assetStateId}`
                            : ''}
                      </div>
                    )
                  })()}
                  {previewSnapshot.overrides[layer.id] && (
                    <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', fontWeight: 'bold' }}>
                      PREVIEW
                      {previewSnapshot.overrides[layer.id].poseId
                        ? `: ${poses.find(p => p.id === previewSnapshot.overrides[layer.id].poseId)?.slot || previewSnapshot.overrides[layer.id].poseId}`
                        : previewSnapshot.overrides[layer.id].assetStateId
                          ? `: ${assetStates.find(s => s.id === previewSnapshot.overrides[layer.id].assetStateId)?.name || previewSnapshot.overrides[layer.id].assetStateId}`
                          : previewSnapshot.overrides[layer.id].visible === false
                            ? ': hidden'
                            : previewSnapshot.overrides[layer.id].text !== undefined
                              ? `: “${previewSnapshot.overrides[layer.id].text}”`
                              : ''}
                    </div>
                  )}
                  {refError && (
                    <div style={{ fontSize: '0.75rem', color: selectedLayerId === layer.id ? '#5a0000' : '#ff8a8a', marginTop: '0.25rem' }}>
                      {refError}
                    </div>
                  )}
                  {selectedLayerId === layer.id && character && (
                    <label style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                      Starting pose
                      <select
                        value={layer.poseId || ''}
                        onChange={(e) => handleChangePose(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          marginTop: '0.25rem',
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
                    </label>
                  )}
                  {selectedLayerId === layer.id && layer.visualAssetId && (
                    <label style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                      Starting state
                      <select
                        value={layer.assetStateId || ''}
                        onChange={async (e) => {
                          const value = e.target.value
                          await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, layer.id, {
                            assetStateId: value ? value : null
                          })
                          const updated = await window.indieForge.projects.open(projectId!)
                          setActiveProject(updated)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          marginTop: '0.25rem',
                          padding: '0.25rem',
                          fontSize: '0.8rem',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          color: 'var(--text)'
                        }}
                      >
                        <option value="">Default / static image</option>
                        {assetStates.filter(s => s.assetId === layer.visualAssetId).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {selectedLayerId === layer.id && (layer.characterId || layer.visualAssetId) && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.15)' }}
                    >
                      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.35rem' }}>
                        Timed pose/state keys
                      </div>
                      {(layer.timedKeys || []).length === 0 && (
                        <div style={{ fontSize: '0.7rem', opacity: 0.75, marginBottom: '0.35rem' }}>
                          None. Add at playhead — same layer, not a duplicate.
                        </div>
                      )}
                      {(layer.timedKeys || [])
                        .slice()
                        .sort((a, b) => a.t - b.t)
                        .map((key) => {
                          const selected = selectedTimedKeyId === key.id
                          const issue = pipeline ? timedKeyIssues(key, layer, pipeline, selectedShot.id) : null
                          return (
                            <div
                              key={key.id}
                              onClick={() => setSelectedTimedKeyId(key.id)}
                              style={{
                                marginBottom: '0.35rem',
                                padding: '0.35rem',
                                borderRadius: '4px',
                                background: selected ? 'rgba(0,0,0,0.2)' : 'transparent',
                                border: selected ? '1px solid var(--forge-gold)' : '1px solid transparent'
                              }}
                            >
                              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                <input
                                  type="number"
                                  min={0}
                                  max={selectedShot.durationSec}
                                  step={0.01}
                                  value={selected ? timedKeyTimeDraft : key.t.toFixed(2)}
                                  onFocus={() => {
                                    setSelectedTimedKeyId(key.id)
                                    setTimedKeyTimeDraft(key.t.toFixed(2))
                                  }}
                                  onChange={(e) => setTimedKeyTimeDraft(e.target.value)}
                                  onBlur={() => {
                                    const next = Number(timedKeyTimeDraft)
                                    if (Number.isFinite(next) && Math.abs(next - key.t) >= 0.0005) {
                                      handleUpdateTimedKey(key.id, { t: next })
                                    } else {
                                      setTimedKeyTimeDraft(key.t.toFixed(2))
                                    }
                                  }}
                                  style={{ width: '4.2rem', fontSize: '0.75rem' }}
                                />
                                <span style={{ fontSize: '0.7rem' }}>s</span>
                                {layer.characterId ? (
                                  <select
                                    value={key.action.type === 'setPose' ? key.action.poseId : ''}
                                    onChange={(e) =>
                                      handleUpdateTimedKey(key.id, {
                                        action: { type: 'setPose', poseId: e.target.value }
                                      })
                                    }
                                    style={{ flex: 1, fontSize: '0.75rem' }}
                                  >
                                    {poses
                                      .filter((p) => p.characterId === layer.characterId)
                                      .map((p) => (
                                        <option key={p.id} value={p.id}>{p.slot}{p.status !== 'approved' ? ` (${p.status})` : ''}</option>
                                      ))}
                                  </select>
                                ) : (
                                  <select
                                    value={key.action.type === 'setState' ? key.action.stateId : ''}
                                    onChange={(e) =>
                                      handleUpdateTimedKey(key.id, {
                                        action: { type: 'setState', stateId: e.target.value }
                                      })
                                    }
                                    style={{ flex: 1, fontSize: '0.75rem' }}
                                  >
                                    {assetStates
                                      .filter((s) => s.assetId === layer.visualAssetId)
                                      .map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                      ))}
                                  </select>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteTimedKeyId(key.id)}
                                  style={{ fontSize: '0.7rem', padding: '0.15rem 0.35rem', background: 'var(--danger)', color: 'white' }}
                                >
                                  Delete
                                </button>
                              </div>
                              {issue && (
                                <div style={{ fontSize: '0.7rem', color: '#ff8a8a', marginTop: '0.2rem' }}>{issue}</div>
                              )}
                            </div>
                          )
                        })}
                      <button
                        type="button"
                        onClick={handleAddTimedKey}
                        style={{ width: '100%', fontSize: '0.75rem', padding: '0.25rem', marginTop: '0.15rem' }}
                      >
                        + Key @ {playbackTime.toFixed(2)}s
                      </button>
                    </div>
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
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={selectedLayer.visible !== false}
                  onChange={async (e) => {
                    await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                      visible: e.target.checked
                    })
                    const updated = await window.indieForge.projects.open(projectId!)
                    setActiveProject(updated)
                  }}
                />
                Visible
              </label>

              {getLayerKind(selectedLayer) === 'text' && (
                <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                    Text
                    <textarea
                      value={selectedLayer.text || ''}
                      onChange={async (e) => {
                        await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                          text: e.target.value
                        })
                        const updated = await window.indieForge.projects.open(projectId!)
                        setActiveProject(updated)
                      }}
                      rows={3}
                      style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.85rem' }}
                    />
                  </label>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                    Font
                    <select
                      value={selectedLayer.fontRef || DEFAULT_FONT_REF}
                      onChange={async (e) => {
                        await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                          fontRef: e.target.value
                        })
                        const updated = await window.indieForge.projects.open(projectId!)
                        setActiveProject(updated)
                      }}
                      style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.85rem' }}
                    >
                      <option value={DEFAULT_FONT_REF}>default (system sans-serif)</option>
                      {fonts.map(font => (
                        <option key={font.id} value={font.id}>{font.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'block', fontSize: '0.75rem' }}>
                    Palette
                    <select
                      value={selectedLayer.paletteRef || DEFAULT_PALETTE_REF}
                      onChange={async (e) => {
                        await window.indieForge.pipeline.updateLayer(projectId!, selectedShotId!, selectedLayer.id, {
                          paletteRef: e.target.value
                        })
                        const updated = await window.indieForge.projects.open(projectId!)
                        setActiveProject(updated)
                      }}
                      style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.85rem' }}
                    >
                      <option value={DEFAULT_PALETTE_REF}>default (#ffffff)</option>
                      {palettes.map(pal => (
                        <option key={pal.id} value={pal.id}>{pal.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

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
              {pipeline && selectedShotId && (
                <EventBindingsPanel
                  gameId={gameId}
                  shotId={selectedShotId}
                  layers={selectedShot.layers}
                  pipeline={pipeline}
                  poses={poses}
                  assetStates={assetStates}
                  events={eventDefinitions}
                  bindings={eventBindings}
                  previewSnapshot={previewSnapshot}
                  audioAssets={audioAssets}
                  sfxVoiceStatus={[...eventSfxVoicesRef.current.values()].map((v) => ({
                    bindingId: v.bindingId,
                    status: v.status,
                    message: v.message
                  }))}
                  mixerError={eventSfxError}
                  onProjectChanged={async () => {
                    const updated = await window.indieForge.projects.open(projectId!)
                    setActiveProject(updated)
                  }}
                  onFire={(eventId, payload) => {
                    setEventSfxError(null)
                    previewEngineRef.current.fire(eventId, performance.now(), payload as PrimitivePayload | undefined)
                    commitPreview()
                  }}
                  onResetPreview={resetEventPreview}
                />
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
      {confirmDeleteLayer && (
        <ConfirmModal
          title="Delete layer"
          message="Delete this layer from the shot? This does not delete the Library asset, character, or pose."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteLayerNow}
          onCancel={() => setConfirmDeleteLayer(false)}
        />
      )}
      {confirmDeleteTimedKeyId && (
        <ConfirmModal
          title="Delete timed key"
          message="Delete this pose/state key from the layer timeline? The layer and its authored starting pose/state stay."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteTimedKeyNow}
          onCancel={() => setConfirmDeleteTimedKeyId(null)}
        />
      )}
      {confirmDeleteClipBlockId && (
        <ConfirmModal
          title="Delete clip block"
          message="Remove this timed clip block from the shot? The library clip is not deleted. Legacy layer.clipId / backgroundClipId may still play implicitly from 0."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteClipBlockNow}
          onCancel={() => setConfirmDeleteClipBlockId(null)}
        />
      )}
      {confirmDeleteAudioBlockId && (
        <ConfirmModal
          title="Delete audio block"
          message="Remove this timed audio block from the shot? The library audio is not deleted."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteAudioBlockNow}
          onCancel={() => setConfirmDeleteAudioBlockId(null)}
        />
      )}
      {pendingExtend && (
        <ConfirmModal
          title="Extend shot?"
          message={pendingExtend.message}
          confirmLabel="Extend shot"
          onConfirm={confirmExtendShotNow}
          onCancel={() => setPendingExtend(null)}
        />
      )}
    </div>
  )
}
