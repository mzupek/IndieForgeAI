import { useEffect, useState } from 'react'
import type { AssetInspiration, GameAsset } from '@shared/types/project'
import { coerceAnalysisText } from '@shared/coerceAnalysisText'
import { LocalImagePreview } from './shared'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

export function AssetInspirationPanel({
  projectId,
  asset,
  disabled,
  selectedIds,
  onSelectedIdsChange
}: {
  projectId: string
  asset: GameAsset
  disabled?: boolean
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
}) {
  const { updateActiveAsset } = useProjectStore()
  const { setError } = useUIStore()
  const [busyId, setBusyId] = useState<string | null>(null)

  const inspirations = asset.inspirationImages ?? []

  useEffect(() => {
    if (inspirations.length === 0) return
    const valid = selectedIds.filter((id) => inspirations.some((i) => i.id === id))
    if (valid.length === 0) {
      onSelectedIdsChange(inspirations.map((i) => i.id))
    } else if (valid.length !== selectedIds.length) {
      onSelectedIdsChange(valid)
    }
  }, [asset.id, inspirations.length])

  const handleAdd = async () => {
    if (!projectId || disabled) return
    const { filePath } = await window.indieForge.files.chooseImage()
    if (!filePath) return

    setBusyId('add')
    setError(null)
    try {
      const updated = await window.indieForge.assets.addInspiration(projectId, asset.id, filePath)
      updateActiveAsset(updated)
      const newIds = [...selectedIds, ...(updated.inspirationImages ?? []).map((i) => i.id)]
      onSelectedIdsChange([...new Set(newIds)])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add inspiration photo')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (inspirationId: string) => {
    if (!confirm('Remove this inspiration photo?')) return
    setBusyId(inspirationId)
    setError(null)
    try {
      const updated = await window.indieForge.assets.deleteInspiration(projectId, asset.id, inspirationId)
      updateActiveAsset(updated)
      onSelectedIdsChange(selectedIds.filter((id) => id !== inspirationId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove inspiration')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="asset-inspiration-panel panel-section">
      <div className="asset-inspiration-header">
        <div>
          <strong>Inspiration photos</strong>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
            Attach real-world reference images — pose, camera angle, composition. The designer sees them and
            generation uses them visually.
          </p>
        </div>
        <button type="button" className="secondary btn-sm" onClick={handleAdd} disabled={disabled || busyId === 'add'}>
          {busyId === 'add' ? 'Adding…' : '+ Add photo'}
        </button>
      </div>

      {inspirations.length === 0 ? (
        <p className="asset-inspiration-empty">
          Example: a photo of a batter in the box from the umpire&apos;s perspective for &quot;Batter idle&quot;.
        </p>
      ) : (
        <div className="asset-inspiration-grid">
          {inspirations.map((inspiration) => (
            <InspirationCard
              key={inspiration.id}
              inspiration={inspiration}
              selected={selectedIds.includes(inspiration.id)}
              busy={busyId === inspiration.id}
              disabled={disabled}
              onToggle={(checked) => {
                onSelectedIdsChange(
                  checked
                    ? [...selectedIds, inspiration.id]
                    : selectedIds.filter((id) => id !== inspiration.id)
                )
              }}
              onDelete={() => handleDelete(inspiration.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function InspirationCard({
  inspiration,
  selected,
  busy,
  disabled,
  onToggle,
  onDelete
}: {
  inspiration: AssetInspiration
  selected: boolean
  busy: boolean
  disabled?: boolean
  onToggle: (checked: boolean) => void
  onDelete: () => void
}) {
  const camera = coerceAnalysisText(inspiration.analysis?.cameraAngle)
  const pose = coerceAnalysisText(inspiration.analysis?.poseDescription)

  return (
    <div className={`asset-inspiration-card ${selected ? 'is-selected' : ''}`}>
      <div className="asset-inspiration-thumb">
        <LocalImagePreview filePath={inspiration.filePath} alt={inspiration.name} mode="fit" />
      </div>
      <div className="asset-inspiration-meta">
        <div className="asset-inspiration-name">{inspiration.name}</div>
        {camera && <div className="asset-inspiration-detail">{camera}</div>}
        {pose && <div className="asset-inspiration-detail">{pose}</div>}
        <label className="asset-inspiration-use">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggle(e.target.checked)}
            disabled={disabled || busy}
          />
          Use for generation
        </label>
        <button type="button" className="ghost btn-sm" onClick={onDelete} disabled={disabled || busy}>
          Remove
        </button>
      </div>
    </div>
  )
}
