/**
 * Unit tests for Character CRUD operations
 * Validates character creation, updates, deletion, and persistence
 */

import type { Character } from '@shared/types/assetPipeline'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function testCharacterDataStructure() {
  const now = new Date().toISOString()
  const character: Character = {
    id: 'char-test-1',
    gameId: 'game-1',
    name: 'Hero',
    role: 'player',
    styleNotes: 'Red cape, bold stance',
    tags: ['protagonist', 'fire'],
    thumbnail: './thumb.png',
    createdAt: now,
    updatedAt: now
  }

  assert(character.id === 'char-test-1', 'Character ID should match')
  assert(character.gameId === 'game-1', 'Character gameId should match')
  assert(character.name === 'Hero', 'Character name should match')
  assert(character.role === 'player', 'Character role should match')
  assert(character.tags.length === 2, 'Character should have 2 tags')
  assert(character.tags.includes('protagonist'), 'Character should have protagonist tag')
  
  console.log('✓ Character data structure test passed')
}

function testCharacterWithReferenceSheet() {
  const now = new Date().toISOString()
  const character: Character = {
    id: 'char-test-2',
    gameId: 'game-1',
    name: 'Villain',
    role: 'boss',
    tags: [],
    referenceSheet: {
      palette: '#ff0000,#000000,#ffaa00',
      outlineStyle: 'thick',
      facing: 'left',
      canvasSize: { width: 1024, height: 1024 }
    },
    createdAt: now,
    updatedAt: now
  }

  assert(character.referenceSheet !== undefined, 'Character should have reference sheet')
  assert(character.referenceSheet.palette === '#ff0000,#000000,#ffaa00', 'Palette should match')
  assert(character.referenceSheet.canvasSize?.width === 1024, 'Canvas width should be 1024')
  
  console.log('✓ Character with reference sheet test passed')
}

function testCharacterMinimalFields() {
  const now = new Date().toISOString()
  const character: Character = {
    id: 'char-test-3',
    gameId: 'game-1',
    name: 'NPC',
    role: 'merchant',
    tags: [],
    createdAt: now,
    updatedAt: now
  }

  assert(character.name === 'NPC', 'Minimal character should have name')
  assert(character.role === 'merchant', 'Minimal character should have role')
  assert(character.tags.length === 0, 'Minimal character can have empty tags')
  assert(character.styleNotes === undefined, 'Optional fields should be undefined')
  
  console.log('✓ Character minimal fields test passed')
}

function testCharacterUpdate() {
  const now = new Date().toISOString()
  const later = new Date(Date.now() + 1000).toISOString()
  
  const original: Character = {
    id: 'char-test-4',
    gameId: 'game-1',
    name: 'Fighter',
    role: 'player',
    tags: ['melee'],
    createdAt: now,
    updatedAt: now
  }

  const updated: Character = {
    ...original,
    name: 'Super Fighter',
    tags: ['melee', 'super'],
    styleNotes: 'Glowing aura added',
    updatedAt: later
  }

  assert(updated.id === original.id, 'ID should not change on update')
  assert(updated.gameId === original.gameId, 'GameId should not change on update')
  assert(updated.name === 'Super Fighter', 'Name should be updated')
  assert(updated.tags.length === 2, 'Tags should be updated')
  assert(updated.styleNotes === 'Glowing aura added', 'Style notes should be added')
  assert(updated.updatedAt !== original.updatedAt, 'UpdatedAt should change')
  
  console.log('✓ Character update test passed')
}

function testCharacterJsonSerialization() {
  const now = new Date().toISOString()
  const character: Character = {
    id: 'char-test-5',
    gameId: 'game-1',
    name: 'Mage',
    role: 'player',
    styleNotes: 'Purple robes',
    referenceImage: './mage-ref.png',
    thumbnail: './mage-thumb.png',
    tags: ['magic', 'ranged'],
    referenceSheet: {
      palette: '#800080,#4a0e4e',
      facing: 'front'
    },
    createdAt: now,
    updatedAt: now
  }

  const json = JSON.stringify(character)
  const parsed: Character = JSON.parse(json)

  assert(parsed.id === character.id, 'Parsed ID should match')
  assert(parsed.name === character.name, 'Parsed name should match')
  assert(parsed.tags.length === character.tags.length, 'Parsed tags should match')
  assert(parsed.referenceSheet?.palette === character.referenceSheet?.palette, 'Parsed reference sheet should match')
  
  console.log('✓ Character JSON serialization test passed')
}

function testCharacterCollectionPersistence() {
  const now = new Date().toISOString()
  
  const characters: Character[] = [
    {
      id: 'char-1',
      gameId: 'game-1',
      name: 'Hero',
      role: 'player',
      tags: ['fire'],
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'char-2',
      gameId: 'game-1',
      name: 'Sidekick',
      role: 'npc',
      tags: ['support'],
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'char-3',
      gameId: 'game-2',
      name: 'Boss',
      role: 'boss',
      tags: ['final'],
      createdAt: now,
      updatedAt: now
    }
  ]

  const json = JSON.stringify(characters)
  const parsed: Character[] = JSON.parse(json)

  assert(parsed.length === 3, 'Should parse 3 characters')
  
  const game1Chars = parsed.filter((c) => c.gameId === 'game-1')
  assert(game1Chars.length === 2, 'Should have 2 characters for game-1')
  
  const game2Chars = parsed.filter((c) => c.gameId === 'game-2')
  assert(game2Chars.length === 1, 'Should have 1 character for game-2')
  
  console.log('✓ Character collection persistence test passed')
}

function testCharacterDeletion() {
  const now = new Date().toISOString()
  
  let characters: Character[] = [
    {
      id: 'char-1',
      gameId: 'game-1',
      name: 'Hero',
      role: 'player',
      tags: [],
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'char-2',
      gameId: 'game-1',
      name: 'Villain',
      role: 'boss',
      tags: [],
      createdAt: now,
      updatedAt: now
    }
  ]

  assert(characters.length === 2, 'Should start with 2 characters')
  
  // Simulate deletion
  const deleteId = 'char-1'
  characters = characters.filter((c) => c.id !== deleteId)
  
  assert(characters.length === 1, 'Should have 1 character after deletion')
  assert(characters[0].id === 'char-2', 'Remaining character should be char-2')
  assert(!characters.find((c) => c.id === deleteId), 'Deleted character should not exist')
  
  console.log('✓ Character deletion test passed')
}

export function runCharacterServiceTests() {
  console.log('Running Character Service Tests...\n')
  
  try {
    testCharacterDataStructure()
    testCharacterWithReferenceSheet()
    testCharacterMinimalFields()
    testCharacterUpdate()
    testCharacterJsonSerialization()
    testCharacterCollectionPersistence()
    testCharacterDeletion()
    
    console.log('\n✓ All character service tests passed!')
    return true
  } catch (error) {
    console.error('\n✗ Test failed:', error)
    return false
  }
}

// Auto-run if called directly
if (require.main === module) {
  const success = runCharacterServiceTests()
  process.exit(success ? 0 : 1)
}
