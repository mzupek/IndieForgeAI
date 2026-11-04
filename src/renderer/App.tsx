import { useEffect } from 'react'
import { MemoryRouter, Navigate, Route, Routes, useLocation, useParams, Link } from 'react-router-dom'
import { NavButton } from './components/shared'
import { ForgeBackdrop } from './components/ForgeBackdrop'
import { AppBrandHeader } from './components/AppBrandHeader'
import { ProjectDashboard } from './components/ProjectDashboard'
import { NewProjectWizard } from './components/NewProjectWizard'
import { AIPlanReview } from './components/AIPlanReview'
import { SceneOrganizer } from './components/SceneOrganizer'
import { SceneComposer } from './components/SceneComposer'
import { AssetLibrary } from './components/AssetLibrary'
import { AssetGenerator } from './components/AssetGenerator'
import { BackgroundStudio } from './components/BackgroundStudio'
import { AudioAssetPanel } from './components/AudioAssetPanel'
import { ExportPanel } from './components/ExportPanel'
import { StyleReferencesPanel } from './components/StyleReferencesPanel'
import { DesignerStudio } from './components/DesignerStudio'
import { ProductionStudio } from './components/ProductionStudio'
import { AssetPipelineHome } from './components/AssetPipelineHome'
import { CharacterRoster } from './components/CharacterRoster'
import { useProjectStore, useUIStore } from './state/indieForgeStore'

function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams()
  const location = useLocation()

  const nav = [
    { path: `/projects/${projectId}/pipeline`, label: 'Pipeline' },
    { path: `/projects/${projectId}/production`, label: 'Production' },
    { path: `/projects/${projectId}/designer`, label: 'Designer' },
    { path: `/projects/${projectId}/style`, label: 'Style Refs' },
    { path: `/projects/${projectId}/scenes`, label: 'Scenes' },
    { path: `/projects/${projectId}/assets`, label: 'Assets' },
    { path: `/projects/${projectId}/audio`, label: 'Audio' },
    { path: `/projects/${projectId}/export`, label: 'Export' },
    { path: `/projects/${projectId}/plan`, label: 'AI Plan' }
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavButton to="/" variant="ghost" className="btn-sm btn-block" style={{ marginBottom: '0.65rem' }}>
          ← All Projects
        </NavButton>
        <nav>
          {nav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={
                location.pathname.startsWith(item.path) ||
                (item.path.endsWith('/scenes') && location.pathname.includes('/scenes/')) ||
                (item.path.endsWith('/assets') &&
                  (location.pathname.includes('/generate/') ||
                    location.pathname.includes('/background/')))
                  ? 'active'
                  : ''
              }
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
        <Route path="/" element={<ProjectDashboard />} />
        <Route path="/projects/new" element={<NewProjectWizard />} />
        <Route
          path="/projects/:projectId/pipeline"
          element={
            <ProjectLayout>
              <AssetPipelineHome />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/pipeline/games/:gameId/roster"
          element={
            <ProjectLayout>
              <CharacterRoster />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/production"
          element={
            <ProjectLayout>
              <ProductionStudio />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/style"
          element={
            <ProjectLayout>
              <StyleReferencesPanel />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/designer"
          element={
            <ProjectLayout>
              <DesignerStudio />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/plan"
          element={
            <ProjectLayout>
              <AIPlanReview />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/scenes"
          element={
            <ProjectLayout>
              <SceneOrganizer />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/scenes/:sceneId"
          element={
            <ProjectLayout>
              <SceneComposer />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/assets"
          element={
            <ProjectLayout>
              <AssetLibrary />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/generate/:assetId"
          element={
            <ProjectLayout>
              <AssetGenerator />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/background/:assetId"
          element={
            <ProjectLayout>
              <BackgroundStudio />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/audio"
          element={
            <ProjectLayout>
              <AudioAssetPanel />
            </ProjectLayout>
          }
        />
        <Route
          path="/projects/:projectId/export"
          element={
            <ProjectLayout>
              <ExportPanel />
            </ProjectLayout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
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
