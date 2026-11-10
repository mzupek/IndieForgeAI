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
  removeEffectMarker,
  addLayerTimedKey,
  listLayerTimedKeys,
  getLayerTimedKey,
  updateLayerTimedKey,
  removeLayerTimedKey,
  addShotClipBlock,
  listShotClipBlocks,
  getShotClipBlock,
  updateShotClipBlock,
  removeShotClipBlock,
  addShotAudioBlock,
  listShotAudioBlocks,
  getShotAudioBlock,
  updateShotAudioBlock,
  removeShotAudioBlock,
  addShotEventCue,
  listShotEventCues,
  getShotEventCue,
  updateShotEventCue,
  removeShotEventCue,
  addShotBackgroundKey,
  listShotBackgroundKeys,
  getShotBackgroundKey,
  updateShotBackgroundKey,
  removeShotBackgroundKey
} from '../../core/storage/storyboardService'
import type {
  CameraKeyframe,
  EffectMarker,
  LayerTimedKeyAction,
  StoryboardLayer
} from '@shared/types/assetPipeline'
import {
  applyEffectiveLayer,
  describeTimedKeyAction
} from '../../shared/storyboard/timedKeys'
import {
  describeClipBlock,
  sampleClipBlocks
} from '../../shared/storyboard/clipBlocks'
import {
  describeAudioBlock,
  sampleAudioBlocks
} from '../../shared/storyboard/audioBlocks'
import { simulateEventFire } from '../../shared/storyboard/eventPreview'
import { describeBackgroundKey } from '../../shared/storyboard/backgroundKeys'
import { parseVisibilityBound } from '../../shared/storyboard/layerVisibilityRange'
import { getAssetPipeline } from '../../core/storage/studioStorage'
import { getDataDir } from '../../core/storage/dataDir'
import { importDirectShotBackground } from '../../core/storage/shotBackgroundMedia'

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
  const shotCmd = program
    .command('shot')
    .description('Manage shots, clip blocks, audio blocks, event cues, and cinematography')

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
    .option('--duration <seconds>', 'Duration in seconds (user-entered; shrink is refused if audio/clips/keys/camera/effects/event-cues/background-keys/visibility-range would be cut; previous length is not restored from history)')
    .option('--notes <text>', 'Notes for engineer')
    .option('--background-image <path>', 'Direct-import image (copied into studio backgrounds/; not an external path)')
    .option('--background-asset <id>', 'Library visual asset id (selected Game; full image, not thumbnail)')
    .option('--background-state <id>', 'Asset state id for --background-asset (omit for default/static)')
    .option('--background-clip <clipId>', 'Background clip ID')
    .option('--clear-background-image', 'Clear static/library background image only (clip unchanged)')
    .option('--clear-background', 'Clear background image, library asset ref, and clip')
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
        
        if (options.backgroundImage && options.backgroundAsset) {
          throw new Error('Use either --background-image or --background-asset, not both')
        }

        // Direct import: copy into studio storage (stable relative path, not the source)
        if (options.backgroundImage !== undefined) {
          updates.backgroundImage = await importDirectShotBackground(
            options.backgroundImage,
            getDataDir(mergedOpts.dataDir)
          )
          updates.backgroundVisualAssetId = null
          updates.backgroundAssetStateId = null
        }

        if (options.backgroundAsset !== undefined) {
          updates.backgroundVisualAssetId = options.backgroundAsset
          updates.backgroundAssetStateId = options.backgroundState || null
          updates.backgroundImage = null
        } else if (options.backgroundState !== undefined) {
          updates.backgroundAssetStateId = options.backgroundState
        }

        if (options.backgroundClip !== undefined) updates.backgroundClipId = options.backgroundClip
        if (options.clearBackgroundImage) {
          updates.backgroundImage = null
          updates.backgroundVisualAssetId = null
          updates.backgroundAssetStateId = null
        }
        if (options.clearBackground) {
          updates.backgroundImage = null
          updates.backgroundVisualAssetId = null
          updates.backgroundAssetStateId = null
          updates.backgroundClipId = null
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

  const shotClipCmd = shotCmd
    .command('clip')
    .description('Timed clip blocks on a shot (range playback; not C.3c FX keys)')

  shotClipCmd
    .command('add')
    .description('Place a clip block on the shot timeline (creates a clip layer if needed)')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--clip <clipId>', 'Library clip ID')
    .requiredOption('--time <seconds>', 'Shot start time')
    .option('--role <role>', 'layer (default) or background', 'layer')
    .option('--layer <layerId>', 'Existing clip layer (layer role)')
    .option('--source-in <seconds>', 'Source trim in (default 0)')
    .option('--source-out <seconds>', 'Source trim out (default clip duration)')
    .option('--extend-shot', 'If the block pasts the shot end, extend the shot (never silent)')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const role = options.role === 'background' ? 'background' : 'layer'
        const result = await addShotClipBlock(
          options.shot,
          {
            clipId: options.clip,
            role,
            layerId: options.layer,
            t: options.time,
            sourceInSec: options.sourceIn,
            sourceOutSec: options.sourceOut,
            extendShot: !!options.extendShot
          },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          console.log(JSON.stringify({ ...result.block, shotDurationSec: result.shotDurationSec, extended: result.extended, layerId: result.layerId }, null, 2))
        } else {
          console.log(
            `✓ Added clip block ${result.block.id} ${describeClipBlock(result.block)}${result.extended ? ` (shot extended to ${result.shotDurationSec}s)` : ''}`
          )
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotClipCmd
    .command('list')
    .description('List authored clip blocks on a shot')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const rows = await listShotClipBlocks(options.shot, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify(rows, null, 2))
        } else if (rows.length === 0) {
          console.log('No clip blocks (legacy layer.clipId / backgroundClipId may still play implicitly)')
        } else {
          console.log(`Clip blocks (${rows.length}):`)
          for (const row of rows) {
            console.log(`  ${row.id}  ${describeClipBlock(row)}`)
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotClipCmd
    .command('show')
    .description('Show a clip block')
    .requiredOption('--id <blockId>', 'Clip block ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const found = await getShotClipBlock(options.id, getDataDir(mergedOpts.dataDir))
        if (!found) {
          console.error(`Clip block not found: ${options.id}`)
          process.exit(1)
        }
        if (mergedOpts.json) {
          console.log(JSON.stringify({ ...found.block, shotId: found.shotId }, null, 2))
        } else {
          console.log(`${found.block.id}  shot=${found.shotId}  ${describeClipBlock(found.block)}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotClipCmd
    .command('update')
    .description('Move or trim a clip block')
    .requiredOption('--id <blockId>', 'Clip block ID')
    .option('--time <seconds>', 'New shot start time')
    .option('--source-in <seconds>', 'Source trim in')
    .option('--source-out <seconds>', 'Source trim out')
    .option('--extend-shot', 'If the block pasts the shot end, extend the shot (never silent)')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const result = await updateShotClipBlock(
          options.id,
          {
            t: options.time,
            sourceInSec: options.sourceIn,
            sourceOutSec: options.sourceOut,
            extendShot: !!options.extendShot
          },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          console.log(JSON.stringify({ ...result.block, shotDurationSec: result.shotDurationSec, extended: result.extended }, null, 2))
        } else {
          console.log(`✓ Updated clip block ${result.block.id}${result.extended ? ` (shot extended to ${result.shotDurationSec}s)` : ''}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotClipCmd
    .command('remove')
    .description('Remove a clip block (does not delete the library clip)')
    .requiredOption('--id <blockId>', 'Clip block ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        await removeShotClipBlock(options.id, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify({ deleted: true, blockId: options.id }, null, 2))
        } else {
          console.log(`✓ Removed clip block: ${options.id}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotClipCmd
    .command('sample')
    .description('Print which clip blocks are active at a playhead time (preview timing, never persisted)')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--time <seconds>', 'Playhead time in seconds')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const dataDir = getDataDir(mergedOpts.dataDir)
        const pipeline = await getAssetPipeline(dataDir)
        const shot = await getShot(options.shot, dataDir)
        if (!shot) throw new Error(`Shot not found: ${options.shot}`)
        const timeSec = Number(options.time)
        if (!Number.isFinite(timeSec)) throw new Error('--time must be a number')
        const samples = sampleClipBlocks(shot, pipeline.clips || [], timeSec)
        const result = {
          timeSec,
          samples,
          authoredBlockCount: (shot.clipTrack || []).length,
          persisted: false,
          note: 'Half-open [t, t+duration). Outside the block the clip is not drawn. Legacy layer.clipId / backgroundClipId without a block play implicitly from 0 without extending the shot.'
        }
        if (mergedOpts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else if (samples.length === 0) {
          console.log(`t=${timeSec}s  (no active clip block)`)
        } else {
          for (const sample of samples) {
            console.log(
              `t=${timeSec}s  ${sample.role} clip=${sample.clipId} source=${sample.sourceTimeSec.toFixed(3)}s${sample.implicit ? ' (implicit)' : ''}`
            )
          }
        }
        } catch (err) {
          console.error('Error:', err instanceof Error ? err.message : err)
          process.exit(1)
        }
      })

  const shotAudioCmd = shotCmd
    .command('audio')
    .description('Timed music/SFX blocks on a shot (A2; not event SFX)')

  shotAudioCmd
    .command('add')
    .description('Place a Game-scoped audio block on the shot timeline')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--audio <audioId>', 'Library audio ID')
    .requiredOption('--time <seconds>', 'Shot start time')
    .option('--role <role>', 'music | sfx (default: library kind)')
    .option('--source-in <seconds>', 'Source trim in (default 0)')
    .option('--source-out <seconds>', 'Source trim out (default audio duration)')
    .option('--duration <seconds>', 'Authored block length (omit to fit remaining shot; loop may exceed trim; non-loop must equal trim)')
    .option('--loop', 'Wrap source within trim (default on for music)')
    .option('--no-loop', 'Do not loop (default for sfx)')
    .option('--volume <0-1>', 'Linear gain (default 1)')
    .option('--fade-in <seconds>', 'Fade in at block start (default 0)')
    .option('--fade-out <seconds>', 'Fade out at block end (default 0)')
    .option('--fit-shot', 'Clamp this block to the current shot end (keep library source)')
    .option('--extend-shot', 'If the block pasts the shot end, extend the shot (never silent)')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const argv = process.argv
        const hasLoop = argv.includes('--loop')
        const hasNoLoop = argv.includes('--no-loop')
        if (hasLoop && hasNoLoop) {
          throw new Error('Use either --loop or --no-loop, not both')
        }
        const result = await addShotAudioBlock(
          options.shot,
          {
            audioId: options.audio,
            role: options.role,
            t: options.time,
            sourceInSec: options.sourceIn,
            sourceOutSec: options.sourceOut,
            durationSec: options.duration,
            loop: hasLoop ? true : hasNoLoop ? false : undefined,
            volume: options.volume,
            fadeInSec: options.fadeIn,
            fadeOutSec: options.fadeOut,
            extendShot: !!options.extendShot,
            fitShot: !!options.fitShot
          },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          console.log(
            JSON.stringify(
              {
                ...result.block,
                shotDurationSec: result.shotDurationSec,
                extended: result.extended,
                fitted: result.fitted
              },
              null,
              2
            )
          )
        } else {
          const extra = result.extended
            ? ` (shot extended to ${result.shotDurationSec}s)`
            : result.fitted
              ? ` (fitted to remaining shot ${result.shotDurationSec}s)`
              : ''
          console.log(
            `✓ Added audio block ${result.block.id} ${describeAudioBlock(result.block)}${extra}`
          )
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotAudioCmd
    .command('list')
    .description('List authored audio blocks on a shot')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const rows = await listShotAudioBlocks(options.shot, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify(rows, null, 2))
        } else if (rows.length === 0) {
          console.log('No audio blocks')
        } else {
          console.log(`Audio blocks (${rows.length}):`)
          for (const row of rows) {
            console.log(`  ${row.id}  ${describeAudioBlock(row)}`)
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotAudioCmd
    .command('show')
    .description('Show an audio block')
    .requiredOption('--id <blockId>', 'Audio block ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const found = await getShotAudioBlock(options.id, getDataDir(mergedOpts.dataDir))
        if (!found) {
          console.error(`Audio block not found: ${options.id}`)
          process.exit(1)
        }
        if (mergedOpts.json) {
          console.log(JSON.stringify({ ...found.block, shotId: found.shotId }, null, 2))
        } else {
          console.log(`${found.block.id}  shot=${found.shotId}  ${describeAudioBlock(found.block)}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotAudioCmd
    .command('update')
    .description('Move, trim, or edit an audio block')
    .requiredOption('--id <blockId>', 'Audio block ID')
    .option('--time <seconds>', 'New shot start time')
    .option('--source-in <seconds>', 'Source trim in')
    .option('--source-out <seconds>', 'Source trim out')
    .option('--duration <seconds>', 'Authored block length')
    .option('--loop <bool>', 'true | false (omit to keep)')
    .option('--volume <0-1>', 'Linear gain')
    .option('--fade-in <seconds>', 'Fade in')
    .option('--fade-out <seconds>', 'Fade out')
    .option('--fit-shot', 'Clamp this block to the current shot end (keep library source; does not restore a previous shot length)')
    .option('--extend-shot', 'If the block pasts the shot end, extend the shot (never silent)')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const result = await updateShotAudioBlock(
          options.id,
          {
            t: options.time,
            sourceInSec: options.sourceIn,
            sourceOutSec: options.sourceOut,
            durationSec: options.duration,
            loop: options.loop,
            volume: options.volume,
            fadeInSec: options.fadeIn,
            fadeOutSec: options.fadeOut,
            extendShot: !!options.extendShot,
            fitShot: !!options.fitShot
          },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          console.log(
            JSON.stringify(
              {
                ...result.block,
                shotDurationSec: result.shotDurationSec,
                extended: result.extended,
                fitted: result.fitted
              },
              null,
              2
            )
          )
        } else {
          const extra = result.extended
            ? ` (shot extended to ${result.shotDurationSec}s)`
            : result.fitted
              ? ' (fitted to current shot end)'
              : ''
          console.log(`✓ Updated audio block ${result.block.id}${extra}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotAudioCmd
    .command('remove')
    .description('Remove an audio block (does not delete the library audio)')
    .requiredOption('--id <blockId>', 'Audio block ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        await removeShotAudioBlock(options.id, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify({ deleted: true, blockId: options.id }, null, 2))
        } else {
          console.log(`✓ Removed audio block: ${options.id}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotAudioCmd
    .command('sample')
    .description('Print which audio blocks are active at a playhead time (preview timing, never persisted)')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--time <seconds>', 'Playhead time in seconds')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const dataDir = getDataDir(mergedOpts.dataDir)
        const shot = await getShot(options.shot, dataDir)
        if (!shot) throw new Error(`Shot not found: ${options.shot}`)
        const timeSec = Number(options.time)
        if (!Number.isFinite(timeSec)) throw new Error('--time must be a number')
        const samples = sampleAudioBlocks(shot, timeSec)
        const result = {
          timeSec,
          samples,
          authoredBlockCount: (shot.audioTrack || []).length,
          persisted: false,
          note: 'Half-open [t, t+duration). Silence outside. Loop wraps trim. Paused currentTime seeks do not play — A2 mixer uses HTMLAudioElement.play()/pause().'
        }
        if (mergedOpts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else if (samples.length === 0) {
          console.log(`t=${timeSec}s  (no active audio block)`)
        } else {
          for (const sample of samples) {
            console.log(
              `t=${timeSec}s  ${sample.role} audio=${sample.audioId} source=${sample.sourceTimeSec.toFixed(3)}s gain=${sample.gain.toFixed(3)}${sample.loop ? ' loop' : ''}`
            )
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  const shotEventCueCmd = shotCmd
    .command('event-cue')
    .description(
      'Authored timeline event cues. Play fires the named event once per forward-play crossing. Not pause/reverse/seek-into. Independent of P4 pose/state keys.'
    )

  shotEventCueCmd
    .command('add')
    .description('Create an event cue at a shot time (fires that named event on Play)')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--event <eventId>', 'Event definition ID')
    .requiredOption('--time <seconds>', 'Shot time to fire')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const result = await addShotEventCue(
          options.shot,
          { t: options.time, eventId: options.event },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          console.log(`✓ Event cue ${result.cue.id} @ ${result.cue.t}s → ${result.cue.eventId}`)
          if (result.warning) console.log(`⚠ ${result.warning}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotEventCueCmd
    .command('list')
    .description('List event cues on a shot')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const cues = await listShotEventCues(options.shot, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify(cues, null, 2))
        } else if (cues.length === 0) {
          console.log('No event cues')
        } else {
          for (const cue of cues) {
            console.log(`${cue.id}  t=${cue.t}s  event=${cue.eventId}`)
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotEventCueCmd
    .command('show')
    .description('Show one event cue')
    .requiredOption('--id <cueId>', 'Event cue ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const found = await getShotEventCue(options.id, getDataDir(mergedOpts.dataDir))
        if (!found) throw new Error(`Event cue not found: ${options.id}`)
        if (mergedOpts.json) {
          console.log(JSON.stringify(found, null, 2))
        } else {
          console.log(`${found.cue.id}  shot=${found.shotId}  t=${found.cue.t}s  event=${found.cue.eventId}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotEventCueCmd
    .command('update')
    .description('Move a cue or retarget its event')
    .requiredOption('--id <cueId>', 'Event cue ID')
    .option('--time <seconds>', 'New shot time')
    .option('--event <eventId>', 'New event definition ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        if (options.time === undefined && options.event === undefined) {
          throw new Error('Provide --time and/or --event')
        }
        const result = await updateShotEventCue(
          options.id,
          { t: options.time, eventId: options.event },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          console.log(`✓ Updated event cue ${result.cue.id} @ ${result.cue.t}s → ${result.cue.eventId}`)
          if (result.warning) console.log(`⚠ ${result.warning}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotEventCueCmd
    .command('remove')
    .description('Remove an event cue (does not delete the named event or its bindings)')
    .requiredOption('--id <cueId>', 'Event cue ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        await removeShotEventCue(options.id, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify({ deleted: true, cueId: options.id }, null, 2))
        } else {
          console.log(`✓ Removed event cue: ${options.id}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  const shotBackgroundKeyCmd = shotCmd
    .command('background-key')
    .description(
      'Timed still-background keys. Step/hold from t until the next key. Static shot background is the value before the first key. Clip-track background blocks still overlay stills.'
    )

  shotBackgroundKeyCmd
    .command('add')
    .description('Add a still-background cut at a shot time')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--time <seconds>', 'Shot time for the cut')
    .option('--background-asset <id>', 'Library visual asset id (selected Game; full image)')
    .option('--background-state <id>', 'Asset state id for --background-asset (omit for default/static)')
    .option('--background-image <path>', 'Direct-import image (copied into studio backgrounds/)')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        if (options.backgroundAsset && options.backgroundImage) {
          throw new Error('Use either --background-asset or --background-image, not both')
        }
        let backgroundImage: string | undefined
        if (options.backgroundImage) {
          backgroundImage = await importDirectShotBackground(
            options.backgroundImage,
            getDataDir(mergedOpts.dataDir)
          )
        }
        const result = await addShotBackgroundKey(
          options.shot,
          {
            t: options.time,
            backgroundVisualAssetId: options.backgroundAsset,
            backgroundAssetStateId: options.backgroundState,
            backgroundImage
          },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          console.log(
            `✓ Background key ${result.key.id} @ ${result.key.t}s → ${describeBackgroundKey(result.key)}`
          )
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotBackgroundKeyCmd
    .command('list')
    .description('List still-background keys on a shot')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const keys = await listShotBackgroundKeys(options.shot, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify(keys, null, 2))
        } else if (keys.length === 0) {
          console.log('No background keys (static shot background holds for the whole shot)')
        } else {
          const pipeline = await getAssetPipeline(getDataDir(mergedOpts.dataDir))
          for (const key of keys) {
            console.log(
              `${key.id}  t=${key.t}s  ${describeBackgroundKey(key, pipeline)}`
            )
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotBackgroundKeyCmd
    .command('show')
    .description('Show one background key')
    .requiredOption('--id <keyId>', 'Background key ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const found = await getShotBackgroundKey(options.id, getDataDir(mergedOpts.dataDir))
        if (!found) throw new Error(`Background key not found: ${options.id}`)
        if (mergedOpts.json) {
          console.log(JSON.stringify(found, null, 2))
        } else {
          const pipeline = await getAssetPipeline(getDataDir(mergedOpts.dataDir))
          console.log(
            `${found.key.id}  shot=${found.shotId}  t=${found.key.t}s  ${describeBackgroundKey(found.key, pipeline)}`
          )
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotBackgroundKeyCmd
    .command('update')
    .description('Move a background key or change its still')
    .requiredOption('--id <keyId>', 'Background key ID')
    .option('--time <seconds>', 'New shot time')
    .option('--background-asset <id>', 'Library visual asset id')
    .option('--background-state <id>', 'Asset state id')
    .option('--background-image <path>', 'Direct-import image (copied into studio backgrounds/)')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        if (
          options.time === undefined &&
          options.backgroundAsset === undefined &&
          options.backgroundState === undefined &&
          options.backgroundImage === undefined
        ) {
          throw new Error('Provide --time, --background-asset, --background-state, and/or --background-image')
        }
        if (options.backgroundAsset && options.backgroundImage) {
          throw new Error('Use either --background-asset or --background-image, not both')
        }
        let backgroundImage: string | undefined
        if (options.backgroundImage) {
          backgroundImage = await importDirectShotBackground(
            options.backgroundImage,
            getDataDir(mergedOpts.dataDir)
          )
        }
        const result = await updateShotBackgroundKey(
          options.id,
          {
            t: options.time,
            backgroundVisualAssetId: options.backgroundAsset,
            backgroundAssetStateId: options.backgroundState,
            backgroundImage
          },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          console.log(
            `✓ Updated background key ${result.key.id} @ ${result.key.t}s → ${describeBackgroundKey(result.key)}`
          )
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  shotBackgroundKeyCmd
    .command('remove')
    .description('Remove a background key (static shot background is unchanged)')
    .requiredOption('--id <keyId>', 'Background key ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        await removeShotBackgroundKey(options.id, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify({ deleted: true, keyId: options.id }, null, 2))
        } else {
          console.log(`✓ Removed background key: ${options.id}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  // Layer commands
  const layerCmd = program
    .command('layer')
    .description('Manage layers in shots (including timed pose/state keys)')

  layerCmd
    .command('list')
    .description('List layers in a shot')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const shot = await getShot(options.shot, getDataDir(mergedOpts.dataDir))
        if (!shot) {
          console.error(`Shot not found: ${options.shot}`)
          process.exit(1)
        }
        const layers = shot.layers || []
        if (mergedOpts.json) {
          console.log(JSON.stringify(layers, null, 2))
        } else if (layers.length === 0) {
          console.log('No layers found')
        } else {
          console.log(`Layers (${layers.length}):`)
          for (const layer of layers) {
            const bits = [`z${layer.zOrder}`, layer.visible === false ? 'hidden' : 'visible']
            if (layer.visibleFromSec !== undefined || layer.visibleToSec !== undefined) {
              bits.push(
                `range ${layer.visibleFromSec ?? 0}–${layer.visibleToSec ?? 'end'}`
              )
            }
            if (layer.visualAssetId) bits.push(`asset=${layer.visualAssetId}`)
            if (layer.assetStateId) bits.push(`state=${layer.assetStateId}`)
            if (layer.characterId) bits.push(`character=${layer.characterId}`)
            if (layer.poseId) bits.push(`pose=${layer.poseId}`)
            if (layer.text !== undefined) bits.push(`text="${layer.text.slice(0, 40)}"`)
            if (layer.fontRef) bits.push(`font=${layer.fontRef}`)
            if (layer.paletteRef) bits.push(`palette=${layer.paletteRef}`)
            console.log(`  ${layer.id}  ${bits.join(' ')}`)
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  layerCmd
    .command('show')
    .description('Show a layer')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--id <layerId>', 'Layer ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const shot = await getShot(options.shot, getDataDir(mergedOpts.dataDir))
        if (!shot) {
          console.error(`Shot not found: ${options.shot}`)
          process.exit(1)
        }
        const layer = (shot.layers || []).find((l) => l.id === options.id)
        if (!layer) {
          console.error(`Layer not found: ${options.id}`)
          process.exit(1)
        }
        console.log(JSON.stringify(layer, null, 2))
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  layerCmd
    .command('add')
    .description('Add a layer to a shot (visual asset, character pose, text, clip, or image)')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--z <zOrder>', 'Z-order (higher = closer to camera)', '1')
    .option('--asset <assetId>', 'Visual asset ID (Library asset layer)')
    .option('--state <stateId>', 'Asset state ID (omit to use asset default / static image)')
    .option('--character <characterId>', 'Character ID (use with --pose)')
    .option('--pose <poseId>', 'Pose ID (creates character pose layer)')
    .option('--text <content>', 'Editable text content (text layer)')
    .option('--font <fontRef>', 'Font id, Game Definition theme slot id, or "default"', 'default')
    .option('--palette <paletteRef>', 'Palette id, Game Definition theme slot id, or "default"', 'default')
    .option('--clip <clipId>', 'Clip ID (creates animated clip layer)')
    .option('--image <path>', 'Image path (creates static image layer)')
    .option('--visible <bool>', 'Visibility (true/false)', 'true')
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
          visualAssetId: options.asset,
          assetStateId: options.asset ? (options.state || null) : undefined,
          text: options.text,
          fontRef: options.text ? options.font : undefined,
          paletteRef: options.text ? options.palette : undefined,
          visible: options.visible !== 'false',
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
    .option('--asset <assetId>', 'Visual asset ID')
    .option('--state <stateId>', 'Asset state ID')
    .option('--clear-state', 'Use asset default / static image (clears authored state)')
    .option('--character <characterId>', 'Character ID')
    .option('--pose <poseId>', 'Pose ID')
    .option('--text <content>', 'Text content')
    .option('--font <fontRef>', 'Font id, theme slot id, or "default"')
    .option('--palette <paletteRef>', 'Palette id, theme slot id, or "default"')
    .option('--visible <bool>', 'Visibility (true/false) — editor eye hide')
    .option('--visible-from <seconds>', 'Timed presence start (half-open; omit = shot start)')
    .option('--visible-to <seconds>', 'Timed presence end (half-open; omit = shot end)')
    .option('--clear-visible-from', 'Clear timed presence start (layer present from 0)')
    .option('--clear-visible-to', 'Clear timed presence end (layer present through shot end)')
    .option('--clear-visible-range', 'Clear both timed presence bounds (whole shot)')
    .option('--x <coord>', 'X coordinate (0-1)')
    .option('--y <coord>', 'Y coordinate (0-1)')
    .option('--scale <factor>', 'Scale factor')
    .option('--fit-source', 'Reset scale to 1 (200px max-side source-aspect fit). Does not rewrite position, state, or media.')
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
        if (options.asset) updates.visualAssetId = options.asset
        if (options.clearState) updates.assetStateId = null
        else if (options.state) updates.assetStateId = options.state
        if (options.character) updates.characterId = options.character
        if (options.pose) updates.poseId = options.pose
        if (options.text !== undefined) updates.text = options.text
        if (options.font !== undefined) updates.fontRef = options.font
        if (options.palette !== undefined) updates.paletteRef = options.palette
        if (options.visible !== undefined) updates.visible = options.visible !== 'false'
        if (options.clearVisibleRange) {
          updates.visibleFromSec = null
          updates.visibleToSec = null
        }
        if (options.clearVisibleFrom) updates.visibleFromSec = null
        else if (options.visibleFrom !== undefined) {
          updates.visibleFromSec = parseVisibilityBound(options.visibleFrom, '--visible-from')
        }
        if (options.clearVisibleTo) updates.visibleToSec = null
        else if (options.visibleTo !== undefined) {
          updates.visibleToSec = parseVisibilityBound(options.visibleTo, '--visible-to')
        }
        if (options.x !== undefined) updates.x = parseFloat(options.x)
        if (options.y !== undefined) updates.y = parseFloat(options.y)
        if (options.fitSource) updates.scale = 1
        else if (options.scale !== undefined) updates.scale = parseFloat(options.scale)
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

  const layerKeyCmd = layerCmd
    .command('key')
    .description('Timed pose/state keys on a layer (P4 step/hold; not C.3c FX keys)')

  function layerKeyAction(options: { pose?: string; state?: string }): LayerTimedKeyAction {
    if (options.pose && options.state) {
      throw new Error('Specify --pose or --state, not both')
    }
    if (options.pose) return { type: 'setPose', poseId: options.pose }
    if (options.state) return { type: 'setState', stateId: options.state }
    throw new Error('--pose or --state is required')
  }

  layerKeyCmd
    .command('add')
    .description('Add a timed pose or state key on a layer')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--layer <layerId>', 'Layer ID')
    .requiredOption('--time <seconds>', 'Time in seconds (0..shot duration)')
    .option('--pose <poseId>', 'Pose ID (character layers)')
    .option('--state <stateId>', 'Asset state ID (visual-asset layers)')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const key = await addLayerTimedKey(
          options.shot,
          options.layer,
          { t: options.time, action: layerKeyAction(options) },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          console.log(JSON.stringify({ ...key, layerId: options.layer, shotId: options.shot }, null, 2))
        } else {
          console.log(`✓ Added timed key ${key.id} at t=${key.t}s (${describeTimedKeyAction(key.action)})`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  layerKeyCmd
    .command('list')
    .description('List timed pose/state keys on a shot or layer')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .option('--layer <layerId>', 'Filter to one layer')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const rows = await listLayerTimedKeys(
          options.shot,
          options.layer,
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          console.log(JSON.stringify(rows.map((r) => ({ ...r.key, layerId: r.layerId })), null, 2))
        } else if (rows.length === 0) {
          console.log('No timed keys found')
        } else {
          console.log(`Timed keys (${rows.length}):`)
          for (const row of rows) {
            console.log(
              `  ${row.key.id}  layer=${row.layerId}  t=${row.key.t}s  ${describeTimedKeyAction(row.key.action)}`
            )
          }
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  layerKeyCmd
    .command('show')
    .description('Show a timed key')
    .requiredOption('--id <keyId>', 'Timed key ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const found = await getLayerTimedKey(options.id, getDataDir(mergedOpts.dataDir))
        if (!found) {
          console.error(`Timed key not found: ${options.id}`)
          process.exit(1)
        }
        if (mergedOpts.json) {
          console.log(JSON.stringify({ ...found.key, shotId: found.shotId, layerId: found.layerId }, null, 2))
        } else {
          console.log(`${found.key.id}  shot=${found.shotId} layer=${found.layerId} t=${found.key.t}s`)
          console.log(`  ${describeTimedKeyAction(found.key.action)}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  layerKeyCmd
    .command('update')
    .description('Update a timed key time or pose/state')
    .requiredOption('--id <keyId>', 'Timed key ID')
    .option('--time <seconds>', 'New time in seconds')
    .option('--pose <poseId>', 'Pose ID')
    .option('--state <stateId>', 'Asset state ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const patch: { t?: string; action?: LayerTimedKeyAction } = {}
        if (options.time !== undefined) patch.t = options.time
        if (options.pose || options.state) patch.action = layerKeyAction(options)
        const key = await updateLayerTimedKey(options.id, patch, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify(key, null, 2))
        } else {
          console.log(`✓ Updated timed key ${key.id} at t=${key.t}s`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  layerKeyCmd
    .command('remove')
    .description('Remove a timed key')
    .requiredOption('--id <keyId>', 'Timed key ID')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        await removeLayerTimedKey(options.id, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          console.log(JSON.stringify({ deleted: true, keyId: options.id }, null, 2))
        } else {
          console.log(`✓ Removed timed key: ${options.id}`)
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err)
        process.exit(1)
      }
    })

  layerKeyCmd
    .command('sample')
    .description('Print effective pose/state at a playhead time (preview only, never persisted)')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--layer <layerId>', 'Layer ID')
    .requiredOption('--time <seconds>', 'Playhead time in seconds')
    .option('--event <eventId>', 'Optional event id to simulate at this playhead')
    .option('--now-ms <ms>', 'Event fire clock (default 0)', '0')
    .option('--tick-ms <ms>', 'Optional later clock to expire a timed event hold')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.parent!.opts(), ...options }
        const dataDir = getDataDir(mergedOpts.dataDir)
        const pipeline = await getAssetPipeline(dataDir)
        const shot = await getShot(options.shot, dataDir)
        if (!shot) throw new Error(`Shot not found: ${options.shot}`)
        const layer = (shot.layers || []).find((l) => l.id === options.layer)
        if (!layer) throw new Error(`Layer not found: ${options.layer}`)
        const timeSec = Number(options.time)
        if (!Number.isFinite(timeSec)) throw new Error('--time must be a number')
        let eventOverride
        if (options.event) {
          const simulated = simulateEventFire({
            events: pipeline.eventDefinitions || [],
            bindings: pipeline.eventBindings || [],
            shotId: options.shot,
            eventId: options.event,
            nowMs: Number(options.nowMs || 0),
            tickMs: options.tickMs !== undefined ? Number(options.tickMs) : undefined
          })
          eventOverride = simulated.snapshot.overrides[layer.id]
        }
        const effective = applyEffectiveLayer(layer, timeSec, eventOverride)
        const result = {
          layerId: layer.id,
          timeSec,
          authoredPoseId: layer.poseId ?? null,
          authoredStateId: layer.assetStateId ?? null,
          effectivePoseId: effective.poseId ?? null,
          effectiveStateId: effective.assetStateId ?? null,
          eventActive: !!eventOverride,
          persisted: false
        }
        if (mergedOpts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          console.log(
            `t=${timeSec}s authored pose=${result.authoredPoseId} state=${result.authoredStateId} → effective pose=${result.effectivePoseId} state=${result.effectiveStateId}${result.eventActive ? ' (event hold)' : ''}`
          )
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
    .command('update')
    .description('Update camera keyframe at time')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--time <seconds>', 'Time in seconds (must match existing keyframe)')
    .option('--target-layer <layerId>', 'New target layer ID')
    .option('--target-x <coord>', 'New target X coordinate (0-1)')
    .option('--target-y <coord>', 'New target Y coordinate (0-1)')
    .option('--zoom <level>', 'New zoom level')
    .option('--json', 'Output as JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const shot = await getShot(options.shot, getDataDir(mergedOpts.dataDir))
        
        const keyframeIndex = shot.cameraTrack.findIndex(kf => Math.abs(kf.t - parseFloat(options.time)) < 0.01)
        if (keyframeIndex < 0) {
          console.error(`No camera keyframe found at t=${options.time}s`)
          process.exit(1)
        }
        
        const existing = shot.cameraTrack[keyframeIndex]
        const updated: CameraKeyframe = {
          t: existing.t,
          target: options.targetLayer 
            ? options.targetLayer
            : (options.targetX !== undefined || options.targetY !== undefined)
              ? {
                  x: options.targetX !== undefined ? parseFloat(options.targetX) : (typeof existing.target === 'object' ? existing.target.x : 0.5),
                  y: options.targetY !== undefined ? parseFloat(options.targetY) : (typeof existing.target === 'object' ? existing.target.y : 0.5)
                }
              : existing.target,
          zoom: options.zoom !== undefined ? parseFloat(options.zoom) : existing.zoom,
          framingRect: existing.framingRect
        }
        
        const newTrack = [...shot.cameraTrack]
        newTrack[keyframeIndex] = updated
        
        await updateShot(options.shot, { cameraTrack: newTrack }, getDataDir(mergedOpts.dataDir))

        if (mergedOpts.json) {
          console.log(JSON.stringify({ updated: true, keyframe: updated }, null, 2))
        } else {
          console.log(`✓ Updated camera keyframe at t=${options.time}s`)
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
