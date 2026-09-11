/**
 * Animation Session = single source of truth for Motion → render.
 * OpenAI (or any provider) is only a renderer that fulfills MotionRenderRequest.
 */

import type {
  GameAsset,
  IndieForgeProject,
  MotionBlueprint,
  MotionConstraints,
  MotionJoint,
  MotionPhase,
  MotionPhaseName
} from '@shared/types/project'
import { SWING_PHASES } from './rhBatterSwing'

export const ANIMATION_SESSION_SCHEMA = 1 as const
export const MOTION_RENDER_REQUEST_SCHEMA = 1 as const

export type MotionRenderMode = 'paint_idle' | 'repose_from_authority'

export type MotionRenderImageRole =
  | 'character_authority'
  | 'pose_lock'
  | 'prev_frame'
  | 'craft_guide'
  | 'craft_appearance'

export interface MotionRenderImageRef {
  role: MotionRenderImageRole
  path: string
  label: string
}

/** Persistent session snapshot compiled from project + asset state. */
export interface AnimationSessionSnapshot {
  schemaVersion: typeof ANIMATION_SESSION_SCHEMA
  projectId: string
  projectName: string
  assetId: string
  assetName: string
  sceneId?: string
  camera: {
    view: 'umpire_pov'
    locked: true
    description: string
  }
  character: {
    name: string
    /** Frame 0 is the character bible when present */
    authorityFrameIndex: 0
    authorityFramePath?: string
    authorityApproved: boolean
    craftGuidePath?: string
    silhouettePath?: string
    outlinePath?: string
    paintPath?: string
  }
  style: {
    artStyle: string
    perspective: string
    palette?: string
  }
  blueprint: {
    id: string
    name: string
    rigPreset: MotionBlueprint['rigPreset']
    canvasWidth: number
    canvasHeight: number
  }
  /** Accepted / existing frames available for continuity (sorted by index) */
  frames: Array<{
    frameIndex: number
    imagePath: string
    approved: boolean
    phaseName?: MotionPhaseName
  }>
  designSize: { width: number; height: number }
  exportSize: { width: number; height: number }
}

/**
 * Compiled contract for one render. Prompt builders / providers consume only this —
 * they must not invent pose, camera, or character outside these locks.
 */
export interface MotionRenderRequest {
  schemaVersion: typeof MOTION_RENDER_REQUEST_SCHEMA
  session: AnimationSessionSnapshot
  mode: MotionRenderMode
  phaseName: MotionPhaseName
  frameIndex: number
  blueprintId: string
  phase: MotionPhase
  joints: MotionJoint[]
  constraints: MotionConstraints
  poseGuidePath: string
  /** Filled by main after compositing paint-lock PNG */
  paintLockPath?: string
  images: MotionRenderImageRef[]
  locks: {
    camera: true
    background: true
    characterAuthority: boolean
    craftGuide: boolean
    batInFrontOfBody: boolean
  }
  userNotes?: string
  referenceIds?: string[]
}

export function phaseIndex(name: MotionPhaseName): number {
  const i = SWING_PHASES.indexOf(name)
  return i >= 0 ? i : 0
}

export function phaseNameForFrameIndex(frameIndex: number): MotionPhaseName | undefined {
  return SWING_PHASES[frameIndex]
}

/** Build session snapshot from live project/asset (read-only compile). */
export function buildAnimationSessionSnapshot(options: {
  project: IndieForgeProject
  asset: GameAsset
  blueprint: MotionBlueprint
  designSize: { width: number; height: number }
  exportSize: { width: number; height: number }
}): AnimationSessionSnapshot {
  const { project, asset, blueprint, designSize, exportSize } = options
  const clip = asset.animationClips?.[0]
  const frames = [...(clip?.frames ?? [])]
    .filter((f) => Boolean(f.imagePath))
    .sort((a, b) => a.frameIndex - b.frameIndex)
    .map((f) => ({
      frameIndex: f.frameIndex,
      imagePath: f.imagePath,
      approved: Boolean(f.approved),
      phaseName: phaseNameForFrameIndex(f.frameIndex)
    }))

  const authority = frames.find((f) => f.frameIndex === 0)

  return {
    schemaVersion: ANIMATION_SESSION_SCHEMA,
    projectId: project.id,
    projectName: project.name,
    assetId: asset.id,
    assetName: asset.name,
    sceneId: blueprint.sceneId,
    camera: {
      view: 'umpire_pov',
      locked: true,
      description:
        'Behind home plate looking toward pitcher (umpire / catcher POV). Not side-profile TV camera.'
    },
    character: {
      name: asset.name,
      authorityFrameIndex: 0,
      authorityFramePath: authority?.imagePath,
      authorityApproved: Boolean(authority?.approved),
      craftGuidePath: asset.guideImagePath,
      silhouettePath: asset.silhouettePath,
      outlinePath: asset.outlinePath,
      paintPath: asset.filePath
    },
    style: {
      artStyle: project.styleGuide.artStyle,
      perspective: project.styleGuide.perspective,
      palette: project.styleGuide.colorPalette
    },
    blueprint: {
      id: blueprint.id,
      name: blueprint.name,
      rigPreset: blueprint.rigPreset,
      canvasWidth: blueprint.canvasWidth,
      canvasHeight: blueprint.canvasHeight
    },
    frames,
    designSize,
    exportSize
  }
}

