import type {
  MotionBlueprint,
  MotionConstraints,
  MotionJoint,
  MotionPhase,
  MotionPhaseName,
  MotionSceneAnchorId
} from '@shared/types/project'
import { AT_BAT_ANCHORS, batAngleDeg, getJoint } from './rhBatterSwing'

export interface MotionConstraintWarning {
  phase: MotionPhaseName
  code: string
  message: string
}

function pointInNormalizedBox(
  x: number,
  y: number,
  canvasW: number,
  canvasH: number,
  nx: number,
  ny: number,
  nw: number,
  nh: number
): boolean {
  const px = x / canvasW
  const py = y / canvasH
  return px >= nx && px <= nx + nw && py >= ny && py <= ny + nh
}

function overlapsAnchor(
  joint: MotionJoint,
  anchorId: MotionSceneAnchorId,
  canvasW: number,
  canvasH: number
): boolean {
  const anchor = AT_BAT_ANCHORS.find((a) => a.id === anchorId)
  if (!anchor || anchor.kind !== 'box' || anchor.w == null || anchor.h == null) return false
  return pointInNormalizedBox(joint.x, joint.y, canvasW, canvasH, anchor.x, anchor.y, anchor.w, anchor.h)
}

function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

export function validatePhaseConstraints(
  phase: MotionPhase,
  canvasWidth: number,
  canvasHeight: number
): MotionConstraintWarning[] {
  const warnings: MotionConstraintWarning[] = []
  const c = phase.constraints
  const joints = phase.joints.map((j) => ({
    ...j,
    x: j.x + phase.rootOffset.x,
    y: j.y + phase.rootOffset.y
  }))

  const front = getJoint(joints, 'frontFoot')
  const rear = getJoint(joints, 'rearFoot')
  const hands = getJoint(joints, 'hands')
  const handle = getJoint(joints, 'batHandle')
  const tip = getJoint(joints, 'batTip')

  if (c.cannotOverlap?.length) {
    for (const anchorId of c.cannotOverlap) {
      for (const foot of [front, rear]) {
        if (foot && overlapsAnchor(foot, anchorId, canvasWidth, canvasHeight)) {
          warnings.push({
            phase: phase.name,
            code: 'cannot_overlap',
            message: `${foot.id} overlaps ${anchorId.replace(/_/g, ' ')} (constraint: cannot overlap).`
          })
        }
      }
    }
  }

  if (c.handsAttachedToBat && hands && handle) {
    const dist = Math.hypot(hands.x - handle.x, hands.y - handle.y)
    const max = Math.max(canvasWidth, canvasHeight) * 0.06
    if (dist > max) {
      warnings.push({
        phase: phase.name,
        code: 'hands_detached',
        message: `Hands are far from bat handle (${Math.round(dist)}px). Constraint expects hands attached to bat.`
      })
    }
  }

  const measured = batAngleDeg(joints)
  if (c.batAngleDeg != null && measured != null) {
    if (angleDiff(measured, c.batAngleDeg) > 18) {
      warnings.push({
        phase: phase.name,
        code: 'bat_angle',
        message: `Bat angle is ${Math.round(measured)}° but constraint expects ~${c.batAngleDeg}°.`
      })
    }
  }

  if (c.batRemainsLoaded && measured != null) {
    // Loaded bats are typically steep / over the shoulder (negative-ish or upright), not flat.
    if (Math.abs(measured) < 25) {
      warnings.push({
        phase: phase.name,
        code: 'bat_not_loaded',
        message: `Bat looks flattened (~${Math.round(measured)}°) but phase expects bat to remain loaded.`
      })
    }
  }

  if (c.strideTowardPitcher && front && rear) {
    // Toward pitcher in umpire POV is upward (smaller Y).
    if (front.y >= rear.y - canvasHeight * 0.01) {
      warnings.push({
        phase: phase.name,
        code: 'stride_direction',
        message: 'Front foot should be closer to the pitcher (higher on canvas) than the rear foot.'
      })
    }
  }

  if (c.frontFootGrounded && front) {
    const groundY = canvasHeight * 0.7
    if (front.y < groundY) {
      warnings.push({
        phase: phase.name,
        code: 'front_foot_airborne',
        message: 'Front foot is above the ground band; constraint expects front foot grounded.'
      })
    }
  }

  if (c.frontFootRegion === 'front_of_left_batters_box' && front) {
    const box = AT_BAT_ANCHORS.find((a) => a.id === 'left_batters_box')
    if (box && box.w != null && box.h != null) {
      const inBox = pointInNormalizedBox(
        front.x,
        front.y,
        canvasWidth,
        canvasHeight,
        box.x,
        box.y,
        box.w,
        box.h
      )
      const nx = front.x / canvasWidth
      const towardPitcher = front.y / canvasHeight < box.y + box.h * 0.35
      if (!inBox && !towardPitcher) {
        warnings.push({
          phase: phase.name,
          code: 'front_foot_region',
          message: "Front foot is outside front-of-left-batter's-box region."
        })
      }
    }
  }

  if (!handle || !tip) {
    warnings.push({
      phase: phase.name,
      code: 'missing_bat',
      message: 'Bat handle or tip joint is missing.'
    })
  }

  return warnings
}

export function validateBlueprint(blueprint: MotionBlueprint): MotionConstraintWarning[] {
  return blueprint.phases.flatMap((p) =>
    validatePhaseConstraints(p, blueprint.canvasWidth, blueprint.canvasHeight)
  )
}

export function mergeConstraints(
  base: MotionConstraints,
  patch: Partial<MotionConstraints>
): MotionConstraints {
  return { ...base, ...patch }
}
