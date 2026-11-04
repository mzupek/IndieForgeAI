import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { IndieForgeAPI } from '@shared/types/provider'

const api: IndieForgeAPI = {
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_LIST),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_CREATE, input),
    open: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_OPEN, projectId),
    update: (projectId, patch) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_UPDATE, projectId, patch),
    delete: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DELETE, projectId),
    duplicate: (projectId, newName) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DUPLICATE, projectId, newName),
    seedSample: (kind?: 'ring-em-up' | 'neon-recall') =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_SEED_SAMPLE, kind)
  },
  ai: {
    planProject: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.AI_PLAN_PROJECT, projectId),
    generateVisualAsset: (projectId, assetId, overrides) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_VISUAL, projectId, assetId, overrides),
    generateBackground: (projectId, assetId, dimensions) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_BACKGROUND, projectId, assetId, dimensions),
    generateVariation: (projectId, assetId, editPrompt) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_VARIATION, projectId, assetId, editPrompt),
    designerChat: (projectId, message, context) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_DESIGNER_CHAT, projectId, message, context),
    designerClearChat: (projectId) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_DESIGNER_CLEAR_CHAT, projectId),
    designerApplyStyle: (projectId, updates) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_DESIGNER_APPLY_STYLE, projectId, updates),
    designerApplyPrompt: (projectId, assetId, prompt) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_DESIGNER_APPLY_PROMPT, projectId, assetId, prompt),
    assetDesignerChat: (projectId, assetId, message, hasGeneratedImage) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.AI_ASSET_DESIGNER_CHAT,
        projectId,
        assetId,
        message,
        hasGeneratedImage
      ),
    assetDesignerClear: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_ASSET_DESIGNER_CLEAR, projectId, assetId),
    proposeSceneBlueprint: (projectId, sceneId, description) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_PROPOSE_SCENE_BLUEPRINT, projectId, sceneId, description),
    generateSlotAsset: (projectId, sceneId, slotId) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_SLOT_ASSET, projectId, sceneId, slotId)
  },
  scenes: {
    create: (projectId, input) => ipcRenderer.invoke(IPC_CHANNELS.SCENES_CREATE, projectId, input),
    update: (projectId, sceneId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENES_UPDATE, projectId, sceneId, patch),
    addSlot: (projectId, sceneId, partial) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENES_ADD_SLOT, projectId, sceneId, partial),
    updateSlot: (projectId, sceneId, slotId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENES_UPDATE_SLOT, projectId, sceneId, slotId, patch),
    deleteSlot: (projectId, sceneId, slotId) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENES_DELETE_SLOT, projectId, sceneId, slotId),
    addReference: (projectId, sceneId, filePath, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENES_ADD_REFERENCE, projectId, sceneId, filePath, options),
    deleteReference: (projectId, sceneId, referenceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENES_DELETE_REFERENCE, projectId, sceneId, referenceId)
  },
  styleReferences: {
    add: (projectId, filePath, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.STYLE_REFERENCES_ADD, projectId, filePath, options),
    update: (projectId, referenceId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.STYLE_REFERENCES_UPDATE, projectId, referenceId, patch),
    reanalyze: (projectId, referenceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.STYLE_REFERENCES_REANALYZE, projectId, referenceId),
    delete: (projectId, referenceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.STYLE_REFERENCES_DELETE, projectId, referenceId),
    applyToGuide: (projectId, referenceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.STYLE_REFERENCES_APPLY_TO_GUIDE, projectId, referenceId)
  },
  assets: {
    create: (projectId, draft) => ipcRenderer.invoke(IPC_CHANNELS.ASSETS_CREATE, projectId, draft),
    update: (projectId, assetId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_UPDATE, projectId, assetId, patch),
    delete: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_DELETE, projectId, assetId),
    importVisual: (projectId, filePath, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_IMPORT_VISUAL, projectId, filePath, assetId),
    importAudio: (projectId, filePath, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_IMPORT_AUDIO, projectId, filePath, assetId),
    addInspiration: (projectId, assetId, filePath, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_INSPIRATION_ADD, projectId, assetId, filePath, options),
    deleteInspiration: (projectId, assetId, inspirationId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_INSPIRATION_DELETE, projectId, assetId, inspirationId),
    reanalyzeInspiration: (projectId, assetId, inspirationId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_INSPIRATION_REANALYZE, projectId, assetId, inspirationId)
  },
  image: {
    normalize: (imagePath, width, height, baselineY) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_NORMALIZE, imagePath, width, height, baselineY),
    exportAtlas: (projectId, assetId, exportDir, mode, exportSize) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_EXPORT_ATLAS, projectId, assetId, exportDir, mode, exportSize),
    exportSingleAsset: (projectId, assetId, exportDir, mode, exportSize) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_EXPORT_SINGLE_ASSET, projectId, assetId, exportDir, mode, exportSize),
    previewAnimationSheet: (projectId, assetId, exportSize) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_PREVIEW_ANIMATION_SHEET, projectId, assetId, exportSize)
  },
  files: {
    chooseImage: () => ipcRenderer.invoke(IPC_CHANNELS.FILES_CHOOSE_IMAGE),
    chooseAudio: () => ipcRenderer.invoke(IPC_CHANNELS.FILES_CHOOSE_AUDIO),
    chooseExportDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.FILES_CHOOSE_EXPORT_DIR),
    readPreviewDataUrl: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FILES_READ_PREVIEW_DATA_URL, filePath)
  },
  export: {
    projectManifest: (projectId, exportDir) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PROJECT_MANIFEST, projectId, exportDir),
    sceneManifest: (projectId, sceneId, exportDir) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SCENE_MANIFEST, projectId, sceneId, exportDir),
    scenePackage: (projectId, sceneId, exportDir) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SCENE_PACKAGE, projectId, sceneId, exportDir),
    copyAudio: (projectId, exportDir) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_COPY_AUDIO, projectId, exportDir),
    visualAssets: (projectId, exportDir, mode, exportSize) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_VISUAL_ASSETS, projectId, exportDir, mode, exportSize)
  },
  config: {
    getOpenAIKey: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_OPENAI_KEY),
    setOpenAIKey: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_OPENAI_KEY, apiKey)
  },
  pipeline: {
    createCharacter: (projectId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_CHARACTER_CREATE, projectId, input),
    updateCharacter: (projectId, characterId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_CHARACTER_UPDATE, projectId, characterId, patch),
    deleteCharacter: (projectId, characterId) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_CHARACTER_DELETE, projectId, characterId),
    setCharacterReference: (projectId, characterId, sourcePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_CHARACTER_SET_REFERENCE, projectId, characterId, sourcePath),
    importPose: (projectId, characterId, slot, sourcePath, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_POSE_IMPORT, projectId, characterId, slot, sourcePath, options),
    removePose: (projectId, poseId) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_POSE_REMOVE, projectId, poseId),
    updatePose: (projectId, poseId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_POSE_UPDATE, projectId, poseId, patch),
    getPoseMetadata: (projectId, characterId) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_POSE_GET_METADATA, projectId, characterId)
  }
}

contextBridge.exposeInMainWorld('indieForge', api)
