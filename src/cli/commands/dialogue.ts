/**
 * forge dialogue — Step 4 dialogue trees and play.
 */

import { Command } from 'commander'
import {
  addDialogueChoice,
  addDialogueNode,
  createDialogue,
  listDialogues,
  playDialogueRecord,
  removeDialogue,
  removeDialogueChoice,
  removeDialogueNode,
  showDialogue,
  updateDialogue,
  updateDialogueChoice,
  updateDialogueNode,
  type DialogueInput
} from '@core/storage/dialogueService'
import type { DialogueChoice, DialogueNode } from '@shared/types/assetPipeline'
import { output, outputError } from '../utils/output'

interface CommonOpts {
  dataDir?: string
  json?: boolean
  game?: string
  dryRun?: boolean
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

function dir(opts: CommonOpts): string | undefined {
  return opts.dataDir
}

function printOrJson(data: unknown, opts: CommonOpts, text: () => void): void {
  if (opts.json) output(data, opts)
  else text()
}

function parseJsonFlag(raw: unknown, flag: string): unknown {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`${flag} must be JSON`)
  }
}

function parseChoices(raw: unknown): number[] {
  if (raw === undefined || raw === null || raw === '') return []
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
}

function nodeFromOptions(options: Record<string, unknown>): DialogueNode {
  const node: DialogueNode = {
    id: String(options.id || options.nodeId || '').trim(),
    speaker: String(options.speaker || '').trim(),
    text: String(options.text || '')
  }
  if (options.pose !== undefined || options.poseSlot !== undefined) {
    node.poseSlot = String(options.pose || options.poseSlot)
  }
  if (options.next !== undefined) node.next = String(options.next)
  if (options.effects !== undefined) node.effects = parseJsonFlag(options.effects, '--effects') as DialogueNode['effects']
  if (options.choices !== undefined) node.choices = parseJsonFlag(options.choices, '--choices') as DialogueChoice[]
  return node
}

