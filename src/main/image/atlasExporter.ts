import { writeFile } from 'fs/promises'
import { basename, join } from 'path'
import type { AnimationClip, AtlasJson } from '@shared/types/project'
import type { FrameRect } from '@shared/types/project'

export async function exportAtlasJson(
  clip: AnimationClip,
  sheetFileName: string,
  frameRects: FrameRect[],
  outputPath: string
): Promise<AtlasJson> {
  const atlas: AtlasJson = {
    meta: {
      image: sheetFileName,
      size: {
        w: frameRects.length > 0 ? Math.max(...frameRects.map((f) => f.x + f.w)) : clip.frameWidth,
        h: frameRects.length > 0 ? Math.max(...frameRects.map((f) => f.y + f.h)) : clip.frameHeight
      },
      frameWidth: clip.frameWidth,
      frameHeight: clip.frameHeight
    },
    frames: {}
  }

  clip.frames.forEach((frame, i) => {
    const rect = frameRects.find((r) => r.frameIndex === i) ?? frameRects[i]
    if (!rect) return
    atlas.frames[`frame_${i}`] = {
      frame: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      duration: frame.durationMs,
      approved: frame.approved
    }
  })

  await writeFile(outputPath, JSON.stringify(atlas, null, 2), 'utf-8')
  return atlas
}

export async function exportProjectManifest(
  project: { name: string; scenes: Array<{ id: string; name: string; assetIds: string[] }>; assets: Array<{ id: string; name: string; type: string; filePath?: string; sceneIds: string[] }> },
  outputPath: string
): Promise<string> {
  const manifest = {
    projectName: project.name,
    exportedAt: new Date().toISOString(),
    scenes: project.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      assets: scene.assetIds
        .map((aid) => project.assets.find((a) => a.id === aid))
        .filter(Boolean)
        .map((a) => ({
          id: a!.id,
          name: a!.name,
          type: a!.type,
          filePath: a!.filePath ? basename(a!.filePath) : undefined
        }))
    })),
    assets: project.assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      sceneIds: a.sceneIds,
      filePath: a.filePath ? basename(a.filePath) : undefined
    }))
  }
  await writeFile(outputPath, JSON.stringify(manifest, null, 2), 'utf-8')
  return outputPath
}

export async function exportSceneManifest(
  project: { name: string; scenes: Array<{ id: string; name: string; assetIds: string[] }>; assets: Array<{ id: string; name: string; type: string; filePath?: string }> },
  sceneId: string,
  outputPath: string
): Promise<string> {
  const scene = project.scenes.find((s) => s.id === sceneId)
  if (!scene) throw new Error(`Scene not found: ${sceneId}`)

  const manifest = {
    projectName: project.name,
    scene: scene.name,
    exportedAt: new Date().toISOString(),
    assets: scene.assetIds
      .map((aid) => project.assets.find((a) => a.id === aid))
      .filter(Boolean)
      .map((a) => ({
        id: a!.id,
        name: a!.name,
        type: a!.type,
        filePath: a!.filePath ? basename(a!.filePath) : undefined
      }))
  }
  await writeFile(outputPath, JSON.stringify(manifest, null, 2), 'utf-8')
  return outputPath
}
