/**
 * P1: Asset Library Component
 * 
 * Browse, search, filter, create, and delete visual assets
 * Game-scoped (respects selected game from context)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { AssetState, VisualAsset } from '@shared/types/assetPipeline'
import { CreateAssetModal } from './CreateAssetModal'
import { ConfirmModal } from './ConfirmModal'
import { AssetThumbnail } from './AssetThumbnail'

interface AssetLibraryProps {
  gameId: string
  reloadEpoch?: number
  onAssetSelect?: (asset: VisualAsset) => void
  onAssetEdit?: (asset: VisualAsset) => void
}

export function AssetLibrary({ gameId, reloadEpoch = 0, onAssetSelect, onAssetEdit }: AssetLibraryProps) {
  const [assets, setAssets] = useState<VisualAsset[]>([])
  const [states, setStates] = useState<AssetState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<VisualAsset | null>(null)

  const categories = ['all', 'logo', 'symbol', 'item', 'weapon', 'prop']

  // Load assets + Game-scoped states together; ignore stale responses after Game switch
  const loadGenRef = useRef(0)
  const loadAssets = useCallback(async () => {
    const gen = ++loadGenRef.current
    try {
      setLoading(true)
      setError(null)
      const [loaded, loadedStates] = await Promise.all([
        window.indieForge.visualAssets.list(gameId),
        window.indieForge.assetStates.listForGame(gameId)
      ])
      if (gen !== loadGenRef.current) return
      setAssets(loaded)
      setStates(loadedStates)
    } catch (err: any) {
      if (gen !== loadGenRef.current) return
      setError(err.message || 'Failed to load assets')
      console.error('Failed to load assets:', err)
    } finally {
      if (gen === loadGenRef.current) setLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    void loadAssets()
    return () => {
      loadGenRef.current++
    }
  }, [gameId, reloadEpoch, loadAssets])

  async function handleCreateSave(asset: VisualAsset) {
    await loadAssets()
    
    // Auto-open editor for new asset
    if (onAssetEdit) {
      onAssetEdit(asset)
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return

    try {
      const result = await window.indieForge.visualAssets.delete(deleteConfirm.id)
      if (result.ok) {
        await loadAssets()
        if (selectedAssetId === deleteConfirm.id) {
          setSelectedAssetId(null)
        }
      }
      setDeleteConfirm(null)
    } catch (err: any) {
      setError(`Failed to delete asset: ${err.message}`)
      setDeleteConfirm(null)
    }
  }

  function handleSelect(asset: VisualAsset) {
    setSelectedAssetId(asset.id)
    if (onAssetSelect) {
      onAssetSelect(asset)
    }
  }

  function handleDoubleClick(asset: VisualAsset) {
    if (onAssetEdit) {
      onAssetEdit(asset)
    }
  }

  // Filter assets
  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         asset.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesCategory = categoryFilter === 'all' || asset.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
        Loading assets...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--error)' }}>
        <p>Error: {error}</p>
        <button onClick={loadAssets} style={{ marginTop: '1rem' }}>Retry</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ 
        padding: '1rem', 
        borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input
            type="text"
            placeholder="Search assets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, padding: '0.5rem', fontSize: '0.9rem' }}
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: '0.5rem', fontSize: '0.9rem' }}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          style={{ 
            width: '100%', 
            padding: '0.5rem',
            background: 'var(--forge-gold)',
            color: 'black',
            fontWeight: 'bold'
          }}
        >
          + New Asset
        </button>
      </div>

      {/* Asset Grid */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '1rem'
      }}>
        {filteredAssets.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            {searchTerm || categoryFilter !== 'all' 
              ? 'No assets match your filters'
              : 'No assets yet. Click "+ New Asset" to create one.'}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '1rem'
          }}>
            {filteredAssets.map(asset => (
              <div
                key={asset.id}
                onClick={() => handleSelect(asset)}
                onDoubleClick={() => handleDoubleClick(asset)}
                style={{
                  border: selectedAssetId === asset.id ? '2px solid var(--forge-gold)' : '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.5rem',
                  cursor: 'pointer',
                  background: selectedAssetId === asset.id ? 'var(--bg-secondary)' : 'var(--bg)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (selectedAssetId !== asset.id) {
                    e.currentTarget.style.background = 'var(--bg-secondary)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedAssetId !== asset.id) {
                    e.currentTarget.style.background = 'var(--bg)'
                  }
                }}
              >
                {/* Thumbnail */}
                <div style={{
                  width: '100%',
                  aspectRatio: '1',
                  background: 'var(--bg-secondary)',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.5rem',
                  overflow: 'hidden'
                }}>
                  <AssetThumbnail asset={asset} states={states} gameId={gameId} />
                </div>
                
                {/* Asset info */}
                <div style={{ fontSize: '0.85rem' }}>
                  <div style={{ 
                    fontWeight: 'bold', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {asset.name}
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--muted)',
                    textTransform: 'capitalize'
                  }}>
                    {asset.category}
                  </div>
                  {asset.defaultStateId ? (
                    <div style={{ fontSize: '0.7rem', color: 'var(--forge-gold)' }}>
                      Multi-state
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                      Single-state
                    </div>
                  )}
                </div>

                {/* Actions */}
                {selectedAssetId === asset.id && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDoubleClick(asset)
                      }}
                      style={{ 
                        flex: 1, 
                        padding: '0.25rem', 
                        fontSize: '0.7rem' 
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteConfirm(asset)
                      }}
                      style={{ 
                        flex: 1, 
                        padding: '0.25rem', 
                        fontSize: '0.7rem',
                        background: 'var(--danger)',
                        color: 'white'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div style={{ 
        padding: '0.5rem 1rem', 
        borderTop: '1px solid var(--border)',
        fontSize: '0.75rem',
        color: 'var(--muted)',
        flexShrink: 0
      }}>
        {filteredAssets.length} asset{filteredAssets.length !== 1 ? 's' : ''}
        {searchTerm && ` matching "${searchTerm}"`}
        {categoryFilter !== 'all' && ` in ${categoryFilter}`}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateAssetModal
          gameId={gameId}
          onSave={handleCreateSave}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete Asset"
          message={`Delete "${deleteConfirm.name}"? This will also delete all its states.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger={true}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
