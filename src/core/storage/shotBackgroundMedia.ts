/**
 * Copy a user-selected image into studio-owned backgrounds/ storage.
 * Stores a relative path (not the original external source).
 */

import { copyFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import { getDataDir } from './dataDir'

export function isAbsoluteFilesystemPath(filePath: string): boolean {
  return filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath)
}

/**
 * Copy `sourcePath` into `<dataDir>/backgrounds/` and return `backgrounds/<file>`.
 * Throws if the source is missing. Does not rewrite visual-asset records.
 */
export async function importDirectShotBackground(
  sourcePath: string,
  dataDirOverride?: string
): Promise<string> {
  if (!sourcePath || sourcePath.startsWith('forge-file:') || sourcePath.startsWith('local-file:')) {
    throw new Error(`Background image path is not a readable file: ${sourcePath || '(empty)'}`)
  }

  if (!isAbsoluteFilesystemPath(sourcePath)) {
    // Already a studio-relative path (legacy backgrounds/… or in-studio).
    return sourcePath.replace(/\\/g, '/')
  }

  if (!existsSync(sourcePath)) {
    throw new Error(`Background image not found: ${sourcePath}`)
  }

  const dataDir = getDataDir(dataDirOverride)
  const backgroundsDir = join(dataDir, 'backgrounds')
  await mkdir(backgroundsDir, { recursive: true })

  const filename = `${Date.now()}-${basename(sourcePath)}`
  const destPath = join(backgroundsDir, filename)
  await copyFile(sourcePath, destPath)
  return `backgrounds/${filename}`
}
