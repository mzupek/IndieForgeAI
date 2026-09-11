import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import type { MotionJoint, MotionPhase } from '@shared/types/project'
import { batAngleDeg, applyRootOffset, getJoint } from '@shared/motion/rhBatterSwing'
import { getGeneratedDir } from '../storage/filePaths'

export type CraftPaintRef = {
  path: string
  label: string
}

/**
 * Build AI lock image: pose-guide skeleton + optional soft Craft underlay + bat drawn LAST.
 *
 * Critical: never burn a Craft outline on top of the bat. Outline pixels are opaque black and
 * erase the tan bat where they cross the head — which teaches the model "bat behind helmet."
 */
export async function buildPaintLockGuidePng(options: {
  projectId: string
  assetId: string
  phaseName: string
  poseGuidePath: string
  craftRefs: CraftPaintRef[]
  joints: MotionJoint[]
  batInFrontOfBody: boolean
  designWidth: number
  designHeight: number
  canvasWidth: number
  canvasHeight: number
}): Promise<{ path: string; notes: string[] }> {
  const {
    projectId,
    assetId,
    phaseName,
    poseGuidePath,
    craftRefs,
    joints,
    batInFrontOfBody,
    designWidth,
    designHeight,
    canvasWidth,
    canvasHeight
  } = options

  const w = Math.max(256, canvasWidth)
  const h = Math.max(256, canvasHeight)
  const notes: string[] = []

  let base = sharp(poseGuidePath).ensureAlpha().resize(w, h, {
    fit: 'contain',
    background: { r: 26, g: 31, b: 42, alpha: 1 }
  })

  // Soft underlay only — prefer filled silhouette / paint. Skip outline (wrong depth + erases bat).
  const underlayRefs = craftRefs.filter((r) => {
    const lab = r.label.toLowerCase()
    return lab.includes('silhouette') || lab.includes('color') || lab.includes('paint')
  })
  const outlineOnly =
    underlayRefs.length === 0 && craftRefs.some((r) => r.label.toLowerCase().includes('outline'))
  if (outlineOnly) {
    notes.push(
      'skipped_outline_underlay: Craft outline encodes bat-behind-head and would overwrite the bat stroke'
    )
  }

  const composites: sharp.OverlayOptions[] = []
  for (const ref of underlayRefs.slice(0, 1)) {
    try {
      const { data, info } = await sharp(ref.path)
        .ensureAlpha()
        .resize(w, h, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .raw()
        .toBuffer({ resolveWithObject: true })
      for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = Math.round(data[i + 3] * 0.35)
      }
      const craftBuf = await sharp(data, {
        raw: { width: info.width, height: info.height, channels: 4 }
      })
        .png()
        .toBuffer()
      composites.push({ input: craftBuf, blend: 'over' })
      notes.push(`craft_underlay=${ref.label}@35%`)
    } catch {
      // skip unreadable craft layer
    }
  }

  // Depth lock: thick bat drawn AFTER everything else so Image 1 cannot read as bat-behind.
  const handle = getJoint(joints, 'batHandle')
  const tip = getJoint(joints, 'batTip')
  const head = getJoint(joints, 'head')
  if (handle && tip) {
    const sx = w / Math.max(1, designWidth)
    const sy = h / Math.max(1, designHeight)
    const x1 = handle.x * sx
    const y1 = handle.y * sy
    const x2 = tip.x * sx
    const y2 = tip.y * sy
    const stroke = Math.max(10, Math.round(w / 64))
    const batColor = batInFrontOfBody ? '#ffb020' : '#8a6a40'
    const depthLabel = batInFrontOfBody
      ? 'DEPTH: BAT IN FRONT (occludes helmet)'
      : 'DEPTH: bat behind body'
    const headMark =
      batInFrontOfBody && head
        ? `<circle cx="${head.x * sx}" cy="${head.y * sy}" r="${Math.max(6, w / 80)}" fill="none" stroke="#7eb6ff" stroke-width="3" stroke-dasharray="4 3"/>`
        : ''

    const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1a1208" stroke-width="${stroke + 6}" stroke-linecap="round"/>
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${batColor}" stroke-width="${stroke}" stroke-linecap="round"/>
  <circle cx="${x1}" cy="${y1}" r="${Math.max(5, stroke * 0.45)}" fill="#fff3c4" stroke="#1a1208" stroke-width="2"/>
  <circle cx="${x2}" cy="${y2}" r="${Math.max(5, stroke * 0.45)}" fill="#ff8800" stroke="#1a1208" stroke-width="2"/>
  ${headMark}
  <rect x="8" y="${h - 44}" width="${Math.min(w - 16, 520)}" height="36" rx="6" fill="rgba(0,0,0,0.72)"/>
  <text x="18" y="${h - 20}" fill="${batInFrontOfBody ? '#ffd060' : '#c8c8c8'}" font-family="sans-serif" font-size="${Math.max(14, Math.round(w / 48))}" font-weight="700">${depthLabel}</text>
</svg>`)
    composites.push({ input: svg, blend: 'over' })
    notes.push(
      batInFrontOfBody ? 'bat_stroke_drawn_last=front' : 'bat_stroke_drawn_last=behind'
    )
  }

  if (composites.length) {
    base = base.composite(composites)
  }

  const dir = join(getGeneratedDir(projectId, assetId), 'pose-guides')
  await mkdir(dir, { recursive: true })
  const outPath = join(dir, `paint-lock-${phaseName}.png`)
  await writeFile(outPath, await base.png().toBuffer())
  return { path: outPath, notes }
}

export function buildJointLockBlock(
  phase: MotionPhase,
  options?: { poseImageLabel?: string }
): string {
  const joints = applyRootOffset(phase.joints, phase.rootOffset)
  const lines = joints.map(
    (j) => `- ${j.id}: (${Math.round(j.x)}, ${Math.round(j.y)})`
  )
  const measured = batAngleDeg(joints)
  const head = getJoint(joints, 'head')
  const handle = getJoint(joints, 'batHandle')
  const tip = getJoint(joints, 'batTip')
  const batInFront = phase.constraints.batInFrontOfBody !== false
  const poseImg = options?.poseImageLabel ?? 'Image 1'

  return `NUMERIC JOINT LOCK (design canvas px — match ${poseImg} pose-lock EXACTLY):
${lines.join('\n')}
Measured bat angle handle→tip: ${measured != null ? `${Math.round(measured)}°` : 'n/a'}
${head && handle ? `Bat handle vs head: handle is ${handle.x >= head.x ? 'RIGHT' : 'LEFT'} of head.` : ''}
${head && tip ? `Bat tip vs head: tip is ${tip.x >= head.x ? 'RIGHT' : 'LEFT'} / ${tip.y <= head.y ? 'ABOVE' : 'BELOW'} head.` : ''}
FAIL IF bat tip is on the wrong side of the head vs these coordinates.
DEPTH: batInFrontOfBody=${batInFront}. ${
    batInFront
      ? `Paint the bat and hands IN FRONT of the head/helmet/torso (camera-near). The bat must occlude the helmet where they overlap — NEVER hide the bat behind the head. ${poseImg} draws the bat ON TOP for this reason — follow that layering.`
      : 'Paint the bat BEHIND the head/torso.'
  }`
}

/** Prefer filled appearance; demote outline. Guide is handled separately as camera lock. */
export function orderAppearanceRefsForPaint(refs: CraftPaintRef[]): CraftPaintRef[] {
  const score = (label: string) => {
    const lab = label.toLowerCase()
    if (lab.includes('guide')) return 99 // sorted out of appearance list by caller
    if (lab.includes('color') || lab.includes('paint')) return 0
    if (lab.includes('silhouette')) return 1
    if (lab.includes('outline')) return 3
    return 2
  }
  return [...refs].sort((a, b) => score(a.label) - score(b.label))
}

export function splitGuideAndAppearanceRefs(refs: CraftPaintRef[]): {
  guideRefs: CraftPaintRef[]
  appearanceRefs: CraftPaintRef[]
} {
  const guideRefs = refs.filter((r) => r.label.toLowerCase().includes('guide'))
  const appearanceRefs = orderAppearanceRefsForPaint(
    refs.filter((r) => !r.label.toLowerCase().includes('guide'))
  )
  return { guideRefs, appearanceRefs }
}
