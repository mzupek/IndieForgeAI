import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  GameDefinition,
  GameDefinitionStage,
  MVPBoardItem,
  MVPBoardItemType,
  MVPBoardStatus,
  ThemeSlot,
  InteractionStub,
  TuningProfile,
  Character,
  Pose,
  Clip,
  ScenePreset
} from '@shared/types/assetPipeline'
import { useProjectStore } from '../state/indieForgeStore'

export function GameDefinitionView() {
  const { gameId } = useParams<{ gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  
  const [definition, setDefinition] = useState<GameDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'editor'>('preview')
  const [markdownSource, setMarkdownSource] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const game = activeProject?.assetPipeline?.games.find(g => g.id === gameId)
  const characters = activeProject?.assetPipeline?.characters.filter(c => c.gameId === gameId) ?? []
  const poses = activeProject?.assetPipeline?.poses ?? []
  const clips = activeProject?.assetPipeline?.clips ?? []
  const presets = activeProject?.assetPipeline?.scenePresets ?? []

  useEffect(() => {
    loadDefinition()
  }, [gameId])

  useEffect(() => {
    if (definition && definition.markdownSource) {
      setMarkdownSource(definition.markdownSource)
      setHasUnsavedChanges(false)
    }
  }, [definition?.id])

  async function loadDefinition() {
    if (!gameId) return
    
    setLoading(true)
    try {
      let def = await window.indieForge.gameDefinitions.getByGame(gameId)
      
      if (!def) {
        def = await window.indieForge.gameDefinitions.create(gameId)
      }
      
      setDefinition(def)
    } catch (err) {
      console.error('Failed to load game definition:', err)
    } finally {
      setLoading(false)
    }
  }

  async function saveMarkdown() {
    if (!definition) return
    
    setSaving(true)
    try {
      const updated = await window.indieForge.gameDefinitions.update(
        definition.id,
        { markdownSource }
      )
      setDefinition(updated)
      setHasUnsavedChanges(false)
    } catch (err) {
      console.error('Failed to save game definition:', err)
      alert('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  function handleMarkdownChange(value: string) {
    setMarkdownSource(value)
    setHasUnsavedChanges(true)
  }

  function renderResourceTag(content: string): string {
    // Replace [[type:id|label]] with styled version
    return content.replace(
      /\[\[(\w+):([a-zA-Z0-9-]+)\|([^\]]+)\]\]/g,
      '<span style="background: var(--bg-secondary); padding: 0.125rem 0.375rem; border-radius: 3px; border: 1px solid var(--border); font-family: monospace; font-size: 0.85rem;">$3</span>'
    )
  }

  function insertResourceTag(type: 'character' | 'pose' | 'clip' | 'preset', id: string, label: string) {
    const tag = `[[${type}:${id}|${label}]]`
    const textarea = textareaRef.current
    if (!textarea) return
    
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = markdownSource
    const newText = text.substring(0, start) + tag + text.substring(end)
    
    handleMarkdownChange(newText)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + tag.length, start + tag.length)
    }, 0)
  }

  async function handleExportMarkdown() {
    if (!definition) return
    
    const markdown = markdownSource
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${gameId}-definition.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Custom renderer for resource tags
  function preprocessMarkdown(content: string): string {
    // Replace [[type:id|label]] with just the label wrapped in a code tag for styling
    return content.replace(
      /\[\[(\w+):([a-zA-Z0-9-]+)\|([^\]]+)\]\]/g,
      '`$3`'
    )
  }

  if (!activeProject) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Loading project...</p>
      </div>
    )
  }

  if (!activeProject.assetPipeline) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--error)' }}>Asset pipeline not found</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading game definition...</p>
      </div>
    )
  }

  if (!definition || !game) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Game definition not found</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1>{game.name} — Game Definition</h1>
        <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>
          Living design document with structured fields and markdown bible
        </p>
      </div>

      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          className={activeTab === 'preview' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('preview')}
          style={{ 
            borderRadius: '4px 4px 0 0',
            borderBottom: activeTab === 'preview' ? '2px solid var(--primary)' : 'none'
          }}
        >
          Preview
        </button>
        <button
          type="button"
          className={activeTab === 'editor' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('editor')}
          style={{ 
            borderRadius: '4px 4px 0 0',
            borderBottom: activeTab === 'editor' ? '2px solid var(--primary)' : 'none'
          }}
        >
          Markdown Editor
        </button>
      </div>

      {activeTab === 'preview' && (
        <div style={{ 
          padding: '2rem', 
          background: 'var(--bg-secondary)', 
          borderRadius: '8px',
          border: '1px solid var(--border)',
          maxWidth: '900px',
          margin: '0 auto'
        }}>
          <div className="markdown-preview" style={{
            lineHeight: '1.6',
            color: 'var(--fg)'
          }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {preprocessMarkdown(markdownSource || '_(No content yet — switch to Markdown Editor to add text)_')}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {activeTab === 'editor' && (
        <div>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <strong>Resource Tag Syntax:</strong> <code>[[type:id|label]]</code>
              </p>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Examples: <code>[[character:abc-123|Hero]]</code> <code>[[pose:xyz-789|Hero Ready]]</code>
              </p>
              {hasUnsavedChanges && (
                <p style={{ color: 'var(--warning)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  ⚠ Unsaved changes
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="primary"
                onClick={saveMarkdown}
                disabled={saving || !hasUnsavedChanges}
              >
                {saving ? 'Saving...' : 'Save Markdown'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={handleExportMarkdown}
              >
                Export MD
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: '1rem' }}>
            <div>
              <textarea
                ref={textareaRef}
                value={markdownSource}
                onChange={(e) => handleMarkdownChange(e.target.value)}
                placeholder="Write your game definition markdown here..."
                rows={30}
                style={{ 
                  width: '100%', 
                  fontFamily: 'monospace',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ 
              border: '1px solid var(--border)', 
              borderRadius: '4px', 
              padding: '1rem',
              maxHeight: '800px',
              overflowY: 'auto'
            }}>
              <h3 style={{ marginTop: 0 }}>Insert Resource Tags</h3>
              
              <details open>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>Characters</summary>
                {characters.map(char => (
                  <button
                    key={char.id}
                    type="button"
                    className="secondary"
                    onClick={() => insertResourceTag('character', char.id, char.name)}
                    style={{ 
                      display: 'block', 
                      width: '100%', 
                      marginBottom: '0.25rem',
                      textAlign: 'left',
                      fontSize: '0.85rem'
                    }}
                  >
                    {char.name}
                  </button>
                ))}
              </details>

              <details open style={{ marginTop: '1rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>Poses</summary>
                {poses.map(pose => {
                  const char = characters.find(c => c.id === pose.characterId)
                  return (
                    <button
                      key={pose.id}
                      type="button"
                      className="secondary"
                      onClick={() => insertResourceTag('pose', pose.id, `${char?.name} ${pose.slot}`)}
                      style={{ 
                        display: 'block', 
                        width: '100%', 
                        marginBottom: '0.25rem',
                        textAlign: 'left',
                        fontSize: '0.85rem'
                      }}
                    >
                      {char?.name} - {pose.slot}
                    </button>
                  )
                })}
              </details>

              <details open style={{ marginTop: '1rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>Clips</summary>
                {clips.filter(c => c.characterId).map(clip => {
                  const char = characters.find(c => c.id === clip.characterId)
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      className="secondary"
                      onClick={() => insertResourceTag('clip', clip.id, `${char?.name} ${clip.moment}`)}
                      style={{ 
                        display: 'block', 
                        width: '100%', 
                        marginBottom: '0.25rem',
                        textAlign: 'left',
                        fontSize: '0.85rem'
                      }}
                    >
                      {char?.name} - {clip.moment}
                    </button>
                  )
                })}
              </details>

              <details open style={{ marginTop: '1rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>Presets</summary>
                {presets.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    className="secondary"
                    onClick={() => insertResourceTag('preset', preset.id, preset.type)}
                    style={{ 
                      display: 'block', 
                      width: '100%', 
                      marginBottom: '0.25rem',
                      textAlign: 'left',
                      fontSize: '0.85rem'
                    }}
                  >
                    {preset.type}
                  </button>
                ))}
              </details>
            </div>
          </div>
        </div>
      )}

      {saving && (
        <div style={{ 
          position: 'fixed', 
          bottom: '1rem', 
          right: '1rem', 
          padding: '0.5rem 1rem',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '4px'
        }}>
          Saving...
        </div>
      )}
    </div>
  )
}
