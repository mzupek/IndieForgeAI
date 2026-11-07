import { randomUUID } from 'crypto'
import { copyFile, mkdir } from 'fs/promises'
import { extname, basename } from 'path'
import sharp from 'sharp'
import type { Pose, PoseSlot } from '@shared/types/assetPipeline'
import { mapFilenameToSlot } from '@shared/poseValidation'
import { getAssetPipeline, updateAssetPipeline } from '@core/storage/studioStorage'
import { getDataDir } from '@core/storage/dataDir'
import { output, outputError } from '../utils/output'
import {
  collectPoseBindingUsage,
  formatBindingInUseError
} from '../../shared/storyboard/eventValidation'
import {
  collectPoseTimedKeyUsage,
  formatTimedKeyInUseError
} from '../../shared/storyboard/timedKeys'
import { join } from 'path'

interface Options {
  dataDir?: string
  json?: boolean
  slot?: PoseSlot
}

async function verifyCharacterExists(characterId: string, dataDir?: string) {
  const pipeline = await getAssetPipeline(dataDir)
  
  if (!pipeline.characters.some(c => c.id === characterId)) {
    throw new Error(`Character not found: ${characterId}`)
  }
}

export async function importPoses(
  characterId: string,
  files: string[],
  options: Options
): Promise<void> {
  try {
    await verifyCharacterExists(characterId, options.dataDir)
    const pipeline = await getAssetPipeline(options.dataDir)
    
    const character = pipeline.characters.find(c => c.id === characterId)
    if (!character) {
      throw new Error(`Character not found: ${characterId}`)
    }
    
    const imported: Pose[] = []
    const errors: string[] = []
    
    for (const filePath of files) {
      try {
        let slot: PoseSlot | null = null
        
        if (options.slot) {
          slot = options.slot
        } else {
          // Auto-map by filename
          const filename = basename(filePath)
          slot = mapFilenameToSlot(filename)
          
          if (!slot) {
            errors.push(`${filePath}: Could not determine slot from filename`)
            continue
          }
        }
        
        // Check if pose already exists for this slot
        const existingIndex = pipeline.poses.findIndex(
          p => p.characterId === characterId && p.slot === slot
        )
        
        const now = new Date().toISOString()
        const poseId = existingIndex >= 0 ? pipeline.poses[existingIndex].id : randomUUID()
        const ext = extname(filePath)
        
        const posesDir = join(getDataDir(options.dataDir), 'poses')
        const posePath = join(posesDir, `${poseId}_pose${ext}`)
        const thumbPath = join(posesDir, `${poseId}_thumb.png`)
        
        await mkdir(posesDir, { recursive: true })
        await copyFile(filePath, posePath)
        await sharp(filePath)
          .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(thumbPath)
        
        const pose: Pose = {
          id: poseId,
          characterId,
          slot,
          file: posePath,
          status: 'draft', // CLI always imports as draft - only UI can approve
          source: 'import',
          createdAt: existingIndex >= 0 ? pipeline.poses[existingIndex].createdAt : now,
          updatedAt: now
        }
        
        if (existingIndex >= 0) {
          pipeline.poses[existingIndex] = pose
        } else {
          pipeline.poses.push(pose)
        }
        
        imported.push(pose)
      } catch (err: any) {
        errors.push(`${filePath}: ${err.message}`)
      }
    }
    
    if (imported.length > 0) {
      await updateAssetPipeline(pipeline, options.dataDir)
    }
    
    if (options.json) {
      output({ imported, errors }, options)
    } else {
      if (imported.length > 0) {
        console.log(`\nImported ${imported.length} pose(s):`)
        for (const pose of imported) {
          console.log(`  ${pose.slot}: ${pose.id} (status: ${pose.status})`)
        }
      }
      if (errors.length > 0) {
        console.error(`\nErrors (${errors.length}):`)
        for (const error of errors) {
          console.error(`  ${error}`)
        }
      }
      if (imported.length === 0 && errors.length === 0) {
        console.log('No poses imported')
      }
    }
    
    if (errors.length > 0 && imported.length === 0) {
      process.exit(1)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function list(characterId: string, options: Options): Promise<void> {
  try {
    await verifyCharacterExists(characterId, options.dataDir)
    const pipeline = await getAssetPipeline(options.dataDir)
    
    const poses = pipeline.poses.filter(p => p.characterId === characterId)
    
    if (options.json) {
      output(poses, options)
    } else {
      if (poses.length === 0) {
        console.log('No poses found')
      } else {
        console.log(`\nPoses (${poses.length}):\n`)
        for (const pose of poses) {
          console.log(`  ${pose.id}`)
          console.log(`    Slot: ${pose.slot}`)
          console.log(`    Status: ${pose.status}`)
          console.log(`    Source: ${pose.source}`)
          console.log(`    File: ${pose.file}`)
          console.log()
        }
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function remove(poseId: string, options: Options): Promise<void> {
  try {
    const pipeline = await getAssetPipeline(options.dataDir)
    
    const poseIndex = pipeline.poses.findIndex(p => p.id === poseId)
    if (poseIndex < 0) {
      throw new Error(`Pose not found: ${poseId}`)
    }
    
    const pose = pipeline.poses[poseIndex]
    const bindingUsage = collectPoseBindingUsage(pipeline, poseId)
    if (bindingUsage.labels.length > 0) {
      throw new Error(formatBindingInUseError('pose', pose.slot, bindingUsage.labels))
    }
    const keyUsage = collectPoseTimedKeyUsage(pipeline, poseId)
    if (keyUsage.labels.length > 0) {
      throw new Error(formatTimedKeyInUseError('pose', pose.slot, keyUsage.labels))
    }
    pipeline.poses.splice(poseIndex, 1)
    await updateAssetPipeline(pipeline, options.dataDir)
    
    if (options.json) {
      output({ deleted: true, poseId }, options)
    } else {
      console.log(`\nRemoved pose: ${pose.slot} (${poseId})`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}
