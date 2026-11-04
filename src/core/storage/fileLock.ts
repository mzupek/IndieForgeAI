/**
 * Simple file locking for concurrent access between CLI and Electron app
 */

import { mkdir, writeFile, readFile, unlink, stat } from 'fs/promises'
import { join } from 'path'

const LOCK_TIMEOUT_MS = 5000
const RETRY_DELAY_MS = 100

/**
 * Acquire a lock file
 */
export async function acquireLock(lockPath: string): Promise<void> {
  const startTime = Date.now()
  
  while (true) {
    try {
      // Try to create lock file (exclusive)
      await writeFile(lockPath, `${process.pid}\n${Date.now()}`, { flag: 'wx' })
      return
    } catch (err: any) {
      if (err.code !== 'EEXIST') {
        throw err
      }
      
      // Lock exists, check if stale
      try {
        const lockData = await readFile(lockPath, 'utf-8')
        const [pidStr, timestampStr] = lockData.split('\n')
        const lockTimestamp = parseInt(timestampStr, 10)
        
        // If lock is older than timeout, remove it (stale)
        if (Date.now() - lockTimestamp > LOCK_TIMEOUT_MS) {
          await unlink(lockPath).catch(() => {})
          continue
        }
      } catch {
        // Lock file unreadable, try to remove it
        await unlink(lockPath).catch(() => {})
        continue
      }
      
      // Wait for lock
      if (Date.now() - startTime > LOCK_TIMEOUT_MS) {
        throw new Error('Failed to acquire lock: timeout')
      }
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}

/**
 * Release a lock file
 */
export async function releaseLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath)
  } catch {
    // Ignore errors on release
  }
}

/**
 * Execute a function with a lock
 */
export async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  await acquireLock(lockPath)
  try {
    return await fn()
  } finally {
    await releaseLock(lockPath)
  }
}

/**
 * Atomic write to a file (write to temp, then rename)
 */
export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const tempPath = `${filePath}.tmp.${process.pid}`
  await writeFile(tempPath, data, 'utf-8')
  
  // Rename is atomic on POSIX systems
  await require('fs').promises.rename(tempPath, filePath)
}
