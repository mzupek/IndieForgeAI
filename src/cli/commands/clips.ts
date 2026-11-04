import { basename } from 'path'
import type { Clip, ClipMoment } from '@shared/types/assetPipeline'
import { mapFilenameToMoment, validateClipDuration, formatDuration } from '@shared/clipValidation'
import { importClip as importClipService, removeClip as removeClipService, updateClip as updateClipService } from '../../main/storage/clipService'
import { getAssetPipeline } from '@core/storage/studioStorage'
import { output, outputError } from '../utils/output'

interface ImportOptions {
  dataDir?: string
  json?: boolean
  game: string
  moment?: ClipMoment
  character?: string
  tags?: string
}

interface ListOptions {
  dataDir?: string
  json?: boolean
  game?: string
  character?: string
  moment?: ClipMoment
}

interface UpdateOptions {
  dataDir?: string
  json?: boolean
  moment?: ClipMoment
  character?: string
  tags?: string
}

export async function importClips(
  files: string[],
  options: ImportOptions
): Promise<void> {
  try {
    const pipeline = await getAssetPipeline(options.dataDir)
    
    // Verify game exists
    if (!pipeline.games.some(g => g.id === options.game)) {
      throw new Error(`Game not found: ${options.game}`)
    }
    
    // Verify character exists if provided
    if (options.character && !pipeline.characters.some(c => c.id === options.character)) {
      throw new Error(`Character not found: ${options.character}`)
    }
    
    const imported: Clip[] = []
    const errors: string[] = []
    const warnings: string[] = []
    
    for (const filePath of files) {
      try {
        let moment: ClipMoment | null = options.moment || null
        
        if (!moment) {
          // Auto-map by filename
          const filename = basename(filePath)
          moment = mapFilenameToMoment(filename)
          
          if (!moment) {
            errors.push(`${filePath}: Could not determine moment from filename (use --moment flag)`)
            continue
          }
        }
        
        const clip = await importClipService(filePath, moment, {
          gameId: options.game,
          characterId: options.character,
          tags: options.tags ? options.tags.split(',').map(t => t.trim()) : [],
          dataDirOverride: options.dataDir
        })
        
        // Check for duration warnings
        const issues = validateClipDuration(clip.durationSec)
        if (issues.length > 0) {
          for (const issue of issues) {
            warnings.push(`${basename(filePath)}: ${issue.message}`)
          }
        }
        
        imported.push(clip)
      } catch (err: any) {
        errors.push(`${filePath}: ${err.message}`)
      }
    }
    
    if (options.json) {
      output({ imported, errors, warnings }, options)
    } else {
      if (imported.length > 0) {
        console.log(`\nImported ${imported.length} clip(s):`)
        for (const clip of imported) {
          console.log(`  ${clip.moment}: ${clip.id} (${formatDuration(clip.durationSec)})`)
        }
      }
      if (warnings.length > 0) {
        console.warn(`\nWarnings (${warnings.length}):`)
        for (const warning of warnings) {
          console.warn(`  ${warning}`)
        }
      }
      if (errors.length > 0) {
        console.error(`\nErrors (${errors.length}):`)
        for (const error of errors) {
          console.error(`  ${error}`)
        }
      }
      if (imported.length === 0 && errors.length === 0) {
        console.log('No clips imported')
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

export async function list(options: ListOptions): Promise<void> {
  try {
    const pipeline = await getAssetPipeline(options.dataDir)
    
    let clips = pipeline.clips
    
    // Filter by game (via characters)
    if (options.game) {
      const gameCharacterIds = pipeline.characters
        .filter(c => c.gameId === options.game)
        .map(c => c.id)
      clips = clips.filter(c => !c.characterId || gameCharacterIds.includes(c.characterId))
    }
    
    // Filter by character
    if (options.character) {
      clips = clips.filter(c => c.characterId === options.character)
    }
    
    // Filter by moment
    if (options.moment) {
      clips = clips.filter(c => c.moment === options.moment)
    }
    
    if (options.json) {
      output(clips, options)
    } else {
      if (clips.length === 0) {
        console.log('No clips found')
      } else {
        console.log(`\nClips (${clips.length}):\n`)
        for (const clip of clips) {
          console.log(`  ${clip.id}`)
          console.log(`    Moment: ${clip.moment}`)
          console.log(`    Duration: ${formatDuration(clip.durationSec)}`)
          if (clip.characterId) {
            const character = pipeline.characters.find(c => c.id === clip.characterId)
            console.log(`    Character: ${character?.name || clip.characterId}`)
          }
          if (clip.tags.length > 0) console.log(`    Tags: ${clip.tags.join(', ')}`)
          console.log()
        }
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function show(clipId: string, options: ListOptions): Promise<void> {
  try {
    const pipeline = await getAssetPipeline(options.dataDir)
    
    const clip = pipeline.clips.find(c => c.id === clipId)
    
    if (!clip) {
      throw new Error(`Clip not found: ${clipId}`)
    }
    
    if (options.json) {
      output(clip, options)
    } else {
      console.log(`\nClip: ${clip.id}\n`)
      console.log(`  Moment: ${clip.moment}`)
      console.log(`  Duration: ${formatDuration(clip.durationSec)}`)
      if (clip.characterId) {
        const character = pipeline.characters.find(c => c.id === clip.characterId)
        console.log(`  Character: ${character?.name || clip.characterId}`)
      }
      if (clip.tags.length > 0) console.log(`  Tags: ${clip.tags.join(', ')}`)
      console.log(`  File: ${clip.file}`)
      console.log(`  Created: ${clip.createdAt}`)
      console.log(`  Updated: ${clip.updatedAt}`)
      console.log()
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function update(clipId: string, options: UpdateOptions): Promise<void> {
  try {
    const patch: any = {}
    
    if (options.moment !== undefined) patch.moment = options.moment
    if (options.character !== undefined) patch.characterId = options.character || undefined
    if (options.tags !== undefined) {
      patch.tags = options.tags.split(',').map(t => t.trim())
    }
    
    const clip = await updateClipService(clipId, patch, options.dataDir)
    
    if (options.json) {
      output(clip, options)
    } else {
      console.log(`\nUpdated clip: ${clip.id}`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}

export async function remove(clipId: string, options: ListOptions): Promise<void> {
  try {
    await removeClipService(clipId, options.dataDir)
    
    if (options.json) {
      output({ deleted: true, clipId }, options)
    } else {
      console.log(`\nRemoved clip: ${clipId}`)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}
