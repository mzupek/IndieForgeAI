import type {
  AIAssetPlan,
  AnimationFrame,
  AssetExport,
  AssetSlot,
  AtlasJson,
  CharacterPuppet,
  CreateAssetDraft,
  CreateProjectInput,
  DesignerChatResponse,
  ExportSpriteSize,
  FrameRect,
  GameAsset,
  GameScene,
  IndieForgeProject,
  MotionBlueprint,
  MotionDiagnosticBundle,
  MotionDiagnosticRun,
  MotionJoint,
  MotionPhaseName,
  PuppetPartId,
  ProjectStyleGuide,
  ProjectSummary,
  StyleReferenceRole,
  VisualGenerationOverrides
} from '@shared/types/project'

export interface VisualGenerationRequest {
  projectId: string
  assetId: string
  overrides?: VisualGenerationOverrides
}

export interface VisualEditRequest {
  projectId: string
  assetId: string
  editPrompt: string
}

export interface GeneratedVisualAsset {
  filePath: string
  previewPath?: string
  asset: GameAsset
}

export interface AudioImportMeta {
  projectId: string
  assetId?: string
  name?: string
  type?: GameAsset['type']
  sceneIds?: string[]
}

export interface GeneratedAudioAsset {
  filePath: string
  asset: GameAsset
}

export interface AudioGenerationRequest {
  projectId: string
  assetId: string
  prompt: string
}

export interface VisualAssetProvider {
  id: string
  name: string
  generateImage(request: VisualGenerationRequest, project: IndieForgeProject): Promise<GeneratedVisualAsset>
  editImage?(request: VisualEditRequest, project: IndieForgeProject): Promise<GeneratedVisualAsset>
}

export interface AudioAssetProvider {
  id: string
  name: string
  generateAudio?(request: AudioGenerationRequest, project: IndieForgeProject): Promise<GeneratedAudioAsset>
  importAudio?(filePath: string, meta: AudioImportMeta, project: IndieForgeProject): Promise<GeneratedAudioAsset>
}

