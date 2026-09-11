import { copyFile, mkdir, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import type { IndieForgeProject } from '@shared/types/project'
import { ensureSceneBlueprint } from '@shared/sceneDefaults'
import { loadProject } from '../storage/projectStore'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'unnamed'
}

/**
 * Export a placement-aware scene package: scene.json + images for filled slots.
 */
export async function exportScenePackage(
  projectId: string,
  sceneId: string,
  exportDir: string
): Promise<{ packageDir: string; manifestPath: string; copiedPaths: string[] }> {
  const project = await loadProject(projectId)
  const raw = project.scenes.find((s) => s.id === sceneId)
  if (!raw) throw new Error(`Scene not found: ${sceneId}`)
  const scene = ensureSceneBlueprint(raw, project.styleGuide)

  const packageDir = join(
    exportDir,
    slugify(project.name),
    slugify(scene.name)
  )
  const imagesDir = join(packageDir, 'images')
  await mkdir(imagesDir, { recursive: true })

  const copiedPaths: string[] = []
  const assets = []

  for (const slot of scene.assetSlots ?? []) {
    if (!slot.assetId) continue
    const asset = project.assets.find((a) => a.id === slot.assetId)
    if (!asset?.filePath) continue

    const fileName = `${slugify(slot.name)}${extFromPath(asset.filePath)}`
    const dest = join(imagesDir, fileName)
    await copyFile(asset.filePath, dest)
    copiedPaths.push(dest)

    assets.push({
      id: slot.id,
      assetId: asset.id,
      name: slot.name,
      role: slot.role,
      format: slot.format,
      file: `images/${fileName}`,
      anchor: slot.anchor,
      position: {
        x: slot.bounds.x + slot.bounds.width / 2,
        y: slot.bounds.y + slot.bounds.height
      },
      bounds: slot.bounds,
      scale: slot.bounds.height,
      layer: slot.layer,
      status: slot.status,
      contract: {
        canvas: slot.contract.canvas,
        transparent: slot.contract.transparent,
        export: slot.contract.export
      }
    })
  }

  // Also include legacy scene assets not represented as slots
  const slottedIds = new Set((scene.assetSlots ?? []).map((s) => s.assetId).filter(Boolean))
  for (const assetId of scene.assetIds) {
    if (slottedIds.has(assetId)) continue
    const asset = project.assets.find((a) => a.id === assetId)
    if (!asset?.filePath) continue
    const fileName = `${slugify(asset.name)}${extFromPath(asset.filePath)}`
    const dest = join(imagesDir, fileName)
    await copyFile(asset.filePath, dest)
    copiedPaths.push(dest)
    assets.push({
      id: asset.id,
      assetId: asset.id,
      name: asset.name,
      role: 'environment_prop',
      format: 'static_image',
      file: `images/${fileName}`,
      anchor: 'center',
      position: { x: 0.5, y: 0.5 },
      bounds: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      scale: 0.5,
      layer: 0,
      status: asset.status,
      contract: {
        canvas: { width: 1024, height: 1024 },
        transparent: true,
        export: { target: 'generic', filtering: 'nearest', compression: 'lossless' }
      }
    })
  }

  const manifest = {
    projectName: project.name,
    scene: scene.name,
    sceneId: scene.id,
    description: scene.description,
    orientation: scene.viewport?.orientation ?? 'portrait',
    referenceResolution: {
      width: scene.viewport?.width ?? 1080,
      height: scene.viewport?.height ?? 1920
    },
    camera: scene.camera,
    layers: scene.layers ?? [],
    exportedAt: new Date().toISOString(),
    assets
  }

  const manifestPath = join(packageDir, 'scene.json')
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  return { packageDir, manifestPath, copiedPaths }
}

function extFromPath(filePath: string): string {
  const base = basename(filePath)
  const i = base.lastIndexOf('.')
  return i >= 0 ? base.slice(i) : '.png'
}

/** Backward-compatible flat scene manifest (kept for ExportPanel). */
export async function exportSceneManifest(
  project: IndieForgeProject,
  sceneId: string,
  outputPath: string
): Promise<string> {
  const scene = project.scenes.find((s) => s.id === sceneId)
  if (!scene) throw new Error(`Scene not found: ${sceneId}`)

  const { writeFile: wf } = await import('fs/promises')
  const { basename: bn } = await import('path')

  const manifest = {
    projectName: project.name,
    scene: scene.name,
    exportedAt: new Date().toISOString(),
    referenceResolution: scene.viewport
      ? { width: scene.viewport.width, height: scene.viewport.height }
      : undefined,
    camera: scene.camera,
    layers: scene.layers,
    assets: (scene.assetSlots?.length
      ? scene.assetSlots.map((slot) => {
          const asset = slot.assetId
            ? project.assets.find((a) => a.id === slot.assetId)
            : undefined
          return {
            id: slot.id,
            assetId: slot.assetId,
            name: slot.name,
            role: slot.role,
            format: slot.format,
            type: asset?.type,
            filePath: asset?.filePath ? bn(asset.filePath) : undefined,
            anchor: slot.anchor,
            bounds: slot.bounds,
            layer: slot.layer,
            status: slot.status
          }
        })
      : scene.assetIds
          .map((aid) => project.assets.find((a) => a.id === aid))
          .filter(Boolean)
          .map((a) => ({
            id: a!.id,
            name: a!.name,
            type: a!.type,
            filePath: a!.filePath ? bn(a!.filePath) : undefined
          }))) as unknown[]
  }
  await wf(outputPath, JSON.stringify(manifest, null, 2), 'utf-8')
  return outputPath
}
