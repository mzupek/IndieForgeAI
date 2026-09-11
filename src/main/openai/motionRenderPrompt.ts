/**
 * Compile a MotionRenderRequest into provider prompt text.
 * State → compiler → prompt. No creative planning here.
 */

import type { MotionRenderRequest } from '@shared/motion/animationSession'
import { batAngleDeg, getJoint } from '@shared/motion/rhBatterSwing'
import { buildJointLockBlock } from './paintLockGuide'

function imageIndexForRole(request: MotionRenderRequest, role: string): number {
  const i = request.images.findIndex((img) => img.role === role)
  return i >= 0 ? i + 1 : 1
}

function imageRoleHints(request: MotionRenderRequest): string[] {
  return request.images.map((img, i) => {
    const n = i + 1
    switch (img.role) {
      case 'character_authority':
        return `Image ${n} is FRAME 0 character authority — costume/palette/camera identity ONLY. Do NOT copy Image ${n}'s idle limb positions when they conflict with the pose-lock.`
      case 'pose_lock':
        return request.mode === 'repose_from_authority'
          ? `Image ${n} is the AUTHORITATIVE target pose (skeleton + bright bat). Limb/foot/bat tip positions MUST match Image ${n}. Costume from character authority.`
          : `Image ${n} is the LOCKED Motion pose guide (skeleton + bat). Match limb/foot/bat tip positions. Bright bat stroke on top is authoritative for bat depth.`
      case 'prev_frame':
        return `Image ${n} is the previous phase frame — motion continuity only; identity from authority; pose from pose-lock.`
      case 'craft_guide':
        return request.mode === 'repose_from_authority'
          ? `Image ${n} is Craft guide (camera reminder only). Prefer authority camera if they conflict.`
          : `Image ${n} is the Craft GUIDE PHOTO (camera + depth). Match umpire/catcher POV toward pitcher — NOT side-profile. No stadium/UI. Remap onto pose-lock joints.`
      case 'craft_appearance':
        return `Image ${n} is Craft appearance (${img.label}) for colors/costume only. Pose from pose-lock; camera from guide/authority.`
      default:
        return `Image ${n}: ${img.label}`
    }
  })
}

