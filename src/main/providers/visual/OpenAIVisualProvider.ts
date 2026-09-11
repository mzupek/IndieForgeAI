import { mkdir } from 'fs/promises'
import { join } from 'path'
import type { IndieForgeProject } from '@shared/types/project'
import type {
  GeneratedVisualAsset,
  VisualAssetProvider,
  VisualEditRequest,
  VisualGenerationRequest
} from '@shared/types/provider'
import { getDesignSpriteSize } from '@shared/styleGuide'
import { getOpenAIClient } from '../../openai/openaiClient'
import { generateOpenAIImage, editOpenAIImage, getOpenAIImageSize } from '../../openai/openaiImageService'
import {
  buildBackgroundPrompt,
  buildEffectPrompt,
  buildIconPrompt,
  buildSpritePrompt,
  buildVariationPrompt,
  buildInspirationGuidedSpritePrompt,
  appendStyleReferencesToPrompt
} from '../../openai/promptBuilders'
import { resolveAssetInspirations } from '../../openai/assetInspirationService'
import { getAsset, saveAssetInProject } from '../../storage/assetStore'
import { getGeneratedDir } from '../../storage/filePaths'

function isBackgroundAsset(asset: IndieForgeProject['assets'][0]): boolean {
  return asset.type === 'background'
}

function buildPromptForAsset(project: IndieForgeProject, asset: IndieForgeProject['assets'][0], extra?: string): string {
  switch (asset.type) {
    case 'background':
      return buildBackgroundPrompt(
        project,
        asset.name,
        asset.description,
        {
          width: project.styleGuide.defaultBackgroundWidth,
          height: project.styleGuide.defaultBackgroundHeight
        }
      )
    case 'effect':
      return buildEffectPrompt(project, asset.name, asset.description)
    case 'ui_icon':
      return buildIconPrompt(project, asset.name, asset.description)
    case 'animation':
    case 'sprite':
    case 'prop':
    default:
      return buildSpritePrompt(project, asset.name, asset.description, extra)
  }
}

export class OpenAIVisualProvider implements VisualAssetProvider {
  id = 'openai-visual'
  name = 'OpenAI Visual'

  async generateImage(
    request: VisualGenerationRequest,
    project: IndieForgeProject
  ): Promise<GeneratedVisualAsset> {
    const { asset } = await getAsset(request.projectId, request.assetId)
    const client = await getOpenAIClient()
    const userPrompt =
      request.overrides?.prompt ??
      (asset.prompt || buildPromptForAsset(project, asset))

    const inspirations = resolveAssetInspirations(asset, request.overrides?.inspirationIds)
    const useInspiration = inspirations.length > 0 && !isBackgroundAsset(asset)
    const placementCrop =
      !isBackgroundAsset(asset) ? request.overrides?.referenceImagePath : undefined
    const stylePaths = (request.overrides?.styleImagePaths ?? []).filter(Boolean)
    const cameraPaths = (request.overrides?.cameraImagePaths ?? []).filter(Boolean)

    const basePrompt = useInspiration
      ? buildInspirationGuidedSpritePrompt(
          project,
          asset.name,
          asset.description,
          inspirations,
          request.overrides?.prompt
        )
      : userPrompt

    const prompt = appendStyleReferencesToPrompt(
      basePrompt,
      project,
      request.overrides?.referenceIds
    )

    const designSize = getDesignSpriteSize(project.styleGuide)
    const isBackground = asset.type === 'background'

    const targetWidth =
      request.overrides?.width ??
      (isBackground ? project.styleGuide.defaultBackgroundWidth : designSize.width)
    const targetHeight =
      request.overrides?.height ??
      (isBackground ? project.styleGuide.defaultBackgroundHeight : designSize.height)

    const outDir = getGeneratedDir(request.projectId, request.assetId)
    await mkdir(outDir, { recursive: true })
    const designPath = join(outDir, isBackground ? 'background_design.png' : 'design.png')

    const imageOptions = {
      size: getOpenAIImageSize(targetWidth, targetHeight),
      transparentBackground: request.overrides?.transparentBackground ?? !isBackground
    }

    const editSources: string[] = []
    const hintParts: string[] = []

    if (useInspiration) {
      for (const insp of inspirations) {
        editSources.push(insp.filePath)
      }
      hintParts.push(
        inspirations.length > 1
          ? 'Images 1…N are pose/composition inspiration photos — convert to pixel art matching those poses.'
          : 'Image 1 is a pose/composition inspiration photo — convert to a pixel art sprite matching that pose.'
      )
    }

    if (placementCrop) {
      editSources.push(placementCrop)
      hintParts.push(
        `Image ${editSources.length} is a crop of the scene background under this asset’s slot — use for footing, scale, and camera only; do not redraw the scenery.`
      )
    }

    for (const cameraPath of cameraPaths) {
      if (editSources.includes(cameraPath)) continue
      editSources.push(cameraPath)
      hintParts.push(
        `Image ${editSources.length} is a real-world camera / viewpoint reference (e.g. umpire behind home plate) — match perspective, camera height, and angle; do not copy photo textures.`
      )
    }

    for (const stylePath of stylePaths) {
      if (editSources.includes(stylePath)) continue
      editSources.push(stylePath)
      hintParts.push(
        `Image ${editSources.length} is a cast/style reference — match pixel style, palette, outline, and proportions; keep this asset’s own role/pose.`
      )
    }

    if (editSources.length > 0) {
      await editOpenAIImage(client, editSources, prompt, designPath, {
        ...imageOptions,
        multiImageHint: `${hintParts.join(' ')} Output a single transparent game sprite (unless generating a full background) that fits this cast.`
      })
    } else {
      await generateOpenAIImage(client, prompt, designPath, imageOptions)
    }

    // Keep full design resolution for review; downscale only at export time.
    asset.filePath = designPath
    asset.status = 'generated'
    asset.providerId = this.id
    asset.metadata = {
      ...asset.metadata,
      designPath,
      designWidth: targetWidth,
      designHeight: targetHeight,
      exportWidth: project.styleGuide.defaultSpriteWidth,
      exportHeight: project.styleGuide.defaultSpriteHeight
    }
    if (request.overrides?.prompt) asset.prompt = request.overrides.prompt

    const saved = await saveAssetInProject(request.projectId, asset)
    return { filePath: designPath, previewPath: designPath, asset: saved }
  }

