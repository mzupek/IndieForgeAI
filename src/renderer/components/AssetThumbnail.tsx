/**
 * Asset Thumbnail Component
 * 
 * Handles loading thumbnails using proper Electron file protocol
 */

import React from 'react'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import type { VisualAsset } from '@shared/types/assetPipeline'

interface AssetThumbnailProps {
  asset: VisualAsset
  style?: React.CSSProperties
}

export function AssetThumbnail({ asset, style }: AssetThumbnailProps) {
  const thumbnailSrc = useLocalFilePreview(asset.thumbnail)

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
