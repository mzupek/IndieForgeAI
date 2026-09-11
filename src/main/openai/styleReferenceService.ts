import { readFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { randomUUID } from 'crypto'
import { copyFile, mkdir, unlink } from 'fs/promises'
import type {
  IndieForgeProject,
  StyleReference,
  StyleReferenceAnalysis,
  StyleReferenceRole
} from '@shared/types/project'
import { getOpenAIClient, OPENAI_PLANNING_MODEL } from '../openai/openaiClient'
import { loadProject, saveProject } from '../storage/projectStore'
import { getPreviewMimeType } from '../storage/previewMime'
import { getStyleReferencesDir } from '../storage/filePaths'

async function imageToDataUrl(filePath: string): Promise<string> {
  const data = await readFile(filePath)
  const mime = getPreviewMimeType(filePath)
  return `data:${mime};base64,${data.toString('base64')}`
}

export async function analyzeStyleReferenceImage(filePath: string): Promise<StyleReferenceAnalysis> {
  const client = await getOpenAIClient()
  const dataUrl = await imageToDataUrl(filePath)

  const response = await client.chat.completions.create({
    model: OPENAI_PLANNING_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You analyze game art reference images for an indie asset pipeline. Return only valid JSON with keys: summary, colorPalette, artStyleNotes, generationGuidance, dosAndDonts. Be specific about colors, shapes, line weight, mood, and how generated sprites should match this reference.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analyze this reference image for game asset generation. Extract palette, art style, and practical guidance for AI image generation prompts.'
          },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No analysis returned from OpenAI')

  const parsed = JSON.parse(content) as Partial<StyleReferenceAnalysis>
  return {
    summary: parsed.summary ?? 'Reference image for project style.',
    colorPalette: parsed.colorPalette ?? '',
    artStyleNotes: parsed.artStyleNotes ?? '',
    generationGuidance: parsed.generationGuidance ?? '',
    dosAndDonts: parsed.dosAndDonts ?? ''
  }
}

export async function addStyleReference(
  projectId: string,
  sourcePath: string,
  options: { name?: string; role?: StyleReferenceRole; analyze?: boolean } = {}
): Promise<IndieForgeProject> {
  const project = await loadProject(projectId)
  const id = randomUUID()
  const ext = extname(sourcePath) || '.png'
  const dir = getStyleReferencesDir(projectId)
  await mkdir(dir, { recursive: true })
  const dest = join(dir, `${id}${ext}`)
  await copyFile(sourcePath, dest)

  const ref: StyleReference = {
    id,
    name: options.name ?? basename(sourcePath, ext),
    role: options.role ?? 'mood',
    filePath: dest,
    createdAt: new Date().toISOString()
  }

  if (options.analyze !== false) {
    ref.analysis = await analyzeStyleReferenceImage(dest)
    ref.analyzedAt = new Date().toISOString()
  }

  project.styleReferences = [...(project.styleReferences ?? []), ref]
  return saveProject(project)
}

export async function updateStyleReference(
  projectId: string,
  referenceId: string,
  patch: Partial<Pick<StyleReference, 'name' | 'role'>>
): Promise<IndieForgeProject> {
  const project = await loadProject(projectId)
  project.styleReferences = (project.styleReferences ?? []).map((ref) =>
    ref.id === referenceId ? { ...ref, ...patch } : ref
  )
  return saveProject(project)
}

export async function reanalyzeStyleReference(
  projectId: string,
  referenceId: string
): Promise<IndieForgeProject> {
  const project = await loadProject(projectId)
  const ref = (project.styleReferences ?? []).find((r) => r.id === referenceId)
  if (!ref) throw new Error('Style reference not found')

  ref.analysis = await analyzeStyleReferenceImage(ref.filePath)
  ref.analyzedAt = new Date().toISOString()
  return saveProject(project)
}

export async function deleteStyleReference(
  projectId: string,
  referenceId: string
): Promise<IndieForgeProject> {
  const project = await loadProject(projectId)
  const ref = (project.styleReferences ?? []).find((r) => r.id === referenceId)
  if (ref) {
    try {
      await unlink(ref.filePath)
    } catch {
      // file may already be missing
    }
  }
  project.styleReferences = (project.styleReferences ?? []).filter((r) => r.id !== referenceId)
  return saveProject(project)
}

export async function applyStyleReferenceAnalysisToGuide(
  projectId: string,
  referenceId: string
): Promise<IndieForgeProject> {
  const project = await loadProject(projectId)
  const ref = (project.styleReferences ?? []).find((r) => r.id === referenceId)
  if (!ref?.analysis) throw new Error('Reference has no analysis to apply')

  const { analysis } = ref
  const styleGuide = { ...project.styleGuide }

  if (analysis.colorPalette) {
    styleGuide.colorPalette = analysis.colorPalette
  }
  if (analysis.artStyleNotes) {
    styleGuide.artStyle = analysis.artStyleNotes
  }

  const refNote = `[${ref.name}] ${analysis.summary}\nGuidance: ${analysis.generationGuidance}\nAvoid: ${analysis.dosAndDonts}`
  styleGuide.notes = styleGuide.notes ? `${styleGuide.notes}\n\n${refNote}` : refNote

  project.styleGuide = styleGuide
  return saveProject(project)
}

export function getStyleReferencesForGeneration(
  project: IndieForgeProject,
  referenceIds?: string[]
): StyleReference[] {
  const refs = project.styleReferences ?? []
  if (referenceIds?.length) {
    return refs.filter((r) => referenceIds.includes(r.id))
  }
  return refs.filter((r) => r.analysis)
}