  async editImage(
    request: VisualEditRequest,
    project: IndieForgeProject
  ): Promise<GeneratedVisualAsset> {
    const { asset } = await getAsset(request.projectId, request.assetId)
    if (!asset.filePath) {
      throw new Error('No existing image to refine — generate a base image first')
    }

    const client = await getOpenAIClient()
    const prompt = appendStyleReferencesToPrompt(
      buildVariationPrompt(project, asset.name, request.editPrompt),
      project
    )

    const designSize = getDesignSpriteSize(project.styleGuide)
    const isBackground = asset.type === 'background'
    const targetWidth =
      (asset.metadata?.designWidth as number | undefined) ??
      (isBackground ? project.styleGuide.defaultBackgroundWidth : designSize.width)
    const targetHeight =
      (asset.metadata?.designHeight as number | undefined) ??
      (isBackground ? project.styleGuide.defaultBackgroundHeight : designSize.height)

    const outDir = getGeneratedDir(request.projectId, request.assetId)
    await mkdir(outDir, { recursive: true })
    const designPath = join(outDir, isBackground ? 'background_design.png' : 'design.png')

    await editOpenAIImage(client, asset.filePath, prompt, designPath, {
      size: getOpenAIImageSize(targetWidth, targetHeight),
      transparentBackground: !isBackground,
      multiImageHint:
        'Refine this game asset. Apply only the requested edits while preserving style and composition.'
    })

    asset.filePath = designPath
    asset.status = 'generated'
    asset.providerId = this.id
    asset.metadata = {
      ...asset.metadata,
      designPath,
      designWidth: targetWidth,
      designHeight: targetHeight
    }

    const saved = await saveAssetInProject(request.projectId, asset)
    return { filePath: designPath, previewPath: designPath, asset: saved }
  }
}

export class ManualImportVisualProvider implements VisualAssetProvider {
  id = 'manual-import-visual'
  name = 'Manual Import (Visual)'

  async generateImage(): Promise<GeneratedVisualAsset> {
    throw new Error('Use assets:importVisual for manual visual import')
  }
}

export class AdobeFireflyVisualProvider implements VisualAssetProvider {
  id = 'adobe-firefly'
  name = 'Adobe Firefly'
  async generateImage(): Promise<GeneratedVisualAsset> {
    throw new Error('Adobe Firefly provider not implemented')
  }
}
