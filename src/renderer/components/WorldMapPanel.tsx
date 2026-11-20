/**
 * World Map tab: click to place a node, drag to move, add/remove paths, unlock editor.
 * Locked nodes are greyed. Waypoints are a typed list (drag editing is step 6).
 */

import { useEffect, useRef, useState } from 'react'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import { mapSurfaceAspect, resolveWorldMapBackgroundPath } from '@shared/worldContent/mapBackground'
import type { AssetPipelineProject, Stage, World, WorldMapNode, WorldMapPath } from '@shared/types/assetPipeline'

export function WorldMapPanel({
  projectId,
  gameId,
  pipeline,
  worlds,
  stages,
  backgrounds,
  busy,
  selectedWorldId,
  onSelectWorld,
  focusNodeId,
  refreshAfter
}: {
  projectId: string
  gameId: string
  pipeline: AssetPipelineProject
  worlds: World[]
  stages: Stage[]
  backgrounds: { id: string; name: string }[]
  busy: boolean
  selectedWorldId: string | null
  onSelectWorld: (id: string) => void
  focusNodeId?: string | null
  refreshAfter: (m: () => Promise<any>) => Promise<void>
}) {
  const world = worlds.find((w) => w.id === selectedWorldId) || worlds[0] || null
  const map = world?.map
  const worldStages = stages.filter((s) => s.worldId === world?.id)
  const unmapped = worldStages.filter((s) => !(map?.nodes || []).some((n) => n.stageId === s.id))
  const asset = (pipeline.visualAssets || []).find((a) => a.id === map?.backgroundAssetId)
  const backgroundPath = resolveWorldMapBackgroundPath(asset, pipeline.assetStates || [], {
    gameId
  }).path
  const previewSrc = useLocalFilePreview(backgroundPath)
  const [naturalSize, setNaturalSize] = useState<{
    path?: string
    width: number
    height: number
  } | null>(null)
  const aspect = mapSurfaceAspect(
    asset?.pixelSize,
    naturalSize && naturalSize.path === backgroundPath ? naturalSize : null
  )

  const [backgroundId, setBackgroundId] = useState(map?.backgroundAssetId || backgrounds[0]?.id || '')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(focusNodeId || map?.startNodeId || null)
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const [pathFrom, setPathFrom] = useState<string | null>(null)
  const [placeStageId, setPlaceStageId] = useState(unmapped[0]?.id || '')
  const [waypointsText, setWaypointsText] = useState('')
  const [drag, setDrag] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragMoved = useRef(false)
  const pointerIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (world?.id && world.id !== selectedWorldId) onSelectWorld(world.id)
  }, [world?.id, selectedWorldId, onSelectWorld])

  useEffect(() => {
    setBackgroundId(map?.backgroundAssetId || backgrounds[0]?.id || '')
  }, [world?.id, map?.backgroundAssetId, backgrounds])

  useEffect(() => {
    setPlaceStageId((current) =>
      unmapped.some((s) => s.id === current) ? current : unmapped[0]?.id || ''
    )
  }, [world?.id, unmapped.map((s) => s.id).join('|')])

  useEffect(() => {
    if (focusNodeId) setSelectedNodeId(focusNodeId)
  }, [focusNodeId])

  useEffect(() => {
    return () => {
      const el = surfaceRef.current
      if (el && pointerIdRef.current !== null) {
        try {
          el.releasePointerCapture(pointerIdRef.current)
        } catch {
          /* already released */
        }
      }
      pointerIdRef.current = null
    }
  }, [])

  const selectedNode = (map?.nodes || []).find((n) => n.id === selectedNodeId) || null
  const selectedStage = worldStages.find((s) => s.id === selectedNode?.stageId) || null
  const selectedPath = (map?.paths || []).find((p) => p.id === selectedPathId) || null

  useEffect(() => {
    if (!selectedPath) {
      setWaypointsText('')
      return
    }
    setWaypointsText((selectedPath.waypoints || []).map((w) => w.join(',')).join(';'))
  }, [selectedPathId, selectedPath?.id])

  function posFromEvent(e: { clientX: number; clientY: number }): [number, number] | null {
    const el = surfaceRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    return [x, y]
  }

  function nodePos(node: WorldMapNode): [number, number] {
    if (drag && drag.nodeId === node.id) return [drag.x, drag.y]
    return node.pos
  }

  function isLocked(stageId: string): boolean {
    const stage = worldStages.find((s) => s.id === stageId)
    return Boolean(stage?.unlockAfter && stage.unlockAfter.length > 0)
  }

  function parseWaypoints(raw: string): [number, number][] {
    return raw
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [x, y] = p.split(',').map((n) => Number(n.trim()))
        return [x, y] as [number, number]
      })
  }

  async function persistMove(nodeId: string, pos: [number, number]) {
    if (!world) return
    await refreshAfter(() => window.indieForge.worldContent.moveMapNode(projectId, gameId, world.id, nodeId, pos))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 280px', gap: '1rem' }}>
      <div className="panel-section">
        <h3>World</h3>
        <select
          value={world?.id || ''}
          onChange={(e) => onSelectWorld(e.target.value)}
          disabled={busy || worlds.length === 0}
        >
          {worlds.length === 0 && <option value="">No worlds</option>}
          {worlds.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <label style={{ display: 'grid', gap: '0.25rem', marginTop: '0.75rem' }}>
          Map background
          <select value={backgroundId} onChange={(e) => setBackgroundId(e.target.value)} disabled={busy}>
            <option value="">Select background</option>
            {backgrounds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !world || !backgroundId}
          onClick={() =>
            world &&
            refreshAfter(() =>
              window.indieForge.worldContent.setWorldMap(projectId, gameId, world.id, {
                backgroundAssetId: backgroundId,
                startNodeId: map?.startNodeId
              })
            )
          }
        >
          Save background
        </button>
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
          Click empty space to place a node. Drag a node to move it. Click two nodes to add a path.
        </p>
        <label style={{ display: 'grid', gap: '0.25rem', marginTop: '0.5rem' }}>
          Stage for next node
          <select value={placeStageId} onChange={(e) => setPlaceStageId(e.target.value)} disabled={busy}>
            {unmapped.length === 0 && <option value="">All stages have nodes</option>}
            {unmapped.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <h4 style={{ marginTop: '1rem' }}>Paths</h4>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {(map?.paths || []).map((p) => (
            <li
              key={p.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.35rem',
                padding: '0.25rem 0',
                background: p.id === selectedPathId ? 'var(--bg-secondary)' : 'transparent',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedPathId(p.id)}
            >
              <span>
                {p.from} — {p.to}
              </span>
              <button
                type="button"
                className="ghost"
                style={{ color: 'var(--error)' }}
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation()
                  world &&
                    refreshAfter(() =>
                      window.indieForge.worldContent.removeMapPath(projectId, gameId, world.id, p.id)
                    )
                }}
              >
                Remove
              </button>
            </li>
          ))}
          {(map?.paths || []).length === 0 && <li style={{ color: 'var(--muted)' }}>No paths</li>}
        </ul>
        {selectedPath && world && (
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            Waypoints (x,y;x,y)
            <input
              value={waypointsText}
              onChange={(e) => setWaypointsText(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                refreshAfter(async () => {
                  await window.indieForge.worldContent.removeMapPath(projectId, gameId, world.id, selectedPath.id)
                  return window.indieForge.worldContent.addMapPath(projectId, gameId, world.id, {
                    from: selectedPath.from,
                    to: selectedPath.to,
                    id: selectedPath.id,
                    waypoints: parseWaypoints(waypointsText)
                  })
                })
              }
            >
              Save waypoints
            </button>
          </label>
        )}
      </div>

      <div className="panel-section">
        <h3>Map</h3>
        <div
          ref={surfaceRef}
          onPointerDown={(e) => {
            if (!world || !map) return
            const pos = posFromEvent(e)
            if (!pos) return
            const hit = hitNode(map.nodes || [], pos, (n) => nodePos(n))
            if (hit) {
              dragMoved.current = false
              pointerIdRef.current = e.pointerId
              e.currentTarget.setPointerCapture(e.pointerId)
              setSelectedNodeId(hit.id)
              setDrag({ nodeId: hit.id, x: pos[0], y: pos[1] })
              return
            }
            if (!placeStageId) return
            const stageId = placeStageId
            const [x, y] = pos
            void refreshAfter(() =>
              window.indieForge.worldContent.addMapNode(projectId, gameId, world.id, {
                stageId,
                pos: [x, y]
              })
            )
          }}
          onPointerMove={(e) => {
            if (!drag) return
            const pos = posFromEvent(e)
            if (!pos) return
            dragMoved.current = true
            setDrag({ nodeId: drag.nodeId, x: pos[0], y: pos[1] })
          }}
          onPointerUp={(e) => {
            if (pointerIdRef.current !== null) {
              try {
                e.currentTarget.releasePointerCapture(pointerIdRef.current)
              } catch {
                /* already released */
              }
              pointerIdRef.current = null
            }
            if (drag) {
              const nodeId = drag.nodeId
              const pos: [number, number] = [drag.x, drag.y]
              const moved = dragMoved.current
              setDrag(null)
              if (moved) {
                void persistMove(nodeId, pos)
              } else if (pathFrom && pathFrom !== nodeId && world) {
                const from = pathFrom
                setPathFrom(null)
                void refreshAfter(() =>
                  window.indieForge.worldContent.addMapPath(projectId, gameId, world.id, {
                    from,
                    to: nodeId
                  })
                )
              } else {
                setPathFrom(nodeId)
              }
            }
          }}
          onPointerCancel={(e) => {
            if (pointerIdRef.current !== null) {
              try {
                e.currentTarget.releasePointerCapture(pointerIdRef.current)
              } catch {
                /* already released */
              }
              pointerIdRef.current = null
            }
            setDrag(null)
          }}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: `${aspect.width} / ${aspect.height}`,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            cursor: 'crosshair',
            touchAction: 'none'
          }}
        >
          {previewSrc && (
            <img
              src={previewSrc}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setNaturalSize({
                    path: backgroundPath,
                    width: img.naturalWidth,
                    height: img.naturalHeight
                  })
                }
              }}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                pointerEvents: 'none'
              }}
            />
          )}
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            {(map?.paths || []).map((p) => (
              <PathLine key={p.id} path={p} nodes={map?.nodes || []} nodePos={nodePos} selected={p.id === selectedPathId} />
            ))}
          </svg>
          {(map?.nodes || []).map((n) => {
            const [x, y] = nodePos(n)
            const locked = isLocked(n.stageId)
            const start = map?.startNodeId === n.id
            const selected = n.id === selectedNodeId
            return (
              <div
                key={n.id}
                title={n.label || n.id}
                style={{
                  position: 'absolute',
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: start ? 16 : 12,
                  height: start ? 16 : 12,
                  marginLeft: start ? -8 : -6,
                  marginTop: start ? -8 : -6,
                  borderRadius: '50%',
                  background: locked ? '#6b6b6b' : 'var(--forge-gold)',
                  border: selected ? '2px solid #fff' : start ? '2px solid var(--forge-gold)' : '1px solid #000',
                  opacity: n.hidden ? 0.45 : 1,
                  outline: n.hidden ? '1px dashed #ccc' : undefined,
                  pointerEvents: 'none'
                }}
              />
            )
          })}
        </div>
        {!map && <p style={{ color: 'var(--muted)' }}>Set a background to start the map.</p>}
        {pathFrom && <p style={{ fontSize: '0.85rem' }}>Path start: {pathFrom}. Click another node.</p>}
      </div>

      <div className="panel-section">
        <h3>Node</h3>
        {!selectedNode && <p style={{ color: 'var(--muted)' }}>Select a node</p>}
        {selectedNode && world && (
          <>
            <p>
              <strong>{selectedStage?.name || selectedNode.id}</strong>
              {selectedNode.id === map?.startNodeId ? ' (start)' : ''}
              {isLocked(selectedNode.stageId) ? ' · locked' : ''}
            </p>
            <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={Boolean(selectedNode.hidden)}
                disabled={busy}
                onChange={(e) =>
                  refreshAfter(() =>
                    window.indieForge.worldContent.updateMapNode(projectId, gameId, world.id, selectedNode.id, {
                      hidden: e.target.checked
                    })
                  )
                }
              />
              Hidden until unlocked
            </label>
            <button
              type="button"
              disabled={busy || selectedNode.id === map?.startNodeId}
              onClick={() =>
                refreshAfter(() =>
                  window.indieForge.worldContent.setMapStart(projectId, gameId, world.id, selectedNode.id)
                )
              }
            >
              Set as start
            </button>
            <button
              type="button"
              className="ghost"
              style={{ color: 'var(--error)' }}
              disabled={busy}
              onClick={() =>
                refreshAfter(() =>
                  window.indieForge.worldContent.removeMapNode(projectId, gameId, world.id, selectedNode.id)
                )
              }
            >
              Remove node
            </button>
            {selectedStage && (
              <UnlockEditor
                stage={selectedStage}
                worldStages={worldStages}
                busy={busy}
                projectId={projectId}
                gameId={gameId}
                refreshAfter={refreshAfter}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function UnlockEditor({
  stage,
  worldStages,
  busy,
  projectId,
  gameId,
  refreshAfter
}: {
  stage: Stage
  worldStages: Stage[]
  busy: boolean
  projectId: string
  gameId: string
  refreshAfter: (m: () => Promise<any>) => Promise<void>
}) {
  const others = worldStages.filter((s) => s.id !== stage.id)
  const selected = new Set(stage.unlockAfter || [])
  return (
    <div style={{ marginTop: '0.75rem' }}>
      <h4>Unlocks after</h4>
      {others.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No other stages</p>}
      {others.map((s) => (
        <label key={s.id} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={selected.has(s.id)}
            disabled={busy}
            onChange={(e) => {
              const next = new Set(selected)
              if (e.target.checked) next.add(s.id)
              else next.delete(s.id)
              void refreshAfter(() =>
                window.indieForge.worldContent.updateStage(projectId, gameId, stage.id, {
                  unlockAfter: Array.from(next)
                })
              )
            }}
          />
          {s.name}
        </label>
      ))}
    </div>
  )
}

function hitNode(
  nodes: WorldMapNode[],
  pos: [number, number],
  locate: (n: WorldMapNode) => [number, number]
): WorldMapNode | null {
  const threshold = 0.03
  let best: { node: WorldMapNode; d: number } | null = null
  for (const n of nodes) {
    const [x, y] = locate(n)
    const d = Math.hypot(x - pos[0], y - pos[1])
    if (d <= threshold && (!best || d < best.d)) best = { node: n, d }
  }
  return best?.node || null
}

function PathLine({
  path,
  nodes,
  nodePos,
  selected
}: {
  path: WorldMapPath
  nodes: WorldMapNode[]
  nodePos: (n: WorldMapNode) => [number, number]
  selected: boolean
}) {
  const from = nodes.find((n) => n.id === path.from)
  const to = nodes.find((n) => n.id === path.to)
  if (!from || !to) return null
  const pts = [nodePos(from), ...(path.waypoints || []), nodePos(to)]
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
  return <path d={d} fill="none" stroke={selected ? 'var(--forge-gold)' : '#cfcfcf'} strokeWidth={0.008} />
}
