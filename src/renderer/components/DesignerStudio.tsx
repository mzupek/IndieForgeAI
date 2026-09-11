import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { GenerationSpinner } from './shared'
import { useProjectStore, useUIStore } from '../state/indieForgeStore'

export function DesignerStudio() {
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const assetIdParam = searchParams.get('assetId')
  const { activeProject, openProject, setActiveProject } = useProjectStore()
  const { setError } = useUIStore()
  const [message, setMessage] = useState('')
  const [assetId, setAssetId] = useState<string>('')
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (projectId && (!activeProject || activeProject.id !== projectId)) {
      openProject(projectId)
    }
  }, [projectId, activeProject, openProject])

  useEffect(() => {
    if (assetIdParam) setAssetId(assetIdParam)
  }, [assetIdParam])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeProject?.designerChat?.length, sending])

  const messages = activeProject?.designerChat ?? []
  const visualAssets = activeProject?.assets.filter((a) =>
    ['sprite', 'animation', 'background', 'prop', 'effect', 'ui_icon'].includes(a.type)
  )

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !message.trim() || sending) return

    setSending(true)
    setError(null)
    try {
      const result = await window.indieForge.ai.designerChat(projectId, message.trim(), {
        assetId: assetId || undefined
      })
      setActiveProject(result.project)
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Designer chat failed')
    } finally {
      setSending(false)
    }
  }

  const handleClear = async () => {
    if (!projectId || !confirm('Clear designer conversation?')) return
    const project = await window.indieForge.ai.designerClearChat(projectId)
    setActiveProject(project)
  }

  const handleApplyStyle = async (updates: NonNullable<(typeof messages)[0]['suggestions']>['styleGuideUpdates']) => {
    if (!projectId || !updates) return
    const project = await window.indieForge.ai.designerApplyStyle(projectId, updates)
    setActiveProject(project)
  }

  const handleApplyPrompt = async (targetAssetId: string, prompt: string) => {
    if (!projectId) return
    const project = await window.indieForge.ai.designerApplyPrompt(projectId, targetAssetId, prompt)
    setActiveProject(project)
  }

  if (!activeProject) return <p>Loading…</p>

  return (
    <div className="designer-studio">
      <div className="page-header">
        <div>
          <h2>Designer Agent</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
            Project-level art direction. To create or refine a specific asset, open it from the Asset Library —
            the generator includes an embedded designer chat.
          </p>
        </div>
        <button type="button" className="secondary btn-sm" onClick={handleClear}>
          Clear chat
        </button>
      </div>

      <div className="designer-context panel-section">
        <label>
          Focus asset (optional)
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">Overall project direction</option>
            {visualAssets?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type})
              </option>
            ))}
          </select>
        </label>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
          {(activeProject.styleReferences?.length ?? 0)} style reference
          {(activeProject.styleReferences?.length ?? 0) === 1 ? '' : 's'} loaded · style guide and references
          are included in every reply
        </p>
      </div>

      <div className="designer-chat">
        {messages.length === 0 && !sending && (
          <div className="designer-chat-empty">
            <p>Try asking:</p>
            <ul>
              <li>“Make all sprites match our logo’s orange and gold palette”</li>
              <li>“Rewrite the batter idle prompt with a chunkier retro silhouette”</li>
              <li>“What mood should the dugout background have?”</li>
            </ul>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`designer-message designer-message-${msg.role}`}>
            <div className="designer-message-label">{msg.role === 'user' ? 'You' : 'Designer'}</div>
            <div className="designer-message-body">{msg.content}</div>
            {msg.role === 'assistant' && msg.suggestions && (
              <div className="designer-suggestions">
                {msg.suggestions.styleGuideUpdates && (
                  <button
                    type="button"
                    className="secondary btn-sm"
                    onClick={() => handleApplyStyle(msg.suggestions!.styleGuideUpdates!)}
                  >
                    Apply style guide updates
                  </button>
                )}
                {msg.suggestions.assetPrompt && (msg.suggestions.assetId || assetId) && (
                  <button
                    type="button"
                    className="secondary btn-sm"
                    onClick={() =>
                      handleApplyPrompt(msg.suggestions!.assetId || assetId, msg.suggestions!.assetPrompt!)
                    }
                  >
                    Apply suggested prompt
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="designer-message designer-message-assistant">
            <div className="designer-message-label">Designer</div>
            <div className="designer-message-body">
              <span className="btn-with-spinner">
                <GenerationSpinner size="sm" />
                Thinking…
              </span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form className="designer-composer panel-section" onSubmit={handleSend}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe the look you want, ask for prompt rewrites, or iterate on the game theme…"
          rows={3}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !message.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
