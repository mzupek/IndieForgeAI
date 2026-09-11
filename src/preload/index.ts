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
    generateAnimationFrame: (
      projectId,
      assetId,
      clipId,
      frameIndex,
      prompt,
      referenceIds,
      mode,
      inspirationIds,
      totalFrames
    ) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.AI_GENERATE_ANIMATION_FRAME,
        projectId,
        assetId,
        clipId,
        frameIndex,
        prompt,
        referenceIds,
        mode,
        inspirationIds,
        totalFrames
      ),
    generateAnimationStrip: (projectId, assetId, clipId, frameCount, options) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.AI_GENERATE_ANIMATION_STRIP,
        projectId,
        assetId,
        clipId,
        frameCount,
        options
      ),
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
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_SLOT_ASSET, projectId, sceneId, slotId),
    paintMotionPose: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_PAINT_MOTION_POSE, projectId, assetId, options),
    renderMotionPose: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_RENDER_MOTION_POSE, projectId, assetId, options)
  },
  motion: {
    ensureBlueprint: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_ENSURE_BLUEPRINT, projectId, assetId, options),
    saveBlueprint: (projectId, assetId, blueprint, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_SAVE_BLUEPRINT, projectId, assetId, blueprint, options),
    savePoseGuide: (projectId, assetId, blueprintId, phaseName, pngDataUrl) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.MOTION_SAVE_POSE_GUIDE,
        projectId,
        assetId,
        blueprintId,
        phaseName,
        pngDataUrl
      ),
    getAnimationSession: (projectId, assetId, blueprintId) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_GET_ANIMATION_SESSION, projectId, assetId, blueprintId),
    ensurePuppet: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_ENSURE_PUPPET, projectId, assetId, options),
    samplePuppetTimeline: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_SAMPLE_PUPPET_TIMELINE, projectId, assetId, options),
    draftPuppetCutouts: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_DRAFT_PUPPET_CUTOUTS, projectId, assetId, options),
    approveAnimationBrief: (projectId, assetId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_APPROVE_ANIMATION_BRIEF, projectId, assetId, patch),
    generateMannequinKit: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_GENERATE_MANNEQUIN_KIT, projectId, assetId, options),
    approveMannequinKit: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_APPROVE_MANNEQUIN_KIT, projectId, assetId),
    redrawMannequinPart: (projectId, assetId, partId) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_REDRAW_MANNEQUIN_PART, projectId, assetId, partId),
    replacePuppetPart: (projectId, assetId, partId, sourcePath) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.MOTION_REPLACE_PUPPET_PART,
        projectId,
        assetId,
        partId,
        sourcePath
      ),
    markMotionProof: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_MARK_MOTION_PROOF, projectId, assetId),
    exportPoseSheet: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_EXPORT_POSE_SHEET, projectId, assetId, options),
    revealPoseSheet: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_REVEAL_POSE_SHEET, projectId, assetId),
    generateCharacterBible: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_GENERATE_CHARACTER_BIBLE, projectId, assetId, options),
    approveCharacterBible: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_APPROVE_CHARACTER_BIBLE, projectId, assetId),
    rejectCharacterBible: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_REJECT_CHARACTER_BIBLE, projectId, assetId),
    generatePuppetPartKit: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_GENERATE_PUPPET_PART_KIT, projectId, assetId),
    approvePuppetPartKit: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_APPROVE_PUPPET_PART_KIT, projectId, assetId),
    claimPartRegion: (projectId, assetId, partId, rect) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_CLAIM_PART_REGION, projectId, assetId, partId, rect),
    revealPuppetParts: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_REVEAL_PUPPET_PARTS, projectId, assetId),
    rasterizePuppetTimeline: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_RASTERIZE_PUPPET_TIMELINE, projectId, assetId, options),
    getDiagnostic: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_GET_DIAGNOSTIC, projectId, assetId, options),
    exportDiagnostic: (projectId, assetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_EXPORT_DIAGNOSTIC, projectId, assetId, options),
    appendDiagnostic: (projectId, assetId, run) =>
      ipcRenderer.invoke(IPC_CHANNELS.MOTION_APPEND_DIAGNOSTIC, projectId, assetId, run)
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
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_INSPIRATION_REANALYZE, projectId, assetId, inspirationId),
    createAnimationFrom: (projectId, sourceAssetId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_CREATE_ANIMATION_FROM, projectId, sourceAssetId, options),
    saveCraftLayer: (projectId, assetId, kind, pngDataUrl, options) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.ASSETS_SAVE_CRAFT_LAYER,
        projectId,
        assetId,
        kind,
        pngDataUrl,
        options
      ),
    revealCraftDir: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_REVEAL_CRAFT_DIR, projectId, assetId),
    setCraftGuide: (projectId, assetId, filePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_SET_CRAFT_GUIDE, projectId, assetId, filePath),
    clearCraftGuide: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_CLEAR_CRAFT_GUIDE, projectId, assetId),
    clearCraftDrawing: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_CLEAR_CRAFT_DRAWING, projectId, assetId),
    exportCraftForAseprite: (projectId, assetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_EXPORT_CRAFT_ASEPRITE, projectId, assetId),
    linkAppearanceFrom: (projectId, targetAssetId, sourceAssetId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSETS_LINK_APPEARANCE, projectId, targetAssetId, sourceAssetId)
  },
  image: {
    normalize: (imagePath, width, height, baselineY) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_NORMALIZE, imagePath, width, height, baselineY),
    packSpriteSheet: (framePaths, frameWidth, frameHeight) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_PACK_SPRITE_SHEET, framePaths, frameWidth, frameHeight),
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
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_VISUAL_ASSETS, projectId, exportDir, mode, exportSize),
    studioKit: (projectId, exportDir) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_STUDIO_KIT, projectId, exportDir)
  },
  config: {
    getOpenAIKey: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_OPENAI_KEY),
    setOpenAIKey: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_OPENAI_KEY, apiKey)
  }
}

contextBridge.exposeInMainWorld('indieForge', api)
