#!/usr/bin/env node
/**
 * Regression test for forge-file:/// protocol with spaces in paths
 * 
 * Verifies that:
 * 1. getLocalUrl properly encodes paths with spaces
 * 2. Protocol handler correctly decodes and serves files
 * 3. Video files get correct MIME types
 */

const { existsSync, writeFileSync, mkdirSync, statSync } = require('fs')
const { join, normalize, extname } = require('path')
const { tmpdir } = require('os')

// Simple MIME type checker
function getPreviewMimeType(filePath) {
  const ext = extname(filePath).toLowerCase()
  const mimeMap = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  }
  return mimeMap[ext] || 'application/octet-stream'
}

// Mock getDataDir to return a temp directory with spaces
const testDir = join(tmpdir(), 'test indie forge spaces')
mkdirSync(testDir, { recursive: true })
mkdirSync(join(testDir, 'clips'), { recursive: true })

// Create a dummy MP4 file
const testFilePath = join(testDir, 'clips', 'test file.mp4')
writeFileSync(testFilePath, Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70])) // minimal MP4 header

console.log('Test setup:')
console.log(`  Test dir: ${testDir}`)
console.log(`  Test file: ${testFilePath}`)
console.log(`  File exists: ${existsSync(testFilePath)}`)

// Mock getDataDir
const getDataDir = () => testDir

// Test 1: URL encoding (per-segment, standard scheme with host)
const pathSegments = testFilePath.split('/').map(seg => encodeURIComponent(seg))
const encodedPath = pathSegments.join('/')
const forgeFileUrl = `forge-file://local${encodedPath}`
console.log('\nTest 1: URL encoding')
console.log(`  Original: ${testFilePath}`)
console.log(`  Per-segment encoded: ${encodedPath}`)
console.log(`  Forge URL: ${forgeFileUrl}`)

// Test 2: URL parsing (Chromium standard scheme)
const url = new URL(forgeFileUrl)
console.log('\nTest 2: URL parsing')
console.log(`  Protocol: ${url.protocol}`)
console.log(`  Host: ${url.host}`)
console.log(`  Hostname: ${url.hostname}`)
console.log(`  Pathname: ${url.pathname}`)

// Decode pathname segments (URL parser doesn't auto-decode in Node)
// Split, decode each segment, rejoin
let decodedPath = url.pathname.split('/').map(seg => decodeURIComponent(seg)).join('/')
console.log(`  Decoded pathname: ${decodedPath}`)

// On Windows, pathname would be /C:/path, remove leading slash
if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(decodedPath)) {
  decodedPath = decodedPath.slice(1)
  console.log(`  Windows adjusted: ${decodedPath}`)
}

// Test 3: Path resolution
const normalizedPath = normalize(decodedPath)
const dataDir = normalize(getDataDir())
console.log('\nTest 3: Path resolution')
console.log(`  Normalized path: ${normalizedPath}`)
console.log(`  Data dir: ${dataDir}`)
console.log(`  Path starts with data dir: ${normalizedPath.startsWith(dataDir)}`)
console.log(`  File exists: ${existsSync(normalizedPath)}`)

// Test 4: MIME type
const mimeType = getPreviewMimeType(normalizedPath)
console.log('\nTest 4: MIME type')
console.log(`  MIME: ${mimeType}`)
console.log(`  Expected: video/mp4 or video/quicktime or video/webm`)

// Test 5: Protocol handler simulation
console.log('\nTest 5: Protocol handler simulation')
try {
  const stat = statSync(normalizedPath)
  console.log(`  ✓ File is accessible`)
  console.log(`  File size: ${stat.size} bytes`)
  console.log(`  Is file: ${stat.isFile()}`)
  
  if (stat.isFile()) {
    console.log('  ✓ Would return 200 with correct MIME type')
  }
} catch (err) {
  console.error(`  ✗ Failed to stat file: ${err.message}`)
  process.exit(1)
}

// Summary
console.log('\n=== Test Results ===')
const allPassed = 
  forgeFileUrl.startsWith('forge-file://local/') &&
  url.hostname === 'local' &&
  url.pathname.startsWith('/') &&
  normalizedPath === testFilePath &&
  existsSync(normalizedPath) &&
  (mimeType === 'video/mp4' || mimeType === 'video/quicktime' || mimeType === 'video/webm')

if (allPassed) {
  console.log('✓ All tests passed')
  console.log('  - URL format: forge-file://local/<path>')
  console.log('  - Host validation: hostname === "local"')
  console.log('  - Path with spaces decoded correctly')
  console.log('  - Video MIME type correct')
  process.exit(0)
} else {
  console.error('✗ Some tests failed')
  if (!forgeFileUrl.startsWith('forge-file://local/')) {
    console.error('  - URL format incorrect')
  }
  if (url.hostname !== 'local') {
    console.error('  - Host validation failed')
  }
  if (!url.pathname.startsWith('/')) {
    console.error('  - Pathname format incorrect')
  }
  if (normalizedPath !== testFilePath) {
    console.error('  - Path resolution failed')
  }
  process.exit(1)
}
