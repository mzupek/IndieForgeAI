/**
 * Part kit from the approved Skin plate (characterBible).
 *
 * Slices costume pixels into mannequin part slots. Auto-slice is a draft;
 * Director can claim rectangles to correct ownership (bat vs head), then re-extract.
 */

import { mkdir, access, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import { shell } from 'electron'
import type { CharacterPuppet, GameAsset, PuppetPart, PuppetPartId } from '@shared/types/project'
import { validateCharacterPuppet } from '@shared/motion/characterPuppet'
import {
  assignExclusivePartLabels,
  claimRectInLabels,
  estimateJointsToPixelsDrift,
  extractExclusivePart,
  jointAimDeg
} from '@shared/motion/puppetCutoutRegions'
import { getJoint } from '@shared/motion/rhBatterSwing'
import { getGeneratedDir } from '../storage/filePaths'
import { getAsset, updateAsset } from '../storage/assetStore'

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

function ownershipPath(projectId: string, assetId: string) {
  return join(partsDir(projectId, assetId), 'ownership.bin')
}

async function loadBibleRgba(puppet: CharacterPuppet, biblePath: string, blueprintCanvas: { w: number; h: number }) {
  const canvasW = puppet.bindPose.canvasWidth || blueprintCanvas.w
  const canvasH = puppet.bindPose.canvasHeight || blueprintCanvas.h
  return sharp(biblePath)
    .resize(canvasW, canvasH, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
}

async function saveOwnership(
  projectId: string,
  assetId: string,
  labels: Int16Array,
  width: number,
  height: number
) {
  const dir = partsDir(projectId, assetId)
  await mkdir(dir, { recursive: true })
  const header = Buffer.alloc(8)
  header.writeUInt32LE(width, 0)
  header.writeUInt32LE(height, 4)
  const body = Buffer.from(labels.buffer, labels.byteOffset, labels.byteLength)
  await writeFile(ownershipPath(projectId, assetId), Buffer.concat([header, body]))
}

async function loadOwnership(
  projectId: string,
  assetId: string
): Promise<{ labels: Int16Array; width: number; height: number } | null> {
  const p = ownershipPath(projectId, assetId)
  if (!(await pathExists(p))) return null
  const buf = await readFile(p)
  if (buf.length < 8) return null
  const width = buf.readUInt32LE(0)
  const height = buf.readUInt32LE(1 * 4)
  const expected = width * height * 2
  if (buf.length < 8 + expected) return null
  const labels = new Int16Array(buf.buffer, buf.byteOffset + 8, width * height)
  return { labels: new Int16Array(labels), width, height }
}

async function extractAllFromLabels(options: {
  projectId: string
  assetId: string
  puppet: CharacterPuppet
  rgba: Buffer
  width: number
  height: number
  labels: Int16Array
  joints: CharacterPuppet['bindPose']['joints']
}): Promise<{ nextParts: PuppetPart[]; partPaths: string[] }> {
  const { projectId, assetId, puppet, rgba, width, height, labels, joints } = options
  const dir = partsDir(projectId, assetId)
  await mkdir(dir, { recursive: true })

  const partPaths: string[] = []
  const nextParts: PuppetPart[] = []

  for (let i = 0; i < puppet.parts.length; i++) {
    const part = puppet.parts[i]
    const bind = getJoint(joints, part.bindJoint)
    if (!bind) throw new Error(`Missing bind joint ${part.bindJoint} for part ${part.id}`)

    const extracted = extractExclusivePart({
      partId: part.id,
      partIndex: i,
      labels,
      rgba,
      width,
      height,
      bind
    })
    if (!extracted) {
      throw new Error(
        `No pixels for part ${part.id}. Claim a region on the skin for this part, or re-slice.`
      )
    }

    const outPath = join(dir, `part-${part.id}.png`)
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
      notes: `Cut from skin @ (${extracted.x},${extracted.y}) ${extracted.width}×${extracted.height}; bindAim=${bindAim != null ? Math.round(bindAim) : 'n/a'}°`
    })
  }

  return { nextParts, partPaths }
}

