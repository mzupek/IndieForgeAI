/**
 * Create Asset Modal
 * 
 * React modal form to replace window.prompt() which doesn't work in Electron
 */

import React, { useState } from 'react'
import type { VisualAsset } from '@shared/types/assetPipeline'

interface CreateAssetModalProps {
  gameId: string
  onSave: (asset: VisualAsset) => void
  onClose: () => void
}

export function CreateAssetModal({ gameId, onSave, onClose }: CreateAssetModalProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<'logo' | 'symbol' | 'item' | 'weapon' | 'prop'>('logo')
  const [tags, setTags] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const categories: Array<'logo' | 'symbol' | 'item' | 'weapon' | 'prop'> = 
    ['logo', 'symbol', 'item', 'weapon', 'prop']

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Asset name is required')
      return
    }

    try {
      setSaving(true)
      setError(null)
      
      const now = new Date().toISOString()
      const asset: VisualAsset = {
        id: crypto.randomUUID(),
        gameId,
        name: name.trim(),
        category,
        tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
        defaultStateId: null,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      }

      await window.indieForge.visualAssets.create(asset)
      onSave(asset)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create asset')
      setSaving(false)
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
        width: '500px',
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
          <h3 style={{ margin: 0 }}>Create New Asset</h3>
          <button 
            onClick={onClose}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0 0.5rem',
              color: 'var(--text)'
            }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '1rem' }}>
          {error && (
            <div style={{
              padding: '0.75rem',
              background: 'var(--danger)',
              color: 'white',
              borderRadius: '4px',
              marginBottom: '1rem',
              fontSize: '0.9rem'
            }}>
              {error}
            </div>
          )}

          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <span style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
              Asset Name *
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Health Potion"
              autoFocus
              style={{ 
                width: '100%', 
                padding: '0.5rem',
                fontSize: '0.9rem'
              }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <span style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
              Category *
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              style={{ 
                width: '100%', 
                padding: '0.5rem',
                fontSize: '0.9rem'
              }}
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <span style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
              Tags (optional)
            </span>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., collectible, consumable"
              style={{ 
                width: '100%', 
                padding: '0.5rem',
                fontSize: '0.9rem'
              }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginTop: '0.25rem' }}>
              Separate multiple tags with commas
            </span>
          </label>

          {/* Footer */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginTop: '1.5rem'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '0.5rem 1rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              style={{ 
                padding: '0.5rem 1rem',
                background: 'var(--forge-gold)',
                color: 'black',
                fontWeight: 'bold',
                opacity: (saving || !name.trim()) ? 0.5 : 1
              }}
            >
              {saving ? 'Creating...' : 'Create Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
