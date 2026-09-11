import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  EXPORT_SIZE_PRESETS,
  getDesignSpriteSize,
  getExportSpriteSize
} from '@shared/styleGuide'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

export function ExportPanel() {
  const { projectId } = useParams()
  const { activeProject, openProject, setActiveProject } = useProjectStore()
  const { setLoading, setError } = useUIStore()
  const [exportDir, setExportDir] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<string>('')
  const [exportWidth, setExportWidth] = useState(128)
  const [exportHeight, setExportHeight] = useState(128)

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  useEffect(() => {
    if (!activeProject) return
    const size = getExportSpriteSize(activeProject.styleGuide)
    setExportWidth(size.width)
    setExportHeight(size.height)
  }, [activeProject?.id, activeProject?.styleGuide.defaultSpriteWidth, activeProject?.styleGuide.defaultSpriteHeight])

  const pickDir = async () => {
    const { dirPath } = await window.indieForge.files.chooseExportDirectory()
    setExportDir(dirPath)
  }

  const exportSize = { width: exportWidth, height: exportHeight }
  const projectExportSize = activeProject ? getExportSpriteSize(activeProject.styleGuide) : exportSize
  const exportSizeDirty =
    activeProject != null &&
    (exportWidth !== projectExportSize.width || exportHeight !== projectExportSize.height)

  const saveExportSizeToProject = async () => {
    if (!projectId || !activeProject) return
    if (exportWidth < 1 || exportHeight < 1) {
      setError('Export width and height must be at least 1')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const updated = await window.indieForge.projects.update(projectId, {
        styleGuide: {
          ...activeProject.styleGuide,
          defaultSpriteWidth: exportWidth,
          defaultSpriteHeight: exportHeight
        }
      })
      setActiveProject(updated)
      setLastResult(`Saved project export size: ${exportWidth}×${exportHeight}px`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save export size')
    } finally {
      setLoading(false)
    }
  }

  const resetExportSize = () => {
    if (!activeProject) return
    const size = getExportSpriteSize(activeProject.styleGuide)
    setExportWidth(size.width)
    setExportHeight(size.height)
  }

  const useDesignSize = () => {
    if (!activeProject) return
    const design = getDesignSpriteSize(activeProject.styleGuide)
    setExportWidth(design.width)
    setExportHeight(design.height)
  }

  const runExport = async (label: string, fn: () => Promise<unknown>) => {
    if (!exportDir) {
      setError('Choose an export directory first')
      return
    }
    if (exportWidth < 1 || exportHeight < 1) {
      setError('Export width and height must be at least 1')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await fn()
      setLastResult(`${label}: ${JSON.stringify(result)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  if (!activeProject) return <p>Loading...</p>

  const animationAssets = activeProject.assets.filter(
    (a) => a.type === 'animation' && a.animationClips?.[0]?.frames.length
  )

  return (
    <div>
      <div className="page-header">
        <h2>Export Panel</h2>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        Design assets stay at full resolution in the project. Game-ready exports are downscaled to the size you set
        below (nearest-neighbor scaling keeps pixel art crisp). There is no fixed 32×32 limit — that value only comes
        from the Ring&apos;Em Up sample project&apos;s retro pixel-art style.
      </p>

      <div className="form-grid card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>Game export size</h3>
        <div className="two-col">
          <label>
            Width (px)
            <input
              type="number"
              min={1}
              value={exportWidth}
              onChange={(e) => setExportWidth(Number(e.target.value))}
            />
          </label>
          <label>
            Height (px)
            <input
              type="number"
              min={1}
              value={exportHeight}
              onChange={(e) => setExportHeight(Number(e.target.value))}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {EXPORT_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="secondary"
              onClick={() => {
                setExportWidth(preset.width)
                setExportHeight(preset.height)
              }}
            >
              {preset.label}
            </button>
          ))}
          <button type="button" className="secondary" onClick={useDesignSize}>
            Match design size
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={saveExportSizeToProject} disabled={!exportSizeDirty}>
            Save as project default
          </button>
          {exportSizeDirty && (
            <button type="button" className="secondary" onClick={resetExportSize}>
              Reset to project default ({projectExportSize.width}×{projectExportSize.height})
            </button>
          )}
        </div>

        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
          Project default: {projectExportSize.width}×{projectExportSize.height}px
          {exportSizeDirty ? ` · This export will use ${exportWidth}×${exportHeight}px` : ''}
        </p>
      </div>

      <div className="form-grid card" style={{ marginBottom: '1rem' }}>
        <p>Export directory: {exportDir ?? 'Not selected'}</p>
        <button type="button" className="secondary" onClick={pickDir}>
          Choose Export Directory
        </button>
      </div>

      <h3>Visual Assets</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() =>
            runExport('Design PNGs', () =>
              window.indieForge.export.visualAssets(projectId!, exportDir!, 'design')
            )
          }
        >
          Export Design PNGs (full res)
        </button>
        <button
          type="button"
          onClick={() =>
            runExport('Game-ready PNGs', () =>
              window.indieForge.export.visualAssets(projectId!, exportDir!, 'game', exportSize)
            )
          }
        >
          Export Game-Ready PNGs ({exportWidth}×{exportHeight})
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            runExport('Both sizes', () =>
              window.indieForge.export.visualAssets(projectId!, exportDir!, 'both', exportSize)
            )
          }
        >
          Export Both
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            runExport('Project manifest', () =>
              window.indieForge.export.projectManifest(projectId!, exportDir!)
            )
          }
        >
          Export Project Manifest
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            runExport('Audio', () => window.indieForge.export.copyAudio(projectId!, exportDir!))
          }
        >
          Copy Audio Files
        </button>
        {activeProject.scenes.map((scene) => (
          <button
            key={scene.id}
            type="button"
            className="secondary"
            onClick={() =>
              runExport(`Scene package ${scene.name}`, () =>
                window.indieForge.export.scenePackage(projectId!, scene.id, exportDir!)
              )
            }
          >
            Package {scene.name}
          </button>
        ))}
        {activeProject.scenes.map((scene) => (
          <button
            key={`${scene.id}-manifest`}
            type="button"
            className="secondary"
            onClick={() =>
              runExport(`Scene ${scene.name}`, () =>
                window.indieForge.export.sceneManifest(projectId!, scene.id, exportDir!)
              )
            }
          >
            Manifest {scene.name}
          </button>
        ))}
      </div>

      {animationAssets.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Sprite Sheet Export</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {animationAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="secondary"
                onClick={() =>
                  runExport(`Atlas ${asset.name}`, () =>
                    window.indieForge.image.exportAtlas(
                      projectId!,
                      asset.id,
                      exportDir!,
                      'both',
                      exportSize
                    )
                  )
                }
              >
                Export {asset.name} ({exportWidth}×{exportHeight} game sheet)
              </button>
            ))}
          </div>
        </div>
      )}

      {lastResult && (
        <pre className="card" style={{ marginTop: '1rem', fontSize: '0.8rem', overflow: 'auto' }}>
          {lastResult}
        </pre>
      )}
    </div>
  )
}
