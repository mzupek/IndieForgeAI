/**
 * 2d: per-module mini-game / encounter tuning param specs. Game-agnostic.
 */

import type {
  AssetPipelineProject,
  Encounter,
  GameEncounterModule,
  ModuleParamSpec,
  ModuleParamType
} from '../types/assetPipeline'
import { formatInUseError, warningIssue, type ContentIssue, type NamedUser } from '../worldContent/issues'

const PARAM_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/

function assertParamKey(raw: string): string {
  const trimmed = String(raw ?? '').trim()
  if (!PARAM_KEY_PATTERN.test(trimmed)) {
    throw new Error(
      `Param spec key must start with a letter and contain only letters, digits, or underscore. Got '${raw}'`
    )
  }
  return trimmed
}

export const MODULE_PARAM_TYPES: ModuleParamType[] = ['int', 'float', 'bool', 'enum', 'string']

export function isModuleParamType(raw: string): raw is ModuleParamType {
  return (MODULE_PARAM_TYPES as string[]).includes(raw)
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function parseBool(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number' && (raw === 0 || raw === 1)) return raw === 1
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase()
    if (t === 'true' || t === '1') return true
    if (t === 'false' || t === '0') return false
  }
  return undefined
}

function coerceDefault(type: ModuleParamType, raw: unknown, key: string): number | string | boolean {
  if (type === 'bool') {
    const b = parseBool(raw)
    if (b === undefined) throw new Error(`Param '${key}' default must be a boolean`)
    return b
  }
  if (type === 'int') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isInteger(n)) throw new Error(`Param '${key}' default must be an integer`)
    return n
  }
  if (type === 'float') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n)) throw new Error(`Param '${key}' default must be a number`)
    return n
  }
  const s = String(raw ?? '').trim()
  if (!s && type === 'enum') throw new Error(`Param '${key}' default is required to be one of the options`)
  return s
}

function assertRangeOrder(min: number | undefined, max: number | undefined, key: string): void {
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error(`Param '${key}' min cannot be greater than max`)
  }
}

export function normalizeParamSpec(raw: unknown, moduleId: string): ModuleParamSpec {
  const obj = asRecord(raw)
  if (!obj) {
    throw new Error(`Module '${moduleId}' param spec must be { key, type, min?, max?, options?, default?, required? }`)
  }
  const key = assertParamKey(String(obj.key ?? ''))
  const typeRaw = String(obj.type ?? '').trim()
  if (!isModuleParamType(typeRaw)) {
    throw new Error(
      `Param '${key}' type must be one of ${MODULE_PARAM_TYPES.join(', ')}. Got '${obj.type ?? ''}'`
    )
  }
  const spec: ModuleParamSpec = { key, type: typeRaw }

  if (obj.min !== undefined && obj.min !== null && obj.min !== '') {
    if (typeRaw !== 'int' && typeRaw !== 'float') {
      throw new Error(`Param '${key}' min is only valid for int or float`)
    }
    const min = Number(obj.min)
    if (!Number.isFinite(min)) throw new Error(`Param '${key}' min must be a number`)
    spec.min = min
  }
  if (obj.max !== undefined && obj.max !== null && obj.max !== '') {
    if (typeRaw !== 'int' && typeRaw !== 'float') {
      throw new Error(`Param '${key}' max is only valid for int or float`)
    }
    const max = Number(obj.max)
    if (!Number.isFinite(max)) throw new Error(`Param '${key}' max must be a number`)
    spec.max = max
  }
  assertRangeOrder(spec.min, spec.max, key)

  if (obj.options !== undefined && obj.options !== null) {
    if (typeRaw !== 'enum') throw new Error(`Param '${key}' options are only valid for enum`)
    if (!Array.isArray(obj.options)) throw new Error(`Param '${key}' options must be an array of strings`)
    const options: string[] = []
    const seen = new Set<string>()
    for (const item of obj.options) {
      const opt = String(item ?? '').trim()
      if (!opt) throw new Error(`Param '${key}' options cannot contain empty values`)
      const lower = opt.toLowerCase()
      if (seen.has(lower)) throw new Error(`Param '${key}' has duplicate option '${opt}'`)
      seen.add(lower)
      options.push(opt)
    }
    if (options.length === 0) throw new Error(`Param '${key}' enum must list at least one option`)
    spec.options = options
  } else if (typeRaw === 'enum') {
    throw new Error(`Param '${key}' enum requires options`)
  }

  if (obj.required === true || obj.required === 'true' || obj.required === 1) {
    spec.required = true
  } else if (obj.required !== undefined && obj.required !== null && obj.required !== false && obj.required !== 'false' && obj.required !== 0 && obj.required !== '') {
    throw new Error(`Param '${key}' required must be a boolean`)
  }

  if (obj.default !== undefined && obj.default !== null && obj.default !== '') {
    const def = coerceDefault(typeRaw, obj.default, key)
    const issues = checkParamValue(spec, def, 'default')
    if (issues.length) throw new Error(issues[0]!.message)
    spec.default = def
  }

  return spec
}

export function normalizeParamSpecs(
  raw: ModuleParamSpec[] | undefined,
  moduleId: string
): ModuleParamSpec[] | undefined {
  if (!raw || raw.length === 0) return undefined
  const specs: ModuleParamSpec[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const def = normalizeParamSpec(item, moduleId)
    const lower = def.key.toLowerCase()
    if (seen.has(lower)) throw new Error(`Module '${moduleId}' has duplicate param '${def.key}'`)
    seen.add(lower)
    specs.push(def)
  }
  return specs
}

