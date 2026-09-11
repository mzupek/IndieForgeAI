import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { getConfigPath } from '../storage/filePaths'

interface AppConfig {
  openaiApiKey?: string
}

let cachedConfig: AppConfig | null = null

async function loadConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig
  const path = getConfigPath()
  if (!existsSync(path)) {
    cachedConfig = {}
    return cachedConfig
  }
  const raw = await readFile(path, 'utf-8')
  cachedConfig = JSON.parse(raw) as AppConfig
  return cachedConfig
}

async function saveConfig(config: AppConfig): Promise<void> {
  const path = getConfigPath()
  await mkdir(path.replace(/[/\\][^/\\]+$/, ''), { recursive: true })
  await writeFile(path, JSON.stringify(config, null, 2), 'utf-8')
  cachedConfig = config
}

export async function getOpenAIKey(): Promise<string | undefined> {
  const config = await loadConfig()
  if (config.openaiApiKey?.trim()) return config.openaiApiKey.trim()

  const envKey = process.env.OPENAI_API_KEY?.trim()
  if (envKey && envKey !== 'sk-your-key-here') return envKey

  return undefined
}

export async function isOpenAIConfigured(): Promise<boolean> {
  const key = await getOpenAIKey()
  return Boolean(key && key.length > 0)
}

export async function setOpenAIKey(apiKey: string): Promise<void> {
  const config = await loadConfig()
  config.openaiApiKey = apiKey.trim()
  await saveConfig(config)
}
