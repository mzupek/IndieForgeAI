/**
 * P3: forge event + forge binding CRUD and preview-fire simulation.
 */

import { Command } from 'commander'
import type { EventBindingAction } from '@shared/types/assetPipeline'
import { getDataDir } from '../../core/storage/dataDir'
import { getAssetPipeline } from '../../core/storage/studioStorage'
import { getShot } from '../../core/storage/storyboardService'
import {
  createBinding,
  createEvent,
  getBinding,
  getEvent,
  listBindings,
  listEvents,
  removeBinding,
  removeEvent,
  updateBinding,
  updateEvent
} from '../../core/storage/eventService'
import { describeBindingAction } from '../../shared/storyboard/eventValidation'
import { applyLayerPreview, simulateEventFire } from '../../shared/storyboard/eventPreview'
import { output, outputError } from '../utils/output'

function parseAction(options: {
  action?: string
  pose?: string
  state?: string
  visible?: string
  text?: string
  audio?: string
  volume?: string
}): EventBindingAction {
  const type = options.action
  if (!type) {
    throw new Error('--action is required (setPose|setState|setVisibility|setText|playSfx)')
  }
  if (type === 'setPose') {
    if (!options.pose) throw new Error('--pose is required for setPose')
    return { type: 'setPose', poseId: options.pose }
  }
  if (type === 'setState') {
    if (!options.state) throw new Error('--state is required for setState')
    return { type: 'setState', stateId: options.state }
  }
  if (type === 'setVisibility') {
    if (options.visible === undefined) throw new Error('--visible is required for setVisibility')
    return { type: 'setVisibility', visible: options.visible !== 'false' }
  }
  if (type === 'setText') {
    if (options.text === undefined) throw new Error('--text is required for setText')
    return { type: 'setText', text: options.text }
  }
  if (type === 'playSfx') {
    if (!options.audio) throw new Error('--audio is required for playSfx')
    const volume =
      options.volume !== undefined && options.volume !== '' ? Number(options.volume) : undefined
    if (volume !== undefined && (!Number.isFinite(volume) || volume < 0 || volume > 1)) {
      throw new Error(`--volume must be between 0 and 1, got '${options.volume}'`)
    }
    return volume === undefined
      ? { type: 'playSfx', audioId: options.audio }
      : { type: 'playSfx', audioId: options.audio, volume }
  }
  throw new Error(`Unknown action '${type}'. Use setPose|setState|setVisibility|setText|playSfx`)
}

function parseOptionalAction(options: {
  action?: string
  pose?: string
  state?: string
  visible?: string
  text?: string
  audio?: string
  volume?: string
}): EventBindingAction | undefined {
  if (
    !options.action &&
    !options.pose &&
    !options.state &&
    options.visible === undefined &&
    options.text === undefined &&
    !options.audio
  ) {
    return undefined
  }
  return parseAction({ ...options, action: options.action || inferAction(options) })
}

function inferAction(options: {
  pose?: string
  state?: string
  visible?: string
  text?: string
  audio?: string
}): string | undefined {
  if (options.audio) return 'playSfx'
  if (options.pose) return 'setPose'
  if (options.state) return 'setState'
  if (options.visible !== undefined) return 'setVisibility'
  if (options.text !== undefined) return 'setText'
  return undefined
}

