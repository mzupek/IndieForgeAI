/**
 * 1c world-structure validation. Isolated, game-agnostic.
 * Run: npx tsx src/shared/worldContent/validate.test.ts
 */
import assert from 'node:assert/strict'
import { emptyGameSettings } from '../studio/schema'
import type { AssetPipelineProject, Encounter, Region, Stage, World } from '../types/assetPipeline'
import { applyContentBundleIsolated } from './apply'
import { ContentApplyError } from './issues'
import { validateEncounter, validateRegion, validateStage, validateWorld } from './validate'
import { buildWorldFlow } from './flow'

const now = '2026-01-01T00:00:00.000Z'

function pipeline(): AssetPipelineProject {
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
          modules: [
            { id: 'pad', label: 'Pad', typeIds: ['battle'], starKinds: ['win', 'noMisses', 'timeUnder'] }
          ]
        },
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'game-b',
        name: 'Game B',
        engine: 'godot',
        exportRoot: './b',
        settings: emptyGameSettings(),
        createdAt: now,
        updatedAt: now
      }
    ],
    characters: [],
    poses: [],
    clips: [],
    scenePresets: [],
    scenes: [
      {
        id: 'scene-a',
        gameId: 'game-a',
        name: 'Boss Fight',
        cast: [],
        poseRefs: [],
        clipRefs: [],
        audioRefs: [],
        interactionHooks: [],
        attachedPresets: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    storyboards: [],
    storyboardShots: [],
    exportProfiles: [],
    gameDefinitions: [
      {
        id: 'def-a',
        gameId: 'game-a',
        stage: 'MVP',
        pillars: [],
        puzzleCore: '',
        storySynopsis: '',
        cast: [],
        linkedAssets: { poses: [], clips: [], presets: [] },
        themeSlots: [],
        interactions: [],
        tuningProfiles: [{ id: 'tune-a', name: 'Boss Tune', params: { hp: 20 } }],
        keepCutInvent: { keep: [], cut: [], invent: [] },
        mvpBoard: [],
        markdownSource: '',
        createdAt: now,
        updatedAt: now
      }
    ],
    visualAssets: [
      {
        id: 'bg-a',
        gameId: 'game-a',
        name: 'Alley',
        category: 'background',
        tags: [],
        defaultStateId: null,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'logo-a',
        gameId: 'game-a',
        name: 'Logo',
        category: 'logo',
        tags: [],
        defaultStateId: null,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'bg-map',
        gameId: 'game-a',
        name: 'World 1 map',
        category: 'background',
        tags: [],
        defaultStateId: null,
        schemaVersion: 2,
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
        id: 'stage-a',
        gameId: 'game-a',
        worldId: 'world-a',
        key: 'stage-gate',
        name: 'The Gate',
        order: 1,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now
      }
    ],
    encounters: [],
    regions: [],
    createdAt: now,
    updatedAt: now
  }
}

function world(over: Partial<World> = {}): World {
  return {
    id: 'w1',
    gameId: 'game-a',
    name: 'W',
    order: 1,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...over
  }
}

function stage(over: Partial<Stage> = {}): Stage {
  return {
    id: 's1',
    gameId: 'game-a',
    worldId: 'world-a',
    name: 'S',
    order: 1,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...over
  }
}

function encounter(over: Partial<Encounter> = {}): Encounter {
  return {
    id: 'e1',
    gameId: 'game-a',
    stageId: 'stage-a',
    name: 'E',
    typeId: 'battle',
    moduleId: 'pad',
    stars: [],
    order: 1,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...over
  }
}

function region(over: Partial<Region> = {}): Region {
  return {
    id: 'r1',
    gameId: 'game-a',
    stageId: 'stage-a',
    name: 'R',
    backgroundAssetId: 'bg-a',
    anchors: [
      { id: 'a-start', pos: [0.12, 0.78] },
      { id: 'a-gate', pos: [0.8, 0.7] }
    ],
    edges: [['a-start', 'a-gate']],
    spawn: 'a-start',
    hotspots: [{ id: 'hs-gate', anchor: 'a-gate', prompt: 'Hack' }],
    exits: [],
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...over
  }
}

