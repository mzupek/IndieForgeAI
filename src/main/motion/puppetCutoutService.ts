/**
 * Draft cutouts from Frame 0 + rasterize puppet timeline (no OpenAI).
 */

import { mkdir } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import type {
  CharacterPuppet,
  GameAsset,
  MotionBlueprint,
  PuppetPart
} from '@shared/types/project'
import {
  resolvePartDrawOrder,
  resolveProductionGate,
  samplePuppetJoints,
  validateCharacterPuppet
} from '@shared/motion/characterPuppet'
import {
  assignExclusivePartLabels,
  estimateJointsToPixelsDrift,
  extractExclusivePart,
  jointAimDeg,
  shortestAngleDeltaDeg
} from '@shared/motion/puppetCutoutRegions'
import { getJoint, repairFollowThroughWrap } from '@shared/motion/rhBatterSwing'
import { renderFullMannequinRgba } from './mannequinKitService'
import { getGeneratedDir } from '../storage/filePaths'
import { getAsset, updateAsset } from '../storage/assetStore'

async function renderRotatedPartOverlay(options: {
  partPath: string
  pivotLocal: { x: number; y: number }
  rotationDeg: number
}): Promise<{ buffer: Buffer; width: number; height: number; centerX: number; centerY: number }> {
  const { partPath, pivotLocal, rotationDeg } = options
  const src = sharp(partPath).ensureAlpha()
  const meta = await src.metadata()
  const w = meta.width ?? 1
  const h = meta.height ?? 1
  const partBuf = await src.png().toBuffer()

  // Bind pose / tiny deltas: skip rotate expand — place by pivot directly.
  if (Math.abs(rotationDeg) < 0.05) {
    return {
      buffer: partBuf,
      width: w,
      height: h,
      centerX: pivotLocal.x,
      centerY: pivotLocal.y
    }
  }

  // Canvas large enough that rotation around pivot stays inside.
  const diag = Math.ceil(Math.hypot(w, h) * 2) + 4
  const center = Math.floor(diag / 2)
  const left = Math.round(center - pivotLocal.x)
  const top = Math.round(center - pivotLocal.y)

  const placed = await sharp({
    create: {
      width: diag,
      height: diag,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: partBuf, left, top }])
    .png()
    .toBuffer()

  // sharp.rotate expands; pivot stays at image center when we placed it there.
  const rotated = await sharp(placed)
    .rotate(rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const rmeta = await sharp(rotated).metadata()
  const rw = rmeta.width ?? diag
  const rh = rmeta.height ?? diag
  return {
    buffer: rotated,
    width: rw,
    height: rh,
    centerX: rw / 2,
    centerY: rh / 2
  }
}

/**
 * Sharp requires each composite input to fit inside the destination.
 * Rotated part buffers are often larger than 256×256 — clip to canvas intersection.
 */
async function clipOverlayToCanvas(options: {
  overlay: { buffer: Buffer; width: number; height: number; centerX: number; centerY: number }
  bindX: number
  bindY: number
  canvasW: number
  canvasH: number
}): Promise<sharp.OverlayOptions | null> {
  const { overlay, bindX, bindY, canvasW, canvasH } = options
  let left = Math.round(bindX - overlay.centerX)
  let top = Math.round(bindY - overlay.centerY)
  let srcLeft = 0
  let srcTop = 0
  let srcW = overlay.width
  let srcH = overlay.height

  if (left < 0) {
    srcLeft = -left
    srcW -= srcLeft
    left = 0
  }
  if (top < 0) {
    srcTop = -top
    srcH -= srcTop
    top = 0
  }
  if (left + srcW > canvasW) srcW = canvasW - left
  if (top + srcH > canvasH) srcH = canvasH - top

  if (srcW <= 0 || srcH <= 0) return null
  if (srcLeft >= overlay.width || srcTop >= overlay.height) return null
  srcW = Math.min(srcW, overlay.width - srcLeft)
  srcH = Math.min(srcH, overlay.height - srcTop)
  if (srcW <= 0 || srcH <= 0) return null

  // Already fully inside and small enough — no extract needed.
  if (srcLeft === 0 && srcTop === 0 && srcW === overlay.width && srcH === overlay.height) {
    if (overlay.width <= canvasW && overlay.height <= canvasH) {
      return { input: overlay.buffer, left, top }
    }
  }

  const clipped = await sharp(overlay.buffer)
    .extract({
      left: Math.max(0, Math.floor(srcLeft)),
      top: Math.max(0, Math.floor(srcTop)),
      width: Math.max(1, Math.floor(srcW)),
      height: Math.max(1, Math.floor(srcH))
    })
    .png()
    .toBuffer()

  return { input: clipped, left, top }
}

function batInFrontForSample(
  blueprint: MotionBlueprint,
  phaseHint: string
): boolean {
  const phase = blueprint.phases.find((p) => p.name === phaseHint)
  return phase?.constraints.batInFrontOfBody !== false
}

/** Crop authority sprite into part PNGs; update puppet.parts. */
export async function draftPuppetCutouts(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string }
): Promise<{
  asset: GameAsset
  puppet: CharacterPuppet
  partPaths: string[]
  issues: ReturnType<typeof validateCharacterPuppet>
}> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet) throw new Error('Create a puppet draft first.')

  const blueprint =
    (options?.blueprintId
      ? asset.motionBlueprints?.find((b) => b.id === options.blueprintId)
      : asset.motionBlueprints?.find((b) => b.id === puppet.blueprintId)) ??
    asset.motionBlueprints?.[0]
  if (!blueprint) throw new Error('Motion Blueprint not found.')

  const authority = puppet.bindPose.authorityImagePath
  const authMeta = await sharp(authority).metadata()
  const canvasW = puppet.bindPose.canvasWidth || authMeta.width || blueprint.canvasWidth
  const canvasH = puppet.bindPose.canvasHeight || authMeta.height || blueprint.canvasHeight

  // Resize authority to bind canvas if needed so joint coords match pixels.
  let sourceBuf = await sharp(authority)
    .resize(canvasW, canvasH, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // AI paint often sits away from blueprint joints — expand crops by that drift.
  const drift = estimateJointsToPixelsDrift(
    puppet.bindPose.joints,
    sourceBuf.data,
    sourceBuf.info.width,
    sourceBuf.info.height
  )
  const partsDir = join(getGeneratedDir(projectId, assetId), 'puppet-parts')
  await mkdir(partsDir, { recursive: true })

  const joints = puppet.bindPose.joints
  const partIds = puppet.parts.map((p) => p.id)
  const labels = assignExclusivePartLabels(
    sourceBuf.data,
    sourceBuf.info.width,
    sourceBuf.info.height,
    joints,
    partIds,
    drift
  )

  const nextParts: PuppetPart[] = []
  const partPaths: string[] = []

  for (let i = 0; i < puppet.parts.length; i++) {
    const part = puppet.parts[i]
    const bind = getJoint(joints, part.bindJoint)
    if (!bind) {
      throw new Error(`Missing bind joint ${part.bindJoint} for part ${part.id}`)
    }

    const extracted = extractExclusivePart({
      partId: part.id,
      partIndex: i,
      labels,
      rgba: sourceBuf.data,
      width: sourceBuf.info.width,
      height: sourceBuf.info.height,
      bind
    })
    if (!extracted) {
      throw new Error(
        `No exclusive pixels for part ${part.id}. Check Frame 0 authority vs joints (drift=${Math.round(drift.x)},${Math.round(drift.y)}).`
      )
    }

    const outPath = join(partsDir, `part-${part.id}.png`)
    await sharp(extracted.rgba, {
      raw: { width: extracted.width, height: extracted.height, channels: 4 }
    })
      .png()
      .toFile(outPath)

    const bindAim = jointAimDeg(joints, part.bindJoint, part.aimJoint)
    partPaths.push(outPath)
    nextParts.push({
      ...part,
      imagePath: outPath,
      pivot: { ...extracted.pivotLocal },
      status: 'ai_draft',
      notes: `Exclusive mask @ (${extracted.x},${extracted.y}) ${extracted.width}×${extracted.height}; drift=(${Math.round(drift.x)},${Math.round(drift.y)}); bindAim=${bindAim != null ? Math.round(bindAim) : 'n/a'}°`
    })
  }

  const nextPuppet: CharacterPuppet = {
    ...puppet,
    parts: nextParts,
    status: 'parts_ready',
    updatedAt: new Date().toISOString()
  }

  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return {
    asset: updated,
    puppet: nextPuppet,
    partPaths,
    issues: validateCharacterPuppet(nextPuppet, blueprint)
  }
}

