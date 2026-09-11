/**
 * Procedural mannequin kit — capsules from bind-pose joints (no AI).
 * Also hosts Director gates: approve brief, approve mannequin, mark motion proof.
 */

import { mkdir, access } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import type {
  AnimationBrief,
  CharacterPuppet,
  GameAsset,
  MotionJoint,
  MotionVec2,
  PuppetPart,
  PuppetPartId
} from '@shared/types/project'
import {
  PART_DEFS,
  RH_BATTER_PUPPET_PART_IDS,
  createRhBatterPuppetDraft,
  resolveProductionGate
} from '@shared/motion/characterPuppet'
import { getJoint } from '@shared/motion/rhBatterSwing'
import { getGeneratedDir } from '../storage/filePaths'
import { getAsset, updateAsset, ensureMotionBlueprint } from '../storage/assetStore'

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function partsDir(projectId: string, assetId: string) {
  return join(getGeneratedDir(projectId, assetId), 'puppet-parts')
}

function setPixel(rgba: Buffer, w: number, h: number, x: number, y: number, r: number, g: number, b: number, a: number) {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return
  const i = (yi * w + xi) * 4
  rgba[i] = r
  rgba[i + 1] = g
  rgba[i + 2] = b
  rgba[i + 3] = a
}

function fillCircle(
  rgba: Buffer,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  color: [number, number, number, number]
) {
  const r2 = radius * radius
  const x0 = Math.floor(cx - radius)
  const y0 = Math.floor(cy - radius)
  const x1 = Math.ceil(cx + radius)
  const y1 = Math.ceil(cy + radius)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy <= r2) {
        setPixel(rgba, w, h, x, y, color[0], color[1], color[2], color[3])
      }
    }
  }
}

/** Stadium capsule: circle at each end + thick segment. */
function fillCapsule(
  rgba: Buffer,
  w: number,
  h: number,
  a: MotionVec2,
  b: MotionVec2,
  radius: number,
  color: [number, number, number, number]
) {
  fillCircle(rgba, w, h, a.x, a.y, radius, color)
  fillCircle(rgba, w, h, b.x, b.y, radius, color)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 0.5) return
  const steps = Math.ceil(len)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    fillCircle(rgba, w, h, a.x + dx * t, a.y + dy * t, radius, color)
  }
}

/**
 * Wooden mannequin in Forge palette (charcoal / ember / gold) — no toy blues.
 * Far limbs darker for depth; near limbs a touch warmer.
 */
const PART_COLORS: Record<PuppetPartId, [number, number, number, number]> = {
  farLeg: [58, 48, 42, 255],
  nearLeg: [120, 88, 62, 255],
  torso: [148, 102, 68, 255],
  farArm: [72, 56, 46, 255],
  nearArm: [168, 112, 72, 255],
  hands: [196, 140, 88, 255],
  bat: [212, 148, 48, 255], // forge-gold lean
  head: [196, 96, 48, 255] // forge-ember / orange
}

function fillEllipse(
  rgba: Buffer,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: [number, number, number, number]
) {
  const x0 = Math.floor(cx - rx)
  const y0 = Math.floor(cy - ry)
  const x1 = Math.ceil(cx + rx)
  const y1 = Math.ceil(cy + ry)
  const rx2 = rx * rx || 1
  const ry2 = ry * ry || 1
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx / rx2 + dy * dy / ry2 <= 1) {
        setPixel(rgba, w, h, x, y, color[0], color[1], color[2], color[3])
      }
    }
  }
}

function cropOpaque(
  rgba: Buffer,
  width: number,
  height: number,
  bind: MotionVec2
): { rgba: Buffer; width: number; height: number; pivotLocal: MotionVec2; x: number; y: number } | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 16) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  if (maxX < 0) return null
  const pad = 2
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const out = Buffer.alloc(cw * ch * 4)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((minY + y) * width + (minX + x)) * 4
      const di = (y * cw + x) * 4
      out[di] = rgba[si]
      out[di + 1] = rgba[si + 1]
      out[di + 2] = rgba[si + 2]
      out[di + 3] = rgba[si + 3]
    }
  }
  return {
    rgba: out,
    width: cw,
    height: ch,
    pivotLocal: { x: bind.x - minX, y: bind.y - minY },
    x: minX,
    y: minY
  }
}

