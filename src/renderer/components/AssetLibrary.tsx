/**
 * P1: Asset Library Component
 * 
 * Browse, search, filter, create, and delete visual assets
 * Game-scoped (respects selected game from context)
 */

import React, { useState, useEffect } from 'react'
import type { VisualAsset } from '@shared/types/assetPipeline'

interface AssetLibraryProps {
  gameId: string
  onAssetSelect?: (asset: VisualAsset) => void
  onAssetEdit?: (asset: VisualAsset) => void
}

export function AssetLibrary({ gameId, onAssetSelect, onAssetEdit }: AssetLibraryProps) {
  const [assets, setAssets] = useState<VisualAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)

  const categories = ['all', 'logo', 'symbol', 'item', 'weapon', 'prop']

  // Load assets when game changes
  useEffect(() => {
    loadAssets()
  }, [gameId])

  async function loadAssets() {
    try {
      setLoading(true)
      setError(null)
      const loaded = await window.indieForge.visualAssets.list(gameId)
      setAssets(loaded)
    } catch (err: any) {
      setError(err.message || 'Failed to load assets')
      console.error('Failed to load assets:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    const name = prompt('Asset name:')
    if (!name) return

    const category = prompt('Category (logo/symbol/item/weapon/prop):')
    if (!category || !['logo', 'symbol', 'item', 'weapon', 'prop'].includes(category)) {
      alert('Invalid category. Must be: logo, symbol, item, weapon, or prop')
      return
    }

    try {
      const now = new Date().toISOString()
      const asset: VisualAsset = {
        id: crypto.randomUUID(),
        gameId,
        name,
        category: category as any,
        tags: [],
        defaultStateId: null,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      }

      await window.indieForge.visualAssets.create(asset)
      await loadAssets()
      
      // Auto-open editor for new asset
      if (onAssetEdit) {
        onAssetEdit(asset)
      }
    } catch (err: any) {
      alert(`Failed to create asset: ${err.message}`)
    }
  }

  async function handleDelete(asset: VisualAsset) {
    if (!confirm(`Delete asset "${asset.name}"? This will also delete all its states.`)) {
      return
    }

    try {
      const result = await window.indieForge.visualAssets.delete(asset.id)
      if (result.ok) {
        await loadAssets()
        if (selectedAssetId === asset.id) {
          setSelectedAssetId(null)
        }
        if (result.statesDeleted > 0) {
          alert(`Deleted asset and ${result.statesDeleted} state(s)`)
        }
      }
    } catch (err: any) {
      alert(`Failed to delete asset: ${err.message}`)
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
          onClick={handleCreate}
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
                  fontSize: '2rem',
                  overflow: 'hidden'
                }}>
                  {asset.thumbnail ? (
                    <img 
                      src={`local-file://${asset.thumbnail}`} 
                      alt={asset.name}
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '100%', 
                        objectFit: 'contain' 
                      }}
                    />
                  ) : (
                    <>
                      {asset.category === 'logo' && '🏷️'}
                      {asset.category === 'symbol' && '⚡'}
                      {asset.category === 'item' && '📦'}
                      {asset.category === 'weapon' && '⚔️'}
                      {asset.category === 'prop' && '🎨'}
                    </>
                  )}
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
                        handleDelete(asset)
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
    </div>
  )
}
