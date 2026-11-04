import { listProjects as coreListProjects } from '@core/storage/projectStorage'
import { output, outputError } from '../utils/output'

interface Options {
  dataDir?: string
  json?: boolean
}

export async function run(options: Options): Promise<void> {
  try {
    const projects = await coreListProjects(options.dataDir)
    
    const status = {
      projects: projects.length,
      games: 0,
      characters: 0,
      poses: 0,
      completeCharacters: 0,
      details: projects.map(project => {
        const games = project.assetPipeline?.games ?? []
        const characters = project.assetPipeline?.characters ?? []
        const poses = project.assetPipeline?.poses ?? []
        
        return {
          projectId: project.id,
          projectName: project.name,
          games: games.length,
          characters: characters.length,
          poses: poses.length
        }
      })
    }
    
    // Calculate totals
    for (const detail of status.details) {
      status.games += detail.games
      status.characters += detail.characters
      status.poses += detail.poses
    }
    
    if (options.json) {
      output(status, options)
    } else {
      console.log('\nIndie Forge Status:\n')
      console.log(`  Projects: ${status.projects}`)
      console.log(`  Games: ${status.games}`)
      console.log(`  Characters: ${status.characters}`)
      console.log(`  Poses: ${status.poses}`)
      console.log()
      
      if (status.details.length > 0) {
        console.log('Projects:\n')
        for (const detail of status.details) {
          console.log(`  ${detail.projectName} (${detail.projectId})`)
          console.log(`    Games: ${detail.games}`)
          console.log(`    Characters: ${detail.characters}`)
          console.log(`    Poses: ${detail.poses}`)
          console.log()
        }
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}
