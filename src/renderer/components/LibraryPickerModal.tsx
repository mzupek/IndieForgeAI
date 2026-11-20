/**
 * Unified Game-scoped Library picker. Esc closes. Click a tile to select.
 * Video clips show a poster/thumbnail or a clip icon — the grid does not decode every file.
 */

import { useEffect, useMemo, useState } from 'react'
import type { AssetPipelineProject } from '@shared/types/assetPipeline'
import {
  LIBRARY_PAGE_SIZE,
  buildLibraryCatalog,
  catalogKindsForPurpose,
  defaultTabForPurpose,
  filterLibraryCatalog,
  paginateLibraryCatalog,
  resolveLibraryPick,
  tabsForPurpose,
  type LibraryCatalogItem,
  type LibraryPickAction,
  type LibraryPickerPurpose,
  type LibraryPickerTab
} from '@shared/storyboard/libraryCatalog'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'

function TileThumb({ item }: { item: LibraryCatalogItem }) {
  const src = useLocalFilePreview(item.thumbnailPath)
  if (src) {
    if (item.kind === 'clip' && !item.thumbnailPath) {
      return <span style={{ fontSize: '1.6rem' }}>🎬</span>
    }
    return (
      <img
        src={src}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    )
  }
  if (item.kind === 'clip') return <span style={{ fontSize: '1.6rem' }}>🎬</span>
  if (item.kind === 'character') return <span style={{ fontSize: '1.4rem' }}>👤</span>
  if (item.kind === 'pose') return <span style={{ fontSize: '1.4rem' }}>🧍</span>
  if (item.kind === 'audio') return <span style={{ fontSize: '1.4rem' }}>🔊</span>
  if (item.kind === 'event') return <span style={{ fontSize: '1.4rem' }}>⚡</span>
  if (item.kind === 'effect') return <span style={{ fontSize: '1.4rem' }}>✨</span>
  return <span style={{ fontSize: '1.4rem' }}>🖼️</span>
}

function AudioPreviewButton({ file }: { file?: string }) {
  const src = useLocalFilePreview(file)
  return (
    <button
      type="button"
      title="Preview"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (!src) return
        const audio = new Audio(src)
        audio.volume = 0.8
        void audio.play().catch(() => undefined)
      }}
      style={{
        marginTop: '0.15rem',
        fontSize: '0.6rem',
        padding: '0.1rem 0.3rem',
        width: '100%'
      }}
    >
      Play
    </button>
  )
}

