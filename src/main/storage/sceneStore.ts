import { randomUUID } from 'crypto'
import { copyFile, mkdir, unlink } from 'fs/promises'
import { basename, extname, join } from 'path'
import type {
  AssetSlot,
  CameraDefinition,
  GameScene,
  IndieForgeProject,
  SceneLayer,
  SceneReference,
  SceneReferenceRole,
  ViewportDefinition
} from '@shared/types/project'
import {
  createAssetSlot,
  defaultCamera,
  defaultViewport,
  ensureSceneBlueprint,
  syncSceneAssetIdsFromSlots
} from '@shared/sceneDefaults'
import { loadProject, saveProject } from './projectStore'
import { getSceneReferencesDir } from './filePaths'

export interface CreateSceneInput {
  name: string
  description?: string
  viewport?: ViewportDefinition
  camera?: CameraDefinition
}

export interface UpdateScenePatch {
  name?: string
  description?: string
  status?: GameScene['status']
  viewport?: ViewportDefinition
  camera?: CameraDefinition
  layers?: SceneLayer[]
  assetSlots?: AssetSlot[]
  references?: SceneReference[]
}

function getSceneOrThrow(project: IndieForgeProject, sceneId: string): GameScene {
  const scene = project.scenes.find((s) => s.id === sceneId)
  if (!scene) throw new Error(`Scene not found: ${sceneId}`)
  return ensureSceneBlueprint(scene, project.styleGuide)
}

/** Keep asset.sceneIds aligned when slots gain/lose assetId. */
function syncAssetSceneMembership(
  project: IndieForgeProject,
  sceneId: string,
  previousAssetIds: string[],
  nextAssetIds: string[]
): void {
  const removed = previousAssetIds.filter((id) => !nextAssetIds.includes(id))
  const added = nextAssetIds.filter((id) => !previousAssetIds.includes(id))

  for (const assetId of removed) {
    const asset = project.assets.find((a) => a.id === assetId)
    if (!asset) continue
    asset.sceneIds = asset.sceneIds.filter((id) => id !== sceneId)
  }

  for (const assetId of added) {
    const asset = project.assets.find((a) => a.id === assetId)
    if (!asset) continue
    if (!asset.sceneIds.includes(sceneId)) {
      asset.sceneIds.push(sceneId)
    }
  }
}

export async function createScene(
  projectId: string,
  input: CreateSceneInput
): Promise<{ project: IndieForgeProject; scene: GameScene }> {
  const project = await loadProject(projectId)
  const viewport = input.viewport ?? defaultViewport(project.styleGuide)
  const scene: GameScene = {
    id: randomUUID(),
    name: input.name.trim() || 'Untitled Scene',
    description: input.description?.trim() || '',
    assetIds: [],
    status: 'planned',
    viewport,
    camera: input.camera ?? defaultCamera(viewport.orientation),
    layers: [],
    assetSlots: [],
    references: []
  }

  project.scenes.push(scene)
  const saved = await saveProject(project)
  return { project: saved, scene }
}

export async function updateScene(
  projectId: string,
  sceneId: string,
  patch: UpdateScenePatch
): Promise<{ project: IndieForgeProject; scene: GameScene }> {
  const project = await loadProject(projectId)
  const index = project.scenes.findIndex((s) => s.id === sceneId)
  if (index === -1) throw new Error(`Scene not found: ${sceneId}`)

  const existing = ensureSceneBlueprint(project.scenes[index], project.styleGuide)
  const previousAssetIds = [...existing.assetIds]

  const updated: GameScene = {
    ...existing,
    ...patch,
    id: existing.id,
    viewport: patch.viewport ?? existing.viewport,
    camera: patch.camera ?? existing.camera,
    layers: patch.layers ?? existing.layers,
    assetSlots: patch.assetSlots ?? existing.assetSlots,
    references: patch.references ?? existing.references
  }

  updated.assetIds = syncSceneAssetIdsFromSlots(updated)
  syncAssetSceneMembership(project, sceneId, previousAssetIds, updated.assetIds)

  project.scenes[index] = updated
  const saved = await saveProject(project)
  return { project: saved, scene: updated }
}

