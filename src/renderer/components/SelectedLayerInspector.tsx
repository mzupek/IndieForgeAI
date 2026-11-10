/**
 * Pinned selected-layer inspector. Does not live inside each layer row.
 */

import type {
  AssetPipelineProject,
  AssetState,
  Font,
  LayerTimedKey,
  Palette,
  Pose,
  StoryboardLayer,
  StoryboardShot
} from '@shared/types/assetPipeline'
import { describeLayerLabel } from '@shared/storyboard/layerRender'
import {
  DEFAULT_FONT_REF,
  DEFAULT_PALETTE_REF,
  getLayerKind,
  resolveLayerImagePath,
  resolveTextStyle
} from '@shared/storyboard/layerValidation'
import { sampleLayerClip } from '@shared/storyboard/clipBlocks'
import { sampleLayerTimedKeys, timedKeyIssues } from '@shared/storyboard/timedKeys'
import type { EventPreviewSnapshot } from '@shared/storyboard/eventPreview'
import { CollapsibleSection } from './CollapsibleSection'

export function SelectedLayerInspector({
  layer,
  shot,
  pipeline,
  gameId,
  poses,
  assetStates,
  fonts,
  palettes,
  playbackTime,
  previewSnapshot,
  selectedTimedKeyId,
  timedKeyTimeDraft,
  clipStatus,
  onFitSourceAspect,
  onChangePose,
  onChangeAssetState,
  onSelectTimedKey,
  onTimedKeyTimeDraft,
  onUpdateTimedKey,
  onDeleteTimedKey,
  onAddTimedKey,
  onChangeScale,
  onChangeRotation,
  onChangeVisible,
  onChangeText,
  onChangeFont,
  onChangePalette,
  onFlip,
  onDeleteLayer,
  onChangeFx
}: {
  layer: StoryboardLayer | null | undefined
  shot: StoryboardShot
  pipeline: AssetPipelineProject | undefined
  gameId: string
  poses: Pose[]
  assetStates: AssetState[]
  fonts: Font[]
  palettes: Palette[]
  playbackTime: number
  previewSnapshot: EventPreviewSnapshot
  selectedTimedKeyId: string | null
  timedKeyTimeDraft: string
  clipStatus?: string
  onFitSourceAspect: (layerId: string) => void
  onChangePose: (poseId: string) => void
  onChangeAssetState: (stateId: string | null) => void
  onSelectTimedKey: (keyId: string) => void
  onTimedKeyTimeDraft: (value: string) => void
  onUpdateTimedKey: (keyId: string, updates: { t?: number; action?: LayerTimedKey['action'] }) => void
  onDeleteTimedKey: (keyId: string) => void
  onAddTimedKey: () => void
  onChangeScale: (value: number) => void
  onChangeRotation: (value: number) => void
  onChangeVisible: (visible: boolean) => void
  onChangeText: (text: string) => void
  onChangeFont: (fontRef: string) => void
  onChangePalette: (paletteRef: string) => void
  onFlip: () => void
  onDeleteLayer: () => void
  onChangeFx: (fx: StoryboardLayer['fx']) => void
}) {
  if (!layer) {
    return (
      <div style={{ padding: '0.65rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
        No layer selected. Click a row or a layer on the canvas.
      </div>
    )
  }

  const kind = getLayerKind(layer)
  const label = pipeline ? describeLayerLabel(layer, pipeline) : kind
  const character = layer.characterId
    ? (pipeline?.characters || []).find((c) => c.id === layer.characterId)
    : null
  const mediaErr = pipeline && kind !== 'text' ? resolveLayerImagePath(layer, pipeline).error : undefined
  const textErr = pipeline && kind === 'text' ? resolveTextStyle(layer, pipeline, gameId) : null
  const refError = mediaErr || textErr?.fontError || textErr?.paletteError
  const timedSample = sampleLayerTimedKeys(layer, playbackTime)
  const clipSample = pipeline ? sampleLayerClip(shot, pipeline.clips || [], layer.id, playbackTime) : null
  const preview = previewSnapshot.overrides[layer.id]

  return (
    <div style={{ padding: '0.55rem 0.65rem', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '0.15rem' }}>{label}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.4rem' }}>
        z{layer.zOrder} · {layer.scale.toFixed(2)}x · {layer.rotation.toFixed(0)}°
        {layer.visible === false ? ' · hidden' : ''}
      </div>
      {refError && (
        <div style={{ fontSize: '0.7rem', color: '#ff8a8a', marginBottom: '0.35rem' }}>{refError}</div>
      )}
      {clipSample === null && layer.clipId && (
        <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>CLIP hidden (outside block)</div>
      )}
      {clipSample && (
        <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>
          CLIP src {clipSample.sourceTimeSec.toFixed(2)}s
          {clipSample.implicit ? ' (implicit)' : ''}
          {clipStatus ? ` · ${clipStatus}` : ''}
        </div>
      )}
      {timedSample && (
        <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>
          TIMED @ {timedSample.t.toFixed(2)}s
          {timedSample.poseId
            ? `: ${poses.find((p) => p.id === timedSample.poseId)?.slot || timedSample.poseId}`
            : timedSample.assetStateId
              ? `: ${assetStates.find((s) => s.id === timedSample.assetStateId)?.name || timedSample.assetStateId}`
              : ''}
        </div>
      )}
      {preview && (
        <div style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>
          PREVIEW
          {preview.poseId
            ? `: ${poses.find((p) => p.id === preview.poseId)?.slot || preview.poseId}`
            : preview.assetStateId
              ? `: ${assetStates.find((s) => s.id === preview.assetStateId)?.name || preview.assetStateId}`
              : preview.visible === false
                ? ': hidden'
                : preview.text !== undefined
                  ? `: “${preview.text}”`
                  : ''}
        </div>
      )}

      {layer.visualAssetId && (
        <button
          type="button"
          onClick={() => onFitSourceAspect(layer.id)}
          style={{ width: '100%', margin: '0.4rem 0', fontSize: '0.75rem', padding: '0.3rem' }}
        >
          Reset to source aspect
        </button>
      )}

      {character && (
        <label style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.75rem' }}>
          Starting pose
          <select
            value={layer.poseId || ''}
            onChange={(e) => onChangePose(e.target.value)}
            style={{ width: '100%', marginTop: '0.2rem', fontSize: '0.8rem' }}
          >
            {poses
              .filter((p) => p.characterId === character.id && p.status === 'approved')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.slot}
                </option>
              ))}
          </select>
        </label>
      )}

      {layer.visualAssetId && (
        <label style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.75rem' }}>
          Starting state
          <select
            value={layer.assetStateId || ''}
            onChange={(e) => onChangeAssetState(e.target.value || null)}
            style={{ width: '100%', marginTop: '0.2rem', fontSize: '0.8rem' }}
          >
            <option value="">Default / static image</option>
            {assetStates
              .filter((s) => s.assetId === layer.visualAssetId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      )}

      {(layer.characterId || layer.visualAssetId) && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>
            Timed pose/state keys
          </div>
          {(layer.timedKeys || []).length === 0 && (
            <div style={{ fontSize: '0.7rem', opacity: 0.75, marginBottom: '0.3rem' }}>
              None. Add at playhead — same layer, not a duplicate.
            </div>
          )}
          {(layer.timedKeys || [])
            .slice()
            .sort((a, b) => a.t - b.t)
            .map((key) => {
              const selected = selectedTimedKeyId === key.id
              const issue = pipeline ? timedKeyIssues(key, layer, pipeline, shot.id) : null
              return (
                <div
                  key={key.id}
                  onClick={() => onSelectTimedKey(key.id)}
                  style={{
                    marginBottom: '0.3rem',
                    padding: '0.3rem',
                    borderRadius: '4px',
                    background: selected ? 'var(--bg-secondary)' : 'transparent',
                    border: selected ? '1px solid var(--forge-gold)' : '1px solid transparent'
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <input
                      type="number"
                      min={0}
                      max={shot.durationSec}
                      step={0.01}
                      value={selected ? timedKeyTimeDraft : key.t.toFixed(2)}
                      onFocus={() => {
                        onSelectTimedKey(key.id)
                        onTimedKeyTimeDraft(key.t.toFixed(2))
                      }}
                      onChange={(e) => onTimedKeyTimeDraft(e.target.value)}
                      onBlur={() => {
                        const next = Number(timedKeyTimeDraft)
                        if (Number.isFinite(next) && Math.abs(next - key.t) >= 0.0005) {
                          onUpdateTimedKey(key.id, { t: next })
                        } else {
                          onTimedKeyTimeDraft(key.t.toFixed(2))
                        }
                      }}
                      style={{ width: '4.2rem', fontSize: '0.75rem' }}
                    />
                    <span style={{ fontSize: '0.7rem' }}>s</span>
                    {layer.characterId ? (
                      <select
                        value={key.action.type === 'setPose' ? key.action.poseId : ''}
                        onChange={(e) =>
                          onUpdateTimedKey(key.id, { action: { type: 'setPose', poseId: e.target.value } })
                        }
                        style={{ flex: 1, fontSize: '0.75rem' }}
                      >
                        {poses
                          .filter((p) => p.characterId === layer.characterId)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.slot}
                              {p.status !== 'approved' ? ` (${p.status})` : ''}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <select
                        value={key.action.type === 'setState' ? key.action.stateId : ''}
                        onChange={(e) =>
                          onUpdateTimedKey(key.id, { action: { type: 'setState', stateId: e.target.value } })
                        }
                        style={{ flex: 1, fontSize: '0.75rem' }}
                      >
                        {assetStates
                          .filter((s) => s.assetId === layer.visualAssetId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteTimedKey(key.id)}
                      style={{ fontSize: '0.7rem', padding: '0.15rem 0.35rem', background: 'var(--danger)', color: 'white' }}
                    >
                      Delete
                    </button>
                  </div>
                  {issue && (
                    <div style={{ fontSize: '0.7rem', color: '#ff8a8a', marginTop: '0.2rem' }}>{issue}</div>
                  )}
                </div>
              )
            })}
          <button
            type="button"
            onClick={onAddTimedKey}
            style={{ width: '100%', fontSize: '0.75rem', padding: '0.25rem', marginTop: '0.15rem' }}
          >
            + Key @ {playbackTime.toFixed(2)}s
          </button>
        </div>
      )}

      <CollapsibleSection title="Transform" defaultOpen>
        <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
          Scale: {layer.scale.toFixed(2)}x
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={layer.scale}
              onChange={(e) => onChangeScale(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min="0.1"
              max="5"
              step="0.1"
              value={layer.scale}
              onChange={(e) => onChangeScale(Math.max(0.1, Math.min(5, parseFloat(e.target.value) || 1)))}
              style={{ width: '52px', fontSize: '0.75rem' }}
            />
          </div>
        </label>
        <label style={{ display: 'block', fontSize: '0.75rem' }}>
          Rotation: {layer.rotation.toFixed(0)}°
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={layer.rotation}
              onChange={(e) => onChangeRotation(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min="0"
              max="360"
              step="1"
              value={layer.rotation}
              onChange={(e) =>
                onChangeRotation(((parseFloat(e.target.value) || 0) % 360 + 360) % 360)
              }
              style={{ width: '52px', fontSize: '0.75rem' }}
            />
          </div>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.8rem' }}>
          <input
            type="checkbox"
            checked={layer.visible !== false}
            onChange={(e) => onChangeVisible(e.target.checked)}
          />
          Visible
        </label>
      </CollapsibleSection>

      {kind === 'text' && (
        <CollapsibleSection title="Text" defaultOpen>
          <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
            Text
            <textarea
              value={layer.text || ''}
              onChange={(e) => onChangeText(e.target.value)}
              rows={3}
              style={{ width: '100%', marginTop: '0.2rem', fontSize: '0.85rem' }}
            />
          </label>
          <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
            Font
            <select
              value={layer.fontRef || DEFAULT_FONT_REF}
              onChange={(e) => onChangeFont(e.target.value)}
              style={{ width: '100%', marginTop: '0.2rem', fontSize: '0.85rem' }}
            >
              <option value={DEFAULT_FONT_REF}>default (system sans-serif)</option>
              {fonts.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', fontSize: '0.75rem' }}>
            Palette
            <select
              value={layer.paletteRef || DEFAULT_PALETTE_REF}
              onChange={(e) => onChangePalette(e.target.value)}
              style={{ width: '100%', marginTop: '0.2rem', fontSize: '0.85rem' }}
            >
              <option value={DEFAULT_PALETTE_REF}>default (#ffffff)</option>
              {palettes.map((pal) => (
                <option key={pal.id} value={pal.id}>
                  {pal.name}
                </option>
              ))}
            </select>
          </label>
        </CollapsibleSection>
      )}

      <button type="button" onClick={onFlip} style={{ width: '100%', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
        {layer.flipX ? 'Unflip' : 'Flip'} Horizontal
      </button>
      <button
        type="button"
        onClick={onDeleteLayer}
        style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.8rem', background: 'var(--error, #a33)', color: '#fff' }}
      >
        Delete Layer
      </button>

      <CollapsibleSection title="Effects" defaultOpen={false}>
        <div style={{ fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Drop Shadow</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.7rem' }}>
          <label>
            Offset X
            <input
              type="number"
              value={layer.fx?.dropShadow?.offsetX ?? 0}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0
                onChangeFx({
                  ...layer.fx,
                  dropShadow: {
                    offsetX: value,
                    offsetY: layer.fx?.dropShadow?.offsetY ?? 6,
                    blur: layer.fx?.dropShadow?.blur ?? 10,
                    color: layer.fx?.dropShadow?.color ?? '#000000',
                    alpha: layer.fx?.dropShadow?.alpha ?? 0.5
                  }
                })
              }}
              style={{ width: '100%', fontSize: '0.7rem' }}
            />
          </label>
          <label>
            Offset Y
            <input
              type="number"
              value={layer.fx?.dropShadow?.offsetY ?? 0}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0
                onChangeFx({
                  ...layer.fx,
                  dropShadow: {
                    offsetX: layer.fx?.dropShadow?.offsetX ?? 4,
                    offsetY: value,
                    blur: layer.fx?.dropShadow?.blur ?? 10,
                    color: layer.fx?.dropShadow?.color ?? '#000000',
                    alpha: layer.fx?.dropShadow?.alpha ?? 0.5
                  }
                })
              }}
              style={{ width: '100%', fontSize: '0.7rem' }}
            />
          </label>
          <label>
            Blur
            <input
              type="number"
              value={layer.fx?.dropShadow?.blur ?? 0}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0
                onChangeFx({
                  ...layer.fx,
                  dropShadow: {
                    offsetX: layer.fx?.dropShadow?.offsetX ?? 4,
                    offsetY: layer.fx?.dropShadow?.offsetY ?? 6,
                    blur: value,
                    color: layer.fx?.dropShadow?.color ?? '#000000',
                    alpha: layer.fx?.dropShadow?.alpha ?? 0.5
                  }
                })
              }}
              style={{ width: '100%', fontSize: '0.7rem' }}
            />
          </label>
          <label>
            Alpha {Math.round((layer.fx?.dropShadow?.alpha ?? 0) * 100)}%
            <input
              type="range"
              min="0"
              max="100"
              value={(layer.fx?.dropShadow?.alpha ?? 0) * 100}
              onChange={(e) => {
                const value = parseInt(e.target.value) / 100
                onChangeFx({
                  ...layer.fx,
                  dropShadow: {
                    offsetX: layer.fx?.dropShadow?.offsetX ?? 4,
                    offsetY: layer.fx?.dropShadow?.offsetY ?? 6,
                    blur: layer.fx?.dropShadow?.blur ?? 10,
                    color: layer.fx?.dropShadow?.color ?? '#000000',
                    alpha: value
                  }
                })
              }}
              style={{ width: '100%' }}
            />
          </label>
        </div>
        <div style={{ fontSize: '0.7rem', fontWeight: 'bold', margin: '0.45rem 0 0.25rem' }}>Outer Glow</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.7rem' }}>
          <label>
            Blur
            <input
              type="number"
              value={layer.fx?.outerGlow?.blur ?? 0}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0
                onChangeFx({
                  ...layer.fx,
                  outerGlow: {
                    blur: value,
                    color: layer.fx?.outerGlow?.color ?? '#00ffff',
                    alpha: layer.fx?.outerGlow?.alpha ?? 0.8,
                    strength: layer.fx?.outerGlow?.strength ?? 1
                  }
                })
              }}
              style={{ width: '100%', fontSize: '0.7rem' }}
            />
          </label>
          <label>
            Alpha {Math.round((layer.fx?.outerGlow?.alpha ?? 0) * 100)}%
            <input
              type="range"
              min="0"
              max="100"
              value={(layer.fx?.outerGlow?.alpha ?? 0) * 100}
              onChange={(e) => {
                const value = parseInt(e.target.value) / 100
                onChangeFx({
                  ...layer.fx,
                  outerGlow: {
                    blur: layer.fx?.outerGlow?.blur ?? 12,
                    color: layer.fx?.outerGlow?.color ?? '#00ffff',
                    alpha: value,
                    strength: layer.fx?.outerGlow?.strength ?? 1
                  }
                })
              }}
              style={{ width: '100%' }}
            />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Color
            <select
              value={layer.fx?.outerGlow?.color ?? '#00ffff'}
              onChange={(e) =>
                onChangeFx({
                  ...layer.fx,
                  outerGlow: {
                    blur: layer.fx?.outerGlow?.blur ?? 12,
                    color: e.target.value,
                    alpha: layer.fx?.outerGlow?.alpha ?? 0.8,
                    strength: layer.fx?.outerGlow?.strength ?? 1
                  }
                })
              }
              style={{ width: '100%', fontSize: '0.7rem' }}
            >
              <option value="#00ffff">Cyan</option>
              <option value="#ff00ff">Magenta</option>
              <option value="#ffff00">Yellow</option>
              <option value="#ffffff">White</option>
              <option value="#ff0000">Red</option>
              <option value="#00ff00">Green</option>
              <option value="#0000ff">Blue</option>
            </select>
          </label>
        </div>
        {(layer.fx?.dropShadow || layer.fx?.outerGlow) && (
          <button type="button" onClick={() => onChangeFx(undefined)} style={{ fontSize: '0.7rem', width: '100%', marginTop: '0.4rem' }}>
            Clear Effects
          </button>
        )}
      </CollapsibleSection>
    </div>
  )
}
