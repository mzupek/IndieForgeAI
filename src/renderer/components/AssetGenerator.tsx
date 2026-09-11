import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  StatusBadge,
  LocalImagePreview,
  GenerationStatusBanner,
  PreviewLoadingOverlay,
  GenerationSpinner
} from './shared'
import { getDesignSpriteSize, getExportSpriteSize } from '@shared/styleGuide'
import { AssetInspirationPanel } from './AssetInspirationPanel'
import { AssetExportPanel } from './AssetExportPanel'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

export function AssetGenerator() {
  const { projectId, assetId } = useParams()
  const navigate = useNavigate()
  const { activeProject, openProject, setActiveProject, updateActiveAsset } = useProjectStore()
  const { setError } = useUIStore()

  const [chatMessage, setChatMessage] = useState('')
  const [transparent, setTransparent] = useState(true)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewReloadKey, setPreviewReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([])
  const [selectedInspirationIds, setSelectedInspirationIds] = useState<string[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const asset = activeProject?.assets.find((a) => a.id === assetId)
  const styleRefs = activeProject?.styleReferences?.filter((r) => r.analysis) ?? []
  const thread = asset?.designerThread ?? []
  const designSize = activeProject ? getDesignSpriteSize(activeProject.styleGuide) : { width: 1024, height: 1024 }
  const exportSize = activeProject ? getExportSpriteSize(activeProject.styleGuide) : { width: 128, height: 128 }
  const hasImage = Boolean(previewPath)

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  useEffect(() => {
    if (asset?.type === 'animation' && projectId && assetId) {
      navigate(`/projects/${projectId}/animation/${assetId}`, { replace: true })
    }
  }, [asset?.type, projectId, assetId, navigate])

  useEffect(() => {
    if (asset) {
      setPreviewPath(asset.filePath ?? null)
    }
  }, [asset?.id, asset?.filePath])

  useEffect(() => {
    const ids = activeProject?.styleReferences?.filter((r) => r.analysis).map((r) => r.id) ?? []
    setSelectedRefIds(ids)
  }, [activeProject?.id, activeProject?.styleReferences])

  useEffect(() => {
    const ids = asset?.inspirationImages?.map((i) => i.id) ?? []
    if (ids.length) setSelectedInspirationIds(ids)
  }, [asset?.id, asset?.inspirationImages?.length])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread.length, busy])

  const runBusy = async (label: string, fn: () => Promise<void>) => {
    setBusy(true)
    setBusyLabel(label)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  const applyGenerationResult = (filePath: string, updatedAsset: typeof asset) => {
    if (updatedAsset) updateActiveAsset(updatedAsset)
    setPreviewPath(filePath)
    setPreviewReloadKey((k) => k + 1)
  }

  const generateFromPrompt = async (prompt: string) => {
    if (!projectId || !assetId) return
    const result = await window.indieForge.ai.generateVisualAsset(projectId, assetId, {
      prompt,
      transparentBackground: transparent,
      referenceIds: selectedRefIds.length ? selectedRefIds : undefined,
      inspirationIds: selectedInspirationIds.length ? selectedInspirationIds : undefined
    })
    applyGenerationResult(result.previewPath ?? result.filePath, result.asset)
  }

  const refineFromPrompt = async (refinementPrompt: string) => {
    if (!projectId || !assetId) return
    const result = await window.indieForge.ai.generateVariation(projectId, assetId, refinementPrompt)
    applyGenerationResult(result.previewPath ?? result.filePath, result.asset)
  }

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !assetId || !chatMessage.trim() || busy) return

    const message = chatMessage.trim()
    setChatMessage('')
    setBusy(true)
    setBusyLabel('Designer is thinking…')
    setError(null)

    try {
      const result = await window.indieForge.ai.assetDesignerChat(
        projectId,
        assetId,
        message,
        hasImage
      )
      setActiveProject(result.project)

      const suggestions = result.assistantMessage.suggestions
      if (suggestions?.action === 'generate' && suggestions.assetPrompt) {
        setBusyLabel('Generating from designer prompt…')
        await window.indieForge.ai.designerApplyPrompt(projectId, assetId, suggestions.assetPrompt)
        await generateFromPrompt(suggestions.assetPrompt)
      } else if (suggestions?.action === 'refine' && suggestions.refinementPrompt) {
        setBusyLabel('Applying your tweaks…')
        await refineFromPrompt(suggestions.refinementPrompt)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Designer chat failed')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  const handleClearChat = async () => {
    if (!projectId || !assetId || !confirm('Clear this asset’s design conversation?')) return
    const project = await window.indieForge.ai.assetDesignerClear(projectId, assetId)
    setActiveProject(project)
  }

  const handleImport = async () => {
    if (!projectId || busy) return
    const { filePath } = await window.indieForge.files.chooseImage()
    if (!filePath) return
    await runBusy('Importing image…', async () => {
      const updated = await window.indieForge.assets.importVisual(projectId, filePath, assetId)
      updateActiveAsset(updated)
      setPreviewPath(updated.filePath ?? null)
      setPreviewReloadKey((k) => k + 1)
    })
  }

  const handleStartAnimation = async () => {
    if (!projectId || !assetId || busy) return
    setBusy(true)
    setBusyLabel('Creating animation from this sprite…')
    setError(null)
    try {
      const { project, asset: newAsset } = await window.indieForge.assets.createAnimationFrom(
        projectId,
        assetId
      )
      setActiveProject(project)
      navigate(`/projects/${projectId}/animation/${newAsset.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create animation')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  if (!asset) return <p>Asset not found.</p>

  const isBackground = asset.type === 'background'
  const canAnimate =
    hasImage && ['sprite', 'prop', 'effect', 'ui_icon'].includes(asset.type)

  return (
    <div className="asset-generator-studio">
      <div className="page-header">
        <div>
          <h2>{asset.name}</h2>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
            Describe what you want in chat — the designer creates the first version, then refines from your
            feedback.
          </p>
        </div>
        <div className="toolbar">
          {canAnimate && (
            <button type="button" className="btn-sm" onClick={handleStartAnimation} disabled={busy}>
              Start animation from this
            </button>
          )}
          <button type="button" className="secondary btn-sm" onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? 'Hide options' : 'Options'}
          </button>
          <button type="button" className="ghost btn-sm" onClick={handleClearChat} disabled={busy}>
            Clear chat
          </button>
        </div>
      </div>

      <p style={{ marginBottom: '0.75rem' }}>
        {asset.type} · <StatusBadge status={asset.status} />
        {busy && (
          <>
            {' '}
            · <span style={{ color: 'var(--forge-orange)' }}>{busyLabel}</span>
          </>
        )}
      </p>

      {busy && busyLabel.includes('Generating') && <GenerationStatusBanner message={busyLabel} />}

      {asset && projectId && (
        <AssetInspirationPanel
          projectId={projectId}
          asset={asset}
          disabled={busy}
          selectedIds={selectedInspirationIds}
          onSelectedIdsChange={setSelectedInspirationIds}
        />
      )}

      <div className="generator-workspace">
        <section className="generator-chat-panel panel-section">
          <div className="generator-chat-header">
            <strong>Designer</strong>
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
              {hasImage ? 'Refinement mode' : 'Creation mode'}
            </span>
          </div>

          <div className="generator-chat-thread">
            {thread.length === 0 && !busy && (
              <div className="designer-chat-empty">
                <p>Start with a description, for example:</p>
                <ul>
                  <li>“Chunky retro umpire crouched idle, warm orange palette”</li>
                  <li>“Make the silhouette bolder” (after first generate)</li>
                  <li>“More contrast, match our logo gold”</li>
                </ul>
              </div>
            )}

            {thread.map((msg) => (
              <div key={msg.id} className={`designer-message designer-message-${msg.role}`}>
                <div className="designer-message-label">{msg.role === 'user' ? 'You' : 'Designer'}</div>
                <div className="designer-message-body">{msg.content}</div>
                {msg.role === 'assistant' && msg.suggestions?.action && msg.suggestions.action !== 'none' && (
                  <p className="generator-action-hint">
                    {msg.suggestions.action === 'refine' ? '↻ Refined image' : '✦ Generated image'}
                  </p>
                )}
              </div>
            ))}

            {busy && (
              <div className="designer-message designer-message-assistant">
                <div className="designer-message-label">Designer</div>
                <div className="designer-message-body">
                  <span className="btn-with-spinner">
                    <GenerationSpinner size="sm" />
                    {busyLabel}
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form className="generator-composer" onSubmit={handleSendChat}>
            <textarea
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder={
                hasImage
                  ? 'Describe tweaks: bolder outline, more orange, smaller bat…'
                  : 'Describe the asset you want to create…'
              }
              rows={3}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !chatMessage.trim()}>
              {busy ? 'Working…' : hasImage ? 'Send tweak' : 'Create'}
            </button>
          </form>
        </section>

        <section className="generator-preview-panel">
          <div className="preview-panel generator-preview">
            {busy && busyLabel.includes('Generating') && (
              <PreviewLoadingOverlay message={busyLabel} />
            )}
            {previewPath ? (
              <LocalImagePreview
                filePath={previewPath}
                reloadKey={previewReloadKey}
                alt={asset.name}
                mode="fit"
              />
            ) : (
              !busy && (
                <div className="generator-preview-empty">
                  <p>Your asset preview appears here</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    Chat with the designer to generate the first version
                  </p>
                </div>
              )
            )}
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
            Design {designSize.width}×{designSize.height}px · Export {exportSize.width}×{exportSize.height}px
            {isBackground &&
              ` · Background export ${activeProject?.styleGuide.defaultBackgroundWidth}×${activeProject?.styleGuide.defaultBackgroundHeight}px`}
          </p>

          {projectId && <AssetExportPanel projectId={projectId} asset={asset} disabled={busy} />}

          {canAnimate && (
            <div className="asset-next-step panel-section">
              <div>
                <strong>Need to animate this?</strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Creates a new animation asset using this image as frame 0 (the reference pose).
                </p>
              </div>
              <button type="button" className="btn-sm" onClick={handleStartAnimation} disabled={busy}>
                Start animation
              </button>
            </div>
          )}

          {showAdvanced && (
            <div className="generator-advanced panel-section">
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={transparent}
                  onChange={(e) => setTransparent(e.target.checked)}
                  disabled={busy}
                />
                Transparent background
              </label>

              {styleRefs.length > 0 && (
                <div className="style-ref-picker" style={{ marginTop: '0.65rem' }}>
                  <p style={{ margin: '0 0 0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
                    Style references
                  </p>
                  {styleRefs.map((ref) => (
                    <label key={ref.id} className="style-ref-picker-item">
                      <input
                        type="checkbox"
                        checked={selectedRefIds.includes(ref.id)}
                        onChange={(e) => {
                          setSelectedRefIds((ids) =>
                            e.target.checked ? [...ids, ref.id] : ids.filter((id) => id !== ref.id)
                          )
                        }}
                        disabled={busy}
                      />
                      {ref.name} ({ref.role})
                    </label>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
                <button type="button" className="secondary btn-sm" onClick={handleImport} disabled={busy}>
                  Import image
                </button>
                <button
                  type="button"
                  className="ghost btn-sm"
                  onClick={() => navigate(`/projects/${projectId}/style`)}
                  disabled={busy}
                >
                  Manage style refs
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
