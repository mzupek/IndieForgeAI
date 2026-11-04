#!/usr/bin/env node

/**
 * Forge CLI - Command-line interface for Indie Forge AI
 * For use by Game Engineer agents and Asset Creator agents
 */

import { Command } from 'commander'
import * as games from './commands/games'
import * as character from './commands/character'
import * as pose from './commands/pose'
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
