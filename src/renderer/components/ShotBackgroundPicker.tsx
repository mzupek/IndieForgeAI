/**
 * Shot Background / Layers: pick a selected-Game Library visual asset
 * (full-res image on canvas) or secondary direct Import Image.
 */

import React from 'react'
import type { AssetState, StoryboardShot, VisualAsset } from '@shared/types/assetPipeline'
import { AssetThumbnail } from './AssetThumbnail'

interface ShotBackgroundPickerProps {
  gameId: string
  shot: StoryboardShot
  visualAssets: VisualAsset[]
  assetStates: AssetState[]
  error: string | null
  onSelectLibrary: (assetId: string, stateId: string | null) => void
  onChangeState: (stateId: string | null) => void
  onImport: () => void
  onClear: () => void
  onOpenLibrary: () => void
}

export function ShotBackgroundPicker({
  gameId,
  shot,
  visualAssets,
  assetStates,
  error,
  onChangeState,
  onImport,
  onClear,
  onOpenLibrary
}: ShotBackgroundPickerProps) {
  const selectedAsset = visualAssets.find((a) => a.id === shot.backgroundVisualAssetId)
  const ownedStates = selectedAsset
    ? assetStates.filter((s) => s.assetId === selectedAsset.id)
    : []
  const hasImage = !!(shot.backgroundVisualAssetId || shot.backgroundImage)

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem', fontWeight: 'bold' }}>Image:</div>

      {selectedAsset ? (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            marginBottom: '0.5rem',
            padding: '0.4rem',
            background: 'var(--bg-secondary)',
            borderRadius: '4px'
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              background: 'var(--bg)',
              borderRadius: '4px'
            }}
          >
            <AssetThumbnail asset={selectedAsset} states={ownedStates} gameId={gameId} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 'bold',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {selectedAsset.name}
            </div>
            {ownedStates.length > 0 ? (
              <select
                value={shot.backgroundAssetStateId || ''}
                onChange={(e) => onChangeState(e.target.value || null)}
                style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.75rem' }}
              >
                <option value="">Default / static</option>
                {ownedStates.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.name}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Static image</div>
            )}
          </div>
        </div>
      ) : shot.backgroundImage ? (
        <div
          style={{
            fontSize: '0.75rem',
            padding: '0.5rem',
            background: 'var(--bg-secondary)',
            borderRadius: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: '0.5rem'
          }}
        >
          {shot.backgroundImage.split('/').pop()}
        </div>
      ) : (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
          None — choose a Library image for this Game, or import a file.
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: '0.5rem',
            padding: '0.5rem',
            background: 'var(--danger, #7a2020)',
            color: '#fff',
            borderRadius: '4px',
            fontSize: '0.8rem'
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onOpenLibrary}
          style={{ flex: 1, fontSize: '0.85rem', padding: '0.4rem', background: 'var(--forge-gold)', color: '#000' }}
        >
          Library…
        </button>
        <button type="button" onClick={onImport} style={{ flex: 1, fontSize: '0.85rem', padding: '0.4rem' }}>
          + Import Image
        </button>
        {hasImage && (
          <button
            type="button"
            onClick={onClear}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.5rem', background: 'var(--danger)', color: 'white' }}
          >
            Clear
          </button>
        )}
      </div>

    </div>
  )
}
