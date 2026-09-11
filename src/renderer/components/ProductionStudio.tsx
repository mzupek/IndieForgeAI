import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ProductionPlan, ProductionStep } from '@shared/types/project'
import { buildDefaultProductionPlan } from '@shared/toolchain'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

export function ProductionStudio() {
  const { projectId } = useParams()
  const { activeProject, openProject, setActiveProject } = useProjectStore()
  const { setError } = useUIStore()
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [kitPath, setKitPath] = useState<string | null>(null)

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  if (!activeProject || !projectId) {
    return <p style={{ color: 'var(--muted)' }}>Loading production…</p>
  }

  const plan: ProductionPlan =
    activeProject.productionPlan ?? buildDefaultProductionPlan(activeProject)

  const ensurePlan = async (): Promise<ProductionPlan> => {
    if (activeProject.productionPlan) return activeProject.productionPlan
    const next = buildDefaultProductionPlan(activeProject)
    const updated = await window.indieForge.projects.update(projectId, { productionPlan: next })
    setActiveProject(updated)
    return next
  }

  const toggleStep = async (stepId: string) => {
    setBusy(true)
    try {
      const current = await ensurePlan()
      const steps = current.steps.map((s) =>
        s.id === stepId ? { ...s, done: !s.done } : s
      )
      const productionPlan: ProductionPlan = {
        updatedAt: new Date().toISOString(),
        steps
      }
      const updated = await window.indieForge.projects.update(projectId, { productionPlan })
      setActiveProject(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update plan')
    } finally {
      setBusy(false)
    }
  }

  const resetPlan = async () => {
    setBusy(true)
    try {
      const productionPlan = buildDefaultProductionPlan(activeProject)
      const updated = await window.indieForge.projects.update(projectId, { productionPlan })
      setActiveProject(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset plan')
    } finally {
      setBusy(false)
    }
  }

  const copyPrompt = async (step: ProductionStep) => {
    if (!step.cursorPrompt) return
    await navigator.clipboard.writeText(step.cursorPrompt)
    setCopiedId(step.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const exportKit = async () => {
    setBusy(true)
    setError(null)
    try {
      const { dirPath } = await window.indieForge.files.chooseExportDirectory()
      if (!dirPath) return
      const result = await window.indieForge.export.studioKit(projectId, dirPath)
      setKitPath(result.path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Studio kit export failed')
    } finally {
      setBusy(false)
    }
  }

  const byMedium = activeProject.assets.reduce<Record<string, number>>((acc, a) => {
    const key = a.medium ?? a.type
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="production-studio">
      <div className="page-header">
        <div>
          <h2>Production</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem' }}>
            {activeProject.name} · <strong>{activeProject.engine}</strong> · {activeProject.craftPath}
          </p>
        </div>
        <div className="toolbar">
          <button type="button" className="secondary" onClick={() => void resetPlan()} disabled={busy}>
            Reset recipe
          </button>
          <button type="button" onClick={() => void exportKit()} disabled={busy}>
            Export Studio Kit
          </button>
        </div>
      </div>

      {kitPath && (
        <p className="craft-status">
          Studio Kit written to <code>{kitPath}</code> — copy into your {activeProject.engine} repo.
        </p>
      )}

      <div className="production-grid">
        <section className="panel-section">
          <h3>Inventory</h3>
          <p className="scene-refs-hint">
            {activeProject.scenes.length} scenes · {activeProject.assets.length} assets
          </p>
          <ul className="production-medium-list">
            {Object.entries(byMedium).map(([medium, count]) => (
              <li key={medium}>
                <span>{medium}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
          <p className="scene-refs-hint">
            {activeProject.craftPath === 'pixel_silhouette' ? (
              <>
                Pixel path — open assets in{' '}
                <Link to={`/projects/${projectId}/assets`}>Craft Studio</Link>.
              </>
            ) : (
              <>
                Materials path — implement in Unity with Cursor prompts below. IndieForge does not
                generate final neon art.
              </>
            )}
          </p>
        </section>

        <section className="panel-section production-steps">
          <h3>Production recipe</h3>
          <ol className="production-step-list">
            {plan.steps.map((step) => (
              <li key={step.id} className={step.done ? 'is-done' : ''}>
                <label className="production-step-head">
                  <input
                    type="checkbox"
                    checked={Boolean(step.done)}
                    onChange={() => void toggleStep(step.id)}
                    disabled={busy}
                  />
                  <span>
                    <strong>{step.title}</strong>
                    <em>
                      {step.tool} · {step.owner}
                    </em>
                  </span>
                </label>
                <p>{step.description}</p>
                {step.cursorPrompt && (
                  <button
                    type="button"
                    className="secondary btn-sm"
                    onClick={() => void copyPrompt(step)}
                  >
                    {copiedId === step.id ? 'Copied' : 'Copy Cursor prompt'}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
