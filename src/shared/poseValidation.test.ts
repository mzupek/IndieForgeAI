/**
 * Unit tests for Pose Validation
 * Run with: npx tsx src/shared/poseValidation.test.ts
 */

import {
  mapFilenameToSlot,
  groupPosesBySlot,
  checkPoseCompleteness,
  formatValidationIssues
} from './poseValidation'
import type { Character, Pose } from './types/assetPipeline'

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

function testMapFilenameToSlot() {
  console.log('Testing mapFilenameToSlot...')
  
  // Test underscores
  assertEqual(mapFilenameToSlot('gate_drone_hurt.png'), 'hurt', 'gate_drone_hurt.png should map to hurt')
  assertEqual(mapFilenameToSlot('hero_ready.png'), 'ready', 'hero_ready.png should map to ready')
  assertEqual(mapFilenameToSlot('boss_success_v2.png'), 'success', 'boss_success_v2.png should map to success')
  assertEqual(mapFilenameToSlot('character_win.png'), 'win', 'character_win.png should map to win')
  assertEqual(mapFilenameToSlot('npc_defeat.png'), 'defeat', 'npc_defeat.png should map to defeat')
  
  // Test hyphens
  assertEqual(mapFilenameToSlot('hero-ready.png'), 'ready', 'hero-ready.png should map to ready')
  assertEqual(mapFilenameToSlot('boss-hurt.png'), 'hurt', 'boss-hurt.png should map to hurt')
  
  // Test case insensitive
  assertEqual(mapFilenameToSlot('HERO_READY.PNG'), 'ready', 'HERO_READY.PNG should be case insensitive')
  
  // Test unmapped
  assertEqual(mapFilenameToSlot('random.png'), null, 'random.png should return null')
  assertEqual(mapFilenameToSlot('character.png'), null, 'character.png should return null')
  
  console.log('✓ mapFilenameToSlot tests passed')
}

function testGroupPosesBySlot() {
  console.log('Testing groupPosesBySlot...')
  
  const files = [
    { name: 'hero_ready.png', path: '/path/hero_ready.png' },
    { name: 'hero_hurt.png', path: '/path/hero_hurt.png' },
    { name: 'hero_win.png', path: '/path/hero_win.png' },
    { name: 'hero_success.png', path: '/path/hero_success.png' },
    { name: 'hero_defeat.png', path: '/path/hero_defeat.png' }
  ]

  const groups = groupPosesBySlot(files)

  assertEqual(groups.get('ready')?.[0], '/path/hero_ready.png', 'Should group ready pose')
  assertEqual(groups.get('hurt')?.[0], '/path/hero_hurt.png', 'Should group hurt pose')
  assertEqual(groups.get('win')?.[0], '/path/hero_win.png', 'Should group win pose')
  assertEqual(groups.get('success')?.[0], '/path/hero_success.png', 'Should group success pose')
  assertEqual(groups.get('defeat')?.[0], '/path/hero_defeat.png', 'Should group defeat pose')
  
  console.log('✓ groupPosesBySlot tests passed')
}

function testCheckPoseCompleteness() {
  console.log('Testing checkPoseCompleteness...')
  
  const mockCharacter: Character = {
    id: 'char-1',
    gameId: 'game-1',
    name: 'Hero',
    role: 'protagonist',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  }

  // Test missing poses
  const incompletePoses: Pose[] = [
    {
      id: 'pose-1',
      characterId: 'char-1',
      slot: 'ready',
      file: '/path/ready.png',
      status: 'approved',
      source: 'import',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    }
  ]

  const incompleteResult = checkPoseCompleteness(mockCharacter, incompletePoses)
  assertEqual(incompleteResult.complete, false, 'Should detect missing poses')
  assert(incompleteResult.issues.length > 0, 'Should have issues for missing poses')

  // Test complete set
  const completePoses: Pose[] = [
    { id: 'pose-1', characterId: 'char-1', slot: 'ready', file: '/path/ready.png', status: 'approved', source: 'import', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    { id: 'pose-2', characterId: 'char-1', slot: 'success', file: '/path/success.png', status: 'approved', source: 'import', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    { id: 'pose-3', characterId: 'char-1', slot: 'hurt', file: '/path/hurt.png', status: 'approved', source: 'import', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    { id: 'pose-4', characterId: 'char-1', slot: 'win', file: '/path/win.png', status: 'approved', source: 'import', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    { id: 'pose-5', characterId: 'char-1', slot: 'defeat', file: '/path/defeat.png', status: 'approved', source: 'import', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }
  ]

  const completeResult = checkPoseCompleteness(mockCharacter, completePoses)
  assertEqual(completeResult.complete, true, 'Should pass with complete set')
  assertEqual(completeResult.issues.length, 0, 'Should have no issues')
  
  // Test with metadata validation
  const metadata = new Map([
    ['pose-1', { width: 1024, height: 1024, hasAlpha: true, cornersTransparent: true }],
    ['pose-2', { width: 512, height: 512, hasAlpha: true, cornersTransparent: true }], // wrong size
    ['pose-3', { width: 1024, height: 1024, hasAlpha: false, cornersTransparent: false }], // no alpha
    ['pose-4', { width: 1024, height: 1024, hasAlpha: true, cornersTransparent: true }],
    ['pose-5', { width: 1024, height: 1024, hasAlpha: true, cornersTransparent: true }]
  ])

  const metadataResult = checkPoseCompleteness(mockCharacter, completePoses, metadata)
  assertEqual(metadataResult.complete, false, 'Should detect metadata issues')
  assert(metadataResult.issues.some(i => i.type === 'size'), 'Should detect size issue')
  assert(metadataResult.issues.some(i => i.type === 'transparency'), 'Should detect transparency issue')
  
  console.log('✓ checkPoseCompleteness tests passed')
}

function testFormatValidationIssues() {
  console.log('Testing formatValidationIssues...')
  
  assertEqual(formatValidationIssues([]), 'All checks passed', 'Should format empty issues')
  
  const issues = [
    { slot: 'ready' as const, type: 'missing' as const, message: 'ready pose is missing' },
    { slot: 'success' as const, type: 'missing' as const, message: 'success pose is missing' },
    { slot: 'hurt' as const, type: 'size' as const, message: 'hurt pose is wrong size' }
  ]

  const formatted = formatValidationIssues(issues)
  assert(formatted.includes('Missing: 2 pose(s)'), 'Should count missing poses')
  assert(formatted.includes('Wrong size: 1 pose(s)'), 'Should count size issues')
  
  console.log('✓ formatValidationIssues tests passed')
}

export function runPoseValidationTests() {
  console.log('Running Pose Validation Tests...\n')
  
  try {
    testMapFilenameToSlot()
    testGroupPosesBySlot()
    testCheckPoseCompleteness()
    testFormatValidationIssues()
    
    console.log('\n✓ All pose validation tests passed!')
    return true
  } catch (error) {
    console.error('\n✗ Test failed:', error)
    return false
  }
}

// Auto-run if called directly
if (require.main === module) {
  const success = runPoseValidationTests()
  process.exit(success ? 0 : 1)
}