function drawPartOnCanvas(
  joints: MotionJoint[],
  partId: PuppetPartId,
  canvasW: number,
  canvasH: number
): { rgba: Buffer; width: number; height: number; pivotLocal: MotionVec2 } | null {
  const def = PART_DEFS.find((p) => p.id === partId)
  if (!def) return null
  const bind = getJoint(joints, def.bindJoint)
  if (!bind) return null

  const full = Buffer.alloc(canvasW * canvasH * 4)
  const color = PART_COLORS[partId]
  const radius = def.mannequinRadius ?? 8

  const armSign = partId === 'nearArm' ? 1 : partId === 'farArm' ? -1 : 0
  if (armSign !== 0) {
    const a = getJoint(joints, 'shoulders')
    const b = getJoint(joints, 'hands')
    if (a && b) {
      const ox = armSign * (b.y - a.y) * 0.1
      const oy = armSign * -(b.x - a.x) * 0.1
      const from = { x: a.x + ox, y: a.y + oy }
      const to = { x: b.x + ox, y: b.y + oy }
      fillCapsule(full, canvasW, canvasH, from, to, radius, color)
      // Small articulation knobs (artist's wooden mannequin)
      fillCircle(full, canvasW, canvasH, from.x, from.y, radius + 1, color)
      fillCircle(full, canvasW, canvasH, to.x, to.y, Math.max(2, radius), color)
    }
  } else if (partId === 'torso') {
    const hips = getJoint(joints, 'hips')
    const torso = getJoint(joints, 'torso')
    const shoulders = getJoint(joints, 'shoulders')
    if (hips && torso && shoulders) {
      // Slim chest mass — wooden figure, not a barrel
      fillEllipse(
        full,
        canvasW,
        canvasH,
        torso.x,
        (hips.y + shoulders.y) / 2,
        radius * 0.95,
        Math.abs(shoulders.y - hips.y) * 0.42 + radius * 0.25,
        color
      )
      fillCapsule(full, canvasW, canvasH, hips, torso, radius * 0.7, color)
      fillCapsule(full, canvasW, canvasH, torso, shoulders, radius * 0.75, color)
      fillCircle(full, canvasW, canvasH, hips.x, hips.y, radius * 0.75, color)
      fillCircle(full, canvasW, canvasH, shoulders.x, shoulders.y, radius * 0.7, color)
    }
  } else if (partId === 'head') {
    const shoulders = getJoint(joints, 'shoulders')
    const head = getJoint(joints, 'head')
    if (shoulders && head) {
      // Thin neck + round head (must not resemble a bat)
      fillCapsule(full, canvasW, canvasH, shoulders, head, 2, color)
      fillCircle(full, canvasW, canvasH, head.x, head.y, radius, color)
    }
  } else if (partId === 'bat') {
    const handle = getJoint(joints, 'batHandle')
    const tip = getJoint(joints, 'batTip')
    if (handle && tip) {
      // Long thin stick + slightly thicker barrel at tip
      fillCapsule(full, canvasW, canvasH, handle, tip, radius, color)
      fillCircle(full, canvasW, canvasH, handle.x, handle.y, radius + 1, color)
      fillCircle(full, canvasW, canvasH, tip.x, tip.y, radius + 2, color)
    }
  } else if (partId === 'hands') {
    // Compact fist — not a stick
    fillEllipse(full, canvasW, canvasH, bind.x, bind.y, radius + 1, radius, color)
    fillCircle(full, canvasW, canvasH, bind.x, bind.y, radius, color)
  } else if (def.mannequinBones?.length) {
    for (const [fromId, toId] of def.mannequinBones) {
      const a = getJoint(joints, fromId)
      const b = getJoint(joints, toId)
      if (a && b) {
        fillCapsule(full, canvasW, canvasH, a, b, radius, color)
        fillCircle(full, canvasW, canvasH, a.x, a.y, Math.max(2, radius), color)
        fillCircle(full, canvasW, canvasH, b.x, b.y, Math.max(2, radius), color)
      }
    }
  } else {
    fillCircle(full, canvasW, canvasH, bind.x, bind.y, radius, color)
  }

  return cropOpaque(full, canvasW, canvasH, bind)
}

