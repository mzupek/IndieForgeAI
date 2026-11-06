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
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_SEED_SAMPLE, kind),
    updateGame: (projectId, gameId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_UPDATE_GAME, projectId, gameId, patch)
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
    readPreviewDataUrl: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FILES_READ_PREVIEW_DATA_URL, filePath),
    getLocalUrl: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FILES_GET_LOCAL_URL, filePath)
  },
  config: {
    getOpenAIKey: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_OPENAI_KEY),
    setOpenAIKey: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_OPENAI_KEY, apiKey)
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
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_VISUAL_ASSETS, projectId, exportDir, mode, exportSize),
    validate: (gameId) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_VALIDATE, gameId),
    dryRun: (gameId, targetDir) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_DRY_RUN, gameId, targetDir),
    run: (gameId, targetDir) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_RUN, gameId, targetDir)
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
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_POSE_GET_METADATA, projectId, characterId),
    importClip: (sourcePath, moment, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_CLIP_IMPORT, sourcePath, moment, options),
    removeClip: (clipId) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_CLIP_REMOVE, clipId),
    updateClip: (clipId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_CLIP_UPDATE, clipId, patch),
    createPreset: (type, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_PRESET_CREATE, type, options),
    updatePreset: (presetId, updates) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_PRESET_UPDATE, presetId, updates),
    removePreset: (presetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_PRESET_REMOVE, presetId),
    createStoryboard: (projectId, gameId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.STORYBOARD_CREATE, projectId, gameId, input),
    updateStoryboard: (projectId, storyboardId, updates) =>
      ipcRenderer.invoke(IPC_CHANNELS.STORYBOARD_UPDATE, projectId, storyboardId, updates),
    deleteStoryboard: (projectId, storyboardId) =>
      ipcRenderer.invoke(IPC_CHANNELS.STORYBOARD_DELETE, projectId, storyboardId),
    createShot: (projectId, storyboardId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHOT_CREATE, projectId, storyboardId, input),
    updateShot: (projectId, shotId, updates) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHOT_UPDATE, projectId, shotId, updates),
    deleteShot: (projectId, storyboardId, shotId) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHOT_DELETE, projectId, storyboardId, shotId),
    addLayer: (projectId, shotId, layer) =>
      ipcRenderer.invoke(IPC_CHANNELS.LAYER_ADD, projectId, shotId, layer),
    updateLayer: (projectId, shotId, layerId, updates) =>
      ipcRenderer.invoke(IPC_CHANNELS.LAYER_UPDATE, projectId, shotId, layerId, updates),
    deleteLayer: (projectId, shotId, layerId) =>
      ipcRenderer.invoke(IPC_CHANNELS.LAYER_DELETE, projectId, shotId, layerId),
    addCameraKeyframe: (projectId, shotId, keyframe) =>
      ipcRenderer.invoke(IPC_CHANNELS.CAMERA_KEYFRAME_ADD, projectId, shotId, keyframe),
    removeCameraKeyframe: (projectId, shotId, t) =>
      ipcRenderer.invoke(IPC_CHANNELS.CAMERA_KEYFRAME_REMOVE, projectId, shotId, t),
    addEffectMarker: (projectId, shotId, effect) =>
      ipcRenderer.invoke(IPC_CHANNELS.EFFECT_MARKER_ADD, projectId, shotId, effect),
    removeEffectMarker: (projectId, shotId, t) =>
      ipcRenderer.invoke(IPC_CHANNELS.EFFECT_MARKER_REMOVE, projectId, shotId, t),
    createScene: (gameId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENE_CREATE, gameId, input),
    getScene: (sceneId) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENE_GET, sceneId),
    listScenes: (gameId) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENE_LIST, gameId),
    updateScene: (sceneId, updates) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENE_UPDATE, sceneId, updates),
    deleteScene: (sceneId, removeStoryboard) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENE_DELETE, sceneId, removeStoryboard),
    addCharacterToScene: (sceneId, characterId) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENE_ADD_CHARACTER, sceneId, characterId),
    removeCharacterFromScene: (sceneId, characterId) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENE_REMOVE_CHARACTER, sceneId, characterId),
    attachPresetToScene: (sceneId, presetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENE_ATTACH_PRESET, sceneId, presetId),
    detachPresetFromScene: (sceneId, presetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENE_DETACH_PRESET, sceneId, presetId),
    createSceneStoryboard: (sceneId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCENE_CREATE_STORYBOARD, sceneId, input)
  },
  visualAssets: {
    list: (gameId) =>
      ipcRenderer.invoke(IPC_CHANNELS.VISUAL_ASSET_LIST, gameId),
    get: (assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.VISUAL_ASSET_GET, assetId),
    create: (asset) =>
      ipcRenderer.invoke(IPC_CHANNELS.VISUAL_ASSET_CREATE, asset),
    update: (asset) =>
      ipcRenderer.invoke(IPC_CHANNELS.VISUAL_ASSET_UPDATE, asset),
    delete: (assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.VISUAL_ASSET_DELETE, assetId),
    importImage: (assetId, sourcePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.VISUAL_ASSET_IMPORT_IMAGE, assetId, sourcePath)
  },
  assetStates: {
    list: (assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSET_STATE_LIST, assetId),
    get: (stateId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSET_STATE_GET, stateId),
    create: (assetId, name, sourcePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSET_STATE_CREATE, assetId, name, sourcePath),
    update: (state) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSET_STATE_UPDATE, state),
    delete: (stateId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSET_STATE_DELETE, stateId),
    setDefault: (assetId, stateId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSET_STATE_SET_DEFAULT, assetId, stateId)
  },
  events: {
    list: (gameId) => ipcRenderer.invoke(IPC_CHANNELS.EVENT_LIST, gameId),
    get: (eventId) => ipcRenderer.invoke(IPC_CHANNELS.EVENT_GET, eventId),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.EVENT_CREATE, input),
    update: (eventId, patch) => ipcRenderer.invoke(IPC_CHANNELS.EVENT_UPDATE, eventId, patch),
    remove: (eventId) => ipcRenderer.invoke(IPC_CHANNELS.EVENT_DELETE, eventId)
  },
  bindings: {
    list: (shotId) => ipcRenderer.invoke(IPC_CHANNELS.BINDING_LIST, shotId),
    get: (bindingId) => ipcRenderer.invoke(IPC_CHANNELS.BINDING_GET, bindingId),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.BINDING_CREATE, input),
    update: (bindingId, patch) => ipcRenderer.invoke(IPC_CHANNELS.BINDING_UPDATE, bindingId, patch),
    remove: (bindingId) => ipcRenderer.invoke(IPC_CHANNELS.BINDING_DELETE, bindingId)
  },
  gameDefinitions: {
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_DEFINITION_LIST),
    get: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_DEFINITION_GET, id),
    getByGame: (gameId) =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_DEFINITION_GET_BY_GAME, gameId),
    create: (gameId) =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_DEFINITION_CREATE, gameId),
    update: (id, updates) =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_DEFINITION_UPDATE, id, updates),
    delete: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_DEFINITION_DELETE, id)
  }
}

contextBridge.exposeInMainWorld('indieForge', api)
