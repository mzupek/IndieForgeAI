/**
 * Condition and effect builders with readable summaries (Step 3).
 */

import type { CSSProperties } from 'react'
import type { AssetPipelineProject, Condition, Effect, FlagOp } from '@shared/types/assetPipeline'
import { FLAG_OPS, summarizeCondition, summarizeEffects } from '@shared/story/conditions'

type CondKind = 'none' | 'flag' | 'stageCleared' | 'encounterWon' | 'all' | 'any' | 'not'
type EffectKind =
  | 'setFlag'
  | 'incFlag'
  | 'clearFlag'
  | 'unlockStage'
  | 'startEncounter'
  | 'startDialogue'
  | 'playScene'
  | 'moveToRegion'
  | 'returnToWorldMap'

function condKind(c: Condition | undefined): CondKind {
  if (!c) return 'none'
  if ('all' in c) return 'all'
  if ('any' in c) return 'any'
  if ('not' in c) return 'not'
  if ('flag' in c) return 'flag'
  if ('stageCleared' in c) return 'stageCleared'
  return 'encounterWon'
}

function emptyCondition(kind: CondKind): Condition | undefined {
  if (kind === 'none') return undefined
  if (kind === 'flag') return { flag: { flagId: '', op: 'eq', value: true } }
  if (kind === 'stageCleared') return { stageCleared: { stageId: '' } }
  if (kind === 'encounterWon') return { encounterWon: { encounterId: '' } }
  if (kind === 'all') return { all: [] }
  if (kind === 'any') return { any: [] }
  return { not: { flag: { flagId: '', op: 'eq', value: true } } }
}

function effectKind(e: Effect): EffectKind {
  if ('setFlag' in e) return 'setFlag'
  if ('incFlag' in e) return 'incFlag'
  if ('clearFlag' in e) return 'clearFlag'
  if ('unlockStage' in e) return 'unlockStage'
  if ('startEncounter' in e) return 'startEncounter'
  if ('startDialogue' in e) return 'startDialogue'
  if ('playScene' in e) return 'playScene'
  if ('moveToRegion' in e) return 'moveToRegion'
  return 'returnToWorldMap'
}

function emptyEffect(kind: EffectKind): Effect {
  if (kind === 'setFlag') return { setFlag: { flagId: '', value: true } }
  if (kind === 'incFlag') return { incFlag: { flagId: '', by: 1 } }
  if (kind === 'clearFlag') return { clearFlag: { flagId: '' } }
  if (kind === 'unlockStage') return { unlockStage: { stageId: '' } }
  if (kind === 'startEncounter') return { startEncounter: { encounterId: '' } }
  if (kind === 'startDialogue') return { startDialogue: { dialogueId: '' } }
  if (kind === 'playScene') return { playScene: { sceneId: '' } }
  if (kind === 'moveToRegion') return { moveToRegion: { regionId: '' } }
  return { returnToWorldMap: true }
}

const box: CSSProperties = {
  display: 'grid',
  gap: '0.35rem',
  padding: '0.5rem',
  border: '1px solid var(--border)',
  borderRadius: 4
}