{
  const issues = validateWorld(pipeline(), world({ name: '' }))
  assert.ok(issues.some((i) => i.message.includes('name is required')))
}

{
  const issues = validateStage(pipeline(), stage({ worldId: 'missing' }))
  assert.ok(issues.some((i) => i.message.includes('was not found')))
}

{
  const issues = validateStage(pipeline(), stage({ gameId: 'game-b', worldId: 'world-a' }))
  assert.ok(issues.some((i) => i.message.includes('belongs to game')))
}

{
  const issues = validateEncounter(pipeline(), encounter({ typeId: 'raid' }))
  assert.ok(issues.some((i) => i.message.includes('Unknown encounter type')))
}

{
  const issues = validateEncounter(pipeline(), encounter({ moduleId: 'nope' }))
  assert.ok(issues.some((i) => i.message.includes('Unknown encounter module')))
}

{
  const p = pipeline()
  p.games[0].settings!.modules = [{ id: 'pad', label: 'Pad', typeIds: ['puzzle'] }]
  const issues = validateEncounter(p, encounter({ typeId: 'battle', moduleId: 'pad' }))
  assert.ok(issues.some((i) => i.message.includes('does not support type')))
}

{
  const issues = validateEncounter(pipeline(), encounter({ tuningProfileId: 'missing' }))
  assert.ok(issues.some((i) => i.message.includes('tuningProfiles')))
}

{
  const issues = validateEncounter(
    pipeline(),
    encounter({
      stars: [
        { id: 's1', label: 'A', kind: 'win' },
        { id: 's2', label: 'B', kind: 'win' },
        { id: 's3', label: 'C', kind: 'win' },
        { id: 's4', label: 'D', kind: 'win' }
      ]
    })
  )
  assert.ok(issues.some((i) => i.message.includes('at most 3')))
}

{
  const issues = validateEncounter(
    pipeline(),
    encounter({ stars: [{ id: 's1', label: 'Nope', kind: 'perfect' }] })
  )
  assert.ok(issues.some((i) => i.message.includes('not in this module')))
}

{
  const ok = validateEncounter(pipeline(), encounter({ sceneId: 'Boss Fight', tuningProfileId: 'Boss Tune' }))
  assert.equal(ok.filter((i) => i.level === 'error').length, 0)
}

{
  const issues = validateRegion(pipeline(), region({ backgroundAssetId: 'logo-a' }))
  assert.ok(issues.some((i) => i.message.includes('background-based')))
}

{
  const issues = validateRegion(pipeline(), region({ spawn: 'missing' }))
  assert.ok(issues.some((i) => i.message.includes("Unknown anchor 'missing'")))
}

{
  const issues = validateRegion(pipeline(), region({ anchors: [{ id: 'a-start', pos: [1.2, 0] }] }))
  assert.ok(issues.some((i) => i.message.includes('0..1')))
}

{
  const issues = validateRegion(
    pipeline(),
    region({
      edges: [{ from: 'a-start', to: 'a-gate', requires: 'hoverboard' }]
    })
  )
  assert.ok(issues.some((i) => i.level === 'warning' && i.message.includes('ignored')))
  assert.equal(issues.filter((i) => i.level === 'error').length, 0)
}

{
  const { result } = applyContentBundleIsolated(pipeline(), 'game-a', {
    worlds: [{ key: 'world-1', name: 'World 1', order: 1 }],
    stages: [{ key: 'stage-gate', worldId: '@world-1', name: 'The Gate', order: 1 }]
  })
  assert.equal(result.creates.length, 0)
  assert.equal(result.updates.length, 0)
  assert.ok(result.unchanged.length >= 2)
}

