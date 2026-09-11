import { randomUUID } from 'crypto'
import { join } from 'path'
import type {
  AssetSlot,
  GameAsset,
  GameScene,
  IndieForgeProject,
  NormalizedRect
} from '@shared/types/project'
import { getDesignSpriteSize } from '@shared/styleGuide'
import { slotToAssetType } from '@shared/sceneDefaults'
import { getVisualProvider } from '../providers/registry'
import { createAsset, saveAssetInProject, updateAsset } from '../storage/assetStore'
import { getScene, updateSceneSlot } from '../storage/sceneStore'
import { loadProject } from '../storage/projectStore'
import { getGeneratedDir } from '../storage/filePaths'
import { cropNormalizedRegion } from '../image/cropNormalizedRegion'

function isBackgroundSlot(slot: AssetSlot): boolean {
  return (
    slot.role === 'scene_background' ||
    slot.format === 'layered_background'
  )
}

function findBackgroundAsset(
  project: IndieForgeProject,
  scene: GameScene,
  excludeSlotId: string
): GameAsset | undefined {
  const slots = scene.assetSlots ?? []
  const bgSlot =
    slots.find((s) => s.id !== excludeSlotId && isBackgroundSlot(s) && s.assetId) ??
    slots.find(
      (s) =>
        s.id !== excludeSlotId &&
        s.assetId &&
        project.assets.find((a) => a.id === s.assetId)?.type === 'background'
    )

  if (bgSlot?.assetId) {
    const asset = project.assets.find((a) => a.id === bgSlot.assetId)
    if (asset?.filePath) return asset
  }

  // Fallback: any background asset attached to the scene
  return project.assets.find(
    (a) =>
      a.type === 'background' &&
      a.filePath &&
      (a.sceneIds.includes(scene.id) || scene.assetIds.includes(a.id))
  )
}

function formatBounds(bounds: NormalizedRect): string {
  return `x=${bounds.x.toFixed(2)}, y=${bounds.y.toFixed(2)}, w=${bounds.width.toFixed(2)}, h=${bounds.height.toFixed(2)} (~${Math.round(bounds.width * 100)}%×${Math.round(bounds.height * 100)}% of scene)`
}

function buildSceneAwarePrompt(input: {
  project: IndieForgeProject
  scene: GameScene
  slot: AssetSlot
  neighbors: AssetSlot[]
  hasBackgroundCrop: boolean
  hasStyleRefs: boolean
  hasPoseInspirations: boolean
  hasCameraRefs: boolean
}): string {
  const {
    project,
    scene,
    slot,
    neighbors,
    hasBackgroundCrop,
    hasStyleRefs,
    hasPoseInspirations,
    hasCameraRefs
  } = input
  const camera = scene.camera
  const keyPoses = slot.contract.animation?.keyPoses
  const poseHint = keyPoses?.length
    ? `\nSuggested key poses (for later animation): ${keyPoses.join('; ')}.`
    : ''

  const neighborLines = neighbors
    .slice(0, 12)
    .map(
      (n) =>
        `- "${n.name}" [${n.role}] layer ${n.layer} at ${formatBounds(n.bounds)}${
          n.status === 'missing' ? ' (not generated yet)' : ''
        }`
    )
    .join('\n')

  const cropHint = hasBackgroundCrop
    ? `
Scene placement reference image:
- A crop of the scene background under this slot is attached.
- Place a TRANSPARENT subject that belongs in this crop: feet near the bottom of the crop when the subject stands on ground.
- Match camera angle and perspective of the crop.
- Do NOT redraw the field, stadium, dirt, plate, or sky — transparent background only; the game composites this sprite onto the field.
- Use the crop only to understand footing, scale, and orientation.`
    : `
No background crop available — use camera + slot bounds + neighboring layout for scale and orientation.`

  const inspirationHint = hasPoseInspirations
    ? `
Pose inspirations (attached to this asset):
- Real-world photos of how this subject should stand / hold / face.
- Match stance, limb positions, and body lean from those photos.
- Convert to pixel art — do not copy photo textures.`
    : ''

  const cameraHint = hasCameraRefs
    ? `
Scene camera / viewpoint references:
- Photos or comps from the intended game camera (e.g. behind home plate from the umpire).
- Match foreshortening, horizon, and viewing height so the sprite sits correctly in that shot.
- Do not paint the full stadium into this sprite unless this slot is the background.`
    : ''

  const styleHint = hasStyleRefs
    ? `
Cast / style references:
- Additional images show APPROVED characters from this game/scene.
- Match their pixel art style, palette, outline weight, proportions, and lighting closely.
- New character should look like they belong in the same cast — not a different art style.
- Keep the subject's own role/costume (pitcher ≠ batter pose), but share the same visual language.`
    : ''

  return `Create the asset "${slot.name}" for scene "${scene.name}" in the game "${project.name}".

Scene description: ${scene.description || '(none)'}
Camera: view="${camera?.view ?? 'primary'}", projection="${camera?.projection ?? 'orthographic'}", orientation="${camera?.orientation ?? 'portrait'}"
Viewport: ${scene.viewport?.width ?? '?'}×${scene.viewport?.height ?? '?'}

This slot:
- Role: ${slot.role}
- Format: ${slot.format}
- Anchor: ${slot.anchor}
- Layer / depth: ${slot.layer}
- Placement bounds in scene: ${formatBounds(slot.bounds)}
- Master canvas: ${slot.contract.canvas.width}×${slot.contract.canvas.height}
- Transparent: ${slot.contract.transparent ? 'yes' : 'no'}

Other slots in this scene (for spatial context — do not draw them):
${neighborLines || '- (none)'}
${cropHint}
${inspirationHint}
${cameraHint}
${styleHint}

Style guide:
- Art style: ${project.styleGuide.artStyle}
- Perspective: ${project.styleGuide.perspective}
${project.styleGuide.colorPalette ? `- Palette: ${project.styleGuide.colorPalette}` : ''}
${project.styleGuide.notes ? `- Notes: ${project.styleGuide.notes}` : ''}

Requirements:
- Single subject matching this slot — centered in the canvas, scale readable for the slot size
- Transparent background unless this is a full scene background
- No text, watermarks, or baked-in UI chrome unless role is hud/menu
- Game-ready art for ${project.targetPlatform}${poseHint}`
}