/** Auto-slice exclusive parts from the approved character bible. */
export async function generatePuppetPartKit(
  projectId: string,
  assetId: string
): Promise<{
  asset: GameAsset
  puppet: CharacterPuppet
  sheetPath: string
  partPaths: string[]
  issues: ReturnType<typeof validateCharacterPuppet>
}> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet) throw new Error('No puppet — complete Brief → Mannequin first.')

  if (!puppet.motionProofAt) {
    throw new Error('Director must approve motion proof before slicing Skin into parts.')
  }
  const biblePath = puppet.characterBible?.imagePath
  if (!biblePath || !(await pathExists(biblePath))) {
    throw new Error('Approved Skin image required before part cuts.')
  }
  if (!puppet.characterBible?.approvedAt) {
    throw new Error('Approve Skin before slicing parts.')
  }

  const blueprint =
    asset.motionBlueprints?.find((b) => b.id === puppet.blueprintId) ??
    asset.motionBlueprints?.[0]
  if (!blueprint) throw new Error('Motion Blueprint required.')

  const sourceBuf = await loadBibleRgba(puppet, biblePath, {
    w: blueprint.canvasWidth,
    h: blueprint.canvasHeight
  })

  const joints = puppet.bindPose.joints
  const drift = estimateJointsToPixelsDrift(
    joints,
    sourceBuf.data,
    sourceBuf.info.width,
    sourceBuf.info.height
  )

  const partIds = puppet.parts.map((p) => p.id)
  const labels = assignExclusivePartLabels(
    sourceBuf.data,
    sourceBuf.info.width,
    sourceBuf.info.height,
    joints,
    partIds,
    drift
  )

  await saveOwnership(projectId, assetId, labels, sourceBuf.info.width, sourceBuf.info.height)

  const { nextParts, partPaths } = await extractAllFromLabels({
    projectId,
    assetId,
    puppet,
    rgba: sourceBuf.data,
    width: sourceBuf.info.width,
    height: sourceBuf.info.height,
    labels,
    joints
  })

  const nextPuppet: CharacterPuppet = {
    ...puppet,
    parts: nextParts,
    partSheetPath: biblePath,
    bindPose: {
      ...puppet.bindPose,
      authorityImagePath: biblePath
    },
    // Clear mannequin proof frames — final ship must re-rasterize skinned parts
    rasterizedFrames: undefined,
    status: 'parts_ready',
    updatedAt: new Date().toISOString()
  }

  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return {
    asset: updated,
    puppet: nextPuppet,
    sheetPath: biblePath,
    partPaths,
    issues: validateCharacterPuppet(nextPuppet, blueprint)
  }
}

/**
 * User refine: claim a rectangle of opaque bible pixels for one part, then re-extract all.
 */
export async function claimPartRegion(
  projectId: string,
  assetId: string,
  partId: PuppetPartId,
  rect: { x: number; y: number; width: number; height: number }
): Promise<{
  asset: GameAsset
  puppet: CharacterPuppet
  partPaths: string[]
}> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet) throw new Error('No puppet on asset.')
  const biblePath = puppet.characterBible?.imagePath
  if (!biblePath) throw new Error('No character bible.')

  const blueprint =
    asset.motionBlueprints?.find((b) => b.id === puppet.blueprintId) ??
    asset.motionBlueprints?.[0]
  if (!blueprint) throw new Error('Motion Blueprint required.')

  const partIndex = puppet.parts.findIndex((p) => p.id === partId)
  if (partIndex < 0) throw new Error(`Unknown part: ${partId}`)

  const sourceBuf = await loadBibleRgba(puppet, biblePath, {
    w: blueprint.canvasWidth,
    h: blueprint.canvasHeight
  })

  let labels =
    (await loadOwnership(projectId, assetId))?.labels ??
    assignExclusivePartLabels(
      sourceBuf.data,
      sourceBuf.info.width,
      sourceBuf.info.height,
      puppet.bindPose.joints,
      puppet.parts.map((p) => p.id),
      estimateJointsToPixelsDrift(
        puppet.bindPose.joints,
        sourceBuf.data,
        sourceBuf.info.width,
        sourceBuf.info.height
      )
    )

  // Ensure label buffer matches canvas size
  if (labels.length !== sourceBuf.info.width * sourceBuf.info.height) {
    labels = assignExclusivePartLabels(
      sourceBuf.data,
      sourceBuf.info.width,
      sourceBuf.info.height,
      puppet.bindPose.joints,
      puppet.parts.map((p) => p.id),
      estimateJointsToPixelsDrift(
        puppet.bindPose.joints,
        sourceBuf.data,
        sourceBuf.info.width,
        sourceBuf.info.height
      )
    )
  }

  claimRectInLabels(
    labels,
    sourceBuf.data,
    sourceBuf.info.width,
    sourceBuf.info.height,
    partIndex,
    rect
  )

  await saveOwnership(projectId, assetId, labels, sourceBuf.info.width, sourceBuf.info.height)

  const { nextParts, partPaths } = await extractAllFromLabels({
    projectId,
    assetId,
    puppet,
    rgba: sourceBuf.data,
    width: sourceBuf.info.width,
    height: sourceBuf.info.height,
    labels,
    joints: puppet.bindPose.joints
  })

  const nextPuppet: CharacterPuppet = {
    ...puppet,
    parts: nextParts,
    status: 'parts_ready',
    updatedAt: new Date().toISOString()
  }
  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet, partPaths }
}

export async function revealPuppetPartsDir(
  projectId: string,
  assetId: string
): Promise<{ path: string }> {
  const dir = partsDir(projectId, assetId)
  await mkdir(dir, { recursive: true })
  await shell.openPath(dir)
  return { path: dir }
}

export async function approvePuppetPartKit(
  projectId: string,
  assetId: string
): Promise<{ asset: GameAsset; puppet: CharacterPuppet }> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet) throw new Error('No puppet on asset.')
  const ready = puppet.parts.filter((p) => p.imagePath)
  if (ready.length < puppet.parts.length) {
    throw new Error('Generate the part kit first (missing part PNGs).')
  }

  const nextPuppet: CharacterPuppet = {
    ...puppet,
    status: 'parts_ready',
    parts: puppet.parts.map((p) => ({
      ...p,
      status: p.imagePath ? ('approved' as const) : p.status
    })),
    updatedAt: new Date().toISOString()
  }
  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet }
}
