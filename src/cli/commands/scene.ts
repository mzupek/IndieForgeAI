/**
 * CLI commands for Scene management (Phase C)
 * Enables agent scaffold path: scene create → attach-storyboard → shot/layer/effect
 */

import { Command } from 'commander'
import {
  createScene,
  getScene,
  listScenes,
  updateScene,
  removeScene,
  addCharacterToCast,
  removeCharacterFromCast,
  attachPreset,
  detachPreset,
  createSceneStoryboard
} from '../../core/storage/sceneService'
import { getAssetPipeline } from '../../core/storage/studioStorage'
import { updateStoryboard } from '../../core/storage/storyboardService'
import { getDataDir } from '../../core/storage/dataDir'

export function registerSceneCommands(program: Command): void {
  const sceneCmd = program
    .command('scene')
    .description('Manage scenes (narrative moments with cast, story, and attached storyboards)')

  // List scenes
  sceneCmd
    .command('list')
    .description('List scenes for a game')
    .requiredOption('--game <gameId>', 'Game ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const scenes = await listScenes(options.game, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify(scenes, null, 2))
        } else {
          if (scenes.length === 0) {
            console.log('No scenes found')
          } else {
            console.log(`Found ${scenes.length} scene(s):`)
            for (const scene of scenes) {
              console.log(`  ${scene.id}: "${scene.name}"`)
              if (scene.description) {
                console.log(`     ${scene.description}`)
              }
              if (scene.cast.length > 0) {
                console.log(`     Cast: ${scene.cast.length} character(s)`)
              }
              if (scene.storyboardId) {
                console.log(`     ✓ Storyboard attached`)
              }
            }
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  // Show scene
  sceneCmd
    .command('show')
    .description('Show scene details')
    .requiredOption('--id <sceneId>', 'Scene ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const scene = await getScene(options.id, getDataDir(mergedOpts.dataDir))
        if (!scene) {
          console.error(`Scene not found: ${options.id}`)
          process.exit(1)
        }

        const pipeline = await getAssetPipeline(getDataDir(mergedOpts.dataDir))
        const characters = pipeline.characters.filter(c => scene.cast.includes(c.id))
        const presets = pipeline.scenePresets.filter(p => scene.attachedPresets.includes(p.id))
        const storyboard = scene.storyboardId 
          ? pipeline.storyboards.find(sb => sb.id === scene.storyboardId)
          : null

        if (mergedOpts.json) {
          console.log(JSON.stringify({
            scene,
            characters,
            presets,
            storyboard
          }, null, 2))
        } else {
          console.log(`Scene: ${scene.name} (${scene.id})`)
          console.log(`Game: ${scene.gameId}`)
          if (scene.description) {
            console.log(`Description: ${scene.description}`)
          }
          if (scene.background) {
            console.log(`Background: ${scene.background}`)
          }
          if (scene.storyText) {
            console.log(`Story: ${scene.storyText}`)
          }
          if (characters.length > 0) {
            console.log(`Cast: ${characters.map(c => c.name).join(', ')}`)
          }
          if (presets.length > 0) {
            console.log(`FX Recipes: ${presets.map(p => p.type).join(', ')}`)
          }
          if (storyboard) {
            console.log(`Storyboard: ${storyboard.name} (${storyboard.shotIds.length} shots)`)
          }
          console.log(`Created: ${scene.createdAt}`)
          console.log(`Updated: ${scene.updatedAt}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  // Create scene
  sceneCmd
    .command('create')
    .description('Create a new scene')
    .requiredOption('--game <gameId>', 'Game ID')
    .requiredOption('--name <name>', 'Scene name')
    .option('--description <text>', 'Scene description')
    .option('--background <text>', 'Background description or reference')
    .option('--story-text <text>', 'Story/dialogue text')
    .option('--cast <ids>', 'Comma-separated character IDs')
    .option('--presets <ids>', 'Comma-separated preset IDs')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const scene = await createScene(options.game, {
          name: options.name,
          description: options.description,
          background: options.background,
          storyText: options.storyText,
          dataDirOverride: getDataDir(mergedOpts.dataDir)
        })

        // Add cast
        if (options.cast) {
          const characterIds = options.cast.split(',').map((s: string) => s.trim())
          for (const charId of characterIds) {
            await addCharacterToCast(scene.id, charId, getDataDir(mergedOpts.dataDir))
          }
        }

        // Attach presets
        if (options.presets) {
          const presetIds = options.presets.split(',').map((s: string) => s.trim())
          for (const presetId of presetIds) {
            await attachPreset(scene.id, presetId, getDataDir(mergedOpts.dataDir))
          }
        }

        // Reload to get updated scene
        const updatedScene = await getScene(scene.id, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify(updatedScene, null, 2))
        } else {
          console.log(`Created scene: ${updatedScene!.name} (${updatedScene!.id})`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  // Update scene
  sceneCmd
    .command('update')
    .description('Update a scene')
    .requiredOption('--id <sceneId>', 'Scene ID')
    .option('--name <name>', 'Scene name')
    .option('--description <text>', 'Scene description')
    .option('--background <text>', 'Background description')
    .option('--story-text <text>', 'Story/dialogue text')
    .option('--cast <ids>', 'Comma-separated character IDs (replaces existing)')
    .option('--presets <ids>', 'Comma-separated preset IDs (replaces existing)')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const updates: any = {}
        if (options.name !== undefined) updates.name = options.name
        if (options.description !== undefined) updates.description = options.description
        if (options.background !== undefined) updates.background = options.background
        if (options.storyText !== undefined) updates.storyText = options.storyText
        if (options.cast !== undefined) {
          updates.cast = options.cast.split(',').map((s: string) => s.trim())
        }
        if (options.presets !== undefined) {
          updates.attachedPresets = options.presets.split(',').map((s: string) => s.trim())
        }

        const scene = await updateScene(options.id, updates, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify(scene, null, 2))
        } else {
          console.log(`Updated scene: ${scene.name} (${scene.id})`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  // Remove scene
  sceneCmd
    .command('remove')
    .description('Remove a scene')
    .requiredOption('--id <sceneId>', 'Scene ID')
    .option('--remove-storyboard', 'Also remove attached storyboard')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        await removeScene(options.id, {
          removeStoryboard: options.removeStoryboard,
          dataDirOverride: getDataDir(mergedOpts.dataDir)
        })

        if (mergedOpts.json) {
          console.log(JSON.stringify({ success: true, removedSceneId: options.id }, null, 2))
        } else {
          console.log(`Removed scene: ${options.id}`)
          if (options.removeStoryboard) {
            console.log('  (and attached storyboard)')
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  // Attach storyboard
  sceneCmd
    .command('attach-storyboard')
    .description('Create or attach a storyboard to a scene')
    .requiredOption('--id <sceneId>', 'Scene ID')
    .option('--name <name>', 'Storyboard name (for new storyboard)')
    .option('--storyboard <storyboardId>', 'Existing storyboard ID to attach')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const scene = await getScene(options.id, getDataDir(mergedOpts.dataDir))
        if (!scene) {
          console.error(`Scene not found: ${options.id}`)
          process.exit(1)
        }

        let storyboardId: string

        if (options.storyboard) {
          // Attach existing storyboard
          storyboardId = options.storyboard
          
          // Update storyboard to link to scene
          await updateStoryboard(storyboardId, { sceneId: scene.id }, getDataDir(mergedOpts.dataDir))
          
          // Update scene to link to storyboard
          await updateScene(scene.id, { storyboardId }, getDataDir(mergedOpts.dataDir))
        } else {
          // Create new storyboard
          const result = await createSceneStoryboard(scene.id, {
            name: options.name || `${scene.name} Storyboard`,
            dataDirOverride: getDataDir(mergedOpts.dataDir)
          })
          storyboardId = result.storyboardId
        }

        const updatedScene = await getScene(scene.id, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify({
            scene: updatedScene,
            storyboardId
          }, null, 2))
        } else {
          console.log(`Attached storyboard to scene: ${scene.name}`)
          console.log(`  Storyboard ID: ${storyboardId}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })
}
