import { useEffect, useState } from 'react'

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
    window.indieForge.files
      .readPreviewDataUrl(filePath)
      .then(({ dataUrl }) => {
        if (!cancelled) setSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })

    return () => {
      cancelled = true
    }
  }, [filePath, reloadKey])

  return src
}
