import { randomUUID } from 'crypto'
import type {
  AnchorPoint,
  AssetFormat,
  AssetRole,
  AssetSlot,
  CameraDefinition,
  IndieForgeProject,
  SceneLayer,
  ViewportDefinition
} from '@shared/types/project'
import {
  createAssetSlot,
  createDefaultContract,
  defaultCamera,
  defaultViewport,
  normalizeRect
} from '@shared/sceneDefaults'
import { getOpenAIClient, OPENAI_PLANNING_MODEL } from './openaiClient'
import { getScene, updateScene } from '../storage/sceneStore'

const ROLES: AssetRole[] = [
  'scene_background',
  'scene_foreground',
  'playable_character',
  'npc',
  'interactive_object',
  'environment_prop',
  'visual_effect',
  'gameplay_overlay',
  'hud_element',
  'menu_element',
  'audio_cue',
  'music_loop',
  'voice_line'
]

const FORMATS: AssetFormat[] = [
  'static_image',
  'frame_animation',
  'sprite_sheet',
  'layered_background',
  'tile_set',
  'nine_slice',
  'audio_clip',
  'music_track'
]

const ANCHORS: AnchorPoint[] = [
  'top_left',
  'top_center',
  'top_right',
  'center_left',
  'center',
  'center_right',
  'bottom_left',
  'bottom_center',
  'bottom_right'
]

function asRole(value: unknown, fallback: AssetRole = 'environment_prop'): AssetRole {
  return typeof value === 'string' && ROLES.includes(value as AssetRole)
    ? (value as AssetRole)
    : fallback
}

function asFormat(value: unknown, fallback: AssetFormat = 'static_image'): AssetFormat {
  return typeof value === 'string' && FORMATS.includes(value as AssetFormat)
    ? (value as AssetFormat)
    : fallback
}

function asAnchor(value: unknown, fallback: AnchorPoint = 'bottom_center'): AnchorPoint {
  return typeof value === 'string' && ANCHORS.includes(value as AnchorPoint)
    ? (value as AnchorPoint)
    : fallback
}

interface ProposedBlueprint {
  camera?: Partial<CameraDefinition>
  viewport?: Partial<ViewportDefinition>
  layers?: Array<{ name?: string; depth?: number }>
  assets?: Array<{
    name?: string
    role?: string
    format?: string
    bounds?: { x?: number; y?: number; width?: number; height?: number }
    anchor?: string
    layer?: number
    canvas?: { width?: number; height?: number }
    transparent?: boolean
    animation?: {
      frameCount?: number
      frameDurationMs?: number
      loop?: boolean
      keyPoses?: string[]
    }
  }>
}

function buildProposePrompt(
  project: IndieForgeProject,
  sceneName: string,
  sceneDescription: string
): string {
  const viewport = defaultViewport(project.styleGuide)
  return `You are a game scene blueprint planner for Indie Forge AI.

Project: ${project.name}
Platform: ${project.targetPlatform}
Style: ${project.styleGuide.artStyle}
Perspective: ${project.styleGuide.perspective}
Game description: ${project.description}

Scene name: ${sceneName}
Scene description: ${sceneDescription || '(none — invent a sensible main gameplay scene)'}

Default reference viewport: ${viewport.width}x${viewport.height} (${viewport.orientation})

Propose a scene blueprint as JSON only (no markdown):
{
  "camera": { "view": string, "projection": string, "orientation": "portrait"|"landscape"|"square" },
  "viewport": { "width": number, "height": number, "orientation": "portrait"|"landscape"|"square" },
  "layers": [{ "name": string, "depth": number }],
  "assets": [{
    "name": string,
    "role": one of ${ROLES.join('|')},
    "format": one of ${FORMATS.join('|')},
    "bounds": { "x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1 },
    "anchor": one of ${ANCHORS.join('|')},
    "layer": number,
    "canvas": { "width": number, "height": number },
    "transparent": boolean,
    "animation": optional { "frameCount": number, "frameDurationMs": number, "loop": boolean, "keyPoses": string[] }
  }]
}

Rules:
- Use normalized bounds (0–1) relative to the full scene viewport.
- Include background, key actors, important props/overlays, and any essential audio cues.
- Prefer 5–12 visual slots (plus optional audio). Do not invent dozens.
- Characters/actors use transparent canvases (usually 1024x1024). Full backgrounds match viewport size and are not transparent.
- Animations should use format "frame_animation" with suggested frameCount and keyPoses.
- Depth order must match layer numbers (background low, HUD high).
- Positions should read as a coherent camera/composition for the described viewpoint.`
}

