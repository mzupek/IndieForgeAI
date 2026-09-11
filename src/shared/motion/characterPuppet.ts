/**
 * Character Puppet — interpolate the rig, not pixels.
 *
 * Thesis: Brief → Scene → Mannequin → Motion proof → Export pose sheet → Aseprite skin.
 * Indie Forge owns mechanics + pose guides. Aseprite owns costume pixels.
 */

import type {
  AnimationBrief,
  CharacterPuppet,
  CharacterPuppetStatus,
  MotionBlueprint,
  MotionJoint,
  MotionJointId,
  MotionPhaseName,
  MotionVec2,
  PuppetKeyframe,
  PuppetPart,
  PuppetPartId,
  PuppetPartStatus
} from '@shared/types/project'
import { SWING_PHASES, applyRootOffset, getJoint } from './rhBatterSwing'

export const CHARACTER_PUPPET_SCHEMA = 1 as const

/** Default RH batter cutout pack for umpire-POV MVP. */
export const RH_BATTER_PUPPET_PART_IDS: PuppetPartId[] = [
  'farLeg',
  'nearLeg',
  'torso',
  'farArm',
  'nearArm',
  'hands',
  'bat',
  'head'
]

export type PuppetPartDef = {
  id: PuppetPartId
  label: string
  bindJoint: MotionJointId
  aimJoint?: MotionJointId
  zIndex: number
  zIndexWhenBatInFront?: number
  /** Bone segment for procedural mannequin (from → to). */
  mannequinBones?: Array<[MotionJointId, MotionJointId]>
  mannequinRadius?: number
}

