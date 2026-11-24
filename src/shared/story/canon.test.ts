/**
 * Story canon: circles, reveal tokens, Step 6 rule. Isolated.
 * Run: npx tsx src/shared/story/canon.test.ts
 */
import assert from 'node:assert/strict'
import { emptyGameSettings } from '../studio/schema'
import type { AssetPipelineProject, StoryCircle } from '../types/assetPipeline'
import { applyContentBundleIsolated } from '../worldContent/apply'
import { validateStageCircleStep6, validateStoryCircle } from './circles'
import { applyGrantRevealToken } from './revealTokens'
import { playDialogue } from './dialogue'
import { ADVENTURE_LENS_TEMPLATE } from './templates/adventureLens'
import { applyStoryTemplateToGame } from './templates'

const now = '2026-01-01T00:00:00.000Z'

function base(): AssetPipelineProject {
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
        settings: {
          ...emptyGameSettings(),
          modules: [{ id: 'story_beat', label: 'Story beat', typeIds: ['story'] }]
        },
        createdAt: now,
        updatedAt: now
      }
    ],
    characters: [],
    poses: [],
    clips: [],
    scenePresets: [],
    scenes: [],
    storyboards: [],
    storyboardShots: [],
    exportProfiles: [],
    gameDefinitions: [],
    visualAssets: [
      {
        id: 'bg-a',
        gameId: 'game-a',
        name: 'Yard',
        category: 'background',
        tags: [],
        defaultStateId: null,
        createdAt: now,
        updatedAt: now
      }
    ],
    assetStates: [],
    fonts: [],
    palettes: [],
    eventDefinitions: [],
    eventBindings: [],
    audioAssets: [],
    worlds: [
      {
        id: 'world-a',
        gameId: 'game-a',
        key: 'world-1',
        name: 'World 1',
        order: 1,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    stages: [
      {
        id: 'stage-intro',
        gameId: 'game-a',
        worldId: 'world-a',
        key: 'intro',
        name: 'Intro',
        order: 1,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    encounters: [
      {
        id: 'enc-1',
        gameId: 'game-a',
        stageId: 'stage-intro',
        key: 'enc-hover-test',
        name: 'Intro complication',
        typeId: 'story',
        moduleId: 'story_beat',
        stars: [],
        order: 1,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    regions: [],
    enemies: [],
    attackTables: [],
    difficultyProfiles: [],
    flags: [],
    triggers: [],
    npcs: [],
    dialogues: [],
    storyCircles: [],
    revealTokens: [],
    createdAt: now,
    updatedAt: now
  }
}

function testStep6DraftWarnsApprovedErrors() {
  const p = base()
  const circle: StoryCircle = {
    id: 'c1',
    gameId: 'game-a',
    name: 'Intro circle',
    scope: 'stage',
    refId: 'stage-intro',
    steps: [
      { index: 1, label: 'You' },
      { index: 2, label: 'Need' },
      { index: 3, label: 'Go' },
      { index: 4, label: 'Search' },
      { index: 5, label: 'Find' },
      { index: 6, label: 'Take' },
      { index: 7, label: 'Return' },
      { index: 8, label: 'Change' }
    ],
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now
  }
  const draft = validateStageCircleStep6(p, circle)
  assert.equal(draft.length, 1)
  assert.equal(draft[0]?.level, 'warning')
  circle.canonStatus = 'approved'
  const approved = validateStageCircleStep6(p, circle)
  assert.equal(approved[0]?.level, 'error')
  circle.steps[5]!.encounterId = 'enc-1'
  const ok = validateStoryCircle(p, circle)
  assert.equal(ok.filter((i) => i.level === 'error').length, 0, JSON.stringify(ok))
  console.log('✓ Step 6 draft warns, approved errors, linked encounter passes')
}

function testApplyCharactersAndTokens() {
  const p = base()
  const { result, pipeline } = applyContentBundleIsolated(p, 'game-a', {
    characters: [
      {
        key: 'mentor',
        name: 'Mentor',
        role: 'npc',
        storyProfile: {
          summary: 'Guide',
          want: 'Keep the hero safe',
          need: 'Let them choose',
          canonStatus: 'approved'
        }
      }
    ],
    revealTokens: [
      { key: 'fragment_gate', title: 'The gate', text: 'A sealed door.', order: 1, canonStatus: 'draft' }
    ],
    dialogues: [
      {
        key: 'dlg-mentor-board',
        name: 'Mentor board',
        startNodeId: 'give',
        nodes: [
          {
            id: 'give',
            speaker: 'narrator',
            text: 'Remember this.',
            effects: [{ grantRevealToken: { tokenId: '@fragment_gate' } }]
          }
        ],
        canonStatus: 'draft'
      }
    ]
  })
  assert.ok(result.creates.some((c) => c.type === 'character' && c.key === 'mentor'))
  assert.ok(result.creates.some((c) => c.type === 'revealToken' && c.key === 'fragment_gate'))
  const token = pipeline.revealTokens!.find((t) => t.key === 'fragment_gate')!
  assert.ok(token.flagId)
  const flag = pipeline.flags!.find((f) => f.id === token.flagId)
  assert.equal(flag?.key, 'revealed_fragment_gate')
  const dlg = pipeline.dialogues!.find((d) => d.key === 'dlg-mentor-board')!
  const play = playDialogue(pipeline, dlg, {})
  assert.equal(play.grantedRevealTokens[0]?.key, 'fragment_gate')
  assert.equal(play.flags.find((f) => f.key === 'revealed_fragment_gate')?.value, true)
  const flags = new Map<string, boolean | number>([[token.flagId, false]])
  applyGrantRevealToken(pipeline, 'game-a', dlg.nodes[0]!.effects, flags)
  assert.equal(flags.get(token.flagId), true)
  const again = applyContentBundleIsolated(pipeline, 'game-a', {
    characters: [
      {
        key: 'mentor',
        name: 'Mentor',
        role: 'npc',
        storyProfile: {
          summary: 'Guide',
          want: 'Keep the hero safe',
          need: 'Let them choose',
          canonStatus: 'approved'
        }
      }
    ],
    revealTokens: [
      { key: 'fragment_gate', title: 'The gate', text: 'A sealed door.', order: 1, canonStatus: 'draft' }
    ]
  })
  assert.equal(again.result.creates.length, 0)
  assert.equal(again.result.updates.length, 0)
  console.log('✓ apply characters + tokens; grantRevealToken; re-apply 0 changes')
}

function testTemplateDataHasNoGameTitle() {
  const raw = JSON.stringify(ADVENTURE_LENS_TEMPLATE)
  const banned = ['Ne' + 'on Recall', "Ring'" + 'Em Up']
  assert.equal(banned.some((n) => raw.includes(n)), false)
  const p = base()
  const game = {
    id: 'game-new',
    name: 'New Game',
    engine: 'unity' as const,
    exportRoot: './x',
    settings: emptyGameSettings(),
    createdAt: now,
    updatedAt: now
  }
  p.games.push(game)
  const applied = applyStoryTemplateToGame(p, game, ADVENTURE_LENS_TEMPLATE)
  assert.ok(applied.pipeline.storyCircles!.some((c) => c.gameId === 'game-new'))
  assert.equal(game.settings?.revealTokenLabel, 'Reveal token')
  console.log('✓ template is game-agnostic and copies into a new game')
}

function main() {
  testStep6DraftWarnsApprovedErrors()
  testApplyCharactersAndTokens()
  testTemplateDataHasNoGameTitle()
  console.log('\n✓ canon tests passed')
}

main()
