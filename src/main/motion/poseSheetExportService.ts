/**
 * Aseprite handoff:
 *  - BASE = Craft character sprite (silhouette / paint from guide) — not the stadium photo
 *  - FRAMES = Motion Blueprint skeleton poses (motion path to apply to that base)
 */

import { copyFile, mkdir, writeFile, access } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import { shell } from 'electron'
import type { CharacterPuppet, GameAsset, PoseSheetExport } from '@shared/types/project'
import { samplePuppetJoints } from '@shared/motion/characterPuppet'
import { buildSkeletonFrameSvg } from '@shared/motion/skeletonFrameSvg'
import { repairFollowThroughWrap } from '@shared/motion/rhBatterSwing'
import { getGeneratedDir } from '../storage/filePaths'
import { getAsset, updateAsset } from '../storage/assetStore'
import { createRhBatterPuppetDraft } from '@shared/motion/characterPuppet'
import { ensureMotionBlueprint } from '../storage/assetStore'

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function safeStem(name: string): string {
  return name.replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'animation'
}

async function packHorizontalStrip(
  framePaths: string[],
  frameW: number,
  frameH: number,
  outPath: string
): Promise<void> {
  const composites: sharp.OverlayOptions[] = []
  for (let i = 0; i < framePaths.length; i++) {
    const buf = await sharp(framePaths[i])
      .resize(frameW, frameH, {
        fit: 'fill',
        background: { r: 26, g: 31, b: 42, alpha: 1 }
      })
      .png()
      .toBuffer()
    composites.push({ input: buf, left: i * frameW, top: 0 })
  }
  await sharp({
    create: {
      width: frameW * framePaths.length,
      height: frameH,
      channels: 4,
      background: { r: 26, g: 31, b: 42, alpha: 1 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outPath)
}

async function ensurePuppetForExport(
  projectId: string,
  assetId: string
): Promise<{ asset: GameAsset; puppet: CharacterPuppet }> {
  let { asset } = await getAsset(projectId, assetId)
  let blueprint = asset.motionBlueprints?.[0]
  if (!blueprint) {
    const ensured = await ensureMotionBlueprint(projectId, assetId)
    asset = ensured.asset
    blueprint = ensured.blueprint
  }
  if (asset.characterPuppet) {
    return { asset, puppet: asset.characterPuppet }
  }
  const authority =
    asset.filePath || asset.silhouettePath || asset.outlinePath || asset.guideImagePath
  if (!authority) throw new Error('Craft character required — save silhouette/paint from the guide.')
  const puppet = createRhBatterPuppetDraft({
    assetId,
    assetName: asset.name,
    blueprint,
    authorityImagePath: authority
  })
  const updated = await updateAsset(projectId, assetId, { characterPuppet: puppet })
  return { asset: updated, puppet }
}

/** Prefer Craft character art over the raw guide photo. */
async function resolveBaseSpritePath(asset: GameAsset): Promise<{
  basePath: string
  source: 'paint' | 'silhouette' | 'outline' | 'guide_fallback'
  guidePath: string | null
}> {
  const guide = asset.guideImagePath && (await pathExists(asset.guideImagePath))
    ? asset.guideImagePath
    : null
  if (asset.filePath && (await pathExists(asset.filePath))) {
    return { basePath: asset.filePath, source: 'paint', guidePath: guide }
  }
  if (asset.silhouettePath && (await pathExists(asset.silhouettePath))) {
    return { basePath: asset.silhouettePath, source: 'silhouette', guidePath: guide }
  }
  if (asset.outlinePath && (await pathExists(asset.outlinePath))) {
    return { basePath: asset.outlinePath, source: 'outline', guidePath: guide }
  }
  if (guide) {
    return { basePath: guide, source: 'guide_fallback', guidePath: guide }
  }
  throw new Error(
    'No Craft base sprite — in Craft Studio, save a silhouette or paint from the guide character.'
  )
}

/**
 * Export: guide as base + skeleton motion frames for Aseprite.
 */
export async function exportPoseSheetForAseprite(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string; openFolder?: boolean; showAnchors?: boolean }
): Promise<{
  asset: GameAsset
  puppet: CharacterPuppet
  export: PoseSheetExport
}> {
  const { asset: baseAsset, puppet: basePuppet } = await ensurePuppetForExport(projectId, assetId)
  let asset = baseAsset
  let puppet = basePuppet

  const { basePath, source: baseSource, guidePath } = await resolveBaseSpritePath(asset)
  if (!puppet.motionProofAt) {
    throw new Error('Approve motion (scrub the blueprint skeleton) before export.')
  }

  let blueprint =
    (options?.blueprintId
      ? asset.motionBlueprints?.find((b) => b.id === options.blueprintId)
      : asset.motionBlueprints?.find((b) => b.id === puppet.blueprintId)) ??
    asset.motionBlueprints?.[0]
  if (!blueprint) throw new Error('Motion Blueprint required.')

  const repaired = repairFollowThroughWrap(blueprint)
  if (repaired.repaired) {
    blueprint = repaired.blueprint
    const list = [...(asset.motionBlueprints ?? [])]
    const idx = list.findIndex((b) => b.id === blueprint!.id)
    if (idx >= 0) list[idx] = blueprint
    asset = await updateAsset(projectId, assetId, { motionBlueprints: list })
  }

  const w = blueprint.canvasWidth || puppet.bindPose.canvasWidth || 256
  const h = blueprint.canvasHeight || puppet.bindPose.canvasHeight || 256
  const stem = safeStem(asset.name)
  const dir = join(getGeneratedDir(projectId, assetId), 'aseprite-pose-export')
  const framesDir = join(dir, 'frames')
  await mkdir(framesDir, { recursive: true })

  // 1) BASE = Craft character sprite (from guide) — what you animate against the motion path
  const bindExportPath = join(dir, `${stem}_01_BASE_SPRITE.png`)
  await sharp(basePath)
    .resize(w, h, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .ensureAlpha()
    .png()
    .toFile(bindExportPath)

  // Camera / depth reference (guide photo) — separate from BASE when available
  if (guidePath && guidePath !== basePath) {
    const camRef = join(dir, `${stem}_00_CAMERA_REFERENCE.png`)
    await sharp(guidePath)
      .resize(w, h, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .ensureAlpha()
      .png()
      .toFile(camRef)
  }

  // 2) MOTION PATH = blueprint skeleton per timeline frame
  const frameCount = puppet.timeline.frameCount
  const exportedFrames: string[] = []
  const showAnchors = options?.showAnchors !== false

  for (let i = 0; i < frameCount; i++) {
    const sample = samplePuppetJoints(puppet, blueprint, i)
    const svg = buildSkeletonFrameSvg({
      width: w,
      height: h,
      joints: sample.joints,
      label: `Frame ${i + 1}`,
      subtitle: sample.phaseHint.replace(/_/g, ' '),
      showAnchors,
      transparent: false
    })
    const dest = join(framesDir, `${stem}_motion_${String(i).padStart(2, '0')}.png`)
    await sharp(Buffer.from(svg)).png().toFile(dest)
    exportedFrames.push(dest)

    // Transparent skeleton overlay (onion-skin on top of BASE_GUIDE in Aseprite)
    const svgClear = buildSkeletonFrameSvg({
      width: w,
      height: h,
      joints: sample.joints,
      label: '',
      showAnchors: false,
      transparent: true
    })
    const overlayDest = join(
      framesDir,
      `${stem}_motion_overlay_${String(i).padStart(2, '0')}.png`
    )
    await sharp(Buffer.from(svgClear)).png().toFile(overlayDest)
  }

  const stripPath = join(dir, `${stem}_02_MOTION_SKELETON_STRIP.png`)
  await packHorizontalStrip(exportedFrames, w, h, stripPath)

  const readmePath = join(dir, 'README_ASEPRITE.txt')
  await writeFile(
    readmePath,
    [
      `Aseprite handoff — ${asset.name}`,
      '',
      'WHAT YOU GET',
      '============',
      '',
      `1) ${stem}_01_BASE_SPRITE.png`,
      `   Craft character (${baseSource}) — the BASE sprite built from your guide.`,
      '   Duplicate this for each frame; reshape to match the motion guide.',
      '',
      `2) frames/${stem}_motion_XX.png`,
      '   Motion Blueprint SKELETON — the MOTION GUIDE (idle → follow-through).',
      '',
      `3) frames/${stem}_motion_overlay_XX.png`,
      '   Transparent skeleton — onion-skin ON TOP of your base sprite.',
      '',
      `4) ${stem}_02_MOTION_SKELETON_STRIP.png`,
      '   Horizontal strip of skeleton frames for quick import.',
      '',
      'WORKFLOW',
      '========',
      `1. Open *_01_BASE_SPRITE.png in Aseprite (${w}×${h}).`,
      '2. Import frames/*_motion_overlay_*.png (or the MOTION_SKELETON_STRIP).',
      '3. For each frame: keep the same character, move limbs/bat to match the',
      '   skeleton motion guide.',
      '4. Hide skeleton layers. Export sprite sheet for Godot (nearest).',
      '',
      `Frames: ${exportedFrames.length}  ·  Size: ${w}×${h}px  ·  Base: ${baseSource}`,
      '',
      'Indie Forge owns the Motion Blueprint. You apply it to the base in Aseprite.',
      ''
    ].join('\n'),
    'utf-8'
  )

  const now = new Date().toISOString()
  const poseExport: PoseSheetExport = {
    exportedAt: now,
    dir,
    bindGuidePath: bindExportPath,
    stripPath,
    framePaths: exportedFrames,
    readmePath
  }

  const nextPuppet: CharacterPuppet = {
    ...puppet,
    poseSheetExport: poseExport,
    // Keep skeleton frame paths as rasterizedFrames for studio scrub preview
    rasterizedFrames: exportedFrames,
    status: 'ready',
    thesis: {
      mode: 'pose_sheet_aseprite',
      aiRole: 'none',
      interpolate: 'lerp_joints',
      notes:
        'Aseprite: BASE_SPRITE = Craft character from guide; motion_XX = skeleton motion guide.'
    },
    updatedAt: now
  }

  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })

  if (options?.openFolder !== false) {
    await shell.openPath(dir)
  }

  return { asset: updated, puppet: nextPuppet, export: poseExport }
}

export async function revealPoseSheetExportDir(
  projectId: string,
  assetId: string
): Promise<{ path: string }> {
  const { asset } = await getAsset(projectId, assetId)
  const dir =
    asset.characterPuppet?.poseSheetExport?.dir ??
    join(getGeneratedDir(projectId, assetId), 'aseprite-pose-export')
  await mkdir(dir, { recursive: true })
  await shell.openPath(dir)
  return { path: dir }
}
