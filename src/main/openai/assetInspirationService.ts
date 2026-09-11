import { readFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { randomUUID } from 'crypto'
import { copyFile, mkdir, unlink } from 'fs/promises'
import type { AssetInspiration, AssetInspirationAnalysis, IndieForgeProject } from '@shared/types/project'
import { coerceAnalysisText } from '@shared/coerceAnalysisText'
import { getOpenAIClient, OPENAI_PLANNING_MODEL } from './openaiClient'
import { getPreviewMimeType } from '../storage/previewMime'
import { getAssetInspirationDir } from '../storage/filePaths'
import { getAsset, saveAssetInProject } from '../storage/assetStore'

async function imageToDataUrl(filePath: string): Promise<string> {
  const data = await readFile(filePath)
  const mime = getPreviewMimeType(filePath)
  return `data:${mime};base64,${data.toString('base64')}`
}

export async function analyzeAssetInspirationImage(filePath: string): Promise<AssetInspirationAnalysis> {
  const client = await getOpenAIClient()
  const dataUrl = await imageToDataUrl(filePath)

  const response = await client.chat.completions.create({
    model: OPENAI_PLANNING_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You analyze reference photos for indie game sprite creation. Return JSON with keys: summary, poseDescription, cameraAngle, compositionNotes, generationGuidance. Every value MUST be a plain string (never nested objects or arrays). Focus on body pose, stance, limb positions, camera angle (e.g. umpire behind plate), perspective, and silhouette. If multiple people appear, describe all of them in one string.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analyze this reference photo. Describe the pose and camera angle so an AI can recreate the same stance as a pixel art game sprite.'
          },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No inspiration analysis returned from OpenAI')

  const parsed = JSON.parse(content) as Record<string, unknown>
  return {
    summary: coerceAnalysisText(parsed.summary) || 'Reference photo for pose and composition.',
    poseDescription: coerceAnalysisText(parsed.poseDescription),
    cameraAngle: coerceAnalysisText(parsed.cameraAngle),
    compositionNotes: coerceAnalysisText(parsed.compositionNotes),
    generationGuidance: coerceAnalysisText(parsed.generationGuidance)
  }
}

export async function addAssetInspiration(
  projectId: string,
  assetId: string,
  sourcePath: string,
  options: { name?: string; notes?: string; analyze?: boolean } = {}
): Promise<IndieForgeProject['assets'][0]> {
  const { asset } = await getAsset(projectId, assetId)
  const id = randomUUID()
  const ext = extname(sourcePath) || '.png'
  const dir = getAssetInspirationDir(projectId, assetId)
  await mkdir(dir, { recursive: true })
  const dest = join(dir, `${id}${ext}`)
  await copyFile(sourcePath, dest)

  const inspiration: AssetInspiration = {
    id,
    name: options.name ?? basename(sourcePath, ext),
    filePath: dest,
    notes: options.notes,
    createdAt: new Date().toISOString()
  }

  if (options.analyze !== false) {
    inspiration.analysis = await analyzeAssetInspirationImage(dest)
    inspiration.analyzedAt = new Date().toISOString()
  }

  asset.inspirationImages = [...(asset.inspirationImages ?? []), inspiration]
  return saveAssetInProject(projectId, asset)
}

export async function deleteAssetInspiration(
  projectId: string,
  assetId: string,
  inspirationId: string
): Promise<IndieForgeProject['assets'][0]> {
  const { asset } = await getAsset(projectId, assetId)
  const inspiration = (asset.inspirationImages ?? []).find((i) => i.id === inspirationId)
  if (!inspiration) throw new Error('Inspiration image not found')

  try {
    await unlink(inspiration.filePath)
  } catch {
    // file may already be gone
  }

  asset.inspirationImages = (asset.inspirationImages ?? []).filter((i) => i.id !== inspirationId)
  return saveAssetInProject(projectId, asset)
}

export async function reanalyzeAssetInspiration(
  projectId: string,
  assetId: string,
  inspirationId: string
): Promise<IndieForgeProject['assets'][0]> {
  const { asset } = await getAsset(projectId, assetId)
  const inspiration = (asset.inspirationImages ?? []).find((i) => i.id === inspirationId)
  if (!inspiration) throw new Error('Inspiration image not found')

  inspiration.analysis = await analyzeAssetInspirationImage(inspiration.filePath)
  inspiration.analyzedAt = new Date().toISOString()
  asset.inspirationImages = (asset.inspirationImages ?? []).map((i) =>
    i.id === inspirationId ? inspiration : i
  )
  return saveAssetInProject(projectId, asset)
}

export function resolveAssetInspirations(
  asset: IndieForgeProject['assets'][0],
  inspirationIds?: string[]
): AssetInspiration[] {
  const all = asset.inspirationImages ?? []
  if (inspirationIds?.length) {
    return all.filter((i) => inspirationIds.includes(i.id))
  }
  return all
}

export function buildInspirationAnalysisBlock(inspirations: AssetInspiration[]): string {
  if (inspirations.length === 0) return ''

  return inspirations
    .map((ref) => {
      const a = ref.analysis
      if (!a) {
        return `- Inspiration "${ref.name}": attached reference photo${ref.notes ? ` (${ref.notes})` : ''}`
      }
      return [
        `- Inspiration "${ref.name}"`,
        ref.notes ? `  User notes: ${ref.notes}` : '',
        `  Summary: ${coerceAnalysisText(a.summary)}`,
        a.poseDescription ? `  Pose: ${coerceAnalysisText(a.poseDescription)}` : '',
        a.cameraAngle ? `  Camera: ${coerceAnalysisText(a.cameraAngle)}` : '',
        a.compositionNotes ? `  Composition: ${coerceAnalysisText(a.compositionNotes)}` : '',
        a.generationGuidance ? `  Match: ${coerceAnalysisText(a.generationGuidance)}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
}
