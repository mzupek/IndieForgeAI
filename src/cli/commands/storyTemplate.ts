/**
 * forge story-template — list/show built-in (and studio) story templates.
 */

import { Command } from 'commander'
import { getStoryTemplate, listStoryTemplates } from '@shared/story/templates'
import { output, outputError } from '../utils/output'

interface CommonOpts {
  dataDir?: string
  json?: boolean
}

function collectOpts(cmd: Command, options: Record<string, unknown>): CommonOpts {
  const collected: Record<string, unknown> = {}
  let current: Command | null = cmd
  while (current) {
    Object.assign(collected, current.opts())
    current = current.parent
  }
  return { ...collected, ...options } as CommonOpts
}

export function registerStoryTemplateCommands(program: Command): void {
  const cmd = program.command('story-template').description('List built-in story templates (game-agnostic)')

  cmd
    .command('list')
    .description('List story templates')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const templates = listStoryTemplates()
        if (opts.json) output({ templates }, opts)
        else {
          console.log('\nStory templates:')
          for (const t of templates) {
            console.log(`  ${t.key}  ${t.name}${t.builtin ? '  (built-in)' : ''}`)
          }
        }
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  cmd
    .command('show')
    .argument('<key>', 'Template key')
    .action(async (key, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const template = getStoryTemplate(String(key))
        if (opts.json) output({ template }, opts)
        else console.log(JSON.stringify(template, null, 2))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
