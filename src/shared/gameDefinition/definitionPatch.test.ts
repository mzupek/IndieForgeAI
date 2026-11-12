import assert from 'node:assert/strict'
import {
  applyDefinitionMergePatch,
  assertCharacterInGame,
  emptyGameDefinition,
  extractSection,
  normalizeSectionName,
  parseParamAssignment,
  parseStage,
  parseMvpType,
  parseMvpStatus,
  addStringItem,
  removeStringItem,
  updateStringItem
} from './definitionPatch'
import type { AssetPipelineProject, GameDefinition } from '../types/assetPipeline'

const now = '2026-01-01T00:00:00.000Z'

function pipeline(): AssetPipelineProject {
  return {
    schemaVersion: 1,
    id: 'studio',
    name: 'Studio',
    description: '',
    games: [{ id: 'game-a', name: 'Game A', engine: 'unity', exportRoot: './exports', createdAt: now, updatedAt: now }],
    characters: [
      { id: 'char-a', gameId: 'game-a', name: 'Hero', role: 'player', tags: [], createdAt: now, updatedAt: now },
      { id: 'char-b', gameId: 'game-b', name: 'Other', role: 'npc', tags: [], createdAt: now, updatedAt: now }
    ],
    poses: [
      {
        id: 'pose-a',
        characterId: 'char-a',
        slot: 'ready',
        file: '/tmp/ready.png',
        status: 'approved',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'pose-b',
        characterId: 'char-b',
        slot: 'ready',
        file: '/tmp/other.png',
        status: 'approved',
        createdAt: now,
        updatedAt: now
      }
    ],
    clips: [
      {
        id: 'clip-a',
        characterId: 'char-a',
        file: '/tmp/intro.mp4',
        moment: 'intro',
        durationSec: 2,
        tags: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    scenePresets: [
      {
        id: 'preset-a',
        type: 'shake',
        params: {},
        tags: [],
        createdAt: now,
        updatedAt: now
      }
    ],
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

function def(): GameDefinition {
  const d = emptyGameDefinition('game-a', now)
  d.id = 'def-a'
  d.interactions = [
    { id: 'int-1', name: 'Hack pad', description: 'old', assetRefs: ['pad'] }
  ]
  d.tuningProfiles = [
    { id: 'tun-1', name: 'Gate', params: { rounds: 10, enemyHP: 20 }, notes: 'simon' }
  ]
  d.mvpBoard = [
    { id: 'mvp-1', item: 'Pad UI', type: 'asset', status: 'needed', notes: 'locks' }
  ]
  d.themeSlots = [{ id: 'theme-1', name: 'HUD', description: 'hud' }]
  d.pillars = ['Readable', 'Fast']
  d.keepCutInvent.keep = ['Arcade loop']
  return d
}

function testSectionAliases() {
  assert.equal(normalizeSectionName('puzzle-core'), 'puzzleCore')
  assert.equal(normalizeSectionName('MVP'), 'mvpBoard')
  assert.equal(normalizeSectionName('tuning'), 'tuningProfiles')
  const d = def()
  assert.equal(extractSection(d, 'stage'), 'MVP')
  assert.deepEqual(extractSection(d, 'pillars'), ['Readable', 'Fast'])
  try {
    normalizeSectionName('nope')
    assert.fail('expected unknown section')
  } catch (err) {
    assert.match((err as Error).message, /Unknown section/)
  }
  console.log('✓ section aliases')
}

function testParamAndEnums() {
  assert.deepEqual(parseParamAssignment('rounds=3'), { key: 'rounds', value: 3 })
  assert.deepEqual(parseParamAssignment('open=true'), { key: 'open', value: true })
  assert.deepEqual(parseParamAssignment('label=lock'), { key: 'label', value: 'lock' })
  assert.equal(parseStage('Beta'), 'Beta')
  assert.equal(parseMvpType('content'), 'content')
  assert.equal(parseMvpStatus('cut'), 'cut')
  try {
    parseStage('Gold')
    assert.fail('expected invalid stage')
  } catch (err) {
    assert.match((err as Error).message, /Invalid stage/)
  }
  console.log('✓ param inference and enums')
}

function testScalarMergeAndDiff() {
  const { next, diff } = applyDefinitionMergePatch(
    def(),
    { stage: 'Beta', puzzleCore: 'Hack the pad', 'story-synopsis': 'Night city' },
    pipeline()
  )
  assert.equal(next.stage, 'Beta')
  assert.equal(next.puzzleCore, 'Hack the pad')
  assert.equal(next.storySynopsis, 'Night city')
  const paths = diff.entries.map((e) => e.path)
  assert.ok(paths.includes('stage'))
  assert.ok(paths.includes('puzzleCore'))
  assert.ok(paths.includes('storySynopsis'))
  console.log('✓ scalar merge + kebab aliases + diff')
}

function testIdentityAndUnknownRejected() {
  try {
    applyDefinitionMergePatch(def(), { id: 'other' }, pipeline())
    assert.fail('expected identity reject')
  } catch (err) {
    assert.match((err as Error).message, /Cannot change 'id'/)
  }
  try {
    applyDefinitionMergePatch(def(), { gameId: 'game-b' }, pipeline())
    assert.fail('expected gameId reject')
  } catch (err) {
    assert.match((err as Error).message, /Cannot change 'gameId'/)
  }
  try {
    applyDefinitionMergePatch(def(), { nonsense: 1 }, pipeline())
    assert.fail('expected unknown field')
  } catch (err) {
    assert.match((err as Error).message, /Unknown patch field/)
  }
  console.log('✓ identity and unknown keys rejected')
}

function testInteractionUpsertDelete() {
  const { next, diff } = applyDefinitionMergePatch(
    def(),
    {
      interactions: [
        { id: 'int-1', description: '3 lock icons' },
        { name: 'Open gate', description: 'all three unlock' }
      ]
    },
    pipeline()
  )
  assert.equal(next.interactions.find((i) => i.id === 'int-1')?.description, '3 lock icons')
  assert.equal(next.interactions.find((i) => i.id === 'int-1')?.name, 'Hack pad')
  const added = next.interactions.find((i) => i.name === 'Open gate')
  assert.ok(added?.id)
  assert.equal(added?.description, 'all three unlock')
  assert.equal(next.interactions.length, 2)
  assert.ok(diff.entries.some((e) => e.op === 'update' && e.path === 'interactions[int-1]'))
  assert.ok(diff.entries.some((e) => e.op === 'add' && String(e.path).startsWith('interactions[')))

  const removed = applyDefinitionMergePatch(
    next,
    { interactions: [{ id: 'int-1', delete: true }] },
    pipeline()
  )
  assert.equal(removed.next.interactions.length, 1)
  assert.equal(removed.next.interactions[0].name, 'Open gate')
  assert.ok(removed.diff.entries.some((e) => e.op === 'remove' && e.path === 'interactions[int-1]'))

  try {
    applyDefinitionMergePatch(def(), { interactions: [{ id: 'missing', delete: true }] }, pipeline())
    assert.fail('expected missing delete')
  } catch (err) {
    assert.match((err as Error).message, /not found/)
  }
  console.log('✓ interaction upsert/add/delete by id')
}

function testStringArrayAddRemove() {
  const { next } = applyDefinitionMergePatch(
    def(),
    {
      pillars: { add: ['Secure'], remove: ['Fast'] },
      keepCutInvent: { invent: { add: ['3-lock pad'] } }
    },
    pipeline()
  )
  assert.deepEqual(next.pillars, ['Readable', 'Secure'])
  assert.deepEqual(next.keepCutInvent.invent, ['3-lock pad'])
  assert.deepEqual(next.keepCutInvent.keep, ['Arcade loop'])
  const replaced = applyDefinitionMergePatch(def(), { pillars: ['One'] }, pipeline())
  assert.deepEqual(replaced.next.pillars, ['One'])
  console.log('✓ string array replace vs add/remove')
}

function testTuningParamMergeAndUnset() {
  const { next } = applyDefinitionMergePatch(
    def(),
    {
      tuningProfiles: [
        { id: 'tun-1', params: { rounds: 3, enemyHP: null, locks: 3 }, notes: '3-lock pad' }
      ]
    },
    pipeline()
  )
  const tun = next.tuningProfiles[0]
  assert.equal(tun.params.rounds, 3)
  assert.equal(tun.params.locks, 3)
  assert.equal('enemyHP' in tun.params, false)
  assert.equal(tun.notes, '3-lock pad')
  console.log('✓ tuning param merge + null unset')
}

function testMvpAndTheme() {
  const { next } = applyDefinitionMergePatch(
    def(),
    {
      mvpBoard: [
        { id: 'mvp-1', status: 'partial' },
        { item: 'Lock icons', type: 'content', status: 'needed' }
      ],
      themeSlots: [{ id: 'theme-1', description: 'three locks' }]
    },
    pipeline()
  )
  assert.equal(next.mvpBoard[0].status, 'partial')
  assert.equal(next.mvpBoard[0].item, 'Pad UI')
  assert.equal(next.mvpBoard[1].type, 'content')
  assert.equal(next.themeSlots[0].description, 'three locks')
  try {
    applyDefinitionMergePatch(def(), { mvpBoard: [{ item: 'x', type: 'fx', status: 'needed' }] }, pipeline())
    assert.fail('expected bad mvp type')
  } catch (err) {
    assert.match((err as Error).message, /Invalid MVP type/)
  }
  console.log('✓ mvp/theme merge + type validation')
}

function testLinkedAssetValidation() {
  const ok = applyDefinitionMergePatch(
    def(),
    {
      cast: { add: ['char-a'] },
      linkedAssets: { poses: { add: ['pose-a'] }, clips: { add: ['clip-a'] }, presets: { add: ['preset-a'] } }
    },
    pipeline()
  )
  assert.deepEqual(ok.next.cast, ['char-a'])
  assert.deepEqual(ok.next.linkedAssets.poses, ['pose-a'])

  try {
    applyDefinitionMergePatch(def(), { cast: ['char-b'] }, pipeline())
    assert.fail('expected foreign character')
  } catch (err) {
    assert.match((err as Error).message, /belongs to game/)
  }
  try {
    applyDefinitionMergePatch(def(), { linkedAssets: { poses: ['pose-b'] } }, pipeline())
    assert.fail('expected foreign pose')
  } catch (err) {
    assert.match((err as Error).message, /belongs to game/)
  }
  try {
    applyDefinitionMergePatch(def(), { linkedAssets: { clips: ['missing-clip'] } }, pipeline())
    assert.fail('expected missing clip')
  } catch (err) {
    assert.match((err as Error).message, /Clip not found/)
  }
  try {
    applyDefinitionMergePatch(def(), { linkedAssets: { presets: ['nope'] } }, pipeline())
    assert.fail('expected missing preset')
  } catch (err) {
    assert.match((err as Error).message, /Preset not found/)
  }
  try {
    assertCharacterInGame(pipeline(), 'game-a', 'missing')
    assert.fail('expected missing character')
  } catch (err) {
    assert.match((err as Error).message, /Character not found/)
  }
  console.log('✓ linked asset same-game validation')
}

function testStringListHelpers() {
  const added = addStringItem(['a'], 'b', 'pillars')
  assert.deepEqual(added, ['a', 'b'])
  const updated = updateStringItem(['a', 'b'], { index: 1 }, 'c', 'pillars')
  assert.deepEqual(updated, ['a', 'c'])
  const byId = updateStringItem(['a', 'b'], { id: 'a' }, 'z', 'pillars')
  assert.deepEqual(byId, ['z', 'b'])
  const removed = removeStringItem(['a', 'b'], { index: 0 }, 'pillars')
  assert.deepEqual(removed, ['b'])
  try {
    addStringItem(['a'], 'a', 'pillars')
    assert.fail('expected duplicate')
  } catch (err) {
    assert.match((err as Error).message, /already contains/)
  }
  try {
    removeStringItem(['a'], { index: 4 }, 'pillars')
    assert.fail('expected range')
  } catch (err) {
    assert.match((err as Error).message, /out of range/)
  }
  console.log('✓ string list index/id helpers')
}

function testNoWriteSemantics() {
  const original = def()
  const snapshot = JSON.stringify(original)
  applyDefinitionMergePatch(original, { stage: 'Release' }, pipeline())
  assert.equal(JSON.stringify(original), snapshot)
  const empty = applyDefinitionMergePatch(original, {}, pipeline())
  assert.equal(empty.diff.entries.length, 0)
  console.log('✓ patch is non-mutating / empty patch is no-op')
}

function run() {
  testSectionAliases()
  testParamAndEnums()
  testScalarMergeAndDiff()
  testIdentityAndUnknownRejected()
  testInteractionUpsertDelete()
  testStringArrayAddRemove()
  testTuningParamMergeAndUnset()
  testMvpAndTheme()
  testLinkedAssetValidation()
  testStringListHelpers()
  testNoWriteSemantics()
  console.log('\nAll definitionPatch tests passed')
}

run()
