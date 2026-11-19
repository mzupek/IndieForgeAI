/**
 * Explicit studio.json v1 → v2 migrate. The app never calls this.
 * Backup + atomic write under the existing studio lock.
 */

import { copyFile, readFile, stat } from 'fs/promises'
import { createHash } from 'crypto'
import { join } from 'path'
import { getDataDir } from './dataDir'
import { getStudioFilePath, type StudioData } from './studioStorage'
import { withLock, atomicWriteFile } from './fileLock'
import {
  STUDIO_SCHEMA_VERSION,
  applyStudioV2Migration,
  assertSupportedStudioSchema,
  normalizeStudioInMemory,
  planStudioV2Migration,
  type StudioMigrationPlan,
  validateStudioV2
} from '../../shared/studio/schema'

export interface MigrateResult {
  dryRun: boolean
  written: boolean
  alreadyCurrent: boolean
  backupPath: string | null
  studioPath: string
  plan: StudioMigrationPlan
}

function backupFileName(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `studio.v1-backup-${stamp}.json`
}

async function sha256(buf: Buffer): Promise<string> {
  return createHash('sha256').update(buf).digest('hex')
}

async function readExistingStudio(filePath: string): Promise<{ raw: Buffer; studio: StudioData }> {
  const raw = await readFile(filePath)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString('utf-8'))
  } catch (err) {
    throw new Error(
      `studio.json is not valid JSON (${filePath}): ${err instanceof Error ? err.message : String(err)}`
    )
  }
  const studio = parsed as StudioData
  assertSupportedStudioSchema(studio)
  normalizeStudioInMemory(studio)
  return { raw, studio }
}

/**
 * Plan-only. No lock, no writes. studio.json mtime/hash unchanged.
 */
export async function migrateStudioDryRun(dataDirOverride?: string): Promise<MigrateResult> {
  const studioPath = getStudioFilePath(dataDirOverride)
  try {
    await stat(studioPath)
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ENOENT') {
      throw new Error(
        `No studio.json at ${studioPath}. Nothing to migrate. (Read paths never create this file.)`
      )
    }
    throw err
  }
  const { studio } = await readExistingStudio(studioPath)
  const plan = planStudioV2Migration(studio)
  return {
    dryRun: true,
    written: false,
    alreadyCurrent: plan.alreadyCurrent,
    backupPath: plan.alreadyCurrent ? null : join(getDataDir(dataDirOverride), backupFileName()),
    studioPath,
    plan
  }
}

/**
 * Backup (byte-verified) then bump to schema v2 atomically. Idempotent if already v2.
 */
export async function migrateStudio(dataDirOverride?: string): Promise<MigrateResult> {
  const studioPath = getStudioFilePath(dataDirOverride)
  const lockPath = `${studioPath}.lock`

  return withLock(lockPath, async () => {
    try {
      await stat(studioPath)
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') {
        throw new Error(`No studio.json at ${studioPath}. Nothing to migrate.`)
      }
      throw err
    }

    const { raw, studio } = await readExistingStudio(studioPath)
    const plan = planStudioV2Migration(studio)
    if (plan.alreadyCurrent) {
      return {
        dryRun: false,
        written: false,
        alreadyCurrent: true,
        backupPath: null,
        studioPath,
        plan
      }
    }

    const backupPath = join(getDataDir(dataDirOverride), backupFileName())
    await copyFile(studioPath, backupPath)
    const backupRaw = await readFile(backupPath)
    if ((await sha256(raw)) !== (await sha256(backupRaw))) {
      throw new Error(`Backup hash mismatch: ${backupPath} does not match ${studioPath}`)
    }
    JSON.parse(backupRaw.toString('utf-8'))

    const next = applyStudioV2Migration(studio)
    validateStudioV2(next)
    next.updatedAt = new Date().toISOString()
    await atomicWriteFile(studioPath, JSON.stringify(next, null, 2))

    return {
      dryRun: false,
      written: true,
      alreadyCurrent: false,
      backupPath,
      studioPath,
      plan
    }
  })
}

export { STUDIO_SCHEMA_VERSION }
