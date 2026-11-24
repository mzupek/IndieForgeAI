/**
 * 2c difficulty service. Isolated tmpdir only.
 * Run: npx tsx --tsconfig tsconfig.node.json src/core/storage/difficultyService.test.ts
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import { emptyGameSettings } from '../../shared/studio/schema'
import { readStudio } from './studioStorage'
import {
  createDifficultyProfile,
  removeDifficultyProfile,
  updateDifficultyProfile
} from './difficultyService'
import { createEncounter, createStage, createWorld } from './worldContentService'

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
            modules: [{ id: 'pad', label: 'Pad', typeIds: ['battle'], starKinds: ['win'] }]
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
      difficultyProfiles: [],
      createdAt: now,
      updatedAt: now
    }
  }
}

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = join(tmpdir(), `forge-2c-diff-${randomUUID()}`)
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
    const before = await hashOf(join(dir, 'studio.json'))
    await createDifficultyProfile(
      'game-a',
      { name: 'Story', key: 'story', heroHpMultiplier: 1.5, hintCharges: 3 },
      { dataDirOverride: dir, dryRun: true }
    )
    assert.equal(await hashOf(join(dir, 'studio.json')), before)

    const created = await createDifficultyProfile(
      'game-a',
      { name: 'Story', key: 'story', heroHpMultiplier: 1.5, playbackSpeed: 0.85, attackWeightScale: 0.75, hintCharges: 3 },
      { dataDirOverride: dir }
    )
    assert.equal(created.record.key, 'story')
    assert.equal(created.record.heroHpMultiplier, 1.5)

    await assert.rejects(
      () =>
        createDifficultyProfile('game-a', { name: 'Bad', heroHpMultiplier: 0 }, { dataDirOverride: dir }),
      /greater than 0/
    )
    await assert.rejects(
      () => createDifficultyProfile('game-a', { name: 'Bad', hintCharges: 1.2 }, { dataDirOverride: dir }),
      /integer/
    )

    await updateDifficultyProfile('game-a', '@story', { name: 'Story mode' }, { dataDirOverride: dir })
    const studio = await readStudio(dir)
    assert.equal((studio as { extraStudioFlag?: boolean }).extraStudioFlag, true)
    assert.equal(studio.assetPipeline.difficultyProfiles![0]!.name, 'Story mode')

    await createWorld('game-a', { name: 'World 1', key: 'world-1' }, { dataDirOverride: dir })
    await createStage('game-a', { worldId: '@world-1', name: 'The Gate', key: 'stage-gate' }, { dataDirOverride: dir })
    await createEncounter(
      'game-a',
      {
        stageId: '@stage-gate',
        name: 'Pad fight',
        key: 'enc-pad',
        typeId: 'battle',
        moduleId: 'pad',
        difficultyProfileId: '@story'
      },
      { dataDirOverride: dir }
    )
    await assert.rejects(
      () => removeDifficultyProfile('game-a', '@story', { dataDirOverride: dir }),
      /Pad fight/
    )
  })
}

main()
  .then(() => console.log('\n✓ difficulty service tests passed'))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
