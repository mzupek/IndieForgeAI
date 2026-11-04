/**
 * Integration tests for the forge CLI
 * Tests the actual npm run forge command
 * Run with: npx tsx src/cli/forge-integration.test.ts
 */

import { execSync } from 'child_process'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`)
  }
}

async function setupTestDataDir(): Promise<string> {
  const testDir = join(tmpdir(), `forge-integration-test-${randomUUID()}`)
  await mkdir(testDir, { recursive: true })
  
  // Create a test project with asset pipeline
  const projectId = 'test-project'
  const projectDir = join(testDir, 'projects', projectId)
  await mkdir(projectDir, { recursive: true })
  
  const project = {
    id: projectId,
    name: 'Test Project',
    description: 'Integration test project',
    targetPlatform: 'desktop',
    engine: 'godot',
    craftPath: './craft',
    styleGuide: '',
    styleReferences: [],
    designerChat: [],
    scenes: [],
    assets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assetPipeline: {
      schemaVersion: 1,
      games: [
        {
          id: 'test-game-1',
          name: 'Test Game Alpha',
          engine: 'unity' as const,
          exportRoot: './exports/alpha',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'test-game-2',
          name: 'Test Game Beta',
          engine: 'godot' as const,
          exportRoot: './exports/beta',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      characters: [],
      poses: [],
      clips: [],
      scenePresets: [],
      exportProfiles: []
    }
  }
  
  await writeFile(join(projectDir, 'project.json'), JSON.stringify(project, null, 2))
  
  return testDir
}

async function cleanupTestDataDir(testDir: string): Promise<void> {
  await rm(testDir, { recursive: true, force: true })
}

function runForgeCommand(args: string, dataDir: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(
      `npm run -s forge -- ${args} --data-dir "${dataDir}"`,
      { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      }
    )
    return { stdout, exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout || '',
      exitCode: err.status || 1
    }
  }
}

async function testGamesListCommand() {
  console.log('Testing: npm run forge -- games list --json')
  const testDir = await setupTestDataDir()
  
  try {
    const result = runForgeCommand('games list --json', testDir)
    
    assertEqual(result.exitCode, 0, 'Should exit with code 0')
    
    const games = JSON.parse(result.stdout)
    assert(Array.isArray(games), 'Should return an array')
    assertEqual(games.length, 2, 'Should have 2 games')
    
    const alphaGame = games.find((g: any) => g.id === 'test-game-1')
    assert(alphaGame, 'Should have Test Game Alpha')
    assertEqual(alphaGame.name, 'Test Game Alpha', 'Should have correct name')
    assertEqual(alphaGame.engine, 'unity', 'Should have correct engine')
    
    console.log('✓ Games list command test passed')
  } finally {
    await cleanupTestDataDir(testDir)
  }
}

async function testStatusCommand() {
  console.log('Testing: npm run forge -- status --json')
  const testDir = await setupTestDataDir()
  
  try {
    const result = runForgeCommand('status --json', testDir)
    
    assertEqual(result.exitCode, 0, 'Should exit with code 0')
    
    const status = JSON.parse(result.stdout)
    assertEqual(status.legacyProjects, 1, 'Should have 1 legacy project')
    assertEqual(status.games, 2, 'Should have 2 games')
    assertEqual(status.characters, 0, 'Should have 0 characters')
    assertEqual(status.poses, 0, 'Should have 0 poses')
    
    console.log('✓ Status command test passed')
  } finally {
    await cleanupTestDataDir(testDir)
  }
}

async function testCharacterCommands() {
  console.log('Testing: character create and list')
  const testDir = await setupTestDataDir()
  
  try {
    // Create character
    const createResult = runForgeCommand(
      'character create --game test-game-1 --name "Hero" --role "protagonist" --tags "player,main" --json',
      testDir
    )
    
    assertEqual(createResult.exitCode, 0, 'Create should exit with code 0')
    
    const character = JSON.parse(createResult.stdout)
    assertEqual(character.name, 'Hero', 'Should have correct name')
    assertEqual(character.role, 'protagonist', 'Should have correct role')
    assert(character.tags.includes('player'), 'Should have player tag')
    assert(character.id, 'Should have an ID')
    
    // List characters
    const listResult = runForgeCommand('character list --game test-game-1 --json', testDir)
    
    assertEqual(listResult.exitCode, 0, 'List should exit with code 0')
    
    const characters = JSON.parse(listResult.stdout)
    assertEqual(characters.length, 1, 'Should have 1 character')
    assertEqual(characters[0].name, 'Hero', 'Listed character should match')
    
    console.log('✓ Character commands test passed')
  } finally {
    await cleanupTestDataDir(testDir)
  }
}

async function testValidateCommand() {
  console.log('Testing: validate command')
  const testDir = await setupTestDataDir()
  
  try {
    // Create a character
    const createResult = runForgeCommand(
      'character create --game test-game-1 --name "Hero" --role "protagonist" --json',
      testDir
    )
    
    const character = JSON.parse(createResult.stdout)
    
    // Validate should fail (no poses)
    const validateResult = runForgeCommand(`validate ${character.id} --json`, testDir)
    
    assert(validateResult.exitCode !== 0, 'Should exit with non-zero code (character incomplete)')
    
    const validation = JSON.parse(validateResult.stdout)
    assert(Array.isArray(validation), 'Should return an array')
    assertEqual(validation.length, 1, 'Should have 1 validation result')
    assertEqual(validation[0].complete, false, 'Character should be incomplete')
    assert(validation[0].issues.length > 0, 'Should have issues')
    
    console.log('✓ Validate command test passed')
  } finally {
    await cleanupTestDataDir(testDir)
  }
}

async function testHelpCommand() {
  console.log('Testing: forge --help')
  
  try {
    const result = execSync('npm run -s forge -- --help', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    assert(result.includes('Indie Forge AI command-line interface'), 'Should show CLI description')
    assert(result.includes('Commands:'), 'Should show commands')
    assert(result.includes('games'), 'Should list games command')
    assert(result.includes('character'), 'Should list character command')
    assert(result.includes('pose'), 'Should list pose command')
    assert(result.includes('validate'), 'Should list validate command')
    
    console.log('✓ Help command test passed')
  } catch (err: any) {
    throw new Error(`Help command failed: ${err.message}`)
  }
}

export async function runIntegrationTests() {
  console.log('Running Forge CLI Integration Tests...\n')
  console.log('These tests run the actual "npm run forge" command\n')
  
  try {
    await testHelpCommand()
    await testGamesListCommand()
    await testStatusCommand()
    await testCharacterCommands()
    await testValidateCommand()
    
    console.log('\n✓ All integration tests passed!')
    return true
  } catch (error) {
    console.error('\n✗ Integration test failed:', error)
    return false
  }
}

// Auto-run if called directly
if (require.main === module) {
  runIntegrationTests().then(success => {
    process.exit(success ? 0 : 1)
  })
}