function parsePayload(value?: string): Record<string, string | number | boolean> | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('payload must be a JSON object')
    }
    return parsed
  } catch (err) {
    throw new Error(`Invalid --payload JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function registerEventCommands(program: Command): void {
  const eventCmd = program
    .command('event')
    .description('Manage game events and preview-fire simulated responses (P3/A3; fire is not host speaker audio)')

  eventCmd
    .command('list')
    .description('List events for a game')
    .requiredOption('--game <gameId>', 'Game ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const events = await listEvents(options.game, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          output(events, mergedOpts)
        } else if (events.length === 0) {
          console.log('No events found')
        } else {
          console.log(`Found ${events.length} event(s):`)
          for (const ev of events) {
            console.log(`  ${ev.id}: ${ev.name}${ev.description ? ` — ${ev.description}` : ''}`)
          }
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  eventCmd
    .command('show')
    .description('Show event details')
    .requiredOption('--id <eventId>', 'Event ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const event = await getEvent(options.id, getDataDir(mergedOpts.dataDir))
        if (!event) {
          throw new Error(`Event not found: ${options.id}`)
        }
        if (mergedOpts.json) {
          output(event, mergedOpts)
        } else {
          console.log(`${event.name} (${event.id})`)
          console.log(`  Game: ${event.gameId}`)
          if (event.description) console.log(`  Description: ${event.description}`)
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  eventCmd
    .command('create')
    .description('Create a game event (Forge authors responses; engines detect real hits)')
    .requiredOption('--game <gameId>', 'Game ID')
    .requiredOption('--name <name>', 'Event name (e.g. hit_received)')
    .option('--description <text>', 'Description')
    .option('--payload-schema <json>', 'Optional payload schema JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const event = await createEvent(
          {
            gameId: options.game,
            name: options.name,
            description: options.description,
            payloadSchema: options.payloadSchema
          },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          output(event, mergedOpts)
        } else {
          console.log(`✓ Created event: ${event.name} (${event.id})`)
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  eventCmd
    .command('update')
    .description('Update an event')
    .requiredOption('--id <eventId>', 'Event ID')
    .option('--name <name>', 'Event name')
    .option('--description <text>', 'Description')
    .option('--payload-schema <json>', 'Payload schema JSON (empty to clear)')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const event = await updateEvent(
          options.id,
          {
            name: options.name,
            description: options.description,
            payloadSchema:
              options.payloadSchema === '' ? null : options.payloadSchema
          },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          output(event, mergedOpts)
        } else {
          console.log(`✓ Updated event: ${event.name} (${event.id})`)
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  eventCmd
    .command('remove')
    .description('Remove an event (rejected if bindings still reference it)')
    .requiredOption('--id <eventId>', 'Event ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        await removeEvent(options.id, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          output({ deleted: true, eventId: options.id }, mergedOpts)
        } else {
          console.log(`✓ Removed event: ${options.id}`)
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  eventCmd
    .command('fire')
    .description(
      'Preview-fire an event in Forge only (does not persist; reports preview SFX state, not host speaker audio)'
    )
    .requiredOption('--game <gameId>', 'Game ID')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--event <eventId>', 'Event ID')
    .option('--payload <json>', 'Optional payload JSON for filter matching')
    .option('--now-ms <ms>', 'Simulated clock at fire (default 0)', '0')
    .option('--tick-ms <ms>', 'Optional later clock to expire timed holds')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const dataDir = getDataDir(mergedOpts.dataDir)
        const pipeline = await getAssetPipeline(dataDir)
        const event = (pipeline.eventDefinitions || []).find((e) => e.id === options.event)
        if (!event) {
          throw new Error(`Event not found: ${options.event}`)
        }
        if (event.gameId !== options.game) {
          throw new Error(
            `Event '${event.name}' belongs to game '${event.gameId}', not '${options.game}'`
          )
        }
        const shot = await getShot(options.shot, dataDir)
        if (!shot) {
          throw new Error(`Shot not found: ${options.shot}`)
        }
        const nowMs = Number(options.nowMs)
        const tickMs = options.tickMs !== undefined ? Number(options.tickMs) : undefined
        if (!Number.isFinite(nowMs) || (tickMs !== undefined && !Number.isFinite(tickMs))) {
          throw new Error('--now-ms and --tick-ms must be numbers')
        }
        const simulated = simulateEventFire({
          events: pipeline.eventDefinitions || [],
          bindings: pipeline.eventBindings || [],
          shotId: options.shot,
          eventId: options.event,
          nowMs,
          tickMs,
          payload: parsePayload(options.payload)
        })
        const persisted = await getShot(options.shot, dataDir)
        const authoredDefaults = (persisted?.layers || []).map((layer) => ({
          id: layer.id,
          poseId: layer.poseId ?? null,
          assetStateId: layer.assetStateId ?? null,
          visible: layer.visible,
          text: layer.text ?? null
        }))
        const previewLayers = (shot.layers || []).map((layer) => {
          const effective = applyLayerPreview(layer, simulated.snapshot.overrides[layer.id])
          return {
            id: layer.id,
            authoredPoseId: layer.poseId ?? null,
            previewPoseId: effective.poseId ?? null,
            authoredStateId: layer.assetStateId ?? null,
            previewStateId: effective.assetStateId ?? null,
            authoredVisible: layer.visible,
            previewVisible: effective.visible,
            authoredText: layer.text ?? null,
            previewText: effective.text ?? null
          }
        })
        const authoredAudioTrack = (persisted?.audioTrack || []).map((b) => ({ ...b }))
        const result = {
          fire: simulated.fire,
          snapshot: simulated.snapshot,
          previewLayers,
          authoredDefaults,
          sfx: (simulated.snapshot.sfx || []).map((s) => ({
            bindingId: s.bindingId,
            audioId: s.audioId,
            volume: s.volume,
            durationSec: s.durationSec,
            returnPolicy: s.returnPolicy,
            stopOnExpiry: s.stopOnExpiry,
            generation: s.generation,
            persisted: false
          })),
          authoredAudioTrack,
          persisted: false,
          note:
            'Preview only. Authored layer defaults and audioTrack were not written. This reports preview state, not host speaker audio.'
        }
        if (mergedOpts.json) {
          output(result, mergedOpts)
        } else {
          console.log(`Fired ${event.name}: matched ${simulated.fire.matched}`)
          console.log(`Preview holds: ${simulated.snapshot.holds.length}`)
          console.log(`Preview SFX: ${result.sfx.length} (persisted: false)`)
          console.log('Authored defaults and audioTrack were not persisted.')
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  const bindingCmd = program
    .command('binding')
    .description('Manage shot event bindings (event → layer action and/or playSfx)')

  bindingCmd
    .command('list')
    .description('List bindings for a shot')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const bindings = await listBindings(options.shot, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          output(bindings, mergedOpts)
        } else if (bindings.length === 0) {
          console.log('No bindings found')
        } else {
          console.log(`Found ${bindings.length} binding(s):`)
          for (const b of bindings) {
            const target =
              b.action.type === 'playSfx' ? 'playSfx' : `layer ${b.targetLayerId || '-'}`
            console.log(
              `  ${b.id}: event ${b.eventId} → ${target} ${describeBindingAction(b.action)} (${b.durationSec}s ${b.returnPolicy})`
            )
          }
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  bindingCmd
    .command('show')
    .description('Show binding details')
    .requiredOption('--id <bindingId>', 'Binding ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const binding = await getBinding(options.id, getDataDir(mergedOpts.dataDir))
        if (!binding) {
          throw new Error(`Binding not found: ${options.id}`)
        }
        if (mergedOpts.json) {
          output(binding, mergedOpts)
        } else {
          console.log(binding.id)
          console.log(`  Shot: ${binding.shotId}`)
          console.log(`  Event: ${binding.eventId}`)
          console.log(`  Layer: ${binding.targetLayerId || '(none — playSfx needs no layer)'}`)
          console.log(`  Action: ${describeBindingAction(binding.action)}`)
          console.log(`  Duration: ${binding.durationSec}s  Return: ${binding.returnPolicy}`)
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  bindingCmd
    .command('create')
    .description('Bind an event to a layer action and/or playSfx on a shot')
    .requiredOption('--game <gameId>', 'Game ID (must match the shot\'s storyboard)')
    .requiredOption('--shot <shotId>', 'Shot ID')
    .requiredOption('--event <eventId>', 'Event ID')
    .option('--layer <layerId>', 'Target layer ID (required except playSfx)')
    .requiredOption('--action <type>', 'setPose | setState | setVisibility | setText | playSfx')
    .option('--pose <poseId>', 'Pose ID (setPose)')
    .option('--state <stateId>', 'Asset state ID (setState)')
    .option('--visible <bool>', 'true|false (setVisibility)')
    .option('--text <content>', 'Text content (setText)')
    .option('--audio <audioId>', 'Library audio ID (playSfx)')
    .option('--volume <0-1>', 'playSfx linear gain (default 1)')
    .option('--duration <sec>', 'Hold duration in seconds (0 = instant / playSfx plays once to completion)', '0')
    .option('--return-policy <policy>', "default (return to authored / stop SFX at expiry) | hold", 'default')
    .option('--filter <json>', 'Optional payload filter JSON')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const binding = await createBinding(
          {
            gameId: options.game,
            shotId: options.shot,
            eventId: options.event,
            targetLayerId: options.layer,
            action: parseAction(options),
            payloadFilter: options.filter,
            durationSec: options.duration,
            returnPolicy: options.returnPolicy
          },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          output(binding, mergedOpts)
        } else {
          console.log(`✓ Created binding: ${binding.id} (${describeBindingAction(binding.action)})`)
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  bindingCmd
    .command('update')
    .description('Update a binding')
    .requiredOption('--id <bindingId>', 'Binding ID')
    .option('--game <gameId>', 'Game ID (scope check)')
    .option('--event <eventId>', 'Event ID')
    .option('--layer <layerId>', 'Target layer ID')
    .option('--action <type>', 'setPose | setState | setVisibility | setText | playSfx')
    .option('--pose <poseId>', 'Pose ID (setPose)')
    .option('--state <stateId>', 'Asset state ID (setState)')
    .option('--visible <bool>', 'true|false (setVisibility)')
    .option('--text <content>', 'Text content (setText)')
    .option('--audio <audioId>', 'Library audio ID (playSfx)')
    .option('--volume <0-1>', 'playSfx linear gain')
    .option('--duration <sec>', 'Hold duration in seconds')
    .option('--return-policy <policy>', 'default | hold')
    .option('--filter <json>', 'Payload filter JSON (empty to clear)')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        const action = parseOptionalAction(options)
        const binding = await updateBinding(
          options.id,
          {
            gameId: options.game,
            eventId: options.event,
            targetLayerId: options.layer,
            action,
            payloadFilter: options.filter === '' ? null : options.filter,
            durationSec: options.duration,
            returnPolicy: options.returnPolicy
          },
          getDataDir(mergedOpts.dataDir)
        )
        if (mergedOpts.json) {
          output(binding, mergedOpts)
        } else {
          console.log(`✓ Updated binding: ${binding.id}`)
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  bindingCmd
    .command('remove')
    .description('Remove a binding')
    .requiredOption('--id <bindingId>', 'Binding ID')
    .action(async (options, cmd) => {
      try {
        const mergedOpts = { ...cmd.parent!.parent!.opts(), ...options }
        await removeBinding(options.id, getDataDir(mergedOpts.dataDir))
        if (mergedOpts.json) {
          output({ deleted: true, bindingId: options.id }, mergedOpts)
        } else {
          console.log(`✓ Removed binding: ${options.id}`)
        }
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })
}
