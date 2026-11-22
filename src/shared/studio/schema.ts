/**
 * Studio.json schema versions, refuse-newer guard, in-memory normalize, v1→v2 migrate plan.
 * Pure (no fs). Shared by storage, CLI, app, and tests.
 */

import type { AssetPipelineProject, Game, GameSettings } from '../types/assetPipeline'

/** Highest studio.json / assetPipeline.schemaVersion this build can open or save. */
export const STUDIO_SCHEMA_VERSION = 2

/** On-disk files until Matt runs `forge migrate`. */
export const STUDIO_SCHEMA_V1 = 1

export const DEFAULT_ENCOUNTER_TYPES = ['battle', 'puzzle', 'minigame', 'story'] as const

export interface StudioFile {
  schemaVersion: number
  assetPipeline: AssetPipelineProject
  createdAt: string
  updatedAt: string
}

export class UnsupportedStudioSchemaError extends Error {
  readonly code = 'UNSUPPORTED_STUDIO_SCHEMA'
  readonly foundVersion: number
  readonly supportedVersion: number

  constructor(foundVersion: number, supportedVersion: number = STUDIO_SCHEMA_VERSION) {
    super(
      `This studio.json is schemaVersion ${foundVersion}, but this Forge build supports up to ${supportedVersion}. ` +
        `Upgrade Forge (or restore a backup) before opening this file. Refusing to load so an older build cannot damage newer data.`
    )
    this.name = 'UnsupportedStudioSchemaError'
    this.foundVersion = foundVersion
    this.supportedVersion = supportedVersion
  }
}

export function emptyGameSettings(): GameSettings {
  return {
    poseSlots: [],
    assetCategories: [],
    encounterTypes: [...DEFAULT_ENCOUNTER_TYPES],
    modules: []
  }
}

export function effectiveSchemaVersion(studio: Pick<StudioFile, 'schemaVersion'> & {
  assetPipeline?: { schemaVersion?: number }
}): number {
  const studioVer = Number(studio.schemaVersion ?? STUDIO_SCHEMA_V1)
  const pipelineVer = Number(studio.assetPipeline?.schemaVersion ?? STUDIO_SCHEMA_V1)
  const found = Math.max(
    Number.isFinite(studioVer) ? studioVer : STUDIO_SCHEMA_V1,
    Number.isFinite(pipelineVer) ? pipelineVer : STUDIO_SCHEMA_V1
  )
  return found
}

export function assertSupportedStudioSchema(studio: Pick<StudioFile, 'schemaVersion'> & {
  assetPipeline?: { schemaVersion?: number }
}): void {
  const found = effectiveSchemaVersion(studio)
  if (found > STUDIO_SCHEMA_VERSION) {
    throw new UnsupportedStudioSchemaError(found, STUDIO_SCHEMA_VERSION)
  }
}

function ensureArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : []
}

/**
 * Fill missing arrays / layer defaults in memory. Does not bump schemaVersion.
 * Safe for v1 files: callers must not persist this on a read path.
 */
export function normalizeStudioInMemory(studio: StudioFile): StudioFile {
  const p = studio.assetPipeline
  if (!p) {
    throw new Error('studio.json is missing assetPipeline')
  }
  p.games = ensureArray(p.games)
  p.characters = ensureArray(p.characters)
  p.poses = ensureArray(p.poses)
  p.clips = ensureArray(p.clips)
  p.scenePresets = ensureArray(p.scenePresets)
  p.scenes = ensureArray(p.scenes)
  p.storyboards = ensureArray(p.storyboards)
  p.storyboardShots = ensureArray(p.storyboardShots)
  p.exportProfiles = ensureArray(p.exportProfiles)
  p.gameDefinitions = ensureArray(p.gameDefinitions)
  p.visualAssets = ensureArray(p.visualAssets)
  p.assetStates = ensureArray(p.assetStates)
  p.fonts = ensureArray(p.fonts)
  p.palettes = ensureArray(p.palettes)
  p.eventDefinitions = ensureArray(p.eventDefinitions)
  p.eventBindings = ensureArray(p.eventBindings)
  p.audioAssets = ensureArray(p.audioAssets)
  p.worlds = ensureArray(p.worlds)
  p.stages = ensureArray(p.stages)
  p.encounters = ensureArray(p.encounters)
  p.regions = ensureArray(p.regions)
  p.enemies = ensureArray(p.enemies)
  p.attackTables = ensureArray(p.attackTables)
  p.difficultyProfiles = ensureArray(p.difficultyProfiles)
  p.flags = ensureArray(p.flags)
  p.triggers = ensureArray(p.triggers)

  for (const shot of p.storyboardShots) {
    if (shot.layers) {
      for (const layer of shot.layers) {
        if (layer.visible === undefined) layer.visible = true
        if (!layer.timedKeys) layer.timedKeys = []
      }
    }
    if (!shot.clipTrack) shot.clipTrack = []
    if (!shot.audioTrack) shot.audioTrack = []
    if (!shot.eventCues) shot.eventCues = []
    if (!shot.backgroundKeys) shot.backgroundKeys = []
  }

  return studio
}

export interface StudioMigrationChange {
  path: string
  detail: string
}

export interface StudioMigrationPlan {
  currentStudioSchemaVersion: number
  currentPipelineSchemaVersion: number
  targetSchemaVersion: number
  alreadyCurrent: boolean
  changes: StudioMigrationChange[]
  gamesNeedingSettings: string[]
}

