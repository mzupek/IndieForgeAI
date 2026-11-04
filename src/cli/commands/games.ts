import type { Game } from '@shared/types/assetPipeline'
import { loadProject as coreLoadProject, listProjects as coreListProjects } from '@core/storage/projectStorage'
import { output, outputError } from '../utils/output'

interface Options {
  dataDir?: string
  json?: boolean
}

export async function list(options: Options): Promise<void> {
  try {
    const projects = await coreListProjects(options.dataDir)
    
    const allGames: Array<Game & { projectId: string; projectName: string }> = []
    
    for (const project of projects) {
      if (project.assetPipeline?.games) {
        for (const game of project.assetPipeline.games) {
          allGames.push({
            ...game,
            projectId: project.id,
            projectName: project.name
          })
        }
      }
    }
    
    if (options.json) {
      output(allGames, options)
    } else {
      if (allGames.length === 0) {
        console.log('No games found')
      } else {
        console.log(`\nGames (${allGames.length}):\n`)
        for (const game of allGames) {
          console.log(`  ${game.id}`)
          console.log(`    Name: ${game.name}`)
          console.log(`    Engine: ${game.engine}`)
          console.log(`    Project: ${game.projectName} (${game.projectId})`)
          console.log(`    Export Root: ${game.exportRoot}`)
          console.log()
        }
      }
    }
  } catch (err) {
    outputError(err, options)
    process.exit(1)
  }
}
