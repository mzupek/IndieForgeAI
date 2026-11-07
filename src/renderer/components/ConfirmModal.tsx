/**
 * Confirmation Modal
 * 
 * Generic confirmation dialog to replace window.confirm() which doesn't work in Electron
 */

import React from 'react'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = false
}: ConfirmModalProps) {
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
        width: '400px',
        maxWidth: '90vw',
        padding: '1.5rem'
      }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>{title}</h3>
        <p style={{ margin: '0 0 1.5rem 0', lineHeight: '1.5' }}>{message}</p>
        
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onCancel}
            style={{ padding: '0.5rem 1rem' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{ 
              padding: '0.5rem 1rem',
              background: danger ? 'var(--danger)' : 'var(--forge-gold)',
              color: danger ? 'white' : 'black',
              fontWeight: 'bold'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