export async function addSceneSlot(
  projectId: string,
  sceneId: string,
  partial?: Partial<AssetSlot> & { name?: string }
): Promise<{ project: IndieForgeProject; scene: GameScene }> {
  const project = await loadProject(projectId)
  const scene = getSceneOrThrow(project, sceneId)
  const slots = [...(scene.assetSlots ?? [])]
  const name = partial?.name?.trim() || `Slot ${slots.length + 1}`
  const slot = createAssetSlot({
    id: randomUUID(),
    name,
    role: partial?.role ?? 'environment_prop',
    format: partial?.format ?? 'static_image',
    bounds: partial?.bounds,
    anchor: partial?.anchor,
    layer: partial?.layer ?? (slots.length + 1) * 10,
    contract: partial?.contract,
    assetId: partial?.assetId,
    status: partial?.status
  })
  slots.push(slot)
  return updateScene(projectId, sceneId, { assetSlots: slots })
}

export async function updateSceneSlot(
  projectId: string,
  sceneId: string,
  slotId: string,
  patch: Partial<Omit<AssetSlot, 'assetId'>> & { assetId?: string | null }
): Promise<{ project: IndieForgeProject; scene: GameScene }> {
  const project = await loadProject(projectId)
  const scene = getSceneOrThrow(project, sceneId)
  const slots = [...(scene.assetSlots ?? [])]
  const index = slots.findIndex((s) => s.id === slotId)
  if (index === -1) throw new Error(`Slot not found: ${slotId}`)

  const existing = slots[index]
  const next: AssetSlot = {
    ...existing,
    ...patch,
    id: existing.id,
    contract: patch.contract
      ? { ...existing.contract, ...patch.contract, id: existing.contract.id }
      : existing.contract,
    bounds: patch.bounds ? { ...existing.bounds, ...patch.bounds } : existing.bounds,
    // null clears the link (IPC drops undefined)
    assetId:
      patch.assetId === null
        ? undefined
        : patch.assetId !== undefined
          ? patch.assetId
          : existing.assetId
  }

  if (patch.assetId === null && patch.status === undefined) {
    next.status = 'missing'
  } else if (typeof patch.assetId === 'string' && patch.status === undefined) {
    const linked = project.assets.find((a) => a.id === patch.assetId)
    next.status =
      linked?.status === 'approved' || linked?.status === 'exported'
        ? 'approved'
        : linked?.filePath
          ? 'draft'
          : 'missing'
  }

  slots[index] = next
  return updateScene(projectId, sceneId, { assetSlots: slots })
}

export async function deleteSceneSlot(
  projectId: string,
  sceneId: string,
  slotId: string
): Promise<{ project: IndieForgeProject; scene: GameScene }> {
  const project = await loadProject(projectId)
  const scene = getSceneOrThrow(project, sceneId)
  const slots = (scene.assetSlots ?? []).filter((s) => s.id !== slotId)
  return updateScene(projectId, sceneId, { assetSlots: slots })
}

export async function getScene(
  projectId: string,
  sceneId: string
): Promise<{ project: IndieForgeProject; scene: GameScene }> {
  const project = await loadProject(projectId)
  return { project, scene: getSceneOrThrow(project, sceneId) }
}

export async function addSceneReference(
  projectId: string,
  sceneId: string,
  filePath: string,
  options?: { name?: string; role?: SceneReferenceRole; notes?: string }
): Promise<{ project: IndieForgeProject; scene: GameScene }> {
  const project = await loadProject(projectId)
  const scene = getSceneOrThrow(project, sceneId)
  const dir = getSceneReferencesDir(projectId, sceneId)
  await mkdir(dir, { recursive: true })

  const id = randomUUID()
  const ext = extname(filePath) || '.png'
  const dest = join(dir, `${id}${ext}`)
  await copyFile(filePath, dest)

  const ref: SceneReference = {
    id,
    name: options?.name?.trim() || basename(filePath, ext) || 'Scene reference',
    filePath: dest,
    role: options?.role ?? 'composition',
    notes: options?.notes,
    createdAt: new Date().toISOString()
  }

  const references = [...(scene.references ?? []), ref]
  return updateScene(projectId, sceneId, { references })
}

export async function deleteSceneReference(
  projectId: string,
  sceneId: string,
  referenceId: string
): Promise<{ project: IndieForgeProject; scene: GameScene }> {
  const project = await loadProject(projectId)
  const scene = getSceneOrThrow(project, sceneId)
  const ref = (scene.references ?? []).find((r) => r.id === referenceId)
  const references = (scene.references ?? []).filter((r) => r.id !== referenceId)

  if (ref?.filePath) {
    try {
      await unlink(ref.filePath)
    } catch {
      // ignore missing file
    }
  }

  return updateScene(projectId, sceneId, { references })
}
