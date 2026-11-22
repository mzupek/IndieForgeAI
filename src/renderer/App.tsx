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
import { GameSettingsView } from './components/GameSettingsView'
import { WorldsView } from './components/WorldsView'
import { EnemiesView } from './components/EnemiesView'
import { StoryView } from './components/StoryView'
import { useProjectStore, useUIStore } from './state/indieForgeStore'
import {
  STUDIO_SCHEMA_VERSION,
  resolveDefaultGameId,
  v1ReadOnlyMessage
} from '@shared/studio/schema'

function GameDefaultRedirect({ section }: { section: string }) {
  const games = useProjectStore((s) => s.activeProject?.assetPipeline?.games ?? [])
  const selectedGameId = useProjectStore((s) => s.selectedGameId)
  const gameId = resolveDefaultGameId(games, selectedGameId)
  if (!gameId) {
    return (
      <div style={{ padding: '2rem', color: 'var(--muted)' }}>
        Loading games…
      </div>
    )
  }
  return <Navigate to={`/studio/${section}/${gameId}`} replace />
}

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
    { path: '/studio/world', label: 'Worlds' },
    { path: '/studio/enemies', label: 'Enemies' },
    { path: '/studio/story', label: 'Flags' },
    { path: '/studio/scenes', label: 'Scenes' },
    { path: '/studio/storyboards', label: 'Storyboards' },
    { path: '/studio/definitions', label: 'Game Definitions' },
    { path: '/studio/settings', label: 'Game Settings' },
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
  const pipelineVersion = useProjectStore((s) => s.activeProject?.assetPipeline?.schemaVersion)
  const showV1Banner =
    pipelineVersion !== undefined && pipelineVersion < STUDIO_SCHEMA_VERSION

  useEffect(() => {
    useProjectStore.getState().refreshOpenAIConfig()
  }, [])

  return (
    <>
      {showV1Banner && (
        <div className="info-banner" role="status">
          {v1ReadOnlyMessage()}
        </div>
      )}
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
          <Route path="characters" element={<GameDefaultRedirect section="characters" />} />
          <Route path="characters/:gameId" element={<CharacterRoster />} />
          <Route path="poses" element={<GameDefaultRedirect section="poses" />} />
          <Route path="poses/:gameId" element={<PosesView />} />
          <Route path="clips" element={<GameDefaultRedirect section="clips" />} />
          <Route path="clips/:gameId" element={<ClipsView />} />
          <Route path="library" element={<GameDefaultRedirect section="library" />} />
          <Route path="library/:gameId" element={<LibraryView />} />
          <Route path="world" element={<GameDefaultRedirect section="world" />} />
          <Route path="world/:gameId" element={<WorldsView />} />
          <Route path="enemies" element={<GameDefaultRedirect section="enemies" />} />
          <Route path="enemies/:gameId" element={<EnemiesView />} />
          <Route path="story" element={<GameDefaultRedirect section="story" />} />
          <Route path="story/:gameId" element={<StoryView />} />
          <Route path="assets" element={<GameDefaultRedirect section="library" />} />
          <Route path="assets/:gameId" element={<AssetsRedirect />} />
          <Route path="scenes" element={<GameDefaultRedirect section="scenes" />} />
          <Route path="scenes/:gameId" element={<ScenesView />} />
          <Route path="storyboards" element={<GameDefaultRedirect section="storyboards" />} />
          <Route path="storyboards/:gameId" element={<StoryboardEditor />} />
          <Route path="definitions" element={<GameDefaultRedirect section="definitions" />} />
          <Route path="definitions/:gameId" element={<GameDefinitionView />} />
          <Route path="settings" element={<GameDefaultRedirect section="settings" />} />
          <Route path="settings/:gameId" element={<GameSettingsView />} />
          <Route path="export" element={<GameDefaultRedirect section="export" />} />
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
