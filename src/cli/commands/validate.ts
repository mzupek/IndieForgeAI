import type { Character } from '@shared/types/assetPipeline'
import { checkPoseCompleteness, POSE_SLOTS, type PoseMetadata } from '@shared/poseValidation'
import { validatePoseImage } from '../../main/storage/poseService'
import { loadProject as coreLoadProject, listProjects as coreListProjects } from '@core/storage/projectStorage'
import { output, outputError } from '../utils/output'

interface Options {
  dataDir?: string
  json?: boolean
  game?: string
}

interface ValidationResult {
  characterId: string
  characterName: string
  complete: boolean
  issues: Array<{ slot: string; type: string; message: string }>
}

export async function run(characterId: string | undefined, options: Options): Promise<void> {
  try {
    const projects = await coreListProjects(options.dataDir)
    const results: ValidationResult[] = []
    let charactersToValidate: Array<{ character: Character; projectId: string }> = []
    
    // Determine which characters to validate
    if (characterId) {
      // Validate specific character
      for (const project of projects) {
        if (project.assetPipeline) {
          const char = project.assetPipeline.characters.find(c => c.id === characterId)
          if (char) {
            charactersToValidate.push({ character: char, projectId: project.id })
            break
          }
        }
      }
      
      if (charactersToValidate.length === 0) {
        throw new Error(`Character not found: ${characterId}`)
      }
    } else if (options.game) {
      // Validate all characters in a game
      for (const project of projects) {
        if (project.assetPipeline) {
          const chars = project.assetPipeline.characters.filter(c => c.gameId === options.game)
          for (const char of chars) {
            charactersToValidate.push({ character: char, projectId: project.id })
          }
        }
      }
      
      if (charactersToValidate.length === 0) {
        throw new Error(`No characters found for game: ${options.game}`)
      }
    } else {
      // Validate all characters across all projects
      for (const project of projects) {
        if (project.assetPipeline) {
          for (const char of project.assetPipeline.characters) {
            charactersToValidate.push({ character: char, projectId: project.id })
          }
        }
      }
    }
    
    // Validate each character
    for (const { character, projectId } of charactersToValidate) {
      const project = await coreLoadProject(projectId, options.dataDir)
      
      if (!project.assetPipeline) continue
      
      const poses = project.assetPipeline.poses.filter(p => p.characterId === character.id)
      
      // Build metadata map
      const metadataMap = new Map<string, PoseMetadata>()
      for (const pose of poses) {
        try {
          const metadata = await validatePoseImage(pose.file)
          metadataMap.set(pose.id, metadata)
        } catch (err) {
          // Skip poses with invalid files
        }
      }
      
      const completeness = checkPoseCompleteness(character, poses, metadataMap)
      
      results.push({
        characterId: character.id,
        characterName: character.name,
        complete: completeness.complete,
        issues: completeness.issues.map(issue => ({
          slot: issue.slot,
          type: issue.type,
          message: issue.message
        }))
      })
    }
    
    // Output results
    if (options.json) {
      output(results, options)
    } else {
      const complete = results.filter(r => r.complete).length
      const incomplete = results.length - complete
      
      console.log(`\nValidation Results:\n`)
      console.log(`  Total: ${results.length}`)
      console.log(`  Complete: ${complete}`)
      console.log(`  Incomplete: ${incomplete}`)
      console.log()
      
      if (incomplete > 0) {
        console.log('Incomplete Characters:\n')
        for (const result of results) {
          if (!result.complete) {
            console.log(`  ${result.characterName} (${result.characterId}):`)
            for (const issue of result.issues) {
              console.log(`    - ${issue.message}`)
            }
            console.log()
          }
        }
      }
    }
    
    // Exit with non-zero if any incomplete
    if (results.some(r => !r.complete)) {
      process.exit(1)
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}