/** Full-body mannequin in canvas space (for pose-sheet frames — avoids jacked part composites). */
export function renderFullMannequinRgba(
  joints: MotionJoint[],
  canvasW: number,
  canvasH: number,
  batInFrontOfBody = true
): Buffer {
  const full = Buffer.alloc(canvasW * canvasH * 4)
  const order = [...RH_BATTER_PUPPET_PART_IDS].sort((a, b) => {
    const da = PART_DEFS.find((p) => p.id === a)
    const db = PART_DEFS.find((p) => p.id === b)
    const za =
      batInFrontOfBody && da?.zIndexWhenBatInFront != null
        ? da.zIndexWhenBatInFront
        : (da?.zIndex ?? 0)
    const zb =
      batInFrontOfBody && db?.zIndexWhenBatInFront != null
        ? db.zIndexWhenBatInFront
        : (db?.zIndex ?? 0)
    return za - zb
  })

  for (const partId of order) {
    const drawn = drawPartOnCanvas(joints, partId, canvasW, canvasH)
    if (!drawn) continue
    // Stamp cropped part back onto full canvas at its crop origin
    const def = PART_DEFS.find((p) => p.id === partId)
    const bind = def ? getJoint(joints, def.bindJoint) : null
    if (!bind) continue
    const originX = Math.round(bind.x - drawn.pivotLocal.x)
    const originY = Math.round(bind.y - drawn.pivotLocal.y)
    for (let y = 0; y < drawn.height; y++) {
      for (let x = 0; x < drawn.width; x++) {
        const si = (y * drawn.width + x) * 4
        const a = drawn.rgba[si + 3]
        if (a < 16) continue
        setPixel(
          full,
          canvasW,
          canvasH,
          originX + x,
          originY + y,
          drawn.rgba[si],
          drawn.rgba[si + 1],
          drawn.rgba[si + 2],
          a
        )
      }
    }
  }
  return full
}

async function ensurePuppet(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string }
): Promise<{ asset: GameAsset; puppet: CharacterPuppet }> {
  let { asset } = await getAsset(projectId, assetId)
  let blueprint =
    (options?.blueprintId
      ? asset.motionBlueprints?.find((b) => b.id === options.blueprintId)
      : asset.motionBlueprints?.[0]) ?? null

  if (!blueprint) {
    const ensured = await ensureMotionBlueprint(projectId, assetId, {
      blueprintId: options?.blueprintId
    })
    asset = ensured.asset
    blueprint = ensured.blueprint
  }

  if (asset.characterPuppet) {
    return { asset, puppet: asset.characterPuppet }
  }

  let authority =
    asset.guideImagePath ??
    asset.filePath ??
    asset.outlinePath ??
    asset.silhouettePath
  if (!authority) {
    // Brief can be approved before Scene — placeholder until Craft guide exists
    const dir = join(getGeneratedDir(projectId, assetId), 'bible')
    await mkdir(dir, { recursive: true })
    authority = join(dir, 'placeholder-authority.png')
    if (!(await pathExists(authority))) {
      await sharp({
        create: {
          width: blueprint.canvasWidth || 256,
          height: blueprint.canvasHeight || 256,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .png()
        .toFile(authority)
    }
  }

  const puppet = createRhBatterPuppetDraft({
    assetId,
    assetName: asset.name,
    blueprint,
    authorityImagePath: authority
  })
  const updated = await updateAsset(projectId, assetId, { characterPuppet: puppet })
  return { asset: updated, puppet }
}

export async function approveAnimationBrief(
  projectId: string,
  assetId: string,
  patch?: Partial<Pick<AnimationBrief, 'styleNote' | 'cameraNote'>>
): Promise<{ asset: GameAsset; puppet: CharacterPuppet }> {
  const { asset, puppet } = await ensurePuppet(projectId, assetId)
  const blueprint =
    asset.motionBlueprints?.find((b) => b.id === puppet.blueprintId) ??
    asset.motionBlueprints?.[0]
  const base: AnimationBrief = puppet.animationBrief ?? {
    styleNote: 'Retro pixel art / SNES-inspired silhouette',
    cameraNote: 'Umpire / catcher POV — locked camera toward pitcher',
    canvasWidth: blueprint?.canvasWidth ?? puppet.bindPose.canvasWidth,
    canvasHeight: blueprint?.canvasHeight ?? puppet.bindPose.canvasHeight
  }
  const nextBrief: AnimationBrief = {
    ...base,
    ...patch,
    canvasWidth: base.canvasWidth,
    canvasHeight: base.canvasHeight,
    approvedAt: new Date().toISOString()
  }
  const hasScene =
    !!asset.guideImagePath ||
    !!asset.filePath ||
    !!asset.silhouettePath ||
    !!asset.outlinePath
  const nextPuppet: CharacterPuppet = {
    ...puppet,
    animationBrief: nextBrief,
    status: hasScene ? 'needs_motion_proof' : 'needs_scene',
    updatedAt: new Date().toISOString()
  }
  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet }
}

export async function generateMannequinKit(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string }
): Promise<{
  asset: GameAsset
  puppet: CharacterPuppet
  partPaths: string[]
}> {
  const { asset, puppet } = await ensurePuppet(projectId, assetId, options)
  if (!puppet.animationBrief?.approvedAt && puppet.animationBrief) {
    throw new Error('Director must approve the Brief before drafting the mannequin.')
  }
  if (!asset.guideImagePath) {
    throw new Error('Craft guide required (scene lock). Set a guide in Craft Studio.')
  }

  const joints = puppet.bindPose.joints
  const canvasW = puppet.bindPose.canvasWidth
  const canvasH = puppet.bindPose.canvasHeight
  const dir = partsDir(projectId, assetId)
  await mkdir(dir, { recursive: true })

  const partPaths: string[] = []
  const pathMap: Partial<Record<PuppetPartId, string>> = {}
  const nextParts: PuppetPart[] = []

  for (const part of puppet.parts) {
    const drawn = drawPartOnCanvas(joints, part.id, canvasW, canvasH)
    if (!drawn) {
      throw new Error(`Could not draw mannequin part ${part.id} — check bind joints.`)
    }
    const outPath = join(dir, `mannequin-${part.id}.png`)
    await sharp(drawn.rgba, {
      raw: { width: drawn.width, height: drawn.height, channels: 4 }
    })
      .png()
      .toFile(outPath)

    partPaths.push(outPath)
    pathMap[part.id] = outPath
    nextParts.push({
      ...part,
      imagePath: outPath,
      pivot: { ...drawn.pivotLocal },
      status: 'ai_draft',
      notes: `mannequin capsule @ pivot (${Math.round(drawn.pivotLocal.x)},${Math.round(drawn.pivotLocal.y)})`
    })
  }

  // Full-body bind preview — Director approves THIS, not isolated crop thumbs.
  const bindRgba = renderFullMannequinRgba(joints, canvasW, canvasH, true)
  const bindPreviewPath = join(dir, 'mannequin-bind-preview.png')
  await sharp(bindRgba, { raw: { width: canvasW, height: canvasH, channels: 4 } })
    .png()
    .toFile(bindPreviewPath)

  const now = new Date().toISOString()
  const nextPuppet: CharacterPuppet = {
    ...puppet,
    parts: nextParts,
    mannequinKit: {
      generatedAt: now,
      bindPreviewPath,
      partPaths: pathMap
    },
    // Regenerating mannequin clears later gates that depended on old parts
    motionProofAt: undefined,
    poseSheetExport: undefined,
    rasterizedFrames: undefined,
    status: 'needs_mannequin',
    updatedAt: now
  }

  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet, partPaths }
}

