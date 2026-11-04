import { useEffect } from 'react'
import { MemoryRouter, Navigate, Route, Routes, useLocation, Link } from 'react-router-dom'
import { ForgeBackdrop } from './components/ForgeBackdrop'
import { AppBrandHeader } from './components/AppBrandHeader'
import { StudioHome } from './components/StudioHome'
import { CharacterRoster } from './components/CharacterRoster'
import {
  PosesPlaceholder,
  ClipsPlaceholder,
  ScenePresetsPlaceholder,
  LibraryPlaceholder,
  ExportPlaceholder
} from './components/ComingSoon'
import { useProjectStore, useUIStore } from './state/indieForgeStore'

function StudioLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  const nav = [
    { path: '/studio/characters', label: 'Characters', phase: 1 },
    { path: '/studio/poses', label: 'Poses', phase: 2 },
    { path: '/studio/clips', label: 'Clips', phase: 3 },
    { path: '/studio/presets', label: 'Scene & Camera Presets', phase: 4 },
    { path: '/studio/library', label: 'Library', phase: 5 },
    { path: '/studio/export', label: 'Export', phase: 6 }
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <nav>
          {nav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={location.pathname.startsWith(item.path) ? 'active' : ''}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>{item.label}</span>
              {item.phase > 1 && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.125rem 0.375rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    color: 'var(--muted)'
                  }}
                >
                  Phase {item.phase}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}

function AppRoutes() {
  const { error, setError } = useUIStore()

  useEffect(() => {
    useProjectStore.getState().refreshOpenAIConfig()
  }, [])

  return (
    <>
      {error && (
        <div className="error-banner" style={{ marginBottom: '1rem' }}>
          {error}
          <button type="button" className="secondary" style={{ marginLeft: '0.5rem' }} onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Navigate to="/studio" replace />} />
        <Route
          path="/studio"
          element={
            <StudioLayout>
              <StudioHome />
            </StudioLayout>
          }
        >
          <Route index element={<Navigate to="/studio/characters" replace />} />
          <Route path="characters" element={<Navigate to="/studio/characters/game-neon-recall" replace />} />
          <Route path="characters/:gameId" element={<CharacterRoster />} />
          <Route path="poses" element={<PosesPlaceholder />} />
          <Route path="clips" element={<ClipsPlaceholder />} />
          <Route path="presets" element={<ScenePresetsPlaceholder />} />
          <Route path="library" element={<LibraryPlaceholder />} />
          <Route path="export" element={<ExportPlaceholder />} />
        </Route>
        <Route path="*" element={<Navigate to="/studio" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <MemoryRouter>
      <div className="app-root">
        <ForgeBackdrop />
        <div className="app-frame">
          <AppBrandHeader />
          <AppRoutes />
        </div>
      </div>
    </MemoryRouter>
  )
}
