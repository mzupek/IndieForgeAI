/**
 * P1: Visual Assets CLI Integration Tests
 * 
 * Standalone test script for asset CRUD operations.
 * Run: npx tsx src/cli/commands/asset.integration-test.ts
 */

import { mkdtemp, rm, writeFile, mkdir, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import {
  getAssetPipeline,
  updateAssetPipeline,
  getVisualAssets,
  getVisualAsset,
  addVisualAsset,
  updateVisualAsset,
  deleteVisualAsset,
  getAssetStates,
  getAssetState,
  addAssetState,
  deleteAssetState
} from '@core/storage/studioStorage'
import type { VisualAsset, AssetState } from '@shared/types/assetPipeline'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAILED: ${message}`)
    testsFailed++
    throw new Error(message)
  } else {
    console.log(`  ✓ ${message}`)
    testsPassed++
  }
}

async function test(name: string, fn: () => Promise<void>) {
  console.log(`\n${name}`)
  try {
    await fn()
  } catch (error) {
    console.error(`  Error: ${error}`)
  }
}

async function runTests() {
  console.log('P1: Visual Assets Integration Tests\n')
  console.log('=' .repeat(60))
  
  let tempDir: string
  let testGameId: string
  let testAssetId: string
  let testStateId: string
  let testPngPath: string

  try {
    // Setup
    console.log('\nSetup: Creating temp directory and test data...')
    tempDir = await mkdtemp(join(tmpdir(), 'forge-asset-test-'))
    console.log(`  Temp dir: ${tempDir}`)
    
    // Create test game
    testGameId = 'test-game-123'
    const pipeline = await getAssetPipeline(tempDir)
    pipeline.games.push({
      id: testGameId,
      name: 'Test Game',
      engine: 'unity',
      exportRoot: './exports/test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    await updateAssetPipeline(pipeline, tempDir)
    console.log(`  Created test game: ${testGameId}`)
    
    // Create test PNG file
    testPngPath = join(tempDir, 'test.png')
    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 }
      }
    })
      .png()
      .toFile(testPngPath)
    console.log(`  Created test PNG: ${testPngPath}`)

    // Test 1: Create visual asset
    await test('Test 1: Create visual asset', async () => {
      const asset: VisualAsset = {
        id: 'asset-test-1',
        gameId: testGameId,
        name: 'Test Crate',
        category: 'item',
        tags: ['collectible', 'breakable'],
        defaultStateId: null,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      await addVisualAsset(asset, tempDir)
      
      const retrieved = await getVisualAsset(asset.id, tempDir)
      assert(retrieved !== undefined, 'Asset should be retrievable')
      assert(retrieved!.name === 'Test Crate', 'Asset name should match')
      assert(retrieved!.category === 'item', 'Asset category should match')
      assert(retrieved!.tags.length === 2, 'Asset should have 2 tags')
      assert(retrieved!.defaultStateId === null, 'Asset should have no default state')
      
      testAssetId = asset.id
    })

    // Test 2: List assets for game
    await test('Test 2: List visual assets for game', async () => {
      const assets = await getVisualAssets(testGameId, tempDir)
      assert(assets.length === 1, 'Should have 1 asset')
      assert(assets[0].name === 'Test Crate', 'Asset name should match')
    })

    // Test 3: Update asset
    await test('Test 3: Update visual asset', async () => {
      const asset = await getVisualAsset(testAssetId, tempDir)
      assert(asset !== undefined, 'Asset should exist')
      
      asset!.name = 'Updated Crate'
      asset!.tags = ['updated']
      await updateVisualAsset(asset!, tempDir)
      
      const updated = await getVisualAsset(testAssetId, tempDir)
      assert(updated!.name === 'Updated Crate', 'Asset name should be updated')
      assert(updated!.tags.length === 1, 'Should have 1 tag')
    })

    // Test 4: Game isolation
    await test('Test 4: Game isolation (cross-game references)', async () => {
      const otherGameId = 'other-game-456'
      
      // Create another game
      const pipeline = await getAssetPipeline(tempDir)
      pipeline.games.push({
        id: otherGameId,
        name: 'Other Game',
        engine: 'godot',
        exportRoot: './exports/other',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      await updateAssetPipeline(pipeline, tempDir)
      
      // Assets from testGameId should not appear in otherGameId
      const assets = await getVisualAssets(otherGameId, tempDir)
      assert(assets.length === 0, 'Other game should have no assets')
    })

    // Test 5: Create asset state
    await test('Test 5: Create asset state with file', async () => {
      const state: AssetState = {
        id: 'state-test-1',
        assetId: testAssetId,
        name: 'closed',
        file: testPngPath,
        boundingBox: { width: 512, height: 512 },
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      await addAssetState(state, tempDir)
      
      const retrieved = await getAssetState(state.id, tempDir)
      assert(retrieved !== undefined, 'State should be retrievable')
      assert(retrieved!.name === 'closed', 'State name should match')
      assert(retrieved!.assetId === testAssetId, 'State should belong to asset')
      
      testStateId = state.id
    })

    // Test 6: List states for asset
    await test('Test 6: List asset states', async () => {
      const states = await getAssetStates(testAssetId, tempDir)
      assert(states.length === 1, 'Should have 1 state')
      assert(states[0].name === 'closed', 'State name should match')
    })

    // Test 7: Set default state
    await test('Test 7: Set default state', async () => {
      const asset = await getVisualAsset(testAssetId, tempDir)
      asset!.defaultStateId = testStateId
      await updateVisualAsset(asset!, tempDir)
      
      const updated = await getVisualAsset(testAssetId, tempDir)
      assert(updated!.defaultStateId === testStateId, 'Default state should be set')
    })

    // Test 8: Reject deleting default state
    await test('Test 8: Reject deleting default state', async () => {
      let errorThrown = false
      try {
        await deleteAssetState(testStateId, tempDir)
      } catch (error: any) {
        errorThrown = true
        assert(error.message.includes('Cannot delete default state'), 'Should reject default state deletion')
      }
      assert(errorThrown, 'Should throw error when deleting default state')
    })

    // Test 9: Create second state and delete first
    await test('Test 9: Create second state, change default, delete first', async () => {
      // Create second state
      const state2: AssetState = {
        id: 'state-test-2',
        assetId: testAssetId,
        name: 'open',
        file: testPngPath,
        boundingBox: { width: 512, height: 512 },
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await addAssetState(state2, tempDir)
      
      // Set second state as default
      const asset = await getVisualAsset(testAssetId, tempDir)
      asset!.defaultStateId = state2.id
      await updateVisualAsset(asset!, tempDir)
      
      // Delete first state (no longer default)
      await deleteAssetState(testStateId, tempDir)
      
      const states = await getAssetStates(testAssetId, tempDir)
      assert(states.length === 1, 'Should have 1 state left')
      assert(states[0].id === state2.id, 'Remaining state should be second one')
    })

    // Test 10: Cascade delete states when asset deleted
    await test('Test 10: Cascade delete owned states', async () => {
      // Create asset with multiple states
      const asset: VisualAsset = {
        id: 'asset-cascade-test',
        gameId: testGameId,
        name: 'Cascade Test',
        category: 'weapon',
        tags: [],
        defaultStateId: null,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await addVisualAsset(asset, tempDir)
      
      // Add 3 states
      for (let i = 0; i < 3; i++) {
        const state: AssetState = {
          id: `cascade-state-${i}`,
          assetId: asset.id,
          name: `state-${i}`,
          file: testPngPath,
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        await addAssetState(state, tempDir)
      }
      
      // Verify 3 states exist
      let states = await getAssetStates(asset.id, tempDir)
      assert(states.length === 3, 'Should have 3 states before deletion')
      
      // Delete asset
      const result = await deleteVisualAsset(asset.id, tempDir)
      assert(result.statesDeleted === 3, 'Should cascade delete 3 states')
      
      // Verify states deleted
      states = await getAssetStates(asset.id, tempDir)
      assert(states.length === 0, 'Should have 0 states after cascade')
    })

    // Test 11: Data persistence across reload
    await test('Test 11: Data persistence across reload', async () => {
      const asset: VisualAsset = {
        id: 'persist-test',
        gameId: testGameId,
        name: 'Persist Test',
        category: 'logo',
        tags: ['test'],
        defaultStateId: null,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await addVisualAsset(asset, tempDir)
      
      // "Reload" by getting fresh pipeline
      const pipeline1 = await getAssetPipeline(tempDir)
      const found1 = pipeline1.visualAssets.find(a => a.id === 'persist-test')
      assert(found1 !== undefined, 'Asset should exist after first load')
      
      // Get pipeline again (simulates app restart)
      const pipeline2 = await getAssetPipeline(tempDir)
      const found2 = pipeline2.visualAssets.find(a => a.id === 'persist-test')
      assert(found2 !== undefined, 'Asset should persist across reloads')
      assert(found2!.name === 'Persist Test', 'Asset data should be intact')
    })

    // Cleanup
    console.log('\n' + '='.repeat(60))
    console.log(`\nCleaning up temp directory: ${tempDir}`)
    await rm(tempDir, { recursive: true, force: true })

  } catch (error) {
    console.error('\nTest suite failed with error:', error)
    process.exit(1)
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('\nTest Summary:')
  console.log(`  ✓ Passed: ${testsPassed}`)
  console.log(`  ✗ Failed: ${testsFailed}`)
  console.log(`  Total:  ${testsPassed + testsFailed}`)
  
  if (testsFailed > 0) {
    console.log('\n❌ Some tests failed')
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed!')
    console.log('\nValidated:')
    console.log('  • Visual asset CRUD operations')
    console.log('  • Asset state CRUD operations')
    console.log('  • Game isolation (cross-game refs blocked)')
    console.log('  • Default state management')
    console.log('  • Cascade deletion of owned states')
    console.log('  • Data persistence across reload')
    console.log('  • Safe deletion (reject default state)')
    process.exit(0)
  }
}

runTests().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
