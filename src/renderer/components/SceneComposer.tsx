import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type {
  AnchorPoint,
  AssetFormat,
  AssetRole,
  AssetSlot,
  GameAsset,
  GameScene,
  NormalizedRect,
  SceneReferenceRole
} from '@shared/types/project'
import { ensureSceneBlueprint, normalizeRect, slotToAssetType } from '@shared/sceneDefaults'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import { StatusBadge } from './shared'
import { AssetInspirationPanel } from './AssetInspirationPanel'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

const ROLES: AssetRole[] = [
  'scene_background',
  'scene_foreground',
  'playable_character',
  'npc',
  'interactive_object',
  'environment_prop',
  'visual_effect',
  'gameplay_overlay',
  'hud_element',
  'menu_element',
  'audio_cue',
  'music_loop',
  'voice_line'
]

const FORMATS: AssetFormat[] = [
  'static_image',
  'frame_animation',
  'sprite_sheet',
  'layered_background',
  'tile_set',
  'nine_slice',
  'audio_clip',
  'music_track'
]

const ANCHORS: AnchorPoint[] = [
  'top_left',
  'top_center',
  'top_right',
  'center_left',
  'center',
  'center_right',
  'bottom_left',
  'bottom_center',
  'bottom_right'
]

const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type ResizeHandle = (typeof RESIZE_HANDLES)[number]
type DragMode = 'move' | ResizeHandle

function studioPath(projectId: string, asset: GameAsset, craftPath?: string): string {
  if (['music', 'sound_effect', 'voice_line'].includes(asset.type)) {
    return `/projects/${projectId}/audio`
  }
  if (asset.type === 'background') return `/projects/${projectId}/background/${asset.id}`
  if (asset.type === 'animation' && craftPath === 'pixel_silhouette') {
    return `/projects/${projectId}/motion/${asset.id}`
  }
  if (asset.type === 'animation') return `/projects/${projectId}/animation/${asset.id}`
  return `/projects/${projectId}/craft/${asset.id}`
}

function hitTestSlot(
  slots: AssetSlot[],
  getBounds: (slot: AssetSlot) => NormalizedRect,
  boardEl: HTMLDivElement,
  clientX: number,
  clientY: number,
  skipIds: Set<string>
): AssetSlot | null {
  const rect = boardEl.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const nx = (clientX - rect.left) / rect.width
  const ny = (clientY - rect.top) / rect.height
  if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return null

  const hits = slots
    .filter((s) => !skipIds.has(s.id))
    .map((s) => ({ slot: s, bounds: getBounds(s) }))
    .filter(
      ({ bounds }) =>
        nx >= bounds.x &&
        ny >= bounds.y &&
        nx <= bounds.x + bounds.width &&
        ny <= bounds.y + bounds.height
    )

  if (hits.length === 0) return null

  hits.sort((a, b) => {
    if (b.slot.layer !== a.slot.layer) return b.slot.layer - a.slot.layer
    const areaA = a.bounds.width * a.bounds.height
    const areaB = b.bounds.width * b.bounds.height
    return areaA - areaB
  })

  return hits[0].slot
}

function boardSize(viewport: { width: number; height: number }, max = 1024): {
  width: number
  height: number
} {
  const ratio = viewport.width / viewport.height
  if (ratio >= 1) {
    const width = Math.min(max, viewport.width)
    return { width, height: Math.round(width / ratio) }
  }
  const height = Math.min(max, viewport.height)
  return { width: Math.round(height * ratio), height }
}

function clampBounds(b: NormalizedRect): NormalizedRect {
  const min = 0.04
  const width = Math.max(min, Math.min(1, b.width))
  const height = Math.max(min, Math.min(1, b.height))
  return {
    x: Math.max(0, Math.min(1 - width, b.x)),
    y: Math.max(0, Math.min(1 - height, b.y)),
    width,
    height
  }
}

function applyDrag(
  start: NormalizedRect,
  mode: DragMode,
  dx: number,
  dy: number
): NormalizedRect {
  if (mode === 'move') {
    return clampBounds({
      ...start,
      x: start.x + dx,
      y: start.y + dy
    })
  }

  let { x, y, width, height } = start
  const right = x + width
  const bottom = y + height

  if (mode.includes('e')) width = right + dx - x
  if (mode.includes('s')) height = bottom + dy - y
  if (mode.includes('w')) {
    const nextX = x + dx
    width = right - nextX
    x = nextX
  }
  if (mode.includes('n')) {
    const nextY = y + dy
    height = bottom - nextY
    y = nextY
  }

  return clampBounds({ x, y, width, height })
}

