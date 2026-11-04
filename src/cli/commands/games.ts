import type { Game } from '@shared/types/assetPipeline'
import { getAssetPipeline } from '@core/storage/studioStorage'
import { output, outputError } from '../utils/output'

interface Options {
  dataDir?: string
  json?: boolean
}

export async function list(options: Options): Promise<void> {
  try {
    const pipeline = await getAssetPipeline(options.dataDir)
    
    if (options.json) {
      output(pipeline.games, options)
    } else {
      if (pipeline.games.length === 0) {
        console.log('No games found')
      } else {
        console.log(`\nGames (${pipeline.games.length}):\n`)
        for (const game of pipeline.games) {
          console.log(`  ${game.id}`)
          console.log(`    Name: ${game.name}`)
          console.log(`    Engine: ${game.engine}`)
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
