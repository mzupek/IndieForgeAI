import { randomUUID } from 'crypto'
import type { AIAssetPlan, IndieForgeProject } from '@shared/types/project'
import { getOpenAIClient, OPENAI_PLANNING_MODEL } from './openaiClient'
import { buildProjectPlanPrompt } from './promptBuilders'

export async function planProject(project: IndieForgeProject): Promise<AIAssetPlan> {
  const client = await getOpenAIClient()
  const response = await client.chat.completions.create({
    model: OPENAI_PLANNING_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a game asset planning assistant. Return only valid JSON.'
      },
      {
        role: 'user',
        content: buildProjectPlanPrompt(project)
      }
    ]
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No planning response from OpenAI')

  const plan = JSON.parse(content) as AIAssetPlan
  return {
    scenes: plan.scenes ?? [],
    visualAssets: plan.visualAssets ?? [],
    audioAssets: plan.audioAssets ?? [],
    animationPresets: plan.animationPresets ?? [],
    backgroundIdeas: plan.backgroundIdeas ?? [],
    uiIconIdeas: plan.uiIconIdeas ?? [],
    productionSteps: plan.productionSteps ?? []
  }
}

export function applyPlanToProject(
  project: IndieForgeProject,
  plan: AIAssetPlan,
  mode: 'replace' | 'append' = 'replace'
): IndieForgeProject {
  if (mode === 'replace') {
    project.scenes = []
    project.assets = []
  }

  const sceneNameToId = new Map<string, string>()
  for (const sceneDraft of plan.scenes) {
    const existing = project.scenes.find(
      (s) => s.name.toLowerCase() === sceneDraft.name.toLowerCase()
    )
    if (existing) {
      sceneNameToId.set(sceneDraft.name.toLowerCase(), existing.id)
      continue
    }
    const sceneId = randomUUID()
    sceneNameToId.set(sceneDraft.name.toLowerCase(), sceneId)
    project.scenes.push({
      id: sceneId,
      name: sceneDraft.name,
      description: sceneDraft.description,
      assetIds: [],
      status: 'planned'
    })
  }

  const allDrafts = [...plan.visualAssets, ...plan.audioAssets]
  for (const draft of allDrafts) {
    const assetId = randomUUID()
    const sceneIds = draft.suggestedSceneNames
      .map((name) => sceneNameToId.get(name.toLowerCase()))
      .filter((id): id is string => Boolean(id))

    const asset = {
      id: assetId,
      projectId: project.id,
      sceneIds,
      name: draft.name,
      type: draft.type,
      description: draft.description,
      prompt: draft.promptHint,
      status: 'planned' as const,
      medium: draft.medium,
      craftTool: draft.craftTool,
      engineNotes: draft.engineNotes,
      craftStage: 'planned' as const
    }

    project.assets.push(asset)
    for (const sceneId of sceneIds) {
      const scene = project.scenes.find((s) => s.id === sceneId)
      if (scene) scene.assetIds.push(assetId)
    }
  }

  return project
}
