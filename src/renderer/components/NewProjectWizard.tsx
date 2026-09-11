import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreateProjectInput, CraftPath, GameEngine } from '@shared/types/project'
import { ENGINE_PROFILES } from '@shared/toolchain'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

type TemplateId = 'blank' | 'ring-em-up' | 'neon-recall'

export function NewProjectWizard() {
  const navigate = useNavigate()
  const { setPendingPlan, openProject } = useProjectStore()
  const { setLoading, setError } = useUIStore()
  const [template, setTemplate] = useState<TemplateId>('ring-em-up')
  const [engine, setEngine] = useState<GameEngine>('godot')
  const [craftPath, setCraftPath] = useState<CraftPath>('pixel_silhouette')
  const [name, setName] = useState("Ring'Em Up")
  const [description, setDescription] = useState(
    'Retro arcade baseball umpire sim — craft pixels, ship in Godot.'
  )
  const [runAiPlan, setRunAiPlan] = useState(false)

  const profile = ENGINE_PROFILES[engine]

  const form: CreateProjectInput = useMemo(
    () => ({
      name,
      description,
      targetPlatform: profile.defaultPlatform,
      engine,
      craftPath,
      styleGuide: { ...profile.defaultStyleGuide }
    }),
    [name, description, engine, craftPath, profile]
  )

  const applyTemplate = (id: TemplateId) => {
    setTemplate(id)
    if (id === 'ring-em-up') {
      setEngine('godot')
      setCraftPath('pixel_silhouette')
      setName("Ring'Em Up")
      setDescription(
        'Retro arcade baseball umpire simulation. Silhouette craft → Aseprite → Godot.'
      )
    } else if (id === 'neon-recall') {
      setEngine('unity')
      setCraftPath('engine_materials')
      setName('Neon Recall')
      setDescription(
        '80s neon match game. Plan tiles/FX here; build materials and bloom in Unity.'
      )
    } else {
      setName('')
      setDescription('')
    }
  }

  const handleEngineChange = (next: GameEngine) => {
    setEngine(next)
    setCraftPath(ENGINE_PROFILES[next].craftPath)
    setTemplate('blank')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const project = await window.indieForge.projects.create(form)
      await openProject(project.id)
      if (runAiPlan) {
        const plan = await window.indieForge.ai.planProject(project.id)
        setPendingPlan(plan)
        navigate(`/projects/${project.id}/plan`)
      } else {
        navigate(`/projects/${project.id}/production`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="standalone-page">
      <div className="page-header">
        <h2>New Project</h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem' }}>
          Pick an engine + craft path. IndieForge plans and crafts; Godot/Unity ship the game.
        </p>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <fieldset className="wizard-template-fieldset">
          <legend>Template</legend>
          <div className="wizard-template-row">
            <button
              type="button"
              className={template === 'ring-em-up' ? '' : 'secondary'}
              onClick={() => applyTemplate('ring-em-up')}
            >
              Ring&apos;Em Up · Godot
            </button>
            <button
              type="button"
              className={template === 'neon-recall' ? '' : 'secondary'}
              onClick={() => applyTemplate('neon-recall')}
            >
              Neon Recall · Unity
            </button>
            <button
              type="button"
              className={template === 'blank' ? '' : 'secondary'}
              onClick={() => applyTemplate('blank')}
            >
              Blank
            </button>
          </div>
        </fieldset>

        <label>
          Project name
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Game description
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>

        <div className="two-col">
          <label>
            Engine
            <select value={engine} onChange={(e) => handleEngineChange(e.target.value as GameEngine)}>
              <option value="godot">Godot (open source)</option>
              <option value="unity">Unity</option>
            </select>
          </label>
          <label>
            Craft path
            <select value={craftPath} onChange={(e) => setCraftPath(e.target.value as CraftPath)}>
              <option value="pixel_silhouette">Pixel: silhouette → paint → frames</option>
              <option value="engine_materials">Engine: materials / VFX / levels</option>
            </select>
          </label>
        </div>

        <p className="wizard-profile-hint">
          {engine === 'godot'
            ? 'Default: Craft Studio + Aseprite → import sprites into Godot (nearest filter).'
            : 'Default: Production planner + Cursor prompts → Unity materials, bloom, VFX.'}
        </p>

        <label className="wizard-check">
          <input
            type="checkbox"
            checked={runAiPlan}
            onChange={(e) => setRunAiPlan(e.target.checked)}
          />
          Also run AI asset plan after create (optional — OpenAI)
        </label>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit">Create project</button>
          <button type="button" className="secondary" onClick={() => navigate('/')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
