import { randomUUID } from 'crypto'
import type {
  CreateAssetDraft,
  GameAsset,
  IndieForgeProject
} from '@shared/types/project'
import { loadProject, saveProject } from './projectStore'

export async function createAsset(
  projectId: string,
  draft: CreateAssetDraft
): Promise<GameAsset> {
  const project = await loadProject(projectId)
  const isAudio = ['music', 'sound_effect', 'voice_line'].includes(draft.type)
  const defaultMedium =
    draft.medium ??
    (isAudio
      ? 'audio'
      : project.craftPath === 'engine_materials'
        ? draft.type === 'effect'
          ? 'vfx_graph'
          : 'engine_material'
        : draft.type === 'animation'
          ? 'sprite_sheet'
          : 'pixel_sprite')
  const asset: GameAsset = {
    id: randomUUID(),
    projectId,
    sceneIds: draft.sceneIds ?? [],
    name: draft.name,
    type: draft.type,
    description: draft.description ?? '',
    prompt: draft.prompt ?? '',
    status: 'planned',
    medium: defaultMedium,
    craftStage: draft.craftStage ?? 'planned',
    craftTool:
      draft.craftTool ??
      (isAudio
        ? 'audio'
        : project.craftPath === 'pixel_silhouette'
          ? 'craft_studio'
          : project.engine),
    engineNotes: draft.engineNotes
  }

  project.assets.push(asset)
  for (const sceneId of asset.sceneIds) {
    const scene = project.scenes.find((s) => s.id === sceneId)
    if (scene && !scene.assetIds.includes(asset.id)) {
      scene.assetIds.push(asset.id)
    }
  }

  await saveProject(project)
  return asset
}

export async function updateAsset(
  projectId: string,
  assetId: string,
  patch: Partial<GameAsset>
): Promise<GameAsset> {
  const project = await loadProject(projectId)
  const index = project.assets.findIndex((a) => a.id === assetId)
  if (index === -1) throw new Error(`Asset not found: ${assetId}`)

  const existing = project.assets[index]
  const updated: GameAsset = { ...existing, ...patch, id: existing.id, projectId }

  if (patch.sceneIds) {
    project.scenes.forEach((scene) => {
      scene.assetIds = scene.assetIds.filter((id) => id !== assetId)
    })
    for (const sceneId of updated.sceneIds) {
      const scene = project.scenes.find((s) => s.id === sceneId)
      if (scene && !scene.assetIds.includes(assetId)) {
        scene.assetIds.push(assetId)
      }
    }
  }

  project.assets[index] = updated
  await saveProject(project)
  return updated
}

export async function deleteAsset(projectId: string, assetId: string): Promise<void> {
  const project = await loadProject(projectId)
  project.assets = project.assets.filter((a) => a.id !== assetId)
  project.scenes.forEach((scene) => {
    scene.assetIds = scene.assetIds.filter((id) => id !== assetId)
    if (scene.assetSlots) {
      scene.assetSlots.forEach((slot) => {
        if (slot.assetId === assetId) {
          slot.assetId = undefined
          slot.status = 'missing'
        }
      })
    }
  })
  await saveProject(project)
}

export async function getAsset(
  projectId: string,
  assetId: string
): Promise<{ project: IndieForgeProject; asset: GameAsset }> {
  const project = await loadProject(projectId)
  const asset = project.assets.find((a) => a.id === assetId)
  if (!asset) throw new Error(`Asset not found: ${assetId}`)
  return { project, asset }
}

export async function saveAssetInProject(
  projectId: string,
  asset: GameAsset
): Promise<GameAsset> {
  const project = await loadProject(projectId)
  const index = project.assets.findIndex((a) => a.id === asset.id)
  if (index === -1) throw new Error(`Asset not found: ${asset.id}`)
  project.assets[index] = asset
  await saveProject(project)
  return asset
}
