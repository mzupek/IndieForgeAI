import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { StyleReferenceRole } from '@shared/types/project'
import { LocalImagePreview } from './shared'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

const ROLES: StyleReferenceRole[] = ['logo', 'mood', 'character', 'ui', 'background', 'other']

export function StyleReferencesPanel() {
  const { projectId } = useParams()
  const { activeProject, openProject, setActiveProject } = useProjectStore()
  const { setLoading, setError } = useUIStore()
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  const refs = activeProject?.styleReferences ?? []

  const run = async (id: string | null, fn: () => Promise<void>) => {
    setBusyId(id)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleAdd = async () => {
    if (!projectId) return
    const { filePath } = await window.indieForge.files.chooseImage()
    if (!filePath) return
    setLoading(true)
    try {
      const project = await window.indieForge.styleReferences.add(projectId, filePath, { role: 'logo' })
      setActiveProject(project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add reference')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (referenceId: string, patch: { name?: string; role?: StyleReferenceRole }) => {
    if (!projectId) return
    await run(referenceId, async () => {
      const project = await window.indieForge.styleReferences.update(projectId, referenceId, patch)
      setActiveProject(project)
    })
  }

  const handleReanalyze = async (referenceId: string) => {
    if (!projectId) return
    setLoading(true)
    try {
      const project = await window.indieForge.styleReferences.reanalyze(projectId, referenceId)
      setActiveProject(project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async (referenceId: string) => {
    if (!projectId) return
    await run(referenceId, async () => {
      const project = await window.indieForge.styleReferences.applyToGuide(projectId, referenceId)
      setActiveProject(project)
    })
  }

  const handleDelete = async (referenceId: string) => {
    if (!projectId || !confirm('Remove this style reference?')) return
    await run(referenceId, async () => {
      const project = await window.indieForge.styleReferences.delete(projectId, referenceId)
      setActiveProject(project)
    })
  }

  if (!activeProject) return <p>Loading…</p>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Style References</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
            Upload logo, mood boards, and theme art. AI analyzes each image and uses it when generating assets.
          </p>
        </div>
        <button type="button" onClick={handleAdd}>
          Add Reference Image
        </button>
      </div>

      {refs.length === 0 && (
        <div className="empty-state">
          <h3>No reference images yet</h3>
          <p>Upload your game logo or style samples so generated assets match your visual identity.</p>
          <button type="button" onClick={handleAdd}>
            Upload First Reference
          </button>
        </div>
      )}

      <div className="style-ref-grid">
        {refs.map((ref) => (
          <article key={ref.id} className="card style-ref-card">
            <div className="style-ref-preview">
              <LocalImagePreview filePath={ref.filePath} alt={ref.name} mode="fit" />
            </div>
            <div className="card-body">
              <label>
                Name
                <input
                  defaultValue={ref.name}
                  key={`${ref.id}-${ref.name}`}
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== ref.name) handleUpdate(ref.id, { name: next })
                  }}
                  disabled={busyId === ref.id}
                />
              </label>
              <label>
                Role
                <select
                  value={ref.role}
                  onChange={(e) => handleUpdate(ref.id, { role: e.target.value as StyleReferenceRole })}
                  disabled={busyId === ref.id}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              {ref.analysis ? (
                <div className="style-ref-analysis">
                  <p>
                    <strong>Summary:</strong> {ref.analysis.summary}
                  </p>
                  {ref.analysis.colorPalette && (
                    <p>
                      <strong>Palette:</strong> {ref.analysis.colorPalette}
                    </p>
                  )}
                  {ref.analysis.generationGuidance && (
                    <p>
                      <strong>Guidance:</strong> {ref.analysis.generationGuidance}
                    </p>
                  )}
                  {ref.analyzedAt && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      Analyzed {new Date(ref.analyzedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Not analyzed yet.</p>
              )}
            </div>
            <div className="card-footer">
              <div className="card-footer-row">
                <button
                  type="button"
                  className="ghost btn-sm"
                  onClick={() => handleReanalyze(ref.id)}
                  disabled={busyId === ref.id}
                >
                  Re-analyze
                </button>
                <button
                  type="button"
                  className="secondary btn-sm"
                  onClick={() => handleApply(ref.id)}
                  disabled={!ref.analysis || busyId === ref.id}
                >
                  Apply to style guide
                </button>
              </div>
              <button
                type="button"
                className="danger btn-sm btn-block"
                onClick={() => handleDelete(ref.id)}
                disabled={busyId === ref.id}
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
