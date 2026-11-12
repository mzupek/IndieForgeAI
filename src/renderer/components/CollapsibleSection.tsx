import { type ReactNode, useState } from 'react'

export function CollapsibleSection({
  title,
  defaultOpen = true,
  children
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: '0.65rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          fontWeight: 'bold',
          fontSize: '0.85rem',
          padding: '0.2rem 0',
          cursor: 'pointer'
        }}
      >
        <span>{title}</span>
        <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open ? <div style={{ marginTop: '0.4rem' }}>{children}</div> : null}
    </div>
  )
}