export async function proposeSceneBlueprint(
  projectId: string,
  sceneId: string,
  descriptionOverride?: string
): Promise<{ project: IndieForgeProject }> {
  const { project, scene } = await getScene(projectId, sceneId)
  const client = await getOpenAIClient()
  const description = descriptionOverride?.trim() || scene.description

  const response = await client.chat.completions.create({
    model: OPENAI_PLANNING_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You output only valid JSON for game scene blueprints.'
      },
      {
        role: 'user',
        content: buildProposePrompt(project, scene.name, description)
      }
    ]
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No scene blueprint returned from OpenAI')

  let parsed: ProposedBlueprint
  try {
    parsed = JSON.parse(text) as ProposedBlueprint
  } catch {
    throw new Error('Failed to parse scene blueprint JSON from OpenAI')
  }

  const viewport: ViewportDefinition = {
    ...defaultViewport(project.styleGuide),
    ...(parsed.viewport ?? {}),
    width: Math.max(256, Math.round(parsed.viewport?.width ?? defaultViewport(project.styleGuide).width)),
    height: Math.max(256, Math.round(parsed.viewport?.height ?? defaultViewport(project.styleGuide).height)),
    orientation:
      parsed.viewport?.orientation === 'landscape' ||
      parsed.viewport?.orientation === 'portrait' ||
      parsed.viewport?.orientation === 'square'
        ? parsed.viewport.orientation
        : defaultViewport(project.styleGuide).orientation
  }

  const camera: CameraDefinition = {
    ...defaultCamera(viewport.orientation),
    ...(parsed.camera ?? {}),
    orientation: parsed.camera?.orientation ?? viewport.orientation,
    view: parsed.camera?.view?.trim() || 'primary',
    projection: parsed.camera?.projection?.trim() || 'orthographic'
  }

  const layers: SceneLayer[] = (parsed.layers ?? [])
    .filter((l) => l?.name)
    .map((l) => ({
      name: String(l.name),
      depth: typeof l.depth === 'number' ? l.depth : 0
    }))

  const assetSlots: AssetSlot[] = (parsed.assets ?? [])
    .filter((a) => a?.name)
    .map((a, index) => {
      const name = String(a.name)
      const role = asRole(a.role)
      const format = asFormat(a.format)
      const layer = typeof a.layer === 'number' ? a.layer : (index + 1) * 10
      const anchor = asAnchor(a.anchor)
      const contract = createDefaultContract(name, role, format, {
        canvas:
          a.canvas?.width && a.canvas?.height
            ? {
                width: Math.max(32, Math.round(a.canvas.width)),
                height: Math.max(32, Math.round(a.canvas.height))
              }
            : undefined,
        transparent: a.transparent,
        layer,
        anchor
      })
      if (a.animation && (format === 'frame_animation' || format === 'sprite_sheet')) {
        contract.animation = {
          frameCount: Math.max(2, Math.round(a.animation.frameCount ?? 4)),
          frameDurationMs: Math.max(16, Math.round(a.animation.frameDurationMs ?? 100)),
          loop: a.animation.loop ?? true,
          keyPoses: Array.isArray(a.animation.keyPoses)
            ? a.animation.keyPoses.map(String)
            : undefined
        }
      }
      return createAssetSlot({
        id: randomUUID(),
        name,
        role,
        format,
        bounds: normalizeRect(a.bounds),
        anchor,
        layer,
        contract,
        status: 'missing'
      })
    })

  // Preserve existing slot asset links when names match (regenerate layout, keep filled assets).
  const previousByName = new Map(
    (scene.assetSlots ?? [])
      .filter((s) => s.assetId)
      .map((s) => [s.name.toLowerCase(), s] as const)
  )
  for (const slot of assetSlots) {
    const prev = previousByName.get(slot.name.toLowerCase())
    if (prev?.assetId) {
      slot.assetId = prev.assetId
      slot.status = prev.status === 'missing' ? 'draft' : prev.status
    }
  }

  const result = await updateScene(projectId, sceneId, {
    description: description || scene.description,
    viewport,
    camera,
    layers: layers.length ? layers : scene.layers,
    assetSlots
  })

  return { project: result.project }
}
