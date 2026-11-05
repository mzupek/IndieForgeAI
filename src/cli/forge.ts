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
import * as validate from './commands/validate'
import * as status from './commands/status'

const program = new Command()

program
  .name('forge')
  .description('Indie Forge AI command-line interface')
  .version('0.1.0')
  .option('--data-dir <path>', 'Override data directory (also: FORGE_DATA_DIR env var)')
  .option('--json', 'Output in JSON format')

// Games commands
const gamesCmd = program.command('games').description('Manage games')
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
  .option('--moment <moment>', 'Clip moment (intro|hit|finisher|defeat|story_beat)')
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

program.parse()