export const PART_DEFS: PuppetPartDef[] = [
  {
    id: 'farLeg',
    label: 'Far leg',
    bindJoint: 'rearFoot',
    aimJoint: 'hips',
    zIndex: 10,
    mannequinBones: [['hips', 'rearFoot']],
    mannequinRadius: 5
  },
  {
    id: 'nearLeg',
    label: 'Near leg',
    bindJoint: 'frontFoot',
    aimJoint: 'hips',
    zIndex: 20,
    mannequinBones: [['hips', 'frontFoot']],
    mannequinRadius: 6
  },
  {
    id: 'torso',
    label: 'Torso',
    bindJoint: 'torso',
    aimJoint: 'shoulders',
    zIndex: 30,
    mannequinBones: [
      ['hips', 'torso'],
      ['torso', 'shoulders']
    ],
    mannequinRadius: 9
  },
  {
    id: 'farArm',
    label: 'Far arm',
    bindJoint: 'shoulders',
    aimJoint: 'hands',
    zIndex: 25,
    mannequinBones: [['shoulders', 'hands']],
    mannequinRadius: 4
  },
  {
    id: 'nearArm',
    label: 'Near arm',
    bindJoint: 'shoulders',
    aimJoint: 'hands',
    zIndex: 40,
    zIndexWhenBatInFront: 55,
    mannequinBones: [['shoulders', 'hands']],
    mannequinRadius: 4
  },
  {
    id: 'hands',
    label: 'Hands',
    bindJoint: 'hands',
    zIndex: 50,
    zIndexWhenBatInFront: 60,
    mannequinRadius: 5
  },
  {
    id: 'bat',
    label: 'Bat',
    bindJoint: 'batHandle',
    aimJoint: 'batTip',
    zIndex: 45,
    zIndexWhenBatInFront: 70,
    // Bat only — do not include hands→handle (that read as a second limb / wrong thumb).
    mannequinBones: [['batHandle', 'batTip']],
    mannequinRadius: 3
  },
  {
    id: 'head',
    label: 'Head / helmet',
    bindJoint: 'head',
    aimJoint: 'shoulders',
    zIndex: 35,
    mannequinBones: [['shoulders', 'head']],
    mannequinRadius: 7
  }
]

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `puppet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function phaseJoints(blueprint: MotionBlueprint, phaseName: MotionPhaseName): MotionJoint[] {
  const phase = blueprint.phases.find((p) => p.name === phaseName)
  if (!phase) throw new Error(`Blueprint missing phase: ${phaseName}`)
  return applyRootOffset(phase.joints, phase.rootOffset)
}

function defaultPivotForPart(partId: PuppetPartId, joints: MotionJoint[]): MotionVec2 {
  const bind = PART_DEFS.find((p) => p.id === partId)?.bindJoint
  const j = bind ? getJoint(joints, bind) : undefined
  // Pivot defaults to bind joint in canvas space until a real cutout sets part-local pivot.
  return { x: j?.x ?? 0, y: j?.y ?? 0 }
}

/** Default ~11-frame swing timeline with keys on the five blueprint phases. */
export function buildDefaultPuppetTimeline(options?: {
  frameCount?: number
  frameDurationMs?: number
}): CharacterPuppet['timeline'] {
  const frameCount = options?.frameCount ?? 11
  const frameDurationMs = options?.frameDurationMs ?? 100
  // Spread phase keys across the sheet (Blender-style sparse keys).
  const keyFrames: Record<MotionPhaseName, number> = {
    idle: 0,
    load: 2,
    stride: 4,
    contact: 7,
    follow_through: 10
  }
  const keys: PuppetKeyframe[] = SWING_PHASES.map((phaseName) => ({
    id: newId(),
    phaseName,
    frameIndex: Math.min(keyFrames[phaseName], frameCount - 1),
    source: 'blueprint_phase' as const
  }))
  return { frameCount, frameDurationMs, keys }
}

export interface CreateRhBatterPuppetDraftOptions {
  assetId: string
  assetName: string
  blueprint: MotionBlueprint
  /** Frame 0 / authority sprite — costume source for cutouts */
  authorityImagePath: string
  frameCount?: number
  frameDurationMs?: number
}

/**
 * Draft puppet bound to a Motion Blueprint + Frame 0 authority.
 * Parts start as placeholders (no imagePath) until AI/human cutout pass.
 */
export function createRhBatterPuppetDraft(
  options: CreateRhBatterPuppetDraftOptions
): CharacterPuppet {
  const { assetId, assetName, blueprint, authorityImagePath } = options
  const bindJoints = phaseJoints(blueprint, 'idle')
  const parts: PuppetPart[] = PART_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    bindJoint: def.bindJoint,
    aimJoint: def.aimJoint,
    pivot: defaultPivotForPart(def.id, bindJoints),
    zIndex: def.zIndex,
    zIndexWhenBatInFront: def.zIndexWhenBatInFront,
    status: 'placeholder' as PuppetPartStatus
  }))

  const now = new Date().toISOString()
  const brief: AnimationBrief = {
    styleNote: 'Retro pixel art / SNES-inspired silhouette',
    cameraNote: 'Umpire / catcher POV — locked camera toward pitcher',
    canvasWidth: blueprint.canvasWidth,
    canvasHeight: blueprint.canvasHeight
  }
  return {
    schemaVersion: CHARACTER_PUPPET_SCHEMA,
    id: newId(),
    name: `${assetName} Puppet`,
    assetId,
    blueprintId: blueprint.id,
    rigPreset: 'rh_batter_swing',
    status: 'needs_brief',
    animationBrief: brief,
    bindPose: {
      phaseName: 'idle',
      joints: bindJoints,
      authorityImagePath,
      canvasWidth: blueprint.canvasWidth,
      canvasHeight: blueprint.canvasHeight
    },
    parts,
    timeline: buildDefaultPuppetTimeline({
      frameCount: options.frameCount,
      frameDurationMs: options.frameDurationMs
    }),
    thesis: {
      mode: 'pose_sheet_aseprite',
      aiRole: 'none',
      interpolate: 'lerp_joints',
      notes:
        'Director owns Motion Blueprint. Export = Craft base sprite + skeleton motion guide. Skin/animate in Aseprite.'
    },
    updatedAt: now
  }
}

export type ProductionGate =
  | 'needs_brief'
  | 'needs_scene'
  | 'needs_motion_proof'
  | 'needs_export'
  | 'ready'
  /** @deprecated optional; not on critical path */
  | 'needs_mannequin'

/**
 * Derived Director gate (ignores stale stored status when possible).
 * Pass hasGuide from the Craft asset — scene lock is external to the puppet JSON.
 */
function briefApprovedOrLegacy(puppet: CharacterPuppet): boolean {
  if (puppet.animationBrief?.approvedAt) return true
  // Pre-Director puppets have no brief object — don't block them on Brief.
  if (!puppet.animationBrief) return true
  return false
}

export function resolveProductionGate(
  puppet: CharacterPuppet,
  options?: { hasGuide?: boolean }
): ProductionGate {
  if (!briefApprovedOrLegacy(puppet)) return 'needs_brief'
  if (options?.hasGuide === false) return 'needs_scene'
  // Critical path: Craft character + Motion Blueprint scrub → export base sprite + skeleton guide
  if (!puppet.motionProofAt) return 'needs_motion_proof'
  if (puppet.poseSheetExport?.exportedAt) return 'ready'
  return 'needs_export'
}

/** @deprecated use resolveProductionGate */
export function resolvePuppetWizardStatus(
  puppet: CharacterPuppet,
  options?: { hasGuide?: boolean }
): ProductionGate {
  return resolveProductionGate(puppet, options)
}

/** Sync stored status from derived gate (call after Director approve). */
export function gateToStatus(gate: ProductionGate): CharacterPuppetStatus {
  return gate
}

function jointDist(a: MotionVec2, b: MotionVec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * XY-lerp of batTip chords through the handle on a real swing → aim angle flips ~360°.
 * Rebuild tip from lerped handle + shortest-path angle/length instead.
 */
function applyBatArcTip(
  a: MotionJoint[],
  b: MotionJoint[],
  lerped: MotionJoint[],
  t: number
): MotionJoint[] {
  const hA = getJoint(a, 'batHandle')
  const hB = getJoint(b, 'batHandle')
  const tA = getJoint(a, 'batTip')
  const tB = getJoint(b, 'batTip')
  const hL = getJoint(lerped, 'batHandle')
  if (!hA || !hB || !tA || !tB || !hL) return lerped

  const angA = Math.atan2(tA.y - hA.y, tA.x - hA.x)
  const angB = Math.atan2(tB.y - hB.y, tB.x - hB.x)
  let dAng = angB - angA
  while (dAng > Math.PI) dAng -= Math.PI * 2
  while (dAng < -Math.PI) dAng += Math.PI * 2
  const ang = angA + dAng * t
  const len = jointDist(hA, tA) + (jointDist(hB, tB) - jointDist(hA, tA)) * t
  const tip = {
    id: 'batTip' as const,
    x: hL.x + Math.cos(ang) * len,
    y: hL.y + Math.sin(ang) * len
  }
  return lerped.map((j) => (j.id === 'batTip' ? tip : j))
}

/** Linear interpolate joint maps (same id set). Missing ids fall back to `a`. */
export function lerpJoints(a: MotionJoint[], b: MotionJoint[], t: number): MotionJoint[] {
  const clamped = Math.min(1, Math.max(0, t))
  const bMap = new Map(b.map((j) => [j.id, j]))
  const lerped = a.map((ja) => {
    const jb = bMap.get(ja.id)
    if (!jb) return { ...ja }
    const rotA = ja.rotationDeg
    const rotB = jb.rotationDeg
    let rotationDeg: number | undefined
    if (rotA != null && rotB != null) {
      let d = rotB - rotA
      while (d > 180) d -= 360
      while (d <= -180) d += 360
      rotationDeg = rotA + d * clamped
    } else {
      rotationDeg = rotB ?? rotA
    }
    return {
      id: ja.id,
      x: ja.x + (jb.x - ja.x) * clamped,
      y: ja.y + (jb.y - ja.y) * clamped,
      ...(rotationDeg != null ? { rotationDeg } : {})
    }
  })
  return applyBatArcTip(a, b, lerped, clamped)
}

function jointsForKey(blueprint: MotionBlueprint, key: PuppetKeyframe): MotionJoint[] {
  if (key.jointOverrides?.length) {
    return key.jointOverrides.map((j) => ({ ...j }))
  }
  return phaseJoints(blueprint, key.phaseName)
}

/**
 * Sample joints at a timeline frame by lerping surrounding blueprint-backed keys.
 * This is the MVP “Blender graph” — deterministic, no image model.
 */
export function samplePuppetJoints(
  puppet: CharacterPuppet,
  blueprint: MotionBlueprint,
  frameIndex: number
): {
  frameIndex: number
  joints: MotionJoint[]
  fromKey: PuppetKeyframe
  toKey: PuppetKeyframe
  t: number
  phaseHint: MotionPhaseName
} {
  if (puppet.blueprintId !== blueprint.id) {
    throw new Error(
      `Puppet blueprint mismatch: puppet=${puppet.blueprintId} blueprint=${blueprint.id}`
    )
  }
  const keys = [...puppet.timeline.keys].sort((a, b) => a.frameIndex - b.frameIndex)
  if (keys.length === 0) throw new Error('Puppet timeline has no keys')

  const fi = Math.min(Math.max(0, Math.floor(frameIndex)), puppet.timeline.frameCount - 1)
  let prev = keys[0]
  let next = keys[keys.length - 1]
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].frameIndex <= fi) prev = keys[i]
    if (keys[i].frameIndex >= fi) {
      next = keys[i]
      break
    }
  }
  if (prev.frameIndex === next.frameIndex) {
    const joints = jointsForKey(blueprint, prev)
    return {
      frameIndex: fi,
      joints,
      fromKey: prev,
      toKey: next,
      t: 0,
      phaseHint: prev.phaseName
    }
  }
  const span = next.frameIndex - prev.frameIndex
  const t = (fi - prev.frameIndex) / span
  const joints = lerpJoints(jointsForKey(blueprint, prev), jointsForKey(blueprint, next), t)
  return {
    frameIndex: fi,
    joints,
    fromKey: prev,
    toKey: next,
    t,
    phaseHint: t < 0.5 ? prev.phaseName : next.phaseName
  }
}

/** Resolve draw order for a frame given bat depth constraint. */
export function resolvePartDrawOrder(
  puppet: CharacterPuppet,
  options?: { batInFrontOfBody?: boolean; frameIndex?: number }
): PuppetPart[] {
  const batInFront = options?.batInFrontOfBody !== false
  const fi = options?.frameIndex
  const keyOverrides =
    fi != null
      ? puppet.timeline.keys.find((k) => k.frameIndex === fi)?.partOverrides
      : undefined
  const overrideMap = new Map((keyOverrides ?? []).map((o) => [o.partId, o]))

  return [...puppet.parts]
    .filter((p) => overrideMap.get(p.id)?.visible !== false)
    .map((p) => {
      const o = overrideMap.get(p.id)
      const z =
        o?.zIndex ??
        (batInFront && p.zIndexWhenBatInFront != null ? p.zIndexWhenBatInFront : p.zIndex)
      return { ...p, zIndex: z }
    })
    .sort((a, b) => a.zIndex - b.zIndex)
}

export interface PuppetValidationIssue {
  level: 'error' | 'warning' | 'info'
  code: string
  message: string
}

export function validateCharacterPuppet(
  puppet: CharacterPuppet,
  blueprint?: MotionBlueprint
): PuppetValidationIssue[] {
  const issues: PuppetValidationIssue[] = []
  if (puppet.schemaVersion !== CHARACTER_PUPPET_SCHEMA) {
    issues.push({
      level: 'error',
      code: 'schema',
      message: `Unsupported puppet schemaVersion ${puppet.schemaVersion}`
    })
  }
  if (!puppet.bindPose.authorityImagePath) {
    issues.push({
      level: 'error',
      code: 'authority',
      message: 'bindPose.authorityImagePath required (Frame 0 / character bible)'
    })
  }
  const missingParts = RH_BATTER_PUPPET_PART_IDS.filter(
    (id) => !puppet.parts.some((p) => p.id === id)
  )
  if (missingParts.length) {
    issues.push({
      level: 'warning',
      code: 'parts_missing',
      message: `Missing part stubs: ${missingParts.join(', ')}`
    })
  }
  const uncut = puppet.parts.filter((p) => !p.imagePath)
  if (uncut.length) {
    issues.push({
      level: 'info',
      code: 'parts_placeholder',
      message: `${uncut.length}/${puppet.parts.length} parts still placeholders (no cutout PNG yet)`
    })
  }
  if (blueprint && puppet.blueprintId !== blueprint.id) {
    issues.push({
      level: 'error',
      code: 'blueprint_link',
      message: 'puppet.blueprintId does not match provided blueprint'
    })
  }
  if (blueprint) {
    for (const key of puppet.timeline.keys) {
      if (!blueprint.phases.some((p) => p.name === key.phaseName)) {
        issues.push({
          level: 'error',
          code: 'key_phase',
          message: `Timeline key references missing phase: ${key.phaseName}`
        })
      }
    }
  }
  const sorted = [...puppet.timeline.keys].sort((a, b) => a.frameIndex - b.frameIndex)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].frameIndex === sorted[i - 1].frameIndex) {
      issues.push({
        level: 'warning',
        code: 'key_collision',
        message: `Two keys share frameIndex ${sorted[i].frameIndex}`
      })
    }
  }
  return issues
}

/** Compact schema for diagnostics / agent research (not a paint prompt). */
export function summarizePuppetForAgent(puppet: CharacterPuppet): {
  schemaVersion: typeof CHARACTER_PUPPET_SCHEMA
  id: string
  status: CharacterPuppet['status']
  blueprintId: string
  authorityImagePath: string
  partCount: number
  partsReady: number
  timeline: { frameCount: number; keyPhases: MotionPhaseName[] }
  thesis: CharacterPuppet['thesis']
  nextMvpSteps: string[]
} {
  const partsReady = puppet.parts.filter((p) => p.imagePath && p.status !== 'placeholder').length
  return {
    schemaVersion: CHARACTER_PUPPET_SCHEMA,
    id: puppet.id,
    status: puppet.status,
    blueprintId: puppet.blueprintId,
    authorityImagePath: puppet.bindPose.authorityImagePath,
    partCount: puppet.parts.length,
    partsReady,
    timeline: {
      frameCount: puppet.timeline.frameCount,
      keyPhases: [...puppet.timeline.keys]
        .sort((a, b) => a.frameIndex - b.frameIndex)
        .map((k) => k.phaseName)
    },
    thesis: puppet.thesis,
    nextMvpSteps: [
      'Craft: guide photo → silhouette/paint (BASE sprite).',
      'Motion Studio: key the Motion Blueprint skeleton.',
      'Animation Studio: scrub skeleton, approve motion, export.',
      'Aseprite: apply skeleton motion guide to the BASE sprite.',
      'Import finished sheet to engine (nearest).'
    ]
  }
}
