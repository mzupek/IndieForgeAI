import { randomUUID } from 'crypto'
import { copyFile, mkdir, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import type {
  CharacterPuppet,
  CreateAssetDraft,
  GameAsset,
  IndieForgeProject,
  MotionBlueprint,
  MotionDiagnosticBundle,
  MotionDiagnosticRun,
  MotionJoint,
  MotionPhaseName
} from '@shared/types/project'
import { getDesignSpriteSize } from '@shared/styleGuide'
import {
  createRhBatterPuppetDraft,
  samplePuppetJoints,
  summarizePuppetForAgent,
  validateCharacterPuppet
} from '@shared/motion/characterPuppet'
import {
  createRhBatterSwingBlueprint,
  repairFollowThroughWrap
} from '@shared/motion/rhBatterSwing'
import { buildMotionDiagnosticBundle, diagnosticBundleToJson } from '@shared/motion/diagnostic'
import { loadProject, saveProject } from './projectStore'
import { getCraftDir, getGeneratedFramesDir, getGeneratedDir } from './filePaths'

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
      scene.assetSlots = scene.assetSlots.map((slot) =>
        slot.assetId === assetId
          ? { ...slot, assetId: undefined, status: 'missing' as const }
          : slot
      )
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

/**
 * Create a new animation asset seeded with an existing sprite/visual asset's image as frame 0.
 * The frame-0 image becomes the reference pose for all later frames generated in Animation Studio.
 */
export async function createAnimationFromAsset(
  projectId: string,
  sourceAssetId: string,
  options?: { name?: string; animationPreset?: string }
): Promise<{ project: IndieForgeProject; asset: GameAsset }> {
  const project = await loadProject(projectId)
  const source = project.assets.find((a) => a.id === sourceAssetId)
  if (!source) throw new Error(`Source asset not found: ${sourceAssetId}`)
  if (!source.filePath) {
    throw new Error('Generate or import the sprite image before starting an animation from it')
  }

  const design = getDesignSpriteSize(project.styleGuide)
  const newId = randomUUID()
  const clipId = randomUUID()

  const framesDir = getGeneratedFramesDir(projectId, newId)
  await mkdir(framesDir, { recursive: true })
  const frame0Path = join(framesDir, 'frame_0_design.png')
  await copyFile(source.filePath, frame0Path)

  const name = options?.name?.trim() || `${source.name} Animation`
  const asset: GameAsset = {
    id: newId,
    projectId,
    sceneIds: [...source.sceneIds],
    name,
    type: 'animation',
    description: source.description
      ? `Animation based on ${source.name}. ${source.description}`
      : `Animation based on ${source.name}.`,
    prompt: source.prompt ?? '',
    status: 'generated',
    providerId: source.providerId,
    filePath: frame0Path,
    metadata: {
      ...(options?.animationPreset ? { animationPreset: options.animationPreset } : {}),
      sourceAssetId
    },
    animationClips: [
      {
        id: clipId,
        name: `${name} Clip`,
        frameWidth: design.width,
        frameHeight: design.height,
        frameDurationMs: 100,
        loop: true,
        frames: [
          {
            id: randomUUID(),
            frameIndex: 0,
            imagePath: frame0Path,
            approved: true,
            durationMs: 100,
            offsetX: 0,
            offsetY: 0,
            baselineY: design.height - 4
          }
        ],
        referenceImagePath: frame0Path
      }
    ]
  }

  project.assets.push(asset)
  for (const sceneId of asset.sceneIds) {
    const scene = project.scenes.find((s) => s.id === sceneId)
    if (scene && !scene.assetIds.includes(asset.id)) {
      scene.assetIds.push(asset.id)
    }
  }

  await saveProject(project)
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

export type CraftLayerKind = 'silhouette' | 'outline' | 'color' | 'frame'

async function isMostlyTransparentPng(buffer: Buffer): Promise<boolean> {
  try {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const total = info.width * info.height
    if (total === 0) return true
    let opaque = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 8) opaque++
      if (opaque > total * 0.001) return false
    }
    return true
  } catch {
    return false
  }
}

