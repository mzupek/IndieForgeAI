/**
 * Read-only flow preview. Green = complete, flagged lines show warnings/errors.
 * Click a line to open that record.
 */

import { buildWorldFlow, type FlowLine } from '@shared/worldContent/flow'
import type { AssetPipelineProject, World } from '@shared/types/assetPipeline'

export type FlowOpenTarget = {
  tab: 'structure' | 'encounters' | 'regions' | 'map' | 'flow'
  worldId?: string
  stageId?: string
  regionId?: string
  encounterId?: string
  nodeId?: string
}

export function WorldFlowPreview({
  pipeline,
  worlds,
  selectedWorldId,
  onSelectWorld,
  onOpen
}: {
  pipeline: AssetPipelineProject
  worlds: World[]
  selectedWorldId: string | null
  onSelectWorld: (id: string) => void
  onOpen: (target: FlowOpenTarget) => void
}) {
  const world = worlds.find((w) => w.id === selectedWorldId) || worlds[0] || null
  const flow = world ? buildWorldFlow(pipeline, world) : null
  const errors = flow?.issues.filter((i) => i.level === 'error').length || 0
  const warnings = flow?.issues.filter((i) => i.level === 'warning').length || 0

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <label>
          World
          <select
            value={world?.id || ''}
            onChange={(e) => onSelectWorld(e.target.value)}
            style={{ marginLeft: '0.5rem' }}
          >
            {worlds.length === 0 && <option value="">No worlds</option>}
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {flow && (
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {errors} error(s), {warnings} warning(s)
          </span>
        )}
      </div>
      {!flow && <p style={{ color: 'var(--muted)' }}>Select a world</p>}
      {flow && (
        <FlowTree
          line={flow.tree}
          worldId={flow.worldId}
          onOpen={onOpen}
        />
      )}
    </div>
  )
}

function FlowTree({
  line,
  worldId,
  onOpen
}: {
  line: FlowLine
  worldId: string
  onOpen: (target: FlowOpenTarget) => void
}) {
  const color =
    line.status === 'error' ? 'var(--error)' : line.status === 'warning' ? '#c9a227' : '#3d9a5f'
  return (
    <div style={{ marginLeft: line.kind === 'world' ? 0 : '1rem' }}>
      <button
        type="button"
        onClick={() => onOpen(targetOf(line, worldId))}
        style={{
          background: 'transparent',
          border: 'none',
          color,
          cursor: 'pointer',
          textAlign: 'left',
          padding: '0.15rem 0',
          opacity: line.locked ? 0.55 : 1
        }}
      >
        {line.label}
        {line.locked ? ' (locked)' : ''}
        {line.status !== 'ok' ? ` · ${line.status}` : ''}
      </button>
      {line.issues.length > 0 && (
        <ul style={{ margin: '0 0 0.25rem 1.25rem', color, fontSize: '0.8rem' }}>
          {line.issues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}
      {line.children.map((child) => (
        <FlowTree key={child.id} line={child} worldId={worldId} onOpen={onOpen} />
      ))}
    </div>
  )
}

function targetOf(line: FlowLine, worldId: string): FlowOpenTarget {
  if (line.kind === 'node') {
    return { tab: 'map', worldId, nodeId: line.id.replace(/^node:/, ''), stageId: line.recordId }
  }
  if (line.kind === 'stage') return { tab: 'structure', worldId, stageId: line.recordId }
  if (line.kind === 'region' || line.kind === 'hotspot' || line.kind === 'exit') {
    return { tab: 'regions', worldId, regionId: line.recordId }
  }
  if (line.kind === 'encounter') return { tab: 'encounters', worldId, encounterId: line.recordId }
  return { tab: 'map', worldId }
}
