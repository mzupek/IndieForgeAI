/**
 * 2b attack table service. Isolated tmpdir only.
 * Run: npx tsx --tsconfig tsconfig.node.json src/core/storage/attackTableService.test.ts
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import { emptyGameSettings } from '../../shared/studio/schema'
import {
  addAttackTableRow,
  createAttackTable,
  removeAttackTable,
  simulateTable,
  updateAttackTable,
  updateAttackTableRow
} from './attackTableService'
import { createEnemy } from './enemyService'
import { addModuleAttackKind, addModuleCounterKind } from './gameSettingsService'
import { applyContent, exportContent } from './worldContentService'

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
            modules: [{ id: 'pad', label: 'Pad', typeIds: ['battle'], winConditions: ['locks'] }]
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
          poseSlots: [{ key: 'attack_arc', label: 'Arc' }],
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
      regions: [],
      enemies: [],
      attackTables: [],
      createdAt: now,
      updatedAt: now
    }
  }
}

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = join(tmpdir(), `forge-2b-table-${randomUUID()}`)
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
    await addModuleAttackKind('game-a', 'pad', { key: 'damage', label: 'Damage' }, { dataDirOverride: dir })
    await addModuleAttackKind(
      'game-a',
      'pad',
      { key: 'extendPattern', label: 'Extend', params: [{ key: 'by', type: 'number', min: 1, max: 3 }] },
      { dataDirOverride: dir }
    )
    await addModuleCounterKind('game-a', 'pad', { key: 'perfectRound', label: 'Perfect' }, { dataDirOverride: dir })

    const created = await createAttackTable(
      'game-a',
      { name: 'Gate pattern', key: 'gate', moduleId: 'pad', selection: 'weighted', noRepeatInARow: true, skipFinalRound: true },
      { dataDirOverride: dir }
    )
    assert.equal(created.record.key, 'gate')
    assert.equal(created.record.rows.length, 0)

    await addAttackTableRow(
      'game-a',
      '@gate',
      { id: 'taser_arc', label: 'Taser Arc', kind: 'damage', weight: 60, damage: 8, counterKind: 'perfectRound', counterResult: 'cancel' },
      { dataDirOverride: dir }
    )
    await addAttackTableRow(
      'game-a',
      '@gate',
      { id: 'scan_jam', label: 'Scan Jam', kind: 'extendPattern', params: { by: 1 }, weight: 25, minRound: 2, counterKind: 'perfectRound', counterResult: 'cancel' },
      { dataDirOverride: dir }
    )
    await addAttackTableRow(
      'game-a',
      '@gate',
      { id: 'alarm_pulse', label: 'Alarm Pulse', kind: 'damage', weight: 15, damage: 12, minRound: 2, counterKind: 'perfectRound', counterResult: 'halve' },
      { dataDirOverride: dir }
    )

    await assert.rejects(
      () =>
        addAttackTableRow(
          'game-a',
          '@gate',
          { label: 'Bad', kind: 'extendPattern', params: { by: 5 }, weight: 10 },
          { dataDirOverride: dir }
        ),
      /must be <= 3/
    )
    await assert.rejects(
      () =>
        addAttackTableRow('game-a', '@gate', { label: 'Zero', kind: 'damage', weight: 0 }, { dataDirOverride: dir }),
      /greater than 0/
    )

    const sim = await simulateTable('game-a', '@gate', 3, 42, dir)
    assert.equal(sim.results[0]?.picked?.id, 'taser_arc')
    assert.equal(sim.results[2]?.skipped, true)

    await createEnemy(
      'game-a',
      { name: 'Scout', key: 'scout-en', characterId: '@scout', moduleId: 'pad', winKind: 'locks', attackTableId: '@gate' },
      { dataDirOverride: dir }
    )
    await assert.rejects(
      () => removeAttackTable('game-a', '@gate', { dataDirOverride: dir }),
      /in use/
    )

    const studioPath = join(dir, 'studio.json')
    const raw = JSON.parse(await readFile(studioPath, 'utf-8'))
    raw.assetPipeline.attackTables[0].futureFlag = 'keep-me'
    await writeFile(studioPath, JSON.stringify(raw, null, 2) + '\n')
    await updateAttackTable('game-a', '@gate', { name: 'Gate pattern 2' }, { dataDirOverride: dir })
    const after = JSON.parse(await readFile(studioPath, 'utf-8'))
    assert.equal(after.assetPipeline.attackTables[0].futureFlag, 'keep-me')

    const beforeDry = await hashOf(studioPath)
    await updateAttackTableRow(
      'game-a',
      '@gate',
      'taser_arc',
      { weight: 70 },
      { dataDirOverride: dir, dryRun: true }
    )
    assert.equal(await hashOf(studioPath), beforeDry)

    const exported = await exportContent('game-a', join(dir, 'export'), { dataDirOverride: dir })
    assert.equal(exported.content.contentSchemaVersion, 1)
    assert.equal(exported.content.attackTables.length, 1)
    const bExport = await exportContent('game-b', join(dir, 'export-b'), { dataDirOverride: dir })
    assert.equal(bExport.content.attackTables.length, 0)

    const applied = await applyContent(
      'game-a',
      {
        attackTables: [
          {
            key: 'gate',
            name: 'Gate pattern 2',
            moduleId: 'pad',
            selection: 'weighted',
            noRepeatInARow: true,
            skipFinalRound: true,
            rows: after.assetPipeline.attackTables[0].rows
          }
        ]
      },
      { dataDirOverride: dir }
    )
    assert.equal(applied.creates.length, 0)
    assert.ok(applied.updates.length + applied.unchanged.length >= 1)
  })
  console.log('✓ attack table service tests passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
