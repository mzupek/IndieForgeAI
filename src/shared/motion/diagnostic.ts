import type {
  IndieForgeProject,
  MotionBlueprint,
  MotionDiagnosticBundle,
  MotionDiagnosticRun,
  MotionPhase
} from '@shared/types/project'
import { summarizePuppetForAgent } from './characterPuppet'
import { batAngleDeg } from './rhBatterSwing'
import { getDesignSpriteSize, getExportSpriteSize } from '@shared/styleGuide'

const PAINT_CONTRACT = [
  'Pipeline: Craft guide (camera) → Character bible (identity) → AI part kit → Motion Blueprint keys → rasterize.',
  'Motion Blueprint joints + constraints are the source of truth for mechanics.',
  'AI may paint the character bible and part sheet once — never regenerate full sprites per phase.',
  'In-betweens are deterministic (samplePuppetJoints / lerp) — interpolate the rig, not pixels.',
  'Craft guide photo locks camera/depth (umpire POV). Bible locks costume. Parts are bind-ready cutouts.',
  'Approve/Reject apply to bible/parts/pixels only — never mutate the Motion Blueprint.',
  'Chat must not invent animation frames when a Motion Blueprint / puppet path exists.'
]

export function summarizePhaseForAgent(phase: MotionPhase): MotionDiagnosticBundle['agentWorkingSchema']['phases'][0] {
  const joints = phase.joints.map((j) => ({
    ...j,
    x: j.x + phase.rootOffset.x,
    y: j.y + phase.rootOffset.y
  }))
  const jointSummary: Record<string, { x: number; y: number }> = {}
  for (const j of joints) {
    jointSummary[j.id] = { x: Math.round(j.x), y: Math.round(j.y) }
  }
  return {
    name: phase.name,
    batAngleDegMeasured: batAngleDeg(joints) != null ? Math.round(batAngleDeg(joints)!) : null,
    constraints: { ...phase.constraints },
    jointSummary,
    poseGuidePath: phase.poseGuidePath,
    notes: phase.notes
  }
}

export function buildMotionDiagnosticBundle(
  project: IndieForgeProject,
  assetId: string,
  options?: { blueprintId?: string; maxRuns?: number }
): MotionDiagnosticBundle {
  const asset = project.assets.find((a) => a.id === assetId)
  if (!asset) throw new Error(`Asset not found: ${assetId}`)

  const blueprint =
    (options?.blueprintId
      ? asset.motionBlueprints?.find((b) => b.id === options.blueprintId)
      : asset.motionBlueprints?.[0]) ?? null

  const design = getDesignSpriteSize(project.styleGuide)
  const exportSize = getExportSpriteSize(project.styleGuide)
  const maxRuns = options?.maxRuns ?? 40
  const runs = [...(asset.motionDiagnosticRuns ?? [])].slice(-maxRuns)

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    assetId: asset.id,
    assetName: asset.name,
    designSize: design,
    exportSize,
    appearance: {
      sourceAssetId: asset.metadata?.appearanceSourceAssetId as string | undefined,
      sourceName: asset.metadata?.appearanceSourceName as string | undefined,
      guideImagePath: asset.guideImagePath,
      filePath: asset.filePath,
      silhouettePath: asset.silhouettePath,
      outlinePath: asset.outlinePath
    },
    blueprint: blueprint
      ? {
          ...blueprint,
          // Omit bulky save history from agent export; keep mechanics
          history: undefined
        }
      : null,
    characterPuppet: asset.characterPuppet ?? null,
    agentWorkingSchema: {
      description: asset.characterPuppet
        ? 'Thesis: Guide → Character bible → Part kit → Motion Blueprint lerp → rasterize. AI paints bible/parts once; never full-frame redraw per phase.'
        : 'Prefer cutout puppet path: Craft guide → bible → part kit → blueprint motion. Mechanics stay in Motion Blueprint.',
      phases: blueprint ? blueprint.phases.map(summarizePhaseForAgent) : [],
      paintContract: [...PAINT_CONTRACT],
      puppetThesis: asset.characterPuppet
        ? (() => {
            const s = summarizePuppetForAgent(asset.characterPuppet!)
            return {
              schemaVersion: 1 as const,
              status: s.status,
              partsReady: s.partsReady,
              partCount: s.partCount,
              frameCount: s.timeline.frameCount,
              interpolate: s.thesis.interpolate,
              aiRole: s.thesis.aiRole,
              nextMvpSteps: s.nextMvpSteps
            }
          })()
        : undefined
    },
    runs
  }
}

export function diagnosticBundleToJson(bundle: MotionDiagnosticBundle, pretty = true): string {
  return pretty ? JSON.stringify(bundle, null, 2) : JSON.stringify(bundle)
}

export function createDiagnosticRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function phaseSnapshotFields(phase: MotionPhase | undefined): Partial<MotionDiagnosticRun> {
  if (!phase) return {}
  return {
    phaseName: phase.name,
    joints: phase.joints.map((j) => ({ ...j })),
    rootOffset: { ...phase.rootOffset },
    constraints: {
      ...phase.constraints,
      cannotOverlap: phase.constraints.cannotOverlap?.slice()
    },
    phaseNotes: phase.notes,
    poseGuidePath: phase.poseGuidePath
  }
}

export function blueprintWithoutHeavyHistory(blueprint: MotionBlueprint): MotionBlueprint {
  return { ...blueprint, history: undefined }
}