export async function approveMannequinKit(
  projectId: string,
  assetId: string
): Promise<{ asset: GameAsset; puppet: CharacterPuppet }> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet?.mannequinKit?.generatedAt) {
    throw new Error('Draft the mannequin kit first.')
  }
  const missing = puppet.parts.filter((p) => !p.imagePath)
  if (missing.length) {
    throw new Error('Mannequin parts incomplete — regenerate the kit.')
  }

  const now = new Date().toISOString()
  const nextPuppet: CharacterPuppet = {
    ...puppet,
    mannequinKit: {
      ...puppet.mannequinKit,
      approvedAt: now
    },
    parts: puppet.parts.map((p) => ({ ...p, status: 'approved' as const })),
    status: 'needs_motion_proof',
    updatedAt: now
  }
  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet }
}

export async function markMotionProof(
  projectId: string,
  assetId: string
): Promise<{ asset: GameAsset; puppet: CharacterPuppet }> {
  const { asset, puppet } = await ensurePuppet(projectId, assetId)
  const hasBase =
    !!asset.filePath || !!asset.silhouettePath || !!asset.outlinePath || !!asset.guideImagePath
  if (!hasBase) {
    throw new Error('Craft a base sprite first (guide → silhouette/paint in Craft Studio).')
  }
  // Motion proof = Director scrubbed the Motion Blueprint skeleton.
  const now = new Date().toISOString()
  const nextPuppet: CharacterPuppet = {
    ...puppet,
    motionProofAt: now,
    poseSheetExport: undefined,
    status: 'needs_export',
    updatedAt: now
  }
  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet }
}