/** Persist a PNG data URL from Craft Studio onto disk and update the asset. */
export async function saveCraftLayer(
  projectId: string,
  assetId: string,
  kind: CraftLayerKind,
  pngDataUrl: string,
  options?: { frameIndex?: number }
): Promise<GameAsset> {
  const { asset } = await getAsset(projectId, assetId)
  const match = /^data:image\/png;base64,(.+)$/i.exec(pngDataUrl)
  if (!match) throw new Error('Expected a PNG data URL')

  const dir = getCraftDir(projectId, assetId)
  await mkdir(dir, { recursive: true })
  const buffer = Buffer.from(match[1], 'base64')

  if (kind === 'silhouette') {
    const dest = join(dir, 'silhouette.png')
    await writeFile(dest, buffer)
    return updateAsset(projectId, assetId, {
      silhouettePath: dest,
      craftStage: 'silhouette',
      status: asset.status === 'planned' ? 'generated' : asset.status
    })
  }

  if (kind === 'outline') {
    const dest = join(dir, 'outline.png')
    // Empty / nearly empty canvas → remove saved outline instead of keeping a blank PNG
    if (await isMostlyTransparentPng(buffer)) {
      if (asset.outlinePath) {
        try {
          await unlink(asset.outlinePath)
        } catch {
          /* ignore */
        }
      }
      const { outlinePath: _removed, ...rest } = asset
      return saveAssetInProject(projectId, rest)
    }
    await writeFile(dest, buffer)
    return updateAsset(projectId, assetId, {
      outlinePath: dest,
      craftStage: 'silhouette',
      status: asset.status === 'planned' ? 'generated' : asset.status
    })
  }

  if (kind === 'color') {
    const dest = join(dir, 'color.png')
    await writeFile(dest, buffer)
    return updateAsset(projectId, assetId, {
      filePath: dest,
      craftStage: 'colored',
      status: 'generated'
    })
  }

  const frameIndex = options?.frameIndex ?? asset.animationClips?.[0]?.frames.length ?? 0
  const framesDir = getGeneratedFramesDir(projectId, assetId)
  await mkdir(framesDir, { recursive: true })
  const dest = join(framesDir, `craft_frame_${frameIndex}.png`)
  await writeFile(dest, buffer)

  const design = getDesignSpriteSize((await loadProject(projectId)).styleGuide)
  let clips = asset.animationClips ? [...asset.animationClips] : []
  if (clips.length === 0) {
    clips = [
      {
        id: randomUUID(),
        name: `${asset.name} Clip`,
        frameWidth: design.width,
        frameHeight: design.height,
        frameDurationMs: 100,
        loop: true,
        frames: []
      }
    ]
  }
  const clip = { ...clips[0], frames: [...clips[0].frames] }
  const existing = clip.frames.findIndex((f) => f.frameIndex === frameIndex)
  const frame = {
    id: randomUUID(),
    frameIndex,
    imagePath: dest,
    approved: true,
    durationMs: clip.frameDurationMs,
    offsetX: 0,
    offsetY: 0,
    baselineY: design.height - 4
  }
  if (existing >= 0) clip.frames[existing] = frame
  else clip.frames.push(frame)
  clip.frames.sort((a, b) => a.frameIndex - b.frameIndex)
  clips[0] = clip

  return updateAsset(projectId, assetId, {
    type: asset.type === 'sprite' ? 'animation' : asset.type,
    filePath: dest,
    animationClips: clips,
    craftStage: 'animated',
    medium: 'sprite_sheet',
    status: 'generated'
  })
}

/**
 * Copy a photo/screenshot into the craft folder as the pose/camera guide.
 * Valid as the sole Craft layer — AI Paint uses it for umpire-POV / depth lock.
 */
export async function setCraftGuide(
  projectId: string,
  assetId: string,
  sourcePath: string
): Promise<GameAsset> {
  const { asset } = await getAsset(projectId, assetId)
  const dir = getCraftDir(projectId, assetId)
  await mkdir(dir, { recursive: true })
  const ext = sourcePath.includes('.') ? sourcePath.slice(sourcePath.lastIndexOf('.')) : '.png'
  const dest = join(dir, `guide${ext}`)
  await copyFile(sourcePath, dest)
  const hasDrawing = Boolean(asset.filePath || asset.silhouettePath || asset.outlinePath)
  return updateAsset(projectId, assetId, {
    guideImagePath: dest,
    craftStage: hasDrawing ? asset.craftStage : 'guide'
  })
}

