import { useEffect, useState } from 'react'

function isVideoFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().split('.').pop()
  return ext === 'mp4' || ext === 'mov' || ext === 'webm'
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
    
    if (isVideoFile(filePath)) {
      window.indieForge.files
        .getLocalUrl(filePath)
        .then(({ localUrl }) => {
          if (!cancelled) setSrc(localUrl)
        })
        .catch(() => {
          if (!cancelled) setSrc(null)
        })
    } else {
      window.indieForge.files
        .readPreviewDataUrl(filePath)
        .then(({ dataUrl }) => {
          if (!cancelled) setSrc(dataUrl)
        })
        .catch(() => {
          if (!cancelled) setSrc(null)
        })
    }

    return () => {
      cancelled = true
    }
  }, [filePath, reloadKey])

  return src
}
