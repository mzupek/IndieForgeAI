/**
 * Axis-aligned crop regions for MVP cutouts from the bind-pose (Frame 0) authority sprite.
 * Heuristic — good enough to prove rasterize-on-lerp; clean in Aseprite later.
 *
 * Important: AI paint often drifts from Motion Blueprint joints. Crops expand by a
 * measured joints→pixels drift so parts capture costume, while pivots stay on
 * blueprint joints (bind-pose composite still reconstructs canvas positions).
 */

import type { MotionJoint, MotionJointId, MotionVec2, PuppetPartId } from '@shared/types/project'
import { getJoint } from './rhBatterSwing'

export interface PartCropRegion {
  partId: PuppetPartId
  /** Canvas-space crop (integer px) */
  x: number
  y: number
  width: number
  height: number
  /** Pivot in part-local px (bind joint relative to crop origin) */
  pivotLocal: MotionVec2
  /** Bind-pose aim angle (degrees) for rotation baseline; null if no aim */
  bindAimDeg: number | null
}

export interface CutoutDrift {
  x: number
  y: number
}

function clampRect(
  x: number,
  y: number,
  w: number,
  h: number,
  canvasW: number,
  canvasH: number
): { x: number; y: number; width: number; height: number } {
  let left = Math.floor(x)
  let top = Math.floor(y)
  let right = Math.ceil(x + w)
  let bottom = Math.ceil(y + h)
  left = Math.max(0, left)
  top = Math.max(0, top)
  right = Math.min(canvasW, right)
  bottom = Math.min(canvasH, bottom)
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  return { x: left, y: top, width, height }
}

function hullBox(
  points: MotionVec2[],
  pad: number,
  canvasW: number,
  canvasH: number
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return clampRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2, canvasW, canvasH)
}

/** Include blueprint points and the same points shifted by paint drift. */
function bonePointsWithDrift(points: MotionVec2[], drift: CutoutDrift): MotionVec2[] {
  if (Math.abs(drift.x) < 0.5 && Math.abs(drift.y) < 0.5) return points
  const out = [...points]
  for (const p of points) {
    out.push({ x: p.x + drift.x, y: p.y + drift.y })
  }
  return out
}

function aimDeg(from: MotionVec2, to: MotionVec2): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

function requireJoint(joints: MotionJoint[], id: MotionJointId): MotionJoint {
  const j = getJoint(joints, id)
  if (!j) throw new Error(`Missing joint for cutout: ${id}`)
  return j
}

/**
 * Mean offset from Motion Blueprint joints → strong opaque pixels in the authority PNG.
 * Positive x means paint sits to the right of the rig (common with this batter).
 */
export function estimateJointsToPixelsDrift(
  joints: MotionJoint[],
  rgba: Buffer,
  width: number,
  height: number,
  alphaThreshold = 128
): CutoutDrift {
  let jx = 0
  let jy = 0
  let jn = 0
  for (const j of joints) {
    jx += j.x
    jy += j.y
    jn++
  }
  if (!jn) return { x: 0, y: 0 }
  jx /= jn
  jy /= jn

  let px = 0
  let py = 0
  let pn = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3]
      if (a > alphaThreshold) {
        px += x
        py += y
        pn++
      }
    }
  }
  if (pn < 32) return { x: 0, y: 0 }
  px /= pn
  py /= pn

  return {
    x: px - jx,
    y: py - jy
  }
}