export interface IndieForgeAPI {
  projects: {
    list: () => Promise<ProjectSummary[]>
    create: (input: CreateProjectInput) => Promise<IndieForgeProject>
    open: (projectId: string) => Promise<IndieForgeProject>
    update: (projectId: string, patch: Partial<IndieForgeProject>) => Promise<IndieForgeProject>
    delete: (projectId: string) => Promise<{ ok: true }>
    duplicate: (projectId: string, newName?: string) => Promise<IndieForgeProject>
    seedSample: (kind?: 'ring-em-up' | 'neon-recall') => Promise<IndieForgeProject>
    updateGame: (projectId: string, gameId: string, patch: any) => Promise<IndieForgeProject>
  }
  ai: {
    planProject: (projectId: string) => Promise<AIAssetPlan>
    generateVisualAsset: (
      projectId: string,
      assetId: string,
      overrides?: VisualGenerationOverrides
    ) => Promise<GeneratedVisualAsset>
    generateAnimationFrame: (
      projectId: string,
      assetId: string,
      clipId: string,
      frameIndex: number,
      prompt?: string,
      referenceIds?: string[],
      mode?: 'create' | 'refine',
      inspirationIds?: string[],
      totalFrames?: number
    ) => Promise<{ frame: AnimationFrame; asset: GameAsset }>
    generateAnimationStrip: (
      projectId: string,
      assetId: string,
      clipId: string,
      frameCount: number,
      options?: {
        motionBeats?: string
        keepFrame0?: boolean
        referenceIds?: string[]
      }
    ) => Promise<{ asset: GameAsset }>
    generateBackground: (
      projectId: string,
      assetId: string,
      dimensions?: { width: number; height: number }
    ) => Promise<GeneratedVisualAsset>
    generateVariation: (projectId: string, assetId: string, editPrompt: string) => Promise<GeneratedVisualAsset>
    designerChat: (
      projectId: string,
      message: string,
      context?: { assetId?: string }
    ) => Promise<DesignerChatResponse>
    designerClearChat: (projectId: string) => Promise<IndieForgeProject>
    designerApplyStyle: (projectId: string, updates: Partial<ProjectStyleGuide>) => Promise<IndieForgeProject>
    designerApplyPrompt: (projectId: string, assetId: string, prompt: string) => Promise<IndieForgeProject>
    assetDesignerChat: (
      projectId: string,
      assetId: string,
      message: string,
      hasGeneratedImage: boolean
    ) => Promise<DesignerChatResponse>
    assetDesignerClear: (projectId: string, assetId: string) => Promise<IndieForgeProject>
    proposeSceneBlueprint: (
      projectId: string,
      sceneId: string,
      description?: string
    ) => Promise<{ project: IndieForgeProject }>
    generateSlotAsset: (
      projectId: string,
      sceneId: string,
      slotId: string
    ) => Promise<{ project: IndieForgeProject; asset: GameAsset }>
    paintMotionPose: (
      projectId: string,
      assetId: string,
      options: {
        blueprintId: string
        phaseName: string
        frameIndex?: number
        referenceIds?: string[]
        notes?: string
      }
    ) => Promise<{ frame: AnimationFrame; asset: GameAsset; diagnosticRun?: MotionDiagnosticRun }>
    /** Animation Session → MotionRenderRequest → OpenAI renderer */
    renderMotionPose: (
      projectId: string,
      assetId: string,
      options: {
        blueprintId: string
        phaseName: string
        frameIndex?: number
        referenceIds?: string[]
        notes?: string
      }
    ) => Promise<{
      frame: AnimationFrame
      asset: GameAsset
      diagnosticRun?: MotionDiagnosticRun
      session?: unknown
      renderRequest?: unknown
    }>
  }
  motion: {
    ensureBlueprint: (
      projectId: string,
      assetId: string,
      options?: { blueprintId?: string; forceNew?: boolean }
    ) => Promise<{ asset: GameAsset; blueprint: MotionBlueprint }>
    saveBlueprint: (
      projectId: string,
      assetId: string,
      blueprint: MotionBlueprint,
      options?: { pushHistory?: boolean; historyLabel?: string }
    ) => Promise<{ asset: GameAsset; blueprint: MotionBlueprint }>
    getAnimationSession: (
      projectId: string,
      assetId: string,
      blueprintId: string
    ) => Promise<unknown>
    /** Cutout puppet MVP — draft parts + timeline bound to blueprint + Frame 0 */
    ensurePuppet: (
      projectId: string,
      assetId: string,
      options?: { blueprintId?: string; forceNew?: boolean }
    ) => Promise<{
      asset: GameAsset
      puppet: CharacterPuppet
      issues: Array<{ level: string; code: string; message: string }>
      summary: unknown
    }>
    /** Deterministic joint samples for all timeline frames (no image model) */
    samplePuppetTimeline: (
      projectId: string,
      assetId: string,
      options?: { blueprintId?: string }
    ) => Promise<{
      puppet: CharacterPuppet
      blueprint: MotionBlueprint
      frames: Array<{
        frameIndex: number
        phaseHint: MotionPhaseName
        t: number
        joints: MotionJoint[]
      }>
    }>
    draftPuppetCutouts: (
      projectId: string,
      assetId: string,
      options?: { blueprintId?: string }
    ) => Promise<{
      asset: GameAsset
      puppet: CharacterPuppet
      partPaths: string[]
      issues: Array<{ level: string; code: string; message: string }>
    }>
    approveAnimationBrief: (
      projectId: string,
      assetId: string,
      patch?: { styleNote?: string; cameraNote?: string }
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet }>
    generateMannequinKit: (
      projectId: string,
      assetId: string,
      options?: { blueprintId?: string }
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet; partPaths: string[] }>
    approveMannequinKit: (
      projectId: string,
      assetId: string
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet }>
    redrawMannequinPart: (
      projectId: string,
      assetId: string,
      partId: PuppetPartId
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet; partPath: string }>
    replacePuppetPart: (
      projectId: string,
      assetId: string,
      partId: PuppetPartId,
      sourcePath: string
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet; partPath: string }>
    markMotionProof: (
      projectId: string,
      assetId: string
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet }>
    exportPoseSheet: (
      projectId: string,
      assetId: string,
      options?: { blueprintId?: string; openFolder?: boolean }
    ) => Promise<{
      asset: GameAsset
      puppet: CharacterPuppet
      export: {
        exportedAt: string
        dir: string
        bindGuidePath?: string
        stripPath: string
        framePaths: string[]
        readmePath?: string
      }
    }>
    revealPoseSheet: (projectId: string, assetId: string) => Promise<{ path: string }>
    generateCharacterBible: (
      projectId: string,
      assetId: string,
      options?: { blueprintId?: string }
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet; biblePath: string }>
    approveCharacterBible: (
      projectId: string,
      assetId: string
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet }>
    rejectCharacterBible: (
      projectId: string,
      assetId: string
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet }>
    generatePuppetPartKit: (
      projectId: string,
      assetId: string
    ) => Promise<{
      asset: GameAsset
      puppet: CharacterPuppet
      sheetPath: string
      partPaths: string[]
      issues: Array<{ level: string; code: string; message: string }>
    }>
    approvePuppetPartKit: (
      projectId: string,
      assetId: string
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet }>
    claimPartRegion: (
      projectId: string,
      assetId: string,
      partId: PuppetPartId,
      rect: { x: number; y: number; width: number; height: number }
    ) => Promise<{ asset: GameAsset; puppet: CharacterPuppet; partPaths: string[] }>
    revealPuppetParts: (projectId: string, assetId: string) => Promise<{ path: string }>
    rasterizePuppetTimeline: (
      projectId: string,
      assetId: string,
      options?: { blueprintId?: string }
    ) => Promise<{
      asset: GameAsset
      puppet: CharacterPuppet
      framePaths: string[]
      designPaths: string[]
    }>
    savePoseGuide: (
      projectId: string,
      assetId: string,
      blueprintId: string,
      phaseName: MotionPhaseName,
      pngDataUrl: string
    ) => Promise<{ asset: GameAsset; poseGuidePath: string; blueprint: MotionBlueprint }>
    getDiagnostic: (
      projectId: string,
      assetId: string,
      options?: { blueprintId?: string }
    ) => Promise<MotionDiagnosticBundle>
    exportDiagnostic: (
      projectId: string,
      assetId: string,
      options?: { blueprintId?: string }
    ) => Promise<{ json: string; filePath: string; bundle: MotionDiagnosticBundle }>
    appendDiagnostic: (
      projectId: string,
      assetId: string,
      run: MotionDiagnosticRun
    ) => Promise<{ asset: GameAsset; run: MotionDiagnosticRun }>
  }
  scenes: {
    create: (
      projectId: string,
      input: { name: string; description?: string }
    ) => Promise<{ project: IndieForgeProject; scene: GameScene }>
    update: (
      projectId: string,
      sceneId: string,
      patch: {
        name?: string
        description?: string
        status?: GameScene['status']
        viewport?: GameScene['viewport']
        camera?: GameScene['camera']
        layers?: GameScene['layers']
        assetSlots?: AssetSlot[]
      }
    ) => Promise<{ project: IndieForgeProject; scene: GameScene }>
    addSlot: (
      projectId: string,
      sceneId: string,
      partial?: Partial<AssetSlot> & { name?: string }
    ) => Promise<{ project: IndieForgeProject; scene: GameScene }>
    updateSlot: (
      projectId: string,
      sceneId: string,
      slotId: string,
      patch: Partial<Omit<AssetSlot, 'assetId'>> & { assetId?: string | null }
    ) => Promise<{ project: IndieForgeProject; scene: GameScene }>
    deleteSlot: (
      projectId: string,
      sceneId: string,
      slotId: string
    ) => Promise<{ project: IndieForgeProject; scene: GameScene }>
    addReference: (
      projectId: string,
      sceneId: string,
      filePath: string,
      options?: { name?: string; role?: 'composition' | 'camera' | 'mood' | 'other'; notes?: string }
    ) => Promise<{ project: IndieForgeProject; scene: GameScene }>
    deleteReference: (
      projectId: string,
      sceneId: string,
      referenceId: string
    ) => Promise<{ project: IndieForgeProject; scene: GameScene }>
  }
  styleReferences: {
    add: (
      projectId: string,
      filePath: string,
      options?: { name?: string; role?: StyleReferenceRole }
    ) => Promise<IndieForgeProject>
    update: (
      projectId: string,
      referenceId: string,
      patch: { name?: string; role?: StyleReferenceRole }
    ) => Promise<IndieForgeProject>
    reanalyze: (projectId: string, referenceId: string) => Promise<IndieForgeProject>
    delete: (projectId: string, referenceId: string) => Promise<IndieForgeProject>
    applyToGuide: (projectId: string, referenceId: string) => Promise<IndieForgeProject>
  }
  assets: {
    create: (projectId: string, draft: CreateAssetDraft) => Promise<GameAsset>
    update: (projectId: string, assetId: string, patch: Partial<GameAsset>) => Promise<GameAsset>
    delete: (projectId: string, assetId: string) => Promise<{ ok: true }>
    importVisual: (projectId: string, filePath: string, assetId?: string) => Promise<GameAsset>
    importAudio: (projectId: string, filePath: string, assetId?: string) => Promise<GameAsset>
    addInspiration: (
      projectId: string,
      assetId: string,
      filePath: string,
      options?: { name?: string; notes?: string }
    ) => Promise<GameAsset>
    deleteInspiration: (projectId: string, assetId: string, inspirationId: string) => Promise<GameAsset>
    reanalyzeInspiration: (projectId: string, assetId: string, inspirationId: string) => Promise<GameAsset>
    createAnimationFrom: (
      projectId: string,
      sourceAssetId: string,
      options?: { name?: string; animationPreset?: string }
    ) => Promise<{ project: IndieForgeProject; asset: GameAsset }>
    saveCraftLayer: (
      projectId: string,
      assetId: string,
      kind: 'silhouette' | 'outline' | 'color' | 'frame',
      pngDataUrl: string,
      options?: { frameIndex?: number }
    ) => Promise<GameAsset>
    revealCraftDir: (projectId: string, assetId: string) => Promise<{ path: string }>
    setCraftGuide: (projectId: string, assetId: string, filePath: string) => Promise<GameAsset>
    clearCraftGuide: (projectId: string, assetId: string) => Promise<GameAsset>
    clearCraftDrawing: (projectId: string, assetId: string) => Promise<GameAsset>
    exportCraftForAseprite: (
      projectId: string,
      assetId: string
    ) => Promise<{ dir: string; outlinePath: string; guidePath?: string; readmePath: string }>
    linkAppearanceFrom: (
      projectId: string,
      targetAssetId: string,
      sourceAssetId: string
    ) => Promise<GameAsset>
  }
  image: {
    normalize: (
      imagePath: string,
      width: number,
      height: number,
      baselineY?: number
    ) => Promise<{ outputPath: string }>
    packSpriteSheet: (
      framePaths: string[],
      frameWidth: number,
      frameHeight: number
    ) => Promise<{ sheetPath: string; frames: FrameRect[] }>
    exportAtlas: (
      projectId: string,
      assetId: string,
      exportDir: string,
      mode?: 'design' | 'game' | 'both',
      exportSize?: ExportSpriteSize
    ) => Promise<AssetExport>
    exportSingleAsset: (
      projectId: string,
      assetId: string,
      exportDir: string,
      mode?: 'design' | 'game' | 'both',
      exportSize?: ExportSpriteSize
    ) => Promise<{ copiedPaths: string[] }>
    previewAnimationSheet: (
      projectId: string,
      assetId: string,
      exportSize?: ExportSpriteSize
    ) => Promise<{
      sheetPath: string
      atlasJsonPath: string
      frameWidth: number
      frameHeight: number
      frameCount: number
    }>
  }
  files: {
    chooseImage: () => Promise<{ filePath: string | null }>
    chooseAudio: () => Promise<{ filePath: string | null }>
    chooseExportDirectory: () => Promise<{ dirPath: string | null }>
    readPreviewDataUrl: (filePath: string) => Promise<{ dataUrl: string }>
    getLocalUrl: (filePath: string) => Promise<{ localUrl: string }>
  }
  export: {
    projectManifest: (projectId: string, exportDir: string) => Promise<{ manifestPath: string }>
    sceneManifest: (projectId: string, sceneId: string, exportDir: string) => Promise<{ manifestPath: string }>
    scenePackage: (
      projectId: string,
      sceneId: string,
      exportDir: string
    ) => Promise<{ packageDir: string; manifestPath: string; copiedPaths: string[] }>
    copyAudio: (projectId: string, exportDir: string) => Promise<{ copiedPaths: string[] }>
    visualAssets: (
      projectId: string,
      exportDir: string,
      mode?: 'design' | 'game' | 'both',
      exportSize?: ExportSpriteSize
    ) => Promise<{ copiedPaths: string[] }>
    studioKit: (
      projectId: string,
      exportDir: string
    ) => Promise<{ path: string; files: string[] }>
  }
  config: {
    getOpenAIKey: () => Promise<{ configured: boolean }>
    setOpenAIKey: (apiKey: string) => Promise<{ ok: true }>
  }
  export: {
    validate: (gameId: string) => Promise<any>
    dryRun: (gameId: string, targetDir?: string) => Promise<any>
    run: (gameId: string, targetDir?: string) => Promise<any>
  }
  pipeline: {
    createCharacter: (projectId: string, input: any) => Promise<any>
    updateCharacter: (projectId: string, characterId: string, patch: any) => Promise<any>
    deleteCharacter: (projectId: string, characterId: string) => Promise<{ ok: true }>
    setCharacterReference: (projectId: string, characterId: string, sourcePath: string) => Promise<any>
    importPose: (projectId: string, characterId: string, slot: string, sourcePath: string, options?: any) => Promise<any>
    removePose: (projectId: string, poseId: string) => Promise<{ ok: true }>
    updatePose: (projectId: string, poseId: string, patch: any) => Promise<any>
    getPoseMetadata: (projectId: string, characterId: string) => Promise<Record<string, any>>
    importClip: (sourcePath: string, moment: string, options?: any) => Promise<any>
    removeClip: (clipId: string) => Promise<{ ok: true }>
    updateClip: (clipId: string, patch: any) => Promise<any>
    createPreset: (type: string, options?: any) => Promise<any>
    updatePreset: (presetId: string, updates: any) => Promise<any>
    removePreset: (presetId: string) => Promise<{ ok: true }>
    createStoryboard: (projectId: string, gameId: string, input: any) => Promise<any>
    updateStoryboard: (projectId: string, storyboardId: string, updates: any) => Promise<any>
    deleteStoryboard: (projectId: string, storyboardId: string) => Promise<any>
    createShot: (projectId: string, storyboardId: string, input: any) => Promise<any>
    updateShot: (projectId: string, shotId: string, updates: any) => Promise<any>
    deleteShot: (projectId: string, storyboardId: string, shotId: string) => Promise<any>
    addLayer: (projectId: string, shotId: string, layer: any) => Promise<any>
    updateLayer: (projectId: string, shotId: string, layerId: string, updates: any) => Promise<any>
    deleteLayer: (projectId: string, shotId: string, layerId: string) => Promise<any>
    addLayerTimedKey: (
      projectId: string,
      shotId: string,
      layerId: string,
      input: {
        t: number
        action: { type: 'setPose'; poseId: string } | { type: 'setState'; stateId: string }
      }
    ) => Promise<any>
    listLayerTimedKeys: (
      shotId: string,
      layerId?: string
    ) => Promise<Array<{ key: any; layerId: string }>>
    getLayerTimedKey: (
      keyId: string
    ) => Promise<{ key: any; shotId: string; layerId: string } | null>
    updateLayerTimedKey: (
      projectId: string,
      keyId: string,
      updates: {
        t?: number
        action?: { type: 'setPose'; poseId: string } | { type: 'setState'; stateId: string }
      }
    ) => Promise<any>
    deleteLayerTimedKey: (projectId: string, keyId: string) => Promise<any>
    addCameraKeyframe: (projectId: string, shotId: string, keyframe: any) => Promise<any>
    removeCameraKeyframe: (projectId: string, shotId: string, time: number) => Promise<any>
    addEffectMarker: (projectId: string, shotId: string, effect: any) => Promise<any>
    removeEffectMarker: (projectId: string, shotId: string, time: number) => Promise<any>
    addShotClipBlock: (
      projectId: string,
      shotId: string,
      input: {
        clipId: string
        role?: 'layer' | 'background'
        layerId?: string | null
        t: number
        sourceInSec?: number
        sourceOutSec?: number
        extendShot?: boolean
      }
    ) => Promise<any>
    listShotClipBlocks: (shotId: string) => Promise<any[]>
    getShotClipBlock: (blockId: string) => Promise<any>
    updateShotClipBlock: (
      projectId: string,
      blockId: string,
      updates: { t?: number; sourceInSec?: number; sourceOutSec?: number; extendShot?: boolean }
    ) => Promise<any>
    deleteShotClipBlock: (projectId: string, blockId: string) => Promise<any>
    addShotAudioBlock: (
      projectId: string,
      shotId: string,
      input: {
        audioId: string
        role?: 'music' | 'sfx'
        t: number
        sourceInSec?: number
        sourceOutSec?: number
        durationSec?: number
        loop?: boolean
        volume?: number
        fadeInSec?: number
        fadeOutSec?: number
        extendShot?: boolean
        fitShot?: boolean
      }
    ) => Promise<any>
    listShotAudioBlocks: (shotId: string) => Promise<any[]>
    getShotAudioBlock: (blockId: string) => Promise<any>
    updateShotAudioBlock: (
      projectId: string,
      blockId: string,
      updates: {
        t?: number
        sourceInSec?: number
        sourceOutSec?: number
        durationSec?: number
        loop?: boolean
        volume?: number
        fadeInSec?: number
        fadeOutSec?: number
        extendShot?: boolean
        fitShot?: boolean
      }
    ) => Promise<any>
    deleteShotAudioBlock: (projectId: string, blockId: string) => Promise<any>
    createScene: (gameId: string, input: any) => Promise<any>
    getScene: (sceneId: string) => Promise<any | undefined>
    listScenes: (gameId: string) => Promise<any[]>
    updateScene: (sceneId: string, updates: any) => Promise<any>
    deleteScene: (sceneId: string, removeStoryboard?: boolean) => Promise<{ ok: true }>
    addCharacterToScene: (sceneId: string, characterId: string) => Promise<any>
    removeCharacterFromScene: (sceneId: string, characterId: string) => Promise<any>
    attachPresetToScene: (sceneId: string, presetId: string) => Promise<any>
    detachPresetFromScene: (sceneId: string, presetId: string) => Promise<any>
    createSceneStoryboard: (sceneId: string, input: any) => Promise<{ scene: any; storyboardId: string }>
  }
  audioAssets: {
    list: (gameId: string) => Promise<any[]>
    get: (audioId: string) => Promise<any | undefined>
    importFile: (
      sourcePath: string,
      options: { gameId: string; kind: string; name?: string; tags?: string[]; engineNotes?: string }
    ) => Promise<any>
    update: (
      audioId: string,
      gameId: string,
      patch: {
        name?: string
        kind?: string
        tags?: string[]
        engineNotes?: string | null
        file?: string
      }
    ) => Promise<any>
    remove: (audioId: string, gameId: string) => Promise<{ ok: true }>
  }
  visualAssets: {
    list: (gameId: string) => Promise<any[]>
    get: (assetId: string) => Promise<any | undefined>
    create: (asset: any) => Promise<any>
    update: (asset: any) => Promise<any>
    delete: (assetId: string) => Promise<{ ok: true; statesDeleted: number }>
    importImage: (assetId: string, sourcePath: string) => Promise<any>
  }
  assetStates: {
    list: (assetId: string) => Promise<any[]>
    listForGame: (gameId: string) => Promise<any[]>
    get: (stateId: string) => Promise<any | undefined>
    create: (assetId: string, name: string, sourcePath: string) => Promise<any>
    update: (state: any) => Promise<any>
    delete: (stateId: string) => Promise<{ ok: true }>
    setDefault: (assetId: string, stateId: string) => Promise<any>
  }
  events: {
    list: (gameId: string) => Promise<any[]>
    get: (eventId: string) => Promise<any | undefined>
    create: (input: { gameId: string; name: string; description?: string }) => Promise<any>
    update: (eventId: string, patch: { name?: string; description?: string }) => Promise<any>
    remove: (eventId: string) => Promise<{ ok: true }>
  }
  bindings: {
    list: (shotId: string) => Promise<any[]>
    get: (bindingId: string) => Promise<any | undefined>
    create: (input: any) => Promise<any>
    update: (bindingId: string, patch: any) => Promise<any>
    remove: (bindingId: string) => Promise<{ ok: true }>
  }
  gameDefinitions: {
    list: () => Promise<any[]>
    get: (id: string) => Promise<any | null>
    getByGame: (gameId: string) => Promise<any | null>
    create: (gameId: string) => Promise<any>
    update: (id: string, updates: any) => Promise<any>
    delete: (id: string) => Promise<{ ok: true }>
  }
}

declare global {
  interface Window {
    indieForge: IndieForgeAPI
  }
}

export type {
  AIAssetPlan,
  AnimationFrame,
  AssetExport,
  AtlasJson,
  CreateAssetDraft,
  CreateProjectInput,
  DesignerChatResponse,
  FrameRect,
  GameAsset,
  IndieForgeProject,
  ProjectSummary,
  VisualGenerationOverrides
}