export async function clearCraftGuide(projectId: string, assetId: string): Promise<GameAsset> {
  const { asset } = await getAsset(projectId, assetId)
  if (asset.guideImagePath) {
    try {
      await unlink(asset.guideImagePath)
    } catch {
      // file may already be gone
    }
  }
  const { guideImagePath: _removed, ...rest } = asset
  return saveAssetInProject(projectId, rest)
}

/** Wipe saved outline + filled silhouette (keeps guide photo and color/export file). */
export async function clearCraftDrawingLayers(
  projectId: string,
  assetId: string
): Promise<GameAsset> {
  const { asset } = await getAsset(projectId, assetId)
  for (const path of [asset.outlinePath, asset.silhouettePath]) {
    if (!path) continue
    try {
      await unlink(path)
    } catch {
      // ignore missing files
    }
  }
  const { outlinePath: _o, silhouettePath: _s, ...rest } = asset
  return saveAssetInProject(projectId, {
    ...rest,
    craftStage: rest.filePath ? rest.craftStage : 'planned'
  })
}

function safeFileStem(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_|_$/g, '') || 'asset'
}

/**
 * Package outline (+ optional guide copy) for Aseprite.
 * Outline is the drawable handoff; guide is reference-only — keep IndieForge open to view it while shading.
 */
export async function exportCraftForAseprite(
  projectId: string,
  assetId: string
): Promise<{ dir: string; outlinePath: string; guidePath?: string; readmePath: string }> {
  const { asset } = await getAsset(projectId, assetId)
  if (!asset.outlinePath && !asset.silhouettePath && !asset.filePath) {
    throw new Error('Save an outline (or silhouette) first, then export for Aseprite.')
  }

  const source =
    asset.outlinePath ?? asset.silhouettePath ?? asset.filePath
  if (!source) throw new Error('Nothing to export')

  const craftDir = getCraftDir(projectId, assetId)
  const dir = join(craftDir, 'aseprite-export')
  await mkdir(dir, { recursive: true })
  const stem = safeFileStem(asset.name)

  const outlinePath = join(dir, `${stem}_outline.png`)
  await copyFile(source, outlinePath)

  let guidePath: string | undefined
  if (asset.guideImagePath) {
    const ext = asset.guideImagePath.includes('.')
      ? asset.guideImagePath.slice(asset.guideImagePath.lastIndexOf('.'))
      : '.png'
    guidePath = join(dir, `${stem}_guide_REFERENCE_ONLY${ext}`)
    await copyFile(asset.guideImagePath, guidePath)
  }

  const readmePath = join(dir, 'README_ASEPRITE.txt')
  await writeFile(
    readmePath,
    [
      `Aseprite handoff — ${asset.name}`,
      '',
      '1. Open *_outline.png in Aseprite (File → Open).',
      '2. Optionally File → Open as → Open as Linked File the *_guide_REFERENCE_ONLY image',
      '   on a locked layer below, OR keep Indie Forge Craft Studio open beside Aseprite',
      '   with the guide photo visible for pose/shading reference.',
      '3. Fill flats + shading in Aseprite on layers above the outline.',
      '4. Export a PNG back and Import Visual in Indie Forge (or replace color.png in craft/).',
      '',
      'The guide photo is NEVER the final sprite — outline + your fills are.',
      ''
    ].join('\n'),
    'utf-8'
  )

  return { dir, outlinePath, guidePath, readmePath }
}

const MAX_MOTION_HISTORY = 12

function pushMotionHistory(blueprint: MotionBlueprint, label?: string): MotionBlueprint {
  const revision = {
    id: randomUUID(),
    savedAt: new Date().toISOString(),
    label,
    phases: blueprint.phases.map((p) => ({
      ...p,
      rootOffset: { ...p.rootOffset },
      joints: p.joints.map((j) => ({ ...j })),
      constraints: { ...p.constraints, cannotOverlap: p.constraints.cannotOverlap?.slice() }
    }))
  }
  const history = [...(blueprint.history ?? []), revision].slice(-MAX_MOTION_HISTORY)
  return { ...blueprint, history, updatedAt: new Date().toISOString() }
}

