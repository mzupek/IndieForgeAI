import { copyFile, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import { app, dialog, ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type {
  CreateAssetDraft,
  CreateProjectInput,
  ExportSpriteSize,
  IndieForgeProject,
  ProjectStyleGuide,
  StyleReferenceRole,
  VisualGenerationOverrides
} from '@shared/types/project'
import {
  createAsset,
  deleteAsset,
  getAsset,
  saveAssetInProject,
  updateAsset
} from '../storage/assetStore'
import {
  addSceneReference,
  addSceneSlot,
  createScene,
  deleteSceneReference,
  deleteSceneSlot,
  updateScene,
  updateSceneSlot,
  type CreateSceneInput,
  type UpdateScenePatch
} from '../storage/sceneStore'
import {
  createProject,
  deleteProject,
  duplicateProject,
  importProjectFromJson,
  listProjects,
  loadProject,
  updateProject
} from '../storage/projectStore'
import { isOpenAIConfigured, setOpenAIKey } from '../storage/configStore'
import { getProjectsRoot, getVisualAssetDir } from '../storage/filePaths'
import { getPreviewMimeType } from '../storage/previewMime'
import { planProject } from '../openai/openaiPlanningService'
import { resetOpenAIClient } from '../openai/openaiClient'
import { proposeSceneBlueprint } from '../openai/sceneBlueprintService'
import { generateSlotAsset } from '../openai/generateSlotAsset'
import {
  addStyleReference,
  applyStyleReferenceAnalysisToGuide,
  deleteStyleReference,
  reanalyzeStyleReference,
  updateStyleReference
} from '../openai/styleReferenceService'
import {
  createCharacter,
  updateCharacter,
  deleteCharacter,
  setCharacterReference
} from '../storage/characterService'
import {
  importPose,
  removePose,
  updatePose,
  getPoseMetadataMap
} from '../storage/poseService'
import {
  applyDesignerAssetPrompt,
  applyDesignerStyleGuide,
  clearDesignerChat,
  clearAssetDesignerChat,
  sendDesignerMessage,
  sendAssetDesignerMessage
} from '../openai/designerChatService'
import { getVisualProvider, getAudioProvider } from '../providers/registry'
import { normalizeSprite } from '../image/normalizeSprite'
import { exportAnimationAtlas, exportProjectVisualAssets, exportSingleAsset } from '../image/exportAsset'
import { previewAnimationSpriteSheet } from '../image/animationSheetPreview'
import {
  addAssetInspiration,
  deleteAssetInspiration,
  reanalyzeAssetInspiration
} from '../openai/assetInspirationService'
import { exportStudioKit } from '../export/studioKitExport'
import { exportProjectManifest } from '../image/atlasExporter'
import { exportSceneManifest, exportScenePackage } from '../image/scenePackageExport'
import type { AssetSlot } from '@shared/types/project'

async function loadSeedProject(
  kind: 'ring-em-up' | 'neon-recall' = 'ring-em-up'
): Promise<IndieForgeProject> {
  const file = `${kind}.project.json`
  const candidates = [
    join(app.getAppPath(), 'seed', file),
    join(__dirname, '../../seed', file),
    join(process.cwd(), 'seed', file)
  ]
  for (const seedPath of candidates) {
    if (existsSync(seedPath)) {
      const raw = await readFile(seedPath, 'utf-8')
      return JSON.parse(raw) as IndieForgeProject
    }
  }
  throw new Error(`Seed file not found: ${file}`)
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROJECTS_LIST, () => listProjects())

  ipcMain.handle(IPC_CHANNELS.PROJECTS_CREATE, (_e, input: CreateProjectInput) =>
    createProject(input)
  )

  ipcMain.handle(IPC_CHANNELS.PROJECTS_OPEN, (_e, projectId: string) => loadProject(projectId))

  ipcMain.handle(
    IPC_CHANNELS.PROJECTS_UPDATE,
    (_e, projectId: string, patch: Partial<IndieForgeProject>) => updateProject(projectId, patch)
  )

  ipcMain.handle(IPC_CHANNELS.PROJECTS_DELETE, async (_e, projectId: string) => {
    await deleteProject(projectId)
    return { ok: true as const }
  })

  ipcMain.handle(
    IPC_CHANNELS.PROJECTS_DUPLICATE,
    (_e, projectId: string, newName?: string) => duplicateProject(projectId, newName)
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECTS_SEED_SAMPLE,
    async (_e, kind?: 'ring-em-up' | 'neon-recall') => {
      const seed = await loadSeedProject(kind ?? 'ring-em-up')
      return importProjectFromJson(seed)
    }
  )

  ipcMain.handle(IPC_CHANNELS.AI_PLAN_PROJECT, async (_e, projectId: string) => {
    const project = await loadProject(projectId)
    return planProject(project)
  })

  ipcMain.handle(
    IPC_CHANNELS.AI_PROPOSE_SCENE_BLUEPRINT,
    async (_e, projectId: string, sceneId: string, description?: string) =>
      proposeSceneBlueprint(projectId, sceneId, description)
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_SLOT_ASSET,
    async (_e, projectId: string, sceneId: string, slotId: string) =>
      generateSlotAsset(projectId, sceneId, slotId)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENES_CREATE,
    async (_e, projectId: string, input: CreateSceneInput) => createScene(projectId, input)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENES_UPDATE,
    async (_e, projectId: string, sceneId: string, patch: UpdateScenePatch) =>
      updateScene(projectId, sceneId, patch)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENES_ADD_SLOT,
    async (
      _e,
      projectId: string,
      sceneId: string,
      partial?: Partial<AssetSlot> & { name?: string }
    ) => addSceneSlot(projectId, sceneId, partial)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENES_UPDATE_SLOT,
    async (
      _e,
      projectId: string,
      sceneId: string,
      slotId: string,
      patch: Partial<Omit<AssetSlot, 'assetId'>> & { assetId?: string | null }
    ) => updateSceneSlot(projectId, sceneId, slotId, patch)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENES_DELETE_SLOT,
    async (_e, projectId: string, sceneId: string, slotId: string) =>
      deleteSceneSlot(projectId, sceneId, slotId)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENES_ADD_REFERENCE,
    async (
      _e,
      projectId: string,
      sceneId: string,
      filePath: string,
      options?: { name?: string; role?: 'composition' | 'camera' | 'mood' | 'other'; notes?: string }
    ) => addSceneReference(projectId, sceneId, filePath, options)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENES_DELETE_REFERENCE,
    async (_e, projectId: string, sceneId: string, referenceId: string) =>
      deleteSceneReference(projectId, sceneId, referenceId)
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_VISUAL,
    async (
      _e,
      projectId: string,
      assetId: string,
      overrides?: VisualGenerationOverrides
    ) => {
      const project = await loadProject(projectId)
      const provider = getVisualProvider('openai-visual')
      return provider.generateImage({ projectId, assetId, overrides }, project)
    }
  )


  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_BACKGROUND,
    async (
      _e,
      projectId: string,
      assetId: string,
      dimensions?: { width: number; height: number }
    ) => {
      const project = await loadProject(projectId)
      const provider = getVisualProvider('openai-visual')
      return provider.generateImage(
        {
          projectId,
          assetId,
          overrides: {
            width: dimensions?.width ?? project.styleGuide.defaultBackgroundWidth,
            height: dimensions?.height ?? project.styleGuide.defaultBackgroundHeight
          }
        },
        project
      )
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_VARIATION,
    async (_e, projectId: string, assetId: string, editPrompt: string) => {
      const project = await loadProject(projectId)
      const provider = getVisualProvider('openai-visual')
      if (!provider.editImage) throw new Error('Provider does not support editImage')
      return provider.editImage({ projectId, assetId, editPrompt }, project)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSETS_CREATE,
    (_e, projectId: string, draft: CreateAssetDraft) => createAsset(projectId, draft)
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSETS_UPDATE,
    (_e, projectId: string, assetId: string, patch: Partial<IndieForgeProject['assets'][0]>) =>
      updateAsset(projectId, assetId, patch)
  )

  ipcMain.handle(IPC_CHANNELS.ASSETS_DELETE, async (_e, projectId: string, assetId: string) => {
    await deleteAsset(projectId, assetId)
    return { ok: true as const }
  })

  ipcMain.handle(
    IPC_CHANNELS.ASSETS_INSPIRATION_ADD,
    async (
      _e,
      projectId: string,
      assetId: string,
      filePath: string,
      options?: { name?: string; notes?: string }
    ) => addAssetInspiration(projectId, assetId, filePath, options)
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSETS_INSPIRATION_DELETE,
    async (_e, projectId: string, assetId: string, inspirationId: string) =>
      deleteAssetInspiration(projectId, assetId, inspirationId)
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSETS_INSPIRATION_REANALYZE,
    async (_e, projectId: string, assetId: string, inspirationId: string) =>
      reanalyzeAssetInspiration(projectId, assetId, inspirationId)
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSETS_IMPORT_VISUAL,
    async (_e, projectId: string, filePath: string, assetId?: string) => {
      const project = await loadProject(projectId)
      let asset
      if (assetId) {
        asset = (await getAsset(projectId, assetId)).asset
      } else {
        asset = await createAsset(projectId, {
          name: basename(filePath, '.png'),
          type: 'sprite'
        })
      }

      const outDir = getVisualAssetDir(projectId, asset.id)
      await mkdir(outDir, { recursive: true })
      const dest = join(outDir, basename(filePath))
      await copyFile(filePath, dest)

      asset.filePath = dest
      asset.status = 'generated'
      asset.providerId = 'manual-import-visual'
      return saveAssetInProject(projectId, asset)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSETS_IMPORT_AUDIO,
    async (_e, projectId: string, filePath: string, assetId?: string) => {
      const provider = getAudioProvider('manual-import-audio')
      const project = await loadProject(projectId)
      if (!provider.importAudio) throw new Error('Audio import not supported')
      const result = await provider.importAudio(
        filePath,
        { projectId, assetId },
        project
      )
      return result.asset
    }
  )


  ipcMain.handle(
    IPC_CHANNELS.IMAGE_NORMALIZE,
    async (_e, imagePath: string, width: number, height: number, baselineY?: number) =>
      normalizeSprite(imagePath, width, height, baselineY)
  )

  ipcMain.handle(
    IPC_CHANNELS.IMAGE_EXPORT_SINGLE_ASSET,
    async (
      _e,
      projectId: string,
      assetId: string,
      exportDir: string,
      mode: 'design' | 'game' | 'both' = 'both',
      exportSize?: ExportSpriteSize
    ) => {
      const result = await exportSingleAsset(projectId, assetId, exportDir, mode, exportSize)
      const { asset } = await getAsset(projectId, assetId)
      asset.status = 'exported'
      await saveAssetInProject(projectId, asset)
      return result
    }
  )


  ipcMain.handle(
    IPC_CHANNELS.IMAGE_EXPORT_ATLAS,
    async (
      _e,
      projectId: string,
      assetId: string,
      exportDir: string,
      mode: 'design' | 'game' | 'both' = 'both',
      exportSize?: ExportSpriteSize
    ) => {
      const result = await exportAnimationAtlas(projectId, assetId, exportDir, mode, exportSize)
      const { asset } = await getAsset(projectId, assetId)
      asset.status = 'exported'
      await saveAssetInProject(projectId, asset)

      return {
        assetId,
        exportedAt: new Date().toISOString(),
        pngPaths: result.pngPaths,
        spriteSheetPath: result.gameSheetPath ?? result.designSheetPath,
        atlasJsonPath: result.atlasJsonPath
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.IMAGE_PREVIEW_ANIMATION_SHEET,
    async (_e, projectId: string, assetId: string, exportSize?: ExportSpriteSize) =>
      previewAnimationSpriteSheet(projectId, assetId, exportSize)
  )

  ipcMain.handle(IPC_CHANNELS.FILES_CHOOSE_IMAGE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    return { filePath: result.canceled ? null : (result.filePaths[0] ?? null) }
  })

  ipcMain.handle(IPC_CHANNELS.FILES_CHOOSE_AUDIO, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }]
    })
    return { filePath: result.canceled ? null : (result.filePaths[0] ?? null) }
  })

  ipcMain.handle(IPC_CHANNELS.FILES_CHOOSE_EXPORT_DIR, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return { dirPath: result.canceled ? null : (result.filePaths[0] ?? null) }
  })

  ipcMain.handle(IPC_CHANNELS.FILES_READ_PREVIEW_DATA_URL, async (_e, filePath: string) => {
    if (!filePath || !existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    const data = await readFile(filePath)
    const mime = getPreviewMimeType(filePath)
    return { dataUrl: `data:${mime};base64,${data.toString('base64')}` }
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_PROJECT_MANIFEST, async (_e, projectId: string, exportDir: string) => {
    const project = await loadProject(projectId)
    await mkdir(exportDir, { recursive: true })
    const manifestPath = join(exportDir, 'project_manifest.json')
    await exportProjectManifest(project, manifestPath)
    return { manifestPath }
  })

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_SCENE_MANIFEST,
    async (_e, projectId: string, sceneId: string, exportDir: string) => {
      const project = await loadProject(projectId)
      await mkdir(exportDir, { recursive: true })
      const manifestPath = join(exportDir, `scene_${sceneId}_manifest.json`)
      await exportSceneManifest(project, sceneId, manifestPath)
      return { manifestPath }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_SCENE_PACKAGE,
    async (_e, projectId: string, sceneId: string, exportDir: string) =>
      exportScenePackage(projectId, sceneId, exportDir)
  )

  ipcMain.handle(IPC_CHANNELS.EXPORT_COPY_AUDIO, async (_e, projectId: string, exportDir: string) => {
    const project = await loadProject(projectId)
    await mkdir(exportDir, { recursive: true })
    const audioDir = join(exportDir, 'audio')
    await mkdir(audioDir, { recursive: true })

    const copiedPaths: string[] = []
    for (const asset of project.assets) {
      if (!asset.filePath) continue
      if (!['music', 'sound_effect', 'voice_line'].includes(asset.type)) continue
      const dest = join(audioDir, basename(asset.filePath))
      await copyFile(asset.filePath, dest)
      copiedPaths.push(dest)
    }
    return { copiedPaths }
  })

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_VISUAL_ASSETS,
    async (
      _e,
      projectId: string,
      exportDir: string,
      mode: 'design' | 'game' | 'both',
      exportSize?: ExportSpriteSize
    ) => {
      return exportProjectVisualAssets(projectId, exportDir, mode, exportSize)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STYLE_REFERENCES_ADD,
    async (
      _e,
      projectId: string,
      filePath: string,
      options?: { name?: string; role?: StyleReferenceRole }
    ) => addStyleReference(projectId, filePath, options)
  )

  ipcMain.handle(
    IPC_CHANNELS.STYLE_REFERENCES_UPDATE,
    async (
      _e,
      projectId: string,
      referenceId: string,
      patch: { name?: string; role?: StyleReferenceRole }
    ) => updateStyleReference(projectId, referenceId, patch)
  )

  ipcMain.handle(IPC_CHANNELS.STYLE_REFERENCES_REANALYZE, async (_e, projectId: string, referenceId: string) =>
    reanalyzeStyleReference(projectId, referenceId)
  )

  ipcMain.handle(IPC_CHANNELS.STYLE_REFERENCES_DELETE, async (_e, projectId: string, referenceId: string) =>
    deleteStyleReference(projectId, referenceId)
  )

  ipcMain.handle(
    IPC_CHANNELS.STYLE_REFERENCES_APPLY_TO_GUIDE,
    async (_e, projectId: string, referenceId: string) =>
      applyStyleReferenceAnalysisToGuide(projectId, referenceId)
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_DESIGNER_CHAT,
    async (_e, projectId: string, message: string, context?: { assetId?: string }) =>
      sendDesignerMessage(projectId, message, context)
  )

  ipcMain.handle(IPC_CHANNELS.AI_DESIGNER_CLEAR_CHAT, async (_e, projectId: string) =>
    clearDesignerChat(projectId)
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_DESIGNER_APPLY_STYLE,
    async (_e, projectId: string, updates: Partial<ProjectStyleGuide>) =>
      applyDesignerStyleGuide(projectId, updates)
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_DESIGNER_APPLY_PROMPT,
    async (_e, projectId: string, assetId: string, prompt: string) =>
      applyDesignerAssetPrompt(projectId, assetId, prompt)
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_ASSET_DESIGNER_CHAT,
    async (_e, projectId: string, assetId: string, message: string, hasGeneratedImage: boolean) =>
      sendAssetDesignerMessage(projectId, assetId, message, hasGeneratedImage)
  )

  ipcMain.handle(IPC_CHANNELS.AI_ASSET_DESIGNER_CLEAR, async (_e, projectId: string, assetId: string) =>
    clearAssetDesignerChat(projectId, assetId)
  )

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_OPENAI_KEY, async () => ({
    configured: await isOpenAIConfigured()
  }))

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET_OPENAI_KEY, async (_e, apiKey: string) => {
    await setOpenAIKey(apiKey)
    resetOpenAIClient()
    return { ok: true as const }
  })

  // Character CRUD handlers
  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_CHARACTER_CREATE,
    async (_e, projectId: string, input: {
      gameId: string
      name: string
      role: string
      styleNotes?: string
      tags?: string[]
    }) => createCharacter(projectId, input)
  )

  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_CHARACTER_UPDATE,
    async (_e, projectId: string, characterId: string, patch: any) =>
      updateCharacter(projectId, characterId, patch)
  )

  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_CHARACTER_DELETE,
    async (_e, projectId: string, characterId: string) => {
      await deleteCharacter(projectId, characterId)
      return { ok: true as const }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_CHARACTER_SET_REFERENCE,
    async (_e, projectId: string, characterId: string, sourcePath: string) =>
      setCharacterReference(projectId, characterId, sourcePath)
  )

  // Pose handlers
  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_POSE_IMPORT,
    async (
      _e,
      projectId: string,
      characterId: string,
      slot: string,
      sourcePath: string,
      options?: any
    ) => importPose(projectId, characterId, slot as any, sourcePath, options)
  )

  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_POSE_REMOVE,
    async (_e, projectId: string, poseId: string) => {
      await removePose(projectId, poseId)
      return { ok: true as const }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_POSE_UPDATE,
    async (_e, projectId: string, poseId: string, patch: any) =>
      updatePose(projectId, poseId, patch)
  )

  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_POSE_GET_METADATA,
    async (_e, projectId: string, characterId: string) => {
      const metadataMap = await getPoseMetadataMap(projectId, characterId)
      // Convert Map to object for IPC
      const obj: Record<string, any> = {}
      metadataMap.forEach((value, key) => {
        obj[key] = value
      })
      return obj
    }
  )
}

export async function ensureAppDataDirs(): Promise<void> {
  await mkdir(getProjectsRoot(), { recursive: true })
}
