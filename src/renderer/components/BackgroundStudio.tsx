import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  StatusBadge,
  LocalImagePreview,
  GenerationStatusBanner,
  PreviewLoadingOverlay,
  GenerationSpinner
} from './shared'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

export function BackgroundStudio() {
  const { projectId, assetId } = useParams()
  const { activeProject, openProject, updateActiveAsset } = useProjectStore()
  const { setError } = useUIStore()
  const [width, setWidth] = useState(1080)
  const [height, setHeight] = useState(1920)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewReloadKey, setPreviewReloadKey] = useState(0)
  const [generating, setGenerating] = useState(false)

  const asset = activeProject?.assets.find((a) => a.id === assetId)

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  useEffect(() => {
    if (activeProject) {
      setWidth(activeProject.styleGuide.defaultBackgroundWidth)
      setHeight(activeProject.styleGuide.defaultBackgroundHeight)
    }
    if (asset?.filePath) setPreviewPath(asset.filePath)
  }, [activeProject, asset])

  const handleGenerate = async () => {
    if (!projectId || !assetId || generating) return
    setGenerating(true)
    setError(null)
    try {
      const result = await window.indieForge.ai.generateBackground(projectId, assetId, { width, height })
      updateActiveAsset(result.asset)
      setPreviewPath(result.filePath)
      setPreviewReloadKey((key) => key + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Background generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleVariation = async () => {
    if (!projectId || !assetId || generating) return
    const editPrompt = window.prompt('Describe the background variation:')
    if (!editPrompt) return
    setGenerating(true)
    setError(null)
    try {
      const result = await window.indieForge.ai.generateVariation(projectId, assetId, editPrompt)
      updateActiveAsset(result.asset)
      setPreviewPath(result.filePath)
      setPreviewReloadKey((key) => key + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Variation failed')
    } finally {
      setGenerating(false)
    }
  }

  if (!asset) return <p>Background asset not found.</p>

  return (
    <div>
      <div className="page-header">
        <h2>Background Studio — {asset.name}</h2>
      </div>
      <p>
        <StatusBadge status={asset.status} />
        {generating && (
          <>
            {' '}
            · <span style={{ color: 'var(--accent)' }}>Generating…</span>
          </>
        )}
      </p>

      {generating && <GenerationStatusBanner message="Generating background with OpenAI…" />}

      <div className="two-col">
        <div className="form-grid">
          <div className="two-col">
            <label>
              Width
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                disabled={generating}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                disabled={generating}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={handleGenerate} disabled={generating} className={generating ? 'is-generating' : undefined}>
              {generating ? (
                <span className="btn-with-spinner">
                  <GenerationSpinner size="sm" />
                  Generating…
                </span>
              ) : (
                'Generate Background'
              )}
            </button>
            <button type="button" className="secondary" onClick={handleVariation} disabled={generating}>
              Generate Variation
            </button>
          </div>
        </div>
        <div className="preview-panel">
          {generating && <PreviewLoadingOverlay message="Generating background…" />}
          {previewPath ? (
            <LocalImagePreview
              filePath={previewPath}
              reloadKey={previewReloadKey}
              alt={asset.name}
              mode="fit"
            />
          ) : (
            !generating && <span style={{ color: 'var(--muted)' }}>No background yet</span>
          )}
        </div>
      </div>
    </div>
  )
}
