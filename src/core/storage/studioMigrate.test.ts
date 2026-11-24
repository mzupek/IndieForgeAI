/**
 * 1a safety: refuse-newer, read path no-write, migrate dry-run / backup / bump / idempotent.
 * Isolated tmpdir only.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, stat, writeFile, readdir } from 'fs/promises'
import { createHash } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { getAssetPipeline, readStudio } from './studioStorage'
import { migrateStudio, migrateStudioDryRun } from './studioMigrate'
import { UnsupportedStudioSchemaError } from '../../shared/studio/schema'

const now = '2026-01-01T00:00:00.000Z'

function v1Fixture() {
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
          id: 'game-test',
          name: 'Test Game',
          engine: 'unity' as const,
          exportRoot: './exports/test',
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

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = join(tmpdir(), `forge-schema-1a-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  try {
    return await fn(dir)
  } finally {
    await import('fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true }))
  }
}

async function fileHash(path: string): Promise<string> {
  const buf = await readFile(path)
  return createHash('sha256').update(buf).digest('hex')
}

async function snapshot(dir: string, studioPath: string) {
  const names = (await readdir(dir)).sort()
  const st = await stat(studioPath)
  const hash = await fileHash(studioPath)
  return { names, mtimeMs: st.mtimeMs, hash }
}

async function testRefuseNewer() {
  await withDir(async (dir) => {
    const studioPath = join(dir, 'studio.json')
    const body = v1Fixture()
    body.schemaVersion = 9
    body.assetPipeline.schemaVersion = 9
    await writeFile(studioPath, JSON.stringify(body, null, 2))
    try {
      await readStudio(dir)
      assert.fail('expected refuse-newer')
    } catch (err) {
      assert.ok(err instanceof UnsupportedStudioSchemaError)
      assert.match((err as Error).message, /schemaVersion 9/)
    }
  })
  console.log('✓ refuse to load schema newer than supported')
}

async function testReadPathNoWrite() {
  await withDir(async (dir) => {
    const studioPath = join(dir, 'studio.json')
    await writeFile(studioPath, JSON.stringify(v1Fixture(), null, 2))
    const before = await snapshot(dir, studioPath)
    await getAssetPipeline(dir)
    const after = await snapshot(dir, studioPath)
    assert.deepEqual(after.names, before.names)
    assert.equal(after.hash, before.hash)
    assert.equal(after.mtimeMs, before.mtimeMs)
  })
  console.log('✓ read path leaves studio.json hash/mtime and folder listing unchanged')
}

async function testMigrateDryRunNoWrite() {
  await withDir(async (dir) => {
    const studioPath = join(dir, 'studio.json')
    await writeFile(studioPath, JSON.stringify(v1Fixture(), null, 2))
    const before = await snapshot(dir, studioPath)
    const result = await migrateStudioDryRun(dir)
    assert.equal(result.dryRun, true)
    assert.equal(result.written, false)
    assert.equal(result.alreadyCurrent, false)
    assert.ok(result.plan.changes.length > 0)
    const after = await snapshot(dir, studioPath)
    assert.deepEqual(after.names, before.names)
    assert.equal(after.hash, before.hash)
    assert.equal(after.mtimeMs, before.mtimeMs)
  })
  console.log('✓ migrate --dry-run writes nothing')
}

async function testMigrateBackupAndBump() {
  await withDir(async (dir) => {
    const studioPath = join(dir, 'studio.json')
    const original = JSON.stringify(v1Fixture(), null, 2)
    await writeFile(studioPath, original)
    const origHash = createHash('sha256').update(original).digest('hex')

    const result = await migrateStudio(dir)
    assert.equal(result.written, true)
    assert.ok(result.backupPath)
    const backup = await readFile(result.backupPath!, 'utf-8')
    assert.equal(createHash('sha256').update(backup).digest('hex'), origHash)
    JSON.parse(backup)

    const next = JSON.parse(await readFile(studioPath, 'utf-8'))
    assert.equal(next.schemaVersion, 2)
    assert.equal(next.assetPipeline.schemaVersion, 2)
    assert.deepEqual(next.assetPipeline.worlds, [])
    assert.deepEqual(next.assetPipeline.stages, [])
    assert.deepEqual(next.assetPipeline.encounters, [])
    assert.deepEqual(next.assetPipeline.regions, [])
    assert.ok(next.assetPipeline.games[0].settings)
    assert.equal(next.assetPipeline.games[0].id, 'game-test')

    const again = await migrateStudio(dir)
    assert.equal(again.alreadyCurrent, true)
    assert.equal(again.written, false)
    const names = await readdir(dir)
    const backups = names.filter((n) => n.startsWith('studio.v1-backup-'))
    assert.equal(backups.length, 1)
  })
  console.log('✓ migrate writes verified backup, bumps to v2, second run is a no-op')
}

async function run() {
  await testRefuseNewer()
  await testReadPathNoWrite()
  await testMigrateDryRunNoWrite()
  await testMigrateBackupAndBump()
  console.log('\nAll studio migrate/fs tests passed')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
