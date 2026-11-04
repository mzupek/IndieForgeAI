/**
 * Studio storage deduplication tests
 * Run with: npx tsx src/core/storage/studioStorage.test.ts
 */

import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { loadStudio } from './studioStorage'

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

async function setupDuplicateGamesTest(): Promise<string> {
  const testDir = join(tmpdir(), `studio-dedupe-test-${randomUUID()}`)
  await mkdir(testDir, { recursive: true })
  
  const projectsDir = join(testDir, 'projects')
  await mkdir(projectsDir, { recursive: true })
  
  // Create two legacy projects with duplicate games
  const project1Id = 'legacy-project-1'
  const project2Id = 'legacy-project-2'
  
  const project1Dir = join(projectsDir, project1Id)
  const project2Dir = join(projectsDir, project2Id)
  
  await mkdir(project1Dir, { recursive: true })
  await mkdir(project2Dir, { recursive: true })
  
  const now = new Date().toISOString()
  
  // Project 1: Neon Recall with both games
  const project1 = {
    id: project1Id,
    name: 'Neon Recall',
    description: 'Legacy Neon Recall project',
    targetPlatform: 'desktop',
    engine: 'unity',
    craftPath: './craft',
    styleGuide: '',
    styleReferences: [],
    designerChat: [],
    scenes: [],
    assets: [],
    createdAt: now,
    updatedAt: now,
    assetPipeline: {
      schemaVersion: 1,
      games: [
        {
          id: 'game-neon-recall',
          name: 'Neon Recall',
          engine: 'unity' as const,
          exportRoot: './exports/neon-recall',
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'game-ring-em-up',
          name: "Ring'Em Up",
          engine: 'godot' as const,
          exportRoot: './exports/ring-em-up',
          createdAt: now,
          updatedAt: now
        }
      ],
      characters: [
        {
          id: 'char-1',
          gameId: 'game-neon-recall',
          name: 'Hero from Project 1',
          role: 'protagonist',
          tags: [],
          createdAt: now,
          updatedAt: now
        }
      ],
      poses: [
        {
          id: 'pose-1',
          characterId: 'char-1',
          slot: 'ready' as const,
          file: '/path/pose1.png',
          status: 'approved' as const,
          source: 'import' as const,
          createdAt: now,
          updatedAt: now
        }
      ],
      clips: [],
      scenePresets: [],
      exportProfiles: []
    }
  }
  
  // Project 2: Ring'Em Up with both games (duplicates!)
  const project2 = {
    id: project2Id,
    name: "Ring'Em Up",
    description: "Legacy Ring'Em Up project",
    targetPlatform: 'desktop',
    engine: 'godot',
    craftPath: './craft',
    styleGuide: '',
    styleReferences: [],
    designerChat: [],
    scenes: [],
    assets: [],
    createdAt: now,
    updatedAt: now,
    assetPipeline: {
      schemaVersion: 1,
      games: [
        {
          id: 'game-neon-recall', // DUPLICATE!
          name: 'Neon Recall',
          engine: 'unity' as const,
          exportRoot: './exports/neon-recall',
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'game-ring-em-up', // DUPLICATE!
          name: "Ring'Em Up",
          engine: 'godot' as const,
          exportRoot: './exports/ring-em-up',
          createdAt: now,
          updatedAt: now
        }
      ],
      characters: [
        {
          id: 'char-2',
          gameId: 'game-ring-em-up',
          name: 'Boss from Project 2',
          role: 'enemy',
          tags: [],
          createdAt: now,
          updatedAt: now
        }
      ],
      poses: [
        {
          id: 'pose-2',
          characterId: 'char-2',
          slot: 'hurt' as const,
          file: '/path/pose2.png',
          status: 'draft' as const,
          source: 'import' as const,
          createdAt: now,
          updatedAt: now
        }
      ],
      clips: [],
      scenePresets: [],
      exportProfiles: []
    }
  }
  
  await writeFile(join(project1Dir, 'project.json'), JSON.stringify(project1, null, 2))
  await writeFile(join(project2Dir, 'project.json'), JSON.stringify(project2, null, 2))
  
  return testDir
}

async function cleanupTestDir(testDir: string): Promise<void> {
  await rm(testDir, { recursive: true, force: true })
}

async function testGameDeduplication() {
  console.log('Testing game deduplication...')
  const testDir = await setupDuplicateGamesTest()
  
  try {
    // Load studio - should trigger migration and deduplication
    const studio = await loadStudio(testDir)
    
    // Verify games are deduplicated
    assertEqual(studio.assetPipeline.games.length, 2, 'Should have exactly 2 games (deduplicated)')
    
    const gameIds = studio.assetPipeline.games.map(g => g.id)
    assert(gameIds.includes('game-neon-recall'), 'Should have Neon Recall')
    assert(gameIds.includes('game-ring-em-up'), "Should have Ring'Em Up")
    
    // Verify characters are merged (no duplicates)
    assertEqual(studio.assetPipeline.characters.length, 2, 'Should have 2 characters (merged)')
    
    const charNames = studio.assetPipeline.characters.map(c => c.name)
    assert(charNames.includes('Hero from Project 1'), 'Should have Hero from Project 1')
    assert(charNames.includes('Boss from Project 2'), 'Should have Boss from Project 2')
    
    // Verify poses are merged (no duplicates)
    assertEqual(studio.assetPipeline.poses.length, 2, 'Should have 2 poses (merged)')
    
    const poseIds = studio.assetPipeline.poses.map(p => p.id)
    assert(poseIds.includes('pose-1'), 'Should have pose-1')
    assert(poseIds.includes('pose-2'), 'Should have pose-2')
    
    console.log('✓ Game deduplication test passed')
  } finally {
    await cleanupTestDir(testDir)
  }
}

async function testEmptyStudioMigration() {
  console.log('Testing empty studio migration...')
  const testDir = join(tmpdir(), `studio-empty-test-${randomUUID()}`)
  
  try {
    await mkdir(testDir, { recursive: true })
    
    // Load studio with no projects
    const studio = await loadStudio(testDir)
    
    assertEqual(studio.assetPipeline.games.length, 0, 'Should have no games')
    assertEqual(studio.assetPipeline.characters.length, 0, 'Should have no characters')
    assertEqual(studio.assetPipeline.poses.length, 0, 'Should have no poses')
    
    console.log('✓ Empty studio migration test passed')
  } finally {
    await cleanupTestDir(testDir)
  }
}

export async function runStudioStorageTests() {
  console.log('Running Studio Storage Tests...\n')
  
  try {
    await testGameDeduplication()
    await testEmptyStudioMigration()
    
    console.log('\n✓ All studio storage tests passed!')
    return true
  } catch (error) {
    console.error('\n✗ Test failed:', error)
    return false
  }
}

// Auto-run if called directly
if (require.main === module) {
  runStudioStorageTests().then(success => {
    process.exit(success ? 0 : 1)
  })
}
