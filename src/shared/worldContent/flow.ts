/**
 * Read-only world flow tree. Errors are validator refusals; the rest are warnings
 * so content can be built in any order.
 */

import type { AssetPipelineProject, Region, Stage, World } from '../types/assetPipeline'
import { errorIssue, warningIssue, type ContentIssue } from './issues'
import {
  encountersOf,
  mapNodeForStage,
  regionsOf,
  stagesOf,
  validateEncounter,
  validateRegion,
  validateStage,
  validateWorld
} from './validate'
import { encounterFlowExtras } from './encounterLinks'
import { summarizeCondition } from '../story/conditions'
import { collectFlagUsageWarnings } from '../story/flags'
import { triggersOf, validateTrigger } from '../story/triggers'
import { npcsInRegion, validateNpc } from '../story/npcs'
import { storyCirclesOf, validateStoryCircle } from '../story/circles'

export type FlowKind = 'world' | 'node' | 'stage' | 'region' | 'hotspot' | 'encounter' | 'exit' | 'npc' | 'circle'

export interface FlowLine {
  id: string
  kind: FlowKind
  label: string
  status: 'ok' | 'warning' | 'error'
  issues: ContentIssue[]
  recordKind?: 'world' | 'stage' | 'region' | 'encounter'
  recordId?: string
  locked?: boolean
  children: FlowLine[]
}

export interface WorldFlow {
  worldId: string
  worldName: string
  tree: FlowLine
  issues: ContentIssue[]
}

function worst(issues: ContentIssue[]): 'ok' | 'warning' | 'error' {
  if (issues.some((i) => i.level === 'error')) return 'error'
  if (issues.some((i) => i.level === 'warning')) return 'warning'
  return 'ok'
}

function neighbors(world: World, nodeId: string): string[] {
  const out: string[] = []
  for (const p of world.map?.paths || []) {
    if (p.from === nodeId) out.push(p.to)
    else if (p.to === nodeId) out.push(p.from)
  }
  return out
}

function reachableNodeIds(world: World): Set<string> {
  const start = world.map?.startNodeId
  const ids = new Set<string>()
  if (!start || !(world.map?.nodes || []).some((n) => n.id === start)) return ids
  const queue = [start]
  ids.add(start)
  while (queue.length) {
    const cur = queue.shift()!
    for (const n of neighbors(world, cur)) {
      if (ids.has(n)) continue
      ids.add(n)
      queue.push(n)
    }
  }
  return ids
}

function regionNeighbors(pipeline: AssetPipelineProject, regionId: string): string[] {
  const region = (pipeline.regions || []).find((r) => r.id === regionId)
  if (!region) return []
  const out: string[] = []
  for (const ex of region.exits || []) {
    if (ex.toWorldMap) continue
    if (ex.toRegionId) out.push(ex.toRegionId)
  }
  return out
}

function reachableRegionIds(pipeline: AssetPipelineProject, entryId: string | undefined): Set<string> {
  const ids = new Set<string>()
  if (!entryId) return ids
  const queue = [entryId]
  ids.add(entryId)
  while (queue.length) {
    const cur = queue.shift()!
    for (const n of regionNeighbors(pipeline, cur)) {
      if (ids.has(n)) continue
      ids.add(n)
      queue.push(n)
    }
  }
  return ids
}

function hotspotEncounterIds(regions: Region[]): Set<string> {
  const ids = new Set<string>()
  for (const r of regions) {
    for (const hs of r.hotspots || []) {
      if (hs.encounterId) ids.add(hs.encounterId)
    }
  }
  return ids
}

function stageHasMapExit(regions: Region[]): boolean {
  return regions.some((r) => (r.exits || []).some((ex) => ex.toWorldMap))
}

function attach(line: FlowLine, extra: ContentIssue[]): void {
  line.issues.push(...extra)
  const status = worst(line.issues)
  if (status === 'error' || (status === 'warning' && line.status !== 'error')) {
    line.status = status
  }
}

function flattenIssues(line: FlowLine, acc: ContentIssue[]): void {
  acc.push(...line.issues)
  for (const child of line.children) flattenIssues(child, acc)
}

