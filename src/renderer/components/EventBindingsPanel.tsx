/**
 * P3: Author event → layer → pose/state/visibility bindings and preview-fire.
 * Preview never overwrites authored layer defaults.
 */

import { useState, type CSSProperties } from 'react'
import type {
  AssetPipelineProject,
  AssetState,
  EventBinding,
  EventBindingAction,
  EventDefinition,
  Pose,
  StoryboardLayer
} from '@shared/types/assetPipeline'
import { bindingActionIssues, describeBindingAction } from '@shared/storyboard/eventValidation'
import { describeLayerLabel } from '@shared/storyboard/layerRender'
import { ConfirmModal } from './ConfirmModal'
import type { EventPreviewSnapshot } from '@shared/storyboard/eventPreview'

const selectStyle: CSSProperties = {
  width: '100%',
  marginTop: '0.25rem',
  padding: '0.25rem',
  fontSize: '0.8rem',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text)'
}

export function EventBindingsPanel({
  gameId,
  shotId,
  layers,
  pipeline,
  poses,
  assetStates,
  events,
  bindings,
  previewSnapshot,
  onProjectChanged,
  onFire,
  onResetPreview
}: {
  gameId: string
  shotId: string
  layers: StoryboardLayer[]
  pipeline: AssetPipelineProject
  poses: Pose[]
  assetStates: AssetState[]
  events: EventDefinition[]
  bindings: EventBinding[]
  previewSnapshot: EventPreviewSnapshot
  onProjectChanged: () => Promise<void>
  onFire: (eventId: string, payload?: Record<string, string | number | boolean>) => void
  onResetPreview: () => void
}) {
  const [eventName, setEventName] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventId, setEventId] = useState('')
  const [layerId, setLayerId] = useState('')
  const [actionType, setActionType] = useState<EventBindingAction['type']>('setPose')
  const [poseId, setPoseId] = useState('')
  const [stateId, setStateId] = useState('')
  const [visible, setVisible] = useState(true)
  const [text, setText] = useState('')
  const [durationSec, setDurationSec] = useState('0.5')
  const [returnPolicy, setReturnPolicy] = useState<'default' | 'hold'>('default')
  const [payloadJson, setPayloadJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmEventId, setConfirmEventId] = useState<string | null>(null)
  const [confirmBindingId, setConfirmBindingId] = useState<string | null>(null)

  const selectedLayer = layers.find((l) => l.id === layerId)
  const layerPoses = selectedLayer?.characterId
    ? poses.filter((p) => p.characterId === selectedLayer.characterId)
    : []
  const layerStates = selectedLayer?.visualAssetId
    ? assetStates.filter((s) => s.assetId === selectedLayer.visualAssetId)
    : []

  const buildAction = (): EventBindingAction => {
    if (actionType === 'setPose') {
      if (!poseId) throw new Error('Select a pose')
      return { type: 'setPose', poseId }
    }
    if (actionType === 'setState') {
      if (!stateId) throw new Error('Select a state')
      return { type: 'setState', stateId }
    }
    if (actionType === 'setVisibility') {
      return { type: 'setVisibility', visible }
    }
    return { type: 'setText', text }
  }

  const handleCreateEvent = async () => {
    setError(null)
    try {
      const name = eventName.trim()
      if (!name) throw new Error('Event name is required')
      await window.indieForge.events.create({
        gameId,
        name,
        description: eventDescription.trim() || undefined
      })
      setEventName('')
      setEventDescription('')
      await onProjectChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCreateBinding = async () => {
    setError(null)
    try {
      if (!eventId) throw new Error('Select an event')
      if (!layerId) throw new Error('Select a target layer')
      const duration = Number(durationSec)
      if (!Number.isFinite(duration) || duration < 0) {
        throw new Error('Duration must be >= 0')
      }
      await window.indieForge.bindings.create({
        gameId,
        shotId,
        eventId,
        targetLayerId: layerId,
        action: buildAction(),
        durationSec: duration,
        returnPolicy
      })
      await onProjectChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleFire = (id: string) => {
    setError(null)
    try {
      let payload: Record<string, string | number | boolean> | undefined
      const raw = payloadJson.trim()
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('Payload must be a JSON object')
        }
        payload = parsed
      }
      onFire(id, payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const holdCount = previewSnapshot.holds.length

  return (
    <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: '1rem', margin: '0 0 0.35rem 0' }}>Events</h3>
      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.75rem', lineHeight: 1.35 }}>
        Preview-fire in Forge only. Authored layer defaults are not overwritten.
        Unity/Godot detect real hits.
      </div>

      {error && (
        <div style={{ fontSize: '0.75rem', color: '#ff8a8a', marginBottom: '0.5rem' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem' }}>
        <button type="button" onClick={onResetPreview} style={{ flex: 1, fontSize: '0.75rem' }}>
          Reset preview{holdCount ? ` (${holdCount})` : ''}
        </button>
      </div>

      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.35rem' }}>Game events</div>
      {events.length === 0 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
          No events yet. Example: hit_received → Hurt → Idle.
        </div>
      )}
      {events.map((ev) => (
        <div
          key={ev.id}
          style={{
            padding: '0.45rem',
            marginBottom: '0.35rem',
            background: 'var(--bg-secondary)',
            borderRadius: '4px',
            fontSize: '0.8rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>{ev.name}</span>
            <button
              type="button"
              onClick={() => handleFire(ev.id)}
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem', background: 'var(--forge-gold)', color: '#000' }}
            >
              Fire
            </button>
          </div>
          {ev.description && (
            <div style={{ fontSize: '0.7rem', opacity: 0.75, marginTop: '0.15rem' }}>{ev.description}</div>
          )}
          <button
            type="button"
            onClick={() => setConfirmEventId(ev.id)}
            style={{ marginTop: '0.3rem', fontSize: '0.7rem', width: '100%' }}
          >
            Delete event
          </button>
        </div>
      ))}

      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
        New event name
        <input
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="hit_received"
          style={{ ...selectStyle, boxSizing: 'border-box' }}
        />
      </label>
      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
        Description (optional)
        <input
          value={eventDescription}
          onChange={(e) => setEventDescription(e.target.value)}
          style={{ ...selectStyle, boxSizing: 'border-box' }}
        />
      </label>
      <button type="button" onClick={handleCreateEvent} style={{ width: '100%', fontSize: '0.8rem', marginBottom: '0.85rem' }}>
        Create event
      </button>

      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.35rem' }}>Shot bindings</div>
      {bindings.length === 0 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
          No bindings on this shot.
        </div>
      )}
      {bindings.map((binding) => {
        const issue = bindingActionIssues(binding, pipeline)
        const layer = layers.find((l) => l.id === binding.targetLayerId)
        const label = layer ? describeLayerLabel(layer, pipeline) : binding.targetLayerId
        const ev = events.find((e) => e.id === binding.eventId)
        const previewing = previewSnapshot.overrides[binding.targetLayerId]?.bindingId === binding.id
        return (
          <div
            key={binding.id}
            style={{
              padding: '0.45rem',
              marginBottom: '0.35rem',
              background: previewing ? 'rgba(255, 200, 0, 0.18)' : 'var(--bg-secondary)',
              borderRadius: '4px',
              fontSize: '0.75rem'
            }}
          >
            <div style={{ fontWeight: 'bold' }}>{ev?.name || binding.eventId}</div>
            <div>
              {label} → {describeBindingAction(binding.action)}
            </div>
            <div style={{ opacity: 0.75 }}>
              {binding.durationSec === 0 ? 'instant' : `${binding.durationSec}s`} · {binding.returnPolicy}
              {previewing ? ' · PREVIEW' : ''}
            </div>
            {issue && <div style={{ color: '#ff8a8a', marginTop: '0.2rem' }}>{issue}</div>}
            <button
              type="button"
              onClick={() => setConfirmBindingId(binding.id)}
              style={{ marginTop: '0.3rem', fontSize: '0.7rem', width: '100%' }}
            >
              Delete binding
            </button>
          </div>
        )
      })}

      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', margin: '0.6rem 0 0.35rem' }}>Add binding</div>
      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
        Event
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} style={selectStyle}>
          <option value="">Select event</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
        Layer
        <select
          value={layerId}
          onChange={(e) => {
            setLayerId(e.target.value)
            setPoseId('')
            setStateId('')
          }}
          style={selectStyle}
        >
          <option value="">Select layer</option>
          {layers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {describeLayerLabel(layer, pipeline)}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
        Action
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value as EventBindingAction['type'])}
          style={selectStyle}
        >
          <option value="setPose">setPose</option>
          <option value="setState">setState</option>
          <option value="setVisibility">setVisibility</option>
          <option value="setText">setText</option>
        </select>
      </label>
      {actionType === 'setPose' && (
        <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
          Pose
          <select value={poseId} onChange={(e) => setPoseId(e.target.value)} style={selectStyle}>
            <option value="">Select pose</option>
            {layerPoses.map((p) => (
              <option key={p.id} value={p.id}>{p.slot}</option>
            ))}
          </select>
        </label>
      )}
      {actionType === 'setState' && (
        <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
          State
          <select value={stateId} onChange={(e) => setStateId(e.target.value)} style={selectStyle}>
            <option value="">Select state</option>
            {layerStates.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      )}
      {actionType === 'setVisibility' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Visible
        </label>
      )}
      {actionType === 'setText' && (
        <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
          Text
          <input value={text} onChange={(e) => setText(e.target.value)} style={{ ...selectStyle, boxSizing: 'border-box' }} />
        </label>
      )}
      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
        Duration (sec, 0 = instant)
        <input
          type="number"
          min="0"
          step="0.1"
          value={durationSec}
          onChange={(e) => setDurationSec(e.target.value)}
          style={{ ...selectStyle, boxSizing: 'border-box' }}
        />
      </label>
      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
        Return policy
        <select
          value={returnPolicy}
          onChange={(e) => setReturnPolicy(e.target.value as 'default' | 'hold')}
          style={selectStyle}
        >
          <option value="default">default (return to authored)</option>
          <option value="hold">hold (stay until reset / next event)</option>
        </select>
      </label>
      <button
        type="button"
        onClick={handleCreateBinding}
        style={{ width: '100%', fontSize: '0.8rem', marginBottom: '0.5rem', background: 'var(--forge-gold)', color: '#000' }}
      >
        Add binding
      </button>

      <label style={{ display: 'block', fontSize: '0.7rem', marginTop: '0.5rem', color: 'var(--muted)' }}>
        Optional fire payload JSON
        <input
          value={payloadJson}
          onChange={(e) => setPayloadJson(e.target.value)}
          placeholder='{"source":"player"}'
          style={{ ...selectStyle, boxSizing: 'border-box' }}
        />
      </label>

      {confirmEventId && (
        <ConfirmModal
          title="Delete event"
          message="Delete this event? Bindings that still reference it must be removed first."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            setError(null)
            try {
              await window.indieForge.events.remove(confirmEventId)
              setConfirmEventId(null)
              await onProjectChanged()
            } catch (err) {
              setConfirmEventId(null)
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
          onCancel={() => setConfirmEventId(null)}
        />
      )}
      {confirmBindingId && (
        <ConfirmModal
          title="Delete binding"
          message="Remove this event binding from the shot? Authored layer defaults are not changed."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            setError(null)
            try {
              await window.indieForge.bindings.remove(confirmBindingId)
              setConfirmBindingId(null)
              await onProjectChanged()
            } catch (err) {
              setConfirmBindingId(null)
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
          onCancel={() => setConfirmBindingId(null)}
        />
      )}
    </div>
  )
}
