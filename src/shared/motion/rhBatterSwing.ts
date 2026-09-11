import type {
  MotionBlueprint,
  MotionConstraints,
  MotionJoint,
  MotionJointId,
  MotionPhase,
  MotionPhaseName,
  MotionSceneAnchorId,
  MotionVec2
} from '@shared/types/project'

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `motion-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const SWING_PHASES: MotionPhaseName[] = [
  'idle',
  'load',
  'stride',
  'contact',
  'follow_through'
]

export const RH_BATTER_JOINT_IDS: MotionJointId[] = [
  'head',
  'shoulders',
  'torso',
  'hips',
  'frontFoot',
  'rearFoot',
  'hands',
  'batHandle',
  'batTip'
]

export const BONE_EDGES: Array<[MotionJointId, MotionJointId]> = [
  ['head', 'shoulders'],
  ['shoulders', 'torso'],
  ['torso', 'hips'],
  ['hips', 'frontFoot'],
  ['hips', 'rearFoot'],
  ['shoulders', 'hands'],
  ['hands', 'batHandle'],
  ['batHandle', 'batTip']
]

/** Locked At Bat anchors in normalized 0–1 space (umpire POV looking toward pitcher). */
export interface SceneAnchorDef {
  id: MotionSceneAnchorId
  label: string
  /** Axis-aligned box in normalized coords, or a direction arrow */
  kind: 'box' | 'arrow'
  x: number
  y: number
  w?: number
  h?: number
  /** Arrow tip for pitcher_direction */
  tipX?: number
  tipY?: number
}

export const AT_BAT_ANCHORS: SceneAnchorDef[] = [
  {
    id: 'home_plate',
    label: 'Home plate',
    kind: 'box',
    x: 0.42,
    y: 0.72,
    w: 0.16,
    h: 0.08
  },
  {
    id: 'left_batters_box',
    label: "Left batter's box",
    kind: 'box',
    x: 0.18,
    y: 0.62,
    w: 0.22,
    h: 0.22
  },
  {
    id: 'right_batters_box',
    label: "Right batter's box",
    kind: 'box',
    x: 0.6,
    y: 0.62,
    w: 0.22,
    h: 0.22
  },
  {
    id: 'pitcher_direction',
    label: 'Toward pitcher',
    kind: 'arrow',
    x: 0.5,
    y: 0.78,
    tipX: 0.5,
    tipY: 0.12
  }
]

function joint(id: MotionJointId, x: number, y: number, rotationDeg?: number): MotionJoint {
  return rotationDeg !== undefined ? { id, x, y, rotationDeg } : { id, x, y }
}

function scaleJoints(
  joints: Array<[MotionJointId, number, number, number?]>,
  w: number,
  h: number
): MotionJoint[] {
  return joints.map(([id, nx, ny, rot]) => joint(id, nx * w, ny * h, rot))
}

/** Starter RH batter poses in normalized space (left box, facing pitcher/up). */
const STARTER_POSES: Record<
  MotionPhaseName,
  { joints: Array<[MotionJointId, number, number, number?]>; constraints: MotionConstraints; notes?: string }
> = {
  idle: {
    notes: 'Ready batting stance in left batter’s box (not mid-swing).',
    constraints: {
      rearFootLocked: true,
      frontFootGrounded: true,
      frontFootRegion: 'left_batters_box',
      cannotOverlap: ['home_plate'],
      handsAttachedToBat: true,
      batRemainsLoaded: true,
      batInFrontOfBody: true,
      batAngleDeg: -55
    },
    joints: [
      ['head', 0.34, 0.4],
      ['shoulders', 0.33, 0.48],
      ['torso', 0.34, 0.56],
      ['hips', 0.35, 0.64],
      ['rearFoot', 0.3, 0.8],
      ['frontFoot', 0.4, 0.78],
      ['hands', 0.3, 0.5],
      ['batHandle', 0.31, 0.52],
      ['batTip', 0.22, 0.3]
    ]
  },
  load: {
    notes: 'Coil; bat stays loaded over rear shoulder.',
    constraints: {
      rearFootLocked: true,
      frontFootGrounded: true,
      frontFootRegion: 'left_batters_box',
      cannotOverlap: ['home_plate'],
      handsAttachedToBat: true,
      batRemainsLoaded: true,
      batInFrontOfBody: true,
      batAngleDeg: -62
    },
    joints: [
      ['head', 0.3, 0.37],
      ['shoulders', 0.3, 0.45],
      ['torso', 0.31, 0.53],
      ['hips', 0.32, 0.62],
      ['rearFoot', 0.28, 0.78],
      ['frontFoot', 0.36, 0.78],
      ['hands', 0.28, 0.44],
      ['batHandle', 0.29, 0.46],
      ['batTip', 0.22, 0.22]
    ]
  },
  stride: {
    notes: 'Front foot strides toward pitcher; bat still loaded.',
    constraints: {
      rearFootLocked: true,
      frontFootGrounded: true,
      frontFootRegion: 'front_of_left_batters_box',
      cannotOverlap: ['home_plate'],
      handsAttachedToBat: true,
      batRemainsLoaded: true,
      batInFrontOfBody: true,
      strideTowardPitcher: true,
      batAngleDeg: -58
    },
    joints: [
      ['head', 0.34, 0.36],
      ['shoulders', 0.34, 0.44],
      ['torso', 0.35, 0.52],
      ['hips', 0.36, 0.61],
      ['rearFoot', 0.3, 0.78],
      ['frontFoot', 0.42, 0.74],
      ['hands', 0.3, 0.42],
      ['batHandle', 0.31, 0.44],
      ['batTip', 0.24, 0.2]
    ]
  },
  contact: {
    notes: 'Bat roughly horizontal at contact plane.',
    constraints: {
      rearFootLocked: false,
      frontFootGrounded: true,
      frontFootRegion: 'toward_pitcher',
      cannotOverlap: ['home_plate'],
      handsAttachedToBat: true,
      batRemainsLoaded: false,
      batInFrontOfBody: true,
      batAngleDeg: 0
    },
    joints: [
      ['head', 0.4, 0.36],
      ['shoulders', 0.4, 0.44],
      ['torso', 0.41, 0.52],
      ['hips', 0.4, 0.61],
      ['rearFoot', 0.32, 0.78],
      ['frontFoot', 0.48, 0.74],
      ['hands', 0.48, 0.5],
      ['batHandle', 0.5, 0.5],
      ['batTip', 0.72, 0.48]
    ]
  },
  follow_through: {
    notes:
      'High wrap — bat finishes over the lead/front shoulder (other side of the head from contact).',
    constraints: {
      rearFootLocked: false,
      frontFootGrounded: true,
      frontFootRegion: 'toward_pitcher',
      cannotOverlap: ['home_plate'],
      handsAttachedToBat: true,
      batRemainsLoaded: false,
      // Barrel wraps past the body; draw bat behind torso mass for the high finish.
      batInFrontOfBody: false,
      batAngleDeg: -110
    },
    joints: [
      ['head', 0.42, 0.34],
      ['shoulders', 0.42, 0.42],
      ['torso', 0.41, 0.51],
      ['hips', 0.4, 0.6],
      ['rearFoot', 0.34, 0.78],
      ['frontFoot', 0.5, 0.74],
      // Hands pull across toward lead shoulder (left of head in umpire POV)
      ['hands', 0.36, 0.32],
      ['batHandle', 0.34, 0.3],
      // Tip wraps to the OTHER side of the head / over the front shoulder
      ['batTip', 0.26, 0.14]
    ]
  }
}

/**
 * If follow-through still parks the tip on the contact side of the head (common starter bug),
 * replace that phase with the wrap starter. Returns a new blueprint when changed.
 */
export function repairFollowThroughWrap(blueprint: MotionBlueprint): {
  blueprint: MotionBlueprint
  repaired: boolean
} {
  if (blueprint.rigPreset !== 'rh_batter_swing') {
    return { blueprint, repaired: false }
  }
  const phase = blueprint.phases.find((p) => p.name === 'follow_through')
  if (!phase) return { blueprint, repaired: false }

  const head = getJoint(phase.joints, 'head')
  const tip = getJoint(phase.joints, 'batTip')
  if (!head || !tip) return { blueprint, repaired: false }

  // Contact finishes tip to the RIGHT of the head; a real wrap ends tip to the LEFT.
  const tipStillOnContactSide = tip.x > head.x + blueprint.canvasWidth * 0.04
  if (!tipStillOnContactSide) return { blueprint, repaired: false }

  const starter = STARTER_POSES.follow_through
  const nextPhases = blueprint.phases.map((p) =>
    p.name === 'follow_through'
      ? {
          ...p,
          joints: scaleJoints(starter.joints, blueprint.canvasWidth, blueprint.canvasHeight),
          constraints: { ...starter.constraints },
          notes: starter.notes
        }
      : p
  )
  return {
    blueprint: {
      ...blueprint,
      phases: nextPhases,
      updatedAt: new Date().toISOString()
    },
    repaired: true
  }
}

export function batAngleDeg(joints: MotionJoint[]): number | null {
  const handle = joints.find((j) => j.id === 'batHandle')
  const tip = joints.find((j) => j.id === 'batTip')
  if (!handle || !tip) return null
  return (Math.atan2(tip.y - handle.y, tip.x - handle.x) * 180) / Math.PI
}

export function getJoint(joints: MotionJoint[], id: MotionJointId): MotionJoint | undefined {
  return joints.find((j) => j.id === id)
}

export function applyRootOffset(joints: MotionJoint[], root: MotionVec2): MotionJoint[] {
  return joints.map((j) => ({ ...j, x: j.x + root.x, y: j.y + root.y }))
}

export function createRhBatterSwingBlueprint(options?: {
  canvasWidth?: number
  canvasHeight?: number
  sceneId?: string
}): MotionBlueprint {
  const canvasWidth = options?.canvasWidth ?? 1024
  const canvasHeight = options?.canvasHeight ?? 1024
  const phases: MotionPhase[] = SWING_PHASES.map((name) => {
    const starter = STARTER_POSES[name]
    return {
      name,
      rootOffset: { x: 0, y: 0 },
      joints: scaleJoints(starter.joints, canvasWidth, canvasHeight),
      constraints: { ...starter.constraints },
      notes: starter.notes
    }
  })

  return {
    id: newId(),
    name: 'swing',
    rigPreset: 'rh_batter_swing',
    sceneId: options?.sceneId ?? 'scene-at-bat',
    canvasWidth,
    canvasHeight,
    phases,
    updatedAt: new Date().toISOString(),
    history: []
  }
}

export function phaseIndex(name: MotionPhaseName): number {
  return SWING_PHASES.indexOf(name)
}

export function phaseDisplayName(name: MotionPhaseName): string {
  switch (name) {
    case 'idle':
      return 'Idle'
    case 'load':
      return 'Load'
    case 'stride':
      return 'Stride'
    case 'contact':
      return 'Contact'
    case 'follow_through':
      return 'Follow-through'
  }
}
