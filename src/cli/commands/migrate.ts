/**
 * forge migrate — explicit studio.json v1 → v2. The app never auto-migrates.
 */

import { Command } from 'commander'
import { getDataDir } from '../../core/storage/dataDir'
import { migrateStudio, migrateStudioDryRun } from '../../core/storage/studioMigrate'
import { output, outputError } from '../utils/output'

function collectOpts(cmd: Command, options: Record<string, unknown>) {
  const collected: Record<string, unknown> = {}
  let current: Command | null = cmd
  while (current) {
    Object.assign(collected, current.opts())
    current = current.parent
  }
  return { ...collected, ...options } as { json?: boolean; dataDir?: string; dryRun?: boolean }
}

export function registerMigrateCommand(program: Command): void {
  program
    .command('migrate')
    .description(
      'Upgrade studio.json to schema v2 (backup first). The app never auto-migrates. Use --dry-run first.'
    )
    .option('--dry-run', 'Print what would change; write nothing (no lock, no backup)')
    .option('--json', 'Output JSON')
    .action(async (options, cmd) => {
      const opts = collectOpts(cmd, options)
      try {
        const dataDir = getDataDir(opts.dataDir)
        const result = opts.dryRun
          ? await migrateStudioDryRun(dataDir)
          : await migrateStudio(dataDir)

        if (opts.json) {
          output(result, opts)
          return
        }

        if (result.alreadyCurrent) {
          console.log(`Already at schemaVersion ${result.plan.targetSchemaVersion}. Nothing written.`)
          console.log(`studio.json: ${result.studioPath}`)
          return
        }

        if (result.dryRun) {
          console.log('Dry run — studio.json will not be written.')
          console.log(`studio.json: ${result.studioPath}`)
          console.log(
            `Current: studio ${result.plan.currentStudioSchemaVersion}, pipeline ${result.plan.currentPipelineSchemaVersion}`
          )
          console.log(`Target:  ${result.plan.targetSchemaVersion}`)
          console.log('Changes:')
          for (const change of result.plan.changes) {
            console.log(`  - ${change.detail}`)
          }
          if (result.backupPath) {
            console.log(`Backup would be: ${result.backupPath}`)
          }
          console.log('\nQuit the app, then run:  forge migrate')
          return
        }

        console.log(`Migrated studio.json to schemaVersion ${result.plan.targetSchemaVersion}`)
        console.log(`studio.json: ${result.studioPath}`)
        if (result.backupPath) {
          console.log(`Backup: ${result.backupPath}`)
        }
        console.log('Reopen the app. Existing screens should look the same.')
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
