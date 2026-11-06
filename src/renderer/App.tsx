import { useEffect } from 'react'
import { MemoryRouter, Navigate, Route, Routes, useLocation, Link, useParams } from 'react-router-dom'
import { ForgeBackdrop } from './components/ForgeBackdrop'
import { AppBrandHeader } from './components/AppBrandHeader'
import { StudioHome } from './components/StudioHome'
import { CharacterRoster } from './components/CharacterRoster'
import { PosesView } from './components/PosesView'
import { ClipsView } from './components/ClipsView'
import { ScenesView } from './components/ScenesView'
import { StoryboardEditor } from './components/StoryboardEditor'
import { GameDefinitionView } from './components/GameDefinitionView'
import { ExportView } from './components/ExportView'
import { LibraryView } from './components/LibraryView'
import { useProjectStore, useUIStore } from './state/indieForgeStore'

// Backwards compatibility redirect for old /studio/assets routes
function AssetsRedirect() {
  const { gameId } = useParams<{ gameId: string }>()
  return <Navigate to={`/studio/library/${gameId}`} replace />
}

function StudioLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  const nav = [
    { path: '/studio/characters', label: 'Characters' },
    { path: '/studio/poses', label: 'Poses' },
    { path: '/studio/clips', label: 'Clips' },
    { path: '/studio/library', label: 'Library' },
    { path: '/studio/scenes', label: 'Scenes' },
    { path: '/studio/storyboards', label: 'Storyboards' },
    { path: '/studio/definitions', label: 'Game Definitions' },
    { path: '/studio/export', label: 'Export' }
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
            >
              {item.label}
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
          <Route path="poses" element={<Navigate to="/studio/poses/game-neon-recall" replace />} />
          <Route path="poses/:gameId" element={<PosesView />} />
          <Route path="clips" element={<Navigate to="/studio/clips/game-neon-recall" replace />} />
          <Route path="clips/:gameId" element={<ClipsView />} />
          <Route path="library" element={<Navigate to="/studio/library/game-neon-recall" replace />} />
          <Route path="library/:gameId" element={<LibraryView />} />
          {/* Backwards compatibility: redirect old /studio/assets to /studio/library */}
          <Route path="assets" element={<Navigate to="/studio/library/game-neon-recall" replace />} />
          <Route path="assets/:gameId" element={<AssetsRedirect />} />
          <Route path="scenes" element={<Navigate to="/studio/scenes/game-neon-recall" replace />} />
          <Route path="scenes/:gameId" element={<ScenesView />} />
          <Route path="storyboards" element={<Navigate to="/studio/storyboards/game-neon-recall" replace />} />
          <Route path="storyboards/:gameId" element={<StoryboardEditor />} />
          <Route path="definitions" element={<Navigate to="/studio/definitions/game-neon-recall" replace />} />
          <Route path="definitions/:gameId" element={<GameDefinitionView />} />
          <Route path="export" element={<Navigate to="/studio/export/game-neon-recall" replace />} />
          <Route path="export/:gameId" element={<ExportView />} />
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