/**
 * Create or fill a GameAsset for a scene slot using the visual provider,
 * then link assetId onto the slot.
 *
 * Non-background slots: inject full scene context and (when available) a
 * background crop under the slot as an image-edit placement reference.
 */
export async function generateSlotAsset(
  projectId: string,
  sceneId: string,
  slotId: string
): Promise<{ project: IndieForgeProject; asset: GameAsset }> {
  const { project, scene } = await getScene(projectId, sceneId)
  const slot = scene.assetSlots?.find((s) => s.id === slotId)
  if (!slot) throw new Error(`Slot not found: ${slotId}`)

  if (
    slot.format === 'audio_clip' ||
    slot.format === 'music_track' ||
    slot.role === 'audio_cue' ||
    slot.role === 'music_loop' ||
    slot.role === 'voice_line'
  ) {
    throw new Error('Audio slots are not generated in this slice — import audio from the Audio panel.')
  }

  const assetType = slotToAssetType(slot.role, slot.format)
  const neighbors = (scene.assetSlots ?? []).filter((s) => s.id !== slotId)
  const useBgCrop = !isBackgroundSlot(slot) && assetType !== 'background'
  let backgroundCropPath: string | undefined

  if (useBgCrop) {
    const bg = findBackgroundAsset(project, scene, slotId)
    if (bg?.filePath) {
      const cropPath = join(getGeneratedDir(projectId, slotId), 'scene_crop_ref.png')
      try {
        await cropNormalizedRegion(bg.filePath, slot.bounds, cropPath, { padRatio: 0.15 })
        backgroundCropPath = cropPath
      } catch {
        backgroundCropPath = undefined
      }
    }
  }

  // Resolve cast style sources: explicit styleFromAssetIds, else other filled actor slots.
  const explicitStyleIds = slot.styleFromAssetIds ?? []
  let styleImagePaths: string[] = []
  if (explicitStyleIds.length) {
    styleImagePaths = explicitStyleIds
      .map((id) => project.assets.find((a) => a.id === id)?.filePath)
      .filter((p): p is string => Boolean(p))
  } else {
    const actorRoles = new Set(['playable_character', 'npc'])
    styleImagePaths = neighbors
      .filter((n) => actorRoles.has(n.role) && n.assetId)
      .map((n) => project.assets.find((a) => a.id === n.assetId)?.filePath)
      .filter((p): p is string => Boolean(p))
      .slice(0, 3)
  }

  // Scene comps: camera/composition photos → viewpoint; mood → soft cast mood (style).
  const sceneRefs = scene.references ?? []
  const cameraImagePaths = sceneRefs
    .filter((r) => r.role === 'camera' || r.role === 'composition')
    .map((r) => r.filePath)
    .slice(0, 3)
  const moodPaths = sceneRefs
    .filter((r) => r.role === 'mood')
    .map((r) => r.filePath)
    .slice(0, 1)

  styleImagePaths = [...styleImagePaths, ...moodPaths].filter(
    (p, i, arr) => arr.indexOf(p) === i && p !== backgroundCropPath
  )

  let asset: GameAsset | undefined = slot.assetId
    ? project.assets.find((a) => a.id === slot.assetId)
    : undefined

  const poseInspirationIds = (asset?.inspirationImages ?? []).map((i) => i.id)

  const prompt = buildSceneAwarePrompt({
    project,
    scene,
    slot,
    neighbors,
    hasBackgroundCrop: Boolean(backgroundCropPath),
    hasStyleRefs: styleImagePaths.length > 0,
    hasPoseInspirations: poseInspirationIds.length > 0,
    hasCameraRefs: cameraImagePaths.length > 0
  })

  if (!asset) {
    const design = getDesignSpriteSize(project.styleGuide)
    asset = await createAsset(projectId, {
      name: slot.name,
      type: assetType,
      description: `${slot.role} for scene "${scene.name}"`,
      prompt,
      sceneIds: [sceneId]
    })

    if (assetType === 'animation') {
      const frameCount = slot.contract.animation?.frameCount ?? 4
      asset.animationClips = [
        {
          id: randomUUID(),
          name: `${slot.name} Clip`,
          frameWidth: slot.contract.canvas.width || design.width,
          frameHeight: slot.contract.canvas.height || design.height,
          frameDurationMs: slot.contract.animation?.frameDurationMs ?? 100,
          loop: slot.contract.animation?.loop ?? true,
          frames: []
        }
      ]
      asset.metadata = {
        ...(asset.metadata ?? {}),
        animationPreset: slot.name,
        frameCount,
        sceneSlotId: slotId
      }
      asset = await saveAssetInProject(projectId, asset)
    }
  } else {
    asset = await updateAsset(projectId, asset.id, {
      prompt,
      sceneIds: asset.sceneIds.includes(sceneId)
        ? asset.sceneIds
        : [...asset.sceneIds, sceneId]
    })
  }

  const provider = getVisualProvider('openai-visual')
  const latest = await loadProject(projectId)
  const isAnimation = asset.type === 'animation'
  const referenceIds = (latest.styleReferences ?? [])
    .filter((r) => r.analysis)
    .map((r) => r.id)

  // Reload asset so inspirations added after create are included.
  const latestAsset = latest.assets.find((a) => a.id === asset!.id) ?? asset
  const inspirationIds = (latestAsset.inspirationImages ?? []).map((i) => i.id)

  const result = await provider.generateImage(
    {
      projectId,
      assetId: asset.id,
      overrides: {
        prompt: isAnimation
          ? `${prompt}\n\nThis is the first (reference) pose / keyframe for the animation.`
          : prompt,
        width: slot.contract.canvas.width,
        height: slot.contract.canvas.height,
        transparentBackground: slot.contract.transparent,
        referenceIds: referenceIds.length ? referenceIds : undefined,
        referenceImagePath: backgroundCropPath,
        styleImagePaths: styleImagePaths.length ? styleImagePaths : undefined,
        cameraImagePaths: cameraImagePaths.length ? cameraImagePaths : undefined,
        inspirationIds: inspirationIds.length ? inspirationIds : undefined
      }
    },
    latest
  )
  asset = result.asset

  if (isAnimation && asset.filePath && asset.animationClips?.[0]) {
    const clip = asset.animationClips[0]
    if (clip.frames.length === 0) {
      clip.frames.push({
        id: randomUUID(),
        frameIndex: 0,
        imagePath: asset.filePath,
        approved: true,
        durationMs: clip.frameDurationMs,
        offsetX: 0,
        offsetY: 0,
        baselineY: (slot.contract.canvas.height || 1024) - 4
      })
      clip.referenceImagePath = asset.filePath
      asset = await saveAssetInProject(projectId, asset)
    }
  }

  const linked = await updateSceneSlot(projectId, sceneId, slotId, {
    assetId: asset.id,
    status: 'draft'
  })

  const finalAsset = linked.project.assets.find((a) => a.id === asset!.id) ?? asset
  return { project: linked.project, asset: finalAsset }
}
