import { useEffect, useState } from 'react'
import type { GameAsset } from '@shared/types/project'
import { EXPORT_SIZE_PRESETS, getExportSpriteSize } from '@shared/styleGuide'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

type ExportMode = 'design' | 'game' | 'both'

export function AssetExportPanel({
  projectId,
  asset,
  disabled
}: {
  projectId: string
  asset: GameAsset
  disabled?: boolean
}) {
  const { activeProject, updateActiveAsset } = useProjectStore()
  const { setError } = useUIStore()
  const [mode, setMode] = useState<ExportMode>('both')
  const [exportWidth, setExportWidth] = useState(128)
  const [exportHeight, setExportHeight] = useState(128)
  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)

  const isBackground = asset.type === 'background'

  useEffect(() => {
    if (!activeProject) return
    const size = getExportSpriteSize(activeProject.styleGuide)
    setExportWidth(size.width)
    setExportHeight(size.height)
  }, [activeProject?.id, activeProject?.styleGuide.defaultSpriteWidth, activeProject?.styleGuide.defaultSpriteHeight])

  const hasImage = Boolean(asset.filePath)

  const handleExport = async () => {
    if (!projectId || !hasImage || busy) return
    const { dirPath } = await window.indieForge.files.chooseExportDirectory()
    if (!dirPath) return

    setBusy(true)
    setError(null)
    setLastResult(null)
    try {
      const result = await window.indieForge.image.exportSingleAsset(projectId, asset.id, dirPath, mode, {
        width: exportWidth,
        height: exportHeight
      })
      setLastResult(`Exported ${result.copiedPaths.length} file(s) to ${dirPath}`)
      updateActiveAsset({ ...asset, status: 'exported' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="asset-export-panel">
      <div className="asset-export-row">
        <label className="asset-export-mode">
          Export
          <select value={mode} onChange={(e) => setMode(e.target.value as ExportMode)} disabled={disabled || busy}>
            <option value="both">Design + game-ready</option>
            <option value="design">Design (full-res)</option>
            <option value="game">Game-ready (scaled)</option>
          </select>
        </label>

        {!isBackground && mode !== 'design' && (
          <div className="asset-export-size">
            <label>
              W
              <input
                type="number"
                min={1}
                max={1024}
                value={exportWidth}
                onChange={(e) => setExportWidth(Number(e.target.value))}
                disabled={disabled || busy}
              />
            </label>
            <label>
              H
              <input
                type="number"
                min={1}
                max={1024}
                value={exportHeight}
                onChange={(e) => setExportHeight(Number(e.target.value))}
                disabled={disabled || busy}
              />
            </label>
          </div>
        )}

        <button type="button" onClick={handleExport} disabled={disabled || busy || !hasImage}>
          {busy ? 'Exporting…' : 'Export…'}
        </button>
      </div>

      {!isBackground && mode !== 'design' && (
        <div className="asset-export-presets">
          {EXPORT_SIZE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="ghost btn-sm"
              onClick={() => {
                setExportWidth(p.width)
                setExportHeight(p.height)
              }}
              disabled={disabled || busy}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {!hasImage && (
        <p className="asset-export-hint">Generate or import an image to enable export.</p>
      )}
      {lastResult && <p className="asset-export-result">{lastResult}</p>}
    </div>
  )
}
