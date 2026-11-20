/**
 * Photoshop-style compact layer rows. Front of list = highest zOrder.
 * No lock field on the model — omit lock.
 */

import { useEffect, useRef } from 'react'
import type { AssetPipelineProject, StoryboardLayer } from '@shared/types/assetPipeline'
import { describeLayerLabel } from '@shared/storyboard/layerRender'
import { getLayerKind, resolveLayerImagePath } from '@shared/storyboard/layerValidation'
import { layersFrontToBack } from '@shared/storyboard/layerStack'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'

function RowThumb({
  layer,
  pipeline
}: {
  layer: StoryboardLayer
  pipeline: AssetPipelineProject | undefined
}) {
  const kind = getLayerKind(layer)
  const path = pipeline ? resolveLayerImagePath(layer, pipeline).path : undefined
  const src = useLocalFilePreview(kind === 'clip' && path && /\.(mp4|webm|mov)$/i.test(path) ? null : path)
  if (src) {
    return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
  }
  if (kind === 'text') return <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>T</span>
  if (kind === 'clip') return <span>🎬</span>
  if (kind === 'character') return <span>👤</span>
  return <span>🖼️</span>
}

export function LayersPanel({
  layers,
  pipeline,
  selectedLayerId,
  onSelect,
  onToggleVisible,
  onMove,
  onReorder
}: {
  layers: StoryboardLayer[]
  pipeline: AssetPipelineProject | undefined
  selectedLayerId: string | null
  onSelect: (layerId: string) => void
  onToggleVisible: (layerId: string, visible: boolean) => void
  onMove: (layerId: string, direction: 'front' | 'back') => void
  onReorder: (layerId: string, toFrontIndex: number) => void
}) {
  const ordered = layersFrontToBack(layers)
  const selectedRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedLayerId])

  if (ordered.length === 0) {
    return (
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', padding: '0.35rem 0' }}>
        No layers yet. Add from Library or + Text.
      </div>
    )
  }

  return (
    <div>
      {ordered.map((layer, index) => {
        const selected = selectedLayerId === layer.id
        const label = pipeline ? describeLayerLabel(layer, pipeline) : layer.id
        return (
          <div
            key={layer.id}
            ref={selected ? selectedRef : undefined}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', layer.id)
              e.dataTransfer.setData('text/forge-layer-id', layer.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(e) => {
              e.preventDefault()
              const fromId =
                e.dataTransfer.getData('text/forge-layer-id') || e.dataTransfer.getData('text/plain')
              if (fromId) onReorder(fromId, index)
            }}
            onClick={() => onSelect(layer.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.28rem 0.35rem',
              marginBottom: '0.28rem',
              border: selected ? '2px solid var(--forge-gold)' : '1px solid var(--border)',
              borderRadius: '4px',
              background: selected ? 'var(--forge-gold)' : 'var(--bg-secondary)',
              color: selected ? 'var(--bg)' : 'var(--text)',
              cursor: 'pointer',
              opacity: layer.visible === false ? 0.45 : 1
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                flexShrink: 0,
                borderRadius: '3px',
                overflow: 'hidden',
                background: selected ? 'rgba(0,0,0,0.15)' : 'var(--bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <RowThumb layer={layer} pipeline={pipeline} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 'bold',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {label}
              </div>
              <div style={{ fontSize: '0.65rem', opacity: 0.75 }}>
                z{layer.zOrder} · {layer.scale.toFixed(2)}x · {layer.rotation.toFixed(0)}°
              </div>
            </div>
            <button
              type="button"
              title={layer.visible === false ? 'Show' : 'Hide'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleVisible(layer.id, layer.visible === false)
              }}
              style={{
                fontSize: '0.75rem',
                padding: '0.1rem 0.3rem',
                background: 'transparent',
                border: '1px solid currentColor',
                color: 'inherit',
                opacity: 0.85
              }}
            >
              {layer.visible === false ? '🙈' : '👁'}
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <button
                type="button"
                title="Bring forward"
                disabled={index === 0}
                onClick={(e) => {
                  e.stopPropagation()
                  onMove(layer.id, 'front')
                }}
                style={{ fontSize: '0.6rem', padding: '0 0.25rem', lineHeight: 1.2 }}
              >
                ▲
              </button>
              <button
                type="button"
                title="Send backward"
                disabled={index === ordered.length - 1}
                onClick={(e) => {
                  e.stopPropagation()
                  onMove(layer.id, 'back')
                }}
                style={{ fontSize: '0.6rem', padding: '0 0.25rem', lineHeight: 1.2 }}
              >
                ▼
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