export function compileMotionRenderPrompt(request: MotionRenderRequest): {
  prompt: string
  multiImageHint: string
} {
  const hintParts = imageRoleHints(request)
  const multiImageHint = hintParts.join(' ')
  const measuredBat = batAngleDeg(request.joints)
  const batInFront = request.locks.batInFrontOfBody
  const { phaseName, phase, session } = request
  const poseImgN = imageIndexForRole(request, 'pose_lock')
  const authImgN = imageIndexForRole(request, 'character_authority')
  const poseImg = `Image ${poseImgN}`
  const jointLock = buildJointLockBlock(phase, { poseImageLabel: poseImg })

  const tip = getJoint(request.joints, 'batTip')
  const head = getJoint(request.joints, 'head')
  const tipSide =
    tip && head ? (tip.x >= head.x ? 'RIGHT' : 'LEFT') : null

  const constraintNotes = [
    measuredBat != null ? `bat angle FROM GUIDE (authoritative): ${Math.round(measuredBat)}°` : null,
    request.constraints.batRemainsLoaded ? 'bat remains loaded (not flat across the body)' : null,
    request.constraints.frontFootGrounded ? 'front foot grounded' : null,
    request.constraints.strideTowardPitcher ? 'stride toward pitcher' : null,
    batInFront
      ? 'BAT IN FRONT of head/helmet (camera-near shoulder) — bat occludes helmet where they overlap'
      : 'bat behind body',
    request.constraints.cannotOverlap?.length
      ? `do not overlap ${request.constraints.cannotOverlap.join(', ')}`
      : null
  ]
    .filter(Boolean)
    .join('; ')

  const design = session.designSize

  if (request.mode === 'repose_from_authority') {
    const prompt = `You are REPOSING Frame 0 into Motion phase "${phaseName}".

RENDER CONTRACT (priority order — higher wins on conflict):
1. POSE from ${poseImg} (skeleton + bright bat) — NON-NEGOTIABLE
2. CAMERA from Image ${authImgN} (¾ rear umpire POV) — NON-NEGOTIABLE  
3. COSTUME/COLORS from Image ${authImgN} only

CRITICAL — POSE WINS OVER IDENTITY:
- Image ${authImgN} is idle/ready. Phase "${phaseName}" may be a LARGE pose change (stride/swing).
- You MUST move feet/hands/bat to ${poseImg} coordinates even if that looks very different from Image ${authImgN}.
- FAIL IF you keep the idle bat-over-shoulder pose when ${poseImg} shows a different bat tip.
${
  tipSide
    ? `- FAIL IF bat tip is not on the ${tipSide} side of the head (pose-lock requires tip ${tipSide} of head at ~(${tip ? Math.round(tip.x) : '?'}, ${tip ? Math.round(tip.y) : '?'})).`
    : ''
}
- FAIL IF the character flips to a flat side-profile facing the opposite way from Image ${authImgN}'s camera.
- FAIL IF front/rear foot positions ignore ${poseImg}.

COSTUME (from Image ${authImgN} only):
- Same helmet shape, cream jersey, black sleeves, bat wood/yellow, pixel scale, line weight.
- Do NOT invent a new character — but DO fully change the pose.

CAMERA:
- ${session.camera.description}
- Keep Image ${authImgN}'s ¾ rear camera — never switch to side-profile broadcast.

${
  batInFront
    ? 'DEPTH: bat in front of helmet where they overlap (as drawn on pose-lock).'
    : 'DEPTH: follow bat layering on pose-lock.'
}

Transparent background. No stadium/UI.

${jointLock}

MECHANICS NOTES: ${constraintNotes || 'follow pose-lock'}
${phase.notes ? `Human notes: ${phase.notes}` : ''}
${request.userNotes ? `Extra: ${request.userNotes}` : ''}

${hintParts.join('\n')}`

    return { prompt, multiImageHint }
  }

  const hasGuide = request.images.some((i) => i.role === 'craft_guide')
  const prompt = `You are painting ONE pixel-art baseball batter sprite for Motion phase "${phaseName}".

This request is a RENDER CONTRACT from Animation Session — not a creative brief.
- Camera LOCKED: ${session.camera.description}
- Pose LOCKED to ${poseImg}.
- Background LOCKED transparent.

Phase IDLE / ready. Joints from pose-lock${hasGuide ? '; CAMERA from Craft guide' : ''}.

CAMERA:
- Behind home plate looking toward pitcher (umpire / catcher POV).
- Body is ¾ rear / foreshortened — NOT a side-view SNES batter in profile.
- Preserve depth: near vs far shoulder volume.
- Transparent background only — no dirt, stadium, or strike-zone UI.

THIS IS NOT "draw a typical batter." Follow pose-lock for joints${hasGuide ? ' and Craft guide for camera/depth' : ''}.
- Limb positions, feet, hands, bat handle, and bat tip must match pose-lock as closely as possible.
- ${
    batInFront
      ? 'DEPTH FAIL IF: bat is hidden behind the head/helmet. Bat paints OVER the helmet.'
      : 'DEPTH: bat may sit behind the torso as in pose-lock.'
  }

${jointLock}

CRITICAL QUALITY:
- Fill the canvas; character ~70–85% of height on a ${design.width}×${design.height} design.
- Transparent background. Crisp SNES/arcade pixels — not a tiny stub sprite.
- Do NOT add a dirt strip or plate under the feet unless already in pose-lock.

MECHANICS NOTES: ${constraintNotes || 'follow pose-lock'}
${phase.notes ? `Human notes: ${phase.notes}` : ''}
${request.userNotes ? `Extra: ${request.userNotes}` : ''}

${hintParts.join('\n')}`

  return { prompt, multiImageHint }
}
