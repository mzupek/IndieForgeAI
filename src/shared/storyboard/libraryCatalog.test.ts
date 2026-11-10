/**
 * Game-scoped Library catalog + pick routing.
 * Run: npx tsx src/shared/storyboard/libraryCatalog.test.ts
 */

import type { AssetPipelineProject } from '../types/assetPipeline'
import {
  buildLibraryCatalog,
  filterLibraryCatalog,
  paginateLibraryCatalog,
  resolveLibraryPick
} from './libraryCatalog'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

const now = '2026-01-01T00:00:00.000Z'

function pipeline(): AssetPipelineProject {
  return {
    schemaVersion: 1,
    id: 'proj',
    name: 'Proj',
    description: '',
    games: [
      { id: 'game-a', name: 'A', engine: 'unity', exportRoot: '.', createdAt: now, updatedAt: now },
      { id: 'game-b', name: 'B', engine: 'godot', exportRoot: '.', createdAt: now, updatedAt: now }
    ],
    characters: [
      {
        id: 'char-a',
        gameId: 'game-a',
        name: 'Hero',
        role: 'player',
        tags: ['lead'],
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
        id: 'pose-idle',
        characterId: 'char-a',
        slot: 'ready',
        file: '/tmp/idle.png',
        status: 'approved',
        createdAt: now,
        updatedAt: now
      }
    ],
    clips: [
      {
        id: 'clip-a',
        moment: 'hit',
        file: '/tmp/hit.mp4',
        durationSec: 1.5,
        tags: ['combat'],
        thumbnail: '/tmp/hit.png',
        createdAt: now,
        updatedAt: now
      }
    ],
    scenePresets: [],
    scenes: [],
    storyboards: [],
    storyboardShots: [],
    exportProfiles: [],
    gameDefinitions: [],
    visualAssets: [
      {
        id: 'vis-door',
        gameId: 'game-a',
        name: 'Door',
        category: 'prop',
        tags: ['gate'],
        defaultStateId: 'st-idle',
        thumbnail: '/tmp/door.png',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'vis-other',
        gameId: 'game-b',
        name: 'Other Prop',
        category: 'prop',
        tags: [],
        defaultStateId: null,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
    assetStates: [
      {
        id: 'st-idle',
        assetId: 'vis-door',
        name: 'Idle',
        file: '/tmp/door-idle.png',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
    fonts: [],
    palettes: [],
    eventDefinitions: [],
    eventBindings: [],
    audioAssets: [
      {
        id: 'aud-1',
        gameId: 'game-a',
        name: 'Beep',
        kind: 'sfx',
        tags: [],
        file: '/tmp/beep.wav',
        durationSec: 0.4,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  }
}

function testGameScopeAndKinds(): void {
  const items = buildLibraryCatalog(pipeline(), 'game-a')
  const kinds = items.map((i) => i.kind).sort()
  assert(items.some((i) => i.kind === 'character' && i.name === 'Hero'), 'character')
  assert(items.some((i) => i.kind === 'pose' && i.poseId === 'pose-idle'), 'pose')
  assert(items.some((i) => i.kind === 'clip' && i.clipId === 'clip-a'), 'clip')
  assert(items.some((i) => i.kind === 'visual' && i.visualAssetId === 'vis-door'), 'visual')
  assert(!items.some((i) => i.name === 'Other'), 'other-game character excluded')
  assert(!items.some((i) => i.visualAssetId === 'vis-other'), 'other-game visual excluded')
  assert(!items.some((i) => i.name === 'Beep'), 'audio not in layer picker')
  assert(kinds.includes('clip'), `clips present: ${kinds}`)
  console.log('✓ catalog is Game-scoped and includes clips; audio omitted')
}

function testTabsAndSearch(): void {
  const items = buildLibraryCatalog(pipeline(), 'game-a')
  assert(filterLibraryCatalog(items, 'clips', '').every((i) => i.kind === 'clip'), 'clips tab')
  assert(filterLibraryCatalog(items, 'images', '').every((i) => i.kind === 'visual'), 'images tab')
  assert(filterLibraryCatalog(items, 'backgrounds', '').every((i) => i.kind === 'visual'), 'backgrounds tab')
  const hit = filterLibraryCatalog(items, 'all', 'door')
  assert(hit.length === 1 && hit[0].visualAssetId === 'vis-door', 'search door')
  const combat = filterLibraryCatalog(items, 'all', 'combat')
  assert(combat.length === 1 && combat[0].kind === 'clip', 'search clip tags')
  console.log('✓ tabs + text search')
}

function testPagination(): void {
  const items = Array.from({ length: 100 }, (_, i) => ({
    id: `visual:${i}`,
    kind: 'visual' as const,
    entityId: String(i),
    name: `Asset ${i}`,
    subtitle: 'Image',
    searchText: `asset ${i}`,
    visualAssetId: String(i)
  }))
  const page0 = paginateLibraryCatalog(items, 0, 48)
  assert(page0.slice.length === 48 && page0.pageCount === 3, 'page 0')
  const page2 = paginateLibraryCatalog(items, 2, 48)
  assert(page2.slice.length === 4 && page2.page === 2, 'last page')
  const overflow = paginateLibraryCatalog(items, 99, 48)
  assert(overflow.page === 2, 'clamps page')
  console.log('✓ pagination for hundreds of assets')
}

function testClipRoutingFromAddLayer(): void {
  const clip = buildLibraryCatalog(pipeline(), 'game-a').find((i) => i.kind === 'clip')!
  const decision = resolveLibraryPick('addLayer', clip)
  assert(decision.action.type === 'addClipBlock' && decision.action.role === 'layer', 'clip → clips track')
  assert(decision.note.toLowerCase().includes('not still-image'), 'explains routing')
  const bg = resolveLibraryPick('shotBackground', clip)
  assert(bg.action.type === 'setBackgroundClip', 'background purpose + clip')
  const choose = resolveLibraryPick('clipBlock', clip)
  assert(choose.action.type === 'chooseClip', 'clip block form fill')
  console.log('✓ clip pick from add-layer routes to Clips track, not a still layer')
}

function testVisualAndCharacterRouting(): void {
  const items = buildLibraryCatalog(pipeline(), 'game-a')
  const door = items.find((i) => i.kind === 'visual')!
  const asBg = resolveLibraryPick('shotBackground', door)
  assert(asBg.action.type === 'setShotBackground', 'visual → shot background')
  const asLayer = resolveLibraryPick('addLayer', door)
  assert(asLayer.action.type === 'addVisualLayer', 'visual → layer')
  const hero = items.find((i) => i.kind === 'character')!
  const char = resolveLibraryPick('addLayer', hero)
  assert(char.action.type === 'addCharacterLayer', 'character layer')
  const pose = items.find((i) => i.kind === 'pose')!
  const posed = resolveLibraryPick('addLayer', pose)
  assert(
    posed.action.type === 'addCharacterLayer' && posed.action.poseId === 'pose-idle',
    'pose sets starting pose'
  )
  console.log('✓ visual/character/pose routing')
}

function main(): void {
  testGameScopeAndKinds()
  testTabsAndSearch()
  testPagination()
  testClipRoutingFromAddLayer()
  testVisualAndCharacterRouting()
  console.log('\nAll library catalog tests passed')
}

main()
