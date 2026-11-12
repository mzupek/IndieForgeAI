/**
 * A1: Game-scoped Audio Library (catalog + preview).
 * No storyboard mixer. Preview uses forge-file:// + <audio controls>.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AudioAsset, AudioKind } from '@shared/types/assetPipeline'
import { ConfirmModal } from './ConfirmModal'
import { formatAudioDuration } from '@shared/storyboard/audioValidation'
import { useProjectStore } from '../state/indieForgeStore'

function ForgeAudioPreview({ filePath }: { filePath: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setError(null)
    window.indieForge.files
      .getLocalUrl(filePath)
      .then(({ localUrl }) => {
        if (cancelled) return
        if (!localUrl || localUrl.startsWith('local-file:')) {
          setError('Audio URL is not forge-file://; local-file:// is not supported')
          return
        }
        setSrc(localUrl)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to resolve audio URL')
        }
      })
    return () => {
      cancelled = true
    }
  }, [filePath])

  if (error) {
    return (
      <div style={{ fontSize: '0.75rem', color: 'var(--danger)', lineHeight: 1.35 }}>{error}</div>
    )
  }
  if (!src) {
    return <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Loading preview…</div>
  }
  return (
    <audio
      controls
      src={src}
      style={{ width: '100%' }}
      onError={() => {
        setError('Audio failed to load (missing file, codec, or host decode)')
      }}
    />
  )
}

function ImportAudioModal({
  gameId,
  sourcePath,
  onClose,
  onImported
}: {
  gameId: string
  sourcePath: string
  onClose: () => void
  onImported: () => void
}) {
  const defaultName = sourcePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Audio'
  const [name, setName] = useState(defaultName)
  const [kind, setKind] = useState<AudioKind>('sfx')
  const [tags, setTags] = useState('')
  const [engineNotes, setEngineNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await window.indieForge.audioAssets.importFile(sourcePath, {
        gameId,
        kind,
        name: name.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        engineNotes: engineNotes.trim() || undefined
      })
      onImported()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          width: '440px',
          maxWidth: '90vw',
          padding: '1.25rem'
        }}
      >
        <h3 style={{ margin: '0 0 0.75rem 0' }}>Import audio</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 0 }}>
          Copies into studio storage. Original file is not moved.
        </p>
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            {error}
          </div>
        )}
        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', marginTop: '0.25rem', padding: '0.35rem' }}
          />
        </label>
        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as AudioKind)}
            style={{ width: '100%', marginTop: '0.25rem', padding: '0.35rem' }}
          >
            <option value="sfx">sfx</option>
            <option value="music">music</option>
          </select>
        </label>
        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          Tags (comma-separated)
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            style={{ width: '100%', marginTop: '0.25rem', padding: '0.35rem' }}
          />
        </label>
        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Engine notes (optional)
          <input
            value={engineNotes}
            onChange={(e) => setEngineNotes(e.target.value)}
            placeholder="Existing Unity clip name, if any"
            style={{ width: '100%', marginTop: '0.25rem', padding: '0.35rem' }}
          />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={saving} style={{ flex: 1, background: 'var(--forge-gold)', color: '#000' }}>
            {saving ? 'Importing…' : 'Import'}
          </button>
          <button type="button" onClick={onClose} disabled={saving} style={{ flex: 1 }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export function AudioLibrary({ gameId }: { gameId: string }) {
  const { projectId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { setActiveProject } = useProjectStore()
  const [assets, setAssets] = useState<AudioAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | AudioKind>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [importPath, setImportPath] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<AudioAsset | null>(null)
  const [editName, setEditName] = useState('')
  const [editKind, setEditKind] = useState<AudioKind>('sfx')
  const [editTags, setEditTags] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const loadGenRef = useRef(0)

  const refreshProject = useCallback(async () => {
    if (!projectId) return
    const updated = await window.indieForge.projects.open(projectId)
    setActiveProject(updated)
  }, [projectId, setActiveProject])

  const loadAssets = useCallback(async () => {
    const gen = ++loadGenRef.current
    try {
      setLoading(true)
      setError(null)
      const loaded = await window.indieForge.audioAssets.list(gameId)
      if (gen !== loadGenRef.current) return
      setAssets(loaded)
    } catch (err) {
      if (gen !== loadGenRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load audio')
    } finally {
      if (gen === loadGenRef.current) setLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    void loadAssets()
    return () => {
      loadGenRef.current++
    }
  }, [loadAssets])

  const selected = assets.find((a) => a.id === selectedId) || null

  useEffect(() => {
    if (!selected) return
    setEditName(selected.name)
    setEditKind(selected.kind)
    setEditTags(selected.tags.join(', '))
    setEditNotes(selected.engineNotes || '')
  }, [selected?.id])

  const filtered = assets.filter((asset) => {
    const q = searchTerm.toLowerCase()
    const matchesSearch =
      !q ||
      asset.name.toLowerCase().includes(q) ||
      asset.tags.some((tag) => tag.toLowerCase().includes(q))
    const matchesKind = kindFilter === 'all' || asset.kind === kindFilter
    return matchesSearch && matchesKind
  })

  async function handleChooseImport() {
    setError(null)
    const { filePath } = await window.indieForge.files.chooseAudio()
    if (!filePath) return
    setImportPath(filePath)
  }

  async function handleSaveEdit() {
    if (!selected) return
    setSavingEdit(true)
    setError(null)
    try {
      await window.indieForge.audioAssets.update(selected.id, gameId, {
        name: editName,
        kind: editKind,
        tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
        engineNotes: editNotes
      })
      await refreshProject()
      await loadAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update audio')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleReplaceFile() {
    if (!selected) return
    const { filePath } = await window.indieForge.files.chooseAudio()
    if (!filePath) return
    setError(null)
    try {
      await window.indieForge.audioAssets.update(selected.id, gameId, { file: filePath })
      await refreshProject()
      await loadAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace audio file')
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    try {
      await window.indieForge.audioAssets.remove(deleteConfirm.id, gameId)
      if (selectedId === deleteConfirm.id) setSelectedId(null)
      setDeleteConfirm(null)
      await refreshProject()
      await loadAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete audio')
      setDeleteConfirm(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
        Loading audio...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              type="text"
              placeholder="Search audio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', fontSize: '0.9rem' }}
            />
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as 'all' | AudioKind)}
              style={{ padding: '0.5rem', fontSize: '0.9rem' }}
            >
              <option value="all">All kinds</option>
              <option value="sfx">sfx</option>
              <option value="music">music</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleChooseImport()}
            style={{
              width: '100%',
              padding: '0.5rem',
              background: 'var(--forge-gold)',
              color: 'black',
              fontWeight: 'bold'
            }}
          >
            + Import Audio
          </button>
          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
              {searchTerm || kindFilter !== 'all'
                ? 'No audio matches your filters'
                : 'No audio yet. Click "+ Import Audio" to copy a file into the Game library.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filtered.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setSelectedId(asset.id)}
                  style={{
                    textAlign: 'left',
                    padding: '0.75rem',
                    border:
                      selectedId === asset.id ? '2px solid var(--forge-gold)' : '1px solid var(--border)',
                    borderRadius: '4px',
                    background: selectedId === asset.id ? 'var(--bg-secondary)' : 'var(--bg)',
                    color: 'inherit',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{asset.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                    {asset.kind} · {formatAudioDuration(asset.durationSec)}
                    {asset.tags.length > 0 ? ` · ${asset.tags.join(', ')}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          style={{
            padding: '0.5rem 1rem',
            borderTop: '1px solid var(--border)',
            fontSize: '0.75rem',
            color: 'var(--muted)'
          }}
        >
          {filtered.length} audio asset{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div
        style={{
          width: '320px',
          borderLeft: '1px solid var(--border)',
          padding: '1rem',
          overflowY: 'auto',
          flexShrink: 0
        }}
      >
        {!selected ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Select an audio asset to preview and edit. Preview uses sanctioned forge-file access.
          </p>
        ) : (
          <div>
            <h3 style={{ marginTop: 0 }}>{selected.name}</h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
              {selected.kind} · {formatAudioDuration(selected.durationSec)}
            </div>
            <ForgeAudioPreview filePath={selected.file} />
            <label style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.75rem' }}>
              Name
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem', padding: '0.35rem' }}
              />
            </label>
            <label style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Kind
              <select
                value={editKind}
                onChange={(e) => setEditKind(e.target.value as AudioKind)}
                style={{ width: '100%', marginTop: '0.25rem', padding: '0.35rem' }}
              >
                <option value="sfx">sfx</option>
                <option value="music">music</option>
              </select>
            </label>
            <label style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Tags
              <input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem', padding: '0.35rem' }}
              />
            </label>
            <label style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Engine notes
              <input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem', padding: '0.35rem' }}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSaveEdit()}
              disabled={savingEdit}
              style={{ width: '100%', marginTop: '0.75rem' }}
            >
              Save metadata
            </button>
            <button
              type="button"
              onClick={() => void handleReplaceFile()}
              style={{ width: '100%', marginTop: '0.35rem' }}
            >
              Replace file
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirm(selected)}
              style={{
                width: '100%',
                marginTop: '0.35rem',
                background: 'var(--danger)',
                color: 'white'
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {importPath && (
        <ImportAudioModal
          gameId={gameId}
          sourcePath={importPath}
          onClose={() => setImportPath(null)}
          onImported={() => {
            void refreshProject()
            void loadAssets()
          }}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete audio"
          message={`Delete "${deleteConfirm.name}" from this Game library? Studio copy is removed from the catalog.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger={true}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