/** Compute crop + local pivot for one part against bind-pose joints. */
export function computePartCropRegion(
  partId: PuppetPartId,
  joints: MotionJoint[],
  canvasWidth: number,
  canvasHeight: number,
  drift: CutoutDrift = { x: 0, y: 0 }
): PartCropRegion {
  const head = requireJoint(joints, 'head')
  const shoulders = requireJoint(joints, 'shoulders')
  const torso = requireJoint(joints, 'torso')
  const hips = requireJoint(joints, 'hips')
  const frontFoot = requireJoint(joints, 'frontFoot')
  const rearFoot = requireJoint(joints, 'rearFoot')
  const hands = requireJoint(joints, 'hands')
  const batHandle = requireJoint(joints, 'batHandle')
  const batTip = requireJoint(joints, 'batTip')

  let rect: { x: number; y: number; width: number; height: number }
  let bind: MotionVec2
  let aim: MotionVec2 | null = null
  const pad = (n: number) => Math.max(n, canvasWidth * 0.06)

  switch (partId) {
    case 'head':
      bind = head
      aim = shoulders
      rect = hullBox(bonePointsWithDrift([head], drift), pad(26), canvasWidth, canvasHeight)
      break
    case 'torso':
      bind = torso
      aim = shoulders
      rect = hullBox(
        bonePointsWithDrift([shoulders, torso, hips], drift),
        pad(22),
        canvasWidth,
        canvasHeight
      )
      rect = clampRect(rect.x - 10, rect.y, rect.width + 20, rect.height, canvasWidth, canvasHeight)
      break
    case 'farArm':
      bind = shoulders
      aim = hands
      rect = hullBox(
        bonePointsWithDrift([shoulders, hands], drift),
        pad(16),
        canvasWidth,
        canvasHeight
      )
      break
    case 'nearArm':
      bind = shoulders
      aim = hands
      rect = hullBox(
        bonePointsWithDrift([shoulders, hands], drift),
        pad(18),
        canvasWidth,
        canvasHeight
      )
      break
    case 'farLeg':
      bind = rearFoot
      aim = hips
      rect = hullBox(
        bonePointsWithDrift([hips, rearFoot], drift),
        pad(18),
        canvasWidth,
        canvasHeight
      )
      break
    case 'nearLeg':
      bind = frontFoot
      aim = hips
      rect = hullBox(
        bonePointsWithDrift([hips, frontFoot], drift),
        pad(18),
        canvasWidth,
        canvasHeight
      )
      break
    case 'hands':
      bind = hands
      aim = batHandle
      rect = hullBox(bonePointsWithDrift([hands, batHandle], drift), pad(16), canvasWidth, canvasHeight)
      break
    case 'bat':
      bind = batHandle
      aim = batTip
      rect = hullBox(
        bonePointsWithDrift([batHandle, batTip, hands], drift),
        pad(14),
        canvasWidth,
        canvasHeight
      )
      break
    default:
      throw new Error(`Unknown part: ${partId}`)
  }

  return {
    partId,
    ...rect,
    pivotLocal: {
      x: bind.x - rect.x,
      y: bind.y - rect.y
    },
    bindAimDeg: aim ? aimDeg(bind, aim) : null
  }
}

export function computeAllPartCropRegions(
  joints: MotionJoint[],
  canvasWidth: number,
  canvasHeight: number,
  partIds: PuppetPartId[],
  drift: CutoutDrift = { x: 0, y: 0 }
): PartCropRegion[] {
  return partIds.map((id) => computePartCropRegion(id, joints, canvasWidth, canvasHeight, drift))
}

/** Degrees from bind joint → aim joint in a joint list. */
export function jointAimDeg(
  joints: MotionJoint[],
  bindId: MotionJointId,
  aimId?: MotionJointId
): number | null {
  if (!aimId) return null
  const bind = getJoint(joints, bindId)
  const aim = getJoint(joints, aimId)
  if (!bind || !aim) return null
  return aimDeg(bind, aim)
}

/** Shortest signed delta in degrees (result in (-180, 180]). */
export function shortestAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  let d = toDeg - fromDeg
  while (d > 180) d -= 360
  while (d <= -180) d += 360
  return d
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  return dx * dx + dy * dy
}

function dist2ToSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  if (len2 < 1e-6) return dist2(px, py, ax, ay)
  let t = ((px - ax) * abx + (py - ay) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  return dist2(px, py, ax + t * abx, ay + t * aby)
}

/** Lower number wins ties. Head/hands beat bat so the helmet is not stolen by the bat bone. */
const PART_PRIORITY: Record<PuppetPartId, number> = {
  head: 0,
  hands: 1,
  farArm: 2,
  nearArm: 2,
  bat: 3,
  farLeg: 4,
  nearLeg: 4,
  torso: 5
}

/** Max distance (px) from a part's bone before it cannot claim a pixel. */
const PART_MAX_DIST: Record<PuppetPartId, number> = {
  head: 34,
  hands: 22,
  farArm: 28,
  nearArm: 28,
  bat: 14,
  farLeg: 36,
  nearLeg: 36,
  torso: 40
}

/**
 * Assign each strong opaque pixel to exactly one part (nearest bone, with priority).
 * Uses joints shifted by drift so ownership matches painted pixels.
 * Returns Int16 labels: -1 empty, else index into `partIds`.
 */
