/**
 * 2a enemy service. Isolated tmpdir only.
 * Run: npx tsx --tsconfig tsconfig.node.json src/core/storage/enemyService.test.ts
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import { emptyGameSettings } from '../../shared/studio/schema'
import { readStudio } from './studioStorage'
import {
  createEnemy,
  enemyChecklist,
  listEnemies,
  removeEnemy,
  showEnemy,
  updateEnemy
} from './enemyService'
import { applyContent, exportContent } from './worldContentService'
import { updateEncounterModule } from './gameSettingsService'

const now = '2026-01-01T00:00:00.000Z'

function fixture() {
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    extraStudioFlag: true,
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
            modules: [
              {
                id: 'pad',
                label: 'Pad',
                typeIds: ['battle'],
                winConditions: ['locks', 'enemyHp', 'either']
              }
            ]
          },
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'game-b',
          name: 'Game B',
          engine: 'godot' as const,
          exportRoot: './exports/b',
          settings: {
            ...emptyGameSettings(),
            modules: [{ id: 'duel', label: 'Duel', typeIds: ['battle'] }]
          },
          createdAt: now,
          updatedAt: now
        }
      ],
      characters: [
        {
          id: 'char-a',
          gameId: 'game-a',
          key: 'scout',
          name: 'Scout',
          role: 'enemy',
          tags: [],
          poseSlots: [{ key: 'arc', label: 'Arc' }],
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'char-b',
          gameId: 'game-b',
          name: 'Other',
          role: 'npc',
          tags: [],
          createdAt: now,
          updatedAt: now
        }
      ],
      poses: [
        {
          id: 'pose-ready',
          characterId: 'char-a',
          slot: 'ready',
          file: '/tmp/ready.png',
          status: 'approved' as const,
          source: 'import' as const,
          createdAt: now,
          updatedAt: now
        }
      ],
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
      regions: [],
      createdAt: now,
      updatedAt: now
    }
  }
}

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = join(tmpdir(), `forge-2a-enemy-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'studio.json'), JSON.stringify(fixture(), null, 2) + '\n')
  return fn(dir)
}

async function hashOf(path: string): Promise<string> {
  const buf = await readFile(path)
  return createHash('sha256').update(buf).digest('hex')
}

async function main() {
await withDir(async (dir) => {
  const created = await createEnemy(
    'game-a',
    {
      name: 'Scout',
      key: 'scout-en',
      characterId: '@scout',
      moduleId: 'pad',
      winKind: 'locks',
      winParams: { count: 3 },
      poses: { hit: 'hurt', attack: 'arc' }
    },
    { dataDirOverride: dir }
  )
  assert.equal(created.record.winCondition.kind, 'locks')
  assert.equal(created.record.winCondition.params.count, 3)
  assert.equal(created.record.characterId, 'char-a')

  const listed = await listEnemies('game-a', dir)
  assert.equal(listed.length, 1)
  const shown = await showEnemy('game-a', '@scout-en', dir)
  assert.equal(shown.id, created.record.id)

  const other = await listEnemies('game-b', dir)
  assert.equal(other.length, 0)

  await assert.rejects(
    () =>
      createEnemy(
        'game-a',
        { name: 'X', characterId: 'char-b', moduleId: 'pad', winKind: 'locks' },
        { dataDirOverride: dir }
      ),
    /belongs to game 'game-b'/
  )
  await assert.rejects(
    () =>
      createEnemy(
        'game-a',
        { name: 'X', characterId: 'char-a', moduleId: 'pad', winKind: 'nope' },
        { dataDirOverride: dir }
      ),
    /not in module 'pad'/
  )
  await assert.rejects(
    () =>
      updateEnemy(
        'game-a',
        '@scout-en',
        { poses: { idle: 'no_such_slot' } },
        { dataDirOverride: dir }
      ),
    /Pose slot 'no_such_slot'/
  )

  const check = await enemyChecklist('game-a', '@scout-en', dir)
  assert.equal(check.poses.find((p) => p.slot === 'arc')?.have, false)
  assert.equal(check.poses.find((p) => p.slot === 'ready')?.have, true)
  assert.equal(check.usedBy.length, 0)
  assert.equal(check.ready, false)

  await assert.rejects(
    () =>
      updateEncounterModule('game-a', 'pad', { winConditions: ['enemyHp'] }, { dataDirOverride: dir }),
    /win condition 'locks'/
  )

  const studioPath = join(dir, 'studio.json')
  const raw = JSON.parse(await readFile(studioPath, 'utf-8'))
  raw.assetPipeline.enemies[0].futureFlag = 'keep-me'
  await writeFile(studioPath, JSON.stringify(raw, null, 2) + '\n')
  await updateEnemy('game-a', '@scout-en', { name: 'Scout Two' }, { dataDirOverride: dir })
  const after = JSON.parse(await readFile(studioPath, 'utf-8'))
  assert.equal(after.assetPipeline.enemies[0].futureFlag, 'keep-me')
  assert.ok(Array.isArray(after.assetPipeline.worlds))
  assert.ok(Array.isArray(after.assetPipeline.stages))
  assert.ok(Array.isArray(after.assetPipeline.encounters))
  assert.ok(Array.isArray(after.assetPipeline.regions))
  assert.equal(after.extraStudioFlag, true)

  const beforeDry = await hashOf(studioPath)
  await updateEnemy('game-a', '@scout-en', { name: 'Dry' }, { dataDirOverride: dir, dryRun: true })
  assert.equal(await hashOf(studioPath), beforeDry)

  const exported = await exportContent('game-a', join(dir, 'export'), { dataDirOverride: dir })
  assert.equal(exported.content.contentSchemaVersion, 1)
  assert.equal(exported.content.enemies.length, 1)
  const bExport = await exportContent('game-b', join(dir, 'export-b'), { dataDirOverride: dir })
  assert.equal(bExport.content.enemies.length, 0)

  const applied = await applyContent(
    'game-a',
    {
      enemies: [
        {
          key: 'scout-en',
          name: 'Scout Two',
          characterId: '@scout',
          moduleId: 'pad',
          winCondition: { kind: 'locks', params: { count: 3 } },
          poses: { hit: 'hurt' }
        }
      ]
    },
    { dataDirOverride: dir }
  )
  assert.equal(applied.creates.length, 0)
  assert.equal(applied.updates.length + applied.unchanged.length, 1)

  await removeEnemy('game-a', '@scout-en', { dataDirOverride: dir })
  assert.equal((await listEnemies('game-a', dir)).length, 0)

  const studio = await readStudio(dir)
  assert.ok(Array.isArray(studio.assetPipeline.enemies))
})

console.log('\n✓ enemyService tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
