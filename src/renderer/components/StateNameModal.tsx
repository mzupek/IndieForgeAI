/**
 * State Name Input Modal
 * 
 * Modal for entering state name - replaces window.prompt()
 */

import React, { useState } from 'react'

interface StateNameModalProps {
  onSave: (name: string) => void
  onClose: () => void
}

export function StateNameModal({ onSave, onClose }: StateNameModalProps) {
  const [name, setName] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim()) {
      onSave(name.trim())
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
      zIndex: 1001
    }}>
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        width: '400px',
        maxWidth: '90vw',
        padding: '1.5rem'
      }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>State Name</h3>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g., "open", "closed"'
            autoFocus
            style={{ 
              width: '100%', 
              padding: '0.5rem',
              marginBottom: '1rem'
            }}
          />
          
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end'
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
              disabled={!name.trim()}
              style={{ 
                padding: '0.5rem 1rem',
                background: 'var(--forge-gold)',
                color: 'black',
                fontWeight: 'bold',
                opacity: !name.trim() ? 0.5 : 1
              }}
            >
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
