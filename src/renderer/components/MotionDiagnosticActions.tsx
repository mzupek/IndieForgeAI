import { useState } from 'react'
import type { MotionBlueprint } from '@shared/types/project'
import { useUIStore } from '../state/indieForgeStore'

/** Copy / export Motion diagnostic JSON (blueprint schema + run log). */
export function MotionDiagnosticActions({
  projectId,
  assetId,
  blueprint,
  disabled
}: {
  projectId: string
  assetId: string
  blueprint?: MotionBlueprint | null
  disabled?: boolean
}) {
  const { setError } = useUIStore()
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const opts = blueprint?.id ? { blueprintId: blueprint.id } : undefined

  const copyDiagnostic = async () => {
    setBusy(true)
    setError(null)
    try {
      const bundle = await window.indieForge.motion.getDiagnostic(projectId, assetId, opts)
      const json = JSON.stringify(bundle, null, 2)
      await navigator.clipboard.writeText(json)
      setStatus(`Copied diagnostic (${bundle.runs.length} runs)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Copy diagnostic failed')
    } finally {
      setBusy(false)
    }
  }

  const exportDiagnostic = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.indieForge.motion.exportDiagnostic(projectId, assetId, opts)
      setStatus(`Exported · ${result.filePath}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export diagnostic failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="motion-diagnostic-actions">
      <button type="button" className="secondary btn-sm" disabled={disabled || busy} onClick={() => void copyDiagnostic()}>
        Copy diagnostic JSON
      </button>
      <button type="button" className="ghost btn-sm" disabled={disabled || busy} onClick={() => void exportDiagnostic()}>
        Export diagnostic file
      </button>
      {status && <span className="craft-notes">{status}</span>}
    </div>
  )
}