{
  let threw = false
  try {
    applyContentBundleIsolated(pipeline(), 'game-a', {
      encounters: [
        {
          key: 'bad',
          stageId: '@stage-gate',
          name: 'X',
          typeId: 'battle',
          moduleId: 'pad',
          stars: [
            { id: 's1', label: 'A', kind: 'win' },
            { id: 's2', label: 'B', kind: 'win' },
            { id: 's3', label: 'C', kind: 'win' },
            { id: 's4', label: 'D', kind: 'win' }
          ]
        }
      ]
    })
  } catch (err) {
    threw = true
    assert.ok(err instanceof ContentApplyError)
  }
  assert.equal(threw, true)
}

{
  const { pipeline: next, result } = applyContentBundleIsolated(pipeline(), 'game-a', {
    regions: [
      {
        key: 'region-gate-approach',
        stageId: '@stage-gate',
        name: 'Gate approach',
        backgroundAssetId: 'bg-a',
        anchors: [
          { id: 'a-start', pos: [0.12, 0.78] },
          { id: 'a-gate', pos: [0.8, 0.7] }
        ],
        edges: [['a-start', 'a-gate']],
        spawn: 'a-start',
        hotspots: [{ id: 'hs-gate', anchor: 'a-gate', prompt: 'Hack the gate' }],
        exits: []
      }
    ],
    encounters: [
      {
        key: 'enc-boss',
        stageId: '@stage-gate',
        name: 'Boss',
        typeId: 'battle',
        moduleId: 'pad',
        sceneId: 'Boss Fight',
        tuningProfileId: 'Boss Tune',
        stars: [
          { id: 's1', label: 'Win', kind: 'win' },
          { id: 's2', label: 'No misses', kind: 'noMisses' }
        ]
      }
    ]
  })
  assert.equal(result.creates.length, 2)
  assert.ok(result.aliasMap['@region-gate-approach'])
  const enc = next.encounters!.find((e) => e.key === 'enc-boss')!
  assert.equal(enc.sceneId, 'scene-a')
  assert.equal(enc.tuningProfileId, 'tune-a')
  assert.equal(enc.difficultyProfileId, undefined)
}

{
  const p = pipeline()
  p.worlds![0].map = {
    backgroundAssetId: 'bg-map',
    nodes: [{ id: 'n-gate', stageId: 'stage-a', pos: [0.18, 0.72] }],
    paths: [],
    startNodeId: 'n-gate'
  }
  const ok = validateWorld(p, p.worlds![0])
  assert.equal(ok.filter((i) => i.level === 'error').length, 0)
}

{
  const p = pipeline()
  p.worlds![0].map = {
    backgroundAssetId: 'bg-map',
    nodes: [
      { id: 'n-gate', stageId: 'stage-a', pos: [0.18, 0.72] },
      { id: 'n-dup', stageId: 'stage-a', pos: [0.4, 0.4] }
    ],
    paths: [],
    startNodeId: 'n-gate'
  }
  const issues = validateWorld(p, p.worlds![0])
  assert.ok(issues.some((i) => i.message.includes('already has a map node')))
}

{
  const p = pipeline()
  p.stages!.push(
    stage({ id: 'stage-b', key: 'stage-b', name: 'B', worldId: 'world-a', unlockAfter: ['stage-a'] })
  )
  p.stages![0].unlockAfter = ['stage-b']
  const issues = validateStage(p, p.stages![0])
  assert.ok(issues.some((i) => i.message.includes('cycle')))
}

{
  const p = pipeline()
  p.worlds![0].map = {
    backgroundAssetId: 'bg-map',
    nodes: [{ id: 'n-gate', stageId: 'stage-a', pos: [0.18, 0.72] }],
    paths: [],
    startNodeId: 'n-gate'
  }
  p.stages![0].unlockAfter = ['missing']
  const issues = validateStage(p, p.stages![0])
  assert.ok(issues.some((i) => i.message.includes('start node')))
}

