/**
 * Per-game pose slots and asset categories (1b).
 * Refreshes the project store after every create/update/remove.
 */

import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProjectStore } from '../state/indieForgeStore'
import { CORE_POSE_SLOTS } from '@shared/gameSettings/poseSlots'
import { CORE_ASSET_CATEGORIES } from '@shared/gameSettings/assetCategories'
import type { GameAssetCategoryDef, GamePoseSlotDef } from '@shared/types/assetPipeline'

export function GameSettingsView() {
  const { projectId, gameId } = useOutletContext<{ projectId: string; gameId: string }>()
  const { activeProject, setActiveProject } = useProjectStore()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [slotKey, setSlotKey] = useState('')
  const [slotLabel, setSlotLabel] = useState('')
  const [slotRequired, setSlotRequired] = useState(false)

  const [catKey, setCatKey] = useState('')
  const [catLabel, setCatLabel] = useState('')
  const [catBase, setCatBase] = useState('')

  if (!activeProject || !gameId) {
    return <p style={{ color: 'var(--muted)' }}>Loading...</p>
  }

  const game = activeProject.assetPipeline?.games.find((g) => g.id === gameId)
  if (!game) {
    return <p style={{ color: 'var(--error)' }}>Game not found</p>
  }

  const gameSlots: GamePoseSlotDef[] = game.settings?.poseSlots || []
  const gameCats: GameAssetCategoryDef[] = game.settings?.assetCategories || []

  async function refreshAfter(mutator: () => Promise<typeof activeProject>) {
    setBusy(true)
    setError(null)
    try {
      const updated = await mutator()
      setActiveProject(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Game Settings</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {game.name} • pose slots and asset categories
          </p>
        </div>
      </div>

      {error && (
        <div
          style={{
            margin: '0 0 1rem 0',
            padding: '0.75rem',
            background: 'var(--error-bg, #3a1a1a)',
            border: '1px solid var(--error)',
            borderRadius: '4px',
            color: 'var(--error)'
          }}
        >
          {error}
        </div>
      )}

      <div className="panel-section" style={{ marginBottom: '2rem' }}>
        <h3>Pose slots</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Built-ins stay required unless a character turns off core poses. Game slots apply to every
          character in this game. Character-only slots are edited on the character.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '0.75rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '0.35rem 0' }}>Key</th>
              <th>Label</th>
              <th>Layer</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {CORE_POSE_SLOTS.map((slot) => (
              <tr key={slot.key}>
                <td style={{ padding: '0.35rem 0' }}><code>{slot.key}</code></td>
                <td>{slot.label}</td>
                <td>built-in</td>
                <td></td>
              </tr>
            ))}
            {gameSlots.map((slot) => (
              <tr key={slot.key}>
                <td style={{ padding: '0.35rem 0' }}><code>{slot.key}</code></td>
                <td>
                  {slot.label}
                  {slot.required ? ' (required)' : ''}
                </td>
                <td>game</td>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    style={{ color: 'var(--error)' }}
                    onClick={() =>
                      refreshAfter(() => window.indieForge.gameSettings.removePoseSlot(projectId, gameId, slot.key))
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'center' }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!slotKey.trim() || !slotLabel.trim()) return
            void refreshAfter(async () => {
              const updated = await window.indieForge.gameSettings.addPoseSlot(projectId, gameId, {
                key: slotKey.trim(),
                label: slotLabel.trim(),
                required: slotRequired
              })
              setSlotKey('')
              setSlotLabel('')
              setSlotRequired(false)
              return updated
            })
          }}
        >
          <input
            placeholder="key (e.g. portrait)"
            value={slotKey}
            onChange={(e) => setSlotKey(e.target.value)}
            disabled={busy}
          />
          <input
            placeholder="Label"
            value={slotLabel}
            onChange={(e) => setSlotLabel(e.target.value)}
            disabled={busy}
          />
          <label style={{ fontSize: '0.85rem', display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={slotRequired}
              onChange={(e) => setSlotRequired(e.target.checked)}
              disabled={busy}
            />
            Required
          </label>
          <button type="submit" disabled={busy || !slotKey.trim() || !slotLabel.trim()}>
            Add slot
          </button>
        </form>
      </div>

      <div className="panel-section">
        <h3>Asset categories</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Library pickers and filters use built-ins plus this game&apos;s list. <code>background</code> is a
          built-in (full-frame; no transparency check). Custom categories may set base <code>background</code>.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '0.75rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '0.35rem 0' }}>Key</th>
              <th>Label</th>
              <th>Layer</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {CORE_ASSET_CATEGORIES.map((cat) => (
              <tr key={cat.key}>
                <td style={{ padding: '0.35rem 0' }}><code>{cat.key}</code></td>
                <td>{cat.label}</td>
                <td>built-in</td>
                <td></td>
              </tr>
            ))}
            {gameCats.map((cat) => (
              <tr key={cat.key}>
                <td style={{ padding: '0.35rem 0' }}><code>{cat.key}</code></td>
                <td>
                  {cat.label}
                  {cat.base ? ` (base: ${cat.base})` : ''}
                </td>
                <td>game</td>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    style={{ color: 'var(--error)' }}
                    onClick={() =>
                      refreshAfter(() =>
                        window.indieForge.gameSettings.removeAssetCategory(projectId, gameId, cat.key)
                      )
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'center' }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!catKey.trim() || !catLabel.trim()) return
            void refreshAfter(async () => {
              const updated = await window.indieForge.gameSettings.addAssetCategory(projectId, gameId, {
                key: catKey.trim(),
                label: catLabel.trim(),
                base: catBase.trim() || undefined
              })
              setCatKey('')
              setCatLabel('')
              setCatBase('')
              return updated
            })
          }}
        >
          <input
            placeholder="key (e.g. map)"
            value={catKey}
            onChange={(e) => setCatKey(e.target.value)}
            disabled={busy}
          />
          <input
            placeholder="Label"
            value={catLabel}
            onChange={(e) => setCatLabel(e.target.value)}
            disabled={busy}
          />
          <input
            placeholder="base (optional)"
            value={catBase}
            onChange={(e) => setCatBase(e.target.value)}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !catKey.trim() || !catLabel.trim()}>
            Add category
          </button>
        </form>
      </div>
    </div>
  )
}
