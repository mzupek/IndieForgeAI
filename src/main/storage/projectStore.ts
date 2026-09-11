import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type {
  CreateProjectInput,
  IndieForgeProject,
  ProjectSummary
} from '@shared/types/project'
import { ensureSceneBlueprint } from '@shared/sceneDefaults'
import { buildDefaultProductionPlan, defaultCraftPathForEngine } from '@shared/toolchain'
import {
  getProjectDir,
  getProjectFilePath,
  getProjectsRoot
} from './filePaths'

async function ensureProjectsRoot(): Promise<void> {
  await mkdir(getProjectsRoot(), { recursive: true })
}

function normalizeProject(project: IndieForgeProject): IndieForgeProject {
  const engine = project.engine ?? 'godot'
  const craftPath = project.craftPath ?? defaultCraftPathForEngine(engine)
  const scenes = project.scenes.map((s) => ensureSceneBlueprint(s, project.styleGuide))
  const withProfile = { ...project, engine, craftPath, scenes }
  return {
    ...withProfile,
    productionPlan: project.productionPlan ?? buildDefaultProductionPlan(withProfile)
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await ensureProjectsRoot()
  const entries = await readdir(getProjectsRoot(), { withFileTypes: true })
  const summaries: ProjectSummary[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const project = await loadProject(entry.name)
      summaries.push({
        id: project.id,
        name: project.name,
        description: project.description,
        targetPlatform: project.targetPlatform,
        engine: project.engine,
        craftPath: project.craftPath,
        sceneCount: project.scenes.length,
        assetCount: project.assets.length,
        updatedAt: project.updatedAt
      })
    } catch {
      // skip invalid project dirs
    }
  }

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function loadProject(projectId: string): Promise<IndieForgeProject> {
  const filePath = getProjectFilePath(projectId)
  const raw = await readFile(filePath, 'utf-8')
  const project = JSON.parse(raw) as IndieForgeProject
  return normalizeProject(project)
}

export async function saveProject(project: IndieForgeProject): Promise<IndieForgeProject> {
  const dir = getProjectDir(project.id)
  await mkdir(dir, { recursive: true })
  await mkdir(`${dir}/assets/visual`, { recursive: true })
  await mkdir(`${dir}/assets/audio`, { recursive: true })
  await mkdir(`${dir}/generated`, { recursive: true })
  await mkdir(`${dir}/exports`, { recursive: true })
  await mkdir(`${dir}/style-references`, { recursive: true })

  project.updatedAt = new Date().toISOString()
  const normalized = normalizeProject(project)
  await writeFile(getProjectFilePath(project.id), JSON.stringify(normalized, null, 2), 'utf-8')
  return normalized
}

export async function createProject(input: CreateProjectInput): Promise<IndieForgeProject> {
  const now = new Date().toISOString()
  const engine = input.engine
  const craftPath = input.craftPath ?? defaultCraftPathForEngine(engine)
  const project: IndieForgeProject = {
    id: randomUUID(),
    name: input.name,
    description: input.description,
    targetPlatform: input.targetPlatform,
    engine,
    craftPath,
    styleGuide: input.styleGuide,
    styleReferences: [],
    designerChat: [],
    scenes: [],
    assets: [],
    createdAt: now,
    updatedAt: now
  }
  project.productionPlan = buildDefaultProductionPlan(project)
  return saveProject(project)
}

export async function updateProject(
  projectId: string,
  patch: Partial<IndieForgeProject>
): Promise<IndieForgeProject> {
  const project = await loadProject(projectId)
  const updated: IndieForgeProject = {
    ...project,
    ...patch,
    id: project.id,
    createdAt: project.createdAt
  }
  return saveProject(updated)
}

export async function deleteProject(projectId: string): Promise<void> {
  const dir = getProjectDir(projectId)
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function duplicateProject(
  projectId: string,
  newName?: string
): Promise<IndieForgeProject> {
  const source = await loadProject(projectId)
  const now = new Date().toISOString()
  const idMap = new Map<string, string>()

  const newId = (): string => randomUUID()

  const scenes = source.scenes.map((scene) => {
    const sceneId = newId()
    idMap.set(scene.id, sceneId)
    return {
      ...scene,
      id: sceneId,
      assetIds: [...scene.assetIds],
      assetSlots: undefined as typeof scene.assetSlots
    }
  })

  const assets = source.assets.map((asset) => {
    const assetId = newId()
    idMap.set(asset.id, assetId)
    return {
      ...asset,
      id: assetId,
      projectId: '',
      sceneIds: asset.sceneIds.map((sid) => idMap.get(sid) ?? sid),
      animationClips: asset.animationClips?.map((clip) => ({
        ...clip,
        id: newId(),
        frames: clip.frames.map((frame) => ({ ...frame, id: newId() }))
      })),
      motionBlueprints: asset.motionBlueprints?.map((bp) => ({
        ...bp,
        id: newId(),
        history: bp.history?.map((h) => ({ ...h, id: newId() }))
      })),
      motionDiagnosticRuns: asset.motionDiagnosticRuns?.map((r) => ({ ...r, id: newId() }))
    }
  })

  scenes.forEach((scene, i) => {
    const sourceScene = source.scenes[i]
    scene.assetSlots = sourceScene.assetSlots?.map((slot) => ({
      ...slot,
      id: newId(),
      assetId: slot.assetId ? idMap.get(slot.assetId) : undefined,
      contract: { ...slot.contract, id: newId() }
    }))
  })

  const newProjectId = newId()
  assets.forEach((a) => {
    a.projectId = newProjectId
  })

  scenes.forEach((scene) => {
    scene.assetIds = scene.assetIds
      .map((aid) => idMap.get(aid))
      .filter((aid): aid is string => Boolean(aid))
  })

  const duplicate: IndieForgeProject = {
    ...source,
    id: newProjectId,
    name: newName ?? `${source.name} (Copy)`,
    scenes,
    assets,
    createdAt: now,
    updatedAt: now
  }

  return saveProject(duplicate)
}

export async function importProjectFromJson(project: IndieForgeProject): Promise<IndieForgeProject> {
  project.id = randomUUID()
  project.createdAt = new Date().toISOString()
  project.updatedAt = project.createdAt
  project.engine = project.engine ?? 'godot'
  project.craftPath = project.craftPath ?? defaultCraftPathForEngine(project.engine)
  project.assets = project.assets.map((a) => ({
    ...a,
    id: randomUUID(),
    projectId: project.id,
    status: 'planned',
    filePath: undefined,
    silhouettePath: undefined,
    providerId: undefined
  }))

  const sceneIdMap = new Map<string, string>()
  project.scenes = project.scenes.map((s) => {
    const newSceneId = randomUUID()
    sceneIdMap.set(s.id, newSceneId)
    return { ...s, id: newSceneId, assetIds: [], status: 'planned' as const }
  })

  project.assets.forEach((asset) => {
    asset.projectId = project.id
    asset.sceneIds = asset.sceneIds
      .map((sid) => sceneIdMap.get(sid))
      .filter((sid): sid is string => Boolean(sid))
    asset.sceneIds.forEach((sceneId) => {
      const scene = project.scenes.find((s) => s.id === sceneId)
      if (scene && !scene.assetIds.includes(asset.id)) {
        scene.assetIds.push(asset.id)
      }
    })
  })

  project.productionPlan = buildDefaultProductionPlan(project)
  return saveProject(project)
}
