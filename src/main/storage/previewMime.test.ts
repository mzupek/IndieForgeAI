/**
 * Preview MIME type tests
 * Run with: npx tsx src/main/storage/previewMime.test.ts
 */

import { getPreviewMimeType } from './previewMime'

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`)
  }
}

function testImageMimeTypes() {
  assertEqual(getPreviewMimeType('/path/to/image.png'), 'image/png', 'PNG MIME type')
  assertEqual(getPreviewMimeType('/path/to/photo.jpg'), 'image/jpeg', 'JPG MIME type')
  assertEqual(getPreviewMimeType('/path/to/photo.jpeg'), 'image/jpeg', 'JPEG MIME type')
  assertEqual(getPreviewMimeType('/path/to/image.webp'), 'image/webp', 'WebP MIME type')
  assertEqual(getPreviewMimeType('/path/to/animation.gif'), 'image/gif', 'GIF MIME type')
  console.log('✓ Image MIME types')
}

function testAudioMimeTypes() {
  assertEqual(getPreviewMimeType('/path/to/sound.mp3'), 'audio/mpeg', 'MP3 MIME type')
  assertEqual(getPreviewMimeType('/path/to/sound.wav'), 'audio/wav', 'WAV MIME type')
  assertEqual(getPreviewMimeType('/path/to/sound.ogg'), 'audio/ogg', 'OGG MIME type')
  assertEqual(getPreviewMimeType('/path/to/sound.m4a'), 'audio/mp4', 'M4A MIME type')
  console.log('✓ Audio MIME types')
}

function testVideoMimeTypes() {
  assertEqual(getPreviewMimeType('/path/to/clip.mp4'), 'video/mp4', 'MP4 MIME type')
  assertEqual(getPreviewMimeType('/path/to/clip.mov'), 'video/quicktime', 'MOV MIME type')
  assertEqual(getPreviewMimeType('/path/to/clip.webm'), 'video/webm', 'WebM MIME type')
  console.log('✓ Video MIME types')
}

function testUppercaseExtensions() {
  assertEqual(getPreviewMimeType('/path/to/VIDEO.MP4'), 'video/mp4', 'Uppercase MP4')
  assertEqual(getPreviewMimeType('/path/to/VIDEO.MOV'), 'video/quicktime', 'Uppercase MOV')
  assertEqual(getPreviewMimeType('/path/to/IMAGE.PNG'), 'image/png', 'Uppercase PNG')
  console.log('✓ Uppercase extensions')
}

function testUnknownExtensions() {
  assertEqual(getPreviewMimeType('/path/to/file.xyz'), 'application/octet-stream', 'Unknown extension')
  assertEqual(getPreviewMimeType('/path/to/file.txt'), 'application/octet-stream', 'Text file')
  assertEqual(getPreviewMimeType('/path/to/file'), 'application/octet-stream', 'No extension')
  console.log('✓ Unknown extensions')
}

console.log('Running preview MIME type tests...')
testImageMimeTypes()
testAudioMimeTypes()
testVideoMimeTypes()
testUppercaseExtensions()
testUnknownExtensions()
console.log('\n✅ All tests passed!')
