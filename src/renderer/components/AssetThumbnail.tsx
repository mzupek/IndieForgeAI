/**
 * Asset Thumbnail Component
 *
 * Library grid preview: root thumbnail if present, else default-state file.
 * Uses sanctioned useLocalFilePreview (data URL for PNG).
 */

import React from 'react'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import type { AssetState, VisualAsset } from '@shared/types/assetPipeline'
import { resolveLibraryPreviewPath } from '@shared/storyboard/layerValidation'

interface AssetThumbnailProps {
  asset: VisualAsset
  states?: AssetState[]
  gameId?: string
  style?: React.CSSProperties
}

export function AssetThumbnail({ asset, states = [], gameId, style }: AssetThumbnailProps) {
  const previewPath = resolveLibraryPreviewPath(asset, states, { gameId }).path
  const thumbnailSrc = useLocalFilePreview(previewPath)

  // Show thumbnail if loaded
  if (thumbnailSrc) {
    return (
      <img 
        src={thumbnailSrc} 
        alt=""
        style={{ 
          maxWidth: '100%', 
          maxHeight: '100%', 
          objectFit: 'contain',
          ...style
        }}
      />
    )
  }

  // Fallback to category icon
  return (
    <span style={{ fontSize: '2rem', ...style }}>
      {asset.category === 'logo' && '🏷️'}
      {asset.category === 'symbol' && '⚡'}
      {asset.category === 'item' && '📦'}
      {asset.category === 'weapon' && '⚔️'}
      {asset.category === 'prop' && '🎨'}
    </span>
  )
}
