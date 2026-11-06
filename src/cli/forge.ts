/**
 * Forge CLI - Command-line interface for Indie Forge AI
 * For use by Game Engineer agents and Asset Creator agents
 */

import { Command } from 'commander'
import * as games from './commands/games'
import * as character from './commands/character'
import * as pose from './commands/pose'
import * as clips from './commands/clips'
import * as preset from './commands/preset'
import * as exportCmd from './commands/export'
import * as validate from './commands/validate'
import * as status from './commands/status'
import { registerStoryboardCommands } from './commands/storyboard'
import { registerSceneCommands } from './commands/scene'
import { registerEventCommands } from './commands/event'
import * as asset from './commands/asset'
import * as assetState from './commands/asset-state'

const program = new Command()

program
  .name('forge')
  .description('Indie Forge AI command-line interface')
  .version('0.1.0')
  .option('--data-dir <path>', 'Override data directory (also: FORGE_DATA_DIR env var)')
  .option('--json', 'Output in JSON format')

// Games commands (games or game - both work)
const gamesCmd = program.command('games').alias('game').description('Manage games')
gamesCmd
  .command('list')
  .description('List all games across all projects')
  .action(async (options) => {
    await games.list({ ...program.opts(), ...options })
  })

// Character commands
const characterCmd = program.command('character').description('Manage characters')

characterCmd
  .command('list')
  .description('List characters')
  .requiredOption('--game <id>', 'Game ID')
  .action(async (options) => {
    await character.list({ ...program.opts(), ...options })
  })

characterCmd
  .command('show')
  .description('Show character details')
  .argument('<character-id>', 'Character ID')
  .requiredOption('--game <id>', 'Game ID')
  .action(async (characterId, options) => {
    await character.show(characterId, { ...program.opts(), ...options })
  })

characterCmd
  .command('create')
  .description('Create a new character')
  .requiredOption('--game <id>', 'Game ID')
  .requiredOption('--name <name>', 'Character name')
  .requiredOption('--role <role>', 'Character role')
  .option('--style-notes <notes>', 'Style notes')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--reference <path>', 'Reference image path')
  .action(async (options) => {
    await character.create({ ...program.opts(), ...options })
  })

characterCmd
  .command('update')
  .description('Update a character')
  .argument('<character-id>', 'Character ID')
  .requiredOption('--game <id>', 'Game ID')
  .option('--name <name>', 'Character name')
  .option('--role <role>', 'Character role')
  .option('--style-notes <notes>', 'Style notes')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--reference <path>', 'Reference image path')
  .action(async (characterId, options) => {
    await character.update(characterId, { ...program.opts(), ...options })
  })

characterCmd
  .command('delete')
  .description('Delete a character')
  .argument('<character-id>', 'Character ID')
  .requiredOption('--game <id>', 'Game ID')
  .action(async (characterId, options) => {
    await character.deleteCharacter(characterId, { ...program.opts(), ...options })
  })

// P1: Asset commands (generic visual assets)
const assetCmd = program.command('asset').description('Manage visual assets (P1)')

assetCmd
  .command('list')
  .description('List visual assets')
  .requiredOption('--game <id>', 'Game ID')
  .option('--category <category>', 'Filter by category (logo|symbol|item|weapon|prop)')
  .action(async (options) => {
    await asset.list({ ...program.opts(), ...options })
  })

assetCmd
  .command('show')
  .description('Show asset details')
  .argument('<asset-id>', 'Asset ID')
  .requiredOption('--game <id>', 'Game ID')
  .action(async (assetId, options) => {
    await asset.show(assetId, { ...program.opts(), ...options })
  })

assetCmd
  .command('create')
  .description('Create a new visual asset')
  .requiredOption('--game <id>', 'Game ID')
  .requiredOption('--name <name>', 'Asset name')
  .requiredOption('--category <category>', 'Category (logo|symbol|item|weapon|prop)')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--image <path>', 'PNG image file path (for static single-image assets)')
  .action(async (options) => {
    await asset.create({ ...program.opts(), ...options })
  })

