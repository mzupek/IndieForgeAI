import type { AssetPipelineProject, Game } from '../types/assetPipeline'

export function requireGame(pipeline: AssetPipelineProject, gameId: string): Game {
  const game = (pipeline.games || []).find((g) => g.id === gameId)
  if (!game) {
    throw new Error(`Game not found: ${gameId}`)
  }
  return game
}