export function buildWorldFlow(pipeline: AssetPipelineProject, world: World): WorldFlow {
  const worldIssues = validateWorld(pipeline, world, `worlds.${world.key || world.id}`)
  const tree: FlowLine = {
    id: `world:${world.id}`,
    kind: 'world',
    label: world.name,
    status: worst(worldIssues),
    issues: [...worldIssues],
    recordKind: 'world',
    recordId: world.id,
    children: []
  }

  const map = world.map
  if (!map || !(map.nodes || []).length || !map.startNodeId) {
    attach(tree, [warningIssue(`worlds.${world.id}.map`, 'No map or start node')])
  }

  const stages = stagesOf(pipeline, world.gameId, world.id).sort((a, b) => a.order - b.order)
  const reachable = reachableNodeIds(world)
  const startId = map?.startNodeId
  const orderedNodes = [...(map?.nodes || [])].sort((a, b) => {
    if (a.id === startId) return -1
    if (b.id === startId) return 1
    return a.id.localeCompare(b.id)
  })

  const stagesWithNodes = new Set(orderedNodes.map((n) => n.stageId))
  attach(tree, collectFlagUsageWarnings(pipeline, world.gameId))
  for (const trigger of triggersOf(pipeline, world.gameId)) {
    attach(tree, validateTrigger(pipeline, trigger, `triggers.${trigger.key || trigger.id}`))
  }

  function stageLine(stage: Stage, nodeId?: string): FlowLine {
    const path = `stages.${stage.key || stage.id}`
    const issues = validateStage(pipeline, stage, path)
    const locked =
      (Array.isArray(stage.unlockAfter) && stage.unlockAfter.length > 0) || Boolean(stage.unlockCondition)
    const unlockSummary = stage.unlockCondition
      ? summarizeCondition(pipeline, world.gameId, stage.unlockCondition)
      : ''
    const line: FlowLine = {
      id: `stage:${stage.id}`,
      kind: 'stage',
      label: unlockSummary ? `${stage.name} — unlock: ${unlockSummary}` : stage.name,
      status: worst(issues),
      issues: [...issues],
      recordKind: 'stage',
      recordId: stage.id,
      locked,
      children: []
    }
    if (!mapNodeForStage(world, stage.id)) {
      attach(line, [warningIssue(`${path}.node`, 'Stage has no map node')])
    }
    if (locked) {
      const missing = (stage.unlockAfter || []).filter((id) => {
        const other = stages.find((s) => s.id === id)
        if (!other) return true
        const otherNode = mapNodeForStage(world, other.id)
        if (!otherNode) return true
        return !reachable.has(otherNode.id)
      })
      if (missing.length) {
        attach(
          line,
          [warningIssue(`${path}.unlockAfter`, 'Unlock can never happen (a required stage is missing or unreachable)')]
        )
      }
    }

    const stageRegions = regionsOf(pipeline, stage.gameId, stage.id)
    const stageEncounters = encountersOf(pipeline, stage.gameId, stage.id)
    if (!stage.entryRegionId) {
      attach(line, [warningIssue(`${path}.entryRegionId`, 'No entry region')])
    }
    const reachedRegions = reachableRegionIds(pipeline, stage.entryRegionId)
    for (const region of stageRegions) {
      if (stage.entryRegionId && !reachedRegions.has(region.id)) {
        attach(
          line,
          [warningIssue(`regions.${region.id}`, `Region '${region.name}' cannot be reached from the entry region`)]
        )
      }
    }
    if (stageRegions.length > 0 && !stageHasMapExit(stageRegions)) {
      attach(line, [warningIssue(`${path}.return`, 'Stage has no exit back to the world map')])
    }

    const linked = hotspotEncounterIds(stageRegions)
    for (const enc of stageEncounters) {
      if (!linked.has(enc.id)) {
        attach(line, [warningIssue(`encounters.${enc.id}`, `Encounter '${enc.name}' is not started by any hotspot`)])
      }
    }

    for (const circle of storyCirclesOf(pipeline, stage.gameId).filter(
      (c) => c.scope === 'stage' && c.refId === stage.id
    )) {
      const circlePath = `storyCircles.${circle.key || circle.id}`
      const circleIssues = validateStoryCircle(pipeline, circle, circlePath)
      line.children.push({
        id: `circle:${circle.id}`,
        kind: 'circle',
        label: `Circle: ${circle.name}`,
        status: worst(circleIssues),
        issues: circleIssues,
        recordKind: 'stage',
        recordId: stage.id,
        children: []
      })
    }

    const entry = stageRegions.find((r) => r.id === stage.entryRegionId)
    const otherRegions = stageRegions.filter((r) => r.id !== stage.entryRegionId)
    const regionOrder = entry ? [entry, ...otherRegions] : stageRegions
    for (const region of regionOrder) {
      line.children.push(regionLine(region, stage, reachedRegions.has(region.id)))
    }
    void nodeId
    return line
  }

  function regionLine(region: Region, stage: Stage, reachableFromEntry: boolean): FlowLine {
    const path = `regions.${region.key || region.id}`
    const issues = validateRegion(pipeline, region, path)
    const line: FlowLine = {
      id: `region:${region.id}`,
      kind: 'region',
      label: region.name + (region.id === stage.entryRegionId ? ' (entry)' : ''),
      status: worst(issues),
      issues: [...issues],
      recordKind: 'region',
      recordId: region.id,
      children: []
    }
    if (stage.entryRegionId && !reachableFromEntry) {
      attach(line, [warningIssue(path, 'Unreachable from the entry region')])
    }
    for (const hs of region.hotspots || []) {
      const hsIssues: ContentIssue[] = []
      if (hs.encounterId) {
        const enc = (pipeline.encounters || []).find((e) => e.id === hs.encounterId)
        if (!enc) {
          hsIssues.push(warningIssue(`${path}.hotspots.${hs.id}`, `Hotspot '${hs.id}' encounter is missing`))
        }
      }
      let triggerLabel = ''
      if (hs.triggerId) {
        const trigger = triggersOf(pipeline, world.gameId).find((t) => t.id === hs.triggerId)
        if (trigger) triggerLabel = ` [${trigger.name}]`
        else {
          hsIssues.push(warningIssue(`${path}.hotspots.${hs.id}`, `Hotspot '${hs.id}' trigger is missing`))
          triggerLabel = ' [missing trigger]'
        }
      }
      const hsLine: FlowLine = {
        id: `hotspot:${region.id}:${hs.id}`,
        kind: 'hotspot',
        label: (hs.prompt || hs.id) + triggerLabel,
        status: worst(hsIssues),
        issues: hsIssues,
        recordKind: 'region',
        recordId: region.id,
        children: []
      }
      if (hs.encounterId) {
        const enc = (pipeline.encounters || []).find((e) => e.id === hs.encounterId)
        if (enc) {
          const encPath = `encounters.${enc.key || enc.id}`
          const encIssues = validateEncounter(pipeline, enc, encPath)
          const extras = encounterFlowExtras(pipeline, enc, encPath)
          const allIssues = [...encIssues, ...extras.issues]
          hsLine.children.push({
            id: `encounter:${enc.id}`,
            kind: 'encounter',
            label: extras.label,
            status: worst(allIssues),
            issues: allIssues,
            recordKind: 'encounter',
            recordId: enc.id,
            children: []
          })
        }
      }
      line.children.push(hsLine)
    }
    for (const { npc, placement } of npcsInRegion(pipeline, region.id)) {
      const npcIssues = validateNpc(pipeline, npc, `npcs.${npc.key || npc.id}`)
      const cond = placement.condition ? ` if ${summarizeCondition(pipeline, world.gameId, placement.condition)}` : ''
      line.children.push({
        id: `npc:${npc.id}:${region.id}:${placement.anchorId}`,
        kind: 'npc',
        label: `${npc.displayName} @ ${placement.anchorId}${cond}`,
        status: worst(npcIssues),
        issues: npcIssues,
        recordKind: 'region',
        recordId: region.id,
        children: []
      })
    }
    for (const ex of region.exits || []) {
      if (ex.toWorldMap) {
        line.children.push({
          id: `exit:${region.id}:${ex.id}`,
          kind: 'exit',
          label: 'Back to world map',
          status: 'ok',
          issues: [],
          recordKind: 'region',
          recordId: region.id,
          children: []
        })
      }
    }
    return line
  }

  for (const node of orderedNodes) {
    const stage = stages.find((s) => s.id === node.stageId)
    const nodeIssues: ContentIssue[] = []
    if (startId && !reachable.has(node.id)) {
      nodeIssues.push(warningIssue(`worlds.${world.id}.map.nodes.${node.id}`, 'No path reaches this node'))
    }
    const nLine: FlowLine = {
      id: `node:${node.id}`,
      kind: 'node',
      label: node.label || stage?.name || node.id,
      status: worst(nodeIssues),
      issues: nodeIssues,
      recordKind: 'stage',
      recordId: stage?.id,
      locked: Boolean(stage && stage.unlockAfter && stage.unlockAfter.length > 0),
      children: []
    }
    if (stage) nLine.children.push(stageLine(stage, node.id))
    else attach(nLine, [warningIssue(`worlds.${world.id}.map.nodes.${node.id}`, 'Node stage is missing')])
    tree.children.push(nLine)
  }

  for (const stage of stages) {
    if (stagesWithNodes.has(stage.id)) continue
    tree.children.push(stageLine(stage))
  }

  const issues: ContentIssue[] = []
  flattenIssues(tree, issues)
  tree.status = worst(issues)
  return { worldId: world.id, worldName: world.name, tree, issues }
}
