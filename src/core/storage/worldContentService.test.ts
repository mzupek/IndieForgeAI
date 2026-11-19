/**
 * 1c world content service. Isolated tmpdir only.
 * Run: npx tsx --tsconfig tsconfig.node.json src/core/storage/worldContentService.test.ts
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, readdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import { emptyGameSettings } from '../../shared/studio/schema'
import { readStudio } from './studioStorage'
import {
  applyContent,
  createEncounter,
  createRegion,
  createStage,
  createWorld,
  exportContent,
  listWorlds,
  removeWorld
} from './worldContentService'
import { addEncounterModule } from './gameSettingsService'

const now = '2026-01-01T00:00:00.000Z'

function fixture() {
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    assetPipeline: {
      schemaVersion: 2,
      id: 'studio',
      name: 'Studio',
      description: '',
      games: [
        {
          id: 'game-a',
          name: 'Game A',
          engine: 'unity' as const,
          exportRoot: './exports/a',
          settings: {
            ...emptyGameSettings(),
            modules: [{ id: 'pad', label: 'Pad', typeIds: ['battle'], starKinds: ['win', 'noMisses'] }]
          },
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'game-b',
          name: 'Game B',
          engine: 'godot' as const,
          exportRoot: './exports/b',
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
          name: 'Gate Drone Encounter',
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
          stage: 'MVP' as const,
          pillars: [],
          puzzleCore: '',
          storySynopsis: '',
          cast: [],
          linkedAssets: { poses: [], clips: [], presets: [] },
          themeSlots: [],
          interactions: [],
          tuningProfiles: [{ id: 'tune-a', name: 'Gate Drone Encounter', params: { hp: 20 } }],
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
          key: 'bg-gate-approach',
          name: 'Gate approach',
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
      worlds: [],
      stages: [],
      encounters: [],
      regions: [],
      createdAt: now,
      updatedAt: now
    }
  }
}

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = join(tmpdir(), `forge-1c-world-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'studio.json'), JSON.stringify(fixture(), null, 2) + '\n')
  return fn(dir)
}

async function hashOf(path: string): Promise<string> {
  const { createHash } = await import('crypto')
  const buf = await readFile(path)
  return createHash('sha256').update(buf).digest('hex')
}

async function main() {
await withDir(async (dir) => {
  const world = await createWorld('game-a', { name: 'World 1', key: 'world-1', order: 1 }, { dataDirOverride: dir })
  const stage = await createStage(
    'game-a',
    { worldId: '@world-1', name: 'The Gate', key: 'stage-gate', order: 1 },
    { dataDirOverride: dir }
  )
  assert.equal(world.record.key, 'world-1')
  assert.equal(stage.record.worldId, world.record.id)

  await assert.rejects(
    () =>
      createStage('game-b', { worldId: world.record.id, name: 'Nope', order: 1 }, { dataDirOverride: dir }),
    /belongs to game|World/
  )

  const listed = await listWorlds('game-a', dir)
  assert.equal(listed.length, 1)
  const other = await listWorlds('game-b', dir)
  assert.equal(other.length, 0)

  await assert.rejects(() => removeWorld('game-a', '@world-1', { dataDirOverride: dir }), /in use/)
})

await withDir(async (dir) => {
  const studioPath = join(dir, 'studio.json')
  const before = await hashOf(studioPath)
  const dry = await applyContent(
    'game-a',
    {
      worlds: [{ key: 'world-1', name: 'World 1', order: 1 }]
    },
    { dataDirOverride: dir, dryRun: true }
  )
  assert.equal(dry.written, false)
  assert.equal(dry.creates.length, 1)
  assert.equal(await hashOf(studioPath), before)

  const first = await applyContent(
    'game-a',
    {
      worlds: [{ key: 'world-1', name: 'World 1', order: 1 }],
      stages: [{ key: 'stage-gate', worldId: '@world-1', name: 'The Gate', order: 1 }],
      regions: [
        {
          key: 'region-gate-approach',
          stageId: '@stage-gate',
          name: 'Gate approach',
          backgroundAssetId: '@bg-gate-approach',
          anchors: [
            { id: 'a-start', pos: [0.12, 0.78] },
            { id: 'a-gate', pos: [0.8, 0.7] }
          ],
          edges: [['a-start', 'a-gate']],
          spawn: 'a-start',
          hotspots: [{ id: 'hs-gate', anchor: 'a-gate', prompt: 'Hack' }],
          exits: []
        }
      ],
      encounters: [
        {
          key: 'enc-gate-drone',
          stageId: '@stage-gate',
          name: 'Gate Drone',
          typeId: 'battle',
          moduleId: 'pad',
          sceneId: 'Gate Drone Encounter',
          tuningProfileId: 'Gate Drone Encounter',
          stars: [{ id: 's1', label: 'Win', kind: 'win' }]
        }
      ]
    },
    { dataDirOverride: dir }
  )
  assert.equal(first.written, true)
  assert.equal(first.creates.length, 4)
  assert.ok(first.aliasMap['@world-1'])

  const afterFirst = await hashOf(studioPath)
  const again = await applyContent(
    'game-a',
    {
      worlds: [{ key: 'world-1', name: 'World 1', order: 1 }],
      stages: [{ key: 'stage-gate', worldId: '@world-1', name: 'The Gate', order: 1 }],
      regions: [
        {
          key: 'region-gate-approach',
          stageId: '@stage-gate',
          name: 'Gate approach',
          backgroundAssetId: '@bg-gate-approach',
          anchors: [
            { id: 'a-start', pos: [0.12, 0.78] },
            { id: 'a-gate', pos: [0.8, 0.7] }
          ],
          edges: [['a-start', 'a-gate']],
          spawn: 'a-start',
          hotspots: [{ id: 'hs-gate', anchor: 'a-gate', prompt: 'Hack' }],
          exits: []
        }
      ],
      encounters: [
        {
          key: 'enc-gate-drone',
          stageId: '@stage-gate',
          name: 'Gate Drone',
          typeId: 'battle',
          moduleId: 'pad',
          sceneId: 'Gate Drone Encounter',
          tuningProfileId: 'Gate Drone Encounter',
          stars: [{ id: 's1', label: 'Win', kind: 'win' }]
        }
      ]
    },
    { dataDirOverride: dir }
  )
  assert.equal(again.creates.length, 0)
  assert.equal(again.updates.length, 0)
  assert.equal(again.written, false)
  assert.equal(await hashOf(studioPath), afterFirst)

  const failHash = await hashOf(studioPath)
  await assert.rejects(
    () =>
      applyContent(
        'game-a',
        {
          encounters: [
            {
              key: 'enc-bad',
              stageId: '@stage-gate',
              name: 'Bad',
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
        },
        { dataDirOverride: dir }
      ),
    /at most 3/
  )
  assert.equal(await hashOf(studioPath), failHash)

  await applyContent(
    'game-b',
    { worlds: [{ key: 'world-1', name: 'Other World', order: 1 }] },
    { dataDirOverride: dir }
  )
  const studio = await readStudio(dir)
  const aWorlds = (studio.assetPipeline.worlds || []).filter((w) => w.gameId === 'game-a')
  const bWorlds = (studio.assetPipeline.worlds || []).filter((w) => w.gameId === 'game-b')
  assert.equal(aWorlds.length, 1)
  assert.equal(aWorlds[0].name, 'World 1')
  assert.equal(bWorlds.length, 1)
  assert.equal(bWorlds[0].name, 'Other World')

  const outDir = join(dir, 'export-out')
  const exported = await exportContent('game-a', outDir, { dataDirOverride: dir })
  assert.equal(exported.content.contentSchemaVersion, 1)
  const written = JSON.parse(await readFile(exported.path, 'utf-8'))
  assert.equal(written.worlds.length, 1)
  assert.equal(written.gameId, 'game-a')
  const files = await readdir(outDir)
  assert.deepEqual(files, ['content.json'])
})

await withDir(async (dir) => {
  await addEncounterModule(
    'game-b',
    { id: 'other_mod', label: 'Other', typeIds: ['puzzle'] },
    { dataDirOverride: dir }
  )
  const { record } = await createWorld('game-a', { name: 'W', key: 'w' }, { dataDirOverride: dir })
  await createStage('game-a', { worldId: record.id, name: 'S', key: 's' }, { dataDirOverride: dir })
  await assert.rejects(
    () =>
      createEncounter(
        'game-a',
        { stageId: '@s', name: 'E', typeId: 'battle', moduleId: 'other_mod' },
        { dataDirOverride: dir }
      ),
    /Unknown encounter module/
  )
  await createRegion(
    'game-a',
    {
      name: 'R',
      backgroundAssetId: '@bg-gate-approach',
      anchors: [{ id: 'a', pos: [0.5, 0.5] }],
      edges: [{ from: 'a', to: 'a', requires: 'hover', hint: 'need ride' }],
      spawn: 'a',
      hotspots: [],
      exits: [],
      stageId: '@s'
    },
    { dataDirOverride: dir }
  )
})

console.log('\n✓ worldContentService tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
