/**
 * A1: forge audio import/list/show/update/remove
 * Catalog only — no storyboard mixer, no generation providers.
 */

import type { AudioAsset } from '@shared/types/assetPipeline'
import {
  importAudio,
  listAudioAssets,
  getAudioAsset,
  updateAudio,
  removeAudio
} from '../../main/storage/audioService'
import { output, outputError } from '../utils/output'
import {
  formatAudioDuration,
  parseAudioKind
} from '../../shared/storyboard/audioValidation'
import { Command } from 'commander'

interface BaseOptions {
  dataDir?: string
  json?: boolean
  game: string
}

export function registerAudioCommands(program: Command): void {
  const audioCmd = program
    .command('audio')
    .description('Manage Game-scoped audio library (import catalog; not storyboard mixer)')

  audioCmd
    .command('import')
    .description('Import audio file(s) into the selected Game library (copies into studio storage)')
    .argument('<files...>', 'Audio files (mp3/wav/ogg/m4a)')
    .requiredOption('--game <gameId>', 'Game ID')
    .requiredOption('--kind <kind>', 'music | sfx')
    .option('--name <name>', 'Display name (single file only; default: filename)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--engine-notes <text>', 'Optional mapping note for existing engine clips (not a playable substitute)')
    .action(async (files: string[], options, cmd) => {
      try {
        const merged = { ...cmd.parent!.parent!.opts(), ...options }
        await importFiles(files, merged)
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  audioCmd
    .command('list')
    .description('List audio for a game')
    .requiredOption('--game <gameId>', 'Game ID')
    .option('--kind <kind>', 'Filter by music | sfx')
    .action(async (options, cmd) => {
      try {
        const merged = { ...cmd.parent!.parent!.opts(), ...options }
        await list(merged)
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  audioCmd
    .command('show')
    .description('Show audio details')
    .argument('<audio-id>', 'Audio ID')
    .requiredOption('--game <gameId>', 'Game ID')
    .action(async (audioId: string, options, cmd) => {
      try {
        const merged = { ...cmd.parent!.parent!.opts(), ...options }
        await show(audioId, merged)
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  audioCmd
    .command('update')
    .description('Update audio metadata or replace the imported file')
    .argument('<audio-id>', 'Audio ID')
    .requiredOption('--game <gameId>', 'Game ID')
    .option('--name <name>', 'Display name')
    .option('--kind <kind>', 'music | sfx')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--engine-notes <text>', 'Engine mapping note (empty to clear)')
    .option('--file <path>', 'Replace studio-owned file (re-probes duration)')
    .action(async (audioId: string, options, cmd) => {
      try {
        const merged = { ...cmd.parent!.parent!.opts(), ...options }
        await update(audioId, merged)
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })

  audioCmd
    .command('remove')
    .description('Remove an audio asset (rejected if referenced by shots/events)')
    .argument('<audio-id>', 'Audio ID')
    .requiredOption('--game <gameId>', 'Game ID')
    .action(async (audioId: string, options, cmd) => {
      try {
        const merged = { ...cmd.parent!.parent!.opts(), ...options }
        await remove(audioId, merged)
      } catch (err) {
        outputError(err, { ...cmd.parent!.parent!.opts(), ...options })
        process.exit(1)
      }
    })
}

async function importFiles(
  files: string[],
  options: BaseOptions & {
    kind: string
    name?: string
    tags?: string
    engineNotes?: string
  }
): Promise<void> {
  if (options.name && files.length !== 1) {
    throw new Error('--name can only be used when importing a single file')
  }
  parseAudioKind(options.kind)
  const tags = options.tags ? options.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
  const imported: AudioAsset[] = []
  const errors: string[] = []

  for (const filePath of files) {
    try {
      const asset = await importAudio(filePath, {
        gameId: options.game,
        kind: options.kind,
        name: options.name,
        tags,
        engineNotes: options.engineNotes,
        dataDirOverride: options.dataDir
      })
      imported.push(asset)
    } catch (err: any) {
      errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (options.json) {
    output({ imported, errors }, options)
  } else {
    if (imported.length > 0) {
      console.log(`\nImported ${imported.length} audio asset(s):`)
      for (const asset of imported) {
        console.log(
          `  ${asset.kind}: ${asset.name} (${asset.id}) ${formatAudioDuration(asset.durationSec)}`
        )
      }
    }
    if (errors.length > 0) {
      console.error(`\nErrors (${errors.length}):`)
      for (const error of errors) {
        console.error(`  ${error}`)
      }
    }
    if (imported.length === 0 && errors.length === 0) {
      console.log('No audio imported')
    }
  }

  if (errors.length > 0 && imported.length === 0) {
    process.exit(1)
  }
}

async function list(
  options: BaseOptions & { kind?: string }
): Promise<void> {
  let assets = await listAudioAssets(options.game, options.dataDir)
  if (options.kind) {
    const kind = parseAudioKind(options.kind)
    assets = assets.filter((a) => a.kind === kind)
  }
  if (options.json) {
    output(assets, options)
  } else if (assets.length === 0) {
    console.log('No audio found')
  } else {
    console.log(`\nAudio (${assets.length}):\n`)
    for (const asset of assets) {
      console.log(`  ${asset.id}`)
      console.log(`    Name: ${asset.name}`)
      console.log(`    Kind: ${asset.kind}`)
      console.log(`    Duration: ${formatAudioDuration(asset.durationSec)}`)
      if (asset.tags.length > 0) console.log(`    Tags: ${asset.tags.join(', ')}`)
      if (asset.engineNotes) console.log(`    Engine notes: ${asset.engineNotes}`)
      console.log()
    }
  }
}

async function show(audioId: string, options: BaseOptions): Promise<void> {
  await listAudioAssets(options.game, options.dataDir)
  const asset = await getAudioAsset(audioId, options.dataDir)
  if (!asset) {
    throw new Error(`Audio not found: ${audioId}`)
  }
  if (asset.gameId !== options.game) {
    throw new Error(`Audio '${asset.name}' belongs to game '${asset.gameId}', not '${options.game}'`)
  }
  if (options.json) {
    output(asset, options)
  } else {
    console.log(`\nAudio: ${asset.name} (${asset.id})\n`)
    console.log(`  Game: ${asset.gameId}`)
    console.log(`  Kind: ${asset.kind}`)
    console.log(`  Duration: ${formatAudioDuration(asset.durationSec)}`)
    if (asset.tags.length > 0) console.log(`  Tags: ${asset.tags.join(', ')}`)
    if (asset.engineNotes) console.log(`  Engine notes: ${asset.engineNotes}`)
    console.log(`  File: ${asset.file}`)
    console.log(`  Created: ${asset.createdAt}`)
    console.log(`  Updated: ${asset.updatedAt}`)
    console.log()
  }
}

async function update(
  audioId: string,
  options: BaseOptions & {
    name?: string
    kind?: string
    tags?: string
    engineNotes?: string
    file?: string
  }
): Promise<void> {
  const patch: Parameters<typeof updateAudio>[1] = {}
  if (options.name !== undefined) patch.name = options.name
  if (options.kind !== undefined) patch.kind = options.kind
  if (options.tags !== undefined) {
    patch.tags = options.tags.split(',').map((t) => t.trim()).filter(Boolean)
  }
  if (options.engineNotes !== undefined) patch.engineNotes = options.engineNotes
  if (options.file !== undefined) patch.file = options.file

  const asset = await updateAudio(audioId, patch, {
    gameId: options.game,
    dataDirOverride: options.dataDir
  })
  if (options.json) {
    output(asset, options)
  } else {
    console.log(`\nUpdated audio: ${asset.name} (${asset.id})`)
  }
}

async function remove(audioId: string, options: BaseOptions): Promise<void> {
  await removeAudio(audioId, { gameId: options.game, dataDirOverride: options.dataDir })
  if (options.json) {
    output({ deleted: true, audioId }, options)
  } else {
    console.log(`\nRemoved audio: ${audioId}`)
  }
}