export function planStudioV2Migration(studio: StudioFile): StudioMigrationPlan {
  const currentStudio = Number(studio.schemaVersion ?? STUDIO_SCHEMA_V1)
  const currentPipeline = Number(studio.assetPipeline?.schemaVersion ?? STUDIO_SCHEMA_V1)
  const alreadyCurrent =
    currentStudio >= STUDIO_SCHEMA_VERSION && currentPipeline >= STUDIO_SCHEMA_VERSION

  const games = studio.assetPipeline?.games || []
  const gamesNeedingSettings = games.filter((g) => !g.settings).map((g) => g.id)
  const changes: StudioMigrationChange[] = []

  if (alreadyCurrent) {
    return {
      currentStudioSchemaVersion: currentStudio,
      currentPipelineSchemaVersion: currentPipeline,
      targetSchemaVersion: STUDIO_SCHEMA_VERSION,
      alreadyCurrent: true,
      changes: [],
      gamesNeedingSettings: []
    }
  }

  if (currentStudio < STUDIO_SCHEMA_VERSION) {
    changes.push({
      path: 'schemaVersion',
      detail: `Set studio.schemaVersion ${currentStudio} → ${STUDIO_SCHEMA_VERSION}`
    })
  }
  if (currentPipeline < STUDIO_SCHEMA_VERSION) {
    changes.push({
      path: 'assetPipeline.schemaVersion',
      detail: `Set assetPipeline.schemaVersion ${currentPipeline} → ${STUDIO_SCHEMA_VERSION}`
    })
  }
  const p = studio.assetPipeline
  if (!Array.isArray(p.worlds) || !Array.isArray(p.stages) || !Array.isArray(p.encounters) || !Array.isArray(p.regions)) {
    changes.push({
      path: 'assetPipeline.worlds|stages|encounters|regions',
      detail: 'Add empty worlds, stages, encounters, regions arrays (1c records)'
    })
  }
  if (gamesNeedingSettings.length > 0) {
    changes.push({
      path: 'assetPipeline.games[].settings',
      detail: `Add empty settings on ${gamesNeedingSettings.length} game(s): ${gamesNeedingSettings.join(', ')}`
    })
  }

  return {
    currentStudioSchemaVersion: currentStudio,
    currentPipelineSchemaVersion: currentPipeline,
    targetSchemaVersion: STUDIO_SCHEMA_VERSION,
    alreadyCurrent: false,
    changes,
    gamesNeedingSettings
  }
}

/**
 * Apply v2 groundwork in memory. Does not write. Existing records are not rewritten.
 */
export function applyStudioV2Migration(studio: StudioFile): StudioFile {
  normalizeStudioInMemory(studio)
  studio.schemaVersion = STUDIO_SCHEMA_VERSION
  studio.assetPipeline.schemaVersion = STUDIO_SCHEMA_VERSION
  studio.assetPipeline.worlds = studio.assetPipeline.worlds || []
  studio.assetPipeline.stages = studio.assetPipeline.stages || []
  studio.assetPipeline.encounters = studio.assetPipeline.encounters || []
  studio.assetPipeline.regions = studio.assetPipeline.regions || []
  for (const game of studio.assetPipeline.games) {
    if (!game.settings) {
      game.settings = emptyGameSettings()
    }
  }
  studio.updatedAt = new Date().toISOString()
  return studio
}

export function validateStudioV2(studio: StudioFile): void {
  if (studio.schemaVersion !== STUDIO_SCHEMA_VERSION) {
    throw new Error(`Expected studio.schemaVersion ${STUDIO_SCHEMA_VERSION}, got ${studio.schemaVersion}`)
  }
  if (studio.assetPipeline.schemaVersion !== STUDIO_SCHEMA_VERSION) {
    throw new Error(
      `Expected assetPipeline.schemaVersion ${STUDIO_SCHEMA_VERSION}, got ${studio.assetPipeline.schemaVersion}`
    )
  }
  for (const name of ['worlds', 'stages', 'encounters', 'regions'] as const) {
    if (!Array.isArray(studio.assetPipeline[name])) {
      throw new Error(`assetPipeline.${name} must be an array after v2 migrate`)
    }
  }
  for (const game of studio.assetPipeline.games) {
    if (!game.settings) {
      throw new Error(`Game '${game.id}' is missing settings after v2 migrate`)
    }
    if (!Array.isArray(game.settings.poseSlots) || !Array.isArray(game.settings.assetCategories)) {
      throw new Error(`Game '${game.id}' settings.poseSlots / assetCategories must be arrays`)
    }
    if (!Array.isArray(game.settings.encounterTypes) || !Array.isArray(game.settings.modules)) {
      throw new Error(`Game '${game.id}' settings.encounterTypes / modules must be arrays`)
    }
  }
}

export function resolveDefaultGameId(
  games: Pick<Game, 'id'>[],
  lastSelectedId?: string | null
): string | null {
  if (lastSelectedId && games.some((g) => g.id === lastSelectedId)) {
    return lastSelectedId
  }
  return games[0]?.id ?? null
}

export function isStudioWritableInApp(studio: StudioFile): boolean {
  return effectiveSchemaVersion(studio) >= STUDIO_SCHEMA_VERSION
}

export function v1ReadOnlyMessage(): string {
  return (
    `This studio is schemaVersion 1 (read-only in the app). Quit Forge and run: ` +
    `forge migrate --dry-run   then   forge migrate. Reopen after the backup path is printed.`
  )
}
