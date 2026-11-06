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
  importClip,
  removeClip,
  updateClip
} from '../storage/clipService'
import {
  createPreset,
  updatePreset,
  removePreset
} from '../../core/storage/presetService'
import {
  validateExport,
  dryRunExport,
  exportGame
} from '../../core/storage/exportService'
import {
  createStoryboard,
  updateStoryboard,
  removeStoryboard,
  createShot,
  updateShot,
  removeShot,
  addLayer,
  updateLayer,
  removeLayer,
  addCameraKeyframe,
  removeCameraKeyframe,
  addEffectMarker,
  removeEffectMarker,
  addLayerTimedKey,
  listLayerTimedKeys,
  getLayerTimedKey,
  updateLayerTimedKey,
  removeLayerTimedKey,
  addShotClipBlock,
  listShotClipBlocks,
  getShotClipBlock,
  updateShotClipBlock,
  removeShotClipBlock
} from '../../core/storage/storyboardService'
import {
  getVisualAssets,
  getVisualAsset,
  addVisualAsset,
  updateVisualAsset,
  deleteVisualAsset,
  getAssetStates,
  getAssetState,
  addAssetState,
  updateAssetState,
  deleteAssetState
} from '../../core/storage/studioStorage'
import {
  createBinding,
  createEvent,
  listBindings,
  listEvents,
  getBinding,
  getEvent,
  removeBinding,
  removeEvent,
  updateBinding,
  updateEvent
} from '../../core/storage/eventService'
import {
  createScene as createSceneInPipeline,
  getScene,
  listScenes,
  updateScene as updateSceneInPipeline,
  removeScene,
  addCharacterToCast,
  removeCharacterFromCast,
  attachPreset,
  detachPreset,
  createSceneStoryboard
} from '../../core/storage/sceneService'
import {
  listGameDefinitions,
  getGameDefinition,
  getGameDefinitionByGameId,
  createGameDefinition,
  updateGameDefinition,
  deleteGameDefinition
} from '../../core/storage/gameDefinitionService'
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
    if (!filePath) {
      throw new Error('File path is required')
    }
    
    // Resolve relative paths against dataDir
    const { getDataDir } = await import('../../core/storage/dataDir')
    const { normalize } = await import('path')
    let resolvedPath = filePath
    
    // If path is relative (doesn't start with / or drive letter), resolve against dataDir
    if (!filePath.startsWith('/') && !/^[A-Za-z]:/.test(filePath)) {
      resolvedPath = normalize(join(getDataDir(), filePath))
    } else {
      resolvedPath = normalize(filePath)
    }
    
    // Enforce security: resolved path must be under dataDir
    const dataDir = normalize(getDataDir())
    if (!resolvedPath.startsWith(dataDir)) {
      throw new Error(`File path outside data directory: ${filePath}`)
    }
    
    if (!existsSync(resolvedPath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    
    const data = await readFile(resolvedPath)
    const mime = getPreviewMimeType(resolvedPath)
    return { dataUrl: `data:${mime};base64,${data.toString('base64')}` }
  })

  ipcMain.handle(IPC_CHANNELS.FILES_GET_LOCAL_URL, async (_e, filePath: string) => {
    if (!filePath) {
      throw new Error('File path is required')
    }
    
    // Resolve relative paths against dataDir
    const { getDataDir } = await import('../../core/storage/dataDir')
    const { normalize } = await import('path')
    let resolvedPath = filePath
    
    // If path is relative (doesn't start with / or drive letter), resolve against dataDir
    if (!filePath.startsWith('/') && !/^[A-Za-z]:/.test(filePath)) {
      resolvedPath = normalize(join(getDataDir(), filePath))
    } else {
      resolvedPath = normalize(filePath)
    }
    
    // Enforce security: resolved path must be under dataDir
    const dataDir = normalize(getDataDir())
    if (!resolvedPath.startsWith(dataDir)) {
      throw new Error(`File path outside data directory: ${filePath}`)
    }
    
    if (!existsSync(resolvedPath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    
    // Build forge-file://local/<absolute-path> with per-segment encoding
    // Standard scheme requires a host; use "local" as fixed host
    const pathSegments = resolvedPath.split('/').map(seg => encodeURIComponent(seg))
    const encodedPath = pathSegments.join('/')
    return { localUrl: `forge-file://local${encodedPath}` }
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

  // Clip handlers
  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_CLIP_IMPORT,
    async (_e, sourcePath: string, moment: string, options: any) =>
      importClip(sourcePath, moment as any, options)
  )

  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_CLIP_REMOVE,
    async (_e, clipId: string) => {
      await removeClip(clipId)
      return { ok: true as const }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_CLIP_UPDATE,
    async (_e, clipId: string, patch: any) =>
      updateClip(clipId, patch)
  )

  // Preset handlers
  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_PRESET_CREATE,
    async (_e, type: string, options: any) =>
      createPreset(type as any, options)
  )

  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_PRESET_UPDATE,
    async (_e, presetId: string, updates: any) =>
      updatePreset(presetId, updates)
  )

  ipcMain.handle(
    IPC_CHANNELS.PIPELINE_PRESET_REMOVE,
    async (_e, presetId: string) => {
      await removePreset(presetId)
      return { ok: true as const }
    }
  )

  // Export handlers
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_VALIDATE,
    async (_e, gameId: string) =>
      validateExport(gameId)
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_DRY_RUN,
    async (_e, gameId: string, targetDir?: string) =>
      dryRunExport(gameId, targetDir)
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_RUN,
    async (_e, gameId: string, targetDir?: string) =>
      exportGame(gameId, targetDir)
  )

  // Update game (for export target path)
  ipcMain.handle(
    IPC_CHANNELS.PROJECTS_UPDATE_GAME,
    async (_e, projectId: string, gameId: string, patch: any) => {
      const project = await loadProject(projectId)
      const game = project.assetPipeline.games.find(g => g.id === gameId)
      
      if (!game) {
        throw new Error(`Game not found: ${gameId}`)
      }
      
      Object.assign(game, patch)
      game.updatedAt = new Date().toISOString()
      
      await updateProject(projectId, project)
      return project
    }
  )

  // Storyboard handlers
  ipcMain.handle(
    IPC_CHANNELS.STORYBOARD_CREATE,
    async (_e, projectId: string, gameId: string, input: any) => {
      const result = await createStoryboard(gameId, input)
      const project = await loadProject(projectId)
      return project
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STORYBOARD_UPDATE,
    async (_e, projectId: string, storyboardId: string, updates: any) => {
      await updateStoryboard(storyboardId, updates)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.STORYBOARD_DELETE,
    async (_e, projectId: string, storyboardId: string) => {
      await removeStoryboard(storyboardId)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHOT_CREATE,
    async (_e, projectId: string, storyboardId: string, input: any) => {
      await createShot(storyboardId, input)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHOT_UPDATE,
    async (_e, projectId: string, shotId: string, updates: any) => {
      // Handle background image copy if it's an absolute path outside dataDir
      if (updates.backgroundImage && typeof updates.backgroundImage === 'string') {
        const bgPath = updates.backgroundImage
        
        // If it's an absolute path (not already a relative studio path), copy it
        if (bgPath.startsWith('/') || /^[A-Za-z]:/.test(bgPath)) {
          try {
            const { getDataDir } = await import('../../core/storage/dataDir')
            const dataDir = getDataDir()
            const backgroundsDir = join(dataDir, 'backgrounds')
            
            await mkdir(backgroundsDir, { recursive: true })
            
            const filename = `${Date.now()}-${basename(bgPath)}`
            const destPath = join(backgroundsDir, filename)
            
            if (existsSync(bgPath)) {
              await copyFile(bgPath, destPath)
              console.log(`Copied background from ${bgPath} to ${destPath}`)
              
              // Store as relative path within dataDir: backgrounds/filename
              updates.backgroundImage = `backgrounds/${filename}`
            } else {
              console.warn(`Background image not found: ${bgPath}, storing path as-is`)
            }
          } catch (err) {
            console.error('Failed to copy background image:', err)
            // Continue with original path if copy fails
          }
        }
      }
      
      await updateShot(shotId, updates)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHOT_DELETE,
    async (_e, projectId: string, storyboardId: string, shotId: string) => {
      await removeShot(storyboardId, shotId)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.LAYER_ADD,
    async (_e, projectId: string, shotId: string, layer: any) => {
      await addLayer(shotId, layer)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.LAYER_UPDATE,
    async (_e, projectId: string, shotId: string, layerId: string, updates: any) => {
      await updateLayer(shotId, layerId, updates)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.LAYER_DELETE,
    async (_e, projectId: string, shotId: string, layerId: string) => {
      await removeLayer(shotId, layerId)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.LAYER_KEY_ADD,
    async (_e, projectId: string, shotId: string, layerId: string, input: any) => {
      await addLayerTimedKey(shotId, layerId, input)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.LAYER_KEY_LIST,
    async (_e, shotId: string, layerId?: string) => {
      return await listLayerTimedKeys(shotId, layerId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.LAYER_KEY_GET,
    async (_e, keyId: string) => {
      return await getLayerTimedKey(keyId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.LAYER_KEY_UPDATE,
    async (_e, projectId: string, keyId: string, updates: any) => {
      await updateLayerTimedKey(keyId, updates)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.LAYER_KEY_DELETE,
    async (_e, projectId: string, keyId: string) => {
      await removeLayerTimedKey(keyId)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CAMERA_KEYFRAME_ADD,
    async (_e, projectId: string, shotId: string, keyframe: any) => {
      await addCameraKeyframe(shotId, keyframe)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CAMERA_KEYFRAME_REMOVE,
    async (_e, projectId: string, shotId: string, t: number) => {
      await removeCameraKeyframe(shotId, t)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EFFECT_MARKER_ADD,
    async (_e, projectId: string, shotId: string, effect: any) => {
      await addEffectMarker(shotId, effect)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.EFFECT_MARKER_REMOVE,
    async (_e, projectId: string, shotId: string, t: number) => {
      await removeEffectMarker(shotId, t)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHOT_CLIP_ADD,
    async (_e, projectId: string, shotId: string, input: any) => {
      await addShotClipBlock(shotId, input)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHOT_CLIP_LIST,
    async (_e, shotId: string) => {
      return await listShotClipBlocks(shotId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHOT_CLIP_GET,
    async (_e, blockId: string) => {
      return await getShotClipBlock(blockId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHOT_CLIP_UPDATE,
    async (_e, projectId: string, blockId: string, updates: any) => {
      await updateShotClipBlock(blockId, updates)
      return await loadProject(projectId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHOT_CLIP_DELETE,
    async (_e, projectId: string, blockId: string) => {
      await removeShotClipBlock(blockId)
      return await loadProject(projectId)
    }
  )

  // Game Definition handlers
  ipcMain.handle(
    IPC_CHANNELS.GAME_DEFINITION_LIST,
    async () => listGameDefinitions()
  )

  ipcMain.handle(
    IPC_CHANNELS.GAME_DEFINITION_GET,
    async (_e, id: string) => getGameDefinition(id)
  )

  ipcMain.handle(
    IPC_CHANNELS.GAME_DEFINITION_GET_BY_GAME,
    async (_e, gameId: string) => getGameDefinitionByGameId(gameId)
  )

  ipcMain.handle(
    IPC_CHANNELS.GAME_DEFINITION_CREATE,
    async (_e, gameId: string) => createGameDefinition(gameId)
  )

  ipcMain.handle(
    IPC_CHANNELS.GAME_DEFINITION_UPDATE,
    async (_e, id: string, updates: any) => updateGameDefinition(id, updates)
  )

  ipcMain.handle(
    IPC_CHANNELS.GAME_DEFINITION_DELETE,
    async (_e, id: string) => {
      await deleteGameDefinition(id)
      return { ok: true as const }
    }
  )

  // Scene handlers (Phase C)
  ipcMain.handle(
    IPC_CHANNELS.SCENE_CREATE,
    async (_e, gameId: string, input: any) => createSceneInPipeline(gameId, input)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENE_GET,
    async (_e, sceneId: string) => getScene(sceneId)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENE_LIST,
    async (_e, gameId: string) => listScenes(gameId)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENE_UPDATE,
    async (_e, sceneId: string, updates: any) => updateSceneInPipeline(sceneId, updates)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENE_DELETE,
    async (_e, sceneId: string, removeStoryboard?: boolean) => {
      await removeScene(sceneId, { removeStoryboard })
      return { ok: true as const }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENE_ADD_CHARACTER,
    async (_e, sceneId: string, characterId: string) => addCharacterToCast(sceneId, characterId)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENE_REMOVE_CHARACTER,
    async (_e, sceneId: string, characterId: string) => removeCharacterFromCast(sceneId, characterId)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENE_ATTACH_PRESET,
    async (_e, sceneId: string, presetId: string) => attachPreset(sceneId, presetId)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENE_DETACH_PRESET,
    async (_e, sceneId: string, presetId: string) => detachPreset(sceneId, presetId)
  )

  ipcMain.handle(
    IPC_CHANNELS.SCENE_CREATE_STORYBOARD,
    async (_e, sceneId: string, input: any) => createSceneStoryboard(sceneId, input)
  )

  // P1: Visual Assets
  ipcMain.handle(
    IPC_CHANNELS.VISUAL_ASSET_LIST,
    async (_e, gameId: string) => getVisualAssets(gameId)
  )

  ipcMain.handle(
    IPC_CHANNELS.VISUAL_ASSET_GET,
    async (_e, assetId: string) => getVisualAsset(assetId)
  )

  ipcMain.handle(
    IPC_CHANNELS.VISUAL_ASSET_CREATE,
    async (_e, asset: any) => {
      await addVisualAsset(asset)
      return asset
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.VISUAL_ASSET_UPDATE,
    async (_e, asset: any) => {
      await updateVisualAsset(asset)
      return asset
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.VISUAL_ASSET_DELETE,
    async (_e, assetId: string) => {
      const result = await deleteVisualAsset(assetId)
      return { ok: true as const, ...result }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.VISUAL_ASSET_IMPORT_IMAGE,
    async (_e, assetId: string, sourcePath: string) => {
      const { importStaticAssetImage } = await import('../../core/storage/visualAssetMedia')
      return await importStaticAssetImage(assetId, sourcePath)
    }
  )

  // P1: Asset States
  ipcMain.handle(
    IPC_CHANNELS.ASSET_STATE_LIST,
    async (_e, assetId: string) => getAssetStates(assetId)
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSET_STATE_GET,
    async (_e, stateId: string) => getAssetState(stateId)
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSET_STATE_CREATE,
    async (_e, assetId: string, name: string, sourcePath: string) => {
      // Import similar to pose import - copy file to assets directory
      const { randomUUID } = await import('crypto')
      const { copyFile, mkdir } = await import('fs/promises')
      const { join } = await import('path')
      const sharp = (await import('sharp')).default
      const { getDataDir } = await import('../../core/storage/dataDir')
      
      const stateId = randomUUID()
      const assetsDir = join(getDataDir(), 'assets', assetId)
      await mkdir(assetsDir, { recursive: true })
      
      // Copy file
      const statePath = join(assetsDir, `state_${stateId}.png`)
      await copyFile(sourcePath, statePath)
      
      // Generate thumbnail
      const thumbPath = join(assetsDir, `state_${stateId}_thumb.png`)
      await sharp(sourcePath)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(thumbPath)
      
      const state = {
        id: stateId,
        assetId,
        name,
        file: statePath,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      await addAssetState(state)
      return state
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSET_STATE_UPDATE,
    async (_e, state: any) => {
      await updateAssetState(state)
      return state
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSET_STATE_DELETE,
    async (_e, stateId: string) => {
      await deleteAssetState(stateId)
      return { ok: true as const }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ASSET_STATE_SET_DEFAULT,
    async (_e, assetId: string, stateId: string) => {
      const asset = await getVisualAsset(assetId)
      if (!asset) {
        throw new Error(`Visual asset not found: ${assetId}`)
      }
      asset.defaultStateId = stateId
      asset.updatedAt = new Date().toISOString()
      await updateVisualAsset(asset)
      return asset
    }
  )

  // P3: Events + bindings (preview-fire stays in the renderer; never persisted)
  ipcMain.handle(IPC_CHANNELS.EVENT_LIST, async (_e, gameId: string) => listEvents(gameId))
  ipcMain.handle(IPC_CHANNELS.EVENT_GET, async (_e, eventId: string) => getEvent(eventId))
  ipcMain.handle(
    IPC_CHANNELS.EVENT_CREATE,
    async (_e, input: { gameId: string; name: string; description?: string }) => createEvent(input)
  )
  ipcMain.handle(
    IPC_CHANNELS.EVENT_UPDATE,
    async (_e, eventId: string, patch: { name?: string; description?: string }) =>
      updateEvent(eventId, patch)
  )
  ipcMain.handle(IPC_CHANNELS.EVENT_DELETE, async (_e, eventId: string) => {
    await removeEvent(eventId)
    return { ok: true as const }
  })
  ipcMain.handle(IPC_CHANNELS.BINDING_LIST, async (_e, shotId: string) => listBindings(shotId))
  ipcMain.handle(IPC_CHANNELS.BINDING_GET, async (_e, bindingId: string) => getBinding(bindingId))
  ipcMain.handle(IPC_CHANNELS.BINDING_CREATE, async (_e, input: any) => createBinding(input))
  ipcMain.handle(
    IPC_CHANNELS.BINDING_UPDATE,
    async (_e, bindingId: string, patch: any) => updateBinding(bindingId, patch)
  )
  ipcMain.handle(IPC_CHANNELS.BINDING_DELETE, async (_e, bindingId: string) => {
    await removeBinding(bindingId)
    return { ok: true as const }
  })
}

export async function ensureAppDataDirs(): Promise<void> {
  await mkdir(getProjectsRoot(), { recursive: true })
}