/** Rasterize all timeline frames by placing cutouts at lerped joints. */
export async function rasterizePuppetTimeline(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string }
): Promise<{
  asset: GameAsset
  puppet: CharacterPuppet
  framePaths: string[]
  designPaths: string[]
}> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet) throw new Error('Create a puppet draft first.')
  const ready = puppet.parts.filter((p) => p.imagePath)
  if (!ready.length) {
    throw new Error('Draft the mannequin kit first (no part PNGs).')
  }
  if (ready.length < puppet.parts.length) {
    throw new Error(
      `Part kit incomplete (${ready.length}/${puppet.parts.length}). Regenerate part kit before rasterize.`
    )
  }

  let blueprint =
    (options?.blueprintId
      ? asset.motionBlueprints?.find((b) => b.id === options.blueprintId)
      : asset.motionBlueprints?.find((b) => b.id === puppet.blueprintId)) ??
    asset.motionBlueprints?.[0]
  if (!blueprint) throw new Error('Motion Blueprint not found.')

  const repaired = repairFollowThroughWrap(blueprint)
  if (repaired.repaired) {
    blueprint = repaired.blueprint
    const list = [...(asset.motionBlueprints ?? [])]
    const idx = list.findIndex((b) => b.id === blueprint!.id)
    if (idx >= 0) list[idx] = blueprint
    await updateAsset(projectId, assetId, { motionBlueprints: list })
  }

  const w = puppet.bindPose.canvasWidth || blueprint.canvasWidth
  const h = puppet.bindPose.canvasHeight || blueprint.canvasHeight
  const outDir = join(getGeneratedDir(projectId, assetId), 'puppet-frames')
  await mkdir(outDir, { recursive: true })

  const bindJoints = puppet.bindPose.joints
  const framePaths: string[] = []
  const designPaths: string[] = []
  const useFullMannequin =
    puppet.thesis?.mode === 'pose_sheet_aseprite' ||
    puppet.parts.some((p) => p.notes?.includes('mannequin'))

  for (let fi = 0; fi < puppet.timeline.frameCount; fi++) {
    const sample = samplePuppetJoints(puppet, blueprint, fi)
    const batInFront = batInFrontForSample(blueprint, sample.phaseHint)
    const framePath = join(outDir, `puppet_frame_${fi}.png`)

    if (useFullMannequin) {
      // Pose-sheet path: redraw connected figure from live joints (not cropped part composites).
      const rgba = renderFullMannequinRgba(sample.joints, w, h, batInFront)
      await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
        .png()
        .toFile(framePath)
    } else {
      const order = resolvePartDrawOrder(puppet, {
        batInFrontOfBody: batInFront,
        frameIndex: fi
      })

      const overlays: sharp.OverlayOptions[] = []

      for (const part of order) {
        if (!part.imagePath) continue
        const bind = getJoint(sample.joints, part.bindJoint)
        if (!bind) continue

        const bindAngle = jointAimDeg(bindJoints, part.bindJoint, part.aimJoint)
        const liveAngle = jointAimDeg(sample.joints, part.bindJoint, part.aimJoint)
        let rotationDeg = 0
        if (bindAngle != null && liveAngle != null) {
          rotationDeg = shortestAngleDeltaDeg(bindAngle, liveAngle)
        }

        if (part.id === 'torso' || part.id === 'head') {
          if (Math.abs(rotationDeg) < 12) rotationDeg = 0
        }

        const overlay = await renderRotatedPartOverlay({
          partPath: part.imagePath,
          pivotLocal: part.pivot,
          rotationDeg
        })

        const clipped = await clipOverlayToCanvas({
          overlay,
          bindX: bind.x,
          bindY: bind.y,
          canvasW: w,
          canvasH: h
        })
        if (clipped) overlays.push(clipped)
      }

      await sharp({
        create: {
          width: w,
          height: h,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite(overlays)
        .png()
        .toFile(framePath)
    }

    framePaths.push(framePath)

    // Also write into design frames so the existing strip can preview them (optional dual write).
    const designPath = join(getGeneratedDir(projectId, assetId), 'frames', `frame_${fi}_puppet.png`)
    await mkdir(join(getGeneratedDir(projectId, assetId), 'frames'), { recursive: true })
    await sharp(framePath).png().toFile(designPath)
    designPaths.push(designPath)
  }

  const draft: CharacterPuppet = {
    ...puppet,
    rasterizedFrames: framePaths,
    updatedAt: new Date().toISOString()
  }
  const nextPuppet: CharacterPuppet = {
    ...draft,
    status: resolveProductionGate(draft, { hasGuide: true })
  }
  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })

  return { asset: updated, puppet: nextPuppet, framePaths, designPaths }
}
