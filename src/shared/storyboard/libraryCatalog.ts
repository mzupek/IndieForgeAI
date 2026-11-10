/**
 * Game-scoped Library catalog for the Storyboard picker.
 * Built from the pipeline for the selected Game — not an unscoped project dump.
 * Audio is intentionally omitted (A2/A3 stay on their own tracks).
 */

import type {
  AssetPipelineProject,
  AssetState,
  Character,
  Clip,
  Pose,
  VisualAsset
} from '../types/assetPipeline'
import { clipsForGame } from './clipBlocks'
import { resolveLibraryPreviewPath } from './layerValidation'

export type LibraryItemKind = 'character' | 'pose' | 'clip' | 'visual'

export type LibraryPickerTab =
  | 'all'
  | 'characters'
  | 'poses'
  | 'clips'
  | 'backgrounds'
  | 'images'

export type LibraryPickerPurpose =
  | 'addLayer'
  | 'shotBackground'
  | 'backgroundClip'
  | 'clipBlock'

export interface LibraryCatalogItem {
  id: string
  kind: LibraryItemKind
  entityId: string
  name: string
  subtitle: string
  searchText: string
  thumbnailPath?: string
  characterId?: string
  poseId?: string
  clipId?: string
  visualAssetId?: string
  clipFile?: string
  stateful?: boolean
}

export type LibraryPickAction =
  | { type: 'addCharacterLayer'; characterId: string; poseId?: string }
  | { type: 'addVisualLayer'; visualAssetId: string }
  | { type: 'addClipBlock'; clipId: string; role: 'layer' | 'background' }
  | { type: 'setShotBackground'; visualAssetId: string }
  | { type: 'setBackgroundClip'; clipId: string }
  | { type: 'chooseClip'; clipId: string }

export interface LibraryPickDecision {
  action: LibraryPickAction
  label: string
  note: string
  alternatives: Array<{ action: LibraryPickAction; label: string }>
}

export const LIBRARY_PICKER_TABS: Array<{ id: LibraryPickerTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'characters', label: 'Characters' },
  { id: 'poses', label: 'Poses' },
  { id: 'clips', label: 'Clips' },
  { id: 'backgrounds', label: 'Backgrounds' },
  { id: 'images', label: 'Images / Stateful' }
]

export const LIBRARY_PAGE_SIZE = 48

export function charactersForGame(
  pipeline: AssetPipelineProject,
  gameId: string
): Character[] {
  return (pipeline.characters || []).filter((c) => c.gameId === gameId)
}

export function posesForGame(pipeline: AssetPipelineProject, gameId: string): Pose[] {
  const charIds = new Set(charactersForGame(pipeline, gameId).map((c) => c.id))
  return (pipeline.poses || []).filter((p) => charIds.has(p.characterId))
}

export function visualAssetsForGame(
  pipeline: AssetPipelineProject,
  gameId: string
): VisualAsset[] {
  return (pipeline.visualAssets || []).filter((a) => a.gameId === gameId)
}

export function buildLibraryCatalog(
  pipeline: AssetPipelineProject,
  gameId: string
): LibraryCatalogItem[] {
  const items: LibraryCatalogItem[] = []
  const characters = charactersForGame(pipeline, gameId)
  const poses = posesForGame(pipeline, gameId)
  const clips = clipsForGame(pipeline, gameId)
  const visuals = visualAssetsForGame(pipeline, gameId)
  const states: AssetState[] = pipeline.assetStates || []

  for (const character of characters) {
    const firstPose = poses.find((p) => p.characterId === character.id)
    items.push({
      id: `character:${character.id}`,
      kind: 'character',
      entityId: character.id,
      name: character.name,
      subtitle: character.role ? `Character · ${character.role}` : 'Character',
      searchText: `${character.name} ${character.role || ''} ${(character.tags || []).join(' ')}`.toLowerCase(),
      thumbnailPath: character.thumbnail || firstPose?.file,
      characterId: character.id
    })
  }

  for (const pose of poses) {
    const character = characters.find((c) => c.id === pose.characterId)
    items.push({
      id: `pose:${pose.id}`,
      kind: 'pose',
      entityId: pose.id,
      name: `${character?.name || 'Character'} / ${pose.slot}`,
      subtitle: `Pose · ${pose.status}`,
      searchText: `${character?.name || ''} ${pose.slot} ${pose.status}`.toLowerCase(),
      thumbnailPath: pose.file,
      characterId: pose.characterId,
      poseId: pose.id
    })
  }

  for (const clip of clips) {
    items.push({
      id: `clip:${clip.id}`,
      kind: 'clip',
      entityId: clip.id,
      name: clip.moment || 'clip',
      subtitle: `Clip · ${clip.durationSec}s`,
      searchText: `${clip.moment || ''} ${(clip.tags || []).join(' ')} clip video`.toLowerCase(),
      thumbnailPath: clip.thumbnail,
      clipId: clip.id,
      clipFile: clip.file
    })
  }

  for (const asset of visuals) {
    const owned = states.filter((s) => s.assetId === asset.id)
    const preview = resolveLibraryPreviewPath(asset, owned, { gameId })
    items.push({
      id: `visual:${asset.id}`,
      kind: 'visual',
      entityId: asset.id,
      name: asset.name,
      subtitle: owned.length
        ? `Stateful · ${asset.category} · ${owned.length} state(s)`
        : `Image · ${asset.category}`,
      searchText: `${asset.name} ${asset.category} ${(asset.tags || []).join(' ')}`.toLowerCase(),
      thumbnailPath: preview.path,
      visualAssetId: asset.id,
      stateful: owned.length > 0
    })
  }

  return items.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export function itemMatchesTab(item: LibraryCatalogItem, tab: LibraryPickerTab): boolean {
  if (tab === 'all') return true
  if (tab === 'characters') return item.kind === 'character'
  if (tab === 'poses') return item.kind === 'pose'
  if (tab === 'clips') return item.kind === 'clip'
  if (tab === 'backgrounds' || tab === 'images') return item.kind === 'visual'
  return true
}

export function filterLibraryCatalog(
  items: LibraryCatalogItem[],
  tab: LibraryPickerTab,
  query: string
): LibraryCatalogItem[] {
  const q = query.trim().toLowerCase()
  return items.filter((item) => {
    if (!itemMatchesTab(item, tab)) return false
    if (!q) return true
    return item.searchText.includes(q) || item.name.toLowerCase().includes(q)
  })
}

export function paginateLibraryCatalog(
  items: LibraryCatalogItem[],
  page: number,
  pageSize: number = LIBRARY_PAGE_SIZE
): { page: number; pageCount: number; slice: LibraryCatalogItem[] } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(0, page), pageCount - 1)
  const start = safePage * pageSize
  return {
    page: safePage,
    pageCount,
    slice: items.slice(start, start + pageSize)
  }
}

