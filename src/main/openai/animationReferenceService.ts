import { readFile } from 'fs/promises'
import { getOpenAIClient, OPENAI_PLANNING_MODEL } from './openaiClient'
import { getPreviewMimeType } from '../storage/previewMime'

async function imageToDataUrl(filePath: string): Promise<string> {
  const data = await readFile(filePath)
  const mime = getPreviewMimeType(filePath)
  return `data:${mime};base64,${data.toString('base64')}`
}

/** Extract a stable character description from frame 0 for text prompts */
export async function describeAnimationReferenceImage(imagePath: string): Promise<string> {
  const client = await getOpenAIClient()
  const dataUrl = await imageToDataUrl(imagePath)

  const response = await client.chat.completions.create({
    model: OPENAI_PLANNING_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You describe game sprite characters for animation frame consistency. Be concise and specific about: silhouette, colors (hex or names), outfit, proportions, line weight, pixel style, facing direction, and any props. Output plain text only — no JSON.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this sprite character in detail so another AI can redraw the SAME character in a different pose. Focus on identity-locked traits that must not change between frames.'
          },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  })

  return (
    response.choices[0]?.message?.content?.trim() ??
    'Match the reference character design exactly.'
  )
}
