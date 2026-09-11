import OpenAI from 'openai'
import { getOpenAIKey } from '../storage/configStore'

let client: OpenAI | null = null
let clientKey: string | null = null

export function resetOpenAIClient(): void {
  client = null
  clientKey = null
}

export async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getOpenAIKey()
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in .env or save a key on the dashboard.')
  }
  if (!client || clientKey !== apiKey) {
    client = new OpenAI({ apiKey })
    clientKey = apiKey
  }
  return client
}

// Override via OPENAI_IMAGE_MODEL env var if needed (e.g. gpt-image-1-mini)
export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1'
export const OPENAI_PLANNING_MODEL = process.env.OPENAI_PLANNING_MODEL ?? 'gpt-4o'
