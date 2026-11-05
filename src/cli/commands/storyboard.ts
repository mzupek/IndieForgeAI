import { Command } from 'commander'
import {
  createStoryboard,
  getStoryboard,
  listStoryboards,
  updateStoryboard,
  removeStoryboard,
  createShot,
  getShot,
  updateShot,
  removeShot,
  addLayer,
  updateLayer,
  removeLayer,
  addCameraKeyframe,
  removeCameraKeyframe,
  addEffectMarker,
  removeEffectMarker
} from '../../core/storage/storyboardService'
import type { CameraKeyframe, EffectMarker, StoryboardLayer } from '@shared/types/assetPipeline'
import { getAssetPipeline } from '../../core/storage/studioStorage'
import { getDataDir } from '../../core/storage/dataDir'
import { copyFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'

export function registerStoryboardCommands(program: Command): void {
  const storyboardCmd = program
    .command('storyboard')
    .description('Manage storyboards (scenes with shots and cinematography)')

  // Storyboard commands
  storyboardCmd
    .command('list')
    .description('List storyboards for a game')
    .requiredOption('--game <gameId>', 'Game ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const storyboards = await listStoryboards(options.game, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify(storyboards, null, 2))
        } else {
          if (storyboards.length === 0) {
            console.log('No storyboards found')
          } else {
            console.log(`Found ${storyboards.length} storyboard(s):`)
            for (const sb of storyboards) {
              console.log(
                `  ${sb.id}: "${sb.name}" (${sb.shotIds.length} shot${sb.shotIds.length !== 1 ? 's' : ''})`
              )
              if (sb.description) {
                console.log(`     ${sb.description}`)
              }
            }
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  storyboardCmd
    .command('show')
    .description('Show storyboard details')
    .requiredOption('--id <storyboardId>', 'Storyboard ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const storyboard = await getStoryboard(options.id, getDataDir(mergedOpts.dataDir))
        if (!storyboard) {
          console.error(`Storyboard not found: ${options.id}`)
          process.exit(1)
        }

        const pipeline = await getAssetPipeline(getDataDir(mergedOpts.dataDir))
        const shots = pipeline.storyboardShots.filter((s) => storyboard.shotIds.includes(s.id))

        if (mergedOpts.json) {
          console.log(JSON.stringify({ storyboard, shots }, null, 2))
        } else {
          console.log(`Storyboard: ${storyboard.name} (${storyboard.id})`)
          if (storyboard.description) {
            console.log(`Description: ${storyboard.description}`)
          }
          console.log(`Shots: ${shots.length}`)
          for (let i = 0; i < shots.length; i++) {
            const shot = shots[i]
            console.log(
              `  ${i + 1}. ${shot.name} (${shot.durationSec}s, ${shot.layers.length} layer${shot.layers.length !== 1 ? 's' : ''})`
            )
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  storyboardCmd
    .command('create')
    .description('Create a new storyboard (optionally linked to a scene)')
    .requiredOption('--game <gameId>', 'Game ID')
    .requiredOption('--name <name>', 'Storyboard name')
    .option('--description <desc>', 'Description')
    .option('--scene <sceneId>', 'Scene ID to attach this storyboard to')
    .option('--force', 'Force attach even if scene already has a storyboard')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        
        // Check if scene already has storyboard
        if (options.scene && !options.force) {
          const { getScene } = await import('../../core/storage/sceneService')
          const scene = await getScene(options.scene, getDataDir(mergedOpts.dataDir))
          if (scene?.storyboardId) {
            console.error(`Error: Scene already has a storyboard (${scene.storyboardId})`)
            console.error('Use --force to override')
            process.exit(1)
          }
        }

        const storyboard = await createStoryboard(options.game, {
          name: options.name,
          description: options.description,
          dataDirOverride: getDataDir(mergedOpts.dataDir)
        })

        // Link to scene if provided
        if (options.scene) {
          const { updateScene } = await import('../../core/storage/sceneService')
          await updateStoryboard(storyboard.id, { sceneId: options.scene }, getDataDir(mergedOpts.dataDir))
          await updateScene(options.scene, { storyboardId: storyboard.id }, getDataDir(mergedOpts.dataDir))
        }

        if (mergedOpts.json) {
          console.log(JSON.stringify(storyboard, null, 2))
        } else {
          console.log(`✓ Created storyboard: ${storyboard.name} (${storyboard.id})`)
          if (options.scene) {
            console.log(`  Linked to scene: ${options.scene}`)
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  storyboardCmd
    .command('remove')
    .description('Remove a storyboard and all its shots')
    .requiredOption('--id <storyboardId>', 'Storyboard ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        await removeStoryboard(options.id, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify({ removed: true }, null, 2))
        } else {
          console.log(`✓ Removed storyboard: ${options.id}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  // Shot commands
  const shotCmd = program.command('shot').description('Manage shots in storyboards')

  shotCmd
    .command('add')
    .description('Add a shot to a storyboard')
    .requiredOption('--storyboard <storyboardId>', 'Storyboard ID')
    .requiredOption('--name <name>', 'Shot name')
    .option('--duration <seconds>', 'Duration in seconds', '3.0')
    .option('--aspect <ratio>', 'Aspect ratio (e.g., 16:9, 4:3)', '16:9')
    .option('--notes <text>', 'Notes for engineer')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const [w, h] = options.aspect.split(':').map(Number)
        const shot = await createShot(options.storyboard, {
          name: options.name,
          durationSec: parseFloat(options.duration),
          aspectRatio: { width: w, height: h },
          notes: options.notes,
          dataDirOverride: getDataDir(mergedOpts.dataDir)
        })

        if (mergedOpts.json) {
          console.log(JSON.stringify(shot, null, 2))
        } else {
          console.log(`✓ Added shot: ${shot.name} (${shot.id})`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotCmd
    .command('update')
    .description('Update shot properties')
    .requiredOption('--id <shotId>', 'Shot ID')
    .option('--name <name>', 'New name')
    .option('--duration <seconds>', 'Duration in seconds')
    .option('--notes <text>', 'Notes for engineer')
    .option('--background-image <path>', 'Background image path (forge-file:// or absolute)')
    .option('--background-clip <clipId>', 'Background clip ID')
    .option('--clear-background', 'Clear both background image and clip')
    .option('--bg-dim <value>', 'Background dim (0-1): darken background only')
    .option('--vignette <value>', 'Vignette strength (0-1): radial darkening')
    .option('--clear-stage-treatment', 'Clear all stage treatment effects')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const updates: any = {}
        if (options.name) updates.name = options.name
        if (options.duration) updates.durationSec = parseFloat(options.duration)
        if (options.notes) updates.notes = options.notes
        
        // Handle background image: copy into studio storage
        if (options.backgroundImage !== undefined) {
          const sourcePath = options.backgroundImage
          const backgroundsDir = join(getDataDir(mergedOpts.dataDir), 'backgrounds')
          await mkdir(backgroundsDir, { recursive: true })
          
          const filename = `${Date.now()}-${basename(sourcePath)}`
          const destPath = join(backgroundsDir, filename)
          
          await copyFile(sourcePath, destPath)
          
          // Store relative path that protocol handler can serve
          updates.backgroundImage = `backgrounds/${filename}`
          console.log(`Copied background to studio: ${destPath}`)
        }
        
        if (options.backgroundClip !== undefined) updates.backgroundClipId = options.backgroundClip
        if (options.clearBackground) {
          updates.backgroundImage = undefined
          updates.backgroundClipId = undefined
        }
        
        // Stage treatment (Phase C.1)
        if (options.bgDim !== undefined || options.vignette !== undefined) {
          const currentShot = await getShot(options.id, getDataDir(mergedOpts.dataDir))
          updates.stageTreatment = {
            ...currentShot.stageTreatment,
            ...(options.bgDim !== undefined && { bgDim: parseFloat(options.bgDim) }),
            ...(options.vignette !== undefined && { vignette: parseFloat(options.vignette) })
          }
        }
        if (options.clearStageTreatment) {
          updates.stageTreatment = undefined
        }

        const shot = await updateShot(options.id, updates, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify(shot, null, 2))
        } else {
          console.log(`✓ Updated shot: ${shot.name} (${shot.id})`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotCmd
    .command('remove')
    .description('Remove a shot from a storyboard')
    .requiredOption('--storyboard <storyboardId>', 'Storyboard ID')
    .requiredOption('--id <shotId>', 'Shot ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        await removeShot(options.storyboard, options.id, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify({ removed: true }, null, 2))
        } else {
          console.log(`✓ Removed shot: ${options.id}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  // Layer commands
  const layerCmd = program.command('layer').description('Manage layers in shots')

  layerCmd
    .command('add')
    .description('Add a layer to a shot (character pose, clip, or image)')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--z <zOrder>', 'Z-order (higher = closer to camera)', '1')
    .option('--character <characterId>', 'Character ID (use with --pose)')
    .option('--pose <poseId>', 'Pose ID (creates character pose layer)')
    .option('--clip <clipId>', 'Clip ID (creates animated clip layer)')
    .option('--image <path>', 'Image path (creates static image layer)')
    .option('--x <coord>', 'X coordinate (0-1)', '0.5')
    .option('--y <coord>', 'Y coordinate (0-1)', '0.5')
    .option('--scale <factor>', 'Scale factor', '1.0')
    .option('--rotation <degrees>', 'Rotation in degrees', '0')
    .option('--flip-x', 'Flip horizontally')
    .option('--opacity <value>', 'Opacity (0-1)', '1.0')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const layer: Omit<StoryboardLayer, 'id'> = {
          zOrder: parseInt(options.z),
          characterId: options.character,
          poseId: options.pose,
          clipId: options.clip,
          imagePath: options.image,
          x: parseFloat(options.x),
          y: parseFloat(options.y),
          scale: parseFloat(options.scale),
          rotation: parseFloat(options.rotation),
          flipX: !!options.flipX,
          opacity: parseFloat(options.opacity)
        }

        const added = await addLayer(options.shot, layer, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify(added, null, 2))
        } else {
          console.log(`✓ Added layer: ${added.id}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  layerCmd
    .command('update')
    .description('Update layer properties')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--id <layerId>', 'Layer ID')
    .option('--z <zOrder>', 'Z-order')
    .option('--pose <poseId>', 'Pose ID')
    .option('--x <coord>', 'X coordinate (0-1)')
    .option('--y <coord>', 'Y coordinate (0-1)')
    .option('--scale <factor>', 'Scale factor')
    .option('--rotation <degrees>', 'Rotation in degrees')
    .option('--flip-x <bool>', 'Flip horizontally (true/false)')
    .option('--opacity <value>', 'Opacity (0-1)')
    .option('--glow-blur <value>', 'Outer glow blur radius')
    .option('--glow-alpha <value>', 'Outer glow alpha (0-1)')
    .option('--glow-color <hex>', 'Outer glow color (hex)')
    .option('--shadow-x <value>', 'Drop shadow offset X')
    .option('--shadow-y <value>', 'Drop shadow offset Y')
    .option('--shadow-blur <value>', 'Drop shadow blur radius')
    .option('--shadow-alpha <value>', 'Drop shadow alpha (0-1)')
    .option('--clear-fx', 'Clear all layer effects')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const updates: any = {}
        if (options.z !== undefined) updates.zOrder = parseInt(options.z)
        if (options.pose) updates.poseId = options.pose
        if (options.x !== undefined) updates.x = parseFloat(options.x)
        if (options.y !== undefined) updates.y = parseFloat(options.y)
        if (options.scale !== undefined) updates.scale = parseFloat(options.scale)
        if (options.rotation !== undefined) updates.rotation = parseFloat(options.rotation)
        if (options.flipX !== undefined) updates.flipX = options.flipX === 'true'
        if (options.opacity !== undefined) updates.opacity = parseFloat(options.opacity)
        
        // Layer effects (Phase C.2)
        if (options.clearFx) {
          updates.fx = undefined
        } else if (options.glowBlur !== undefined || options.glowAlpha !== undefined || options.glowColor !== undefined ||
                   options.shadowX !== undefined || options.shadowY !== undefined || options.shadowBlur !== undefined || options.shadowAlpha !== undefined) {
          // Get current layer to preserve existing effects when updating
          const currentShot = await getShot(options.shot, getDataDir(mergedOpts.dataDir))
          const currentLayer = currentShot.layers.find(l => l.id === options.id)
          
          updates.fx = { ...currentLayer?.fx }
          
          // Outer glow
          if (options.glowBlur !== undefined || options.glowAlpha !== undefined || options.glowColor !== undefined) {
            updates.fx.outerGlow = {
              blur: options.glowBlur !== undefined ? parseFloat(options.glowBlur) : (currentLayer?.fx?.outerGlow?.blur ?? 12),
              alpha: options.glowAlpha !== undefined ? parseFloat(options.glowAlpha) : (currentLayer?.fx?.outerGlow?.alpha ?? 0.8),
              color: options.glowColor !== undefined ? options.glowColor : (currentLayer?.fx?.outerGlow?.color ?? '#00ffff'),
              strength: currentLayer?.fx?.outerGlow?.strength ?? 1
            }
          }
          
          // Drop shadow
          if (options.shadowX !== undefined || options.shadowY !== undefined || options.shadowBlur !== undefined || options.shadowAlpha !== undefined) {
            updates.fx.dropShadow = {
              offsetX: options.shadowX !== undefined ? parseFloat(options.shadowX) : (currentLayer?.fx?.dropShadow?.offsetX ?? 4),
              offsetY: options.shadowY !== undefined ? parseFloat(options.shadowY) : (currentLayer?.fx?.dropShadow?.offsetY ?? 6),
              blur: options.shadowBlur !== undefined ? parseFloat(options.shadowBlur) : (currentLayer?.fx?.dropShadow?.blur ?? 10),
              color: currentLayer?.fx?.dropShadow?.color ?? '#000000',
              alpha: options.shadowAlpha !== undefined ? parseFloat(options.shadowAlpha) : (currentLayer?.fx?.dropShadow?.alpha ?? 0.5)
            }
          }
        }

        const layer = await updateLayer(options.shot, options.id, updates, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify(layer, null, 2))
        } else {
          console.log(`✓ Updated layer: ${layer.id}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  layerCmd
    .command('remove')
    .description('Remove a layer from a shot')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--id <layerId>', 'Layer ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        await removeLayer(options.shot, options.id, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify({ removed: true }, null, 2))
        } else {
          console.log(`✓ Removed layer: ${options.id}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  // Camera commands
  const cameraCmd = program.command('camera').description('Manage camera keyframes in shots')

  cameraCmd
    .command('key')
    .description('Add camera keyframe')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--time <seconds>', 'Time in seconds')
    .option('--target-layer <layerId>', 'Target layer ID')
    .option('--target-x <coord>', 'Target X coordinate (0-1)')
    .option('--target-y <coord>', 'Target Y coordinate (0-1)')
    .option('--zoom <level>', 'Zoom level', '1.0')
    .option('--frame-x <coord>', 'Framing rect X')
    .option('--frame-y <coord>', 'Framing rect Y')
    .option('--frame-w <width>', 'Framing rect width')
    .option('--frame-h <height>', 'Framing rect height')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const keyframe: CameraKeyframe = {
          t: parseFloat(options.time),
          target: options.targetLayer
            ? options.targetLayer
            : { x: parseFloat(options.targetX || '0.5'), y: parseFloat(options.targetY || '0.5') },
          zoom: parseFloat(options.zoom)
        }

        if (options.frameX !== undefined) {
          keyframe.framingRect = {
            x: parseFloat(options.frameX),
            y: parseFloat(options.frameY || '0'),
            width: parseFloat(options.frameW || '1'),
            height: parseFloat(options.frameH || '1')
          }
        }

        await addCameraKeyframe(options.shot, keyframe, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify({ added: true, keyframe }, null, 2))
        } else {
          console.log(`✓ Added camera keyframe at t=${keyframe.t}s`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  cameraCmd
    .command('remove')
    .description('Remove camera keyframe at time')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--time <seconds>', 'Time in seconds')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        await removeCameraKeyframe(options.shot, parseFloat(options.time), getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify({ removed: true }, null, 2))
        } else {
          console.log(`✓ Removed camera keyframe at t=${options.time}s`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  // Effect commands
  const effectCmd = program.command('effect').description('Manage effect markers in shots')

  effectCmd
    .command('add')
    .description('Add effect marker')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--time <seconds>', 'Time in seconds')
    .option('--moment <clipMoment>', 'Clip moment (intro, hit, finisher, defeat, miss, story_beat)')
    .option('--preset <presetId>', 'Preset ID')
    .option('--type <effectType>', 'Inline effect type (versus, zoom_punch, shake, flash, freeze)')
    .option('--params <json>', 'Inline params as JSON')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const effect: EffectMarker = {
          t: parseFloat(options.time),
          moment: options.moment,
          presetId: options.preset,
          inlineType: options.type,
          inlineParams: options.params ? JSON.parse(options.params) : undefined
        }

        await addEffectMarker(options.shot, effect, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify({ added: true, effect }, null, 2))
        } else {
          console.log(`✓ Added effect at t=${effect.t}s`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  effectCmd
    .command('remove')
    .description('Remove effect marker at time')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--time <seconds>', 'Time in seconds')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        await removeEffectMarker(options.shot, parseFloat(options.time), getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify({ removed: true }, null, 2))
        } else {
          console.log(`✓ Removed effect at t=${options.time}s`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })
}
