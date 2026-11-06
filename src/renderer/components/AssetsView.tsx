/**
 * P1: Assets View
 * 
 * Main view for managing visual assets
 * Integrates AssetLibrary and AssetEditor
 */

import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AssetLibrary } from './AssetLibrary'
import { AssetEditor } from './AssetEditor'
import type { VisualAsset } from '@shared/types/assetPipeline'

export function AssetsView() {
  const { gameId } = useParams<{ gameId: string }>()
  const [editingAsset, setEditingAsset] = useState<VisualAsset | null>(null)

  if (!gameId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
        Select a game to view assets
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ 
        padding: '1rem', 
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <h2 style={{ margin: 0, flex: 1 }}>Visual Assets (P1)</h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          Game: {gameId.replace('game-', '').replace(/-/g, ' ')}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AssetLibrary
          gameId={gameId}
          onAssetEdit={(asset) => setEditingAsset(asset)}
        />
      </div>

      {/* Editor Modal */}
      {editingAsset && (
        <AssetEditor
          asset={editingAsset}
          onSave={(updated) => {
            setEditingAsset(updated)
          }}
          onClose={() => setEditingAsset(null)}
        />
      )}
    </div>
  )
}
