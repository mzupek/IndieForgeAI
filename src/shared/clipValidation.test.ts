/**
 * Clip validation tests
 * Run with: npx tsx src/shared/clipValidation.test.ts
 */

import {
  mapFilenameToMoment,
  validateClipDuration,
  formatDuration
} from './clipValidation'

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

function testMapFilenameToMoment() {
  console.log('Testing mapFilenameToMoment...')
  
  // Test underscores
  assertEqual(mapFilenameToMoment('gate_drone_finisher.mp4'), 'finisher', 'Should map gate_drone_finisher.mp4')
  assertEqual(mapFilenameToMoment('hero_intro.mp4'), 'intro', 'Should map hero_intro.mp4')
  assertEqual(mapFilenameToMoment('boss_hit_v2.webm'), 'hit', 'Should map boss_hit_v2.webm')
  assertEqual(mapFilenameToMoment('character_defeat.mp4'), 'defeat', 'Should map character_defeat.mp4')
  assertEqual(mapFilenameToMoment('npc_story_beat.webm'), 'story_beat', 'Should map npc_story_beat.webm')
  
  // Test hyphens
  assertEqual(mapFilenameToMoment('hero-intro.mp4'), 'intro', 'Should map hero-intro.mp4')
  assertEqual(mapFilenameToMoment('boss-finisher.webm'), 'finisher', 'Should map boss-finisher.webm')
  
  // Test case insensitive
  assertEqual(mapFilenameToMoment('HERO_INTRO.MP4'), 'intro', 'Should be case insensitive')
  
  // Test unmapped
  assertEqual(mapFilenameToMoment('random.mp4'), null, 'Should return null for random.mp4')
  assertEqual(mapFilenameToMoment('video.webm'), null, 'Should return null for video.webm')
  
  console.log('✓ mapFilenameToMoment tests passed')
}

function testValidateClipDuration() {
  console.log('Testing validateClipDuration...')
  
  // Test too short
  const tooShort = validateClipDuration(0.3)
  assert(tooShort.length > 0, 'Should have issues for 0.3s')
  assert(tooShort.some(i => i.type === 'duration_short'), 'Should warn about short duration')
  
  // Test too long
  const tooLong = validateClipDuration(2.5)
  assert(tooLong.length > 0, 'Should have issues for 2.5s')
  assert(tooLong.some(i => i.type === 'duration_long'), 'Should warn about long duration')
  
  // Test good duration
  const good1 = validateClipDuration(1.0)
  assertEqual(good1.length, 0, 'Should have no issues for 1.0s')
  
  const good2 = validateClipDuration(1.5)
  assertEqual(good2.length, 0, 'Should have no issues for 1.5s')
  
  // Test edge cases
  const edge1 = validateClipDuration(0.5)
  assertEqual(edge1.length, 0, 'Should have no issues for 0.5s (min)')
  
  const edge2 = validateClipDuration(2.0)
  assertEqual(edge2.length, 0, 'Should have no issues for 2.0s (max)')
  
  console.log('✓ validateClipDuration tests passed')
}

function testFormatDuration() {
  console.log('Testing formatDuration...')
  
  assertEqual(formatDuration(0.5), '500ms', 'Should format 0.5s as 500ms')
  assertEqual(formatDuration(0.8), '800ms', 'Should format 0.8s as 800ms')
  assertEqual(formatDuration(1.0), '1.00s', 'Should format 1.0s')
  assertEqual(formatDuration(1.5), '1.50s', 'Should format 1.5s')
  assertEqual(formatDuration(2.0), '2.00s', 'Should format 2.0s')
  
  console.log('✓ formatDuration tests passed')
}

export function runClipValidationTests() {
  console.log('Running Clip Validation Tests...\n')
  
  try {
    testMapFilenameToMoment()
    testValidateClipDuration()
    testFormatDuration()
    
    console.log('\n✓ All clip validation tests passed!')
    return true
  } catch (error) {
    console.error('\n✗ Test failed:', error)
    return false
  }
}

// Auto-run if called directly
if (require.main === module) {
  const success = runClipValidationTests()
  process.exit(success ? 0 : 1)
}
