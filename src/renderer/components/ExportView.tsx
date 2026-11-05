import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { ExportValidation, ExportDryRun } from '@shared/types/exportManifest'
import type { Game } from '@shared/types/assetPipeline'
import { useProjectStore } from '../state/indieForgeStore'

export function ExportView() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject } = useProjectStore()
  const [selectedGameId, setSelectedGameId] = useState(gameId)
  const [validation, setValidation] = useState<ExportValidation | null>(null)
  const [dryRun, setDryRun] = useState<ExportDryRun | null>(null)
  const [validating, setValidating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<{ targetDir: string; copiedFiles: number } | null>(null)
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetPath, setTargetPath] = useState('')
  
  const games = activeProject?.assetPipeline?.games || []
  const selectedGame = games.find(g => g.id === selectedGameId)
  
  useEffect(() => {
    if (selectedGame) {
      setTargetPath(selectedGame.exportTarget || selectedGame.exportRoot)
    }
  }, [selectedGame])
  
  const handleValidate = async () => {
    if (!selectedGameId) return
    
    setValidating(true)
    setExportResult(null)
    
    try {
      const validationResult = await window.indieForge.export.validate(selectedGameId)
      setValidation(validationResult)
      
      if (validationResult.canExport) {
        const dryRunResult = await window.indieForge.export.dryRun(selectedGameId)
        setDryRun(dryRunResult)
      } else {
        setDryRun(null)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Validation failed')
    } finally {
      setValidating(false)
    }
  }
  
  const handleExport = async () => {
    if (!selectedGameId || !validation?.canExport) return
    
    if (!confirm('Export game assets to target directory?')) return
    
    setExporting(true)
    try {
      const result = await window.indieForge.export.run(selectedGameId)
      setExportResult(result)
      
      // Re-validate after export
      await handleValidate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }
  
  const handleUpdateTarget = async () => {
    if (!selectedGameId || !projectId) return
    
    // Validate path is absolute
    const expandedPath = targetPath.startsWith('~') 
      ? targetPath 
      : targetPath
    
    if (!expandedPath.startsWith('/') && !expandedPath.startsWith('~')) {
      alert('Export target must be an absolute path (starting with / or ~)')
      return
    }
    
    try {
      await window.indieForge.projects.updateGame(projectId, selectedGameId, {
        exportTarget: targetPath
      })
      setEditingTarget(false)
      alert('Target path updated')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update target')
    }
  }
  
  useEffect(() => {
    if (selectedGameId) {
      handleValidate()
    }
  }, [selectedGameId])
  
  return (
    <div style={{ padding: '2rem', height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Export Game Assets</h2>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Export approved poses, clips, and presets to your game project
        </p>
      </div>

      {/* Game Selector */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Game</label>
        <select
          value={selectedGameId}
          onChange={(e) => setSelectedGameId(e.target.value)}
          style={{ padding: '0.5rem', width: '300px' }}
        >
          {games.map(game => (
            <option key={game.id} value={game.id}>
              {game.name} ({game.engine})
            </option>
          ))}
        </select>
      </div>

      {/* Export Target */}
      {selectedGame && (
        <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ fontWeight: 600 }}>Export Target</label>
            {!editingTarget && (
              <button type="button" onClick={() => setEditingTarget(true)} style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}>
                Edit
              </button>
            )}
          </div>
          
          {editingTarget ? (
            <div>
              <input
                type="text"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                placeholder="/path/to/project"
                style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={handleUpdateTarget} style={{ padding: '0.5rem 1rem' }}>
                  Save
                </button>
                <button type="button" onClick={() => {
                  setEditingTarget(false)
                  setTargetPath(selectedGame.exportTarget || selectedGame.exportRoot)
                }} style={{ padding: '0.5rem 1rem' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <code style={{ display: 'block', padding: '0.5rem', background: 'var(--bg)', borderRadius: '4px' }}>
                {targetPath}
              </code>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: 'var(--muted)' }}>
                {selectedGame.engine === 'unity' && '→ Assets/IndieForge/' + selectedGame.id + '/'}
                {selectedGame.engine === 'godot' && '→ assets/indie_forge/' + selectedGame.id + '/'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Validation & Export Section */}
      {selectedGame && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={handleValidate}
              disabled={validating}
              style={{ padding: '0.5rem 1rem', marginRight: '0.5rem' }}
            >
              {validating ? 'Validating...' : '🔍 Validate'}
            </button>
            
            {validation?.canExport && (
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                style={{ 
                  padding: '0.5rem 1rem',
                  background: 'var(--forge-gold)',
                  color: '#000',
                  fontWeight: 600
                }}
              >
                {exporting ? 'Exporting...' : '📦 Export'}
              </button>
            )}
          </div>

          {/* Export Success */}
          {exportResult && (
            <div style={{ 
              padding: '1rem', 
              marginBottom: '1rem',
              background: 'rgba(0, 255, 0, 0.1)',
              border: '1px solid rgba(0, 255, 0, 0.3)',
              borderRadius: '4px'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#0f0' }}>✓ Export Complete</h4>
              <p style={{ margin: '0.25rem 0' }}>Target: <code>{exportResult.targetDir}</code></p>
              <p style={{ margin: '0.25rem 0' }}>Copied {exportResult.copiedFiles} file(s)</p>
            </div>
          )}

          {/* Validation Results */}
          {validation && (
            <div>
              {/* Errors */}
              {validation.errors.length > 0 && (
                <div style={{
                  padding: '1rem',
                  marginBottom: '1rem',
                  background: 'rgba(255, 0, 0, 0.1)',
                  border: '1px solid rgba(255, 0, 0, 0.3)',
                  borderRadius: '4px'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#f00' }}>❌ Errors</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                    {validation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <div style={{
                  padding: '1rem',
                  marginBottom: '1rem',
                  background: 'rgba(255, 200, 0, 0.1)',
                  border: '1px solid rgba(255, 200, 0, 0.3)',
                  borderRadius: '4px'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--forge-gold)' }}>⚠️ Warnings</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                    {validation.warnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Incomplete Characters */}
              {validation.incompleteCharacters.length > 0 && (
                <div style={{
                  padding: '1rem',
                  marginBottom: '1rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>📋 Incomplete Characters</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                    {validation.incompleteCharacters.map((char, i) => (
                      <li key={i}>
                        {char.name}: missing {char.missingSlots.join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Dry Run Results */}
              {dryRun && (
                <div style={{
                  padding: '1rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>🔍 Dry Run Preview</h4>
                  <p style={{ margin: '0.25rem 0' }}>
                    <strong>Files to copy:</strong> {dryRun.totalFiles}
                  </p>
                  <p style={{ margin: '0.25rem 0' }}>
                    <strong>Total size:</strong> {(dryRun.totalSize / 1024 / 1024).toFixed(2)} MB
                  </p>
                  
                  {dryRun.filesToCopy.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>Files to update:</h5>
                      <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                        {dryRun.filesToCopy.map((file, i) => (
                          <div 
                            key={i}
                            style={{ 
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.875rem',
                              fontFamily: 'monospace',
                              background: file.reason === 'new' ? 'rgba(0, 255, 0, 0.05)' : 'rgba(255, 200, 0, 0.05)',
                              borderLeft: `3px solid ${file.reason === 'new' ? '#0f0' : 'var(--forge-gold)'}`
                            }}
                          >
                            {file.reason === 'new' ? '➕ NEW' : '📝 MODIFIED'}: {file.destination.split('/').pop()}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {dryRun.filesToCopy.length === 0 && (
                    <p style={{ margin: '1rem 0 0 0', color: 'var(--muted)', fontStyle: 'italic' }}>
                      ✓ All files are up to date
                    </p>
                  )}
                </div>
              )}

              {/* Success State */}
              {validation.canExport && validation.errors.length === 0 && !exportResult && (
                <div style={{
                  padding: '1rem',
                  marginTop: '1rem',
                  background: 'rgba(0, 255, 0, 0.05)',
                  border: '1px solid rgba(0, 255, 0, 0.3)',
                  borderRadius: '4px'
                }}>
                  <p style={{ margin: 0, color: '#0f0' }}>
                    ✓ Ready to export
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