export function registerDialogueCommands(program: Command): void {
  const cmd = program.command('dialogue').description('Manage dialogue trees (Step 4)')

  cmd
    .command('list')
    .description('List dialogues in a game')
    .requiredOption('--game <id>', 'Game ID')
    .option('--canon <status>', 'Filter draft | approved')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const dialogues = (await listDialogues(opts.game!, dir(opts))).filter((d) => {
          const wanted = String(options.canon || '').trim()
          if (!wanted) return true
          const status = d.canonStatus === 'approved' ? 'approved' : 'draft'
          return status === wanted
        })
        printOrJson({ dialogues }, opts, () => {
          console.log('\nDialogues:')
          if (dialogues.length === 0) console.log('  (none)')
          for (const d of dialogues) {
            console.log(`  ${d.id}${d.key ? ` @${d.key}` : ''}  ${d.name}  nodes=${d.nodes.length}  start=${d.startNodeId}`)
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  cmd
    .command('show')
    .argument('<id>', 'Dialogue uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const record = await showDialogue(opts.game!, String(id), dir(opts))
        printOrJson({ record }, opts, () => console.log(JSON.stringify(record, null, 2)))
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  cmd
    .command('create')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--name <name>', 'Name')
    .option('--key <key>', 'Optional slug')
    .option('--start <id>', 'startNodeId')
    .option('--nodes <json>', 'JSON array of nodes')
    .option('--entry-variants <json>', 'JSON array of { condition, startNodeId }')
    .option('--notes <text>', 'Notes')
    .option('--canon <status>', 'draft | approved')
    .option('--dry-run', 'Validate without writing')
    .action(async (options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const input: DialogueInput = {
          name: String(options.name),
          key: options.key,
          startNodeId: options.start,
          nodes: parseJsonFlag(options.nodes, '--nodes') as DialogueInput['nodes'],
          entryVariants: parseJsonFlag(options.entryVariants, '--entry-variants') as DialogueInput['entryVariants'],
          notes: options.notes,
          canonStatus: options.canon
        }
        const { record } = await createDialogue(opts.game!, input, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would create' : 'Created'} dialogue: ${record.name} (${record.id})`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  cmd
    .command('update')
    .argument('<id>', 'Dialogue uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--name <name>', 'Name')
    .option('--key <key>', 'Slug')
    .option('--start <id>', 'startNodeId')
    .option('--nodes <json>', 'JSON array of nodes')
    .option('--entry-variants <json>', 'JSON array of { condition, startNodeId }')
    .option('--notes <text>', 'Notes')
    .option('--canon <status>', 'draft | approved')
    .option('--dry-run', 'Validate without writing')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const patch: DialogueInput = {}
        if (options.name !== undefined) patch.name = String(options.name)
        if (options.key !== undefined) patch.key = String(options.key)
        if (options.start !== undefined) patch.startNodeId = String(options.start)
        if (options.nodes !== undefined) patch.nodes = parseJsonFlag(options.nodes, '--nodes') as DialogueInput['nodes']
        if (options.entryVariants !== undefined) {
          patch.entryVariants = parseJsonFlag(options.entryVariants, '--entry-variants') as DialogueInput['entryVariants']
        }
        if (options.notes !== undefined) patch.notes = String(options.notes)
        if (options.canon !== undefined) patch.canonStatus = String(options.canon)
        const { record } = await updateDialogue(opts.game!, String(id), patch, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would update' : 'Updated'} dialogue: ${record.name} (${record.id})`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  cmd
    .command('remove')
    .argument('<id>', 'Dialogue uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const result = await removeDialogue(opts.game!, String(id), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ ...result, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} dialogue: ${result.removed}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const node = cmd.command('node').description('Add, update, or remove a dialogue node')
  node
    .command('add')
    .argument('<dialogue>', 'Dialogue uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--id <id>', 'Node slug')
    .requiredOption('--speaker <who>', 'npc id/@key, hero, or narrator')
    .requiredOption('--text <text>', 'Line text')
    .option('--pose <slot>', 'Pose slot')
    .option('--next <id>', 'Next node id')
    .option('--effects <json>', 'Effects JSON array')
    .option('--dry-run', 'Validate without writing')
    .action(async (dialogue, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const { record } = await addDialogueNode(opts.game!, String(dialogue), nodeFromOptions(options), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would add' : 'Added'} node ${options.id} on ${record.name}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  node
    .command('update')
    .argument('<dialogue>', 'Dialogue uuid or @key')
    .argument('<node>', 'Node id')
    .requiredOption('--game <id>', 'Game ID')
    .option('--speaker <who>', 'Speaker')
    .option('--text <text>', 'Line text')
    .option('--pose <slot>', 'Pose slot')
    .option('--next <id>', 'Next node id')
    .option('--effects <json>', 'Effects JSON array')
    .option('--dry-run', 'Validate without writing')
    .action(async (dialogue, nodeId, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const patch: Partial<DialogueNode> = {}
        if (options.speaker !== undefined) patch.speaker = String(options.speaker)
        if (options.text !== undefined) patch.text = String(options.text)
        if (options.pose !== undefined) patch.poseSlot = String(options.pose)
        if (options.next !== undefined) patch.next = String(options.next)
        if (options.effects !== undefined) patch.effects = parseJsonFlag(options.effects, '--effects') as DialogueNode['effects']
        const { record } = await updateDialogueNode(opts.game!, String(dialogue), String(nodeId), patch, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would update' : 'Updated'} node ${nodeId}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  node
    .command('remove')
    .argument('<dialogue>', 'Dialogue uuid or @key')
    .argument('<node>', 'Node id')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (dialogue, nodeId, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const { record } = await removeDialogueNode(opts.game!, String(dialogue), String(nodeId), {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} node ${nodeId} from ${record.name}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  const choice = cmd.command('choice').description('Add, update, or remove a dialogue choice')
  choice
    .command('add')
    .argument('<dialogue>', 'Dialogue uuid or @key')
    .argument('<node>', 'Node id')
    .requiredOption('--game <id>', 'Game ID')
    .requiredOption('--text <text>', 'Choice text')
    .requiredOption('--next <id>', 'Next node id')
    .option('--condition <json>', 'Condition JSON')
    .option('--effects <json>', 'Effects JSON array')
    .option('--dry-run', 'Validate without writing')
    .action(async (dialogue, nodeId, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const row: DialogueChoice = {
          text: String(options.text),
          next: String(options.next),
          condition: parseJsonFlag(options.condition, '--condition') as DialogueChoice['condition'],
          effects: parseJsonFlag(options.effects, '--effects') as DialogueChoice['effects']
        }
        const { record } = await addDialogueChoice(opts.game!, String(dialogue), String(nodeId), row, {
          dataDirOverride: dir(opts),
          dryRun: Boolean(opts.dryRun)
        })
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would add' : 'Added'} choice on ${nodeId}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  choice
    .command('update')
    .argument('<dialogue>', 'Dialogue uuid or @key')
    .argument('<node>', 'Node id')
    .argument('<index>', '1-based choice index')
    .requiredOption('--game <id>', 'Game ID')
    .option('--text <text>', 'Choice text')
    .option('--next <id>', 'Next node id')
    .option('--condition <json>', 'Condition JSON')
    .option('--effects <json>', 'Effects JSON array')
    .option('--dry-run', 'Validate without writing')
    .action(async (dialogue, nodeId, indexArg, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const patch: Partial<DialogueChoice> = {}
        if (options.text !== undefined) patch.text = String(options.text)
        if (options.next !== undefined) patch.next = String(options.next)
        if (options.condition !== undefined) {
          patch.condition = parseJsonFlag(options.condition, '--condition') as DialogueChoice['condition']
        }
        if (options.effects !== undefined) patch.effects = parseJsonFlag(options.effects, '--effects') as DialogueChoice['effects']
        const { record } = await updateDialogueChoice(
          opts.game!,
          String(dialogue),
          String(nodeId),
          Number(indexArg) - 1,
          patch,
          { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
        )
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would update' : 'Updated'} choice ${indexArg}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  choice
    .command('remove')
    .argument('<dialogue>', 'Dialogue uuid or @key')
    .argument('<node>', 'Node id')
    .argument('<index>', '1-based choice index')
    .requiredOption('--game <id>', 'Game ID')
    .option('--dry-run', 'Validate without writing')
    .action(async (dialogue, nodeId, indexArg, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const { record } = await removeDialogueChoice(
          opts.game!,
          String(dialogue),
          String(nodeId),
          Number(indexArg) - 1,
          { dataDirOverride: dir(opts), dryRun: Boolean(opts.dryRun) }
        )
        printOrJson({ record, dryRun: Boolean(opts.dryRun) }, opts, () => {
          console.log(`${opts.dryRun ? 'Would remove' : 'Removed'} choice ${indexArg} from ${record.name}`)
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })

  cmd
    .command('play')
    .description('Play a dialogue tree deterministically')
    .argument('<id>', 'Dialogue uuid or @key')
    .requiredOption('--game <id>', 'Game ID')
    .option('--choices <list>', 'Comma-separated 1-based visible choice indexes')
    .option('--flags <k=v,...>', 'Flag assignments')
    .action(async (id, options, c) => {
      const opts = { ...program.opts(), ...collectOpts(c, options) }
      try {
        const result = await playDialogueRecord(
          opts.game!,
          String(id),
          { flags: options.flags ? String(options.flags) : undefined, choices: parseChoices(options.choices) },
          dir(opts)
        )
        printOrJson({ result }, opts, () => {
          console.log(`\nPlay ${result.name} (start ${result.startNodeId})`)
          for (const step of result.steps) {
            console.log(`  [${step.nodeId}] ${step.speakerName}: ${step.text}`)
            if (step.choiceText) console.log(`    -> ${step.choiceText}`)
          }
          console.log(`  ended=${result.ended}  ${result.endReason}`)
          if (result.grantedRevealTokens.length) {
            console.log('  Granted reveal tokens:')
            for (const t of result.grantedRevealTokens) {
              console.log(`    ${t.title}${t.key ? ` @${t.key}` : ''}`)
            }
          }
        })
      } catch (err) {
        outputError(err, opts)
        process.exit(1)
      }
    })
}
