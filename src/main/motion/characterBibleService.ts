/**
 * Skin plate (stored as characterBible) — full-body identity in the craft guide camera.
 * AI paints once after Director motion proof; Motion Blueprint never changes here.
 */

import { mkdir, access } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import type { CharacterPuppet, GameAsset } from '@shared/types/project'
import { createRhBatterPuppetDraft, validateCharacterPuppet } from '@shared/motion/characterPuppet'
import { getOpenAIClient } from '../openai/openaiClient'
import { editOpenAIImage, getOpenAIImageSize } from '../openai/openaiImageService'
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

function biblePrompt(assetName: string, designW: number, designH: number): string {
  return `You are TRACE-PAINTING a CHARACTER BIBLE sprite for "${assetName}".

This is NOT "draw a typical pixel-art batter."
This is NOT a side-view SNES TV broadcast batter.
You must MATCH THE CAMERA IN IMAGE 1.

CAMERA LOCK (from Image 1 — NON-NEGOTIABLE):
- Image 1 is a real photo from BEHIND HOME PLATE (umpire / catcher POV) looking toward the pitcher / outfield.
- The batter is seen from the BACK / ¾ REAR — you see the back of the helmet, jersey numbers area, and how the bat sits in depth.
- Body is foreshortened toward the mound — NOT a flat left/right side silhouette.
- FAIL IF the output is a side-profile batter facing left or right (classic Mega Man / SNES batter side view).
- FAIL IF you invent a broadcast "TV camera from first-base side" angle.
- If Image 1 shows the catcher/umpire view, your sprite MUST keep that same view.

TASK:
- Paint ONE pixel-art baseball batter matching Image 1's camera and body orientation.
- Idle / ready stance OK — costume bible, not a full swing sheet.
- Transparent background only. No dirt, stadium, scoreboard, strike-zone UI, or catcher.
- Copy costume cues from Image 1 where readable (helmet color, jersey, pants) remapped to crisp SNES/arcade pixels.
- Character ~70–85% of canvas height on a ~${designW}×${designH} design (API may use a larger square).
- Limbs/bat readable for later cutouts.

Image 1 = CAMERA + POSE AUTHORITY (guide photo). Trace its angle. Do not "improve" into a side view.`
}