assetCmd
  .command('update')
  .description('Update an asset')
  .argument('<asset-id>', 'Asset ID')
  .requiredOption('--game <id>', 'Game ID')
  .option('--name <name>', 'Asset name')
  .option('--category <category>', 'Category (logo|symbol|item|weapon|prop)')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--image <path>', 'PNG image file path (add/replace static image)')
  .action(async (assetId, options) => {
    await asset.update(assetId, { ...program.opts(), ...options })
  })

assetCmd
  .command('delete')
  .description('Delete an asset (cascades to owned states)')
  .argument('<asset-id>', 'Asset ID')
  .requiredOption('--game <id>', 'Game ID')
  .action(async (assetId, options) => {
    await asset.deleteAsset(assetId, { ...program.opts(), ...options })
  })

assetCmd
  .command('set-default-state')
  .description('Set default state for a multi-state asset')
  .argument('<asset-id>', 'Asset ID')
  .requiredOption('--game <id>', 'Game ID')
  .requiredOption('--state <state-id>', 'State ID to set as default')
  .action(async (assetId, options) => {
    await asset.setDefaultState(assetId, { ...program.opts(), ...options })
  })

// P1: Asset State commands
const assetStateCmd = program.command('asset-state').description('Manage asset states (P1)')

assetStateCmd
  .command('list')
  .description('List states for an asset')
  .requiredOption('--game <id>', 'Game ID')
  .requiredOption('--asset <asset-id>', 'Asset ID')
  .action(async (options) => {
    await assetState.list({ ...program.opts(), ...options })
  })

assetStateCmd
  .command('show')
  .description('Show state details')
  .argument('<state-id>', 'State ID')
  .requiredOption('--game <id>', 'Game ID')
  .action(async (stateId, options) => {
    await assetState.show(stateId, { ...program.opts(), ...options })
  })

assetStateCmd
  .command('create')
  .description('Create a new asset state with image file')
  .requiredOption('--game <id>', 'Game ID')
  .requiredOption('--asset <asset-id>', 'Asset ID')
  .requiredOption('--name <name>', 'State name (e.g., "open", "closed")')
  .requiredOption('--file <path>', 'PNG file path')
  .action(async (options) => {
    await assetState.create({ ...program.opts(), ...options })
  })

assetStateCmd
  .command('update')
  .description('Update an asset state')
  .argument('<state-id>', 'State ID')
  .requiredOption('--game <id>', 'Game ID')
  .option('--name <name>', 'State name')
  .option('--file <path>', 'PNG file path (replaces existing)')
  .action(async (stateId, options) => {
    await assetState.update(stateId, { ...program.opts(), ...options })
  })

assetStateCmd
  .command('delete')
  .description('Delete an asset state (rejects if default state)')
  .argument('<state-id>', 'State ID')
  .requiredOption('--game <id>', 'Game ID')
  .action(async (stateId, options) => {
    await assetState.deleteState(stateId, { ...program.opts(), ...options })
  })

// Pose commands
const poseCmd = program.command('pose').description('Manage poses')

poseCmd
  .command('import')
  .description('Import pose(s) for a character')
  .argument('<character-id>', 'Character ID')
  .argument('<files...>', 'Pose image files')
  .option('--slot <slot>', 'Specific pose slot (ready|success|hurt|win|defeat)')
  .action(async (characterId, files, options) => {
    await pose.importPoses(characterId, files, { ...program.opts(), ...options })
  })

poseCmd
  .command('list')
  .description('List poses for a character')
  .argument('<character-id>', 'Character ID')
  .action(async (characterId, options) => {
    await pose.list(characterId, { ...program.opts(), ...options })
  })

poseCmd
  .command('remove')
  .description('Remove a pose')
  .argument('<pose-id>', 'Pose ID')
  .action(async (poseId, options) => {
    await pose.remove(poseId, { ...program.opts(), ...options })
  })

// Clip commands
const clipCmd = program.command('clip').description('Manage clips')