{
  const issues = validateRegion(
    pipeline(),
    region({
      hotspots: [{ id: 'hs-gate', anchor: 'a-gate', prompt: 'Hack', encounterId: 'nope' }]
    })
  )
  assert.ok(issues.some((i) => i.message.includes('was not found')))
}

{
  const issues = validateRegion(
    pipeline(),
    region({
      exits: [{ id: 'x-both', anchor: 'a-start', toRegionId: 'r1', toWorldMap: true }]
    })
  )
  assert.ok(issues.some((i) => i.message.includes('never both')))
}

{
  const p = pipeline()
  p.encounters = [encounter({ id: 'e-gate', key: 'enc-gate', name: 'Boss' })]
  p.regions = [
    region({
      id: 'r-entry',
      key: 'region-gate-approach',
      hotspots: [{ id: 'hs-gate', anchor: 'a-gate', prompt: 'Hack', encounterId: 'e-gate' }],
      exits: [{ id: 'x-map', anchor: 'a-start', toWorldMap: true }]
    })
  ]
  p.stages![0].entryRegionId = 'r-entry'
  p.stages![0].entryAnchor = 'a-start'
  p.stages![0].clearedBy = ['e-gate']
  p.worlds![0].map = {
    backgroundAssetId: 'bg-map',
    nodes: [{ id: 'n-gate', stageId: 'stage-a', pos: [0.18, 0.72] }],
    paths: [],
    startNodeId: 'n-gate'
  }
  const flow = buildWorldFlow(p, p.worlds![0])
  assert.equal(flow.issues.filter((i) => i.level === 'error').length, 0)
  const labels = JSON.stringify(flow.tree)
  assert.ok(labels.includes('The Gate'))
  assert.ok(labels.includes('Hack') || labels.includes('Boss'))
}

{
  const { pipeline: next } = applyContentBundleIsolated(pipeline(), 'game-a', {
    worlds: [
      {
        key: 'world-1',
        name: 'World 1',
        order: 1,
        map: {
          backgroundAssetId: 'World 1 map',
          nodes: [{ id: 'n-gate', stageId: '@stage-gate', pos: [0.18, 0.72] }],
          paths: [],
          startNodeId: 'n-gate'
        }
      }
    ],
    stages: [
      {
        key: 'stage-gate',
        worldId: '@world-1',
        name: 'The Gate',
        order: 1,
        entryRegionId: '@region-gate-approach',
        entryAnchor: 'a-start',
        clearedBy: ['@enc-boss']
      }
    ],
    regions: [
      {
        key: 'region-gate-approach',
        stageId: '@stage-gate',
        name: 'Gate approach',
        backgroundAssetId: 'Alley',
        anchors: [
          { id: 'a-start', pos: [0.12, 0.78] },
          { id: 'a-gate', pos: [0.8, 0.7] }
        ],
        edges: [['a-start', 'a-gate']],
        spawn: 'a-start',
        hotspots: [{ id: 'hs-gate', anchor: 'a-gate', prompt: 'Hack', encounterId: '@enc-boss' }],
        exits: [{ id: 'x-map', anchor: 'a-start', toWorldMap: true }]
      }
    ],
    encounters: [
      {
        key: 'enc-boss',
        stageId: '@stage-gate',
        name: 'Boss',
        typeId: 'battle',
        moduleId: 'pad'
      }
    ]
  })
  const w = next.worlds!.find((x) => x.key === 'world-1')!
  assert.equal(w.map?.startNodeId, 'n-gate')
  assert.equal(w.map?.nodes[0].stageId, 'stage-a')
  const st = next.stages!.find((s) => s.key === 'stage-gate')!
  const region = next.regions!.find((r) => r.key === 'region-gate-approach')!
  const enc = next.encounters!.find((e) => e.key === 'enc-boss')!
  assert.equal(st.entryRegionId, region.id)
  assert.equal(region.hotspots[0].encounterId, enc.id)
  assert.equal(region.exits[0].toWorldMap, true)
}

console.log('\n✓ worldContent validate tests passed')