export interface CompileMotionRenderOptions {
  phaseName: MotionPhaseName
  frameIndex?: number
  /** Local craft appearance paths already resolved (guide / silhouette / outline / paint) */
  craftRefs: Array<{ path: string; label: string }>
  userNotes?: string
  referenceIds?: string[]
}

/**
 * Compile a MotionRenderRequest from session + phase.
 * Does not call any image API. paintLockPath is attached later by the renderer host.
 */
export function compileMotionRenderRequest(
  session: AnimationSessionSnapshot,
  phase: MotionPhase,
  options: CompileMotionRenderOptions
): MotionRenderRequest {
  if (!phase.poseGuidePath) {
    throw new Error('Preview Pose first — save a deterministic pose guide before render.')
  }

  const frameIndex = options.frameIndex ?? phaseIndex(options.phaseName)
  if (options.phaseName !== 'idle' && !session.character.authorityFramePath) {
    throw new Error(
      'Paint Idle (frame 0) first — later phases repose the character authority sprite.'
    )
  }

  const guideRefs = options.craftRefs.filter((r) => r.label.toLowerCase().includes('guide'))
  const appearanceRefs = options.craftRefs.filter((r) => !r.label.toLowerCase().includes('guide'))
  if (guideRefs.length === 0 && appearanceRefs.length === 0 && !session.character.authorityFramePath) {
    throw new Error(
      'No Craft guide or appearance. Import a guide photo and/or save silhouette/paint in Craft Studio.'
    )
  }

  const mode: MotionRenderMode =
    frameIndex > 0 && session.character.authorityFramePath
      ? 'repose_from_authority'
      : 'paint_idle'

  const images: MotionRenderImageRef[] = []
  const push = (role: MotionRenderImageRole, path: string | undefined, label: string) => {
    if (!path || images.some((i) => i.path === path)) return
    images.push({ role, path, label })
  }

  if (mode === 'repose_from_authority') {
    // Authority + pose_lock only. Extra images (prev/guide) dilute pose and cause side-profile drift.
    push('character_authority', session.character.authorityFramePath, 'frame_0_authority')
  } else {
    // pose_lock first for idle paint — attached after PNG build
    push('craft_guide', guideRefs[0]?.path ?? session.character.craftGuidePath, 'craft_guide')
    for (const ref of appearanceRefs.slice(0, 2)) {
      push('craft_appearance', ref.path, ref.label)
    }
  }

  const batInFront = phase.constraints.batInFrontOfBody !== false

  return {
    schemaVersion: MOTION_RENDER_REQUEST_SCHEMA,
    session,
    mode,
    phaseName: options.phaseName,
    frameIndex,
    blueprintId: session.blueprint.id,
    phase,
    joints: phase.joints.map((j) => ({
      ...j,
      x: j.x + phase.rootOffset.x,
      y: j.y + phase.rootOffset.y
    })),
    constraints: { ...phase.constraints },
    poseGuidePath: phase.poseGuidePath,
    images,
    locks: {
      camera: true,
      background: true,
      characterAuthority: Boolean(session.character.authorityFramePath),
      craftGuide: Boolean(guideRefs[0]?.path || session.character.craftGuidePath),
      batInFrontOfBody: batInFront
    },
    userNotes: options.userNotes,
    referenceIds: options.referenceIds
  }
}

/** After paint-lock PNG exists, insert it into the image list in the correct slot. */
export function attachPoseLockToRequest(
  request: MotionRenderRequest,
  paintLockPath: string
): MotionRenderRequest {
  const poseLock: MotionRenderImageRef = {
    role: 'pose_lock',
    path: paintLockPath,
    label: 'pose_lock'
  }
  const images = [...request.images]
  if (request.mode === 'repose_from_authority') {
    // After character_authority
    const authIdx = images.findIndex((i) => i.role === 'character_authority')
    if (authIdx >= 0) images.splice(authIdx + 1, 0, poseLock)
    else images.unshift(poseLock)
  } else {
    images.unshift(poseLock)
  }
  return { ...request, paintLockPath, images }
}

/** Ordered file paths for the image edit API. */
export function renderRequestSourcePaths(request: MotionRenderRequest): string[] {
  return request.images.map((i) => i.path)
}
