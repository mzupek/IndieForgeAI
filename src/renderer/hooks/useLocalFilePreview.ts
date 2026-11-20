import { useEffect, useState } from 'react'

function needsForgeFileUrl(filePath: string): boolean {
  const ext = filePath.toLowerCase().split('.').pop()
  return (
    ext === 'mp4' ||
    ext === 'mov' ||
    ext === 'webm' ||
    ext === 'mp3' ||
    ext === 'wav' ||
    ext === 'ogg' ||
    ext === 'm4a'
  )
}

export function useLocalFilePreview(
  filePath: string | null | undefined,
  reloadKey?: number | string
): string | null {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!filePath) {
      setSrc(null)
      return
    }

    let cancelled = false
    
    if (needsForgeFileUrl(filePath)) {
      window.indieForge.files
        .getLocalUrl(filePath)
        .then(({ localUrl }) => {
          if (!cancelled) setSrc(localUrl)
        })
        .catch((err) => {
          console.error('useLocalFilePreview: getLocalUrl failed for', filePath, err)
          if (!cancelled) setSrc(null)
        })
    } else {
      window.indieForge.files
        .readPreviewDataUrl(filePath)
        .then(({ dataUrl }) => {
          if (!cancelled) setSrc(dataUrl)
        })
        .catch((err) => {
          console.error('useLocalFilePreview: readPreviewDataUrl failed for', filePath, err)
          if (!cancelled) setSrc(null)
        })
    }

    return () => {
      cancelled = true
    }
  }, [filePath, reloadKey])

  return src
}