export function defaultTabForPurpose(purpose: LibraryPickerPurpose): LibraryPickerTab {
  if (purpose === 'shotBackground') return 'backgrounds'
  if (purpose === 'backgroundClip' || purpose === 'clipBlock') return 'clips'
  return 'all'
}

export function resolveLibraryPick(
  purpose: LibraryPickerPurpose,
  item: LibraryCatalogItem
): LibraryPickDecision {
  if (item.kind === 'clip' && item.clipId) {
    if (purpose === 'clipBlock') {
      return {
        action: { type: 'chooseClip', clipId: item.clipId },
        label: 'Use this clip',
        note: 'Fills the clip-block form. Place on the Clips track (layer or background role).',
        alternatives: []
      }
    }
    if (purpose === 'backgroundClip' || purpose === 'shotBackground') {
      return {
        action: { type: 'setBackgroundClip', clipId: item.clipId },
        label: 'Use as background clip',
        note:
          purpose === 'shotBackground'
            ? 'This is a video clip, not a still. It cannot be a Library image background — it will be set as the shot background clip (implicit play from 0). Timed placement lives on the Clips track.'
            : 'Sets legacy backgroundClipId (implicit play from 0). Timed placement lives on the Clips track.',
        alternatives: [
          {
            action: { type: 'addClipBlock', clipId: item.clipId, role: 'background' },
            label: 'Place timed background clip block'
          }
        ]
      }
    }
    return {
      action: { type: 'addClipBlock', clipId: item.clipId, role: 'layer' },
      label: 'Place on Clips track',
      note: 'Video clips are not still-image layers. A compositing layer is created and a range bar is placed on the Clips track at the playhead.',
      alternatives: [
        {
          action: { type: 'setBackgroundClip', clipId: item.clipId },
          label: 'Use as shot background clip'
        }
      ]
    }
  }

  if (item.kind === 'visual' && item.visualAssetId) {
    if (purpose === 'shotBackground') {
      return {
        action: { type: 'setShotBackground', visualAssetId: item.visualAssetId },
        label: 'Use as shot background',
        note: 'Full-resolution Library image for this Game. Not copied onto a thumbnail.',
        alternatives: [
          {
            action: { type: 'addVisualLayer', visualAssetId: item.visualAssetId },
            label: 'Add as layer instead'
          }
        ]
      }
    }
    if (purpose === 'backgroundClip' || purpose === 'clipBlock') {
      return {
        action: { type: 'addVisualLayer', visualAssetId: item.visualAssetId },
        label: 'Add as layer',
        note: 'Still images are not video clips. Add as a visual-asset layer instead of a clip block.',
        alternatives: []
      }
    }
    return {
      action: { type: 'addVisualLayer', visualAssetId: item.visualAssetId },
      label: 'Add as layer',
      note: 'Adds a visual-asset layer. Starting state can be changed in the inspector.',
      alternatives: [
        {
          action: { type: 'setShotBackground', visualAssetId: item.visualAssetId },
          label: 'Use as shot background'
        }
      ]
    }
  }

  if (item.kind === 'character' && item.characterId) {
    const action: LibraryPickAction = {
      type: 'addCharacterLayer',
      characterId: item.characterId
    }
    if (purpose === 'addLayer' || purpose === 'shotBackground') {
      return {
        action,
        label: 'Add character layer',
        note:
          purpose === 'shotBackground'
            ? 'Characters are layers, not shot backgrounds.'
            : 'Adds the character with its first pose. Change starting pose in the inspector.',
        alternatives: []
      }
    }
    return {
      action,
      label: 'Add character layer',
      note: 'Characters are not video clips. Add as a layer instead.',
      alternatives: []
    }
  }

  if (item.kind === 'pose' && item.characterId && item.poseId) {
    return {
      action: {
        type: 'addCharacterLayer',
        characterId: item.characterId,
        poseId: item.poseId
      },
      label: 'Add layer with this pose',
      note: 'Adds the character using this pose as the authored starting pose.',
      alternatives: []
    }
  }

  throw new Error('Cannot place this Library item')
}
