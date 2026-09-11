import type { AnimationFrame, IndieForgeProject, MotionDiagnosticRun } from '@shared/types/project'
import { getDesignSpriteSize, getExportSpriteSize } from '@shared/styleGuide'
import { getOpenAIClient } from './openaiClient'
import { generateOpenAIImage, editOpenAIImage, getOpenAIImageSize } from './openaiImageService'
import {
  buildAnimationFramePrompt,
  buildAnimationFrameEditPrompt,
  buildAnimationStripPrompt,
  buildMotionBeats,
  appendStyleReferencesToPrompt
} from './promptBuilders'
import { sliceHorizontalStrip } from '../image/sliceStrip'
import { describeAnimationReferenceImage } from './animationReferenceService'
import { resolveAssetInspirations } from './assetInspirationService'
import { buildInspirationGuidedSpritePrompt } from './promptBuilders'
import {
  getAsset,
  saveAssetInProject,
  resolveAppearanceRefPaths,
  appendMotionDiagnosticRun
} from '../storage/assetStore'
import { getGeneratedFramesDir } from '../storage/filePaths'
import { createDiagnosticRunId, phaseSnapshotFields } from '@shared/motion/diagnostic'
import {
  buildAnimationSessionSnapshot,
  compileMotionRenderRequest,
  attachPoseLockToRequest,
  renderRequestSourcePaths,
  type MotionRenderRequest,
  type AnimationSessionSnapshot
} from '@shared/motion/animationSession'
import { SWING_PHASES, applyRootOffset } from '@shared/motion/rhBatterSwing'
import { buildPaintLockGuidePng, splitGuideAndAppearanceRefs } from './paintLockGuide'
import { compileMotionRenderPrompt } from './motionRenderPrompt'
import { randomUUID } from 'crypto'
import { mkdir } from 'fs/promises'
import { join } from 'path'

export type AnimationFrameMode = 'create' | 'refine'