/** Ensure a RH batter swing blueprint exists on the asset (creates starter poses if missing). */
export async function ensureMotionBlueprint(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string; forceNew?: boolean }
): Promise<{ asset: GameAsset; blueprint: MotionBlueprint }> {
  const { project, asset } = await getAsset(projectId, assetId)
  const design = getDesignSpriteSize(project.styleGuide)
  const existing = options?.blueprintId
    ? asset.motionBlueprints?.find((b) => b.id === options.blueprintId)
    : asset.motionBlueprints?.[0]

  if (existing && !options?.forceNew) {
    const { blueprint: repaired, repaired: didRepair } = repairFollowThroughWrap(existing)
    if (didRepair) {
      const list = [...(asset.motionBlueprints ?? [])]
      const idx = list.findIndex((b) => b.id === repaired.id)
      if (idx >= 0) list[idx] = repaired
      const updated = await updateAsset(projectId, assetId, { motionBlueprints: list })
      return { asset: updated, blueprint: repaired }
    }
    return { asset, blueprint: existing }
  }

  const blueprint = createRhBatterSwingBlueprint({
    canvasWidth: design.width,
    canvasHeight: design.height,
    sceneId: asset.sceneIds[0] ?? 'scene-at-bat'
  })
  const motionBlueprints = options?.forceNew
    ? [...(asset.motionBlueprints ?? []), blueprint]
    : [blueprint, ...(asset.motionBlueprints ?? []).filter((b) => b.id !== blueprint.id)]

  const updated = await updateAsset(projectId, assetId, { motionBlueprints })
  return { asset: updated, blueprint }
}

export async function saveMotionBlueprint(
  projectId: string,
  assetId: string,
  blueprint: MotionBlueprint,
  options?: { pushHistory?: boolean; historyLabel?: string }
): Promise<{ asset: GameAsset; blueprint: MotionBlueprint }> {
  const { asset } = await getAsset(projectId, assetId)
  let next = {
    ...blueprint,
    updatedAt: new Date().toISOString()
  }
  if (options?.pushHistory !== false) {
    next = pushMotionHistory(next, options?.historyLabel)
  }

  const list = [...(asset.motionBlueprints ?? [])]
  const idx = list.findIndex((b) => b.id === next.id)
  if (idx >= 0) list[idx] = next
  else list.push(next)

  let updated = await updateAsset(projectId, assetId, { motionBlueprints: list })
  const { createDiagnosticRunId } = await import('@shared/motion/diagnostic')
  const logged = await appendMotionDiagnosticRun(projectId, assetId, {
    id: createDiagnosticRunId(),
    at: new Date().toISOString(),
    event: 'save_blueprint',
    result: 'ok',
    blueprintId: next.id,
    notes: options?.historyLabel
  })
  updated = logged.asset
  return { asset: updated, blueprint: next }
}

/**
 * Create or refresh a cutout puppet draft linked to a Motion Blueprint.
 * Authority prefers character bible → craft guide → Frame 0 / craft layers.
 * Parts stay placeholders until the AI part kit fills imagePath.
 */
export async function ensureCharacterPuppet(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string; forceNew?: boolean }
): Promise<{
  asset: GameAsset
  puppet: CharacterPuppet
  issues: ReturnType<typeof validateCharacterPuppet>
  summary: ReturnType<typeof summarizePuppetForAgent>
}> {
  const { asset } = await getAsset(projectId, assetId)
  const blueprint =
    (options?.blueprintId
      ? asset.motionBlueprints?.find((b) => b.id === options.blueprintId)
      : asset.motionBlueprints?.[0]) ?? null
  if (!blueprint) {
    throw new Error('Create a Motion Blueprint first (Motion Studio / ensureBlueprint).')
  }

  if (asset.characterPuppet && !options?.forceNew) {
    const puppet = asset.characterPuppet
    return {
      asset,
      puppet,
      issues: validateCharacterPuppet(puppet, blueprint),
      summary: summarizePuppetForAgent(puppet)
    }
  }

  const authority =
    asset.characterPuppet?.characterBible?.imagePath ??
    asset.guideImagePath ??
    asset.animationClips?.[0]?.frames?.find((f) => f.frameIndex === 0)?.imagePath ??
    asset.filePath ??
    asset.outlinePath ??
    asset.silhouettePath
  if (!authority) {
    throw new Error(
      'Add a Craft guide photo first (scene lock), then open Animation Studio (Director/Manager).'
    )
  }

  const puppet = createRhBatterPuppetDraft({
    assetId,
    assetName: asset.name,
    blueprint,
    authorityImagePath: authority
  })
  const updated = await updateAsset(projectId, assetId, { characterPuppet: puppet })
  return {
    asset: updated,
    puppet,
    issues: validateCharacterPuppet(puppet, blueprint),
    summary: summarizePuppetForAgent(puppet)
  }
}

