import type { ExportSpriteSize, ProjectStyleGuide } from './types/project'

export const EXPORT_SIZE_PRESETS: Array<{ label: string; width: number; height: number }> = [
  { label: '32×32', width: 32, height: 32 },
  { label: '64×64', width: 64, height: 64 },
  { label: '128×128', width: 128, height: 128 },
  { label: '256×256', width: 256, height: 256 },
  { label: '512×512', width: 512, height: 512 }
]

export function getDesignSpriteSize(styleGuide: ProjectStyleGuide): ExportSpriteSize {
  return {
    width: styleGuide.designSpriteWidth ?? 1024,
    height: styleGuide.designSpriteHeight ?? 1024
  }
}

export function getExportSpriteSize(styleGuide: ProjectStyleGuide): ExportSpriteSize {
  return {
    width: styleGuide.defaultSpriteWidth,
    height: styleGuide.defaultSpriteHeight
  }
}

export function resolveExportSpriteSize(
  styleGuide: ProjectStyleGuide,
  override?: ExportSpriteSize | null
): ExportSpriteSize {
  if (override && override.width > 0 && override.height > 0) {
    return override
  }
  return getExportSpriteSize(styleGuide)
}
