import sharp from 'sharp'

export async function readSourceImageSize(
  filePath: string
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(filePath).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read image dimensions: ${filePath}`)
  }
  return { width: metadata.width, height: metadata.height }
}
