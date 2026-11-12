import { randomUUID } from 'crypto'
import { copyFile, mkdir } from 'fs/promises'
import { basename, extname, join } from 'path'
import sharp from 'sharp'
import type { AssetPipelineProject, Pose, PoseSlot } from '@shared/types/assetPipeline'
import type { PoseMetadata } from '@shared/poseValidation'
import { loadProject, saveProject } from './projectStore'
import {
  collectPoseBindingUsage,
  formatBindingInUseError
} from '../../shared/storyboard/eventValidation'
import {
  collectPoseTimedKeyUsage,
  formatTimedKeyInUseError
} from '../../shared/storyboard/timedKeys'

function getPoseAssetsDir(projectId: string): string {
  const { app } = require('electron')
  const userData = app.getPath('userData')
  return join(userData, 'projects', projectId, 'poses')
}

/**
 * Validate and extract metadata from pose image
 */
export async function validatePoseImage(filePath: string): Promise<PoseMetadata> {
  const image = sharp(filePath)
  const metadata = await image.metadata()
  
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read image dimensions')
  }

  const width = metadata.width
  const height = metadata.height
  const hasAlpha = metadata.channels === 4 || metadata.hasAlpha === true

  // Check corners for transparency (sample 10x10px from each corner)
  let cornersTransparent = false
  if (hasAlpha) {
    try {
      const cornerSize = 10
      const corners = [
        { left: 0, top: 0 },                                    // top-left
        { left: width - cornerSize, top: 0 },                   // top-right
        { left: 0, top: height - cornerSize },                  // bottom-left
        { left: width - cornerSize, top: height - cornerSize }  // bottom-right
      ]

      let transparentCorners = 0
      for (const corner of corners) {
        const region = await image
          .clone()
          .extract({ ...corner, width: cornerSize, height: cornerSize })
          .raw()
          .toBuffer({ resolveWithObject: true })

        // Check if average alpha < 128 (considered transparent)
        const pixels = region.data
        let totalAlpha = 0
        for (let i = 3; i < pixels.length; i += 4) {
          totalAlpha += pixels[i]
        }
        const avgAlpha = totalAlpha / (pixels.length / 4)
        if (avgAlpha < 128) {
          transparentCorners++
        }
      }

      // At least 3 out of 4 corners should be transparent
      cornersTransparent = transparentCorners >= 3
    } catch (err) {
      console.warn('Failed to check corner transparency:', err)
      cornersTransparent = false
    }
  }

  return {
    width,
    height,
    hasAlpha,
    cornersTransparent
  }
}

/**
 * Create or update a pose
 */
export async function importPose(
  projectId: string,
  characterId: string,
  slot: PoseSlot,
  sourcePath: string,
  options?: {
    facing?: 'left' | 'right' | 'front' | 'back'
    replace?: boolean
  }
): Promise<Pose> {
  const project = await loadProject(projectId)
  
  if (!project.assetPipeline) {
    throw new Error('Project has no asset pipeline data')
  }

  // Validate image
  const metadata = await validatePoseImage(sourcePath)

  const assetsDir = getPoseAssetsDir(projectId)
  await mkdir(assetsDir, { recursive: true })

  const now = new Date().toISOString()
  const ext = extname(sourcePath)
  
  // Check if pose already exists
  const existingPose = project.assetPipeline.poses.find(
    (p) => p.characterId === characterId && p.slot === slot
  )

  let pose: Pose
  if (existingPose && options?.replace) {
    // Replace existing pose
    const poseFileName = `${existingPose.id}_pose${ext}`
    const thumbFileName = `${existingPose.id}_thumb.png`
    
    const posePath = join(assetsDir, poseFileName)
    const thumbPath = join(assetsDir, thumbFileName)

    await copyFile(sourcePath, posePath)
    await sharp(sourcePath)
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(thumbPath)

    pose = {
      ...existingPose,
      file: posePath,
      updatedAt: now
    }

    const index = project.assetPipeline.poses.findIndex((p) => p.id === existingPose.id)
    project.assetPipeline.poses[index] = pose
  } else {
    // Create new pose
    const poseId = randomUUID()
    const poseFileName = `${poseId}_pose${ext}`
    const thumbFileName = `${poseId}_thumb.png`
    
    const posePath = join(assetsDir, poseFileName)
    const thumbPath = join(assetsDir, thumbFileName)

    await copyFile(sourcePath, posePath)
    await sharp(sourcePath)
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(thumbPath)

    pose = {
      id: poseId,
      characterId,
      slot,
      file: posePath,
      status: 'approved',
      source: 'import',
      createdAt: now,
      updatedAt: now
    }

    project.assetPipeline.poses.push(pose)
  }

  await saveProject(project)
  return pose
}

/**
 * Remove a pose
 */
export async function removePose(
  projectId: string,
  poseId: string
): Promise<void> {
  const project = await loadProject(projectId)
  
  if (!project.assetPipeline) {
    throw new Error('Project has no asset pipeline data')
  }

  const pose = project.assetPipeline.poses.find((p) => p.id === poseId)
  if (!pose) {
    throw new Error(`Pose not found: ${poseId}`)
  }
  const pipeline = project.assetPipeline as unknown as AssetPipelineProject
  const bindingUsage = collectPoseBindingUsage(pipeline, poseId)
  if (bindingUsage.labels.length > 0) {
    throw new Error(formatBindingInUseError('pose', pose.slot, bindingUsage.labels))
  }
  const keyUsage = collectPoseTimedKeyUsage(pipeline, poseId)
  if (keyUsage.labels.length > 0) {
    throw new Error(formatTimedKeyInUseError('pose', pose.slot, keyUsage.labels))
  }

  project.assetPipeline.poses = project.assetPipeline.poses.filter(
    (p) => p.id !== poseId
  )

  await saveProject(project)
}

/**
 * Update pose status or metadata
 */
export async function updatePose(
  projectId: string,
  poseId: string,
  patch: Partial<Omit<Pose, 'id' | 'characterId' | 'slot' | 'file' | 'createdAt'>>
): Promise<Pose> {
  const project = await loadProject(projectId)
  
  if (!project.assetPipeline) {
    throw new Error('Project has no asset pipeline data')
  }

  const index = project.assetPipeline.poses.findIndex((p) => p.id === poseId)
  if (index === -1) {
    throw new Error(`Pose not found: ${poseId}`)
  }

  const existing = project.assetPipeline.poses[index]
  const updated: Pose = {
    ...existing,
    ...patch,
    id: existing.id,
    characterId: existing.characterId,
    slot: existing.slot,
    file: existing.file,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  }

  project.assetPipeline.poses[index] = updated
  await saveProject(project)
  return updated
}

/**
 * Get pose metadata map for validation
 */
export async function getPoseMetadataMap(
  projectId: string,
  characterId: string
): Promise<Map<string, PoseMetadata>> {
  const project = await loadProject(projectId)
  
  if (!project.assetPipeline) {
    return new Map()
  }

  const poses = project.assetPipeline.poses.filter((p) => p.characterId === characterId)
  const metadataMap = new Map<string, PoseMetadata>()

  for (const pose of poses) {
    try {
      const metadata = await validatePoseImage(pose.file)
      metadataMap.set(pose.id, metadata)
    } catch (err) {
      console.error(`Failed to validate pose ${pose.id}:`, err)
    }
  }

  return metadataMap
}
