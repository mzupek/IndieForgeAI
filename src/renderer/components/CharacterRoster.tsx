import { useEffect, useState, useRef } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import type { Character, Pose } from '@shared/types/assetPipeline'
import type { PoseMetadata } from '@shared/poseValidation'
import { PoseSlotStrip } from './PoseSlotStrip'

const POSE_SLOTS = ['ready', 'success', 'hurt', 'win', 'defeat'] as const

function CharacterCard({
  character,
  poses,
  poseMetadata,
  onEdit,
  onDelete,
  onManagePoses
}: {
  character: Character
  poses: Pose[]
  poseMetadata?: Record<string, PoseMetadata>
  onEdit: () => void
  onDelete: () => void
  onManagePoses: () => void
}) {
  // Fallback: if character.thumbnail is null, use first approved pose
  const thumbnailPath = character.thumbnail || 
    poses.find(p => p.characterId === character.id && p.status === 'approved')?.file || 
    null
  const thumbnail = useLocalFilePreview(thumbnailPath)

  return (
    <div
      className="character-card"
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1rem',
        background: 'var(--bg-secondary)'
      }}
    >
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div
          style={{
            width: '128px',
            height: '128px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            overflow: 'hidden',
            flexShrink: 0,
            background: 'var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={character.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No image</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>{character.name}</h4>
          <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
            <strong>Role:</strong> {character.role}
          </p>
          {character.styleNotes && (
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {character.styleNotes}
            </p>
          )}
          {character.tags && character.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {character.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: '0.125rem 0.5rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    color: 'var(--muted)'
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
          Five-Pose Set:
        </p>
        <PoseSlotStrip
          character={character}
          poses={poses}
          poseMetadata={poseMetadata}
          size="small"
          showBadge={true}
          onSlotClick={onManagePoses}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={onManagePoses} style={{ flex: 1 }}>
          Manage Poses
        </button>
        <button type="button" className="secondary" onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          className="ghost"
          onClick={onDelete}
          style={{ color: 'var(--error)' }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function CharacterEditDialog({
  projectId,
  gameId,
  character,
  onClose,
  onSaved
}: {
  projectId: string
  gameId: string
  character?: Character
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(character?.name ?? '')
  const [role, setRole] = useState(character?.role ?? '')
  const [styleNotes, setStyleNotes] = useState(character?.styleNotes ?? '')
  const [tags, setTags] = useState(character?.tags.join(', ') ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !role.trim()) return

    setSaving(true)
    setError(null)

    try {
      const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean)
      
      if (character) {
        await window.indieForge.pipeline.updateCharacter(projectId, character.id, {
          name: name.trim(),
          role: role.trim(),
          styleNotes: styleNotes.trim() || undefined,
          tags: tagArray
        })
      } else {
        await window.indieForge.pipeline.createCharacter(projectId, {
          gameId,
          name: name.trim(),
          role: role.trim(),
          styleNotes: styleNotes.trim() || undefined,
          tags: tagArray
        })
      }
      
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save character')
    } finally {
      setSaving(false)
    }
  }

  const handleFileSelect = async (file: File) => {
    if (!character) return
    
    setSaving(true)
    setError(null)

    try {
      // Create a temporary path for the file
      const { filePath } = await window.indieForge.files.chooseImage()
      if (filePath) {
        await window.indieForge.pipeline.setCharacterReference(projectId, character.id, filePath)
        onSaved()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set reference image')
    } finally {
      setSaving(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file)
    }
  }

  const handleBrowse = async () => {
    if (!character) return
    
    setSaving(true)
    setError(null)

    try {
      const { filePath } = await window.indieForge.files.chooseImage()
      if (filePath) {
        await window.indieForge.pipeline.setCharacterReference(projectId, character.id, filePath)
        onSaved()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set reference image')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '1.5rem',
          width: '90%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 1rem 0' }}>
          {character ? 'Edit Character' : 'New Character'}
        </h3>

        {error && (
          <div style={{ padding: '0.75rem', background: 'var(--error-bg)', border: '1px solid var(--error)', borderRadius: '4px', marginBottom: '1rem', color: 'var(--error)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label>
            Name *
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              required
            />
          </label>

          <label>
            Role *
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. player, boss, npc"
              disabled={saving}
              required
            />
          </label>

          <label>
            Style Notes
            <textarea
              value={styleNotes}
              onChange={(e) => setStyleNotes(e.target.value)}
              placeholder="Appearance, personality, art direction notes..."
              disabled={saving}
              rows={3}
            />
          </label>

          <label>
            Tags
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Comma-separated: hero, fire, fast"
              disabled={saving}
            />
          </label>

          {character && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Reference Image:</p>
              <div
                style={{
                  border: dragActive ? '2px dashed var(--forge-gold)' : '2px dashed var(--border)',
                  borderRadius: '4px',
                  padding: '1rem',
                  textAlign: 'center',
                  background: dragActive ? 'rgba(255, 200, 0, 0.05)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={handleBrowse}
              >
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                  {dragActive ? 'Drop image here' : 'Click to browse or drag & drop'}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" disabled={saving || !name.trim() || !role.trim()}>
              {saving ? 'Saving...' : character ? 'Update' : 'Create'}
            </button>
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function CharacterRoster() {
  const navigate = useNavigate()
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  const [editingCharacter, setEditingCharacter] = useState<Character | undefined>()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [poseMetadataCache, setPoseMetadataCache] = useState<Record<string, Record<string, PoseMetadata>>>({})

  useEffect(() => {
    // Load pose metadata for all characters
    const loadMetadata = async () => {
      if (!activeProject?.assetPipeline) return
      
      const characters = activeProject.assetPipeline.characters.filter((c) => c.gameId === gameId)
      const cache: Record<string, Record<string, PoseMetadata>> = {}
      
      for (const char of characters) {
        try {
          const metadata = await window.indieForge.pipeline.getPoseMetadata(projectId!, char.id)
          cache[char.id] = metadata
        } catch (err) {
          console.error(`Failed to load metadata for ${char.id}:`, err)
        }
      }
      
      setPoseMetadataCache(cache)
    }
    
    loadMetadata()
  }, [activeProject, projectId, gameId])

  if (!activeProject || !gameId) {
    return <p style={{ color: 'var(--muted)' }}>Loading...</p>
  }

  const game = activeProject.assetPipeline?.games.find((g) => g.id === gameId)
  const characters = activeProject.assetPipeline?.characters.filter((c) => c.gameId === gameId) ?? []
  const poses = activeProject.assetPipeline?.poses ?? []

  if (!game) {
    return <p style={{ color: 'var(--error)' }}>Game not found</p>
  }

  const handleDelete = async (character: Character) => {
    if (!confirm(`Delete ${character.name}? This will also remove all associated poses.`)) {
      return
    }

    try {
      await window.indieForge.pipeline.deleteCharacter(projectId!, character.id)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete character')
    }
  }

  const handleSaved = async () => {
    const updated = await window.indieForge.projects.open(projectId!)
    setActiveProject(updated)
    setEditingCharacter(undefined)
    setShowCreateDialog(false)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Characters</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {game.name} • {game.engine} • {characters.length} character{characters.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button type="button" onClick={() => setShowCreateDialog(true)}>
          + New Character
        </button>
      </div>

      <div className="panel-section">
        {characters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No characters yet</p>
            <p style={{ fontSize: '0.9rem' }}>
              Create your first character to start building the roster.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))' }}>
            {characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                poses={poses}
                poseMetadata={poseMetadataCache[character.id]}
                onEdit={() => setEditingCharacter(character)}
                onDelete={() => handleDelete(character)}
                onManagePoses={() => navigate(`/studio/poses/${gameId}?character=${character.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {(showCreateDialog || editingCharacter) && (
        <CharacterEditDialog
          projectId={projectId!}
          gameId={gameId}
          character={editingCharacter}
          onClose={() => {
            setEditingCharacter(undefined)
            setShowCreateDialog(false)
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
