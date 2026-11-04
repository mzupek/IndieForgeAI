/**
 * Phase 1.5: Placeholder for sections not yet built
 */
export function ComingSoon({ section, phase }: { section: string; phase: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '400px',
      padding: '3rem',
      textAlign: 'center'
    }}>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        border: '2px dashed var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1.5rem',
        fontSize: '2rem',
        color: 'var(--muted)'
      }}>
        ⏳
      </div>
      
      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text)' }}>
        {section}
      </h3>
      
      <p style={{ color: 'var(--muted)', fontSize: '0.95rem', maxWidth: '400px', lineHeight: '1.6' }}>
        This section is coming in {phase}.
      </p>
      
      <div style={{
        marginTop: '2rem',
        padding: '0.75rem 1.5rem',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        fontSize: '0.85rem',
        color: 'var(--muted)'
      }}>
        Stay tuned for updates
      </div>
    </div>
  )
}

export function ClipsPlaceholder() {
  return <ComingSoon section="Clips" phase="Phase 3" />
}

export function ScenePresetsPlaceholder() {
  return <ComingSoon section="Scene & Camera Presets" phase="Phase 4" />
}

export function LibraryPlaceholder() {
  return <ComingSoon section="Library" phase="Phase 5" />
}

export function ExportPlaceholder() {
  return <ComingSoon section="Export" phase="Phase 6" />
}