export async function generateAnimationFrame(
  projectId: string,
  assetId: string,
  clipId: string,
  frameIndex: number,
  promptOverride?: string,
  referenceIds?: string[],
  mode: AnimationFrameMode = 'create',
  inspirationIds?: string[],
  totalFrames?: number
): Promise<{ frame: AnimationFrame; asset: IndieForgeProject['assets'][0] }> {
  const { project, asset } = await getAsset(projectId, assetId)
  const designSize = getDesignSpriteSize(project.styleGuide)

  if (!asset.animationClips?.length) {
    asset.animationClips = [
      {
        id: clipId || randomUUID(),
        name: `${asset.name} Clip`,
        frameWidth: designSize.width,
        frameHeight: designSize.height,
        frameDurationMs: 100,
        loop: true,
        frames: []
      }
    ]
  }

  const clip = asset.animationClips.find((c) => c.id === clipId) ?? asset.animationClips[0]
  clip.frameWidth = designSize.width
  clip.frameHeight = designSize.height

  const preset = (asset.metadata?.animationPreset as string) ?? asset.name
  const existingFrame = clip.frames.find((f) => f.frameIndex === frameIndex)
  const frame0 = clip.frames.find((f) => f.frameIndex === 0)
  const isRefine = mode === 'refine' && Boolean(existingFrame)

  const beatCount = Math.max(totalFrames ?? frameIndex + 1, 2)
  const beats = buildMotionBeats(preset, beatCount)
  const defaultPose =
    frameIndex === 0
      ? `Reference start pose for "${preset}" animation: ${beats[0]}`
      : `Frame ${frameIndex + 1} of ${beatCount} in the "${preset}" animation. Pose: ${
          beats[Math.min(frameIndex, beats.length - 1)]
        }. This MUST be a clearly different pose from frame ${frameIndex} — advance the motion.`

  const poseDescription = promptOverride ?? defaultPose

  let useImageEdit = false
  let sourcePaths: string[] = []
  let multiImageHint: string | undefined

  if (isRefine && existingFrame) {
    useImageEdit = true
    sourcePaths = [existingFrame.imagePath]
    multiImageHint =
      'Edit this animation frame. Apply only the requested changes while keeping the same character and pixel style.'
  } else if (frameIndex > 0 && frame0) {
    useImageEdit = true
    sourcePaths = [frame0.imagePath]

    const prevFrame = clip.frames.find((f) => f.frameIndex === frameIndex - 1)
    if (frameIndex > 1 && prevFrame) {
      sourcePaths.push(prevFrame.imagePath)
      multiImageHint =
        'Image 1 is the character design reference (frame 0). Image 2 is the previous animation frame for motion continuity. Redraw the same character with the new pose.'
    } else {
      multiImageHint =
        'This is the character design reference (frame 0). Redraw the same character in the new pose described below.'
    }

    if (
      !clip.referenceDescription ||
      clip.referenceImagePath !== frame0.imagePath
    ) {
      try {
        clip.referenceDescription = await describeAnimationReferenceImage(frame0.imagePath)
        clip.referenceImagePath = frame0.imagePath
      } catch {
        clip.referenceDescription = clip.referenceDescription ?? undefined
      }
    }
  }

  const inspirations = resolveAssetInspirations(asset, inspirationIds)
  const useInspirationForFrame0 =
    frameIndex === 0 && !isRefine && inspirations.length > 0 && !frame0

  let basePrompt: string
  if (useInspirationForFrame0) {
    basePrompt = buildInspirationGuidedSpritePrompt(
      project,
      asset.name,
      asset.description,
      inspirations,
      promptOverride
    )
  } else if (useImageEdit && !isRefine) {
    basePrompt = buildAnimationFrameEditPrompt(
      project,
      asset.name,
      frameIndex,
      preset,
      poseDescription,
      clip.referenceDescription
    )
  } else if (isRefine) {
    basePrompt = buildAnimationFrameEditPrompt(
      project,
      asset.name,
      frameIndex,
      preset,
      poseDescription,
      clip.referenceDescription,
      'Apply only the edit instructions — minimal change to the current frame.'
    )
  } else {
    let frameExtra = ''
    if (frameIndex > 0) {
      frameExtra = frame0
        ? `
Note: Frame 0 exists — generate a matching character for frame ${frameIndex + 1}.`
        : `
Note: Frame 0 does not exist yet — generate frame 0 (reference pose) first for consistency.`
    } else {
      frameExtra = `
This is frame 0 — the reference pose for the entire "${preset}" animation.
All later frames must match this character design exactly.`
    }
    basePrompt = buildAnimationFramePrompt(project, asset.name, frameIndex, preset, frameExtra)
    if (frameIndex === 0) {
      basePrompt = `${basePrompt}\n\nPose: ${poseDescription}`
    }
  }

  const prompt = appendStyleReferencesToPrompt(basePrompt, project, referenceIds)

  const client = await getOpenAIClient()
  const framesDir = getGeneratedFramesDir(projectId, assetId)
  await mkdir(framesDir, { recursive: true })
  const designPath = join(framesDir, `frame_${frameIndex}_design.png`)

  const imageOptions = {
    size: '1024x1024' as const,
    transparentBackground: true
  }

  if (useInspirationForFrame0) {
    await editOpenAIImage(
      client,
      inspirations.map((i) => i.filePath),
      prompt,
      designPath,
      {
        ...imageOptions,
        multiImageHint:
          'Reference photo for animation frame 0. Convert to pixel art matching pose and camera angle — this becomes the reference pose for all animation frames.'
      }
    )
  } else if (useImageEdit && sourcePaths.length > 0) {
    await editOpenAIImage(client, sourcePaths, prompt, designPath, {
      ...imageOptions,
      multiImageHint
    })
  } else {
    await generateOpenAIImage(client, prompt, designPath, imageOptions)
  }

  if (frameIndex === 0) {
    try {
      clip.referenceDescription = await describeAnimationReferenceImage(designPath)
      clip.referenceImagePath = designPath
    } catch {
      // Non-fatal — image edit path still works without text description
    }
  }

  const frame: AnimationFrame = {
    id: existingFrame?.id ?? randomUUID(),
    frameIndex,
    imagePath: designPath,
    approved: existingFrame?.approved ?? false,
    durationMs: existingFrame?.durationMs ?? clip.frameDurationMs,
    offsetX: existingFrame?.offsetX ?? 0,
    offsetY: existingFrame?.offsetY ?? 0,
    baselineY: existingFrame?.baselineY ?? designSize.height - 4
  }

  const existingIdx = clip.frames.findIndex((f) => f.frameIndex === frameIndex)
  if (existingIdx >= 0) {
    clip.frames[existingIdx] = frame
  } else {
    clip.frames.push(frame)
    clip.frames.sort((a, b) => a.frameIndex - b.frameIndex)
  }

  asset.status = 'generated'
  asset.providerId = 'openai-visual'
  const saved = await saveAssetInProject(projectId, asset)
  return { frame, asset: saved }
}

