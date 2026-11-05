import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
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
import { IPC_CHANNELS } from '@shared/ipc'
import { useProjectStore } from '../state/indieForgeStore'

const { ipcRenderer } = window.electron

export function GameDefinitionView() {
  const { gameId } = useParams<{ gameId: string }>()
  const { assetPipeline } = useProjectStore()
  
  const [definition, setDefinition] = useState<GameDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'structured' | 'markdown'>('structured')
  const [markdownSource, setMarkdownSource] = useState('')
  const [selectedCast, setSelectedCast] = useState<string[]>([])
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const game = assetPipeline.games.find(g => g.id === gameId)
  const characters = assetPipeline.characters.filter(c => c.gameId === gameId)
  const poses = assetPipeline.poses
  const clips = assetPipeline.clips
  const presets = assetPipeline.scenePresets

  useEffect(() => {
    loadDefinition()
  }, [gameId])

  useEffect(() => {
    if (definition) {
      setMarkdownSource(definition.markdownSource || generateMarkdown())
      setSelectedCast(definition.cast || [])
    }
  }, [definition])

  async function loadDefinition() {
    if (!gameId) return
    
    setLoading(true)
    try {
      let def = await ipcRenderer.invoke(IPC_CHANNELS.GAME_DEFINITION_GET_BY_GAME, gameId)
      
      if (!def) {
        def = await ipcRenderer.invoke(IPC_CHANNELS.GAME_DEFINITION_CREATE, gameId)
      }
      
      setDefinition(def)
    } catch (err) {
      console.error('Failed to load game definition:', err)
    } finally {
      setLoading(false)
    }
  }

  async function saveDefinition(updates: Partial<GameDefinition>) {
    if (!definition) return
    
    setSaving(true)
    try {
      const updated = await ipcRenderer.invoke(
        IPC_CHANNELS.GAME_DEFINITION_UPDATE,
        definition.id,
        updates
      )
      setDefinition(updated)
    } catch (err) {
      console.error('Failed to save game definition:', err)
    } finally {
      setSaving(false)
    }
  }

  function generateMarkdown(): string {
    if (!definition) return ''
    
    const sections: string[] = []
    
    sections.push(`# ${game?.name || gameId} — Game Definition`)
    sections.push(`\n**Status:** Stage ${definition.stage}\n`)
    
    if (definition.pillars.length > 0) {
      sections.push('## Core Pillars\n')
      definition.pillars.forEach(pillar => {
        sections.push(`- ${pillar}`)
      })
      sections.push('')
    }
    
    if (definition.puzzleCore) {
      sections.push('## Puzzle Core\n')
      sections.push(definition.puzzleCore)
      sections.push('')
    }
    
    if (definition.storySynopsis) {
      sections.push('## Story Synopsis\n')
      sections.push(definition.storySynopsis)
      sections.push('')
    }
    
    if (definition.cast.length > 0) {
      sections.push('## Cast\n')
      definition.cast.forEach(characterId => {
        const char = characters.find(c => c.id === characterId)
        if (char) {
          sections.push(`- [[character:${characterId}|${char.name}]] (${char.role})`)
        }
      })
      sections.push('')
    }
    
    if (definition.keepCutInvent.keep.length > 0) {
      sections.push('## KEEP\n')
      definition.keepCutInvent.keep.forEach(item => {
        sections.push(`- ${item}`)
      })
      sections.push('')
    }
    
    if (definition.keepCutInvent.cut.length > 0) {
      sections.push('## CUT / defer from MVP\n')
      definition.keepCutInvent.cut.forEach(item => {
        sections.push(`- ${item}`)
      })
      sections.push('')
    }
    
    if (definition.keepCutInvent.invent.length > 0) {
      sections.push('## INVENT only as MVP glue\n')
      definition.keepCutInvent.invent.forEach(item => {
        sections.push(`- ${item}`)
      })
      sections.push('')
    }
    
    if (definition.mvpBoard.length > 0) {
      sections.push('## MVP Board\n')
      sections.push('| Item | Type | Status | Notes |')
      sections.push('|------|------|--------|-------|')
      definition.mvpBoard.forEach(item => {
        sections.push(`| ${item.item} | ${item.type} | ${item.status} | ${item.notes || ''} |`)
      })
      sections.push('')
    }
    
    return sections.join('\n')
  }

  function insertResourceTag(type: 'character' | 'pose' | 'clip' | 'preset', id: string, label: string) {
    const tag = `[[${type}:${id}|${label}]]`
    const textarea = textareaRef.current
    if (!textarea) return
    
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = markdownSource
    const newText = text.substring(0, start) + tag + text.substring(end)
    
    setMarkdownSource(newText)
    
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
          className={activeTab === 'structured' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('structured')}
          style={{ 
            borderRadius: '4px 4px 0 0',
            borderBottom: activeTab === 'structured' ? '2px solid var(--primary)' : 'none'
          }}
        >
          Structured
        </button>
        <button
          type="button"
          className={activeTab === 'markdown' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('markdown')}
          style={{ 
            borderRadius: '4px 4px 0 0',
            borderBottom: activeTab === 'markdown' ? '2px solid var(--primary)' : 'none'
          }}
        >
          Markdown Editor
        </button>
      </div>

      {activeTab === 'structured' && (
        <div>
          <section style={{ marginBottom: '2rem' }}>
            <h2>Basic Info</h2>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '200px 1fr' }}>
              <label>
                <strong>Stage:</strong>
              </label>
              <select
                value={definition.stage}
                onChange={(e) => saveDefinition({ stage: e.target.value as GameDefinitionStage })}
                style={{ maxWidth: '200px' }}
              >
                <option value="MVP">MVP</option>
                <option value="Beta">Beta</option>
                <option value="Testing">Testing</option>
                <option value="Release">Release</option>
              </select>
            </div>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2>Core Pillars</h2>
            {definition.pillars.map((pillar, idx) => (
              <div key={idx} style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={pillar}
                  onChange={(e) => {
                    const newPillars = [...definition.pillars]
                    newPillars[idx] = e.target.value
                    saveDefinition({ pillars: newPillars })
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const newPillars = definition.pillars.filter((_, i) => i !== idx)
                    saveDefinition({ pillars: newPillars })
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => {
                saveDefinition({ pillars: [...definition.pillars, ''] })
              }}
            >
              + Add Pillar
            </button>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2>Puzzle Core</h2>
            <textarea
              value={definition.puzzleCore}
              onChange={(e) => saveDefinition({ puzzleCore: e.target.value })}
              placeholder="Describe the core gameplay loop and mechanics..."
              rows={6}
              style={{ width: '100%' }}
            />
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2>Story Synopsis</h2>
            <textarea
              value={definition.storySynopsis}
              onChange={(e) => saveDefinition({ storySynopsis: e.target.value })}
              placeholder="Brief story overview..."
              rows={6}
              style={{ width: '100%' }}
            />
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2>Cast</h2>
            <div style={{ marginBottom: '1rem' }}>
              {characters.map(char => (
                <label key={char.id} style={{ display: 'block', marginBottom: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedCast.includes(char.id)}
                    onChange={(e) => {
                      const newCast = e.target.checked
                        ? [...selectedCast, char.id]
                        : selectedCast.filter(id => id !== char.id)
                      setSelectedCast(newCast)
                      saveDefinition({ cast: newCast })
                    }}
                  />
                  {' '}{char.name} ({char.role})
                </label>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2>Keep / Cut / Invent</h2>
            
            <h3>KEEP</h3>
            {definition.keepCutInvent.keep.map((item, idx) => (
              <div key={idx} style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const newKeep = [...definition.keepCutInvent.keep]
                    newKeep[idx] = e.target.value
                    saveDefinition({ keepCutInvent: { ...definition.keepCutInvent, keep: newKeep } })
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const newKeep = definition.keepCutInvent.keep.filter((_, i) => i !== idx)
                    saveDefinition({ keepCutInvent: { ...definition.keepCutInvent, keep: newKeep } })
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => {
                saveDefinition({ 
                  keepCutInvent: { 
                    ...definition.keepCutInvent, 
                    keep: [...definition.keepCutInvent.keep, ''] 
                  } 
                })
              }}
            >
              + Add Keep Item
            </button>

            <h3 style={{ marginTop: '1rem' }}>CUT / defer from MVP</h3>
            {definition.keepCutInvent.cut.map((item, idx) => (
              <div key={idx} style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const newCut = [...definition.keepCutInvent.cut]
                    newCut[idx] = e.target.value
                    saveDefinition({ keepCutInvent: { ...definition.keepCutInvent, cut: newCut } })
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const newCut = definition.keepCutInvent.cut.filter((_, i) => i !== idx)
                    saveDefinition({ keepCutInvent: { ...definition.keepCutInvent, cut: newCut } })
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => {
                saveDefinition({ 
                  keepCutInvent: { 
                    ...definition.keepCutInvent, 
                    cut: [...definition.keepCutInvent.cut, ''] 
                  } 
                })
              }}
            >
              + Add Cut Item
            </button>

            <h3 style={{ marginTop: '1rem' }}>INVENT only as MVP glue</h3>
            {definition.keepCutInvent.invent.map((item, idx) => (
              <div key={idx} style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const newInvent = [...definition.keepCutInvent.invent]
                    newInvent[idx] = e.target.value
                    saveDefinition({ keepCutInvent: { ...definition.keepCutInvent, invent: newInvent } })
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const newInvent = definition.keepCutInvent.invent.filter((_, i) => i !== idx)
                    saveDefinition({ keepCutInvent: { ...definition.keepCutInvent, invent: newInvent } })
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => {
                saveDefinition({ 
                  keepCutInvent: { 
                    ...definition.keepCutInvent, 
                    invent: [...definition.keepCutInvent.invent, ''] 
                  } 
                })
              }}
            >
              + Add Invent Item
            </button>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2>MVP Board</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>Item</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>Notes</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {definition.mvpBoard.map((item, idx) => (
                  <tr key={item.id}>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                      <input
                        type="text"
                        value={item.item}
                        onChange={(e) => {
                          const newBoard = [...definition.mvpBoard]
                          newBoard[idx] = { ...item, item: e.target.value }
                          saveDefinition({ mvpBoard: newBoard })
                        }}
                        style={{ width: '100%' }}
                      />
                    </td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                      <select
                        value={item.type}
                        onChange={(e) => {
                          const newBoard = [...definition.mvpBoard]
                          newBoard[idx] = { ...item, type: e.target.value as MVPBoardItemType }
                          saveDefinition({ mvpBoard: newBoard })
                        }}
                      >
                        <option value="asset">asset</option>
                        <option value="system">system</option>
                        <option value="content">content</option>
                        <option value="tuning">tuning</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                      <select
                        value={item.status}
                        onChange={(e) => {
                          const newBoard = [...definition.mvpBoard]
                          newBoard[idx] = { ...item, status: e.target.value as MVPBoardStatus }
                          saveDefinition({ mvpBoard: newBoard })
                        }}
                      >
                        <option value="needed">needed</option>
                        <option value="partial">partial</option>
                        <option value="done">done</option>
                        <option value="cut">cut</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                      <input
                        type="text"
                        value={item.notes || ''}
                        onChange={(e) => {
                          const newBoard = [...definition.mvpBoard]
                          newBoard[idx] = { ...item, notes: e.target.value }
                          saveDefinition({ mvpBoard: newBoard })
                        }}
                        style={{ width: '100%' }}
                      />
                    </td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          const newBoard = definition.mvpBoard.filter((_, i) => i !== idx)
                          saveDefinition({ mvpBoard: newBoard })
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const newItem: MVPBoardItem = {
                  id: `mvp-${Date.now()}`,
                  item: '',
                  type: 'asset',
                  status: 'needed',
                  notes: ''
                }
                saveDefinition({ mvpBoard: [...definition.mvpBoard, newItem] })
              }}
              style={{ marginTop: '0.5rem' }}
            >
              + Add MVP Board Item
            </button>
          </section>
        </div>
      )}

      {activeTab === 'markdown' && (
        <div>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <strong>Resource Tag Syntax:</strong> <code>[[type:id|label]]</code>
              </p>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Examples: <code>[[character:abc-123|Hero]]</code> <code>[[pose:xyz-789|Hero Ready]]</code>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setMarkdownSource(generateMarkdown())}
              >
                Regenerate from Structured
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => saveDefinition({ markdownSource })}
                disabled={saving}
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
                onChange={(e) => setMarkdownSource(e.target.value)}
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
                {poses.filter(p => selectedCast.includes(p.characterId)).map(pose => {
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
                {clips.filter(c => c.characterId && selectedCast.includes(c.characterId)).map(clip => {
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
