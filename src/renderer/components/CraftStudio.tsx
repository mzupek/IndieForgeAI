import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getDesignSpriteSize } from '@shared/styleGuide'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import { StatusBadge } from './shared'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

type ToolMode = 'outline' | 'silhouette' | 'paint' | 'eraser'

const DEFAULT_PALETTE = ['#1a1a2e', '#e8e8e8', '#2d6a4f', '#c9a227', '#1d3557', '#e63946', '#f4a261']

export function CraftStudio() {
  const { projectId, assetId } = useParams()
  const navigate = useNavigate()
  const { activeProject, openProject, updateActiveAsset, setActiveProject } = useProjectStore()
  const { setError } = useUIStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const [mode, setMode] = useState<ToolMode>('outline')
  const [brush, setBrush] = useState(3)
  const [color, setColor] = useState('#e8e8e8')
  const [outlineColor, setOutlineColor] = useState('#ff8c00')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [guideOpacity, setGuideOpacity] = useState(0.45)
  const [guideVisible, setGuideVisible] = useState(true)
  const [displayMax, setDisplayMax] = useState(720)

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  const asset = activeProject?.assets.find((a) => a.id === assetId)
  const design = activeProject
    ? getDesignSpriteSize(activeProject.styleGuide)
    : { width: 256, height: 256 }

  const silhouettePreview = useLocalFilePreview(asset?.silhouettePath)
  const outlinePreview = useLocalFilePreview(asset?.outlinePath)
  const colorPreview = useLocalFilePreview(asset?.filePath)
  const guidePreview = useLocalFilePreview(asset?.guideImagePath)

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = design.width
    canvas.height = design.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [design.width, design.height])

  useEffect(() => {
    initCanvas()
  }, [initCanvas, assetId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const src = asset?.filePath || asset?.outlinePath || asset?.silhouettePath
    if (!src) return
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
    void window.indieForge.files.readPreviewDataUrl(src).then(({ dataUrl }) => {
      if (dataUrl) img.src = dataUrl
    })
  }, [asset?.filePath, asset?.outlinePath, asset?.silhouettePath, assetId])

  const selectTool = (m: ToolMode) => {
    setMode(m)
    if (m === 'outline') setBrush((b) => (b > 8 ? 3 : b))
    if (m === 'silhouette') setBrush((b) => (b < 8 ? 14 : b))
  }

  const paintAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * canvas.width
    const y = ((clientY - rect.top) / rect.height) * canvas.height
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = brush
    if (mode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else if (mode === 'outline') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = outlineColor
    } else if (mode === 'silhouette') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#000000'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = color
    }
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drawing.current = true
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    ctx?.beginPath()
    paintAt(e.clientX, e.clientY)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return
    paintAt(e.clientX, e.clientY)
  }

  const onPointerUp = () => {
    drawing.current = false
    canvasRef.current?.getContext('2d')?.beginPath()
  }

  const canvasDataUrl = () => canvasRef.current?.toDataURL('image/png') ?? ''

  const saveLayer = async (kind: 'silhouette' | 'outline' | 'color' | 'frame') => {
    if (!projectId || !assetId) return
    const dataUrl = canvasDataUrl()
    if (!dataUrl) return
    setBusy(true)
    setError(null)
    try {
      const frameIndex =
        kind === 'frame' ? (asset?.animationClips?.[0]?.frames.length ?? 0) : undefined
      const updated = await window.indieForge.assets.saveCraftLayer(
        projectId,
        assetId,
        kind,
        dataUrl,
        frameIndex !== undefined ? { frameIndex } : undefined
      )
      updateActiveAsset(updated)
      setStatus(
        kind === 'outline'
          ? updated.outlinePath
            ? 'Outline saved — ready to export for Aseprite'
            : 'Outline erased / cleared'
          : kind === 'silhouette'
            ? 'Silhouette saved'
            : kind === 'color'
              ? 'Color layer saved'
              : `Frame ${frameIndex} saved`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const exportAseprite = async () => {
    if (!projectId || !assetId || busy) return
    setBusy(true)
    setError(null)
    try {
      // Always snapshot current canvas as outline before export if in outline mode or no outline yet
      const dataUrl = canvasDataUrl()
      if (dataUrl && (mode === 'outline' || !asset?.outlinePath)) {
        const updated = await window.indieForge.assets.saveCraftLayer(
          projectId,
          assetId,
          'outline',
          dataUrl
        )
        updateActiveAsset(updated)
      }
      const result = await window.indieForge.assets.exportCraftForAseprite(projectId, assetId)
      setStatus(
        `Aseprite folder opened: ${result.dir} — open *_outline.png there; keep this guide visible in Indie Forge while you shade`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aseprite export failed')
    } finally {
      setBusy(false)
    }
  }

  const importGuide = async () => {
    if (!projectId || !assetId || busy) return
    const { filePath } = await window.indieForge.files.chooseImage()
    if (!filePath) return
    setBusy(true)
    setError(null)
    try {
      const updated = await window.indieForge.assets.setCraftGuide(projectId, assetId, filePath)
      updateActiveAsset(updated)
      setGuideVisible(true)
      setStatus('Guide photo saved — valid as the only Craft layer (camera/depth for AI Paint)')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import guide')
    } finally {
      setBusy(false)
    }
  }

  const removeGuide = async () => {
    if (!projectId || !assetId || busy) return
    setBusy(true)
    setError(null)
    try {
      const updated = await window.indieForge.assets.clearCraftGuide(projectId, assetId)
      updateActiveAsset(updated)
      setStatus('Guide removed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove guide')
    } finally {
      setBusy(false)
    }
  }

  const setCanvasSize = async (size: number) => {
    if (!projectId || !activeProject || busy) return
    if (
      size !== design.width &&
      !confirm(
        `Resize craft canvas to ${size}×${size}? Current unsaved drawing on the canvas will be cleared (saved layers on disk stay).`
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await window.indieForge.projects.update(projectId, {
        styleGuide: {
          ...activeProject.styleGuide,
          designSpriteWidth: size,
          designSpriteHeight: size
        }
      })
      setActiveProject(updated)
      setStatus(`Design canvas set to ${size}×${size} (export size stays ${updated.styleGuide.defaultSpriteWidth}px)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update canvas size')
    } finally {
      setBusy(false)
    }
  }

  const clearCanvasAndSavedOutline = async () => {
    if (!projectId || !assetId) return
    initCanvas()
    if (!asset?.outlinePath && !asset?.silhouettePath) {
      setStatus('Canvas cleared')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await window.indieForge.assets.clearCraftDrawing(projectId, assetId)
      updateActiveAsset(updated)
      setStatus('Canvas + saved outline cleared (guide photo kept)')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear saved outline')
    } finally {
      setBusy(false)
    }
  }

  const revealFolder = async () => {
    if (!projectId || !assetId) return
    try {
      const { path } = await window.indieForge.assets.revealCraftDir(projectId, assetId)
      setStatus(`Craft folder: ${path}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open folder')
    }
  }

  if (!activeProject || !asset) {
    return <p style={{ color: 'var(--muted)' }}>Loading craft studio…</p>
  }

  if (activeProject.craftPath !== 'pixel_silhouette') {
    return (
      <div className="craft-studio">
        <div className="page-header">
          <h2>Craft Studio</h2>
        </div>
        <p>
          This project uses <strong>engine materials</strong> craft path. Use{' '}
          <Link to={`/projects/${projectId}/production`}>Production</Link> for Unity/Godot material
          &amp; FX planning instead of pixel silhouette painting.
        </p>
      </div>
    )
  }

  const palette = activeProject.styleGuide.colorPalette
    ? [...DEFAULT_PALETTE]
    : DEFAULT_PALETTE

  const stageStyle = {
    width: Math.min(displayMax, Math.max(design.width, 480)),
    maxWidth: '100%' as const,
    aspectRatio: `${design.width} / ${design.height}`
  }

  return (
    <div className="craft-studio">
      <div className="page-header">
        <div>
          <p className="scene-composer-breadcrumb">
            <Link to={`/projects/${projectId}/assets`}>Assets</Link> / Craft
          </p>
          <h2>
            {asset.name} <StatusBadge status={asset.craftStage ?? asset.status} />
          </h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
            Start with a <strong style={{ color: 'var(--forge-gold)' }}>guide photo</strong> (camera /
            depth) — that alone is a valid Craft asset. Optionally trace outline → silhouette → paint.
            Motion Studio fits joints; AI Paint uses the guide for umpire-POV camera.
          </p>
        </div>
        <div className="toolbar">
          {(asset.outlinePath || asset.silhouettePath || asset.filePath || asset.guideImagePath) && (
            <button
              type="button"
              onClick={() => navigate(`/projects/${projectId}/motion/${asset.id}`)}
            >
              Continue to Motion Studio
            </button>
          )}
          <button type="button" className="secondary" onClick={() => navigate(`/projects/${projectId}/motion/${asset.id}`)}>
            Motion Studio
          </button>
          <button type="button" className="secondary" onClick={() => navigate(`/projects/${projectId}/animation/${asset.id}`)}>
            Animation Studio
          </button>
          <button type="button" className="secondary" onClick={() => void revealFolder()} disabled={busy}>
            Open craft folder
          </button>
        </div>
      </div>

      <div className="craft-layout">
        <aside className="craft-tools panel-section">
          <strong>Canvas</strong>
          <label>
            Design size (working pixels)
            <select
              value={design.width}
              onChange={(e) => void setCanvasSize(Number(e.target.value))}
              disabled={busy}
            >
              <option value={512}>512 × 512</option>
              <option value={1024}>1024 × 1024</option>
              <option value={1536}>1536 × 1536</option>
              <option value={2048}>2048 × 2048</option>
            </select>
          </label>
          <p className="craft-notes" style={{ marginTop: 0 }}>
            Export / in-engine size is separate ({activeProject.styleGuide.defaultSpriteWidth}×
            {activeProject.styleGuide.defaultSpriteHeight}) — change that under Export if you want
            smaller Godot sprites.
          </p>
          <label>
            On-screen zoom
            <select
              value={displayMax}
              onChange={(e) => setDisplayMax(Number(e.target.value))}
            >
              <option value={560}>Comfortable</option>
              <option value={720}>Large</option>
              <option value={900}>Extra large</option>
            </select>
          </label>

          <strong>Guide photo</strong>
          <p className="craft-notes" style={{ marginTop: 0 }}>
            Camera / depth reference (e.g. umpire-behind-plate screenshot). Can be the only Craft
            layer — AI Paint locks camera to this image. Trace on top only if you want an outline.
          </p>
          <div className="craft-actions">
            <button type="button" className="secondary" onClick={() => void importGuide()} disabled={busy}>
              {asset.guideImagePath ? 'Replace guide photo' : 'Import guide photo'}
            </button>
            {asset.guideImagePath && (
              <button type="button" className="ghost" onClick={() => void removeGuide()} disabled={busy}>
                Remove guide
              </button>
            )}
          </div>
          {asset.guideImagePath && (
            <>
              <p className="craft-notes" style={{ color: 'var(--forge-gold)', marginTop: 0 }}>
                Guide saved — valid Craft starting point. Outline/silhouette optional.
              </p>
              <label className="wizard-check">
                <input
                  type="checkbox"
                  checked={guideVisible}
                  onChange={(e) => setGuideVisible(e.target.checked)}
                />
                Show guide under drawing
              </label>
              <label>
                Guide opacity {Math.round(guideOpacity * 100)}%
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={guideOpacity}
                  onChange={(e) => setGuideOpacity(Number(e.target.value))}
                />
              </label>
            </>
          )}

          <strong>Tool</strong>
          <div className="craft-tool-row">
            {(['outline', 'silhouette', 'paint', 'eraser'] as ToolMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={mode === m ? '' : 'secondary'}
                onClick={() => selectTool(m)}
              >
                {m}
              </button>
            ))}
          </div>
          {mode === 'outline' && (
            <>
              <p className="craft-notes" style={{ marginTop: 0 }}>
                Thin contour for the batter stance (etc.). Transparent background on save.
              </p>
              <label>
                Outline color
                <input
                  type="color"
                  value={outlineColor}
                  onChange={(e) => setOutlineColor(e.target.value)}
                />
              </label>
              <div className="craft-palette">
                {['#ff8c00', '#000000', '#ffffff', '#e63946', '#457b9d', '#2d6a4f'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="craft-swatch"
                    style={{ background: c }}
                    aria-label={c}
                    onClick={() => setOutlineColor(c)}
                  />
                ))}
              </div>
            </>
          )}
          <label>
            Brush {brush}px
            <input
              type="range"
              min={1}
              max={48}
              value={brush}
              onChange={(e) => setBrush(Number(e.target.value))}
            />
          </label>
          {mode === 'paint' && (
            <>
              <label>
                Color
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
              <div className="craft-palette">
                {palette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="craft-swatch"
                    style={{ background: c }}
                    aria-label={c}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </>
          )}
          <div className="craft-actions">
            <button type="button" onClick={() => void saveLayer('outline')} disabled={busy}>
              Save outline
            </button>
            <button type="button" onClick={() => void exportAseprite()} disabled={busy}>
              Export for Aseprite
            </button>
            <button type="button" className="secondary" onClick={() => void saveLayer('silhouette')} disabled={busy}>
              Save filled silhouette
            </button>
            <button type="button" className="secondary" onClick={() => void saveLayer('color')} disabled={busy}>
              Save color
            </button>
            <button type="button" className="secondary" onClick={() => void saveLayer('frame')} disabled={busy}>
              Add animation frame
            </button>
            <button type="button" className="ghost" onClick={() => void clearCanvasAndSavedOutline()} disabled={busy}>
              Clear canvas
            </button>
          </div>
          {status && <p className="craft-status">{status}</p>}
          {asset.engineNotes && (
            <p className="craft-notes">
              <strong>Godot:</strong> {asset.engineNotes}
            </p>
          )}
        </aside>

        <section className="craft-canvas-wrap">
          <div className="craft-stage" style={stageStyle}>
            {guidePreview && guideVisible && (
              <img
                src={guidePreview}
                alt="Trace guide"
                className="craft-guide-img"
                style={{ opacity: guideOpacity }}
                draggable={false}
              />
            )}
            <canvas
              ref={canvasRef}
              className="craft-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          </div>
          <div className="craft-previews">
            {guidePreview && (
              <div>
                <span>Guide</span>
                <img src={guidePreview} alt="" className="craft-thumb" />
              </div>
            )}
            {outlinePreview && (
              <div>
                <span>Outline</span>
                <img src={outlinePreview} alt="" className="craft-thumb" />
              </div>
            )}
            {silhouettePreview && (
              <div>
                <span>Silhouette</span>
                <img src={silhouettePreview} alt="" className="craft-thumb" />
              </div>
            )}
            {colorPreview && asset.filePath !== asset.silhouettePath && asset.filePath !== asset.outlinePath && (
              <div>
                <span>Color</span>
                <img src={colorPreview} alt="" className="craft-thumb" />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