export interface AnimationStripOptions {
  motionBeats?: string
  keepFrame0?: boolean
  referenceIds?: string[]
}

/**
 * Generate a full animation as a single horizontal sprite strip using frame 0
 * as the character reference, then slice it into individual frames.
 *
 * This produces far more consistent, fluid motion than generating each frame
 * with a separate API call, because the model plans the whole motion arc in
 * one image. Frame 0 (the approved reference sprite) is preserved by default.
 */
export async function generateAnimationStrip(
  projectId: string,
  assetId: string,
  clipId: string,
  frameCount: number,
  options: AnimationStripOptions = {}
): Promise<{ asset: IndieForgeProject['assets'][0] }> {
  const { motionBeats, keepFrame0 = true, referenceIds } = options
  const totalFrames = Math.max(2, Math.min(8, Math.round(frameCount)))

  const { project, asset } = await getAsset(projectId, assetId)
  const designSize = getDesignSpriteSize(project.styleGuide)

  if (!asset.animationClips?.length) {
    asset.animationClips = [
      {
        id: clipId || randomUUID(),
        name: `${asset.name} Clip`,
        frameWidth: designSize.width,
        frameHeight: designSize.height,
        frameDurationMs: 100,
        loop: true,
        frames: []
      }
    ]
  }

  const clip = asset.animationClips.find((c) => c.id === clipId) ?? asset.animationClips[0]
  clip.frameWidth = designSize.width
  clip.frameHeight = designSize.height

  const preset = (asset.metadata?.animationPreset as string) ?? asset.name
  const frame0 = clip.frames.find((f) => f.frameIndex === 0)

  // We must have a reference to anchor the character.
  const referenceImagePath = frame0?.imagePath ?? asset.filePath
  if (!referenceImagePath) {
    throw new Error('Generate or approve frame 0 first — the motion strip needs a reference pose.')
  }

  const beats = motionBeats
    ? motionBeats
        .split(/\n|;|→|,(?=\s*[A-Z])/)
        .map((b) => b.trim())
        .filter(Boolean)
    : buildMotionBeats(preset, totalFrames)
  const beatList = beats.length ? beats : buildMotionBeats(preset, totalFrames)

  const basePrompt = buildAnimationStripPrompt(
    project,
    asset.name,
    preset,
    totalFrames,
    beatList
  )
  const prompt = appendStyleReferencesToPrompt(basePrompt, project, referenceIds)

  const client = await getOpenAIClient()
  const framesDir = getGeneratedFramesDir(projectId, assetId)
  await mkdir(framesDir, { recursive: true })
  const stripPath = join(framesDir, `strip_${Date.now()}.png`)

  await editOpenAIImage(client, [referenceImagePath], prompt, stripPath, {
    size: '1536x1024',
    transparentBackground: true,
    multiImageHint:
      'This is the character design reference. Reproduce this exact character in frame 1, then animate it across the strip. Keep the identity identical in every frame.'
  })

  const cellPaths = await sliceHorizontalStrip(stripPath, totalFrames, framesDir, 'strip_cell')

  const keepOriginalFrame0 = keepFrame0 && Boolean(frame0)
  const startIndex = keepOriginalFrame0 ? 1 : 0

  const newFrames: AnimationFrame[] = []
  if (keepOriginalFrame0 && frame0) {
    newFrames.push(frame0)
  }

  for (let i = startIndex; i < totalFrames; i++) {
    const existing = clip.frames.find((f) => f.frameIndex === i)
    newFrames.push({
      id: existing?.id ?? randomUUID(),
      frameIndex: i,
      imagePath: cellPaths[i],
      approved: false,
      durationMs: existing?.durationMs ?? clip.frameDurationMs,
      offsetX: 0,
      offsetY: 0,
      baselineY: designSize.height - 4
    })
  }

  clip.frames = newFrames.sort((a, b) => a.frameIndex - b.frameIndex)

  // Refresh the reference description from the (kept) frame 0 for later single-frame refines.
  if (keepOriginalFrame0 && frame0) {
    try {
      clip.referenceDescription = await describeAnimationReferenceImage(frame0.imagePath)
      clip.referenceImagePath = frame0.imagePath
    } catch {
      // Non-fatal.
    }
  }

  asset.status = 'generated'
  asset.providerId = 'openai-visual'
  const saved = await saveAssetInProject(projectId, asset)
  return { asset: saved }
}

