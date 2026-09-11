import { randomUUID } from 'crypto'
import type OpenAI from 'openai'
import type {
  DesignerChatMessage,
  DesignerSuggestions,
  IndieForgeProject
} from '@shared/types/project'
import { getDesignSpriteSize, getExportSpriteSize } from '@shared/styleGuide'
import { getOpenAIClient, OPENAI_PLANNING_MODEL } from './openaiClient'
import { buildStyleReferencesBlock } from './promptBuilders'
import { buildInspirationAnalysisBlock, resolveAssetInspirations } from './assetInspirationService'
import { visionImageToDataUrl } from './visionImageDataUrl'
import { loadProject, saveProject } from '../storage/projectStore'

function buildDesignerSystemPrompt(project: IndieForgeProject, assetContext?: { assetId?: string }): string {
  const sg = project.styleGuide
  const design = getDesignSpriteSize(sg)
  const exportSize = getExportSpriteSize(sg)
  const asset = assetContext?.assetId
    ? project.assets.find((a) => a.id === assetContext.assetId)
    : undefined

  const refBlock = buildStyleReferencesBlock(project)

  return `You are an expert indie game art director and designer agent for the project "${project.name}".

Game description: ${project.description}
Target platform: ${project.targetPlatform}

Current style guide:
- Art style: ${sg.artStyle}
- Perspective: ${sg.perspective}
- Color palette: ${sg.colorPalette || '(not set)'}
- Design size: ${design.width}x${design.height}
- Export size: ${exportSize.width}x${exportSize.height}
- Notes: ${sg.notes || '(none)'}

${refBlock ? `Style references:\n${refBlock}` : 'No style reference images uploaded yet.'}

${asset ? `Current asset focus: "${asset.name}" (${asset.type})\nDescription: ${asset.description}\nCurrent prompt: ${asset.prompt || '(empty)'}` : 'No specific asset selected — discuss overall game visual direction.'}

Help the user iterate on visual direction, prompts, and style guide. Be concise and practical.
When suggesting changes, include them in the JSON suggestions object.`
}

function buildAssetDesignerSystemPrompt(
  project: IndieForgeProject,
  asset: IndieForgeProject['assets'][0],
  hasGeneratedImage: boolean
): string {
  const base = buildDesignerSystemPrompt(project, { assetId: asset.id })
  const clip = asset.animationClips?.[0]
  const frameCount = clip?.frames.length ?? 0

  if (asset.type !== 'animation') {
    const inspirationBlock = buildInspirationAnalysisBlock(asset.inspirationImages ?? [])
    return `${base}

You are embedded in the Asset Generator. The user converses with you to create and refine "${asset.name}".

Current state: ${hasGeneratedImage ? 'An image already exists — user wants to refine/tweak it.' : 'No image yet — user is describing what to create first.'}
${inspirationBlock ? `\nAttached inspiration photos for this asset:\n${inspirationBlock}\nWhen generating, match pose and camera angle from inspiration photos. The app sends these images to the image model.` : '\nNo inspiration photos attached yet — user can attach reference photos (e.g. real batter photo from umpire view) in the Inspiration panel.'}

Rules:
- Always return suggestions.action as "generate", "refine", or "none".
- No image yet → action "generate" and a complete assetPrompt.
- Image exists and user asks for small/medium tweaks → action "refine" and refinementPrompt.
- Image exists and user wants a full redo → action "generate" with a new assetPrompt.
- Style-only questions → action "none".`
  }

  return `${base}

You are embedded in the **Animation Studio**.

Animation asset: "${asset.name}"
Preset / motion: ${(asset.metadata?.animationPreset as string) ?? asset.name}
Frames created so far: ${frameCount}
Has Motion Blueprint: ${asset.motionBlueprints?.length ? 'YES' : 'no'}
${clip ? `Clip: ${clip.frames.length} frames, ${clip.frameDurationMs}ms each, loop: ${clip.loop}` : 'No clip started yet.'}
${buildInspirationAnalysisBlock(asset.inspirationImages ?? []) ? `\nAttached inspiration photos:\n${buildInspirationAnalysisBlock(asset.inspirationImages ?? [])}` : ''}

${
  asset.motionBlueprints?.length
    ? `CRITICAL — This asset has a Motion Blueprint. You CANNOT see pose-guide images or Craft silhouettes.
Mechanics live in Motion Studio. Frames are painted via the **AI Paint Pose** button (pose guide + Craft appearance), not via chat.
Rules when a Motion Blueprint exists:
- Always return suggestions.action as "none".
- Never set generateAllFrames true.
- Never invent frame poses or ask the app to generate frames from English descriptions.
- Tell the user to: (1) author poses in Motion Studio, (2) Preview Pose, (3) AI Paint Pose, (4) Approve/Reject.
- You may answer style questions only.`
    : `This is the legacy chat workflow (no Motion Blueprint yet):
1. User describes the animation
2. Frame 0 is the reference pose
3. Later frames use frame 0 via image-to-image
4. User can refine frames via chat

Rules:
- Always return suggestions.action, targetFrameIndex (0-based), totalFrames, generateAllFrames when relevant.
- No frames yet → action "generate", targetFrameIndex 0, suggest totalFrames (typically 2–8).
- User wants next frame → action "generate", targetFrameIndex = next index.
- User tweaks existing frame → action "refine".
- User says "generate all" → generateAllFrames true (only after frame 0 exists).
- assetPrompt must describe ONE frame pose only.`
}`
}

interface DesignerModelResponse {
  reply: string
  suggestions?: DesignerSuggestions | null
}

