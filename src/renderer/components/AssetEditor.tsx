/**
 * P1: Asset Editor Component
 * 
 * Edit asset metadata and manage states
 * File upload for state images
 */

import React, { useState, useEffect } from 'react'
import type { VisualAsset, AssetState } from '@shared/types/assetPipeline'

interface AssetEditorProps {
  asset: VisualAsset
  onSave: (updated: VisualAsset) => void
  onClose: () => void
}

export function AssetEditor({ asset, onSave, onClose }: AssetEditorProps) {
  const [name, setName] = useState(asset.name)
  const [category, setCategory] = useState(asset.category)
  const [tags, setTags] = useState(asset.tags.join(', '))
  const [states, setStates] = useState<AssetState[]>([])
  const [loadingStates, setLoadingStates] = useState(true)
  const [saving, setSaving] = useState(false)

  const categories: Array<'logo' | 'symbol' | 'item' | 'weapon' | 'prop'> = 
    ['logo', 'symbol', 'item', 'weapon', 'prop']

  useEffect(() => {
    loadStates()
  }, [asset.id])

  async function loadStates() {
    try {
      setLoadingStates(true)
      const loaded = await window.indieForge.assetStates.list(asset.id)
      setStates(loaded)
    } catch (err) {
      console.error('Failed to load states:', err)
    } finally {
      setLoadingStates(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)
      
      const updated: VisualAsset = {
        ...asset,
        name: name.trim(),
        category,
        tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
        updatedAt: new Date().toISOString()
      }

      await window.indieForge.visualAssets.update(updated)
      onSave(updated)
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddState() {
    const name = prompt('State name (e.g., "open", "closed"):')
    if (!name) return

    // Open file picker
    const files = await window.indieForge.files.chooseImage()
    if (!files || files.length === 0) return

    try {
      const newState = await window.indieForge.assetStates.create(
        asset.id,
        name,
        files[0]
      )
      
      await loadStates()
      
      // If this is the first state, set as default
      if (states.length === 0) {
        await window.indieForge.assetStates.setDefault(asset.id, newState.id)
        // Reload asset to get updated defaultStateId
        const updatedAsset = await window.indieForge.visualAssets.get(asset.id)
        if (updatedAsset) {
          onSave(updatedAsset)
        }
      }
    } catch (err: any) {
      alert(`Failed to add state: ${err.message}`)
    }
  }

  async function handleSetDefault(stateId: string) {
    try {
      await window.indieForge.assetStates.setDefault(asset.id, stateId)
      
      // Reload asset to get updated defaultStateId
      const updatedAsset = await window.indieForge.visualAssets.get(asset.id)
      if (updatedAsset) {
        onSave(updatedAsset)
      }
      
      await loadStates()
    } catch (err: any) {
      alert(`Failed to set default state: ${err.message}`)
    }
  }

  async function handleDeleteState(state: AssetState) {
    if (!confirm(`Delete state "${state.name}"?`)) return

    try {
      await window.indieForge.assetStates.delete(state.id)
      await loadStates()
    } catch (err: any) {
      alert(`Failed to delete state: ${err.message}`)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        width: '600px',
        maxWidth: '90vw',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0 }}>Edit Asset</h3>
          <button 
            onClick={onClose}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0 0.5rem'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '1rem'
        }}>
          {/* Metadata */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Metadata</h4>
            
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                Name:
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', padding: '0.5rem' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                Category:
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                style={{ width: '100%', padding: '0.5rem' }}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                Tags (comma-separated):
              </span>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., collectible, breakable"
                style={{ width: '100%', padding: '0.5rem' }}
              />
            </label>
          </div>

          {/* States */}
          <div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '0.75rem'
            }}>
              <h4 style={{ margin: 0 }}>States</h4>
              <button
                onClick={handleAddState}
                style={{ 
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.85rem',
                  background: 'var(--forge-gold)',
                  color: 'black'
                }}
              >
                + Add State
              </button>
            </div>

            {loadingStates ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '1rem' }}>
                Loading states...
              </div>
            ) : states.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                color: 'var(--muted)', 
                padding: '1rem',
                border: '1px dashed var(--border)',
                borderRadius: '4px'
              }}>
                <p>No states yet. This is a single-state asset.</p>
                <p style={{ fontSize: '0.85rem' }}>
                  Click "+ Add State" to create variations (e.g., open/closed)
                </p>
              </div>
            ) : (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.5rem' 
              }}>
                {states.map(state => {
                  const isDefault = asset.defaultStateId === state.id
                  return (
                    <div
                      key={state.id}
                      style={{
                        border: isDefault ? '2px solid var(--forge-gold)' : '1px solid var(--border)',
                        borderRadius: '4px',
                        padding: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: isDefault ? 'var(--bg-secondary)' : 'transparent'
                      }}
                    >
                      {/* Thumbnail placeholder */}
                      <div style={{
                        width: '48px',
                        height: '48px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '4px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem'
                      }}>
                        🖼️
                      </div>

                      {/* State info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontWeight: 'bold',
                          fontSize: '0.9rem'
                        }}>
                          {state.name}
                          {isDefault && (
                            <span style={{ 
                              marginLeft: '0.5rem',
                              fontSize: '0.7rem',
                              color: 'var(--forge-gold)',
                              fontWeight: 'normal'
                            }}>
                              DEFAULT
                            </span>
                          )}
                        </div>
                        <div style={{ 
                          fontSize: '0.75rem',
                          color: 'var(--muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {state.file}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                        {!isDefault && (
                          <button
                            onClick={() => handleSetDefault(state.id)}
                            style={{ 
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem'
                            }}
                            title="Set as default state"
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteState(state)}
                          disabled={isDefault}
                          style={{ 
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            background: isDefault ? 'var(--muted)' : 'var(--danger)',
                            color: 'white',
                            opacity: isDefault ? 0.5 : 1,
                            cursor: isDefault ? 'not-allowed' : 'pointer'
                          }}
                          title={isDefault ? 'Cannot delete default state' : 'Delete state'}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: '0.5rem',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{ padding: '0.5rem 1rem' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{ 
              padding: '0.5rem 1rem',
              background: 'var(--forge-gold)',
              color: 'black',
              fontWeight: 'bold'
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