export function formatParamSpec(spec: ModuleParamSpec): string {
  const bits = [spec.key, spec.type]
  if (spec.min !== undefined || spec.max !== undefined) {
    bits.push(`${spec.min ?? ''}–${spec.max ?? ''}`)
  }
  if (spec.options?.length) bits.push(spec.options.join('|'))
  if (spec.required) bits.push('required')
  if (spec.default !== undefined) bits.push(`default ${String(spec.default)}`)
  return bits.join(' ')
}

function checkParamValue(spec: ModuleParamSpec, value: unknown, path: string): ContentIssue[] {
  const issues: ContentIssue[] = []
  if (spec.type === 'int') {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(n)) {
      issues.push(warningIssue(path, `Param '${spec.key}' must be an integer`))
      return issues
    }
    if (spec.min !== undefined && n < spec.min) {
      issues.push(warningIssue(path, `Param '${spec.key}' must be >= ${spec.min}`))
    }
    if (spec.max !== undefined && n > spec.max) {
      issues.push(warningIssue(path, `Param '${spec.key}' must be <= ${spec.max}`))
    }
    return issues
  }
  if (spec.type === 'float') {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) {
      issues.push(warningIssue(path, `Param '${spec.key}' must be a number`))
      return issues
    }
    if (spec.min !== undefined && n < spec.min) {
      issues.push(warningIssue(path, `Param '${spec.key}' must be >= ${spec.min}`))
    }
    if (spec.max !== undefined && n > spec.max) {
      issues.push(warningIssue(path, `Param '${spec.key}' must be <= ${spec.max}`))
    }
    return issues
  }
  if (spec.type === 'bool') {
    if (typeof value !== 'boolean') {
      issues.push(warningIssue(path, `Param '${spec.key}' must be a boolean`))
    }
    return issues
  }
  if (spec.type === 'enum') {
    const s = String(value ?? '')
    const options = spec.options || []
    if (!options.some((o) => o === s)) {
      issues.push(
        warningIssue(path, `Param '${spec.key}' must be one of ${options.join(', ') || '(none)'}`)
      )
    }
    return issues
  }
  if (typeof value !== 'string') {
    issues.push(warningIssue(path, `Param '${spec.key}' must be a string`))
  }
  return issues
}

export function validateParamsAgainstSpecs(
  specs: ModuleParamSpec[] | undefined,
  params: Record<string, number | string | boolean> | undefined,
  path: string
): ContentIssue[] {
  if (!specs || specs.length === 0) return []
  const values = params || {}
  const issues: ContentIssue[] = []
  for (const spec of specs) {
    const fieldPath = `${path}.${spec.key}`
    if (!Object.prototype.hasOwnProperty.call(values, spec.key)) {
      if (spec.required) {
        issues.push(warningIssue(fieldPath, `Required param '${spec.key}' is missing from the encounter tuning row`))
      }
      continue
    }
    issues.push(...checkParamValue(spec, values[spec.key], fieldPath))
  }
  return issues
}

export function validateEncounterParamSpecs(
  pipeline: AssetPipelineProject,
  encounter: Encounter,
  path = 'encounter'
): ContentIssue[] {
  const game = (pipeline.games || []).find((g) => g.id === encounter.gameId)
  const modules: GameEncounterModule[] = game?.settings?.modules || []
  const mod = modules.find((m) => m.id === encounter.moduleId)
  const specs = mod?.paramSpecs
  if (!specs || specs.length === 0) return []
  const def = (pipeline.gameDefinitions || []).find((d) => d.gameId === encounter.gameId)
  const profiles = def?.tuningProfiles || []
  const raw = String(encounter.tuningProfileId || '').trim()
  const profile = raw
    ? profiles.find((p) => p.id === raw) || profiles.find((p) => p.name === raw)
    : undefined
  return validateParamsAgainstSpecs(specs, profile?.params, `${path}.params`)
}

export function collectParamSpecUsers(
  pipeline: AssetPipelineProject,
  gameId: string,
  moduleId: string,
  key: string
): NamedUser[] {
  const users: NamedUser[] = []
  const def = (pipeline.gameDefinitions || []).find((d) => d.gameId === gameId)
  const profiles = def?.tuningProfiles || []
  for (const enc of pipeline.encounters || []) {
    if (enc.gameId !== gameId || enc.moduleId !== moduleId) continue
    const raw = String(enc.tuningProfileId || '').trim()
    if (!raw) continue
    const profile = profiles.find((p) => p.id === raw) || profiles.find((p) => p.name === raw)
    if (profile && Object.prototype.hasOwnProperty.call(profile.params || {}, key)) {
      users.push({ id: enc.id, name: enc.name, kind: 'encounter' })
    }
  }
  return users
}

export function assertCanRemoveParamSpec(
  pipeline: AssetPipelineProject,
  gameId: string,
  moduleId: string,
  key: string
): void {
  const users = collectParamSpecUsers(pipeline, gameId, moduleId, key)
  if (users.length > 0) {
    throw new Error(formatInUseError('param spec', key, users))
  }
}