export interface RenderMotionPoseOptions {
  blueprintId: string
  phaseName: string
  /** Design canvas frame index to write (defaults to phase order) */
  frameIndex?: number
  referenceIds?: string[]
  /** Extra user notes */
  notes?: string
}

/** @deprecated Use RenderMotionPoseOptions — kept for IPC compat */
export type PaintMotionPoseOptions = RenderMotionPoseOptions

export interface RenderMotionPoseResult {
  frame: AnimationFrame
  asset: IndieForgeProject['assets'][0]
  diagnosticRun: MotionDiagnosticRun
  session: AnimationSessionSnapshot
  renderRequest: MotionRenderRequest
}

/**
 * Load Animation Session snapshot (scene + character + blueprint + frames).
 * Pure compile from disk state — no image generation.
 */
export async function getAnimationSession(
  projectId: string,
  assetId: string,
  blueprintId: string
): Promise<AnimationSessionSnapshot> {
  const { project, asset } = await getAsset(projectId, assetId)
  const blueprint = asset.motionBlueprints?.find((b) => b.id === blueprintId)
  if (!blueprint) throw new Error(`Motion blueprint not found: ${blueprintId}`)
  return buildAnimationSessionSnapshot({
    project,
    asset,
    blueprint,
    designSize: getDesignSpriteSize(project.styleGuide),
    exportSize: getExportSpriteSize(project.styleGuide)
  })
}

/**
 * Animation Director entry: compile session → MotionRenderRequest → OpenAI renderer.
 * Never mutates the Motion Blueprint — only writes replaceable animation frame pixels.
 */
