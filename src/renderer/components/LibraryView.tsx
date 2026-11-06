/**
 * Library View - Unified asset browsing
 * 
 * Consolidates Visual Assets (P1) with links to existing asset views
 * Replaces separate Assets nav and Library placeholder
 */

import React, { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { AssetLibrary } from './AssetLibrary'
import { AssetEditor } from './AssetEditor'
import { AudioLibrary } from './AudioLibrary'
import type { VisualAsset } from '@shared/types/assetPipeline'

type TabId = 'visual-assets' | 'audio' | 'characters' | 'poses' | 'clips'

export function LibraryView() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [editingAsset, setEditingAsset] = useState<VisualAsset | null>(null)
  const [libraryEpoch, setLibraryEpoch] = useState(0)
  
  // Determine active tab from URL or default to visual-assets
  const searchParams = new URLSearchParams(location.search)
  const activeTab = (searchParams.get('tab') as TabId) || 'visual-assets'

  if (!gameId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
        Select a game to view library
      </div>
    )
  }

  const handleTabChange = (tab: TabId) => {
    if (tab === 'visual-assets' || tab === 'audio') {
      navigate(`/studio/library/${gameId}?tab=${tab}`)
    } else {
      // Navigate to existing dedicated view
      navigate(`/studio/${tab}/${gameId}`)
    }
  }

  const tabs: { id: TabId; label: string; isExternal: boolean }[] = [
    { id: 'visual-assets', label: 'Visual Assets', isExternal: false },
    { id: 'audio', label: 'Audio', isExternal: false },
    { id: 'characters', label: 'Characters', isExternal: true },
    { id: 'poses', label: 'Poses', isExternal: true },
    { id: 'clips', label: 'Clips', isExternal: true }
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with tabs */}
      <div style={{ 
        padding: '1rem 1.5rem', 
        borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Library</h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            Game: {gameId.replace('game-', '').replace(/-/g, ' ')}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                padding: '0.5rem 1rem',
                background: activeTab === tab.id ? 'var(--bg-secondary)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--forge-gold)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.background = 'var(--bg-secondary)'
                  e.currentTarget.style.color = 'var(--text)'
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--muted)'
                }
              }}
            >
              {tab.label}
              {tab.isExternal && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>→</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'visual-assets' ? (
          <AssetLibrary
            gameId={gameId}
            reloadEpoch={libraryEpoch}
            onAssetEdit={(asset) => setEditingAsset(asset)}
          />
        ) : activeTab === 'audio' ? (
          <AudioLibrary gameId={gameId} />
        ) : (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center', 
            color: 'var(--muted)' 
          }}>
            <p>Redirecting to {tabs.find(t => t.id === activeTab)?.label}...</p>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {editingAsset && (
        <AssetEditor
          asset={editingAsset}
          onSave={(updated) => {
            setEditingAsset(updated)
            setLibraryEpoch((n) => n + 1)
          }}
          onClose={() => {
            setEditingAsset(null)
            setLibraryEpoch((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
