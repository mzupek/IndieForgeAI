import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type {
  MotionBlueprint,
  MotionConstraints,
  MotionJointId,
  MotionPhase,
  MotionPhaseName
} from '@shared/types/project'
import {
  SWING_PHASES,
  phaseDisplayName,
  phaseIndex
} from '@shared/motion/rhBatterSwing'
import {
  duplicatePhaseJoints,
  hitTestJoint,
  moveJoint,
  renderPoseGuideToCanvas,
  type CraftOverlayMode,
  type PoseGuideViewMode
} from '../motion/renderPoseGuide'
import { validatePhaseConstraints } from '@shared/motion/validateConstraints'
import { StatusBadge } from './shared'
import { MotionDiagnosticActions } from './MotionDiagnosticActions'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

function loadHtmlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load craft overlay image'))
    img.src = dataUrl
  })
}

export function MotionStudio() {
  const { projectId, assetId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { activeProject, openProject, updateActiveAsset } = useProjectStore()
  const { setError } = useUIStore()

  const [blueprint, setBlueprint] = useState<MotionBlueprint | null>(null)
  const [phaseName, setPhaseName] = useState<MotionPhaseName>(
    (searchParams.get('phase') as MotionPhaseName) || 'idle'
  )
  const [viewMode, setViewMode] = useState<PoseGuideViewMode>('skeleton')
  const [showOnion, setShowOnion] = useState(true)
  const [craftOverlayMode, setCraftOverlayMode] = useState<CraftOverlayMode>('guide')
  const [craftOverlayOpacity, setCraftOverlayOpacity] = useState(0.4)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [dragJoint, setDragJoint] = useState<MotionJointId | null>(null)
  const [copiedPhase, setCopiedPhase] = useState<MotionPhase | null>(null)
  const [guideImg, setGuideImg] = useState<HTMLImageElement | null>(null)
  const [silhouetteImg, setSilhouetteImg] = useState<HTMLImageElement | null>(null)
  const [outlineImg, setOutlineImg] = useState<HTMLImageElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const asset = activeProject?.assets.find((a) => a.id === assetId)
  const appearanceSourceId = asset?.metadata?.appearanceSourceAssetId as string | undefined
  const appearanceSource = appearanceSourceId
    ? activeProject?.assets.find((a) => a.id === appearanceSourceId)
    : undefined

  const guidePath = asset?.guideImagePath || appearanceSource?.guideImagePath || undefined
  const silhouettePath =
    asset?.silhouettePath || appearanceSource?.silhouettePath || undefined
  const outlinePath = asset?.outlinePath || appearanceSource?.outlinePath || undefined
  const guideDataUrl = useLocalFilePreview(guidePath)
  const silhouetteDataUrl = useLocalFilePreview(silhouettePath)
  const outlineDataUrl = useLocalFilePreview(outlinePath)

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  useEffect(() => {
    if (!projectId || !assetId || !activeProject) return
    let cancelled = false
    ;(async () => {
      try {
        setBusy(true)
        const result = await window.indieForge.motion.ensureBlueprint(projectId, assetId)
        if (cancelled) return
        updateActiveAsset(result.asset)
        setBlueprint(result.blueprint)
        setStatus('Motion blueprint ready')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load motion blueprint')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, assetId, activeProject?.id])

  useEffect(() => {
    let cancelled = false
    if (!guideDataUrl) {
      setGuideImg(null)
      return
    }
    loadHtmlImage(guideDataUrl)
      .then((img) => {
        if (!cancelled) setGuideImg(img)
      })
      .catch(() => {
        if (!cancelled) setGuideImg(null)
      })
    return () => {
      cancelled = true
    }
  }, [guideDataUrl])

  useEffect(() => {
    let cancelled = false
    if (!silhouetteDataUrl) {
      setSilhouetteImg(null)
      return
    }
    loadHtmlImage(silhouetteDataUrl)
      .then((img) => {
        if (!cancelled) setSilhouetteImg(img)
      })
      .catch(() => {
        if (!cancelled) setSilhouetteImg(null)
      })
    return () => {
      cancelled = true
    }
  }, [silhouetteDataUrl])

  useEffect(() => {
    let cancelled = false
    if (!outlineDataUrl) {
      setOutlineImg(null)
      return
    }
    loadHtmlImage(outlineDataUrl)
      .then((img) => {
        if (!cancelled) setOutlineImg(img)
      })
      .catch(() => {
        if (!cancelled) setOutlineImg(null)
      })
    return () => {
      cancelled = true
    }
  }, [outlineDataUrl])

  const phase = blueprint?.phases.find((p) => p.name === phaseName) ?? null

  const onionPhases = useMemo(() => {
    if (!blueprint || !showOnion || !phase) return []
    const idx = phaseIndex(phase.name)
    const neighbors: MotionPhase[] = []
    if (idx > 0) neighbors.push(blueprint.phases[idx - 1])
    if (idx < blueprint.phases.length - 1) neighbors.push(blueprint.phases[idx + 1])
    return neighbors
  }, [blueprint, showOnion, phase])

  const warnings = useMemo(() => {
    if (!blueprint || !phase) return []
    return validatePhaseConstraints(phase, blueprint.canvasWidth, blueprint.canvasHeight)
  }, [blueprint, phase])

  const hasCraftOverlay = Boolean(guideImg || silhouetteImg || outlineImg)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !blueprint || !phase) return
    renderPoseGuideToCanvas(canvas, {
      width: blueprint.canvasWidth,
      height: blueprint.canvasHeight,
      phase,
      onionPhases,
      viewMode,
      showAnchors: true,
      editMode: true,
      highlightJointId: dragJoint,
      craftOverlay: {
        mode: craftOverlayMode,
        opacity: craftOverlayOpacity,
        guide: guideImg,
        silhouette: silhouetteImg,
        outline: outlineImg
      }
    })
  }, [
    blueprint,
    phase,
    onionPhases,
    viewMode,
    dragJoint,
    craftOverlayMode,
    craftOverlayOpacity,
    guideImg,
    silhouetteImg,
    outlineImg
  ])

  useEffect(() => {
    redraw()
  }, [redraw])

  const patchPhase = (updater: (p: MotionPhase) => MotionPhase) => {
    if (!blueprint || !phase) return
    setBlueprint({
      ...blueprint,
      phases: blueprint.phases.map((p) => (p.name === phase.name ? updater(p) : p)),
      updatedAt: new Date().toISOString()
    })
  }

  const prevPhase = useMemo(() => {
    if (!blueprint || !phase) return null
    const idx = phaseIndex(phase.name)
    return idx > 0 ? blueprint.phases[idx - 1] : null
  }, [blueprint, phase])

  const nextPhase = useMemo(() => {
    if (!blueprint || !phase) return null
    const idx = phaseIndex(phase.name)
    return idx >= 0 && idx < blueprint.phases.length - 1 ? blueprint.phases[idx + 1] : null
  }, [blueprint, phase])

  /** Seed current phase joints from the previous key pose (constraints stay on this phase). */
  const handleFromPrevious = () => {
    if (!blueprint || !phase || !prevPhase) return
    setBlueprint({
      ...blueprint,
      phases: blueprint.phases.map((p) =>
        p.name === phase.name ? duplicatePhaseJoints(prevPhase, p) : p
      ),
      updatedAt: new Date().toISOString()
    })
    setShowOnion(true)
    setStatus(
      `Copied joints from ${phaseDisplayName(prevPhase.name)} → ${phaseDisplayName(phase.name)}. Tweak from here.`
    )
  }

  /** Copy current joints into the next phase and jump there. */
  const handlePushToNext = () => {
    if (!blueprint || !phase || !nextPhase) return
    setBlueprint({
      ...blueprint,
      phases: blueprint.phases.map((p) =>
        p.name === nextPhase.name ? duplicatePhaseJoints(phase, p) : p
      ),
      updatedAt: new Date().toISOString()
    })
    setPhaseName(nextPhase.name)
    setShowOnion(true)
    setStatus(
      `Seeded ${phaseDisplayName(nextPhase.name)} from ${phaseDisplayName(phase.name)}. Adjust the new pose.`
    )
  }

  const canvasPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || !blueprint) return null
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * blueprint.canvasWidth
    const y = ((clientY - rect.top) / rect.height) * blueprint.canvasHeight
    return { x, y }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!phase || !blueprint) return
    const pt = canvasPoint(e.clientX, e.clientY)
    if (!pt) return
    const hitR = Math.max(18, blueprint.canvasWidth / 40)
    const id = hitTestJoint(phase, pt.x, pt.y, hitR)
    if (!id) return
    setDragJoint(id)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragJoint || !phase) return
    const pt = canvasPoint(e.clientX, e.clientY)
    if (!pt) return
    patchPhase((p) => moveJoint(p, dragJoint, pt.x, pt.y))
  }

  const onPointerUp = () => setDragJoint(null)

  const handleSave = async (pushHistory = true) => {
    if (!projectId || !assetId || !blueprint) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.indieForge.motion.saveBlueprint(projectId, assetId, blueprint, {
        pushHistory,
        historyLabel: pushHistory ? `Saved ${phaseName}` : undefined
      })
      updateActiveAsset(result.asset)
      setBlueprint(result.blueprint)
      setStatus(`Saved · ${new Date(result.blueprint.updatedAt).toLocaleTimeString()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const handlePreviewPose = async () => {
    if (!projectId || !assetId || !blueprint || !phase || !canvasRef.current) return
    setBusy(true)
    setError(null)
    try {
      // Authoritative guide for AI: rig only — no Craft overlay
      renderPoseGuideToCanvas(canvasRef.current, {
        width: blueprint.canvasWidth,
        height: blueprint.canvasHeight,
        phase,
        onionPhases: [],
        viewMode,
        showAnchors: true,
        editMode: false,
        craftOverlay: { mode: 'off' }
      })
      const dataUrl = canvasRef.current.toDataURL('image/png')
      const result = await window.indieForge.motion.savePoseGuide(
        projectId,
        assetId,
        blueprint.id,
        phase.name,
        dataUrl
      )
      updateActiveAsset(result.asset)
      setBlueprint(result.blueprint)
      setStatus(`Pose guide saved for ${phaseDisplayName(phase.name)} (rig only — overlay excluded)`)
      redraw()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview Pose failed')
    } finally {
      setBusy(false)
    }
  }

  const handleRestoreRevision = (revisionId: string) => {
    if (!blueprint?.history) return
    const rev = blueprint.history.find((h) => h.id === revisionId)
    if (!rev) return
    setBlueprint({
      ...blueprint,
      phases: rev.phases.map((p) => ({
        ...p,
        rootOffset: { ...p.rootOffset },
        joints: p.joints.map((j) => ({ ...j })),
        constraints: { ...p.constraints, cannotOverlap: p.constraints.cannotOverlap?.slice() }
      })),
      updatedAt: new Date().toISOString()
    })
    setStatus(`Restored revision from ${new Date(rev.savedAt).toLocaleString()}`)
  }

  const updateConstraints = (patch: Partial<MotionConstraints>) => {
    patchPhase((p) => ({
      ...p,
      constraints: {
        ...p.constraints,
        ...patch,
        cannotOverlap:
          patch.cannotOverlap !== undefined ? patch.cannotOverlap : p.constraints.cannotOverlap
      }
    }))
  }

  if (!activeProject || !asset) {
    return <p style={{ color: 'var(--muted)' }}>Loading Motion Studio…</p>
  }

  if (activeProject.craftPath !== 'pixel_silhouette') {
    return (
      <div className="motion-studio">
        <div className="page-header">
          <h2>Motion Studio</h2>
        </div>
        <p>Motion Studio is for pixel silhouette projects (Ring&apos;Em Up path).</p>
      </div>
    )
  }

  const c = phase?.constraints

  return (
    <div className="motion-studio">
      <div className="page-header">
        <div>
          <p className="scene-composer-breadcrumb">
            <Link to={`/projects/${projectId}/assets`}>Assets</Link> / Motion
          </p>
          <h2>
            {asset.name} <StatusBadge status={asset.status} />
          </h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
            Deterministic rig + constraints — no AI here. Craft silhouette is appearance only (linked in
            Animation Studio). Preview Pose, then AI Paint.
          </p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="secondary"
            onClick={() => navigate(`/projects/${projectId}/craft/${asset.id}`)}
          >
            Craft appearance
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void handleSave(true)}>
            Save blueprint
          </button>
          <button type="button" className="secondary" disabled={busy || !phase} onClick={() => void handlePreviewPose()}>
            Preview Pose
          </button>
          <button
            type="button"
            disabled={!blueprint}
            onClick={() =>
              navigate(
                `/projects/${projectId}/animation/${asset.id}?blueprint=${blueprint!.id}&phase=${phaseName}`
              )
            }
          >
            Open Animation Studio
          </button>
        </div>
      </div>

      {projectId && assetId && (
        <MotionDiagnosticActions projectId={projectId} assetId={assetId} blueprint={blueprint} disabled={busy} />
      )}

      {status && (
        <p style={{ color: 'var(--forge-gold)', fontSize: '0.85rem', marginTop: 0 }}>{status}</p>
      )}

      <div className="motion-phase-tabs">
        {SWING_PHASES.map((name) => (
          <button
            key={name}
            type="button"
            className={`secondary btn-sm ${phaseName === name ? 'motion-phase-active' : ''}`}
            onClick={() => setPhaseName(name)}
          >
            {phaseDisplayName(name)}
          </button>
        ))}
      </div>
      <div className="motion-phase-flow">
        <button
          type="button"
          className="secondary btn-sm"
          disabled={!prevPhase}
          title={
            prevPhase
              ? `Replace this phase’s joints with ${phaseDisplayName(prevPhase.name)}`
              : 'Already on the first phase'
          }
          onClick={handleFromPrevious}
        >
          ← From previous{prevPhase ? ` (${phaseDisplayName(prevPhase.name)})` : ''}
        </button>
        <button
          type="button"
          onClick={handlePushToNext}
          disabled={!nextPhase}
          title={
            nextPhase
              ? `Copy this pose into ${phaseDisplayName(nextPhase.name)} and open it`
              : 'Already on the last phase'
          }
        >
          Seed next{nextPhase ? ` (${phaseDisplayName(nextPhase.name)})` : ''} →
        </button>
      </div>

      <div className="motion-layout">
        <div className="motion-canvas-wrap panel-section" ref={stageRef}>
          <div className="motion-view-toggles">
            <button
              type="button"
              className={`secondary btn-sm ${viewMode === 'skeleton' ? 'motion-phase-active' : ''}`}
              onClick={() => setViewMode('skeleton')}
            >
              Skeleton
            </button>
            <button
              type="button"
              className={`secondary btn-sm ${viewMode === 'mannequin' ? 'motion-phase-active' : ''}`}
              onClick={() => setViewMode('mannequin')}
            >
              Mannequin
            </button>
            <label className="motion-check">
              <input type="checkbox" checked={showOnion} onChange={(e) => setShowOnion(e.target.checked)} />
              Onion skin
            </label>
          </div>
          <div className="motion-view-toggles">
            <span className="craft-notes" style={{ marginRight: '0.25rem' }}>
              Craft overlay
            </span>
            {(
              [
                ['off', 'Off'],
                ['guide', 'Guide'],
                ['silhouette', 'Silhouette'],
                ['outline', 'Outline'],
                ['both', 'Both']
              ] as Array<[CraftOverlayMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`secondary btn-sm ${craftOverlayMode === mode ? 'motion-phase-active' : ''}`}
                disabled={
                  mode === 'off'
                    ? false
                    : mode === 'guide'
                      ? !guideImg
                      : mode === 'silhouette'
                        ? !silhouetteImg
                        : mode === 'outline'
                          ? !outlineImg
                          : !(silhouetteImg || outlineImg)
                }
                title={
                  mode === 'guide' && !guideImg
                    ? 'Import a guide photo in Craft Studio first'
                    : !hasCraftOverlay && mode !== 'off'
                      ? 'Import guide or save silhouette/outline in Craft first'
                      : undefined
                }
                onClick={() => setCraftOverlayMode(mode)}
              >
                {label}
              </button>
            ))}
            {craftOverlayMode !== 'off' && (
              <label className="motion-overlay-opacity">
                Opacity
                <input
                  type="range"
                  min={0.15}
                  max={0.85}
                  step={0.05}
                  value={craftOverlayOpacity}
                  onChange={(e) => setCraftOverlayOpacity(Number(e.target.value))}
                />
              </label>
            )}
          </div>
          {!hasCraftOverlay && (
            <p className="craft-notes" style={{ marginTop: 0 }}>
              No Craft guide / silhouette / outline on this asset
              {appearanceSource ? ` or linked “${appearanceSource.name}”` : ''}.{' '}
              <button
                type="button"
                className="ghost btn-sm"
                onClick={() => navigate(`/projects/${projectId}/craft/${asset.id}`)}
              >
                Open Craft
              </button>
            </p>
          )}
          <div className="motion-canvas-stage">
            <canvas
              ref={canvasRef}
              className="motion-canvas preview-pixel"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          </div>
          <p className="craft-notes">Drag joints to pose. Scene anchors are locked. Save often.</p>
        </div>

        <aside className="motion-side panel-section">
          <strong>Constraints · {phase ? phaseDisplayName(phase.name) : '—'}</strong>
          <p className="craft-notes" style={{ marginTop: 0 }}>
            Structured intent — warnings only in v1 (no auto-solver).
          </p>

          {phase && c && (
            <div className="motion-constraints">
              <label className="motion-check">
                <input
                  type="checkbox"
                  checked={Boolean(c.rearFootLocked)}
                  onChange={(e) => updateConstraints({ rearFootLocked: e.target.checked })}
                />
                Rear foot locked
              </label>
              <label className="motion-check">
                <input
                  type="checkbox"
                  checked={Boolean(c.frontFootGrounded)}
                  onChange={(e) => updateConstraints({ frontFootGrounded: e.target.checked })}
                />
                Front foot grounded
              </label>
              <label className="motion-check">
                <input
                  type="checkbox"
                  checked={Boolean(c.strideTowardPitcher)}
                  onChange={(e) => updateConstraints({ strideTowardPitcher: e.target.checked })}
                />
                Stride toward pitcher
              </label>
              <label className="motion-check">
                <input
                  type="checkbox"
                  checked={Boolean(c.handsAttachedToBat)}
                  onChange={(e) => updateConstraints({ handsAttachedToBat: e.target.checked })}
                />
                Hands attached to bat
              </label>
              <label className="motion-check">
                <input
                  type="checkbox"
                  checked={c.batInFrontOfBody !== false}
                  onChange={(e) => updateConstraints({ batInFrontOfBody: e.target.checked })}
                />
                Bat in front of body (camera-near)
              </label>
              <label className="motion-check">
                <input
                  type="checkbox"
                  checked={Boolean(c.batRemainsLoaded)}
                  onChange={(e) => updateConstraints({ batRemainsLoaded: e.target.checked })}
                />
                Bat remains loaded
              </label>
              <label className="motion-check">
                <input
                  type="checkbox"
                  checked={Boolean(c.cannotOverlap?.includes('home_plate'))}
                  onChange={(e) => {
                    const next = [...(c.cannotOverlap ?? [])]
                    if (e.target.checked) {
                      if (!next.includes('home_plate')) next.push('home_plate')
                    } else {
                      const i = next.indexOf('home_plate')
                      if (i >= 0) next.splice(i, 1)
                    }
                    updateConstraints({ cannotOverlap: next })
                  }}
                />
                Cannot overlap home plate
              </label>
              <label>
                Front foot region
                <select
                  value={c.frontFootRegion ?? 'left_batters_box'}
                  onChange={(e) =>
                    updateConstraints({
                      frontFootRegion: e.target.value as MotionConstraints['frontFootRegion']
                    })
                  }
                >
                  <option value="left_batters_box">Left batter&apos;s box</option>
                  <option value="front_of_left_batters_box">Front of left box</option>
                  <option value="toward_pitcher">Toward pitcher</option>
                  <option value="right_batters_box">Right batter&apos;s box</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Expected bat angle (°)
                <input
                  type="number"
                  value={c.batAngleDeg ?? ''}
                  onChange={(e) =>
                    updateConstraints({
                      batAngleDeg: e.target.value === '' ? undefined : Number(e.target.value)
                    })
                  }
                />
              </label>
              <label>
                Notes
                <textarea
                  rows={3}
                  value={phase.notes ?? ''}
                  onChange={(e) => patchPhase((p) => ({ ...p, notes: e.target.value }))}
                />
              </label>
            </div>
          )}

          <div className="motion-pose-actions">
            <button
              type="button"
              className="secondary btn-sm"
              disabled={!prevPhase}
              onClick={handleFromPrevious}
            >
              From previous
            </button>
            <button type="button" className="secondary btn-sm" disabled={!nextPhase} onClick={handlePushToNext}>
              Seed next phase
            </button>
            <button
              type="button"
              className="secondary btn-sm"
              disabled={!phase}
              onClick={() => phase && setCopiedPhase(JSON.parse(JSON.stringify(phase)))}
            >
              Copy pose
            </button>
            <button
              type="button"
              className="secondary btn-sm"
              disabled={!phase || !copiedPhase}
              onClick={() => {
                if (!phase || !copiedPhase) return
                patchPhase((p) => duplicatePhaseJoints(copiedPhase, p))
              }}
            >
              Paste joints
            </button>
          </div>
          <p className="craft-notes">
            Workflow: finish Idle → <strong>Seed next</strong> → tweak Load → Seed next → … Constraints stay
            per-phase; only joints/root copy.
          </p>

          <strong style={{ display: 'block', marginTop: '1rem' }}>Validation</strong>
          {warnings.length === 0 ? (
            <p className="craft-notes">No warnings for this phase.</p>
          ) : (
            <ul className="motion-warnings">
              {warnings.map((w, i) => (
                <li key={`${w.code}-${i}`}>{w.message}</li>
              ))}
            </ul>
          )}

          {blueprint?.history && blueprint.history.length > 0 && (
            <>
              <strong style={{ display: 'block', marginTop: '1rem' }}>History</strong>
              <ul className="motion-history">
                {[...blueprint.history].reverse().slice(0, 8).map((h) => (
                  <li key={h.id}>
                    <button type="button" className="ghost btn-sm" onClick={() => handleRestoreRevision(h.id)}>
                      {h.label ?? 'Revision'} · {new Date(h.savedAt).toLocaleString()}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
