import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { CreateAssetDraft, GameAssetType } from '@shared/types/project'
import { AssetThumbnail, NavButton, StatusBadge, formatAssetType } from './shared'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

const ASSET_TYPES: GameAssetType[] = [
  'sprite',
  'animation',
  'background',
  'prop',
  'effect',
  'ui_icon',
  'music',
  'sound_effect',
  'voice_line'
]

export function AssetLibrary() {
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const sceneFilter = searchParams.get('scene')
  const { activeProject, openProject, setActiveProject } = useProjectStore()
  const { setError } = useUIStore()
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState<CreateAssetDraft>({
    name: '',
    type: 'sprite',
    description: '',
    prompt: ''
  })

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  const assets = useMemo(() => {
    if (!activeProject) return []
    return activeProject.assets.filter((a) => {
      if (sceneFilter && !a.sceneIds.includes(sceneFilter)) return false
      if (typeFilter !== 'all' && a.type !== typeFilter) return false
      return true
    })
  }, [activeProject, sceneFilter, typeFilter])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) return
    try {
      await window.indieForge.assets.create(projectId, draft)
      const project = await window.indieForge.projects.open(projectId)
      setActiveProject(project)
      setShowAdd(false)
      setDraft({ name: '', type: 'sprite', description: '', prompt: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add asset')
    }
  }

  const handleDelete = async (assetId: string) => {
    if (!projectId || !confirm('Delete this asset?')) return
    try {
      await window.indieForge.assets.delete(projectId, assetId)
      const project = await window.indieForge.projects.open(projectId)
      setActiveProject(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const studioLink = (asset: { id: string; type: string }) => {
    const pixel = activeProject?.craftPath === 'pixel_silhouette'
    if (['music', 'sound_effect', 'voice_line'].includes(asset.type))
      return `/projects/${projectId}/audio`
    if (asset.type === 'background') return `/projects/${projectId}/background/${asset.id}`
    if (pixel && (asset.type === 'sprite' || asset.type === 'animation' || asset.type === 'prop')) {
      return `/projects/${projectId}/craft/${asset.id}`
    }
    if (asset.type === 'animation') return `/projects/${projectId}/animation/${asset.id}`
    if (activeProject?.craftPath === 'engine_materials') {
      return `/projects/${projectId}/production`
    }
    return `/projects/${projectId}/generate/${asset.id}`
  }

  const studioLabel = (type: string) => {
    if (['music', 'sound_effect', 'voice_line'].includes(type)) return 'Audio'
    if (type === 'background') return 'Background'
    if (activeProject?.craftPath === 'pixel_silhouette') return 'Craft Studio'
    if (activeProject?.craftPath === 'engine_materials') return 'Production'
    if (type === 'animation') return 'Animation Studio'
    return 'AI Draft (optional)'
  }

  const animationCount = activeProject?.assets.filter((a) => a.type === 'animation').length ?? 0

  if (!activeProject) return <p>Loading...</p>

  return (
    <div>
      <div className="page-header">
        <h2>Asset Library</h2>
        <button type="button" onClick={() => setShowAdd(!showAdd)}>
          Add Asset
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {formatAssetType(t)}
            </option>
          ))}
        </select>
        {animationCount > 0 && typeFilter !== 'animation' && (
          <button type="button" className="secondary btn-sm" onClick={() => setTypeFilter('animation')}>
            Show {animationCount} animation{animationCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {typeFilter === 'animation' && (
        <p style={{ margin: '0 0 1rem', color: 'var(--muted)', fontSize: '0.88rem' }}>
          {activeProject.craftPath === 'pixel_silhouette' ? (
            <>
              Pixel animations: <strong style={{ color: 'var(--forge-gold)' }}>Craft</strong> →{' '}
              <strong style={{ color: 'var(--forge-gold)' }}>Motion Studio</strong> (mechanics) → Animation Studio
              (pose guide + optional AI paint).
            </>
          ) : (
            <>
              Animation assets open in <strong style={{ color: 'var(--forge-gold)' }}>Animation Studio</strong>.
            </>
          )}
        </p>
      )}

      {showAdd && (
        <form className="form-grid card" style={{ marginBottom: '1rem' }} onSubmit={handleAdd}>
          <label>
            Name
            <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label>
            Type
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as GameAssetType })}>
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {formatAssetType(t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <label>
            Prompt
            <textarea value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />
          </label>
          <button type="submit">Create Asset</button>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Preview</th>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Scenes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td>
                  <AssetThumbnail asset={asset} />
                </td>
                <td>{asset.name}</td>
                <td>
                  {asset.type === 'animation' ? (
                    <span className="badge badge-animation">{formatAssetType(asset.type)}</span>
                  ) : (
                    formatAssetType(asset.type)
                  )}
                </td>
                <td>
                  <StatusBadge status={asset.status} />
                </td>
                <td>
                  {asset.sceneIds
                    .map((sid) => activeProject.scenes.find((s) => s.id === sid)?.name)
                    .filter(Boolean)
                    .join(', ') || '—'}
                </td>
                <td>
                  <div className="table-actions">
                    <NavButton to={studioLink(asset)}>{studioLabel(asset.type)}</NavButton>
                    {asset.type === 'animation' && activeProject.craftPath === 'pixel_silhouette' && (
                      <NavButton to={`/projects/${projectId}/motion/${asset.id}`}>Motion Studio</NavButton>
                    )}
                    {asset.type === 'animation' && (
                      <NavButton to={`/projects/${projectId}/animation/${asset.id}`}>Animation</NavButton>
                    )}
                    <button type="button" className="secondary" onClick={() => handleDelete(asset.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