async function callDesignerModel(
  systemContent: string,
  history: DesignerChatMessage[],
  userMessage: string,
  visionImagePaths?: string[],
  allowVisionFallback = true
): Promise<DesignerModelResponse> {
  const client = await getOpenAIClient()

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: userMessage }
  ]
  if (visionImagePaths?.length) {
    for (const filePath of visionImagePaths) {
      try {
        const url = await visionImageToDataUrl(filePath)
        userContent.push({ type: 'image_url', image_url: { url, detail: 'low' } })
      } catch {
        // Skip unreadable images — text analysis is still in the system prompt
      }
    }
  }

  const hasVision = userContent.length > 1

  const response = await client.chat.completions.create({
    model: OPENAI_PLANNING_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemContent },
      ...history.slice(-16).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      {
        role: 'user',
        content: hasVision ? userContent : userMessage
      }
    ]
  })

  const choice = response.choices[0]
  const content = choice?.message?.content?.trim()
  if (!content) {
    if (allowVisionFallback && hasVision) {
      return callDesignerModel(systemContent, history, userMessage, undefined, false)
    }
    const reason = choice?.finish_reason ?? 'unknown'
    throw new Error(`No designer response from OpenAI (${reason}). Try again or shorten your message.`)
  }

  try {
    return JSON.parse(content) as DesignerModelResponse
  } catch {
    return { reply: content, suggestions: null }
  }
}

export async function sendDesignerMessage(
  projectId: string,
  userMessage: string,
  context?: { assetId?: string }
): Promise<{ project: IndieForgeProject; assistantMessage: DesignerChatMessage }> {
  const project = await loadProject(projectId)
  const history = project.designerChat ?? []

  const userMsg: DesignerChatMessage = {
    id: randomUUID(),
    role: 'user',
    content: userMessage,
    createdAt: new Date().toISOString()
  }

  const systemPrompt = `${buildDesignerSystemPrompt(project, context)}

Return JSON with this shape:
{
  "reply": "your conversational response to the user",
  "suggestions": {
    "styleGuideUpdates": { "artStyle"?: string, "colorPalette"?: string, "notes"?: string } | null,
    "assetPrompt": "full revised generation prompt for the focused asset, or null",
    "assetId": "${context?.assetId ?? ''}" or null,
    "refinementPrompt": "short tweak instructions or null",
    "action": "generate" | "refine" | "none"
  } | null
}`

  const parsed = await callDesignerModel(systemPrompt, history, userMessage)

  const assistantMessage: DesignerChatMessage = {
    id: randomUUID(),
    role: 'assistant',
    content: parsed.reply ?? 'I can help refine your game art direction.',
    createdAt: new Date().toISOString(),
    suggestions: parsed.suggestions ?? undefined
  }

  project.designerChat = [...history, userMsg, assistantMessage]
  const saved = await saveProject(project)
  return { project: saved, assistantMessage }
}

export async function sendAssetDesignerMessage(
  projectId: string,
  assetId: string,
  userMessage: string,
  hasGeneratedImage: boolean
): Promise<{ project: IndieForgeProject; assistantMessage: DesignerChatMessage }> {
  const project = await loadProject(projectId)
  const assetIdx = project.assets.findIndex((a) => a.id === assetId)
  if (assetIdx < 0) throw new Error('Asset not found')

  const asset = project.assets[assetIdx]
  const history = asset.designerThread ?? []

  const userMsg: DesignerChatMessage = {
    id: randomUUID(),
    role: 'user',
    content: userMessage,
    createdAt: new Date().toISOString()
  }

  const systemPrompt = `${buildAssetDesignerSystemPrompt(project, asset, hasGeneratedImage)}

Return JSON with this shape:
{
  "reply": "your conversational response to the user",
  "suggestions": {
    "styleGuideUpdates": null,
    "assetPrompt": "full prompt when action is generate, else null",
    "assetId": "${assetId}",
    "refinementPrompt": "tweak instructions when action is refine, else null",
    "action": "generate" | "refine" | "none",
    "targetFrameIndex": 0,
    "totalFrames": 4,
    "generateAllFrames": false
  }
}`

  const inspirationPaths =
    history.length === 0 ? resolveAssetInspirations(asset).map((i) => i.filePath) : undefined
  const parsed = await callDesignerModel(systemPrompt, history, userMessage, inspirationPaths)
  const suggestions = parsed.suggestions
    ? { ...parsed.suggestions, assetId }
    : undefined

  const assistantMessage: DesignerChatMessage = {
    id: randomUUID(),
    role: 'assistant',
    content: parsed.reply ?? 'Let me help you create this asset.',
    createdAt: new Date().toISOString(),
    suggestions
  }

  asset.designerThread = [...history, userMsg, assistantMessage]
  project.assets[assetIdx] = asset
  const saved = await saveProject(project)
  return { project: saved, assistantMessage }
}

export async function applyDesignerStyleGuide(
  projectId: string,
  updates: NonNullable<DesignerSuggestions['styleGuideUpdates']>
): Promise<IndieForgeProject> {
  const project = await loadProject(projectId)
  project.styleGuide = { ...project.styleGuide, ...updates }
  return saveProject(project)
}

export async function applyDesignerAssetPrompt(
  projectId: string,
  assetId: string,
  prompt: string
): Promise<IndieForgeProject> {
  const project = await loadProject(projectId)
  project.assets = project.assets.map((a) => (a.id === assetId ? { ...a, prompt } : a))
  return saveProject(project)
}

export async function clearDesignerChat(projectId: string): Promise<IndieForgeProject> {
  const project = await loadProject(projectId)
  project.designerChat = []
  return saveProject(project)
}

export async function clearAssetDesignerChat(
  projectId: string,
  assetId: string
): Promise<IndieForgeProject> {
  const project = await loadProject(projectId)
  project.assets = project.assets.map((a) =>
    a.id === assetId ? { ...a, designerThread: [] } : a
  )
  return saveProject(project)
}
