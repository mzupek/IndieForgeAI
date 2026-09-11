import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { randomUUID } from '../utils/id'
import type { AIAssetPlan, GameAsset, IndieForgeProject } from '@shared/types/project'
import { defaultCamera, defaultViewport } from '@shared/sceneDefaults'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

function applyPlan(project: IndieForgeProject, plan: AIAssetPlan, mode: 'replace' | 'append'): IndieForgeProject {
  const next = { ...project, scenes: [...project.scenes], assets: [...project.assets] }
  if (mode === 'replace') {
    next.scenes = []
    next.assets = []
  }

  const sceneNameToId = new Map<string, string>()
  for (const sceneDraft of plan.scenes) {
    const existing = next.scenes.find((s) => s.name.toLowerCase() === sceneDraft.name.toLowerCase())
    if (existing) {
      sceneNameToId.set(sceneDraft.name.toLowerCase(), existing.id)
      continue
    }
    const sceneId = randomUUID()
    sceneNameToId.set(sceneDraft.name.toLowerCase(), sceneId)
    const viewport = defaultViewport(project.styleGuide)
    next.scenes.push({
      id: sceneId,
      name: sceneDraft.name,
      description: sceneDraft.description,
      assetIds: [],
      status: 'planned',
      viewport,
      camera: defaultCamera(viewport.orientation),
      layers: [],
      assetSlots: []
    })
  }

  const allDrafts = [...plan.visualAssets, ...plan.audioAssets]
  for (const draft of allDrafts) {
    const assetId = randomUUID()
    const sceneIds = draft.suggestedSceneNames
      .map((name) => sceneNameToId.get(name.toLowerCase()))
      .filter((id): id is string => Boolean(id))

    const asset: GameAsset = {
      id: assetId,
      projectId: project.id,
      sceneIds,
      name: draft.name,
      type: draft.type,
      description: draft.description,
      prompt: draft.promptHint,
      status: 'planned',
      medium: draft.medium,
      craftTool: draft.craftTool,
      engineNotes: draft.engineNotes,
      craftStage: 'planned'
    }
    next.assets.push(asset)
    for (const sceneId of sceneIds) {
      const scene = next.scenes.find((s) => s.id === sceneId)
      if (scene) scene.assetIds.push(assetId)
    }
  }

  if (plan.productionSteps?.length) {
    next.productionPlan = {
      updatedAt: new Date().toISOString(),
      steps: plan.productionSteps
    }
  }

  return next
}

export function AIPlanReview() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { activeProject, pendingPlan, setPendingPlan, setActiveProject } = useProjectStore()
  const { setLoading, setError } = useUIStore()
  const [plan, setPlan] = useState<AIAssetPlan | null>(pendingPlan)

  useEffect(() => {
    if (!activeProject && projectId) {
      useProjectStore.getState().openProject(projectId)
    }
  }, [activeProject, projectId])

  useEffect(() => {
    if (pendingPlan) setPlan(pendingPlan)
  }, [pendingPlan])

  const handleRegenerate = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const newPlan = await window.indieForge.ai.planProject(projectId)
      setPlan(newPlan)
      setPendingPlan(newPlan)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Regenerate failed')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async (mode: 'replace' | 'append') => {
    if (!activeProject || !plan) return
    setLoading(true)
    try {
      const updated = applyPlan(activeProject, plan, mode)
      const saved = await window.indieForge.projects.update(activeProject.id, {
        scenes: updated.scenes,
        assets: updated.assets
      })
      setActiveProject(saved)
      setPendingPlan(null)
      navigate(`/projects/${saved.id}/scenes`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  if (!plan) {
    return <p>No plan loaded. Create a project or regenerate from project settings.</p>
  }

  return (
    <div>
      <div className="page-header">
        <h2>AI Plan Review</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="secondary" onClick={handleRegenerate}>
            Regenerate
          </button>
          <button type="button" className="secondary" onClick={() => handleAccept('append')}>
            Append Plan
          </button>
          <button type="button" onClick={() => handleAccept('replace')}>
            Accept Plan
          </button>
        </div>
      </div>

      <div className="plan-section">
        <h4>Scenes ({plan.scenes.length})</h4>
        <ul className="plan-list">
          {plan.scenes.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong> — {s.description}
            </li>
          ))}
        </ul>
      </div>

      <div className="two-col">
        <div className="plan-section">
          <h4>Visual Assets ({plan.visualAssets.length})</h4>
          <ul className="plan-list">
            {plan.visualAssets.map((a) => (
              <li key={a.name}>
                <strong>{a.name}</strong> ({a.type}) — {a.description}
              </li>
            ))}
          </ul>
        </div>
        <div className="plan-section">
          <h4>Audio Assets ({plan.audioAssets.length})</h4>
          <ul className="plan-list">
            {plan.audioAssets.map((a) => (
              <li key={a.name}>
                <strong>{a.name}</strong> ({a.type}) — {a.description}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {plan.animationPresets.length > 0 && (
        <div className="plan-section">
          <h4>Animation Presets</h4>
          <p>{plan.animationPresets.join(', ')}</p>
        </div>
      )}
    </div>
  )
}
