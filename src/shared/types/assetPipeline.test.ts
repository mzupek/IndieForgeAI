/**
 * Unit tests for Asset Pipeline Model
 * Run with: node --loader ts-node/esm assetPipeline.test.ts
 * Or validate types at compile time with: tsc --noEmit
 */

import type {
  Game,
  Character,
  Pose,
  Clip,
  ScenePreset,
  ExportProfile,
  AssetPipelineProject
} from './assetPipeline'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function testGameEntity() {
  const game: Game = {
    id: 'game-1',
    name: 'Test Game',
    engine: 'godot',
    exportRoot: './exports/test-game',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  assert(game.engine === 'godot', 'Game engine should be godot')
  assert(game.name === 'Test Game', 'Game name should match')
  console.log('✓ Game entity test passed')
}

function testCharacterEntity() {
  const character: Character = {
    id: 'char-1',
    gameId: 'game-1',
    name: 'Hero',
    role: 'player',
    styleNotes: 'Bold colors, athletic build',
    referenceImage: './refs/hero.png',
    referenceSheet: {
      palette: '#ff0000,#00ff00,#0000ff',
      outlineStyle: 'thick',
      facing: 'right',
      canvasSize: { width: 1024, height: 1024 }
    },
    tags: ['protagonist', 'fighter', 'red'],
    thumbnail: './thumbs/hero.png',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  assert(character.role === 'player', 'Character role should be player')
  assert(character.tags.includes('protagonist'), 'Character tags should include protagonist')
  assert(character.referenceSheet?.palette === '#ff0000,#00ff00,#0000ff', 'Reference sheet palette should match')
  console.log('✓ Character entity test passed')
}

function testPoseEntity() {
  const pose: Pose = {
    id: 'pose-1',
    characterId: 'char-1',
    slot: 'ready',
    file: './poses/hero-ready.png',
    status: 'approved',
    source: 'import',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  assert(pose.slot === 'ready', 'Pose slot should be ready')
  assert(pose.status === 'approved', 'Pose status should be approved')
  assert(pose.source === 'import', 'Pose source should be import')
  console.log('✓ Pose entity test passed')
}

function testClipEntity() {
  const clip: Clip = {
    id: 'clip-1',
    characterId: 'char-1',
    moment: 'intro',
    file: './clips/hero-intro.mp4',
    durationSec: 2.5,
    tags: ['entrance', 'dramatic'],
    thumbnail: './thumbs/clip-intro.png',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  assert(clip.moment === 'intro', 'Clip moment should be intro')
  assert(clip.durationSec === 2.5, 'Clip duration should be 2.5')
  assert(clip.tags.includes('dramatic'), 'Clip tags should include dramatic')
  console.log('✓ Clip entity test passed')
}

function testScenePreset() {
  const preset: ScenePreset = {
    id: 'preset-1',
    type: 'versus',
    params: {
      cameraAngle: 'side',
      zoom: 1.2,
      duration: 3000
    },
    tags: ['combat', 'facing'],
    thumbnail: './thumbs/versus.png',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  assert(preset.type === 'versus', 'Preset type should be versus')
  assert(preset.params.zoom === 1.2, 'Preset zoom should be 1.2')
  assert(preset.tags.includes('combat'), 'Preset tags should include combat')
  console.log('✓ ScenePreset test passed')
}

function testExportProfile() {
  const profile: ExportProfile = {
    id: 'export-1',
    gameId: 'game-1',
    rootPath: './exports/game1',
    namingRules: {
      characterFormat: '{character}_{pose}',
      poseFormat: '{slot}',
      clipFormat: '{moment}_{character}'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  assert(profile.gameId === 'game-1', 'Export profile gameId should match')
  assert(profile.namingRules.characterFormat === '{character}_{pose}', 'Character format should match')
  console.log('✓ ExportProfile test passed')
}

function testAssetPipelineProject() {
  const now = new Date().toISOString()
  const project: AssetPipelineProject = {
    schemaVersion: 1,
    id: 'proj-1',
    name: 'Test Project',
    description: 'A test asset pipeline project',
    games: [
      {
        id: 'game-1',
        name: 'Fighter Game',
        engine: 'unity',
        exportRoot: './exports',
        createdAt: now,
        updatedAt: now
      }
    ],
    characters: [
      {
        id: 'char-1',
        gameId: 'game-1',
        name: 'Player',
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
        slot: 'ready',
        file: './pose.png',
        status: 'approved',
        createdAt: now,
        updatedAt: now
      }
    ],
    clips: [
      {
        id: 'clip-1',
        moment: 'intro',
        file: './intro.mp4',
        durationSec: 3,
        tags: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    scenePresets: [
      {
        id: 'preset-1',
        type: 'versus',
        params: {},
        tags: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    scenes: [],
    storyboards: [],
    storyboardShots: [],
    gameDefinitions: [],
    visualAssets: [],
    assetStates: [],
    fonts: [],
    palettes: [],
    eventDefinitions: [],
    eventBindings: [],
    audioAssets: [],
    exportProfiles: [
      {
        id: 'export-1',
        gameId: 'game-1',
        rootPath: './exports',
        namingRules: {},
        createdAt: now,
        updatedAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  }

  assert(project.schemaVersion === 1, 'Project schema version should be 1')
  assert(project.games.length === 1, 'Project should have 1 game')
  assert(project.characters.length === 1, 'Project should have 1 character')
  assert(project.poses.length === 1, 'Project should have 1 pose')
  assert(project.clips.length === 1, 'Project should have 1 clip')
  assert(project.scenePresets.length === 1, 'Project should have 1 scene preset')
  assert(project.exportProfiles.length === 1, 'Project should have 1 export profile')
  console.log('✓ AssetPipelineProject test passed')
}

function testJsonSerialization() {
  const now = new Date().toISOString()
  const original: AssetPipelineProject = {
    schemaVersion: 1,
    id: 'test',
    name: 'Test',
    description: 'Test project',
    games: [],
    characters: [],
    poses: [],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [],
    storyboardShots: [],
    gameDefinitions: [],
    visualAssets: [],
    assetStates: [],
    fonts: [],
    palettes: [],
    eventDefinitions: [],
    eventBindings: [],
    audioAssets: [],
    exportProfiles: [],
    createdAt: now,
    updatedAt: now
  }

  const json = JSON.stringify(original)
  const parsed: AssetPipelineProject = JSON.parse(json)

  assert(parsed.schemaVersion === original.schemaVersion, 'Parsed schema version should match')
  assert(parsed.id === original.id, 'Parsed id should match')
  assert(parsed.name === original.name, 'Parsed name should match')
  console.log('✓ JSON serialization test passed')
}

// Run all tests
export function runAssetPipelineTests() {
  console.log('Running Asset Pipeline Model Tests...\n')
  
  try {
    testGameEntity()
    testCharacterEntity()
    testPoseEntity()
    testClipEntity()
    testScenePreset()
    testExportProfile()
    testAssetPipelineProject()
    testJsonSerialization()
    
    console.log('\n✓ All tests passed!')
    return true
  } catch (error) {
    console.error('\n✗ Test failed:', error)
    return false
  }
}

// Auto-run if called directly (not imported)
if (require.main === module) {
  const success = runAssetPipelineTests()
  process.exit(success ? 0 : 1)
}