export function ConditionBuilder({
  pipeline,
  gameId,
  value,
  onChange,
  disabled,
  nested
}: {
  pipeline: AssetPipelineProject
  gameId: string
  value: Condition | undefined
  onChange: (next: Condition | undefined) => void
  disabled?: boolean
  nested?: boolean
}) {
  const flags = (pipeline.flags || []).filter((f) => f.gameId === gameId)
  const stages = (pipeline.stages || []).filter((s) => s.gameId === gameId)
  const encounters = (pipeline.encounters || []).filter((e) => e.gameId === gameId)
  const kind = condKind(value)
  const summary = summarizeCondition(pipeline, gameId, value)

  return (
    <div style={nested ? { display: 'grid', gap: '0.35rem' } : box}>
      {!nested && (
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          {summary}
        </div>
      )}
      <select
        value={kind}
        disabled={disabled}
        onChange={(e) => onChange(emptyCondition(e.target.value as CondKind))}
      >
        <option value="none">(none)</option>
        <option value="flag">flag</option>
        <option value="stageCleared">stage cleared</option>
        <option value="encounterWon">encounter won</option>
        <option value="all">all (AND)</option>
        <option value="any">any (OR)</option>
        <option value="not">not</option>
      </select>
      {value && 'flag' in value && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 5rem 6rem', gap: '0.35rem' }}>
          <select
            value={value.flag.flagId}
            disabled={disabled}
            onChange={(e) =>
              onChange({ flag: { ...value.flag, flagId: e.target.value } })
            }
          >
            <option value="">Select flag</option>
            {flags.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.key ? ` @${f.key}` : ''}
              </option>
            ))}
          </select>
          <select
            value={value.flag.op}
            disabled={disabled}
            onChange={(e) =>
              onChange({ flag: { ...value.flag, op: e.target.value as FlagOp } })
            }
          >
            {FLAG_OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            value={String(value.flag.value)}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value.trim()
              const parsed =
                raw === 'true' ? true : raw === 'false' ? false : /^-?\d+$/.test(raw) ? Number(raw) : raw
              onChange({
                flag: {
                  ...value.flag,
                  value: typeof parsed === 'boolean' || typeof parsed === 'number' ? parsed : value.flag.value
                }
              })
            }}
          />
        </div>
      )}
      {value && 'stageCleared' in value && (
        <select
          value={value.stageCleared.stageId}
          disabled={disabled}
          onChange={(e) => onChange({ stageCleared: { stageId: e.target.value } })}
        >
          <option value="">Select stage</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {value && 'encounterWon' in value && (
        <select
          value={value.encounterWon.encounterId}
          disabled={disabled}
          onChange={(e) => onChange({ encounterWon: { encounterId: e.target.value } })}
        >
          <option value="">Select encounter</option>
          {encounters.map((enc) => (
            <option key={enc.id} value={enc.id}>
              {enc.name}
            </option>
          ))}
        </select>
      )}
      {value && 'not' in value && (
        <ConditionBuilder
          pipeline={pipeline}
          gameId={gameId}
          value={value.not}
          onChange={(next) => onChange(next ? { not: next } : undefined)}
          disabled={disabled}
          nested
        />
      )}
      {value && 'all' in value && (
        <GroupEditor
          pipeline={pipeline}
          gameId={gameId}
          items={value.all}
          onChange={(items) => onChange({ all: items })}
          disabled={disabled}
        />
      )}
      {value && 'any' in value && (
        <GroupEditor
          pipeline={pipeline}
          gameId={gameId}
          items={value.any}
          onChange={(items) => onChange({ any: items })}
          disabled={disabled}
        />
      )}
    </div>
  )
}

function GroupEditor({
  pipeline,
  gameId,
  items,
  onChange,
  disabled
}: {
  pipeline: AssetPipelineProject
  gameId: string
  items: Condition[]
  onChange: (items: Condition[]) => void
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'grid', gap: '0.35rem', paddingLeft: '0.5rem' }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.35rem' }}>
          <ConditionBuilder
            pipeline={pipeline}
            gameId={gameId}
            value={item}
            onChange={(next) => {
              const copy = items.slice()
              if (!next) copy.splice(i, 1)
              else copy[i] = next
              onChange(copy)
            }}
            disabled={disabled}
            nested
          />
          <button
            type="button"
            className="ghost"
            disabled={disabled}
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ghost"
        disabled={disabled}
        onClick={() => onChange([...items, { flag: { flagId: '', op: 'eq', value: true } }])}
      >
        + check
      </button>
    </div>
  )
}