/** Deterministic joint samples for the puppet timeline (thesis test — no image model). */
export async function sampleCharacterPuppetTimeline(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string }
): Promise<{
  puppet: CharacterPuppet
  blueprint: MotionBlueprint
  frames: Array<{
    frameIndex: number
    phaseHint: MotionPhaseName
    t: number
    joints: MotionJoint[]
  }>
}> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet) throw new Error('No characterPuppet on asset — call ensureCharacterPuppet first.')
  const blueprint =
    (options?.blueprintId
      ? asset.motionBlueprints?.find((b) => b.id === options.blueprintId)
      : asset.motionBlueprints?.find((b) => b.id === puppet.blueprintId)) ??
    asset.motionBlueprints?.[0]
  if (!blueprint) throw new Error('Motion Blueprint not found for puppet.')

  const frames = Array.from({ length: puppet.timeline.frameCount }, (_, frameIndex) => {
    const sample = samplePuppetJoints(puppet, blueprint, frameIndex)
    return {
      frameIndex,
      phaseHint: sample.phaseHint,
      t: sample.t,
      joints: sample.joints
    }
  })
  return { puppet, blueprint, frames }
}

export async function savePoseGuidePng(
  projectId: string,
  assetId: string,
  blueprintId: string,
  phaseName: MotionPhaseName,
  pngDataUrl: string
): Promise<{ asset: GameAsset; poseGuidePath: string; blueprint: MotionBlueprint }> {
  const { asset } = await getAsset(projectId, assetId)
  const blueprint = asset.motionBlueprints?.find((b) => b.id === blueprintId)
  if (!blueprint) throw new Error(`Motion blueprint not found: ${blueprintId}`)

  const base64 = pngDataUrl.replace(/^data:image\/\w+;base64,/, '')
  if (!base64 || base64 === pngDataUrl) throw new Error('Invalid pose guide PNG data URL')
  const buffer = Buffer.from(base64, 'base64')

  const dir = join(getGeneratedDir(projectId, assetId), 'pose-guides')
  await mkdir(dir, { recursive: true })
  const poseGuidePath = join(dir, `pose-guide-${phaseName}.png`)
  await writeFile(poseGuidePath, buffer)

  const phases = blueprint.phases.map((p) =>
    p.name === phaseName ? { ...p, poseGuidePath } : p
  )
  const nextBlueprint: MotionBlueprint = {
    ...blueprint,
    phases,
    updatedAt: new Date().toISOString()
  }
  const list = (asset.motionBlueprints ?? []).map((b) => (b.id === blueprintId ? nextBlueprint : b))
  let updated = await updateAsset(projectId, assetId, { motionBlueprints: list })

  const phase = nextBlueprint.phases.find((p) => p.name === phaseName)
  const { createDiagnosticRunId, phaseSnapshotFields } = await import('@shared/motion/diagnostic')
  const logged = await appendMotionDiagnosticRun(projectId, assetId, {
    id: createDiagnosticRunId(),
    at: new Date().toISOString(),
    event: 'preview_pose',
    result: 'ok',
    blueprintId,
    ...phaseSnapshotFields(phase),
    poseGuidePath
  })
  updated = logged.asset

  return { asset: updated, poseGuidePath, blueprint: nextBlueprint }
}

/**
 * Link Craft layers (guide / silhouette / outline / color) from a source asset.
 * Guide-only sources are valid — used as camera/depth lock for AI Paint.
 */