function SlotPreview({
  asset,
  reloadKey
}: {
  asset?: GameAsset
  reloadKey?: number
}) {
  const src = useLocalFilePreview(asset?.filePath, reloadKey)
  if (src) {
    return <img src={src} alt="" className="scene-slot-img preview-pixel" draggable={false} />
  }
  return <span className="scene-slot-placeholder">◇</span>
}

function BoardBackdrop({
  asset,
  reloadKey
}: {
  asset?: GameAsset
  reloadKey?: number
}) {
  const src = useLocalFilePreview(asset?.filePath, reloadKey)
  if (!src) return null
  return <img src={src} alt="" className="scene-board-backdrop preview-pixel" draggable={false} />
}

function SceneRefThumb({ filePath }: { filePath: string }) {
  const src = useLocalFilePreview(filePath)
  return src ? (
    <img src={src} alt="" className="scene-ref-thumb preview-pixel" />
  ) : (
    <div className="scene-ref-thumb scene-ref-thumb-empty">◇</div>
  )
}

export function SceneComposer() {
  const { projectId, sceneId } = useParams()
  const navigate = useNavigate()
  const { activeProject, openProject, setActiveProject, updateActiveAsset } = useProjectStore()
  const { setError } = useUIStore()

  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [refinePrompt, setRefinePrompt] = useState('')
  const [previewKeys, setPreviewKeys] = useState<Record<string, number>>({})
  const [draftBounds, setDraftBounds] = useState<Record<string, NormalizedRect>>({})
  const [selectedInspirationIds, setSelectedInspirationIds] = useState<string[]>([])
  const [sceneRefRole, setSceneRefRole] = useState<SceneReferenceRole>('camera')

  const boardRef = useRef<HTMLDivElement>(null)
  const draftBoundsRef = useRef(draftBounds)
  draftBoundsRef.current = draftBounds
  const dragRef = useRef<{
    slotId: string
    mode: DragMode
    startBounds: NormalizedRect
    originX: number
    originY: number
    latestBounds: NormalizedRect
    pointerId: number
  } | null>(null)

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  const scene: GameScene | undefined = useMemo(() => {
    if (!activeProject || !sceneId) return undefined
    const raw = activeProject.scenes.find((s) => s.id === sceneId)
    return raw ? ensureSceneBlueprint(raw, activeProject.styleGuide) : undefined
  }, [activeProject, sceneId])

  useEffect(() => {
    if (scene) setDescriptionDraft(scene.description)
  }, [scene?.id, scene?.description])

  useEffect(() => {
    if (!selectedSlotId && scene?.assetSlots?.length) {
      setSelectedSlotId(scene.assetSlots[0].id)
    }
  }, [scene?.assetSlots, selectedSlotId])

  useEffect(() => {
    setRefinePrompt('')
  }, [selectedSlotId])

  const selectedSlot =
    scene?.assetSlots?.find((s) => s.id === selectedSlotId) ?? null
  const selectedAsset =
    selectedSlot?.assetId && activeProject
      ? activeProject.assets.find((a) => a.id === selectedSlot.assetId)
      : undefined

  useEffect(() => {
    const ids = selectedAsset?.inspirationImages?.map((i) => i.id) ?? []
    setSelectedInspirationIds(ids)
  }, [selectedAsset?.id, selectedAsset?.inspirationImages?.length])

  const board = scene?.viewport
    ? boardSize(scene.viewport)
    : { width: 576, height: 1024 }

  const sortedSlots = useMemo(
    () => [...(scene?.assetSlots ?? [])].sort((a, b) => a.layer - b.layer),
    [scene?.assetSlots]
  )

  const backgroundAsset = useMemo(() => {
    if (!activeProject || !scene) return undefined
    const bgSlot = (scene.assetSlots ?? []).find(
      (s) =>
        (s.role === 'scene_background' || s.format === 'layered_background') && s.assetId
    )
    if (bgSlot?.assetId) {
      const a = activeProject.assets.find((x) => x.id === bgSlot.assetId)
      if (a?.filePath) return a
    }
    return activeProject.assets.find(
      (a) =>
        a.type === 'background' &&
        a.filePath &&
        (a.sceneIds.includes(scene.id) || scene.assetIds.includes(a.id))
    )
  }, [activeProject, scene])

  const linkableAssets = useMemo(() => {
    if (!activeProject) return []
    const usedElsewhere = new Set(
      (scene?.assetSlots ?? [])
        .filter((s) => s.id !== selectedSlotId && s.assetId)
        .map((s) => s.assetId as string)
    )
    return activeProject.assets
      .filter((a) => !['music', 'sound_effect', 'voice_line'].includes(a.type))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({
        asset: a,
        usedInOtherSlot: usedElsewhere.has(a.id)
      }))
  }, [activeProject, scene?.assetSlots, selectedSlotId])

  const bumpPreview = (filePath?: string) => {
    if (!filePath) return
    setPreviewKeys((keys) => ({
      ...keys,
      [filePath]: (keys[filePath] ?? 0) + 1
    }))
  }

  const styleRefCount =
    activeProject?.styleReferences?.filter((r) => r.analysis).length ?? 0

  const applyProject = (project: typeof activeProject) => {
    if (project) setActiveProject(project)
  }

  const getSlotBounds = useCallback(
    (slot: AssetSlot): NormalizedRect => draftBounds[slot.id] ?? slot.bounds,
    [draftBounds]
  )

  const persistBounds = useCallback(
    async (slotId: string, bounds: NormalizedRect) => {
      if (!projectId || !sceneId) return
      const next = clampBounds(normalizeRect(bounds))
      setDraftBounds((d) => {
        const copy = { ...d }
        delete copy[slotId]
        return copy
      })
      setError(null)
      try {
        const result = await window.indieForge.scenes.updateSlot(projectId, sceneId, slotId, {
          bounds: next
        })
        if (result.project) setActiveProject(result.project)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save slot bounds')
      }
    },
    [projectId, sceneId, setActiveProject, setError]
  )

  // Window-level listeners are more reliable than setPointerCapture in Electron.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      const boardEl = boardRef.current
      if (!drag || !boardEl) return
      if (e.pointerId !== drag.pointerId) return
      const rect = boardEl.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const dx = (e.clientX - drag.originX) / rect.width
      const dy = (e.clientY - drag.originY) / rect.height
      const next = applyDrag(drag.startBounds, drag.mode, dx, dy)
      drag.latestBounds = next
      draftBoundsRef.current = { ...draftBoundsRef.current, [drag.slotId]: next }
      setDraftBounds((d) => ({ ...d, [drag.slotId]: next }))
    }

    const onUp = (e: PointerEvent | Event) => {
      const drag = dragRef.current
      if (!drag) return
      if ('pointerId' in e && e.pointerId !== drag.pointerId) return
      dragRef.current = null
      const moved =
        Math.abs(drag.latestBounds.x - drag.startBounds.x) > 0.001 ||
        Math.abs(drag.latestBounds.y - drag.startBounds.y) > 0.001 ||
        Math.abs(drag.latestBounds.width - drag.startBounds.width) > 0.001 ||
        Math.abs(drag.latestBounds.height - drag.startBounds.height) > 0.001
      if (moved) {
        void persistBounds(drag.slotId, drag.latestBounds)
      } else {
        setDraftBounds((d) => {
          const copy = { ...d }
          delete copy[drag.slotId]
          return copy
        })
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onUp)
    }
  }, [persistBounds])

  const beginDrag = (
    e: ReactPointerEvent,
    slot: AssetSlot,
    mode: DragMode
  ) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedSlotId(slot.id)
    const start = getSlotBounds(slot)
    dragRef.current = {
      slotId: slot.id,
      mode,
      startBounds: start,
      originX: e.clientX,
      originY: e.clientY,
      latestBounds: start,
      pointerId: e.pointerId
    }
  }

  const skipSlotIds = useMemo(() => {
    const ids = new Set<string>()
    if (!backgroundAsset) return ids
    for (const s of sortedSlots) {
      const isBg =
        s.role === 'scene_background' || s.format === 'layered_background'
      if (isBg && s.assetId === backgroundAsset.id) ids.add(s.id)
    }
    return ids
  }, [sortedSlots, backgroundAsset])

  const onBoardPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    // Resize handles handle their own pointerdown
    if ((e.target as HTMLElement).closest?.('.scene-slot-handle')) return
    const boardEl = boardRef.current
    if (!boardEl) return
    const hit = hitTestSlot(
      sortedSlots,
      getSlotBounds,
      boardEl,
      e.clientX,
      e.clientY,
      skipSlotIds
    )
    if (!hit) {
      return
    }
    beginDrag(e, hit, 'move')
  }

  const handlePropose = async () => {
    if (!projectId || !sceneId || busy) return
    setBusy(true)
    setBusyLabel('AI is proposing scene blueprint…')
    setError(null)
    try {
      if (descriptionDraft.trim() !== (scene?.description ?? '')) {
        await window.indieForge.scenes.update(projectId, sceneId, {
          description: descriptionDraft.trim()
        })
      }
      const result = await window.indieForge.ai.proposeSceneBlueprint(
        projectId,
        sceneId,
        descriptionDraft.trim() || undefined
      )
      applyProject(result.project)
      const next = result.project.scenes.find((s) => s.id === sceneId)
      if (next?.assetSlots?.[0]) setSelectedSlotId(next.assetSlots[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blueprint proposal failed')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  const handleAddSlot = async () => {
    if (!projectId || !sceneId || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.indieForge.scenes.addSlot(projectId, sceneId, {
        name: `Slot ${(scene?.assetSlots?.length ?? 0) + 1}`
      })
      applyProject(result.project)
      const slots = result.scene.assetSlots ?? []
      if (slots.length) setSelectedSlotId(slots[slots.length - 1].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add slot')
    } finally {
      setBusy(false)
    }
  }

  const handleUpdateSlot = async (
    patch: Partial<Omit<AssetSlot, 'assetId'>> & { assetId?: string | null }
  ) => {
    if (!projectId || !sceneId || !selectedSlotId) return
    setError(null)
    try {
      const result = await window.indieForge.scenes.updateSlot(
        projectId,
        sceneId,
        selectedSlotId,
        patch
      )
      applyProject(result.project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update slot')
    }
  }

  const handleLinkExistingAsset = async (assetId: string) => {
    if (!assetId) {
      await handleUpdateSlot({ assetId: null, status: 'missing' })
      return
    }
    await handleUpdateSlot({ assetId })
  }

  const handleDeleteSlot = async () => {
    if (!projectId || !sceneId || !selectedSlotId || busy) return
    if (!confirm('Remove this slot from the scene?')) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.indieForge.scenes.deleteSlot(
        projectId,
        sceneId,
        selectedSlotId
      )
      applyProject(result.project)
      setSelectedSlotId(result.scene.assetSlots?.[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete slot')
    } finally {
      setBusy(false)
    }
  }

  const handleGenerate = async () => {
    if (!projectId || !sceneId || !selectedSlotId || busy) return
    setBusy(true)
    setBusyLabel(
      (() => {
        const bits: string[] = []
        if ((selectedAsset?.inspirationImages?.length ?? 0) > 0) bits.push('pose refs')
        if ((scene?.references?.length ?? 0) > 0) bits.push('scene camera')
        if (backgroundAsset && selectedSlot?.role !== 'scene_background') bits.push('bg crop')
        const suffix = bits.length ? ` (${bits.join(' + ')})` : ''
        return `Generating “${selectedSlot?.name ?? 'slot'}”${suffix}…`
      })()
    )
    setError(null)
    try {
      const result = await window.indieForge.ai.generateSlotAsset(
        projectId,
        sceneId,
        selectedSlotId
      )
      applyProject(result.project)
      bumpPreview(result.asset.filePath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Slot generation failed')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  const handleRefine = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!projectId || !selectedAsset?.filePath || !refinePrompt.trim() || busy) return
    setBusy(true)
    setBusyLabel(`Refining “${selectedAsset.name}”…`)
    setError(null)
    try {
      const result = await window.indieForge.ai.generateVariation(
        projectId,
        selectedAsset.id,
        refinePrompt.trim()
      )
      updateActiveAsset(result.asset)
      const project = await window.indieForge.projects.open(projectId)
      applyProject(project)
      bumpPreview(result.asset.filePath ?? result.filePath)
      setRefinePrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refine failed')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  const handleSaveDescription = async () => {
    if (!projectId || !sceneId || busy) return
    setBusy(true)
    try {
      const result = await window.indieForge.scenes.update(projectId, sceneId, {
        description: descriptionDraft.trim()
      })
      applyProject(result.project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save description')
    } finally {
      setBusy(false)
    }
  }

  const handleAddSceneReference = async () => {
    if (!projectId || !sceneId || busy) return
    const { filePath } = await window.indieForge.files.chooseImage()
    if (!filePath) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.indieForge.scenes.addReference(projectId, sceneId, filePath, {
        role: sceneRefRole
      })
      applyProject(result.project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add scene reference')
    } finally {
      setBusy(false)
    }
  }

  const handlePrepareAssetForInspirations = async () => {
    if (!projectId || !sceneId || !selectedSlot || selectedSlot.assetId || busy) return
    setBusy(true)
    setBusyLabel(`Preparing “${selectedSlot.name}” for pose/camera refs…`)
    setError(null)
    try {
      const assetType = slotToAssetType(selectedSlot.role, selectedSlot.format)
      const asset = await window.indieForge.assets.create(projectId, {
        name: selectedSlot.name,
        type: assetType,
        description: `${selectedSlot.role} for scene — attach pose references before generate`,
        sceneIds: [sceneId]
      })
      const result = await window.indieForge.scenes.updateSlot(projectId, sceneId, selectedSlot.id, {
        assetId: asset.id,
        status: 'draft'
      })
      applyProject(result.project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to prepare asset')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  const handleDeleteSceneReference = async (referenceId: string) => {
    if (!projectId || !sceneId || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.indieForge.scenes.deleteReference(
        projectId,
        sceneId,
        referenceId
      )
      applyProject(result.project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove scene reference')
    } finally {
      setBusy(false)
    }
  }

  const handleToggleStyleFrom = async (assetId: string) => {
    if (!selectedSlot) return
    const current = selectedSlot.styleFromAssetIds ?? []
    const next = current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId]
    await handleUpdateSlot({ styleFromAssetIds: next })
  }

  const handleMatchAllActors = async () => {
    if (!selectedSlot || !activeProject) return
    const ids = linkableAssets
      .filter(({ asset }) => {
        if (asset.id === selectedSlot.assetId) return false
        if (!asset.filePath) return false
        return ['sprite', 'animation', 'prop'].includes(asset.type)
      })
      .map(({ asset }) => asset.id)
      .slice(0, 4)
    await handleUpdateSlot({ styleFromAssetIds: ids })
  }

  const handleExportPackage = async () => {
    if (!projectId || !sceneId || busy) return
    const { dirPath } = await window.indieForge.files.chooseExportDirectory()
    if (!dirPath) return
    setBusy(true)
    setBusyLabel('Exporting scene package…')
    setError(null)
    try {
      const result = await window.indieForge.export.scenePackage(
        projectId,
        sceneId,
        dirPath
      )
      setBusyLabel(`Exported to ${result.packageDir}`)
      setTimeout(() => setBusyLabel(''), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scene package export failed')
      setBusyLabel('')
    } finally {
      setBusy(false)
    }
  }

  if (!activeProject) return <p>Loading project…</p>
  if (!scene) {
    return (
      <div>
        <p>Scene not found.</p>
        <Link to={`/projects/${projectId}/scenes`}>← Back to scenes</Link>
      </div>
    )
  }

  const displaySelectedBounds = selectedSlot ? getSlotBounds(selectedSlot) : null

  return (
    <div className="scene-composer">
      <div className="page-header scene-composer-header">
        <div>
          <p className="scene-composer-breadcrumb">
            <Link to={`/projects/${projectId}/scenes`}>Scenes</Link>
            <span> / </span>
            <span>{scene.name}</span>
          </p>
          <h2>{scene.name}</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
            <StatusBadge status={scene.status} /> ·{' '}
            {scene.viewport?.width}×{scene.viewport?.height} ·{' '}
            {scene.camera?.view ?? 'camera'} · {sortedSlots.length} slots
          </p>
        </div>
        <div className="scene-composer-header-actions">
          <button type="button" className="secondary" onClick={handleExportPackage} disabled={busy}>
            Export scene package
          </button>
        </div>
      </div>

      {busyLabel && (
        <div className="generation-status-banner" style={{ marginBottom: '0.75rem' }}>
          {busyLabel}
        </div>
      )}

      <div className="scene-composer-layout">
        <aside className="scene-composer-panel">
          <h3>Scene</h3>
          <label>
            Description
            <textarea
              rows={5}
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              placeholder="Describe the scene viewpoint, gameplay, and what should appear…"
              disabled={busy}
            />
          </label>
          <div className="scene-composer-panel-actions">
            <button type="button" className="secondary btn-sm" onClick={handleSaveDescription} disabled={busy}>
              Save description
            </button>
            <button type="button" onClick={handlePropose} disabled={busy}>
              Propose blueprint
            </button>
          </div>

          <div className="scene-composer-meta">
            <p>
              <strong>Camera</strong>
              <br />
              {scene.camera?.view} · {scene.camera?.projection} · {scene.camera?.orientation}
            </p>
            <p>
              <strong>Viewport</strong>
              <br />
              {scene.viewport?.width}×{scene.viewport?.height} ({scene.viewport?.orientation})
            </p>
            <p>
              <strong>Style refs</strong>
              <br />
              {styleRefCount > 0
                ? `${styleRefCount} analyzed reference${styleRefCount === 1 ? '' : 's'} applied on generate/refine`
                : 'None analyzed — add under Style Refs for consistent look'}
            </p>
            <p>
              <strong>Scene context</strong>
              <br />
              {backgroundAsset
                ? 'Background linked — actor generate uses a crop under the slot'
                : 'Generate/link a background first for placement-aware actors'}
            </p>
            {(scene.layers?.length ?? 0) > 0 && (
              <p>
                <strong>Layers</strong>
                <br />
                {scene.layers!.map((l) => `${l.name} (${l.depth})`).join(', ')}
              </p>
            )}
          </div>

          <div className="scene-refs-block">
            <div className="scene-refs-header">
              <strong>Scene camera / comps</strong>
              <button type="button" className="secondary btn-sm" onClick={handleAddSceneReference} disabled={busy}>
                + Add
              </button>
            </div>
            <p className="scene-refs-hint">
              Umpire POV / Gameday view for the whole scene. Pick a role, then add a photo.
            </p>
            <label className="scene-ref-role-pick">
              New ref role
              <select
                value={sceneRefRole}
                onChange={(e) => setSceneRefRole(e.target.value as SceneReferenceRole)}
                disabled={busy}
              >
                <option value="camera">Camera (umpire POV)</option>
                <option value="composition">Composition / layout</option>
                <option value="mood">Mood / lighting</option>
                <option value="other">Other</option>
              </select>
            </label>
            <div className="scene-refs-list">
              {(scene.references ?? []).map((ref) => (
                <div key={ref.id} className="scene-ref-item">
                  <SceneRefThumb filePath={ref.filePath} />
                  <div className="scene-ref-meta">
                    <span>{ref.name}</span>
                    <span className="scene-slot-list-meta">{ref.role}</span>
                  </div>
                  <button
                    type="button"
                    className="danger btn-sm"
                    onClick={() => void handleDeleteSceneReference(ref.id)}
                    disabled={busy}
                  >
                    ×
                  </button>
                </div>
              ))}
              {(scene.references ?? []).length === 0 && (
                <p className="scene-refs-hint">
                  None yet — add an umpire-behind-plate photo as Camera.
                </p>
              )}
            </div>
          </div>

          <div className="scene-composer-panel-actions">
            <button type="button" className="secondary" onClick={handleAddSlot} disabled={busy}>
              + Add slot
            </button>
          </div>

          <ul className="scene-slot-list">
            {sortedSlots.map((slot) => (
              <li key={slot.id}>
                <button
                  type="button"
                  className={slot.id === selectedSlotId ? 'active' : ''}
                  onClick={() => setSelectedSlotId(slot.id)}
                >
                  <span>{slot.name}</span>
                  <span className="scene-slot-list-meta">
                    {slot.status} · L{slot.layer}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="scene-composer-board-wrap">
          <p className="scene-board-hint">
            Click a character to select (overlaps pick the smaller slot). Drag to move; orange handles resize.
          </p>
          <div
            ref={boardRef}
            className="scene-composer-board"
            style={{ width: board.width, height: board.height }}
            onPointerDown={onBoardPointerDown}
          >
            <BoardBackdrop
              asset={backgroundAsset}
              reloadKey={
                backgroundAsset?.filePath ? previewKeys[backgroundAsset.filePath] : undefined
              }
            />
            {sortedSlots.map((slot) => {
              const asset = slot.assetId
                ? activeProject.assets.find((a) => a.id === slot.assetId)
                : undefined
              if (skipSlotIds.has(slot.id)) return null
              const bounds = getSlotBounds(slot)
              const selected = slot.id === selectedSlotId
              return (
                <div
                  key={slot.id}
                  className={`scene-slot-chrome ${selected ? 'scene-slot-chrome-selected' : ''} ${
                    asset?.filePath ? 'scene-slot-chrome-filled' : 'scene-slot-chrome-empty'
                  }`}
                  style={{
                    left: `${bounds.x * 100}%`,
                    top: `${bounds.y * 100}%`,
                    width: `${bounds.width * 100}%`,
                    height: `${bounds.height * 100}%`,
                    zIndex: Math.max(1, slot.layer) + (selected ? 1000 : 0)
                  }}
                >
                  <div
                    className={`scene-slot-box ${selected ? 'scene-slot-box-selected' : ''} ${
                      asset?.filePath ? 'scene-slot-box-filled' : ''
                    }`}
                  >
                    <SlotPreview
                      asset={asset}
                      reloadKey={asset?.filePath ? previewKeys[asset.filePath] : undefined}
                    />
                  </div>
                  <div className="scene-slot-label">
                    {slot.name}
                    <span>{slot.role}</span>
                  </div>
                  {selected &&
                    RESIZE_HANDLES.map((handle) => (
                      <button
                        key={handle}
                        type="button"
                        aria-label={`Resize ${handle}`}
                        className={`scene-slot-handle scene-slot-handle-${handle}`}
                        onPointerDown={(e) => beginDrag(e, slot, handle)}
                      />
                    ))}
                </div>
              )
            })}
            {sortedSlots.length === 0 && (
              <div className="scene-composer-board-empty">
                <p>No asset slots yet</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  Describe the scene and click Propose blueprint, or add a slot manually.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="scene-composer-panel">
          <h3>Slot inspector</h3>
          {!selectedSlot ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Select a slot on the board.</p>
          ) : (
            <>
              <label>
                Name
                <input
                  key={`name-${selectedSlot.id}`}
                  defaultValue={selectedSlot.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim()
                    if (name && name !== selectedSlot.name) {
                      void handleUpdateSlot({ name })
                    }
                  }}
                  disabled={busy}
                />
              </label>
              <label>
                Role
                <select
                  value={selectedSlot.role}
                  onChange={(e) =>
                    handleUpdateSlot({
                      role: e.target.value as AssetRole,
                      contract: {
                        ...selectedSlot.contract,
                        role: e.target.value as AssetRole
                      }
                    })
                  }
                  disabled={busy}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Format
                <select
                  value={selectedSlot.format}
                  onChange={(e) =>
                    handleUpdateSlot({
                      format: e.target.value as AssetFormat,
                      contract: {
                        ...selectedSlot.contract,
                        format: e.target.value as AssetFormat
                      }
                    })
                  }
                  disabled={busy}
                >
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Anchor
                <select
                  value={selectedSlot.anchor}
                  onChange={(e) =>
                    handleUpdateSlot({ anchor: e.target.value as AnchorPoint })
                  }
                  disabled={busy}
                >
                  {ANCHORS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Layer
                <input
                  type="number"
                  value={selectedSlot.layer}
                  onChange={(e) => handleUpdateSlot({ layer: Number(e.target.value) })}
                  disabled={busy}
                />
              </label>

              <div className="two-col">
                <label>
                  Canvas W
                  <input
                    type="number"
                    min={32}
                    value={selectedSlot.contract.canvas.width}
                    onChange={(e) =>
                      handleUpdateSlot({
                        contract: {
                          ...selectedSlot.contract,
                          canvas: {
                            ...selectedSlot.contract.canvas,
                            width: Number(e.target.value)
                          }
                        }
                      })
                    }
                    disabled={busy}
                  />
                </label>
                <label>
                  Canvas H
                  <input
                    type="number"
                    min={32}
                    value={selectedSlot.contract.canvas.height}
                    onChange={(e) =>
                      handleUpdateSlot({
                        contract: {
                          ...selectedSlot.contract,
                          canvas: {
                            ...selectedSlot.contract.canvas,
                            height: Number(e.target.value)
                          }
                        }
                      })
                    }
                    disabled={busy}
                  />
                </label>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                Drag the slot on the board, or edit bounds below. Orange corner/edge handles resize.
                Status: {selectedSlot.status}
                {selectedSlot.contract.transparent ? ' · transparent' : ''}
              </p>

              {displaySelectedBounds && (
                <div className="two-col">
                  <label>
                    X
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={Number(displaySelectedBounds.x.toFixed(3))}
                      onChange={(e) =>
                        void persistBounds(selectedSlot.id, {
                          ...displaySelectedBounds,
                          x: Number(e.target.value)
                        })
                      }
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={Number(displaySelectedBounds.y.toFixed(3))}
                      onChange={(e) =>
                        void persistBounds(selectedSlot.id, {
                          ...displaySelectedBounds,
                          y: Number(e.target.value)
                        })
                      }
                      disabled={busy}
                    />
                  </label>
                  <label>
                    W
                    <input
                      type="number"
                      min={0.04}
                      max={1}
                      step={0.01}
                      value={Number(displaySelectedBounds.width.toFixed(3))}
                      onChange={(e) =>
                        void persistBounds(selectedSlot.id, {
                          ...displaySelectedBounds,
                          width: Number(e.target.value)
                        })
                      }
                      disabled={busy}
                    />
                  </label>
                  <label>
                    H
                    <input
                      type="number"
                      min={0.04}
                      max={1}
                      step={0.01}
                      value={Number(displaySelectedBounds.height.toFixed(3))}
                      onChange={(e) =>
                        void persistBounds(selectedSlot.id, {
                          ...displaySelectedBounds,
                          height: Number(e.target.value)
                        })
                      }
                      disabled={busy}
                    />
                  </label>
                </div>
              )}

              <label>
                Use existing asset
                <select
                  value={selectedSlot.assetId ?? ''}
                  onChange={(e) => void handleLinkExistingAsset(e.target.value)}
                  disabled={busy}
                >
                  <option value="">— None (empty slot) —</option>
                  {linkableAssets.map(({ asset, usedInOtherSlot }) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} ({asset.type}
                      {asset.filePath ? '' : ', no image'}
                      {usedInOtherSlot ? ', used in another slot' : ''})
                    </option>
                  ))}
                </select>
              </label>
              {selectedAsset && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0 }}>
                  Linked: {selectedAsset.name} · {selectedAsset.status}
                </p>
              )}

              {!selectedAsset && selectedSlot && (
                <div className="scene-prepare-asset">
                  <p className="scene-refs-hint">
                    To attach a pitcher-on-mound pose (or other photo) before generate, prepare a draft
                    asset first.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void handlePrepareAssetForInspirations()}
                    disabled={busy}
                  >
                    Prepare asset for pose refs
                  </button>
                </div>
              )}

              {selectedAsset && projectId && (
                <AssetInspirationPanel
                  projectId={projectId}
                  asset={selectedAsset}
                  disabled={busy}
                  selectedIds={selectedInspirationIds}
                  onSelectedIdsChange={setSelectedInspirationIds}
                />
              )}

              <div className="scene-style-from">
                <div className="scene-refs-header">
                  <strong>Match style of</strong>
                  <button
                    type="button"
                    className="secondary btn-sm"
                    onClick={() => void handleMatchAllActors()}
                    disabled={busy}
                  >
                    All actors
                  </button>
                </div>
                <p className="scene-refs-hint">
                  Pick batter/umpire (etc.) so this generate matches the cast. Empty = auto-use other
                  characters already in the scene.
                </p>
                <div className="scene-style-from-list">
                  {linkableAssets
                    .filter(
                      ({ asset }) =>
                        asset.filePath &&
                        asset.id !== selectedSlot.assetId &&
                        !['background', 'music', 'sound_effect', 'voice_line'].includes(asset.type)
                    )
                    .map(({ asset }) => {
                      const checked = (selectedSlot.styleFromAssetIds ?? []).includes(asset.id)
                      return (
                        <label key={asset.id} className="scene-style-from-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => void handleToggleStyleFrom(asset.id)}
                            disabled={busy}
                          />
                          <span>
                            {asset.name} <em>({asset.type})</em>
                          </span>
                        </label>
                      )
                    })}
                </div>
              </div>

              {selectedAsset?.filePath && (
                <form className="scene-refine-form" onSubmit={handleRefine}>
                  <label>
                    Fine-tune (image edit)
                    <textarea
                      rows={3}
                      value={refinePrompt}
                      onChange={(e) => setRefinePrompt(e.target.value)}
                      placeholder='e.g. "lower the feet; match behind-home-plate camera; more crouch in the batter box"'
                      disabled={busy}
                    />
                  </label>
                  <button type="submit" disabled={busy || !refinePrompt.trim()}>
                    Apply tweak
                  </button>
                </form>
              )}

              <div className="scene-composer-panel-actions">
                {activeProject.craftPath === 'pixel_silhouette' && selectedSlot.assetId && (
                  <button
                    type="button"
                    onClick={() => navigate(`/projects/${projectId}/craft/${selectedSlot.assetId}`)}
                  >
                    Open Craft Studio
                  </button>
                )}
                {activeProject.craftPath === 'pixel_silhouette' &&
                  selectedAsset?.type === 'animation' &&
                  selectedSlot.assetId && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => navigate(`/projects/${projectId}/motion/${selectedSlot.assetId}`)}
                    >
                      Open Motion Studio
                    </button>
                  )}
                {activeProject.craftPath === 'engine_materials' && (
                  <button
                    type="button"
                    onClick={() => navigate(`/projects/${projectId}/production`)}
                  >
                    Open Production
                  </button>
                )}
                <button type="button" className="secondary" onClick={handleGenerate} disabled={busy}>
                  {selectedAsset ? 'AI draft (optional)' : 'AI draft slot (optional)'}
                </button>
                {selectedAsset && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => navigate(studioPath(projectId!, selectedAsset, activeProject.craftPath))}
                  >
                    Open studio
                  </button>
                )}
                {selectedSlot.assetId && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void handleLinkExistingAsset('')}
                    disabled={busy}
                  >
                    Unlink asset
                  </button>
                )}
                <button type="button" className="danger secondary" onClick={handleDeleteSlot} disabled={busy}>
                  Remove slot
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}