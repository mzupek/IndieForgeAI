import { Link, type LinkProps } from 'react-router-dom'
import type { AssetStatus, GameAssetType } from '@shared/types/project'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'

type NavButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export function NavButton({
  to,
  children,
  variant = 'primary',
  className,
  ...rest
}: LinkProps & { variant?: NavButtonVariant }) {
  const variantClass =
    variant === 'secondary'
      ? ' secondary'
      : variant === 'danger'
        ? ' danger'
        : variant === 'ghost'
          ? ' ghost'
          : ''

  return (
    <Link to={to} className={`btn${variantClass}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </Link>
  )
}

export function StatusBadge({ status }: { status: AssetStatus | string }) {
  return <span className={`badge badge-${status}`}>{status.replace('_', ' ')}</span>
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function AssetThumbnail({ asset }: { asset: { name: string; filePath?: string; type: string } }) {
  const isAudio = ['music', 'sound_effect', 'voice_line'].includes(asset.type)
  const previewSrc = useLocalFilePreview(isAudio ? null : asset.filePath)

  return (
    <div className="asset-thumb">
      {previewSrc ? (
        <img src={previewSrc} alt={asset.name} />
      ) : (
        <div className="asset-thumb-placeholder">{isAudio ? '♪' : '◻'}</div>
      )}
      <span>{asset.name}</span>
    </div>
  )
}

export function LocalImagePreview({
  filePath,
  alt,
  className,
  mode = 'pixel',
  displaySize,
  reloadKey
}: {
  filePath: string | null | undefined
  alt: string
  className?: string
  mode?: 'pixel' | 'fit'
  displaySize?: { width: number; height: number }
  reloadKey?: number | string
}) {
  const src = useLocalFilePreview(filePath, reloadKey)
  if (!src) {
    return <span style={{ color: 'var(--muted)' }}>No preview</span>
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`preview-img preview-${mode}${className ? ` ${className}` : ''}`}
      style={
        mode === 'pixel' && displaySize
          ? { width: displaySize.width, height: displaySize.height }
          : undefined
      }
    />
  )
}

export function LocalAudioPreview({ filePath }: { filePath: string | null | undefined }) {
  const src = useLocalFilePreview(filePath)
  if (!src) return <>—</>
  return <audio controls src={src} />
}

export function formatAssetType(type: GameAssetType): string {
  return type.replace('_', ' ')
}

export function GenerationSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`generation-spinner generation-spinner-${size}`} aria-hidden="true" />
}

export function GenerationStatusBanner({ message }: { message: string }) {
  return (
    <div className="generation-status-banner" role="status" aria-live="polite">
      <GenerationSpinner />
      <span>{message}</span>
    </div>
  )
}

export function PreviewLoadingOverlay({ message }: { message: string }) {
  return (
    <div className="preview-loading-overlay" role="status" aria-live="polite">
      <GenerationSpinner size="lg" />
      <p>{message}</p>
      <p className="preview-loading-hint">OpenAI image generation usually takes 15–45 seconds.</p>
    </div>
  )
}
