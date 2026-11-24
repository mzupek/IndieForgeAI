/**
 * Step 3 conditions, flags, simulate. Isolated, game-agnostic.
 * Run: npx tsx src/shared/story/conditions.test.ts
 */
import assert from 'node:assert/strict'
import { emptyGameSettings } from '../studio/schema'
import type { AssetPipelineProject, Condition, GameFlag, Stage, Trigger, World } from '../types/assetPipeline'
import {
  conditionNeverPasses,
  evaluateCondition,
  parseCondition,
  parseEffects,
  summarizeCondition,
  validateCondition,
  validateEffects
} from './conditions'
import { collectFlagUsageWarnings, validateGameFlag } from './flags'
import { simulateWorldFlow } from './simulate'
import { validateTrigger } from './triggers'

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
  const score: GameFlag = {
    id: 'flag-score',
    gameId: 'game-a',
    key: 'score',
    name: 'Score',
    type: 'int',
    default: 0,
    scope: 'game',
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now
  }
  const world: World = {
    id: 'world-a',
    gameId: 'game-a',
    key: 'world-1',
    name: 'World 1',
    order: 1,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now
  }
  const intro: Stage = {
    id: 'st-intro',
    gameId: 'game-a',
    worldId: 'world-a',
    key: 'stage-intro',
    name: 'Intro',
    order: 1,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now
  }
  const gate: Stage = {
    id: 'st-gate',
    gameId: 'game-a',
    worldId: 'world-a',
    key: 'stage-gate',
    name: 'The Gate',
    order: 2,
    unlockAfter: ['st-intro'],
    unlockCondition: { flag: { flagId: 'flag-board', op: 'eq', value: true } },
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
    characters: [],
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
    worlds: [world],
    stages: [intro, gate],
    encounters: [
      {
        id: 'enc-test',
        gameId: 'game-a',
        stageId: 'st-intro',
        key: 'enc-test',
        name: 'Test run',
        typeId: 'minigame',
        moduleId: 'mini',
        stars: [],
        order: 1,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    regions: [
      {
        id: 'r-a',
        gameId: 'game-a',
        stageId: 'st-intro',
        key: 'region-intro',
        name: 'Yard',
        backgroundAssetId: 'bg-a',
        anchors: [{ id: 'a-start', pos: [0.1, 0.1] }],
        edges: [],
        spawn: 'a-start',
        hotspots: [{ id: 'hs-1', anchor: 'a-start', prompt: 'Talk', encounterId: 'enc-test' }],
        exits: [],
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    flags: [flag, score],
    triggers: [],
    createdAt: now,
    updatedAt: now
  }
}

function testParseAndSummarize() {
  const p = pipeline()
  const issues: import('../worldContent/issues').ContentIssue[] = []
  const cond = parseCondition(
    { all: [{ flag: { flagId: 'flag-board', op: 'eq', value: true } }, { stageCleared: { stageId: 'st-intro' } }] },
    'c',
    issues
  )
  assert.equal(issues.length, 0)
  assert.ok(cond && 'all' in cond)
  const text = summarizeCondition(p, 'game-a', cond)
  assert.match(text, /has_board eq true/)
  assert.match(text, /Intro/)
  const effects = parseEffects(
    [{ setFlag: { flagId: 'flag-board', value: true } }, { returnToWorldMap: true }],
    'e',
    issues
  )
  assert.equal(effects.length, 2)
  console.log('✓ parse + summarize')
}

function testValidate() {
  const p = pipeline()
  const missing = validateCondition(
    p,
    'game-a',
    { flag: { flagId: 'nope', op: 'eq', value: true } },
    'c'
  )
  assert.equal(missing[0]?.level, 'error')
  const type = validateCondition(
    p,
    'game-a',
    { flag: { flagId: 'flag-board', op: 'eq', value: 1 } },
    'c'
  )
  assert.match(type[0]!.message, /bool/)
  const gte = validateCondition(
    p,
    'game-a',
    { flag: { flagId: 'flag-board', op: 'gte', value: true } },
    'c'
  )
  assert.match(gte[0]!.message, /only valid for int/)
  const ok = validateEffects(p, 'game-a', [{ setFlag: { flagId: 'flag-board', value: true } }], 'e')
  assert.equal(ok.length, 0)
  const incBool = validateEffects(p, 'game-a', [{ incFlag: { flagId: 'flag-board', by: 1 } }], 'e')
  assert.match(incBool[0]!.message, /int flag/)
  console.log('✓ validate flag types and missing ids')
}

function testNeverAndEval() {
  const never: Condition = {
    all: [
      { flag: { flagId: 'flag-board', op: 'eq', value: true } },
      { flag: { flagId: 'flag-board', op: 'eq', value: false } }
    ]
  }
  assert.equal(conditionNeverPasses(never), true)
  assert.equal(conditionNeverPasses({ any: [] }), true)
  assert.equal(conditionNeverPasses({ flag: { flagId: 'x', op: 'eq', value: true } }), false)
  const ctx = {
    flags: new Map<string, boolean | number>([['flag-board', true], ['flag-score', 2]]),
    clearedStages: new Set(['st-intro']),
    wonEncounters: new Set<string>()
  }
  assert.equal(evaluateCondition({ flag: { flagId: 'flag-board', op: 'eq', value: true } }, ctx), true)
  assert.equal(evaluateCondition({ flag: { flagId: 'flag-score', op: 'gte', value: 2 } }, ctx), true)
  assert.equal(evaluateCondition({ stageCleared: { stageId: 'st-gate' } }, ctx), false)
  console.log('✓ never-pass + evaluate')
}

function testFlagRecord() {
  const p = pipeline()
  const bad: GameFlag = { ...p.flags![0]!, default: 3 }
  const issues = validateGameFlag(p, bad)
  assert.match(issues[0]!.message, /boolean default/)
  console.log('✓ flag record validation')
}

function testSimulate() {
  const p = pipeline()
  const locked = simulateWorldFlow(p, p.worlds![0]!)
  assert.ok(locked.unlockedStages.some((s) => s.name === 'Intro'))
  assert.ok(locked.lockedStages.some((s) => s.name === 'The Gate'))
  const open = simulateWorldFlow(p, p.worlds![0]!, 'has_board=true')
  assert.ok(open.unlockedStages.some((s) => s.name === 'The Gate'), JSON.stringify(open))
  assert.ok(open.firingTriggers.some((t) => t.virtual && t.kind === 'onHotspot'))
  console.log('✓ simulate unlock + virtual hotspot trigger')
}

function testTriggerSourceWarning() {
  const p = pipeline()
  const trigger: Trigger = {
    id: 't-1',
    gameId: 'game-a',
    name: 'Ghost',
    kind: 'onHotspot',
    sourceRef: 'missing-hs',
    once: false,
    effects: [],
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now
  }
  const issues = validateTrigger(p, trigger)
  assert.ok(issues.some((i) => i.level === 'warning' && /missing/.test(i.message)))
  console.log('✓ missing trigger source is a warning')
}

function testFlagUsageWarnings() {
  const p = pipeline()
  p.triggers = [
    {
      id: 't-read',
      gameId: 'game-a',
      name: 'Need board',
      kind: 'onHotspot',
      sourceRef: 'hs-1',
      once: false,
      condition: { flag: { flagId: 'flag-board', op: 'eq', value: true } },
      effects: [{ setFlag: { flagId: 'flag-score', value: 1 } }],
      schemaVersion: 2,
      createdAt: now,
      updatedAt: now
    }
  ]
  const warnings = collectFlagUsageWarnings(p, 'game-a')
  const blob = warnings.map((w) => w.message).join('\n')
  assert.match(blob, /Has board/)
  assert.match(blob, /read but never set/)
  assert.match(blob, /Score/)
  assert.match(blob, /set but never read/)
  console.log('✓ flag read-never-set / set-never-read warnings')
}

function main() {
  testParseAndSummarize()
  testValidate()
  testNeverAndEval()
  testFlagRecord()
  testSimulate()
  testTriggerSourceWarning()
  testFlagUsageWarnings()
  console.log('\n✓ story condition tests passed')
}

main()
