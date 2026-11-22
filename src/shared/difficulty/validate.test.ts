/**
 * 2c difficulty profile validation. Isolated, game-agnostic.
 * Run: npx tsx src/shared/difficulty/validate.test.ts
 */
import assert from 'node:assert/strict'
import { emptyGameSettings } from '../studio/schema'
import type { AssetPipelineProject, DifficultyProfile } from '../types/assetPipeline'
import {
  collectDifficultyEncounterUsers,
  resolveDifficultyRef,
  validateDifficultyProfile
} from './validate'

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

function profile(over: Partial<DifficultyProfile> = {}): DifficultyProfile {
  return {
    id: 'diff-a',
    gameId: 'game-a',
    name: 'Normal',
    heroHpMultiplier: 1,
    playbackSpeed: 1,
    attackWeightScale: 1,
    hintCharges: 1,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...over
  }
}

{
  const issues = validateDifficultyProfile(pipeline(), profile())
  assert.equal(issues.filter((i) => i.level === 'error').length, 0)
}

{
  const issues = validateDifficultyProfile(pipeline(), profile({ heroHpMultiplier: 0 }))
  assert.ok(issues.some((i) => i.path.includes('heroHpMultiplier')))
}

{
  const issues = validateDifficultyProfile(pipeline(), profile({ playbackSpeed: -1 }))
  assert.ok(issues.some((i) => i.path.includes('playbackSpeed')))
}

{
  const issues = validateDifficultyProfile(pipeline(), profile({ hintCharges: 1.5 }))
  assert.ok(issues.some((i) => i.path.includes('hintCharges')))
}

{
  const issues = validateDifficultyProfile(pipeline(), profile({ hintCharges: -1 }))
  assert.ok(issues.some((i) => i.path.includes('hintCharges')))
}

{
  const p = pipeline()
  p.difficultyProfiles = [profile({ key: 'normal', name: 'Normal' })]
  const found = resolveDifficultyRef(p, 'game-a', '@normal')
  assert.equal(found.id, 'diff-a')
  const byName = resolveDifficultyRef(p, 'game-a', 'Normal')
  assert.equal(byName.id, 'diff-a')
}

{
  const p = pipeline()
  p.encounters = [
    {
      id: 'enc-1',
      gameId: 'game-a',
      stageId: 'stage-a',
      name: 'Pad fight',
      typeId: 'battle',
      moduleId: 'pad',
      difficultyProfileId: 'diff-a',
      stars: [],
      order: 1,
      schemaVersion: 2,
      createdAt: now,
      updatedAt: now
    }
  ]
  const users = collectDifficultyEncounterUsers(p, 'diff-a')
  assert.equal(users[0]?.name, 'Pad fight')
}

console.log('\n✓ difficulty validate tests passed')
