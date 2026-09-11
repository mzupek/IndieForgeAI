import type { AudioAssetProvider } from '@shared/types/provider'
import type { VisualAssetProvider } from '@shared/types/provider'
import { OpenAIVisualProvider, ManualImportVisualProvider } from './visual/OpenAIVisualProvider'
import { ManualImportAudioProvider } from './audio/ManualImportAudioProvider'

const visualProviders = new Map<string, VisualAssetProvider>()
const audioProviders = new Map<string, AudioAssetProvider>()

visualProviders.set('openai-visual', new OpenAIVisualProvider())
visualProviders.set('manual-import-visual', new ManualImportVisualProvider())

audioProviders.set('manual-import-audio', new ManualImportAudioProvider())

export function getVisualProvider(id: string): VisualAssetProvider {
  const provider = visualProviders.get(id)
  if (!provider) throw new Error(`Visual provider not found: ${id}`)
  return provider
}

export function getAudioProvider(id: string): AudioAssetProvider {
  const provider = audioProviders.get(id)
  if (!provider) throw new Error(`Audio provider not found: ${id}`)
  return provider
}

export function listVisualProviders(): VisualAssetProvider[] {
  return Array.from(visualProviders.values())
}

export function listAudioProviders(): AudioAssetProvider[] {
  return Array.from(audioProviders.values())
}