export async function renderMotionPose(
  projectId: string,
  assetId: string,
  options: RenderMotionPoseOptions
): Promise<RenderMotionPoseResult> {
  const { blueprintId, phaseName, referenceIds, notes } = options
  const { project, asset } = await getAsset(projectId, assetId)
  const designSize = getDesignSpriteSize(project.styleGuide)

  const blueprint = asset.motionBlueprints?.find((b) => b.id === blueprintId)
  if (!blueprint) throw new Error(`Motion blueprint not found: ${blueprintId}`)
  const phase = blueprint.phases.find((p) => p.name === phaseName)
  if (!phase) throw new Error(`Motion phase not found: ${phaseName}`)

  const frameIndex =
    options.frameIndex ?? Math.max(0, SWING_PHASES.indexOf(phaseName as (typeof SWING_PHASES)[number]))

  const imageSize = getOpenAIImageSize(designSize.width, designSize.height)
  const imageQuality = 'high' as const

  try {
    if (!asset.animationClips?.length) {
      asset.animationClips = [
        {
          id: randomUUID(),
          name: `${asset.name} Clip`,
          frameWidth: designSize.width,
          frameHeight: designSize.height,
          frameDurationMs: 100,
          loop: false,
          frames: []
        }
      ]
    }

    const clip = asset.animationClips[0]
    clip.frameWidth = designSize.width
    clip.frameHeight = designSize.height

    const appearance = resolveAppearanceRefPaths(project, asset)
    const craftRefs = appearance.paths.map((path, i) => ({
      path,
      label: appearance.labels[i] ?? `ref_${i}`
    }))

    const session = buildAnimationSessionSnapshot({
      project,
      asset,
      blueprint,
      designSize,
      exportSize: getExportSpriteSize(project.styleGuide)
    })

    let request = compileMotionRenderRequest(session, phase, {
      phaseName: phaseName as (typeof SWING_PHASES)[number],
      frameIndex,
      craftRefs,
      userNotes: notes,
      referenceIds
    })

    const { appearanceRefs } = splitGuideAndAppearanceRefs(craftRefs)
    const world = applyRootOffset(phase.joints, phase.rootOffset)
    const paintLock = await buildPaintLockGuidePng({
      projectId,
      assetId,
      phaseName,
      poseGuidePath: phase.poseGuidePath!,
      craftRefs: appearanceRefs,
      joints: world,
      batInFrontOfBody: request.locks.batInFrontOfBody,
      designWidth: blueprint.canvasWidth || designSize.width,
      designHeight: blueprint.canvasHeight || designSize.height,
      canvasWidth: Math.max(blueprint.canvasWidth, designSize.width, 1024),
      canvasHeight: Math.max(blueprint.canvasHeight, designSize.height, 1024)
    })
    request = attachPoseLockToRequest(request, paintLock.path)

    const { prompt, multiImageHint } = compileMotionRenderPrompt(request)
    const basePrompt = appendStyleReferencesToPrompt(prompt, project, referenceIds)
    const sourcePaths = renderRequestSourcePaths(request)

    const client = await getOpenAIClient()
    const framesDir = getGeneratedFramesDir(projectId, assetId)
    await mkdir(framesDir, { recursive: true })
    const designPath = join(framesDir, `frame_${frameIndex}_design.png`)

    await editOpenAIImage(client, sourcePaths, basePrompt, designPath, {
      size: imageSize,
      transparentBackground: true,
      quality: imageQuality,
      multiImageHint
    })

    try {
      const sharpMod = (await import('sharp')).default
      const { rename, unlink } = await import('fs/promises')
      const meta = await sharpMod(designPath).metadata()
      if (
        meta.width &&
        meta.height &&
        (meta.width !== designSize.width || meta.height !== designSize.height)
      ) {
        const tmp = `${designPath}.resized.png`
        await sharpMod(designPath)
          .resize(designSize.width, designSize.height, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png()
          .toFile(tmp)
        await unlink(designPath)
        await rename(tmp, designPath)
      }
    } catch {
      // Non-fatal
    }

    const existingFrame = clip.frames.find((f) => f.frameIndex === frameIndex)
    const frame: AnimationFrame = {
      id: existingFrame?.id ?? randomUUID(),
      frameIndex,
      imagePath: designPath,
      approved: false,
      durationMs: existingFrame?.durationMs ?? clip.frameDurationMs,
      offsetX: existingFrame?.offsetX ?? 0,
      offsetY: existingFrame?.offsetY ?? 0,
      baselineY: existingFrame?.baselineY ?? designSize.height - 4
    }

    const existingIdx = clip.frames.findIndex((f) => f.frameIndex === frameIndex)
    if (existingIdx >= 0) clip.frames[existingIdx] = frame
    else {
      clip.frames.push(frame)
      clip.frames.sort((a, b) => a.frameIndex - b.frameIndex)
    }

    asset.status = 'generated'
    asset.providerId = 'openai-visual'
    await saveAssetInProject(projectId, asset)

    const guideOnly =
      craftRefs.length > 0 && craftRefs.every((r) => r.label.toLowerCase().includes('guide'))

    const diagnosticRun: MotionDiagnosticRun = {
      id: createDiagnosticRunId(),
      at: new Date().toISOString(),
      event: 'ai_paint',
      result: 'pending',
      blueprintId,
      frameIndex,
      ...phaseSnapshotFields(phase),
      appearanceRefs: appearance.paths.map((path, i) => ({
        label: appearance.labels[i] ?? `ref_${i}`,
        path
      })),
      poseGuidePath: request.paintLockPath,
      outputFramePath: designPath,
      prompt: basePrompt,
      multiImageHint,
      imageSize,
      imageQuality,
      notes: [
        notes,
        `session=${session.assetId}`,
        `mode=${request.mode}`,
        `images=${request.images.map((i) => i.role).join('+')}`,
        `paintLock=${request.paintLockPath}`,
        `authority=${session.character.authorityFramePath ?? 'none'}`,
        guideOnly ? 'craft=guide_only' : null,
        ...paintLock.notes
      ]
        .filter(Boolean)
        .join('; ')
    }

    const logged = await appendMotionDiagnosticRun(projectId, assetId, diagnosticRun)
    return {
      frame,
      asset: logged.asset,
      diagnosticRun: logged.run,
      session,
      renderRequest: request
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    try {
      await appendMotionDiagnosticRun(projectId, assetId, {
        id: createDiagnosticRunId(),
        at: new Date().toISOString(),
        event: 'ai_paint',
        result: 'error',
        blueprintId,
        frameIndex,
        ...phaseSnapshotFields(phase),
        errorMessage: message,
        imageSize,
        imageQuality,
        notes
      })
    } catch {
      // ignore logging failure
    }
    throw err
  }
}

/**
 * @deprecated Prefer renderMotionPose — same pipeline, Animation Session contract.
 * Kept so existing IPC `ai:paintMotionPose` keeps working.
 */
export async function paintMotionPose(
  projectId: string,
  assetId: string,
  options: PaintMotionPoseOptions
): Promise<{ frame: AnimationFrame; asset: IndieForgeProject['assets'][0]; diagnosticRun: MotionDiagnosticRun }> {
  const result = await renderMotionPose(projectId, assetId, options)
  return { frame: result.frame, asset: result.asset, diagnosticRun: result.diagnosticRun }
}