export function assignExclusivePartLabels(
  rgba: Buffer,
  width: number,
  height: number,
  joints: MotionJoint[],
  partIds: PuppetPartId[],
  drift: CutoutDrift,
  alphaThreshold = 128
): Int16Array {
  const shifted = (id: MotionJointId): MotionVec2 => {
    const j = requireJoint(joints, id)
    return { x: j.x + drift.x, y: j.y + drift.y }
  }
  const head = shifted('head')
  const shoulders = shifted('shoulders')
  const torso = shifted('torso')
  const hips = shifted('hips')
  const frontFoot = shifted('frontFoot')
  const rearFoot = shifted('rearFoot')
  const hands = shifted('hands')
  const batHandle = shifted('batHandle')
  const batTip = shifted('batTip')

  const bones: Partial<Record<PuppetPartId, Array<[MotionVec2, MotionVec2]>>> = {
    head: [[head, head]],
    torso: [
      [shoulders, hips],
      [torso, torso]
    ],
    farLeg: [[hips, rearFoot]],
    nearLeg: [[hips, frontFoot]],
    farArm: [[shoulders, hands]],
    nearArm: [[shoulders, hands]],
    hands: [[hands, batHandle]],
    bat: [[batHandle, batTip]]
  }

  const indexOf = new Map(partIds.map((id, i) => [id, i]))
  const labels = new Int16Array(width * height)
  labels.fill(-1)

  const splitArm = (px: number, py: number): PuppetPartId => {
    const cross =
      (hands.x - shoulders.x) * (py - shoulders.y) - (hands.y - shoulders.y) * (px - shoulders.x)
    return cross < 0 ? 'farArm' : 'nearArm'
  }

  const headIdx = indexOf.get('head')
  const headClaimR2 = 28 * 28

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3]
      if (a <= alphaThreshold) continue

      // Hard claim: opaque pixels near the head joint belong to head (not bat).
      if (headIdx != null && dist2(x, y, head.x, head.y) <= headClaimR2) {
        labels[y * width + x] = headIdx
        continue
      }

      let bestId: PuppetPartId | null = null
      let bestDist = Infinity
      let bestPri = 99

      for (const partId of partIds) {
        const segs = bones[partId]
        if (!segs) continue
        let d = Infinity
        for (const [p0, p1] of segs) {
          d = Math.min(d, dist2ToSeg(x, y, p0.x, p0.y, p1.x, p1.y))
        }
        const maxD = PART_MAX_DIST[partId] ?? 40
        if (d > maxD * maxD) continue
        const pri = PART_PRIORITY[partId] ?? 9
        if (d + 4 < bestDist || (Math.abs(d - bestDist) <= 4 && pri < bestPri)) {
          bestDist = d
          bestPri = pri
          bestId = partId
        }
      }

      if (!bestId) continue
      if (bestId === 'farArm' || bestId === 'nearArm') {
        bestId = splitArm(x, y)
      }
      const idx = indexOf.get(bestId)
      if (idx != null) labels[y * width + x] = idx
    }
  }

  return labels
}

/** Assign every opaque pixel inside a rect to one part (user refine). */
export function claimRectInLabels(
  labels: Int16Array,
  rgba: Buffer,
  width: number,
  height: number,
  partIndex: number,
  rect: { x: number; y: number; width: number; height: number },
  alphaThreshold = 128
): void {
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width))
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const a = rgba[(y * width + x) * 4 + 3]
      if (a <= alphaThreshold) continue
      labels[y * width + x] = partIndex
    }
  }
}

export interface ExclusivePartExtract {
  partId: PuppetPartId
  x: number
  y: number
  width: number
  height: number
  pivotLocal: MotionVec2
  /** RGBA buffer for the exclusive part image */
  rgba: Buffer
}

/** Build a tight exclusive PNG buffer for one part from ownership labels. */
export function extractExclusivePart(options: {
  partId: PuppetPartId
  partIndex: number
  labels: Int16Array
  rgba: Buffer
  width: number
  height: number
  bind: MotionVec2
  pad?: number
}): ExclusivePartExtract | null {
  const { partId, partIndex, labels, rgba, width, height, bind } = options
  const pad = options.pad ?? 2

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (labels[y * width + x] !== partIndex) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) return null

  // Keep bind joint inside the part canvas so pivot placement stays correct.
  minX = Math.min(minX, Math.floor(bind.x))
  minY = Math.min(minY, Math.floor(bind.y))
  maxX = Math.max(maxX, Math.ceil(bind.x))
  maxY = Math.max(maxY, Math.ceil(bind.y))

  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)

  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const out = Buffer.alloc(w * h * 4, 0)
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (labels[y * width + x] !== partIndex) continue
      const si = (y * width + x) * 4
      const di = ((y - minY) * w + (x - minX)) * 4
      out[di] = rgba[si]
      out[di + 1] = rgba[si + 1]
      out[di + 2] = rgba[si + 2]
      out[di + 3] = rgba[si + 3]
    }
  }

  return {
    partId,
    x: minX,
    y: minY,
    width: w,
    height: h,
    pivotLocal: { x: bind.x - minX, y: bind.y - minY },
    rgba: out
  }
}
