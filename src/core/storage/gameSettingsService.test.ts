/**
 * 1b game/character slots and asset categories. Isolated tmpdir only.
 * Example keys ride/ride_boost are test-only.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, stat, writeFile, readdir } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import { emptyGameSettings } from '../../shared/studio/schema'
import { readStudio } from './studioStorage'
import { generateManifest } from './exportService'
import {
  addCharacterPoseSlot,
  addEncounterModule,
  addGameAssetCategory,
  addGamePoseSlot,
  addModuleParamSpec,
  listCharacterPoseSlots,
  listEncounterModules,
  listGameAssetCategories,
  listGamePoseSlots,
  removeCharacterPoseSlot,
  removeGameAssetCategory,
  removeGamePoseSlot,
  removeModuleParamSpec,
  updateEncounterModule
} from './gameSettingsService'

const now = '2026-01-01T00:00:00.000Z'

function v2Studio() {
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
          settings: emptyGameSettings(),
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
      characters: [
        {
          id: 'char-hero',
          gameId: 'game-a',
          name: 'Hero',
          role: 'player',
          tags: [],
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'char-other',
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
          characterId: 'char-hero',
          slot: 'ready',
          file: '/tmp/ready.png',
          status: 'approved' as const,
          source: 'import' as const,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'pose-success',
          characterId: 'char-hero',
          slot: 'success',
          file: '/tmp/success.png',
          status: 'approved' as const,
          source: 'import' as const,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'pose-hurt',
          characterId: 'char-hero',
          slot: 'hurt',
          file: '/tmp/hurt.png',
          status: 'approved' as const,
          source: 'import' as const,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'pose-win',
          characterId: 'char-hero',
          slot: 'win',
          file: '/tmp/win.png',
          status: 'approved' as const,
          source: 'import' as const,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'pose-defeat',
          characterId: 'char-hero',
          slot: 'defeat',
          file: '/tmp/defeat.png',
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
  const dir = join(tmpdir(), `forge-1b-settings-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  try {
    await writeFile(join(dir, 'studio.json'), JSON.stringify(v2Studio(), null, 2) + '\n')
    return await fn(dir)
  } finally {
    await import('fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true }))
  }
}

async function fileHash(path: string): Promise<string> {
  const buf = await readFile(path)
  return createHash('sha256').update(buf).digest('hex')
}

async function snapshot(dir: string) {
  const studioPath = join(dir, 'studio.json')
  const names = (await readdir(dir)).sort()
  const st = await stat(studioPath)
  return { names, mtimeMs: st.mtimeMs, hash: await fileHash(studioPath) }
}

async function testLayeredSlotsAndIsolation() {
  await withDir(async (dir) => {
    await addGamePoseSlot('game-a', { key: 'ride', label: 'Ride' }, { dataDirOverride: dir })
    const listedA = await listGamePoseSlots('game-a', dir)
    const listedB = await listGamePoseSlots('game-b', dir)
    assert.equal(listedA.game.some((s) => s.key === 'ride'), true)
    assert.equal(listedB.game.some((s) => s.key === 'ride'), false)

    await addCharacterPoseSlot(
      'char-hero',
      'game-a',
      { key: 'ride_boost', label: 'Ride Boost' },
      { dataDirOverride: dir }
    )
    const charSlots = await listCharacterPoseSlots('char-hero', 'game-a', dir)
    assert.equal(charSlots.character.some((s) => s.key === 'ride_boost'), true)
    assert.equal(charSlots.game.some((s) => s.key === 'ride'), true)

    await assert.rejects(
      () => addCharacterPoseSlot('char-hero', 'game-a', { key: 'ride', label: 'Dup' }, { dataDirOverride: dir }),
      /already exists/
    )
    await assert.rejects(
      () => addGamePoseSlot('game-a', { key: 'ready', label: 'Ready' }, { dataDirOverride: dir }),
      /already exists/
    )
    await addCharacterPoseSlot(
      'char-other',
      'game-b',
      { key: 'ride', label: 'Ride' },
      { dataDirOverride: dir }
    )
    const other = await listCharacterPoseSlots('char-other', 'game-b', dir)
    assert.equal(other.game.length, 0)
    assert.equal(other.character.some((s) => s.key === 'ride'), true)
  })
  console.log('✓ layered slots + other-game isolation + duplicate refuse')
}

async function testInUseRefuse() {
  await withDir(async (dir) => {
    await addGamePoseSlot('game-a', { key: 'ride', label: 'Ride' }, { dataDirOverride: dir })
    const studioPath = join(dir, 'studio.json')
    const studio = JSON.parse(await readFile(studioPath, 'utf-8'))
    studio.assetPipeline.poses.push({
      id: 'pose-ride',
      characterId: 'char-hero',
      slot: 'ride',
      file: '/tmp/ride.png',
      status: 'draft',
      source: 'import',
      createdAt: now,
      updatedAt: now
    })
    await writeFile(studioPath, JSON.stringify(studio, null, 2) + '\n')

    await assert.rejects(
      () => removeGamePoseSlot('game-a', 'ride', { dataDirOverride: dir }),
      /in use by 1 pose\(s\): Hero ride \(pose-ride\)/
    )

    await addGameAssetCategory('game-a', { key: 'sigil', label: 'Sigil' }, { dataDirOverride: dir })
    const studio2 = JSON.parse(await readFile(studioPath, 'utf-8'))
    studio2.assetPipeline.visualAssets.push({
      id: 'asset-1',
      gameId: 'game-a',
      name: 'Hero Sigil',
      category: 'sigil',
      tags: [],
      defaultStateId: null,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    })
    await writeFile(studioPath, JSON.stringify(studio2, null, 2) + '\n')

    await assert.rejects(
      () => removeGameAssetCategory('game-a', 'sigil', { dataDirOverride: dir }),
      /in use by 1 asset\(s\): Hero Sigil \(asset-1\)/
    )

    await addGameAssetCategory('game-a', { key: 'banner', label: 'Banner' }, { dataDirOverride: dir })
    const removed = await removeGameAssetCategory('game-a', 'banner', { dataDirOverride: dir })
    assert.equal(removed.removed, 'banner')
  })
  console.log('✓ in-use remove refused with users; unused category removes')
}

async function testCategoriesAndBackground() {
  await withDir(async (dir) => {
    const listed = await listGameAssetCategories('game-a', dir)
    assert.equal(listed.core.some((c) => c.key === 'background'), true)
    await addGameAssetCategory(
      'game-a',
      { key: 'map', label: 'Map', base: 'background' },
      { dataDirOverride: dir }
    )
    const after = await listGameAssetCategories('game-a', dir)
    assert.equal(after.game.find((c) => c.key === 'map')?.base, 'background')
    const b = await listGameAssetCategories('game-b', dir)
    assert.equal(b.game.length, 0)
    await assert.rejects(
      () => addGameAssetCategory('game-a', { key: 'logo', label: 'Logo' }, { dataDirOverride: dir }),
      /already exists/
    )
  })
  console.log('✓ background built-in + per-game category')
}

async function testReadPathNoWriteAndDryRun() {
  await withDir(async (dir) => {
    await addGamePoseSlot('game-a', { key: 'ride', label: 'Ride' }, { dataDirOverride: dir })
    const before = await snapshot(dir)
    await listGamePoseSlots('game-a', dir)
    await listGameAssetCategories('game-a', dir)
    await listCharacterPoseSlots('char-hero', 'game-a', dir)
    await readStudio(dir)
    const afterRead = await snapshot(dir)
    assert.equal(afterRead.hash, before.hash)
    assert.equal(afterRead.mtimeMs, before.mtimeMs)
    assert.deepEqual(afterRead.names, before.names)

    await addGamePoseSlot(
      'game-a',
      { key: 'portrait', label: 'Portrait' },
      { dataDirOverride: dir, dryRun: true }
    )
    const afterDry = await snapshot(dir)
    assert.equal(afterDry.hash, before.hash)
    const listed = await listGamePoseSlots('game-a', dir)
    assert.equal(listed.game.some((s) => s.key === 'portrait'), false)
  })
  console.log('✓ list/read and --dry-run do not write')
}

async function testExportCompatibility() {
  await withDir(async (dir) => {
    const game = (await readStudio(dir)).assetPipeline.games.find((g) => g.id === 'game-a')!
    const before = await generateManifest(game, dir)
    assert.equal(before.schemaVersion, 2)
    const poseSlots = before.characters[0].poses.map((p) => p.slot).sort()
    assert.deepEqual(poseSlots, ['defeat', 'hurt', 'ready', 'success', 'win'])
    const poseFiles = before.characters[0].poses.map((p) => p.file).sort()
    assert.deepEqual(poseFiles, [
      'poses/char-hero_defeat.png',
      'poses/char-hero_hurt.png',
      'poses/char-hero_ready.png',
      'poses/char-hero_success.png',
      'poses/char-hero_win.png'
    ])

    await addGamePoseSlot('game-a', { key: 'ride', label: 'Ride' }, { dataDirOverride: dir })
    const studioPath = join(dir, 'studio.json')
    const studio = JSON.parse(await readFile(studioPath, 'utf-8'))
    studio.assetPipeline.poses.push({
      id: 'pose-ride',
      characterId: 'char-hero',
      slot: 'ride',
      file: '/tmp/ride.png',
      status: 'approved',
      source: 'import',
      createdAt: now,
      updatedAt: now
    })
    await writeFile(studioPath, JSON.stringify(studio, null, 2) + '\n')
    const afterGame = (await readStudio(dir)).assetPipeline.games.find((g) => g.id === 'game-a')!
    const after = await generateManifest(afterGame, dir)
    const originalStill = after.characters[0].poses.filter((p) => p.slot !== 'ride')
    assert.deepEqual(
      originalStill.map((p) => ({ slot: p.slot, file: p.file })).sort((a, b) => a.slot.localeCompare(b.slot)),
      before.characters[0].poses.map((p) => ({ slot: p.slot, file: p.file })).sort((a, b) => a.slot.localeCompare(b.slot))
    )
    const extra = after.characters[0].poses.find((p) => p.slot === 'ride')
    assert.equal(extra?.file, 'poses/char-hero_ride.png')
    assert.equal(after.schemaVersion, 2)
  })
  console.log('✓ export manifest v2 additive custom slots; core poses unchanged')
}

async function testWinConditions() {
  await withDir(async (dir) => {
    await addEncounterModule(
      'game-a',
      { id: 'pad', label: 'Pad', typeIds: ['battle'], winConditions: ['locks'] },
      { dataDirOverride: dir }
    )
    const listed = await listEncounterModules('game-a', dir)
    assert.deepEqual(listed.find((m) => m.id === 'pad')?.winConditions, ['locks'])

    const updated = await updateEncounterModule(
      'game-a',
      'pad',
      { winConditions: ['locks', 'enemyHp', 'either'] },
      { dataDirOverride: dir }
    )
    assert.deepEqual(updated.winConditions, ['locks', 'enemyHp', 'either'])

    await assert.rejects(
      () =>
        updateEncounterModule(
          'game-a',
          'pad',
          { winConditions: ['locks', 'locks'] },
          { dataDirOverride: dir }
        ),
      /duplicate winCondition/
    )

    const b = await listEncounterModules('game-b', dir)
    assert.equal(b.length, 0)
  })
  console.log('✓ module winConditions unique + isolated')
}

async function testParamSpecs() {
  await withDir(async (dir) => {
    await addEncounterModule(
      'game-a',
      { id: 'mini', label: 'Mini', typeIds: ['minigame'] },
      { dataDirOverride: dir }
    )
    const added = await addModuleParamSpec(
      'game-a',
      'mini',
      { key: 'lanes', type: 'int', min: 1, max: 4, default: 2, required: true },
      { dataDirOverride: dir }
    )
    assert.equal(added.paramSpecs?.[0]?.key, 'lanes')
    assert.equal(added.paramSpecs?.[0]?.type, 'int')
    assert.equal(added.paramSpecs?.[0]?.required, true)

    const kept = await updateEncounterModule('game-a', 'mini', { label: 'Mini game' }, { dataDirOverride: dir })
    assert.equal(kept.paramSpecs?.[0]?.key, 'lanes')

    await assert.rejects(
      () => addModuleParamSpec('game-a', 'mini', { key: 'lanes', type: 'float' }, { dataDirOverride: dir }),
      /already exists/
    )
    await assert.rejects(
      () => addModuleParamSpec('game-a', 'mini', { key: 'mode', type: 'bytes' }, { dataDirOverride: dir }),
      /int, float, bool, enum, string/
    )

    const dry = await addModuleParamSpec(
      'game-a',
      'mini',
      { key: 'mode', type: 'enum', options: ['a', 'b'], default: 'a' },
      { dataDirOverride: dir, dryRun: true }
    )
    assert.equal(dry.paramSpecs?.some((s) => s.key === 'mode'), true)
    const listed = await listEncounterModules('game-a', dir)
    assert.equal(listed.find((m) => m.id === 'mini')?.paramSpecs?.some((s) => s.key === 'mode'), false)

    const withMode = await addModuleParamSpec(
      'game-a',
      'mini',
      { key: 'mode', type: 'enum', options: ['a', 'b'], default: 'a' },
      { dataDirOverride: dir }
    )
    const removed = await removeModuleParamSpec('game-a', 'mini', 'mode', { dataDirOverride: dir })
    assert.equal(removed.paramSpecs?.some((s) => s.key === 'mode'), false)
    assert.equal(withMode.paramSpecs?.some((s) => s.key === 'lanes'), true)

    const b = await listEncounterModules('game-b', dir)
    assert.equal(b.length, 0)
  })
  console.log('✓ module paramSpecs CRUD + isolation + label update keeps specs')
}

async function main() {
  await testLayeredSlotsAndIsolation()
  await testInUseRefuse()
  await testCategoriesAndBackground()
  await testReadPathNoWriteAndDryRun()
  await testExportCompatibility()
  await testWinConditions()
  await testParamSpecs()
  console.log('\n✓ gameSettingsService tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
