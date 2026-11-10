/**
 * Game-scoped Library catalog for the Storyboard picker.
 * Built from the pipeline for the selected Game — not an unscoped project dump.
 * Visual add-layer catalogs omit audio/events/effects (those have their own purposes).
 */

import type {
  AssetPipelineProject,
  AssetState,
  AudioKind,
  Character,
  Clip,
  Pose,
  ScenePresetType,
  VisualAsset
} from '../types/assetPipeline'
import { clipsForGame } from './clipBlocks'
import { resolveLibraryPreviewPath } from './layerValidation'

export type LibraryItemKind =
  | 'character'
  | 'pose'
  | 'clip'
  | 'visual'
  | 'audio'
  | 'event'
  | 'effect'

export type LibraryPickerTab =
  | 'all'
  | 'characters'
  | 'poses'
  | 'clips'
  | 'backgrounds'
  | 'images'
  | 'music'
  | 'sfx'
  | 'events'
  | 'effects'

export type LibraryPickerPurpose =
  | 'addLayer'
  | 'shotBackground'
  | 'backgroundClip'
  | 'clipBlock'
  | 'audioAsset'
  | 'eventDefinition'
  | 'effectPreset'

export const VISUAL_LIBRARY_KINDS: LibraryItemKind[] = ['character', 'pose', 'clip', 'visual']

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
  audioId?: string
  audioKind?: AudioKind
  audioFile?: string
  eventId?: string
  presetId?: string
  presetType?: ScenePresetType
}

export type LibraryPickAction =
  | { type: 'addCharacterLayer'; characterId: string; poseId?: string }
  | { type: 'addVisualLayer'; visualAssetId: string }
  | { type: 'addClipBlock'; clipId: string; role: 'layer' | 'background' }
  | { type: 'setShotBackground'; visualAssetId: string }
  | { type: 'setBackgroundClip'; clipId: string }
  | { type: 'chooseClip'; clipId: string }
  | { type: 'chooseAudio'; audioId: string }
  | { type: 'chooseEvent'; eventId: string }
  | { type: 'chooseEffectPreset'; presetId: string }

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

export const AUDIO_PICKER_TABS: Array<{ id: LibraryPickerTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'music', label: 'Music' },
  { id: 'sfx', label: 'SFX' }
]

export const EVENT_PICKER_TABS: Array<{ id: LibraryPickerTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'events', label: 'Events' }
]

export const EFFECT_PICKER_TABS: Array<{ id: LibraryPickerTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'effects', label: 'Effects' }
]

export function tabsForPurpose(purpose: LibraryPickerPurpose): Array<{ id: LibraryPickerTab; label: string }> {
  if (purpose === 'audioAsset') return AUDIO_PICKER_TABS
  if (purpose === 'eventDefinition') return EVENT_PICKER_TABS
  if (purpose === 'effectPreset') return EFFECT_PICKER_TABS
  return LIBRARY_PICKER_TABS
}

export function catalogKindsForPurpose(purpose: LibraryPickerPurpose): LibraryItemKind[] {
  if (purpose === 'audioAsset') return ['audio']
  if (purpose === 'eventDefinition') return ['event']
  if (purpose === 'effectPreset') return ['effect']
  return VISUAL_LIBRARY_KINDS
}

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
  gameId: string,
  kinds: LibraryItemKind[] = VISUAL_LIBRARY_KINDS
): LibraryCatalogItem[] {
  const include = new Set(kinds)
  const items: LibraryCatalogItem[] = []
  const characters = charactersForGame(pipeline, gameId)
  const poses = posesForGame(pipeline, gameId)
  const clips = clipsForGame(pipeline, gameId)
  const visuals = visualAssetsForGame(pipeline, gameId)
  const states: AssetState[] = pipeline.assetStates || []

  if (include.has('character')) for (const character of characters) {
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

  if (include.has('pose')) for (const pose of poses) {
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

  if (include.has('clip')) for (const clip of clips) {
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

  if (include.has('visual')) for (const asset of visuals) {
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

  if (include.has('audio')) {
    for (const audio of pipeline.audioAssets || []) {
      if (audio.gameId !== gameId) continue
      items.push({
        id: `audio:${audio.id}`,
        kind: 'audio',
        entityId: audio.id,
        name: audio.name,
        subtitle: `${audio.kind} · ${audio.durationSec.toFixed(2)}s`,
        searchText: `${audio.name} ${audio.kind} ${(audio.tags || []).join(' ')} audio`.toLowerCase(),
        audioId: audio.id,
        audioKind: audio.kind,
        audioFile: audio.file
      })
    }
  }

  if (include.has('event')) {
    for (const event of pipeline.eventDefinitions || []) {
      if (event.gameId !== gameId) continue
      items.push({
        id: `event:${event.id}`,
        kind: 'event',
        entityId: event.id,
        name: event.name,
        subtitle: event.description ? `Event · ${event.description}` : 'Named event',
        searchText: `${event.name} ${event.description || ''} event`.toLowerCase(),
        eventId: event.id
      })
    }
  }

  if (include.has('effect')) {
    for (const preset of pipeline.scenePresets || []) {
      const durationMs = typeof preset.params?.durationMs === 'number' ? preset.params.durationMs : undefined
      const tag = (preset.tags && preset.tags[0]) || preset.type
      items.push({
        id: `effect:${preset.id}`,
        kind: 'effect',
        entityId: preset.id,
        name: tag,
        subtitle: durationMs ? `${preset.type} · ${durationMs}ms` : preset.type,
        searchText: `${tag} ${preset.type} ${(preset.tags || []).join(' ')} effect`.toLowerCase(),
        thumbnailPath: preset.thumbnail,
        presetId: preset.id,
        presetType: preset.type
      })
    }
  }

  return items.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export function itemMatchesTab(item: LibraryCatalogItem, tab: LibraryPickerTab): boolean {
  if (tab === 'all') return true
  if (tab === 'characters') return item.kind === 'character'
  if (tab === 'poses') return item.kind === 'pose'
  if (tab === 'clips') return item.kind === 'clip'
  if (tab === 'backgrounds' || tab === 'images') return item.kind === 'visual'
  if (tab === 'music') return item.kind === 'audio' && item.audioKind === 'music'
  if (tab === 'sfx') return item.kind === 'audio' && item.audioKind === 'sfx'
  if (tab === 'events') return item.kind === 'event'
  if (tab === 'effects') return item.kind === 'effect'
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
  if (purpose === 'audioAsset') return 'all'
  if (purpose === 'eventDefinition') return 'events'
  if (purpose === 'effectPreset') return 'effects'
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

  if (item.kind === 'audio' && item.audioId) {
    return {
      action: { type: 'chooseAudio', audioId: item.audioId },
      label: 'Use this audio',
      note: 'Fills the audio-block / playSfx form. Does not change the mixer.',
      alternatives: []
    }
  }

  if (item.kind === 'event' && item.eventId) {
    return {
      action: { type: 'chooseEvent', eventId: item.eventId },
      label: 'Use this event',
      note: 'Named event for a timeline cue or binding. Fire/Play semantics are unchanged.',
      alternatives: []
    }
  }

  if (item.kind === 'effect' && item.presetId) {
    return {
      action: { type: 'chooseEffectPreset', presetId: item.presetId },
      label: 'Use this recipe',
      note: 'Places an existing effect recipe on the Effects track at the playhead.',
      alternatives: []
    }
  }

  throw new Error('Cannot place this Library item')
}
