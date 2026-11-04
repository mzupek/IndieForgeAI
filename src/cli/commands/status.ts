import { getAssetPipeline } from '@core/storage/studioStorage'
import { listProjects as listLegacyProjects } from '@core/storage/projectStorage'
import { output, outputError } from '../utils/output'

interface Options {
  dataDir?: string
  json?: boolean
}

export async function run(options: Options): Promise<void> {
  try {
    const pipeline = await getAssetPipeline(options.dataDir)
    const legacyProjects = await listLegacyProjects(options.dataDir)
    
    const status = {
      legacyProjects: legacyProjects.length,
      games: pipeline.games.length,
      characters: pipeline.characters.length,
      poses: pipeline.poses.length,
      clips: pipeline.clips.length,
      gameDetails: pipeline.games.map(game => {
        const gameCharacters = pipeline.characters.filter(c => c.gameId === game.id)
        const gamePoses = pipeline.poses.filter(p => 
          gameCharacters.some(c => c.id === p.characterId)
        )
        
        return {
          gameId: game.id,
          gameName: game.name,
          engine: game.engine,
          characters: gameCharacters.length,
          poses: gamePoses.length
        }
      })
    }
    
    if (options.json) {
      output(status, options)
    } else {
      console.log('\nIndie Forge Studio Status:\n')
      console.log(`  Games: ${status.games}`)
      console.log(`  Characters: ${status.characters}`)
      console.log(`  Poses: ${status.poses}`)
      console.log(`  Legacy Projects: ${status.legacyProjects}`)
      console.log()
      
      if (status.gameDetails.length > 0) {
        console.log('Games:\n')
        for (const detail of status.gameDetails) {
          console.log(`  ${detail.gameName} (${detail.gameId})`)
          console.log(`    Engine: ${detail.engine}`)
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
