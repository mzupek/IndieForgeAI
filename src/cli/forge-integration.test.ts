/**
 * Integration tests for the forge CLI
 * Tests the actual npm run forge command
 * Run with: npx tsx src/cli/forge-integration.test.ts
 */

import { execSync } from 'child_process'
import { mkdir, rm, writeFile, readFile, access } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import ffmpegStatic from 'ffmpeg-static'

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

async function testClipImportWithGeneratedVideo() {
  console.log('Testing: clip import with ffmpeg-generated test video (intro)')
  const testDir = await setupTestDataDir()
  
  try {
    // Generate a test video using ffmpeg-static with *_intro.mp4 filename
    const testVideoPath = join(testDir, 'test_hero_intro.mp4')
    console.log(`  Generating test video: ${testVideoPath}`)
    
    if (!ffmpegStatic) {
      throw new Error('ffmpeg-static not found')
    }
    
    execSync(
      `"${ffmpegStatic}" -f lavfi -i testsrc=duration=1.5:size=320x240:rate=30 -pix_fmt yuv420p "${testVideoPath}"`,
      { stdio: 'pipe' }
    )
    
    // Verify the video was created
    await access(testVideoPath)
    console.log('  ✓ Test video generated (1.5s duration)')
    
    // Import the clip with moment auto-detection (filename has 'intro')
    const importResult = runForgeCommand(
      `clip import "${testVideoPath}" --game test-game-1 --json`,
      testDir
    )
    
    if (importResult.exitCode !== 0) {
      console.error('  Import failed with output:', importResult.stdout)
    }
    assertEqual(importResult.exitCode, 0, 'Import should exit with code 0')
    
    const importOutput = JSON.parse(importResult.stdout)
    assert(importOutput.imported, 'Should have imported array')
    assertEqual(importOutput.imported.length, 1, 'Should have imported 1 clip')
    assertEqual(importOutput.errors?.length || 0, 0, 'Should have no errors')
    
    const clip = importOutput.imported[0]
    assert(clip.id, 'Clip should have an ID')
    assertEqual(clip.moment, 'intro', 'Should auto-detect intro moment from filename')
    
    // Assert duration is approximately 1.5s (within 0.1s tolerance)
    assert(
      clip.durationSec >= 1.4 && clip.durationSec <= 1.6,
      `Duration should be ~1.5s, got ${clip.durationSec}s`
    )
    console.log(`  ✓ Duration detected: ${clip.durationSec.toFixed(2)}s (expected ~1.5s)`)
    
    assert(clip.file, 'Clip should have a file path')
    assert(clip.thumbnail, 'Clip should have a thumbnail path')
    
    console.log(`  ✓ Clip imported: ${clip.id}, moment=${clip.moment}`)
    
    // Verify thumbnail file exists
    const studioData = JSON.parse(await readFile(join(testDir, 'studio.json'), 'utf-8'))
    const savedClip = studioData.assetPipeline.clips.find((c: any) => c.id === clip.id)
    assert(savedClip, 'Clip should be in studio.json')
    
    // Thumbnail path in studio.json is absolute
    await access(savedClip.thumbnail)
    console.log('  ✓ Thumbnail file exists')
    
    // List clips and verify
    const listResult = runForgeCommand('clip list --game test-game-1 --json', testDir)
    assertEqual(listResult.exitCode, 0, 'List should exit with code 0')
    
    const clips = JSON.parse(listResult.stdout)
    assertEqual(clips.length, 1, 'Should list 1 clip')
    assertEqual(clips[0].id, clip.id, 'Listed clip should match imported clip')
    assertEqual(clips[0].moment, 'intro', 'Listed clip should have intro moment')
    
    console.log('✓ Clip import with generated video test passed')
  } finally {
    await cleanupTestDataDir(testDir)
  }
}

async function testClipImportOnFreshDataDir() {
  console.log('Testing: clip import on fresh empty data dir (should seed default games)')
  
  const freshTestDir = join(tmpdir(), `forge-fresh-test-${randomUUID()}`)
  // Don't create the directory - let the CLI handle it
  
  try {
    // Generate test video in a temp location
    const tempVideoDir = join(tmpdir(), `forge-temp-video-${randomUUID()}`)
    await mkdir(tempVideoDir, { recursive: true })
    const testVideoPath = join(tempVideoDir, 'hero_intro.mp4')
    
    if (!ffmpegStatic) {
      throw new Error('ffmpeg-static not found')
    }
    
    execSync(
      `"${ffmpegStatic}" -f lavfi -i testsrc=duration=0.8:size=320x240:rate=30 -pix_fmt yuv420p "${testVideoPath}"`,
      { stdio: 'pipe' }
    )
    
    // Import clip to non-existent data dir (should create it and seed default games)
    const importResult = runForgeCommand(
      `clip import "${testVideoPath}" --game game-neon-recall --json`,
      freshTestDir
    )
    
    assertEqual(importResult.exitCode, 0, 'Import should exit with code 0')
    
    const importOutput = JSON.parse(importResult.stdout)
    assert(importOutput.imported, 'Should have imported array')
    assertEqual(importOutput.imported.length, 1, 'Should import 1 clip')
    assertEqual(importOutput.imported[0].moment, 'intro', 'Should auto-detect intro from filename')
    
    // Verify default games were seeded
    const gamesResult = runForgeCommand('games list --json', freshTestDir)
    const games = JSON.parse(gamesResult.stdout)
    
    assert(games.length >= 2, 'Should have at least 2 default games')
    assert(games.find((g: any) => g.id === 'game-neon-recall'), 'Should have game-neon-recall')
    assert(games.find((g: any) => g.id === 'game-ring-em-up'), 'Should have game-ring-em-up')
    
    console.log('✓ Fresh data dir with default games test passed')
    
    await rm(tempVideoDir, { recursive: true, force: true })
  } finally {
    await rm(freshTestDir, { recursive: true, force: true })
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
    assert(result.includes('clip'), 'Should list clip command')
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
    await testClipImportWithGeneratedVideo()
    await testClipImportOnFreshDataDir()
    
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
