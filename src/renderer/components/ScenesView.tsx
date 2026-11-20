/**
 * ScenesView - Phase C: Scenes as the spine
 * List/create/edit scenes with attached storyboards and presets
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Scene, Character, ScenePreset } from '@shared/types/assetPipeline'
import { useProjectStore } from '../state/indieForgeStore'

function getPresetLabel(preset: ScenePreset): string {
  const params = preset.params
  let summary = ''
  
  switch (preset.type) {
    case 'shake':
      summary = `intensity ${params.intensity || 10} · ${params.durationMs || 300}ms`
      break
    case 'flash':
      summary = `${params.color || 'white'} · ${params.durationMs || 200}ms`
      break
    case 'freeze':
      summary = `${params.durationMs || 500}ms`
      break
    case 'zoom_punch':
      summary = `zoom ${params.scale || 1.15}x · ${params.durationMs || 300}ms`
      break
    case 'versus':
      summary = `zoom ${params.zoom || 1.0}x`
      break
  }
  
  if (preset.tags.length > 0) {
    return `${preset.type} - ${preset.tags[0]} (${summary})`
  }
  return `${preset.type} (${summary})`
}

interface SceneCardProps {
  scene: Scene
  characters: Character[]
  presets: ScenePreset[]
  onEdit: () => void
  onDelete: () => void
  onOpenStoryboard: () => void
}

function SceneCard({
  scene,
  characters,
  presets,
  onEdit,
  onDelete,
  onOpenStoryboard
}: SceneCardProps) {
  const castCharacters = characters.filter(c => scene.cast.includes(c.id))
  const attachedPresets = presets.filter(p => scene.attachedPresets.includes(p.id))
  const presetLabels = attachedPresets.map(p => {
    const tag = p.tags.length > 0 ? p.tags[0] : p.type
    return tag
  })

  return (
    <div
      className="scene-card"
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1rem',
        background: 'var(--bg-secondary)'
      }}
    >
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ margin: '0 0 0.5rem 0' }}>{scene.name}</h4>
        {scene.description && (
          <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
            {scene.description}
          </p>
        )}
      </div>

      {scene.background && (
        <div style={{ marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
            <strong>Background:</strong> {scene.background}
          </p>
        </div>
      )}

      {scene.storyText && (
        <div style={{ marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', fontStyle: 'italic' }}>
            "{scene.storyText}"
          </p>
        </div>
      )}

      <div style={{ marginBottom: '0.75rem' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
          <strong>Cast:</strong> {castCharacters.length > 0 ? castCharacters.map(c => c.name).join(', ') : 'None'}
        </p>
        {presetLabels.length > 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
            <strong>FX Recipes:</strong> {presetLabels.join(', ')}
          </p>
        )}
        {scene.storyboardId && (
          <p style={{ fontSize: '0.85rem', color: 'var(--success)', marginTop: '0.25rem' }}>
            ✓ Storyboard attached
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {scene.storyboardId ? (
          <button type="button" onClick={onOpenStoryboard} style={{ flex: 1 }}>
            Open Storyboard
          </button>
        ) : (
          <button type="button" onClick={onOpenStoryboard} style={{ flex: 1 }}>
            Create Storyboard
          </button>
        )}
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

interface SceneEditDialogProps {
  gameId: string
  scene?: Scene
  characters: Character[]
  presets: ScenePreset[]
  onClose: () => void
  onSaved: () => void
}

function SceneEditDialog({
  gameId,
  scene,
  characters,
  presets,
  onClose,
  onSaved
}: SceneEditDialogProps) {
  const [name, setName] = useState(scene?.name ?? '')
  const [description, setDescription] = useState(scene?.description ?? '')
  const [background, setBackground] = useState(scene?.background ?? '')
  const [storyText, setStoryText] = useState(scene?.storyText ?? '')
  const [selectedCast, setSelectedCast] = useState<Set<string>>(
    new Set(scene?.cast ?? [])
  )
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(
    new Set(scene?.attachedPresets ?? [])
  )
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      if (scene) {
        await window.indieForge.pipeline.updateScene(scene.id, {
          name,
          description,
          background,
          storyText,
          cast: Array.from(selectedCast),
          attachedPresets: Array.from(selectedPresets)
        })
      } else {
        const newScene = await window.indieForge.pipeline.createScene(gameId, {
          name,
          description,
          background,
          storyText
        })
        
        // Add characters to cast
        for (const characterId of selectedCast) {
          await window.indieForge.pipeline.addCharacterToScene(newScene.id, characterId)
        }
        
        // Attach presets
        for (const presetId of selectedPresets) {
          await window.indieForge.pipeline.attachPresetToScene(newScene.id, presetId)
        }
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('Failed to save scene:', err)
      alert(err instanceof Error ? err.message : 'Failed to save scene')
    } finally {
      setSaving(false)
    }
  }

  const toggleCast = (characterId: string) => {
    const newCast = new Set(selectedCast)
    if (newCast.has(characterId)) {
      newCast.delete(characterId)
    } else {
      newCast.add(characterId)
    }
    setSelectedCast(newCast)
  }

  const togglePreset = (presetId: string) => {
    const newPresets = new Set(selectedPresets)
    if (newPresets.has(presetId)) {
      newPresets.delete(presetId)
    } else {
      newPresets.add(presetId)
    }
    setSelectedPresets(newPresets)
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '2rem',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto'
        }}
      >
        <h3 style={{ marginTop: 0 }}>{scene ? 'Edit Scene' : 'Create Scene'}</h3>
        
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="scene-name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
            Name *
          </label>
          <input
            id="scene-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Opening Battle"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="scene-description" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
            Description
          </label>
          <textarea
            id="scene-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the scene"
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="scene-background" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
            Background
          </label>
          <input
            id="scene-background"
            type="text"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="Background description or reference"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="scene-story-text" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
            Story / Dialogue Text
          </label>
          <textarea
            id="scene-story-text"
            value={storyText}
            onChange={(e) => setStoryText(e.target.value)}
            placeholder="Key dialogue or narrative text for this scene"
            rows={4}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            Cast
          </label>
          {characters.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No characters available</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {characters.map((character) => (
                <label
                  key={character.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: selectedCast.has(character.id) ? 'var(--bg-secondary)' : 'transparent'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedCast.has(character.id)}
                    onChange={() => toggleCast(character.id)}
                  />
                  <span>{character.name} ({character.role})</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            FX Recipe References
          </label>
          {presets.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              No recipes yet — add effects from the Scene storyboard timeline
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
              {presets.map((preset) => (
                <label
                  key={preset.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: selectedPresets.has(preset.id) ? 'var(--bg-secondary)' : 'transparent',
                    fontSize: '0.85rem'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedPresets.has(preset.id)}
                    onChange={() => togglePreset(preset.id)}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: selectedPresets.has(preset.id) ? 'bold' : 'normal' }}>
                      {getPresetLabel(preset)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ScenesView() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { activeProject } = useProjectStore()
  const [scenes, setScenes] = useState<Scene[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [presets, setPresets] = useState<ScenePreset[]>([])
  const [loading, setLoading] = useState(true)
  const [editingScene, setEditingScene] = useState<Scene | undefined>(undefined)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const loadScenes = async () => {
    if (!gameId) return
    
    setLoading(true)
    try {
      const scenesList = await window.indieForge.pipeline.listScenes(gameId)
      setScenes(scenesList)

      // Load characters and presets from active project
      if (activeProject?.assetPipeline) {
        const gameCharacters = activeProject.assetPipeline.characters.filter(
          (c: Character) => c.gameId === gameId
        )
        setCharacters(gameCharacters)
        setPresets(activeProject.assetPipeline.scenePresets || [])
      }
    } catch (err) {
      console.error('Failed to load scenes:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeProject) {
      loadScenes()
    }
  }, [gameId, activeProject])

  const handleDelete = async (scene: Scene) => {
    if (!confirm(`Delete scene "${scene.name}"?${scene.storyboardId ? ' This will also remove the attached storyboard.' : ''}`)) {
      return
    }

    try {
      await window.indieForge.pipeline.deleteScene(scene.id, true)
      await loadScenes()
    } catch (err) {
      console.error('Failed to delete scene:', err)
      alert('Failed to delete scene')
    }
  }

  const handleOpenStoryboard = async (scene: Scene) => {
    try {
      if (scene.storyboardId) {
        navigate(`/studio/storyboards/${gameId}?storyboardId=${scene.storyboardId}`)
      } else {
        const result = await window.indieForge.pipeline.createSceneStoryboard(scene.id, {
          name: `${scene.name} Storyboard`
        })
        navigate(`/studio/storyboards/${gameId}?storyboardId=${result.storyboardId}`)
      }
    } catch (err) {
      console.error('Failed to open/create storyboard:', err)
      alert('Failed to open/create storyboard')
    }
  }

  if (!activeProject) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Loading studio...</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Loading scenes...</p>
      </div>
    )
  }

  if (!activeProject.assetPipeline) {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: 'var(--error)' }}>No active project. Please open a project first.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0 }}>Scenes</h2>
          <p style={{ margin: '0.5rem 0 0 0', color: 'var(--muted)' }}>
            Narrative moments with cast, story, and attached storyboards. Attach FX presets (juice recipes) and open storyboards from here.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreateDialog(true)}>
          Create Scene
        </button>
      </div>

      {scenes.length === 0 ? (
        <div
          style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            border: '1px dashed var(--border)',
            borderRadius: '8px',
            color: 'var(--muted)'
          }}
        >
          <p style={{ margin: '0 0 1rem 0' }}>No scenes yet</p>
          <button type="button" onClick={() => setShowCreateDialog(true)}>
            Create Your First Scene
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '1.5rem'
          }}
        >
          {scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              characters={characters}
              presets={presets}
              onEdit={() => setEditingScene(scene)}
              onDelete={() => handleDelete(scene)}
              onOpenStoryboard={() => handleOpenStoryboard(scene)}
            />
          ))}
        </div>
      )}

      {(showCreateDialog || editingScene) && (
        <SceneEditDialog
          gameId={gameId!}
          scene={editingScene}
          characters={characters}
          presets={presets}
          onClose={() => {
            setShowCreateDialog(false)
            setEditingScene(undefined)
          }}
          onSaved={loadScenes}
        />
      )}
    </div>
  )
}
