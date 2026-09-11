/**
 * Animation Studio — Motion Blueprint skeleton + Craft guide → Aseprite.
 * Director owns keys. Export = BASE guide + skeleton motion frames. Skin in Aseprite.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  StatusBadge,
  GenerationStatusBanner,
  PreviewLoadingOverlay
} from './shared'
import type { MotionBlueprint } from '@shared/types/project'
import {
  resolveProductionGate,
  samplePuppetJoints,
  type ProductionGate
} from '@shared/motion/characterPuppet'
import { renderJointsPoseGuideToCanvas } from '../motion/renderPoseGuide'
import { MotionDiagnosticActions } from './MotionDiagnosticActions'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

type StudioStep = 'brief' | 'scene' | 'motion' | 'export'

const STEPS: Array<{ id: StudioStep; label: string }> = [
  { id: 'brief', label: '1. Brief' },
  { id: 'scene', label: '2. Scene' },
  { id: 'motion', label: '3. Motion' },
  { id: 'export', label: '4. Aseprite' }
]

function gateToStep(gate: ProductionGate): StudioStep {
  switch (gate) {
    case 'needs_brief':
      return 'brief'
    case 'needs_scene':
      return 'scene'
    case 'needs_mannequin':
    case 'needs_motion_proof':
      return 'motion'
    case 'needs_export':
    case 'ready':
      return 'export'
    default:
      return 'brief'
  }
}

export function AnimationStudio() {
  const { projectId, assetId } = useParams()
  const { activeProject, openProject, updateActiveAsset } = useProjectStore()
  const { setError } = useUIStore()

  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [step, setStep] = useState<StudioStep>('brief')
  const [blueprint, setBlueprint] = useState<MotionBlueprint | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [puppetFrameIndex, setPuppetFrameIndex] = useState(0)
  const [puppetPlaying, setPuppetPlaying] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const [styleNote, setStyleNote] = useState('')
  const [cameraNote, setCameraNote] = useState('')
  const [stepSeeded, setStepSeeded] = useState(false)
  const puppetCanvasRef = useRef<HTMLCanvasElement>(null)

  const asset = activeProject?.assets.find((a) => a.id === assetId)
  const puppet = asset?.characterPuppet
  const hasCraftBase = !!(
    asset?.filePath ||
    asset?.silhouettePath ||
    asset?.outlinePath ||
    asset?.guideImagePath
  )
  const productionGate = puppet
    ? resolveProductionGate(puppet, { hasGuide: hasCraftBase })
    : null

  const guidePath = asset?.guideImagePath
  const baseSpritePath =
    asset?.filePath || asset?.silhouettePath || asset?.outlinePath || guidePath
  const guidePreview = useLocalFilePreview(guidePath, previewKey)
  const baseSpritePreview = useLocalFilePreview(baseSpritePath, previewKey)
  const puppetRasterPath = puppet?.rasterizedFrames?.[puppetFrameIndex] ?? null
  const rasterPreview = useLocalFilePreview(puppetRasterPath, previewKey)
  const stripPreview = useLocalFilePreview(puppet?.poseSheetExport?.stripPath, previewKey)
  const baseGuidePreview = useLocalFilePreview(
    puppet?.poseSheetExport?.bindGuidePath ?? baseSpritePath,
    previewKey
  )
  const canvasSize = {
    w: blueprint?.canvasWidth ?? puppet?.bindPose.canvasWidth ?? 256,
    h: blueprint?.canvasHeight ?? puppet?.bindPose.canvasHeight ?? 256
  }
  const puppetFrameCount = puppet?.timeline.frameCount ?? 11

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  useEffect(() => {
    if (!projectId || !assetId || !activeProject) return
    const fromAsset = asset?.motionBlueprints?.[0]
    if (fromAsset) {
      setBlueprint(fromAsset)
      return
    }
    if (asset?.medium === 'pixel_silhouette' || asset?.type === 'animation') {
      void window.indieForge.motion
        .ensureBlueprint(projectId, assetId)
        .then((r) => {
          updateActiveAsset(r.asset)
          setBlueprint(r.blueprint)
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    }
  }, [projectId, assetId, activeProject, asset, updateActiveAsset, setError])

  useEffect(() => {
    if (!puppet?.animationBrief) return
    setStyleNote(puppet.animationBrief.styleNote)
    setCameraNote(puppet.animationBrief.cameraNote)
  }, [puppet?.animationBrief?.styleNote, puppet?.animationBrief?.cameraNote])

  useEffect(() => {
    if (stepSeeded || !asset) return
    if (!puppet) {
      setStep(guidePath ? 'brief' : 'scene')
    } else if (productionGate) {
      setStep(gateToStep(productionGate))
    }
    setStepSeeded(true)
  }, [asset, puppet, productionGate, guidePath, stepSeeded])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true)
    setBusyLabel(label)
    setStatusNote(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  useEffect(() => {
    const canvas = puppetCanvasRef.current
    if (!canvas || !blueprint || !puppet || (step !== 'motion' && step !== 'export')) return
    const sample = samplePuppetJoints(puppet, blueprint, puppetFrameIndex)
    renderJointsPoseGuideToCanvas(canvas, {
      joints: sample.joints,
      width: canvasSize.w,
      height: canvasSize.h,
      label: `Frame ${puppetFrameIndex + 1}`,
      showAnchors: true,
      subtitle: sample.phaseHint.replace(/_/g, ' ')
    })
  }, [blueprint, puppet, puppetFrameIndex, step, canvasSize.w, canvasSize.h])

  useEffect(() => {
    if (!puppetPlaying || (step !== 'motion' && step !== 'export')) return
    const id = window.setInterval(() => {
      setPuppetFrameIndex((i) => (i + 1) % puppetFrameCount)
    }, puppet?.timeline.frameDurationMs ?? 100)
    return () => window.clearInterval(id)
  }, [puppetPlaying, step, puppetFrameCount, puppet?.timeline.frameDurationMs])

  if (!asset) {
    return (
      <div className="panel">
        <p className="craft-notes">Asset not found.</p>
        {projectId && <Link to={`/projects/${projectId}/assets`}>Back to assets</Link>}
      </div>
    )
  }

  const scrubBar = (
    <div className="anim-proof-scrub">
      <button
        type="button"
        className="secondary btn-sm"
        onClick={() => setPuppetPlaying((p) => !p)}
      >
        {puppetPlaying ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(0, puppetFrameCount - 1)}
        value={puppetFrameIndex}
        onChange={(e) => {
          setPuppetPlaying(false)
          setPuppetFrameIndex(Number(e.target.value))
        }}
      />
      <span className="craft-notes" style={{ whiteSpace: 'nowrap' }}>
        {puppetFrameIndex + 1}/{puppetFrameCount}
      </span>
    </div>
  )

  return (
    <div className="panel animation-studio">
      <header className="panel-header" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Animation Studio</h2>
          <p className="craft-notes" style={{ margin: '0.15rem 0 0', fontSize: '0.78rem' }}>
            Craft base sprite + Motion Blueprint skeleton guide → apply in Aseprite. No mannequin.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={asset.status} />
          {productionGate && (
            <span className="badge">Gate: {productionGate.replace(/_/g, ' ')}</span>
          )}
          {projectId && assetId && (
            <MotionDiagnosticActions
              projectId={projectId}
              assetId={assetId}
              blueprint={blueprint}
            />
          )}
          {projectId && (
            <>
              <Link className="btn secondary btn-sm" to={`/projects/${projectId}/craft/${asset.id}`}>
                Craft
              </Link>
              <Link className="btn secondary btn-sm" to={`/projects/${projectId}/motion/${asset.id}`}>
                Motion
              </Link>
            </>
          )}
        </div>
      </header>

      <div className="animation-studio-chrome">
        {busy && busyLabel && <GenerationStatusBanner message={busyLabel} />}
        {statusNote && (
          <p
            className="craft-notes"
            style={{ color: 'var(--forge-orange, #e07a3a)', margin: '0.25rem 0', fontSize: '0.78rem' }}
          >
            {statusNote}
          </p>
        )}

        <nav className="motion-phase-row" style={{ marginTop: '0.35rem', flexWrap: 'wrap', gap: '0.25rem' }}>
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`secondary btn-sm ${step === s.id ? 'motion-phase-active' : ''}`}
              onClick={() => setStep(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {step === 'brief' && (
        <section className="animation-studio-step" style={{ overflow: 'auto' }}>
          <p className="craft-notes">Confirm style + locked camera. No AI.</p>
          <label className="craft-notes" style={{ display: 'block', marginBottom: 8 }}>
            Style note
            <input
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              value={styleNote}
              onChange={(e) => setStyleNote(e.target.value)}
            />
          </label>
          <label className="craft-notes" style={{ display: 'block', marginBottom: 8 }}>
            Camera note
            <input
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              value={cameraNote}
              onChange={(e) => setCameraNote(e.target.value)}
            />
          </label>
          <p className="craft-notes">
            Canvas: {canvasSize.w}×{canvasSize.h}
            {puppet?.animationBrief?.approvedAt && (
              <> · Approved {new Date(puppet.animationBrief.approvedAt).toLocaleString()}</>
            )}
          </p>
          <button
            type="button"
            className="btn-sm"
            style={{ background: 'var(--forge-orange, #e07a3a)' }}
            disabled={busy}
            onClick={() =>
              void run('Approving brief…', async () => {
                if (!projectId || !assetId) return
                if (!puppet) {
                  await window.indieForge.motion.ensurePuppet(projectId, assetId)
                }
                const result = await window.indieForge.motion.approveAnimationBrief(
                  projectId,
                  assetId,
                  { styleNote, cameraNote }
                )
                updateActiveAsset(result.asset)
                setStatusNote('Brief approved.')
                setStep(
                  result.asset.filePath ||
                    result.asset.silhouettePath ||
                    result.asset.outlinePath ||
                    result.asset.guideImagePath
                    ? 'motion'
                    : 'scene'
                )
              })
            }
          >
            Approve brief
          </button>
        </section>
      )}

      {step === 'scene' && (
        <section className="animation-studio-step" style={{ overflow: 'auto' }}>
          <p className="craft-notes">
            In Craft: lock the guide photo, then save a <strong>silhouette / paint</strong> — that
            becomes your BASE sprite. Motion Studio keys the skeleton you apply to it.
          </p>
          {baseSpritePreview ? (
            <img
              src={baseSpritePreview}
              alt="Base sprite"
              className="preview-pixel"
              style={{ maxWidth: 'min(100%, 360px)', maxHeight: '50vh', imageRendering: 'pixelated' }}
            />
          ) : (
            <p className="craft-notes">
              No Craft base yet.{' '}
              <Link to={`/projects/${projectId}/craft/${asset.id}`}>Open Craft Studio</Link>
            </p>
          )}
          {hasCraftBase && (
            <button
              type="button"
              className="btn-sm"
              style={{ marginTop: '0.65rem', background: 'var(--forge-orange, #e07a3a)' }}
              onClick={() => setStep('motion')}
            >
              Base ready — continue →
            </button>
          )}
        </section>
      )}

      {step === 'motion' && (
        <section className="animation-studio-step">
          <p className="craft-notes">
            Scrub the Motion Blueprint skeleton — this is the motion guide. Approve when the swing
            reads; export pairs it with your Craft BASE sprite.
            {!hasCraftBase && ' Blocked: Craft a base sprite first.'}
            {puppet?.motionProofAt &&
              ` Proven ${new Date(puppet.motionProofAt).toLocaleString()}.`}
          </p>
          <div className="animation-studio-toolbar">
            {projectId && (
              <Link
                className="btn secondary btn-sm"
                to={`/projects/${projectId}/motion/${asset.id}`}
              >
                Edit blueprint
              </Link>
            )}
            <button
              type="button"
              className="secondary btn-sm"
              disabled={busy || !hasCraftBase || !!puppet?.motionProofAt}
              onClick={() =>
                void run('Recording motion proof…', async () => {
                  if (!projectId || !assetId) return
                  if (!puppet) {
                    await window.indieForge.motion.ensurePuppet(projectId, assetId)
                  }
                  const result = await window.indieForge.motion.markMotionProof(
                    projectId,
                    assetId
                  )
                  updateActiveAsset(result.asset)
                  setStatusNote('Motion proven. Export guide + skeleton frames for Aseprite.')
                  setStep('export')
                })
              }
            >
              Approve motion
            </button>
            {puppet?.motionProofAt && (
              <button type="button" className="btn-sm" onClick={() => setStep('export')}>
                Aseprite →
              </button>
            )}
          </div>

          <div className="anim-proof-stage">
            <div className="anim-proof-pane">
              <span className="motion-compare-label">Motion Blueprint skeleton</span>
              <div className="anim-proof-frame">
                {blueprint && puppet ? (
                  <canvas ref={puppetCanvasRef} className="motion-guide-canvas preview-pixel" />
                ) : (
                  <p className="craft-notes" style={{ padding: '0.5rem' }}>
                    Loading blueprint…
                  </p>
                )}
              </div>
            </div>
            <div className="anim-proof-pane">
              <span className="motion-compare-label">BASE sprite (from Craft)</span>
              <div className="anim-proof-frame">
                {baseSpritePreview ? (
                  <img src={baseSpritePreview} alt="Base sprite" className="preview-pixel" />
                ) : (
                  <p className="craft-notes" style={{ padding: '0.5rem' }}>
                    Save silhouette/paint in Craft
                  </p>
                )}
              </div>
            </div>
          </div>
          {scrubBar}
        </section>
      )}

      {step === 'export' && (
        <section className="animation-studio-step">
          <p className="craft-notes">
            Pack for Aseprite: <strong>BASE_SPRITE</strong> (Craft character from guide) +{' '}
            <strong>~{puppetFrameCount} skeleton frames</strong> (motion guide to apply).
            {!puppet?.motionProofAt && ' Blocked: approve motion first.'}
          </p>
          <div className="animation-studio-toolbar">
            <button
              type="button"
              className="btn-sm"
              style={{ background: 'var(--forge-orange, #e07a3a)' }}
              disabled={busy || !puppet?.motionProofAt}
              onClick={() =>
                void run('Exporting Aseprite pack…', async () => {
                  if (!projectId || !assetId) return
                  const result = await window.indieForge.motion.exportPoseSheet(
                    projectId,
                    assetId
                  )
                  updateActiveAsset(result.asset)
                  setPreviewKey((k) => k + 1)
                  setPuppetFrameIndex(0)
                  setStatusNote(
                    `Pack ready: BASE_SPRITE + ${result.export.framePaths.length} motion-guide frames → ${result.export.dir}`
                  )
                })
              }
            >
              {puppet?.poseSheetExport ? 'Re-export pack' : 'Export Aseprite pack'}
            </button>
            <button
              type="button"
              className="secondary btn-sm"
              disabled={busy || !projectId || !assetId}
              onClick={() =>
                void run('Opening export folder…', async () => {
                  if (!projectId || !assetId) return
                  const { path } = await window.indieForge.motion.revealPoseSheet(
                    projectId,
                    assetId
                  )
                  setStatusNote(`Folder: ${path}`)
                })
              }
            >
              Open folder
            </button>
            {puppet?.poseSheetExport && (
              <span className="craft-notes" style={{ fontSize: '0.75rem' }}>
                {puppet.poseSheetExport.framePaths.length} frames ·{' '}
                {new Date(puppet.poseSheetExport.exportedAt).toLocaleString()}
              </span>
            )}
          </div>
          {busy && busyLabel.toLowerCase().includes('export') && (
            <PreviewLoadingOverlay message={busyLabel} />
          )}

          <div className="anim-proof-stage">
            <div className="anim-proof-pane">
              <span className="motion-compare-label">BASE sprite</span>
              <div className="anim-proof-frame">
                {baseGuidePreview ? (
                  <img src={baseGuidePreview} alt="Base sprite" className="preview-pixel" />
                ) : (
                  <p className="craft-notes" style={{ padding: '0.5rem' }}>
                    Export to write BASE_SPRITE
                  </p>
                )}
              </div>
            </div>
            <div className="anim-proof-pane">
              <span className="motion-compare-label">
                Skeleton frame {puppetFrameIndex + 1} / strip
              </span>
              <div className="anim-proof-frame">
                {rasterPreview ? (
                  <img
                    src={rasterPreview}
                    alt={`Skeleton ${puppetFrameIndex + 1}`}
                    className="preview-pixel"
                  />
                ) : stripPreview ? (
                  <img src={stripPreview} alt="Skeleton strip" className="preview-pixel" />
                ) : (
                  <canvas ref={puppetCanvasRef} className="motion-guide-canvas preview-pixel" />
                )}
              </div>
            </div>
          </div>
          {(puppet?.rasterizedFrames?.length || stripPreview) && scrubBar}

          <p className="craft-notes" style={{ marginTop: '0.35rem', fontSize: '0.75rem' }}>
            Aseprite: open *_01_BASE_SPRITE.png → onion-skin *_motion_overlay_*.png → reshape the
            base to the skeleton each frame · {canvasSize.w}×{canvasSize.h} · Godot nearest.
          </p>
        </section>
      )}
    </div>
  )
}
