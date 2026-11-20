import assert from 'node:assert/strict'
import {
  STUDIO_SCHEMA_VERSION,
  UnsupportedStudioSchemaError,
  applyStudioV2Migration,
  assertSupportedStudioSchema,
  effectiveSchemaVersion,
  emptyGameSettings,
  normalizeStudioInMemory,
  planStudioV2Migration,
  resolveDefaultGameId,
  type StudioFile,
  validateStudioV2
} from './schema'
import type { AssetPipelineProject } from '../types/assetPipeline'

const now = '2026-01-01T00:00:00.000Z'

function v1Studio(): StudioFile {
  return {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    assetPipeline: {
      schemaVersion: 1,
      id: 'studio',
      name: 'Studio',
      description: '',
      games: [
        {
          id: 'game-a',
          name: 'Game A',
          engine: 'unity',
          exportRoot: './exports/a',
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
      createdAt: now,
      updatedAt: now
    }
  }
}

function testRefuseNewer() {
  const studio = v1Studio()
  studio.schemaVersion = 99
  studio.assetPipeline.schemaVersion = 99
  assert.equal(effectiveSchemaVersion(studio), 99)
  try {
    assertSupportedStudioSchema(studio)
    assert.fail('expected refuse-newer')
  } catch (err) {
    assert.ok(err instanceof UnsupportedStudioSchemaError)
    assert.match((err as Error).message, /schemaVersion 99/)
    assert.match((err as Error).message, /supports up to 2/)
  }
  const ok = v1Studio()
  assertSupportedStudioSchema(ok)
  console.log('✓ refuse schema newer than supported; v1 still readable')
}

function testNormalizeDoesNotBumpVersion() {
  const studio = v1Studio()
  delete (studio.assetPipeline as Partial<AssetPipelineProject>).scenes
  normalizeStudioInMemory(studio)
  assert.equal(studio.schemaVersion, 1)
  assert.equal(studio.assetPipeline.schemaVersion, 1)
  assert.deepEqual(studio.assetPipeline.scenes, [])
  assert.deepEqual(studio.assetPipeline.worlds, [])
  console.log('✓ in-memory normalize fills arrays without bumping version')
}

function testMigratePlanAndApply() {
  const studio = v1Studio()
  const plan = planStudioV2Migration(studio)
  assert.equal(plan.alreadyCurrent, false)
  assert.ok(plan.changes.length >= 2)
  assert.deepEqual(plan.gamesNeedingSettings, ['game-a'])

  const next = applyStudioV2Migration(studio)
  assert.equal(next.schemaVersion, STUDIO_SCHEMA_VERSION)
  assert.equal(next.assetPipeline.schemaVersion, STUDIO_SCHEMA_VERSION)
  assert.deepEqual(next.assetPipeline.worlds, [])
  assert.deepEqual(next.assetPipeline.games[0].settings, emptyGameSettings())
  assert.equal(next.assetPipeline.games[0].id, 'game-a')
  validateStudioV2(next)

  const again = planStudioV2Migration(next)
  assert.equal(again.alreadyCurrent, true)
  assert.equal(again.changes.length, 0)
  console.log('✓ v2 migrate plan/apply; existing game ids preserved; second plan is no-op')
}

function testDefaultGameId() {
  const games = [{ id: 'game-b' }, { id: 'game-a' }]
  assert.equal(resolveDefaultGameId(games, 'game-a'), 'game-a')
  assert.equal(resolveDefaultGameId(games, 'missing'), 'game-b')
  assert.equal(resolveDefaultGameId(games, null), 'game-b')
  assert.equal(resolveDefaultGameId([], 'game-a'), null)
  console.log('✓ default game id: last selected else first available')
}

function run() {
  testRefuseNewer()
  testNormalizeDoesNotBumpVersion()
  testMigratePlanAndApply()
  testDefaultGameId()
  console.log('\nAll studio schema tests passed')
}

run()
