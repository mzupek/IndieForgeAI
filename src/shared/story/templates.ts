/**
 * Studio-level story templates. Built-in data plus optional studio.json overrides.
 * Copied into a new game; never hardcoded as a specific title.
 */

import type { AssetPipelineProject, Game, GameEncounterModule, HarmonStepLabel } from '../types/assetPipeline'
import { emptyGameSettings } from '../studio/schema'
import { applyContentBundleIsolated, type ContentBundle } from '../worldContent/apply'
import { ADVENTURE_LENS_TEMPLATE } from './templates/adventureLens'

export interface StoryTemplateField {
  key: string
  label: string
  prompt: string
}

export interface StoryTemplateCircleStep {
  index: number
  label: HarmonStepLabel
  prompt: string
}

export interface StoryTemplate {
  key: string
  name: string
  builtin?: boolean
  revealTokenLabel: string
  flagConventions: {
    naming: string
    examples: string[]
    scopes: { game: string; world: string }
    step6: string
  }
  characterProfileFields: StoryTemplateField[]
  circleSteps: StoryTemplateCircleStep[]
  surfaceGoalPrompt: string
  hiddenGoalPrompt: string
  sampleSkeleton: {
    modules?: GameEncounterModule[]
    worlds?: Record<string, unknown>[]
    stages?: Record<string, unknown>[]
    regions?: Record<string, unknown>[]
    encounters?: Record<string, unknown>[]
    flags?: Record<string, unknown>[]
    storyCircles?: Record<string, unknown>[]
    revealTokens?: Record<string, unknown>[]
    characters?: Record<string, unknown>[]
    npcs?: Record<string, unknown>[]
    dialogues?: Record<string, unknown>[]
    triggers?: Record<string, unknown>[]
  }
}

const BUILTIN: StoryTemplate[] = [ADVENTURE_LENS_TEMPLATE]

export function builtinStoryTemplates(): StoryTemplate[] {
  return BUILTIN.slice()
}

export function listStoryTemplates(studioTemplates?: StoryTemplate[]): StoryTemplate[] {
  const extras = (studioTemplates || []).filter((t) => !BUILTIN.some((b) => b.key === t.key))
  return [...BUILTIN, ...extras]
}

export function getStoryTemplate(key: string, studioTemplates?: StoryTemplate[]): StoryTemplate {
  const found = listStoryTemplates(studioTemplates).find((t) => t.key === key)
  if (!found) throw new Error(`Story template '${key}' was not found`)
  return found
}

export function applyStoryTemplateToGame(
  pipeline: AssetPipelineProject,
  game: Game,
  template: StoryTemplate
): { pipeline: AssetPipelineProject; issues: { level: string; path: string; message: string }[] } {
  const settings = game.settings || emptyGameSettings()
  const modules = [...(settings.modules || [])]
  for (const mod of template.sampleSkeleton.modules || []) {
    if (!modules.some((m) => m.id === mod.id)) modules.push(mod)
  }
  game.settings = {
    ...settings,
    modules,
    revealTokenLabel: template.revealTokenLabel || settings.revealTokenLabel
  }
  const idx = pipeline.games.findIndex((g) => g.id === game.id)
  if (idx >= 0) pipeline.games[idx] = game

  const skeleton = template.sampleSkeleton
  const bundle: ContentBundle = {}
  if (skeleton.worlds) bundle.worlds = skeleton.worlds
  if (skeleton.stages) bundle.stages = skeleton.stages
  const regionsReady = (skeleton.regions || []).every((r) => String(r.backgroundAssetId || '').trim())
  if (skeleton.regions && regionsReady) bundle.regions = skeleton.regions
  if (skeleton.encounters) bundle.encounters = skeleton.encounters
  if (skeleton.flags) bundle.flags = skeleton.flags
  if (skeleton.storyCircles) bundle.storyCircles = skeleton.storyCircles
  if (skeleton.revealTokens) bundle.revealTokens = skeleton.revealTokens
  if (skeleton.characters) bundle.characters = skeleton.characters
  if (skeleton.npcs) bundle.npcs = skeleton.npcs
  if (skeleton.dialogues) bundle.dialogues = skeleton.dialogues
  if (skeleton.triggers) bundle.triggers = skeleton.triggers

  const hasContent = Object.values(bundle).some((arr) => Array.isArray(arr) && arr.length > 0)
  if (!hasContent) return { pipeline, issues: [] }
  const applied = applyContentBundleIsolated(pipeline, game.id, bundle)
  return { pipeline: applied.pipeline, issues: applied.result.issues }
}
