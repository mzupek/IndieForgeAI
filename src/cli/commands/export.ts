/**
 * Export CLI commands
 */

import { readFile } from 'fs/promises'
import { join } from 'path'
import {
  validateExport,
  dryRunExport,
  exportGame
} from '@core/storage/exportService'

interface BaseOptions {
  json?: boolean
  dataDir?: string
}

/**
 * Print the export manifest JSON Schema
 */
export async function schema(options: BaseOptions): Promise<void> {
  try {
    // In bundled CLI, resolve from process.cwd()
    const schemaPath = join(process.cwd(), 'docs/export-manifest-schema.json')
    const schemaContent = await readFile(schemaPath, 'utf-8')
    
    if (options.json) {
      console.log(schemaContent)
    } else {
      const schema = JSON.parse(schemaContent)
      console.log('Export Manifest JSON Schema')
      console.log('===========================\n')
      console.log(`Title: ${schema.title}`)
      console.log(`Version: ${schema.properties.schemaVersion.const}`)
      console.log(`Description: ${schema.description}\n`)
      console.log('Full schema:')
      console.log(JSON.stringify(schema, null, 2))
    }
  } catch (err) {
    if (options.json) {
      console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    } else {
      console.error('Error:', err instanceof Error ? err.message : err)
    }
    process.exit(1)
  }
}

/**
 * Export a game's assets
 */
export async function run(gameId: string, options: BaseOptions & {
  dryRun?: boolean
  target?: string
}): Promise<void> {
  try {
    // Validate first
    const validation = await validateExport(gameId, options.dataDir)
    
    if (options.json) {
      if (options.dryRun) {
        // Dry run mode
        const dryRun = await dryRunExport(gameId, options.target, options.dataDir)
        console.log(JSON.stringify({
          dryRun: true,
          validation,
          ...dryRun
        }, null, 2))
      } else {
        // Check if we can export
        if (!validation.canExport) {
          console.error(JSON.stringify({ 
            error: 'Export validation failed', 
            validation 
          }, null, 2))
          process.exit(1)
        }
        
        // Perform actual export
        const result = await exportGame(gameId, options.target, options.dataDir)
        console.log(JSON.stringify({
          ...result,
          validation
        }, null, 2))
      }
    } else {
      // Human-readable output
      console.log(`Export validation for game: ${gameId}`)
      console.log('='.repeat(50))
      
      if (validation.errors.length > 0) {
        console.log('\n❌ Errors:')
        validation.errors.forEach(err => console.log(`  - ${err}`))
      }
      
      if (validation.warnings.length > 0) {
        console.log('\n⚠️  Warnings:')
        validation.warnings.forEach(warn => console.log(`  - ${warn}`))
      }
      
      if (validation.incompleteCharacters.length > 0) {
        console.log('\n📋 Incomplete Characters:')
        validation.incompleteCharacters.forEach(char => {
          console.log(`  - ${char.name}: missing ${char.missingSlots.join(', ')}`)
        })
      }
      
      if (!validation.canExport) {
        console.log('\n❌ Cannot export due to errors')
        process.exit(1)
      }
      
      if (options.dryRun) {
        console.log('\n🔍 Dry Run - Files that would be copied:\n')
        
        const dryRun = await dryRunExport(gameId, options.target, options.dataDir)
        
        console.log(`Target directory: ${dryRun.targetDir}`)
        console.log(`Manifest: ${dryRun.manifestPath}`)
        console.log(`Total files: ${dryRun.totalFiles}`)
        console.log(`Total size: ${(dryRun.totalSize / 1024 / 1024).toFixed(2)} MB\n`)
        
        if (dryRun.filesToCopy.length === 0) {
          console.log('✓ No files need to be copied (all up to date)')
        } else {
          console.log('Files to copy:')
          dryRun.filesToCopy.forEach(file => {
            const emoji = file.reason === 'new' ? '➕' : '📝'
            console.log(`  ${emoji} ${file.reason}: ${file.destination}`)
          })
        }
      } else {
        console.log('\n📦 Exporting...\n')
        
        const result = await exportGame(gameId, options.target, options.dataDir)
        
        console.log(`✓ Exported to: ${result.targetDir}`)
        console.log(`✓ Copied ${result.copiedFiles} file(s)`)
        console.log(`✓ Manifest: ${result.manifestPath}`)
      }
    }
  } catch (err) {
    if (options.json) {
      console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    } else {
      console.error('Error:', err instanceof Error ? err.message : err)
    }
    process.exit(1)
  }
}