/** Redraw one procedural part (Director fix without full regen). */
export async function redrawMannequinPart(
  projectId: string,
  assetId: string,
  partId: PuppetPartId
): Promise<{ asset: GameAsset; puppet: CharacterPuppet; partPath: string }> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet) throw new Error('No puppet.')
  const part = puppet.parts.find((p) => p.id === partId)
  if (!part) throw new Error(`Unknown part: ${partId}`)

  const joints = puppet.bindPose.joints
  const canvasW = puppet.bindPose.canvasWidth
  const canvasH = puppet.bindPose.canvasHeight
  const drawn = drawPartOnCanvas(joints, partId, canvasW, canvasH)
  if (!drawn) throw new Error(`Could not draw ${partId}.`)

  const dir = partsDir(projectId, assetId)
  await mkdir(dir, { recursive: true })
  const outPath = join(dir, `mannequin-${partId}.png`)
  await sharp(drawn.rgba, {
    raw: { width: drawn.width, height: drawn.height, channels: 4 }
  })
    .png()
    .toFile(outPath)

  const nextParts = puppet.parts.map((p) =>
    p.id === partId
      ? {
          ...p,
          imagePath: outPath,
          pivot: { ...drawn.pivotLocal },
          status: 'ai_draft' as const,
          notes: `mannequin capsule (redraw) @ pivot (${Math.round(drawn.pivotLocal.x)},${Math.round(drawn.pivotLocal.y)})`
        }
      : p
  )
  const pathMap = { ...puppet.mannequinKit?.partPaths, [partId]: outPath }
  const nextPuppet: CharacterPuppet = {
    ...puppet,
    parts: nextParts,
    mannequinKit: {
      generatedAt: puppet.mannequinKit?.generatedAt ?? new Date().toISOString(),
      approvedAt: undefined,
      partPaths: pathMap
    },
    motionProofAt: undefined,
    poseSheetExport: undefined,
    rasterizedFrames: undefined,
    status: 'needs_mannequin',
    updatedAt: new Date().toISOString()
  }
  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet, partPath: outPath }
}

/** Director replaces a part PNG (Aseprite polish or hand fix). Keeps existing pivot unless image size changes a lot. */
export async function replacePuppetPartImage(
  projectId: string,
  assetId: string,
  partId: PuppetPartId,
  sourcePath: string
): Promise<{ asset: GameAsset; puppet: CharacterPuppet; partPath: string }> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet) throw new Error('No puppet.')
  const part = puppet.parts.find((p) => p.id === partId)
  if (!part) throw new Error(`Unknown part: ${partId}`)
  if (!(await pathExists(sourcePath))) throw new Error('Source image not found.')

  const dir = partsDir(projectId, assetId)
  await mkdir(dir, { recursive: true })
  const outPath = join(dir, `mannequin-${partId}.png`)

  const meta = await sharp(sourcePath).ensureAlpha().metadata()
  const pw = meta.width ?? 1
  const ph = meta.height ?? 1
  await sharp(sourcePath)
    .ensureAlpha()
    .png()
    .toFile(outPath)

  // Keep pivot if it still sits inside the new image; else center
  let pivot = part.pivot
  if (pivot.x < 0 || pivot.y < 0 || pivot.x >= pw || pivot.y >= ph) {
    pivot = { x: pw / 2, y: ph / 2 }
  }

  const nextParts = puppet.parts.map((p) =>
    p.id === partId
      ? {
          ...p,
          imagePath: outPath,
          pivot,
          status: 'ai_draft' as const,
          notes: `Director replace ${pw}×${ph}`
        }
      : p
  )
  const pathMap = { ...puppet.mannequinKit?.partPaths, [partId]: outPath }
  const nextPuppet: CharacterPuppet = {
    ...puppet,
    parts: nextParts,
    mannequinKit: {
      generatedAt: puppet.mannequinKit?.generatedAt ?? new Date().toISOString(),
      approvedAt: undefined,
      partPaths: pathMap
    },
    motionProofAt: undefined,
    poseSheetExport: undefined,
    rasterizedFrames: undefined,
    status: 'needs_mannequin',
    updatedAt: new Date().toISOString()
  }
  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet, partPath: outPath }
}

export function productionGateForAsset(asset: GameAsset) {
  const puppet = asset.characterPuppet
  if (!puppet) return null
  return resolveProductionGate(puppet, { hasGuide: !!asset.guideImagePath })
}
