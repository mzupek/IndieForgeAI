import { useState, useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { ScenePreset, ScenePresetType, Character } from '@shared/types/assetPipeline'
import { useProjectStore } from '../state/indieForgeStore'
import { 
  getDefaultParams, 
  getPresetTypeDisplayName,
  type VersusParams,
  type ZoomPunchParams,
  type ShakeParams,
  type FlashParams,
  type FreezeParams
} from '@shared/validation/presetDefaults'

export function PresetsView() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  const [selectedPreset, setSelectedPreset] = useState<ScenePreset | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [filterType, setFilterType] = useState<ScenePresetType | ''>('')
  
  const presets = activeProject?.assetPipeline?.scenePresets || []
  const characters = activeProject?.assetPipeline?.characters.filter(c => c.gameId === gameId) || []
  const scenes = activeProject?.assetPipeline?.scenes?.filter(s => s.gameId === gameId) || []
  
  const filteredPresets = filterType 
    ? presets.filter(p => p.type === filterType)
    : presets
  
  const handleCreatePreset = async (type: ScenePresetType, params: Record<string, unknown>, tags: string[]) => {
    try {
      await window.indieForge.pipeline.createPreset(type, { params, tags })
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setIsCreating(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create preset')
    }
  }
  
  const handleUpdatePreset = async (presetId: string, updates: { params?: Record<string, unknown>; tags?: string[] }) => {
    try {
      await window.indieForge.pipeline.updatePreset(presetId, updates)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update preset')
    }
  }
  
  const handleRemovePreset = async (presetId: string) => {
    if (!confirm('Remove this preset?')) return
    
    try {
      await window.indieForge.pipeline.removePreset(presetId)
      const updated = await window.indieForge.projects.open(projectId!)
      setActiveProject(updated)
      setSelectedPreset(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove preset')
    }
  }
  
  return (
    <div style={{ padding: '2rem', height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>FX Presets</h2>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Reusable effect recipes (shake, flash, freeze, zoom punch, versus layout) — attach to scenes for juice
        </p>
      </div>

      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as ScenePresetType | '')}
          style={{ padding: '0.5rem', flex: '0 0 200px' }}
        >
          <option value="">All Types</option>
          <option value="versus">Versus Layout</option>
          <option value="zoom_punch">Zoom Punch</option>
          <option value="shake">Screen Shake</option>
          <option value="flash">Flash Effect</option>
          <option value="freeze">Freeze Frame</option>
        </select>
        
        <button 
          type="button"
          onClick={() => setIsCreating(true)}
          style={{ padding: '0.5rem 1rem' }}
        >
          + New Preset
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        {/* Presets List */}
        <div>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>
            Presets ({filteredPresets.length})
          </h3>
          
          {filteredPresets.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
              No presets yet. Create one to get started.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredPresets.map(preset => {
            const usedInScenes = scenes
              .filter(s => s.attachedPresets.includes(preset.id))
              .map(s => s.name)
            return (
              <PresetListItem
                key={preset.id}
                preset={preset}
                isSelected={selectedPreset?.id === preset.id}
                onClick={() => setSelectedPreset(preset)}
                onRemove={() => handleRemovePreset(preset.id)}
                usedInScenes={usedInScenes}
              />
            )
          })}
            </div>
          )}
        </div>

        {/* Preview & Edit Pane */}
        <div>
          {isCreating ? (
            <PresetEditor
              mode="create"
              onSave={handleCreatePreset}
              onCancel={() => setIsCreating(false)}
              characters={characters}
            />
          ) : selectedPreset ? (
            <PresetEditor
              mode="edit"
              preset={selectedPreset}
              onSave={(params, tags) => handleUpdatePreset(selectedPreset.id, { params, tags })}
              onCancel={() => setSelectedPreset(null)}
              characters={characters}
            />
          ) : (
            <div style={{ 
              padding: '2rem', 
              textAlign: 'center', 
              color: 'var(--muted)',
              border: '2px dashed var(--border)',
              borderRadius: '8px'
            }}>
              Select a preset or create a new one to see live preview
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getParamsSummary(preset: ScenePreset): string {
  const params = preset.params
  switch (preset.type) {
    case 'shake':
      return `intensity ${params.intensity || 10} · ${params.durationMs || 300}ms`
    case 'flash':
      return `${params.color || 'white'} · ${params.durationMs || 200}ms`
    case 'freeze':
      return `${params.durationMs || 500}ms`
    case 'zoom_punch':
      return `zoom ${params.scale || 1.15}x · ${params.durationMs || 300}ms`
    case 'versus':
      return `${params.characterAId ? 'vs setup' : 'no chars'} · zoom ${params.zoom || 1.0}x`
    default:
      return ''
  }
}

function getDisplayName(preset: ScenePreset): string {
  if (preset.tags.length > 0) {
    return `${getPresetTypeDisplayName(preset.type)} - ${preset.tags[0]}`
  }
  return getPresetTypeDisplayName(preset.type)
}

function PresetListItem({
  preset,
  isSelected,
  onClick,
  onRemove,
  usedInScenes
}: {
  preset: ScenePreset
  isSelected: boolean
  onClick: () => void
  onRemove: () => void
  usedInScenes?: string[]
}) {
  return (
    <div
      style={{
        padding: '1rem',
        border: isSelected ? '2px solid var(--forge-gold)' : '1px solid var(--border)',
        borderRadius: '4px',
        background: isSelected ? 'rgba(255, 200, 0, 0.05)' : 'var(--bg-secondary)',
        cursor: 'pointer'
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
            {getDisplayName(preset)}
          </div>
          <span style={{ 
            display: 'inline-block',
            padding: '2px 8px',
            background: 'var(--forge-gold)',
            color: '#000',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            marginRight: '0.5rem'
          }}>
            {preset.type}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            {getParamsSummary(preset)}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          style={{
            padding: '2px 8px',
            fontSize: '0.75rem',
            background: 'var(--danger)',
            color: 'white'
          }}
        >
          Remove
        </button>
      </div>
      
      {preset.tags.length > 1 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          Tags: {preset.tags.slice(1).join(', ')}
        </div>
      )}
    </div>
  )
}

function PresetEditor({
  mode,
  preset,
  onSave,
  onCancel,
  characters
}: {
  mode: 'create' | 'edit'
  preset?: ScenePreset
  onSave: (type: ScenePresetType, params: Record<string, unknown>, tags: string[]) => void | ((params: Record<string, unknown>, tags: string[]) => void)
  onCancel: () => void
  characters: Character[]
}) {
  const [type, setType] = useState<ScenePresetType>(preset?.type || 'versus')
  const [params, setParams] = useState<Record<string, unknown>>(preset?.params || getDefaultParams('versus'))
  const [tagsInput, setTagsInput] = useState(preset?.tags.join(', ') || '')
  
  useEffect(() => {
    if (mode === 'create') {
      setParams(getDefaultParams(type))
    }
  }, [type, mode])
  
  const handleSave = () => {
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
    if (mode === 'create') {
      (onSave as (type: ScenePresetType, params: Record<string, unknown>, tags: string[]) => void)(type, params, tags)
    } else {
      (onSave as (params: Record<string, unknown>, tags: string[]) => void)(params, tags)
    }
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{mode === 'create' ? 'Create Preset' : 'Edit Preset'}</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={handleSave} style={{ fontWeight: 600 }}>
            {mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
      
      {mode === 'create' && (
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ScenePresetType)}
            style={{ width: '100%', padding: '0.5rem' }}
          >
            <option value="versus">Versus Layout</option>
            <option value="zoom_punch">Zoom Punch</option>
            <option value="shake">Screen Shake</option>
            <option value="flash">Flash Effect</option>
            <option value="freeze">Freeze Frame</option>
          </select>
        </div>
      )}
      
      <PresetParamsEditor
        type={type}
        params={params}
        onChange={setParams}
        characters={characters}
      />
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Tags (comma-separated)</label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="cutscene, dramatic, fast"
          style={{ width: '100%', padding: '0.5rem' }}
        />
      </div>
      
      {/* Live Preview */}
      <div>
        <h4 style={{ margin: '0 0 0.5rem 0' }}>Live Preview</h4>
        <PresetLivePreview
          type={type}
          params={params}
          characters={characters}
        />
      </div>
    </div>
  )
}

function PresetParamsEditor({
  type,
  params,
  onChange,
  characters
}: {
  type: ScenePresetType
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
  characters: Character[]
}) {
  const updateParam = (key: string, value: unknown) => {
    onChange({ ...params, [key]: value })
  }
  
  switch (type) {
    case 'versus':
      return <VersusParamsEditor params={params as VersusParams} updateParam={updateParam} characters={characters} />
    case 'zoom_punch':
      return <ZoomPunchParamsEditor params={params as ZoomPunchParams} updateParam={updateParam} />
    case 'shake':
      return <ShakeParamsEditor params={params as ShakeParams} updateParam={updateParam} />
    case 'flash':
      return <FlashParamsEditor params={params as FlashParams} updateParam={updateParam} />
    case 'freeze':
      return <FreezeParamsEditor params={params as FreezeParams} updateParam={updateParam} />
  }
}

function VersusParamsEditor({ params, updateParam, characters }: { 
  params: VersusParams
  updateParam: (key: string, value: unknown) => void
  characters: Character[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Left Character</label>
        <select
          value={params.leftCharacterId || ''}
          onChange={(e) => updateParam('leftCharacterId', e.target.value || undefined)}
          style={{ width: '100%', padding: '0.5rem' }}
        >
          <option value="">None</option>
          {characters.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Right Character</label>
        <select
          value={params.rightCharacterId || ''}
          onChange={(e) => updateParam('rightCharacterId', e.target.value || undefined)}
          style={{ width: '100%', padding: '0.5rem' }}
        >
          <option value="">None</option>
          {characters.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Camera Angle</label>
        <select
          value={params.cameraAngle}
          onChange={(e) => updateParam('cameraAngle', e.target.value)}
          style={{ width: '100%', padding: '0.5rem' }}
        >
          <option value="front">Front</option>
          <option value="side">Side</option>
          <option value="low">Low</option>
          <option value="high">High</option>
        </select>
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Zoom: {params.zoom}x</label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={params.zoom}
          onChange={(e) => updateParam('zoom', parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Framing Padding: {params.framingPadding}px</label>
        <input
          type="range"
          min="0"
          max="100"
          step="10"
          value={params.framingPadding}
          onChange={(e) => updateParam('framingPadding', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  )
}

function ZoomPunchParamsEditor({ params, updateParam }: { 
  params: ZoomPunchParams
  updateParam: (key: string, value: unknown) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Target</label>
        <select
          value={params.target}
          onChange={(e) => updateParam('target', e.target.value)}
          style={{ width: '100%', padding: '0.5rem' }}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Zoom Amount: {params.zoomAmount}x</label>
        <input
          type="range"
          min="1"
          max="3"
          step="0.1"
          value={params.zoomAmount}
          onChange={(e) => updateParam('zoomAmount', parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Duration: {params.durationMs}ms</label>
        <input
          type="range"
          min="100"
          max="1000"
          step="50"
          value={params.durationMs}
          onChange={(e) => updateParam('durationMs', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Easing</label>
        <select
          value={params.ease}
          onChange={(e) => updateParam('ease', e.target.value)}
          style={{ width: '100%', padding: '0.5rem' }}
        >
          <option value="linear">Linear</option>
          <option value="easeIn">Ease In</option>
          <option value="easeOut">Ease Out</option>
          <option value="easeInOut">Ease In/Out</option>
        </select>
      </div>
    </div>
  )
}

function ShakeParamsEditor({ params, updateParam }: { 
  params: ShakeParams
  updateParam: (key: string, value: unknown) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Intensity: {params.intensity}px</label>
        <input
          type="range"
          min="1"
          max="50"
          step="1"
          value={params.intensity}
          onChange={(e) => updateParam('intensity', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Duration: {params.durationMs}ms</label>
        <input
          type="range"
          min="100"
          max="2000"
          step="100"
          value={params.durationMs}
          onChange={(e) => updateParam('durationMs', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Frequency: {params.frequency}hz</label>
        <input
          type="range"
          min="5"
          max="60"
          step="5"
          value={params.frequency}
          onChange={(e) => updateParam('frequency', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  )
}

function FlashParamsEditor({ params, updateParam }: { 
  params: FlashParams
  updateParam: (key: string, value: unknown) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Color</label>
        <input
          type="color"
          value={params.color}
          onChange={(e) => updateParam('color', e.target.value)}
          style={{ width: '100%', height: '40px', cursor: 'pointer' }}
        />
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Duration: {params.durationMs}ms</label>
        <input
          type="range"
          min="50"
          max="1000"
          step="50"
          value={params.durationMs}
          onChange={(e) => updateParam('durationMs', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Opacity: {Math.round(params.opacity * 100)}%</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={params.opacity}
          onChange={(e) => updateParam('opacity', parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  )
}

function FreezeParamsEditor({ params, updateParam }: { 
  params: FreezeParams
  updateParam: (key: string, value: unknown) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Duration: {params.durationMs}ms</label>
        <input
          type="range"
          min="100"
          max="5000"
          step="100"
          value={params.durationMs}
          onChange={(e) => updateParam('durationMs', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Hold Pose Slot (optional)</label>
        <select
          value={params.holdPoseSlot || ''}
          onChange={(e) => updateParam('holdPoseSlot', e.target.value || undefined)}
          style={{ width: '100%', padding: '0.5rem' }}
        >
          <option value="">None</option>
          <option value="ready">Ready</option>
          <option value="success">Success</option>
          <option value="hurt">Hurt</option>
          <option value="win">Win</option>
          <option value="defeat">Defeat</option>
        </select>
      </div>
    </div>
  )
}

function PresetLivePreview({
  type,
  params,
  characters
}: {
  type: ScenePresetType
  params: Record<string, unknown>
  characters: Character[]
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>()
  
  useEffect(() => {
    if (!canvasRef.current) return
    
    // Trigger animation based on type
    if (type === 'zoom_punch') {
      animateZoomPunch(canvasRef.current, params as ZoomPunchParams)
    } else if (type === 'shake') {
      animateShake(canvasRef.current, params as ShakeParams)
    } else if (type === 'flash') {
      animateFlash(canvasRef.current, params as FlashParams)
    } else if (type === 'freeze') {
      animateFreeze(canvasRef.current, params as FreezeParams)
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [type, params])
  
  const getCharacterPreviewImage = (characterId?: string) => {
    if (!characterId) return null
    const char = characters.find(c => c.id === characterId)
    if (!char) return null
    // Try to get ready pose thumbnail
    return char.thumbnail || null
  }
  
  if (type === 'versus') {
    const versusParams = params as VersusParams
    const leftImage = getCharacterPreviewImage(versusParams.leftCharacterId)
    const rightImage = getCharacterPreviewImage(versusParams.rightCharacterId)
    
    return (
      <div style={{
        width: '100%',
        height: '300px',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '8px',
        position: 'relative',
        overflow: 'hidden',
        transform: `scale(${versusParams.zoom})`,
        transition: 'transform 0.3s ease',
        padding: `${versusParams.framingPadding}px`
      }}>
        {/* VS indicator */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '3rem',
          fontWeight: 900,
          color: 'var(--forge-gold)',
          textShadow: '0 0 20px rgba(255, 200, 0, 0.5)',
          zIndex: 10
        }}>
          VS
        </div>
        
        {/* Left character */}
        <div style={{
          position: 'absolute',
          left: '10%',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '120px',
          height: '180px',
          background: leftImage ? 'transparent' : 'rgba(255, 200, 0, 0.2)',
          border: '2px solid var(--forge-gold)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          color: 'var(--forge-gold)',
          backgroundImage: leftImage ? `url(${leftImage})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}>
          {!leftImage && 'LEFT'}
        </div>
        
        {/* Right character */}
        <div style={{
          position: 'absolute',
          right: '10%',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '120px',
          height: '180px',
          background: rightImage ? 'transparent' : 'rgba(255, 200, 0, 0.2)',
          border: '2px solid var(--forge-gold)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          color: 'var(--forge-gold)',
          backgroundImage: rightImage ? `url(${rightImage})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}>
          {!rightImage && 'RIGHT'}
        </div>
        
        <div style={{
          position: 'absolute',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.75rem',
          color: 'var(--muted)'
        }}>
          {versusParams.cameraAngle} angle
        </div>
      </div>
    )
  }
  
  return (
    <div
      ref={canvasRef}
      style={{
        width: '100%',
        height: '300px',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '8px',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* Generic character placeholder */}
      <div style={{
        width: '120px',
        height: '180px',
        background: 'rgba(255, 200, 0, 0.2)',
        border: '2px solid var(--forge-gold)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        color: 'var(--forge-gold)'
      }}>
        CHARACTER
      </div>
    </div>
  )
}

function animateZoomPunch(element: HTMLElement, params: ZoomPunchParams) {
  const startTime = Date.now()
  const duration = params.durationMs
  
  const animate = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    
    let easedProgress = progress
    if (params.ease === 'easeIn') {
      easedProgress = progress * progress
    } else if (params.ease === 'easeOut') {
      easedProgress = 1 - Math.pow(1 - progress, 2)
    } else if (params.ease === 'easeInOut') {
      easedProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2
    }
    
    const scale = 1 + (params.zoomAmount - 1) * easedProgress
    element.style.transform = `scale(${scale})`
    
    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      // Bounce back
      setTimeout(() => {
        element.style.transition = 'transform 0.2s ease-out'
        element.style.transform = 'scale(1)'
      }, 100)
    }
  }
  
  element.style.transition = 'none'
  requestAnimationFrame(animate)
}

function animateShake(element: HTMLElement, params: ShakeParams) {
  const startTime = Date.now()
  const duration = params.durationMs
  const frequency = params.frequency
  
  const animate = () => {
    const elapsed = Date.now() - startTime
    const progress = elapsed / duration
    
    if (progress < 1) {
      const angle = elapsed * frequency / 10
      const intensity = params.intensity * (1 - progress)
      const x = Math.cos(angle) * intensity
      const y = Math.sin(angle * 1.3) * intensity
      
      element.style.transform = `translate(${x}px, ${y}px)`
      requestAnimationFrame(animate)
    } else {
      element.style.transform = 'translate(0, 0)'
    }
  }
  
  requestAnimationFrame(animate)
}

function animateFlash(element: HTMLElement, params: FlashParams) {
  const overlay = document.createElement('div')
  overlay.style.position = 'absolute'
  overlay.style.top = '0'
  overlay.style.left = '0'
  overlay.style.width = '100%'
  overlay.style.height = '100%'
  overlay.style.background = params.color
  overlay.style.opacity = params.opacity.toString()
  overlay.style.pointerEvents = 'none'
  
  element.appendChild(overlay)
  
  setTimeout(() => {
    overlay.style.transition = `opacity ${params.durationMs}ms ease-out`
    overlay.style.opacity = '0'
    
    setTimeout(() => {
      overlay.remove()
    }, params.durationMs)
  }, 50)
}

function animateFreeze(element: HTMLElement, params: FreezeParams) {
  const overlay = document.createElement('div')
  overlay.style.position = 'absolute'
  overlay.style.top = '0'
  overlay.style.left = '0'
  overlay.style.width = '100%'
  overlay.style.height = '100%'
  overlay.style.background = 'rgba(255, 255, 255, 0.3)'
  overlay.style.pointerEvents = 'none'
  overlay.style.display = 'flex'
  overlay.style.alignItems = 'center'
  overlay.style.justifyContent = 'center'
  overlay.style.fontSize = '2rem'
  overlay.style.fontWeight = 'bold'
  overlay.style.color = '#fff'
  overlay.style.textShadow = '0 0 10px rgba(0, 0, 0, 0.8)'
  overlay.textContent = 'FREEZE'
  
  element.appendChild(overlay)
  
  setTimeout(() => {
    overlay.style.transition = 'opacity 0.2s ease-out'
    overlay.style.opacity = '0'
    
    setTimeout(() => {
      overlay.remove()
    }, 200)
  }, params.durationMs)
}