/** Guide with a hard camera-lock banner so the edit model cannot ignore POV. */
async function buildCameraLockPlate(guidePath: string, outPath: string): Promise<void> {
  const resized = await sharp(guidePath)
    .resize(1024, 1024, { fit: 'contain', background: { r: 18, g: 22, b: 28, alpha: 1 } })
    .ensureAlpha()
    .png()
    .toBuffer()

  const banner = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect x="0" y="0" width="1024" height="72" fill="#c0392b"/>
  <text x="512" y="46" fill="#ffffff" font-size="28" font-family="monospace" text-anchor="middle">
    CAMERA LOCK — umpire/catcher POV (behind plate). NOT side profile.
  </text>
  <rect x="0" y="952" width="1024" height="72" fill="#1a5276"/>
  <text x="512" y="998" fill="#d6eaf8" font-size="22" font-family="monospace" text-anchor="middle">
    Output must keep this rear/¾ angle. Fail if side-view batter.
  </text>
</svg>`)

  const bannerPng = await sharp(banner).png().toBuffer()
  await sharp(resized)
    .composite([{ input: bannerPng, left: 0, top: 0 }])
    .png()
    .toFile(outPath)
}

/** Ensure puppet stub exists. Authority may be guide until skin approved. */
async function ensurePuppetForBible(
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

  const authority =
    asset.guideImagePath ??
    asset.filePath ??
    asset.outlinePath ??
    asset.silhouettePath
  if (!authority) {
    throw new Error('Add a Craft guide photo first (camera lock for the character bible).')
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

export async function generateCharacterBible(
  projectId: string,
  assetId: string,
  options?: { blueprintId?: string }
): Promise<{
  asset: GameAsset
  puppet: CharacterPuppet
  biblePath: string
}> {
  const { asset: baseAsset, puppet: basePuppet } = await ensurePuppetForBible(
    projectId,
    assetId,
    options
  )
  const guide = baseAsset.guideImagePath
  if (!guide || !(await pathExists(guide))) {
    throw new Error('Craft guide image required. Set a guide in Craft Studio first.')
  }
  if (!basePuppet.mannequinKit?.approvedAt) {
    throw new Error('Approve the mannequin kit before drafting Skin (AI).')
  }
  if (!basePuppet.motionProofAt) {
    throw new Error('Director must approve motion proof before Skin (AI).')
  }

  const blueprint =
    (options?.blueprintId
      ? baseAsset.motionBlueprints?.find((b) => b.id === options.blueprintId)
      : baseAsset.motionBlueprints?.find((b) => b.id === basePuppet.blueprintId)) ??
    baseAsset.motionBlueprints?.[0]
  if (!blueprint) throw new Error('Motion Blueprint required.')

  const designW = blueprint.canvasWidth || 256
  const designH = blueprint.canvasHeight || 256
  const bibleDir = join(getGeneratedDir(projectId, assetId), 'bible')
  await mkdir(bibleDir, { recursive: true })
  const lockPlatePath = join(bibleDir, 'camera-lock-plate.png')
  const rawPath = join(bibleDir, 'character-bible-raw.png')
  const biblePath = join(bibleDir, 'character-bible.png')

  await buildCameraLockPlate(guide, lockPlatePath)

  const client = await getOpenAIClient()
  await editOpenAIImage(
    client,
    [lockPlatePath, guide],
    biblePrompt(baseAsset.name, designW, designH),
    rawPath,
    {
      size: getOpenAIImageSize(designW, designH),
      transparentBackground: true,
      quality: 'high',
      multiImageHint:
        'Image 1 is the CAMERA LOCK PLATE (guide + banners). Image 2 is the same Craft GUIDE PHOTO. Both show umpire/catcher POV behind home plate. Your output MUST keep that rear/¾ camera — NEVER a side-profile batter.'
    }
  )

  await sharp(rawPath)
    .resize(designW, designH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toFile(biblePath)

  const nextPuppet: CharacterPuppet = {
    ...basePuppet,
    status: 'needs_skin',
    characterBible: {
      imagePath: biblePath,
      source: 'ai',
      cameraNote: 'Must match Craft guide camera (umpire/catcher POV) — reject if side profile',
      basedOnGuidePath: guide
      // approvedAt cleared on regenerate — must re-approve
    },
    // Keep mannequin part images until skin is approved + sliced
    bindPose: {
      ...basePuppet.bindPose,
      // Authority stays mannequin/guide until Director approves skin
      canvasWidth: designW,
      canvasHeight: designH
    },
    updatedAt: new Date().toISOString()
  }

  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet, biblePath }
}

export async function approveCharacterBible(
  projectId: string,
  assetId: string
): Promise<{ asset: GameAsset; puppet: CharacterPuppet }> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet?.characterBible?.imagePath) {
    throw new Error('Draft Skin first.')
  }
  if (!(await pathExists(puppet.characterBible.imagePath))) {
    throw new Error('Skin file missing — regenerate.')
  }
  if (!puppet.motionProofAt) {
    throw new Error('Motion proof required before approving Skin.')
  }

  const nextPuppet: CharacterPuppet = {
    ...puppet,
    status: 'needs_parts',
    characterBible: {
      ...puppet.characterBible,
      approvedAt: new Date().toISOString()
    },
    bindPose: {
      ...puppet.bindPose,
      authorityImagePath: puppet.characterBible.imagePath
    },
    updatedAt: new Date().toISOString()
  }
  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet }
}

export async function rejectCharacterBible(
  projectId: string,
  assetId: string
): Promise<{ asset: GameAsset; puppet: CharacterPuppet }> {
  const { asset } = await getAsset(projectId, assetId)
  const puppet = asset.characterPuppet
  if (!puppet) throw new Error('No puppet on asset.')

  // Restore mannequin part paths; keep motion proof + mannequin approval
  const mannequinPaths = puppet.mannequinKit?.partPaths
  const nextParts = puppet.parts.map((p) => {
    const mannequinPath = mannequinPaths?.[p.id]
    if (mannequinPath) {
      return {
        ...p,
        imagePath: mannequinPath,
        status: 'approved' as const,
        notes: `mannequin capsule (restored after skin reject)`
      }
    }
    return {
      ...p,
      imagePath: undefined,
      status: 'placeholder' as const,
      notes: undefined
    }
  })

  const nextPuppet: CharacterPuppet = {
    ...puppet,
    status: 'needs_skin',
    characterBible: undefined,
    partSheetPath: undefined,
    rasterizedFrames: undefined,
    parts: nextParts,
    bindPose: {
      ...puppet.bindPose,
      authorityImagePath:
        asset.guideImagePath ?? puppet.bindPose.authorityImagePath
    },
    updatedAt: new Date().toISOString()
  }
  const updated = await updateAsset(projectId, assetId, { characterPuppet: nextPuppet })
  return { asset: updated, puppet: nextPuppet }
}

export function bibleIssues(puppet: CharacterPuppet, blueprint?: Parameters<typeof validateCharacterPuppet>[1]) {
  return validateCharacterPuppet(puppet, blueprint)
}
