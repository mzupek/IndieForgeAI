/**
 * Step 4 dialogue play + validation. Isolated, game-agnostic.
 * Run: npx tsx src/shared/story/dialogue.test.ts
 */
import assert from 'node:assert/strict'
import { emptyGameSettings } from '../studio/schema'
import type { AssetPipelineProject, Dialogue, GameFlag, Npc } from '../types/assetPipeline'
import { playDialogue, validateDialogue } from './dialogue'

const now = '2026-01-01T00:00:00.000Z'

function pipeline(): AssetPipelineProject {
  const flag: GameFlag = {
    id: 'flag-board',
    gameId: 'game-a',
    key: 'has_board',
    name: 'Has board',
    type: 'bool',
    default: false,
    scope: 'game',
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now
  }
  const npc: Npc = {
    id: 'npc-mentor',
    gameId: 'game-a',
    key: 'mentor',
    characterId: 'char-mentor',
    displayName: 'Mentor',
    role: 'mentor',
    placements: [{ regionId: 'r-a', anchorId: 'a-start' }],
    defaultDialogueId: 'dlg-1',
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now
  }
  const dialogue: Dialogue = {
    id: 'dlg-1',
    gameId: 'game-a',
    key: 'mentor-talk',
    name: 'Mentor talk',
    startNodeId: 'offer',
    nodes: [
      {
        id: 'offer',
        speaker: 'npc-mentor',
        text: 'Take this board?',
        choices: [
          { text: 'Yes', next: 'give', effects: [{ setFlag: { flagId: 'flag-board', value: true } }] },
          { text: 'No', next: 'bye' }
        ]
      },
      { id: 'give', speaker: 'npc-mentor', text: 'It is yours.', next: 'bye' },
      { id: 'bye', speaker: 'narrator', text: 'They leave.' },
      { id: 'after', speaker: 'npc-mentor', text: 'You already have it.' }
    ],
    entryVariants: [{ condition: { flag: { flagId: 'flag-board', op: 'eq', value: true } }, startNodeId: 'after' }],
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now
  }
  return {
    schemaVersion: 2,
    id: 'studio',
    name: 'Studio',
    description: '',
    games: [
      {
        id: 'game-a',
        name: 'Game A',
        engine: 'unity',
        exportRoot: './a',
        settings: emptyGameSettings(),
        createdAt: now,
        updatedAt: now
      }
    ],
    characters: [
      {
        id: 'char-mentor',
        gameId: 'game-a',
        name: 'Mentor',
        role: 'npc',
        tags: [],
        corePosesRequired: false,
        createdAt: now,
        updatedAt: now
      }
    ],
    poses: [],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [],
    storyboardShots: [],
    exportProfiles: [],
    gameDefinitions: [],
    visualAssets: [],
    assetStates: [],
    fonts: [],
    palettes: [],
    eventDefinitions: [],
    eventBindings: [],
    audioAssets: [],
    worlds: [],
    stages: [],
    encounters: [],
    regions: [
      {
        id: 'r-a',
        gameId: 'game-a',
        stageId: 'st',
        name: 'Yard',
        backgroundAssetId: 'bg',
        anchors: [{ id: 'a-start', pos: [0.1, 0.1] }],
        edges: [],
        spawn: 'a-start',
        hotspots: [],
        exits: [],
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    flags: [flag],
    npcs: [npc],
    dialogues: [dialogue],
    createdAt: now,
    updatedAt: now
  }
}

function testValidate() {
  const p = pipeline()
  const issues = validateDialogue(p, p.dialogues![0]!)
  assert.equal(issues.filter((i) => i.level === 'error').length, 0, JSON.stringify(issues))
  console.log('✓ dialogue validates')
}

function testPlayChoices() {
  const p = pipeline()
  const yes = playDialogue(p, p.dialogues![0]!, { choices: [1] })
  assert.equal(yes.ended, true)
  assert.equal(yes.startNodeId, 'offer')
  assert.equal(yes.steps[0]?.choiceText, 'Yes')
  assert.equal(yes.flags.find((f) => f.key === 'has_board')?.value, true)
  const no = playDialogue(p, p.dialogues![0]!, { choices: [2] })
  assert.equal(no.flags.find((f) => f.key === 'has_board')?.value, false)
  assert.equal(no.steps[0]?.choiceText, 'No')
  console.log('✓ play choices are deterministic')
}

function testEntryVariant() {
  const p = pipeline()
  const after = playDialogue(p, p.dialogues![0]!, { flags: 'has_board=true', choices: [] })
  assert.equal(after.startNodeId, 'after')
  assert.equal(after.steps[0]?.nodeId, 'after')
  console.log('✓ entry variant after flag')
}

function main() {
  testValidate()
  testPlayChoices()
  testEntryVariant()
  console.log('\n✓ dialogue tests passed')
}

main()
