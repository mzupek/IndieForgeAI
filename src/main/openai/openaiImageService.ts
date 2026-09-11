import { writeFile } from 'fs/promises'
import type OpenAI from 'openai'
import { OPENAI_IMAGE_MODEL } from './openaiClient'
import { openAIUploadableFromPath, openAIUploadablesFromPaths } from './openAIImageUpload'

// gpt-image-1 supported sizes (dall-e-3 sizes differ — see getOpenAIImageSize)
export type OpenAIImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto'

export function getOpenAIImageSize(width: number, height: number): OpenAIImageSize {
  const ratio = width / height
  if (ratio > 1.2) return '1536x1024'
  if (ratio < 0.8) return '1024x1536'
  return '1024x1024'
}

export interface GenerateOpenAIImageOptions {
  size?: OpenAIImageSize
  transparentBackground?: boolean
  quality?: 'low' | 'medium' | 'high' | 'auto'
}

export async function generateOpenAIImage(
  client: OpenAI,
  prompt: string,
  outputPath: string,
  options: GenerateOpenAIImageOptions = {}
): Promise<void> {
  const size = options.size ?? '1024x1024'
  const transparent = options.transparentBackground ?? false

  const response = await client.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    n: 1,
    size,
    output_format: 'png',
    ...(transparent ? { background: 'transparent' as const } : {}),
    ...(options.quality ? { quality: options.quality } : { quality: 'medium' as const })
  })

  const item = response.data?.[0]
  if (!item) throw new Error('No image returned from OpenAI')

  if (item.b64_json) {
    await writeFile(outputPath, Buffer.from(item.b64_json, 'base64'))
    return
  }

  if (item.url) {
    const download = await fetch(item.url)
    if (!download.ok) throw new Error(`Failed to download image: ${download.statusText}`)
    await writeFile(outputPath, Buffer.from(await download.arrayBuffer()))
    return
  }

  throw new Error('No image URL or base64 data returned from OpenAI')
}

export interface EditOpenAIImageOptions extends GenerateOpenAIImageOptions {
  /** When multiple source images are provided, describe their roles in the prompt */
  multiImageHint?: string
}

export async function editOpenAIImage(
  client: OpenAI,
  sourceImagePaths: string | string[],
  prompt: string,
  outputPath: string,
  options: EditOpenAIImageOptions = {}
): Promise<void> {
  const paths = Array.isArray(sourceImagePaths) ? sourceImagePaths : [sourceImagePaths]
  if (paths.length === 0) throw new Error('At least one source image is required for edit')

  const size = options.size ?? '1024x1024'
  const transparent = options.transparentBackground ?? false
  const image =
    paths.length === 1
      ? await openAIUploadableFromPath(paths[0])
      : await openAIUploadablesFromPaths(paths)

  const fullPrompt = options.multiImageHint ? `${options.multiImageHint}\n\n${prompt}` : prompt

  const response = await client.images.edit({
    model: OPENAI_IMAGE_MODEL,
    image,
    prompt: fullPrompt,
    n: 1,
    size,
    ...(transparent ? { background: 'transparent' as const } : {}),
    ...(options.quality ? { quality: options.quality } : { quality: 'medium' as const })
  })

  const item = response.data?.[0]
  if (!item) throw new Error('No edited image returned from OpenAI')

  if (item.b64_json) {
    await writeFile(outputPath, Buffer.from(item.b64_json, 'base64'))
    return
  }

  if (item.url) {
    const download = await fetch(item.url)
    if (!download.ok) throw new Error(`Failed to download edited image: ${download.statusText}`)
    await writeFile(outputPath, Buffer.from(await download.arrayBuffer()))
    return
  }

  throw new Error('No edited image URL or base64 data returned from OpenAI')
}