export function EffectList({
  pipeline,
  gameId,
  value,
  onChange,
  disabled
}: {
  pipeline: AssetPipelineProject
  gameId: string
  value: Effect[]
  onChange: (next: Effect[]) => void
  disabled?: boolean
}) {
  const flags = (pipeline.flags || []).filter((f) => f.gameId === gameId)
  const stages = (pipeline.stages || []).filter((s) => s.gameId === gameId)
  const encounters = (pipeline.encounters || []).filter((e) => e.gameId === gameId)
  const regions = (pipeline.regions || []).filter((r) => r.gameId === gameId)
  const scenes = (pipeline.scenes || []).filter((s) => s.gameId === gameId)
  const summary = summarizeEffects(pipeline, gameId, value)

  return (
    <div style={box}>
      <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{summary}</div>
      {value.map((effect, i) => {
        const kind = effectKind(effect)
        return (
          <div key={i} style={{ display: 'grid', gap: '0.35rem', borderTop: '1px dashed var(--border)', paddingTop: '0.35rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.35rem' }}>
              <select
                value={kind}
                disabled={disabled}
                onChange={(e) => {
                  const copy = value.slice()
                  copy[i] = emptyEffect(e.target.value as EffectKind)
                  onChange(copy)
                }}
              >
                <option value="setFlag">setFlag</option>
                <option value="incFlag">incFlag</option>
                <option value="clearFlag">clearFlag</option>
                <option value="unlockStage">unlockStage</option>
                <option value="startEncounter">startEncounter</option>
                <option value="startDialogue">startDialogue</option>
                <option value="playScene">playScene</option>
                <option value="moveToRegion">moveToRegion</option>
                <option value="returnToWorldMap">returnToWorldMap</option>
              </select>
              <button
                type="button"
                className="ghost"
                disabled={disabled}
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
            {'setFlag' in effect && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 6rem', gap: '0.35rem' }}>
                <FlagSelect
                  flags={flags}
                  value={effect.setFlag.flagId}
                  disabled={disabled}
                  onChange={(flagId) => {
                    const copy = value.slice()
                    copy[i] = { setFlag: { ...effect.setFlag, flagId } }
                    onChange(copy)
                  }}
                />
                <input
                  value={String(effect.setFlag.value)}
                  disabled={disabled}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    const parsed = raw === 'true' ? true : raw === 'false' ? false : Number(raw)
                    const copy = value.slice()
                    copy[i] = {
                      setFlag: {
                        ...effect.setFlag,
                        value: typeof parsed === 'boolean' || Number.isFinite(parsed) ? parsed : effect.setFlag.value
                      }
                    }
                    onChange(copy)
                  }}
                />
              </div>
            )}
            {'incFlag' in effect && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 6rem', gap: '0.35rem' }}>
                <FlagSelect
                  flags={flags}
                  value={effect.incFlag.flagId}
                  disabled={disabled}
                  onChange={(flagId) => {
                    const copy = value.slice()
                    copy[i] = { incFlag: { ...effect.incFlag, flagId } }
                    onChange(copy)
                  }}
                />
                <input
                  value={String(effect.incFlag.by)}
                  disabled={disabled}
                  onChange={(e) => {
                    const copy = value.slice()
                    copy[i] = { incFlag: { ...effect.incFlag, by: Number(e.target.value) || 0 } }
                    onChange(copy)
                  }}
                />
              </div>
            )}
            {'clearFlag' in effect && (
              <FlagSelect
                flags={flags}
                value={effect.clearFlag.flagId}
                disabled={disabled}
                onChange={(flagId) => {
                  const copy = value.slice()
                  copy[i] = { clearFlag: { flagId } }
                  onChange(copy)
                }}
              />
            )}
            {'unlockStage' in effect && (
              <select
                value={effect.unlockStage.stageId}
                disabled={disabled}
                onChange={(e) => {
                  const copy = value.slice()
                  copy[i] = { unlockStage: { stageId: e.target.value } }
                  onChange(copy)
                }}
              >
                <option value="">Select stage</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {'startEncounter' in effect && (
              <select
                value={effect.startEncounter.encounterId}
                disabled={disabled}
                onChange={(e) => {
                  const copy = value.slice()
                  copy[i] = { startEncounter: { encounterId: e.target.value } }
                  onChange(copy)
                }}
              >
                <option value="">Select encounter</option>
                {encounters.map((enc) => (
                  <option key={enc.id} value={enc.id}>
                    {enc.name}
                  </option>
                ))}
              </select>
            )}
            {'startDialogue' in effect && (
              <input
                placeholder="dialogue id or @key"
                value={effect.startDialogue.dialogueId}
                disabled={disabled}
                onChange={(e) => {
                  const copy = value.slice()
                  copy[i] = { startDialogue: { dialogueId: e.target.value } }
                  onChange(copy)
                }}
              />
            )}
            {'playScene' in effect && (
              <select
                value={effect.playScene.sceneId}
                disabled={disabled}
                onChange={(e) => {
                  const copy = value.slice()
                  copy[i] = { playScene: { sceneId: e.target.value } }
                  onChange(copy)
                }}
              >
                <option value="">Select scene</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {'moveToRegion' in effect && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 8rem', gap: '0.35rem' }}>
                <select
                  value={effect.moveToRegion.regionId}
                  disabled={disabled}
                  onChange={(e) => {
                    const copy = value.slice()
                    copy[i] = { moveToRegion: { ...effect.moveToRegion, regionId: e.target.value } }
                    onChange(copy)
                  }}
                >
                  <option value="">Select region</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="anchor"
                  value={effect.moveToRegion.anchorId || ''}
                  disabled={disabled}
                  onChange={(e) => {
                    const copy = value.slice()
                    copy[i] = {
                      moveToRegion: {
                        ...effect.moveToRegion,
                        anchorId: e.target.value.trim() || undefined
                      }
                    }
                    onChange(copy)
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="ghost"
        disabled={disabled}
        onClick={() => onChange([...value, emptyEffect('setFlag')])}
      >
        + effect
      </button>
    </div>
  )
}

function FlagSelect({
  flags,
  value,
  onChange,
  disabled
}: {
  flags: { id: string; name: string; key?: string }[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select flag</option>
      {flags.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
          {f.key ? ` @${f.key}` : ''}
        </option>
      ))}
    </select>
  )
}
