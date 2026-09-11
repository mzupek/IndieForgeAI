import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { StatusBadge, formatAssetType, LocalAudioPreview } from './shared'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

export function AudioAssetPanel() {
  const { projectId } = useParams()
  const { activeProject, openProject, updateActiveAsset } = useProjectStore()
  const { setLoading, setError } = useUIStore()

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  const audioAssets =
    activeProject?.assets.filter((a) => ['music', 'sound_effect', 'voice_line'].includes(a.type)) ?? []

  const handleImport = async (assetId?: string) => {
    if (!projectId) return
    const { filePath } = await window.indieForge.files.chooseAudio()
    if (!filePath) return
    setLoading(true)
    try {
      const asset = await window.indieForge.assets.importAudio(projectId, filePath, assetId)
      updateActiveAsset(asset)
      const project = await window.indieForge.projects.open(projectId)
      useProjectStore.getState().setActiveProject(project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audio import failed')
    } finally {
      setLoading(false)
    }
  }

  if (!activeProject) return <p>Loading...</p>

  return (
    <div>
      <div className="page-header">
        <h2>Audio Assets</h2>
        <button type="button" onClick={() => handleImport()}>
          Import New Audio
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Scenes</th>
              <th>Preview</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {audioAssets.map((asset) => (
              <tr key={asset.id}>
                <td>{asset.name}</td>
                <td>{formatAssetType(asset.type)}</td>
                <td>
                  <StatusBadge status={asset.status} />
                </td>
                <td>
                  {asset.sceneIds
                    .map((sid) => activeProject.scenes.find((s) => s.id === sid)?.name)
                    .filter(Boolean)
                    .join(', ') || '—'}
                </td>
                <td>{asset.filePath ? <LocalAudioPreview filePath={asset.filePath} /> : '—'}</td>
                <td>
                  <button type="button" className="secondary" onClick={() => handleImport(asset.id)}>
                    Import
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
