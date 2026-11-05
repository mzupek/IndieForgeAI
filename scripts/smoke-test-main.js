#!/usr/bin/env node
/**
 * Smoke test: verifies that the built main bundle loads without module errors.
 * Uses Node require to catch immediate module resolution failures.
 */

const { join } = require('path')

const mainPath = join(__dirname, '../out/main/index.js')

console.log('Running main bundle smoke test...')
console.log(`Loading: ${mainPath}`)

try {
  // Try to require the main bundle
  // This will fail immediately if there are module resolution errors
  require(mainPath)
  console.log('✓ Main bundle loaded successfully (no module errors)')
  process.exit(0)
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND' || err.message.includes('Cannot find module')) {
    console.error('FAILED: Module resolution error')
    console.error(err.message)
    console.error(err.stack)
    process.exit(1)
  }
  
  // Other errors (like accessing Electron APIs) are expected and OK
  if (err.message.includes('electron') || 
      err.message.includes('BrowserWindow') ||
      err.message.includes('app is not defined') ||
      err.message.includes('registerSchemesAsPrivileged') ||
      err.message.includes('Cannot read properties of undefined')) {
    console.log('✓ Main bundle loaded (Electron runtime error is expected outside Electron)')
    process.exit(0)
  }
  
  // Unexpected error
  console.error('FAILED: Unexpected error')
  console.error(err.message)
  console.error(err.stack)
  process.exit(1)
}
