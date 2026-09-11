import { copyFile, mkdir } from 'fs/promises'
import { basename, extname, join } from 'path'
import type { IndieForgeProject } from '@shared/types/project'
import type {
  AudioAssetProvider,
  AudioImportMeta,
  GeneratedAudioAsset
} from '@shared/types/provider'
import { createAsset, getAsset, saveAssetInProject } from '../../storage/assetStore'
import { getAudioAssetDir } from '../../storage/filePaths'

export class ManualImportAudioProvider implements AudioAssetProvider {
  id = 'manual-import-audio'
  name = 'Manual Import (Audio)'

  async importAudio(
    filePath: string,
    meta: AudioImportMeta,
    project: IndieForgeProject
  ): Promise<GeneratedAudioAsset> {
    let asset
    if (meta.assetId) {
      const result = await getAsset(meta.projectId, meta.assetId)
      asset = result.asset
    } else {
      asset = await createAsset(meta.projectId, {
        name: meta.name ?? basename(filePath, extname(filePath)),
        type: meta.type ?? 'sound_effect',
        sceneIds: meta.sceneIds
      })
    }

    const outDir = getAudioAssetDir(meta.projectId, asset.id)
    await mkdir(outDir, { recursive: true })
    const dest = join(outDir, basename(filePath))
    await copyFile(filePath, dest)

    asset.filePath = dest
    asset.status = 'generated'
    asset.providerId = this.id
    const saved = await saveAssetInProject(meta.projectId, asset)
    return { filePath: dest, asset: saved }
  }
}

export class SunoMusicProvider implements AudioAssetProvider {
  id = 'suno-music'
  name = 'Suno Music'
  async generateAudio(): Promise<GeneratedAudioAsset> {
    throw new Error('Suno provider not implemented')
  }
}

export class ElevenLabsVoiceProvider implements AudioAssetProvider {
  id = 'elevenlabs-voice'
  name = 'ElevenLabs Voice'
  async generateAudio(): Promise<GeneratedAudioAsset> {
    throw new Error('ElevenLabs provider not implemented')
  }
}

export class StableAudioSfxProvider implements AudioAssetProvider {
  id = 'stable-audio-sfx'
  name = 'Stable Audio SFX'
  async generateAudio(): Promise<GeneratedAudioAsset> {
    throw new Error('Stable Audio provider not implemented')
  }
}
