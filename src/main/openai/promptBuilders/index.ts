import type { AssetInspiration, IndieForgeProject, StyleReference } from '@shared/types/project'
import { coerceAnalysisText } from '@shared/coerceAnalysisText'
import { getDesignSpriteSize, getExportSpriteSize } from '@shared/styleGuide'

export function buildStyleReferencesBlock(
  project: IndieForgeProject,
  referenceIds?: string[]
): string {
  const refs = project.styleReferences ?? []
  const selected: StyleReference[] = referenceIds?.length
    ? refs.filter((r) => referenceIds.includes(r.id))
    : refs.filter((r) => r.analysis)

  if (selected.length === 0) return ''

  return selected
    .map((ref) => {
      const a = ref.analysis
      if (!a) {
        return `- Reference "${ref.name}" (${ref.role}): no analysis yet`
      }
      return [
        `- Reference "${ref.name}" [${ref.role}]`,
        `  Summary: ${a.summary}`,
        a.colorPalette ? `  Colors: ${a.colorPalette}` : '',
        a.artStyleNotes ? `  Style: ${a.artStyleNotes}` : '',
        a.generationGuidance ? `  Match: ${a.generationGuidance}` : '',
        a.dosAndDonts ? `  Avoid: ${a.dosAndDonts}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
}

function styleBlock(project: IndieForgeProject, referenceIds?: string[]): string {
  const sg = project.styleGuide
  const design = getDesignSpriteSize(sg)
  const exportSize = getExportSpriteSize(sg)
  const refBlock = buildStyleReferencesBlock(project, referenceIds)

  return [
    `Art style: ${sg.artStyle}`,
    `Perspective: ${sg.perspective}`,
    sg.colorPalette ? `Color palette: ${sg.colorPalette}` : '',
    `Design/review sprite size: ${design.width}x${design.height}`,
    `Game export sprite size: ${exportSize.width}x${exportSize.height}`,
    `Default background size: ${sg.defaultBackgroundWidth}x${sg.defaultBackgroundHeight}`,
    sg.notes ? `Notes: ${sg.notes}` : '',
    refBlock ? `Style references:\n${refBlock}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export function appendStyleReferencesToPrompt(
  basePrompt: string,
  project: IndieForgeProject,
  referenceIds?: string[]
): string {
  const refBlock = buildStyleReferencesBlock(project, referenceIds)
  if (!refBlock) return basePrompt
  return `${basePrompt}\n\nVisual style references — match these closely:\n${refBlock}`
}

export function buildInspirationGuidedSpritePrompt(
  project: IndieForgeProject,
  assetName: string,
  assetDescription: string,
  inspirations: AssetInspiration[],
  userPrompt?: string
): string {
  const inspirationBlock = inspirations
    .map((ref) => {
      const a = ref.analysis
      if (!a) return `- "${ref.name}": match pose and camera angle from the attached reference photo`
      return [
        `- "${ref.name}"`,
        a.poseDescription ? `  Pose: ${coerceAnalysisText(a.poseDescription)}` : '',
        a.cameraAngle ? `  Camera: ${coerceAnalysisText(a.cameraAngle)}` : '',
        a.compositionNotes ? `  Composition: ${coerceAnalysisText(a.compositionNotes)}` : '',
        a.generationGuidance ? `  Guidance: ${coerceAnalysisText(a.generationGuidance)}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  return `Convert the attached reference photo(s) into a game-ready pixel art sprite for "${assetName}" in "${project.name}".

Asset description: ${assetDescription}
${userPrompt ? `User direction: ${userPrompt}` : ''}

Reference photo guidance:
${inspirationBlock}

Style guide:
${styleBlock(project)}

Requirements:
- Match the EXACT pose, stance, and camera angle from the reference photo(s)
- Render as ${project.styleGuide.artStyle} pixel art — NOT photorealistic
- Transparent background
- Centered character on canvas, readable silhouette for mobile game
- Match project color palette and art style while preserving reference composition
- No text, watermark, or photo-realistic textures`
}

export function buildProjectPlanPrompt(project: IndieForgeProject): string {
  return `You are an indie game production planning assistant for Indie Forge (studio brain).

Create a structured plan for this game. Prefer inventory + craft/engine handoff over "generate with AI art".

Project name: ${project.name}
Game description: ${project.description}
Target platform: ${project.targetPlatform}
Engine: ${project.engine}
Craft path: ${project.craftPath}

Style guide:
${styleBlock(project)}

Return JSON with this exact shape:
{
  "scenes": [{ "name": string, "description": string }],
  "visualAssets": [{
    "name": string,
    "type": "sprite"|"animation"|"background"|"prop"|"effect"|"ui_icon",
    "description": string,
    "suggestedSceneNames": string[],
    "promptHint": string,
    "medium": "pixel_sprite"|"sprite_sheet"|"engine_material"|"vfx_graph"|"doc_only",
    "craftTool": "craft_studio"|"aseprite"|"godot"|"unity"|"cursor",
    "engineNotes": string
  }],
  "audioAssets": [{ "name": string, "type": "music"|"sound_effect"|"voice_line", "description": string, "suggestedSceneNames": string[], "promptHint": string, "medium": "audio", "craftTool": "audio", "engineNotes": string }],
  "animationPresets": string[],
  "backgroundIdeas": string[],
  "uiIconIdeas": string[],
  "productionSteps": [{ "id": string, "title": string, "description": string, "tool": string, "owner": "human"|"indie_forge"|"cursor_agent", "cursorPrompt": string }]
}

Rules:
- If engine is godot and craftPath is pixel_silhouette: assets should use craft_studio / aseprite; medium pixel_sprite or sprite_sheet; engineNotes for Godot import (nearest filter, Sprite2D).
- If engine is unity and craftPath is engine_materials: assets should use unity / cursor; medium engine_material or vfx_graph; do NOT suggest photoreal AI image generation as the deliverable.
- Suggest practical MVP assets, not hundreds.
- productionSteps should include Cursor prompts for the engine repo.`
}

export function buildSpritePrompt(project: IndieForgeProject, assetName: string, assetDescription: string, extra?: string): string {
  return `Create a retro arcade pixel art sprite for the game "${project.name}".

Game description:
${project.description}

Asset: ${assetName}
${assetDescription ? `Details: ${assetDescription}` : ''}

Style guide:
${styleBlock(project)}

Requirements:
- centered character or object
- no text
- no watermark
- no extra random props
- transparent background
- game-ready pixel art sprite
${extra ?? ''}`
}

const MOTION_BEAT_LIBRARY: Array<{ match: RegExp; beats: string[] }> = [
  {
    match: /swing|bat/i,
    beats: [
      'loaded batting stance, weight back, bat cocked up behind the shoulder',
      'stride forward begins, hips starting to rotate, hands dropping the bat into the slot',
      'bat sweeping level through the strike zone at the point of contact, arms extending',
      'full follow-through, bat wrapped around the lead shoulder, hips fully rotated, weight forward'
    ]
  },
  {
    match: /strike|out_call|out call|punch/i,
    beats: [
      'neutral upright stance, arms relaxed at sides',
      'arm cocking back and up, beginning the call gesture',
      'emphatic punch-out gesture at full extension',
      'holding the strike pose, slight recoil settling'
    ]
  },
  {
    match: /ball|point/i,
    beats: [
      'neutral upright stance',
      'arm lifting toward the side to point',
      'arm fully extended pointing to the side calling the ball',
      'holding the pointing pose'
    ]
  },
  {
    match: /safe/i,
    beats: [
      'upright stance, arms crossed at chest',
      'arms beginning to sweep outward',
      'arms fully spread wide in the safe call',
      'holding the wide safe pose'
    ]
  },
  {
    match: /pitch|windup|throw/i,
    beats: [
      'set position, ball in glove at chest',
      'leg lift and windup, weight gathering back',
      'stride forward, throwing arm cocked back',
      'release and follow-through toward the plate'
    ]
  },
  {
    match: /run|walk/i,
    beats: [
      'contact pose, lead foot planted',
      'passing pose, body over the support leg',
      'contact pose on the opposite foot',
      'passing pose on the opposite side'
    ]
  },
  {
    match: /idle|breath/i,
    beats: [
      'neutral idle pose',
      'slight rise, breathing in, weight shifting up',
      'slight settle, breathing out, weight shifting down',
      'returning toward the neutral idle pose'
    ]
  }
]

/** Produce `frameCount` motion beats for a preset, sampling a matching library or a generic arc. */
export function buildMotionBeats(presetOrName: string, frameCount: number): string[] {
  const entry = MOTION_BEAT_LIBRARY.find((e) => e.match.test(presetOrName))
  const source = entry?.beats
  const beats: string[] = []
  for (let i = 0; i < frameCount; i++) {
    if (source && source.length > 0) {
      const idx =
        frameCount === 1 ? 0 : Math.round((i / (frameCount - 1)) * (source.length - 1))
      beats.push(source[Math.min(idx, source.length - 1)])
    } else {
      const pct = frameCount === 1 ? 100 : Math.round((i / (frameCount - 1)) * 100)
      beats.push(`step ${i + 1}: ${pct}% through the motion — a clearly distinct pose from the previous frame`)
    }
  }
  return beats
}

export function buildAnimationStripPrompt(
  project: IndieForgeProject,
  assetName: string,
  animationPreset: string,
  cellCount: number,
  beats: string[],
  extra?: string
): string {
  const beatLines = beats.map((b, i) => `- Frame ${i + 1}: ${b}`).join('\n')
  return `Create ONE horizontal sprite sheet strip for a "${animationPreset}" animation of the SAME character shown in the reference image, for the game "${project.name}".

The image must contain exactly ${cellCount} frames arranged left to right in a single evenly-spaced row, each frame the same width and the same character scale.

Frame 1 must reproduce the reference character exactly — same design, colors, outfit, proportions, and pixel-art style.
Animate this motion, with a clear, fluid, progressive change between each consecutive frame:
${beatLines}

Style guide:
${styleBlock(project)}

Hard requirements:
- IDENTICAL character design and pixel-art style in every frame — ONLY the pose/limbs change between frames
- the character stays the same size and stays anchored on the same ground baseline in every frame (feet do not drift up/down)
- keep the body roughly centered; let the limbs/bat do the motion
- fully transparent background
- no grid lines, no frame borders, no numbers, no text, no watermark
- smooth arcade-style motion that reads clearly as "${animationPreset}"
${extra ?? ''}`
}

export function buildAnimationFramePrompt(
  project: IndieForgeProject,
  assetName: string,
  frameIndex: number,
  animationPreset: string,
  extra?: string
): string {
  return `Create animation frame ${frameIndex + 1} for "${assetName}" in the game "${project.name}".

Animation type: ${animationPreset}
Game description: ${project.description}

Style guide:
${styleBlock(project)}

Requirements:
- same character design and proportions as other frames
- transparent background
- centered on canvas
- exaggerated readable motion for arcade baseball game
- no text or watermark
${extra ?? ''}`
}

export function buildAnimationFrameEditPrompt(
  project: IndieForgeProject,
  assetName: string,
  frameIndex: number,
  animationPreset: string,
  poseDescription: string,
  referenceDescription?: string,
  extra?: string
): string {
  const refBlock = referenceDescription
    ? `\nCharacter identity (must match reference image exactly):\n${referenceDescription}\n`
    : ''

  return `Redraw the SAME character from the reference image as animation frame ${frameIndex + 1} for "${assetName}" in "${project.name}".

Animation type: ${animationPreset}
${refBlock}
New pose for this frame ONLY:
${poseDescription}

Style guide:
${styleBlock(project)}

Requirements:
- IDENTICAL character design, colors, outfit, proportions, and pixel style as the reference
- ONLY change the body pose / limb positions for this motion beat
- transparent background
- character centered on canvas, feet anchored at same baseline
- exaggerated readable motion for arcade game
- no text or watermark
${extra ?? ''}`
}

export function buildBackgroundPrompt(
  project: IndieForgeProject,
  assetName: string,
  sceneDescription: string,
  dimensions: { width: number; height: number }
): string {
  return `Create a background image for the game "${project.name}".

Scene: ${assetName}
${sceneDescription ? `Scene description: ${sceneDescription}` : ''}
Dimensions: ${dimensions.width}x${dimensions.height}

Style guide:
${styleBlock(project)}

Requirements:
- game background art, no UI text
- readable composition for mobile portrait game
- no watermark
- cohesive with retro arcade pixel art style`
}

export function buildEffectPrompt(project: IndieForgeProject, assetName: string, description: string): string {
  return buildSpritePrompt(project, assetName, description, '- small VFX sprite\n- transparent background\n- single effect moment')
}

export function buildIconPrompt(project: IndieForgeProject, assetName: string, description: string): string {
  return buildSpritePrompt(project, assetName, description, '- UI icon\n- clear silhouette\n- readable at small size')
}

export function buildAudioPlanPrompt(project: IndieForgeProject): string {
  return `Suggest audio asset names and descriptions for "${project.name}": ${project.description}

Return practical voice lines, sound effects, and music cues for a retro baseball umpire game.`
}

export function buildVariationPrompt(
  project: IndieForgeProject,
  assetName: string,
  editPrompt: string
): string {
  return `Create a variation of the game asset "${assetName}" for "${project.name}".

Edit instructions: ${editPrompt}

Style guide:
${styleBlock(project)}

Requirements:
- maintain style consistency
- transparent background if sprite
- no watermark or text`
}
