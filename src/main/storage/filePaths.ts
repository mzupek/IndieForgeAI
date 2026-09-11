import { join } from 'path'
import { app } from 'electron'

export function getProjectsRoot(): string {
  return join(app.getPath('userData'), 'projects')
}

export function getProjectDir(projectId: string): string {
  return join(getProjectsRoot(), projectId)
}

export function getProjectFilePath(projectId: string): string {
  return join(getProjectDir(projectId), 'project.json')
}

export function getVisualAssetDir(projectId: string, assetId: string): string {
  return join(getProjectDir(projectId), 'assets', 'visual', assetId)
}

export function getAudioAssetDir(projectId: string, assetId: string): string {
  return join(getProjectDir(projectId), 'assets', 'audio', assetId)
}

export function getGeneratedDir(projectId: string, assetId: string): string {
  return join(getProjectDir(projectId), 'generated', assetId)
}

export function getGeneratedFramesDir(projectId: string, assetId: string): string {
  return join(getGeneratedDir(projectId, assetId), 'frames')
}

export function getExportsDir(projectId: string, timestamp?: string): string {
  const ts = timestamp ?? new Date().toISOString().replace(/[:.]/g, '-')
  return join(getProjectDir(projectId), 'exports', ts)
}

export function getAssetInspirationDir(projectId: string, assetId: string): string {
  return join(getVisualAssetDir(projectId, assetId), 'inspiration')
}

export function getCraftDir(projectId: string, assetId: string): string {
  return join(getVisualAssetDir(projectId, assetId), 'craft')
}

export function getStyleReferencesDir(projectId: string): string {
  return join(getProjectDir(projectId), 'style-references')
}

export function getSceneReferencesDir(projectId: string, sceneId: string): string {
  return join(getProjectDir(projectId), 'scene-references', sceneId)
}

export function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}
