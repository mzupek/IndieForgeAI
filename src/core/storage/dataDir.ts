/**
 * Data directory resolution for both Electron app and CLI
 */

import { homedir } from 'os'
import { join } from 'path'

/**
 * Get the data directory for Indie Forge
 * Priority: CLI flag > FORGE_DATA_DIR env var > default location
 */
export function getDataDir(override?: string): string {
  if (override) {
    return override
  }
  
  if (process.env.FORGE_DATA_DIR) {
    return process.env.FORGE_DATA_DIR
  }
  
  // Try to use Electron's userData if available (when running in Electron)
  try {
    // @ts-ignore - Electron may not be available in CLI
    const { app } = require('electron')
    if (app && app.getPath) {
      return app.getPath('userData')
    }
  } catch {
    // Electron not available, fall through to default
  }
  
  // Default: ~/.config/indie-forge-ai (Linux/Mac) or %APPDATA%/indie-forge-ai (Windows)
  const platform = process.platform
  if (platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'indie-forge-ai')
  } else if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'indie-forge-ai')
  } else {
    return join(homedir(), '.config', 'indie-forge-ai')
  }
}

/**
 * Get projects directory
 */
export function getProjectsDir(dataDirOverride?: string): string {
  return join(getDataDir(dataDirOverride), 'projects')
}

/**
 * Get project directory by ID
 */
export function getProjectDir(projectId: string, dataDirOverride?: string): string {
  return join(getProjectsDir(dataDirOverride), projectId)
}

/**
 * Get project file path
 */
export function getProjectFilePath(projectId: string, dataDirOverride?: string): string {
  return join(getProjectDir(projectId, dataDirOverride), 'project.json')
}