clipCmd
  .command('import')
  .description('Import clip(s) - auto-maps moment by filename')
  .argument('<files...>', 'Video files (mp4/webm)')
  .requiredOption('--game <id>', 'Game ID')
  .option('--moment <moment>', 'Clip moment (intro|hit|finisher|defeat|miss|story_beat)')
  .option('--character <id>', 'Character ID')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(async (files, options) => {
    await clips.importClips(files, { ...program.opts(), ...options })
  })

clipCmd
  .command('list')
  .description('List clips')
  .option('--game <id>', 'Filter by game')
  .option('--character <id>', 'Filter by character')
  .option('--moment <moment>', 'Filter by moment')
  .action(async (options) => {
    await clips.list({ ...program.opts(), ...options })
  })

clipCmd
  .command('show')
  .description('Show clip details')
  .argument('<clip-id>', 'Clip ID')
  .action(async (clipId, options) => {
    await clips.show(clipId, { ...program.opts(), ...options })
  })

clipCmd
  .command('update')
  .description('Update a clip')
  .argument('<clip-id>', 'Clip ID')
  .option('--moment <moment>', 'Clip moment')
  .option('--character <id>', 'Character ID (or empty to unset)')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(async (clipId, options) => {
    await clips.update(clipId, { ...program.opts(), ...options })
  })

clipCmd
  .command('remove')
  .description('Remove a clip')
  .argument('<clip-id>', 'Clip ID')
  .action(async (clipId, options) => {
    await clips.remove(clipId, { ...program.opts(), ...options })
  })

// Preset commands
const presetCmd = program.command('preset').description('Manage scene presets')

presetCmd
  .command('list')
  .description('List presets')
  .option('--type <type>', 'Filter by type (versus|zoom_punch|shake|flash|freeze)')
  .option('--tags <tags>', 'Filter by tags (comma-separated)')
  .action(async (options) => {
    await preset.list({ ...program.opts(), ...options })
  })

presetCmd
  .command('show')
  .description('Show preset details')
  .argument('<preset-id>', 'Preset ID')
  .action(async (presetId, options) => {
    await preset.show(presetId, { ...program.opts(), ...options })
  })

presetCmd
  .command('create')
  .description('Create a preset')
  .requiredOption('--type <type>', 'Preset type (versus|zoom_punch|shake|flash|freeze)')
  .option('--params <json>', 'JSON params object')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(async (options) => {
    await preset.create({ ...program.opts(), ...options })
  })

presetCmd
  .command('update')
  .description('Update a preset')
  .argument('<preset-id>', 'Preset ID')
  .option('--params <json>', 'JSON params object (merged with existing)')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(async (presetId, options) => {
    await preset.update(presetId, { ...program.opts(), ...options })
  })

presetCmd
  .command('remove')
  .description('Remove a preset')
  .argument('<preset-id>', 'Preset ID')
  .action(async (presetId, options) => {
    await preset.remove(presetId, { ...program.opts(), ...options })
  })

// Export commands
const exportCommand = program.command('export').description('Export game assets')

exportCommand
  .command('schema')
  .description('Print the export manifest JSON Schema')
  .action(async (options) => {
    await exportCmd.schema({ ...program.opts(), ...options })
  })

exportCommand
  .argument('<game-id>', 'Game ID to export')
  .description('Export game assets to target directory')
  .option('--dry-run', 'Show what would be exported without copying files')
  .option('--target <path>', 'Override target export directory')
  .action(async (gameId, options) => {
    await exportCmd.run(gameId, { ...program.opts(), ...options })
  })

// Validate command
program
  .command('validate')
  .description('Validate pose completeness')
  .argument('[character-id]', 'Character ID to validate (omit for all characters)')
  .option('--game <id>', 'Validate all characters in a game')
  .action(async (characterId, options) => {
    await validate.run(characterId, { ...program.opts(), ...options })
  })

// Status command
program
  .command('status')
  .description('Show overall project status')
  .action(async (options) => {
    await status.run({ ...program.opts(), ...options })
  })

// Storyboard commands (storyboard, shot, layer, camera, effect)
registerStoryboardCommands(program)

// P3: event + binding
registerEventCommands(program)

// Scene commands (Phase C)
registerSceneCommands(program)

program.parse()