export function LibraryPickerModal({
  open,
  purpose,
  pipeline,
  gameId,
  title,
  initialTab,
  onClose,
  onPick
}: {
  open: boolean
  purpose: LibraryPickerPurpose
  pipeline: AssetPipelineProject
  gameId: string
  title: string
  initialTab?: LibraryPickerTab
  onClose: () => void
  onPick: (action: LibraryPickAction) => void
}) {
  const [tab, setTab] = useState<LibraryPickerTab>(initialTab || defaultTabForPurpose(purpose))
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pending, setPending] = useState<LibraryCatalogItem | null>(null)

  useEffect(() => {
    if (!open) return
    setTab(initialTab || defaultTabForPurpose(purpose))
    setQuery('')
    setPage(0)
    setPending(null)
  }, [open, purpose, initialTab])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const tabs = tabsForPurpose(purpose)
  const catalog = useMemo(
    () => (open ? buildLibraryCatalog(pipeline, gameId, catalogKindsForPurpose(purpose)) : []),
    [open, pipeline, gameId, purpose]
  )
  const filtered = useMemo(
    () => filterLibraryCatalog(catalog, tab, query),
    [catalog, tab, query]
  )
  const paged = paginateLibraryCatalog(filtered, page, LIBRARY_PAGE_SIZE)

  useEffect(() => {
    setPage(0)
  }, [tab, query])

  if (!open) return null

  const decision = pending ? resolveLibraryPick(purpose, pending) : null
  const clipHint =
    tab === 'clips' || tab === 'all'
      ? purpose === 'addLayer'
        ? 'Video clips are not still-image layers — picking one places a Clips-track block (a compositing layer is created).'
        : purpose === 'shotBackground'
          ? 'Stills become the shot background image. Video clips become the background clip instead.'
          : null
      : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.72)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        style={{
          width: 'min(760px, 96vw)',
          maxHeight: '90vh',
          background: 'var(--bg)',
          border: '2px solid var(--forge-gold)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
            flexShrink: 0
          }}
        >
          <div>
            <div style={{ fontWeight: 'bold' }}>{title}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
              Selected Game library · Esc closes
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ fontSize: '0.85rem' }}>
            Close
          </button>
        </div>

        <div style={{ padding: '0.6rem 1rem 0', flexShrink: 0 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, tag, pose, clip, audio, event…"
            style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.45rem' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  fontSize: '0.7rem',
                  padding: '0.2rem 0.45rem',
                  background: tab === t.id ? 'var(--forge-gold)' : 'var(--bg-secondary)',
                  color: tab === t.id ? 'var(--bg)' : 'var(--text)',
                  border: '1px solid var(--border)'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {clipHint && (
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.4rem', lineHeight: 1.35 }}>
              {clipHint}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>
          {paged.slice.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', padding: '1.5rem 0' }}>
              Nothing in this Game matches. Import in Library first — this picker does not copy or generate assets.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                gap: '0.45rem'
              }}
            >
              {paged.slice.map((item) => {
                const selected = pending?.id === item.id
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const next = resolveLibraryPick(purpose, item)
                      const crossPurpose =
                        (purpose === 'addLayer' && item.kind === 'clip') ||
                        (purpose === 'shotBackground' && item.kind === 'clip') ||
                        ((purpose === 'backgroundClip' || purpose === 'clipBlock') &&
                          item.kind !== 'clip') ||
                        (purpose === 'shotBackground' &&
                          item.kind !== 'visual' &&
                          item.kind !== 'clip')
                      if (crossPurpose) {
                        setPending(item)
                        return
                      }
                      onPick(next.action)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        ;(e.currentTarget as HTMLDivElement).click()
                      }
                    }}
                    title={`${item.name}\n${item.subtitle}`}
                    style={{
                      padding: '0.3rem',
                      border: selected ? '2px solid var(--forge-gold)' : '1px solid var(--border)',
                      borderRadius: '4px',
                      background: selected ? 'var(--bg-secondary)' : 'var(--bg)',
                      cursor: 'pointer',
                      color: 'var(--text)'
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        background: 'var(--bg-secondary)',
                        borderRadius: '3px'
                      }}
                    >
                      <TileThumb item={item} />
                    </div>
                    <div
                      style={{
                        fontSize: '0.65rem',
                        marginTop: '0.25rem',
                        fontWeight: 'bold',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: '0.6rem',
                        opacity: 0.7,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {item.subtitle}
                    </div>
                    {item.kind === 'audio' ? <AudioPreviewButton file={item.audioFile} /> : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '0.55rem 1rem',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
            fontSize: '0.75rem'
          }}
        >
          {decision && pending ? (
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{pending.name}</div>
              <div style={{ color: 'var(--muted)', marginBottom: '0.4rem', lineHeight: 1.35 }}>
                {decision.note}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => onPick(decision.action)}
                  style={{ fontSize: '0.8rem', background: 'var(--forge-gold)', color: '#000' }}
                >
                  {decision.label}
                </button>
                {decision.alternatives.map((alt) => (
                  <button
                    key={alt.label}
                    type="button"
                    onClick={() => onPick(alt.action)}
                    style={{ fontSize: '0.8rem' }}
                  >
                    {alt.label}
                  </button>
                ))}
                <button type="button" onClick={() => setPending(null)} style={{ fontSize: '0.8rem' }}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)' }}>
                {filtered.length} item{filtered.length === 1 ? '' : 's'}
                {paged.pageCount > 1 ? ` · page ${paged.page + 1}/${paged.pageCount}` : ''}
              </span>
              {paged.pageCount > 1 && (
                <span style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    disabled={paged.page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={paged.page >= paged.pageCount - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