export async function linkAppearanceFromAsset(
  projectId: string,
  targetAssetId: string,
  sourceAssetId: string
): Promise<GameAsset> {
  const { asset: target } = await getAsset(projectId, targetAssetId)
  const { asset: source } = await getAsset(projectId, sourceAssetId)

  const hasAny =
    source.filePath || source.silhouettePath || source.outlinePath || source.guideImagePath
  if (!hasAny) {
    throw new Error(
      `Source asset "${source.name}" has no Craft layers yet. Import a guide photo or save outline/silhouette/paint in Craft Studio first.`
    )
  }

  const updated = await updateAsset(projectId, targetAssetId, {
    filePath: source.filePath ?? target.filePath,
    silhouettePath: source.silhouettePath ?? target.silhouettePath,
    outlinePath: source.outlinePath ?? target.outlinePath,
    guideImagePath: source.guideImagePath ?? target.guideImagePath,
    metadata: {
      ...(target.metadata ?? {}),
      appearanceSourceAssetId: sourceAssetId,
      appearanceSourceName: source.name
    }
  })

  const { createDiagnosticRunId } = await import('@shared/motion/diagnostic')
  const logged = await appendMotionDiagnosticRun(projectId, targetAssetId, {
    id: createDiagnosticRunId(),
    at: new Date().toISOString(),
    event: 'link_appearance',
    result: 'ok',
    appearanceRefs: [
      source.guideImagePath ? { label: 'guide', path: source.guideImagePath } : null,
      source.filePath ? { label: 'color', path: source.filePath } : null,
      source.silhouettePath ? { label: 'silhouette', path: source.silhouettePath } : null,
      source.outlinePath ? { label: 'outline', path: source.outlinePath } : null
    ].filter(Boolean) as Array<{ label: string; path: string }>,
    notes: `Linked from ${source.name} (${sourceAssetId})`
  })
  return logged.asset
}

/** Resolve Craft guide + appearance paths for AI Paint (own layers + linked source + batter idle fallback). */
export function resolveAppearanceRefPaths(
  project: IndieForgeProject,
  asset: GameAsset
): { paths: string[]; labels: string[]; sourceName: string | null } {
  const paths: string[] = []
  const labels: string[] = []
  const push = (path: string | undefined, label: string) => {
    if (path && !paths.includes(path)) {
      paths.push(path)
      labels.push(label)
    }
  }

  const sourceId = asset.metadata?.appearanceSourceAssetId as string | undefined
  const source = sourceId ? project.assets.find((a) => a.id === sourceId) : undefined

  // Guide first — camera/depth lock (photo or screenshot).
  push(asset.guideImagePath, 'guide')
  push(asset.filePath, 'color/paint')
  push(asset.silhouettePath, 'silhouette')
  push(asset.outlinePath, 'outline')
  if (source) {
    push(source.guideImagePath, `${source.name} guide`)
    push(source.filePath, `${source.name} color`)
    push(source.silhouettePath, `${source.name} silhouette`)
    push(source.outlinePath, `${source.name} outline`)
  }

  if (paths.length === 0) {
    const idle = project.assets.find(
      (a) => a.id === 'asset-batter-idle' || a.name.toLowerCase().includes('batter idle')
    )
    if (idle) {
      push(idle.guideImagePath, 'Batter idle guide')
      push(idle.filePath, 'Batter idle color')
      push(idle.silhouettePath, 'Batter idle silhouette')
      push(idle.outlinePath, 'Batter idle outline')
    }
  }

  const sourceName =
    (asset.metadata?.appearanceSourceName as string | undefined) ||
    source?.name ||
    (paths.length ? 'this asset' : null)

  return { paths, labels, sourceName }
}

const MAX_DIAGNOSTIC_RUNS = 80

export async function appendMotionDiagnosticRun(
  projectId: string,
  assetId: string,
  run: MotionDiagnosticRun
): Promise<{ asset: GameAsset; run: MotionDiagnosticRun }> {
  const { asset } = await getAsset(projectId, assetId)
  const runs = [...(asset.motionDiagnosticRuns ?? []), run].slice(-MAX_DIAGNOSTIC_RUNS)
  const updated = await updateAsset(projectId, assetId, { motionDiagnosticRuns: runs })
  return { asset: updated, run }
}

export async function getMotionDiagnosticBundle(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string }
): Promise<MotionDiagnosticBundle> {
  const project = await loadProject(projectId)
  return buildMotionDiagnosticBundle(project, assetId, options)
}

export async function exportMotionDiagnosticJson(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string }
): Promise<{ json: string; filePath: string; bundle: MotionDiagnosticBundle }> {
  const bundle = await getMotionDiagnosticBundle(projectId, assetId, options)
  const json = diagnosticBundleToJson(bundle, true)
  const dir = join(getGeneratedDir(projectId, assetId), 'diagnostics')
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = join(dir, `motion-diagnostic-${stamp}.json`)
  await writeFile(filePath, json, 'utf-8')
  return { json, filePath, bundle }
}
