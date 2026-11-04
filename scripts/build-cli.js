#!/usr/bin/env node

/**
 * Build the forge CLI with esbuild
 * Resolves TypeScript path aliases and bundles dependencies
 */

const esbuild = require('esbuild')
const { resolve } = require('path')

async function build() {
  try {
    await esbuild.build({
      entryPoints: [resolve(__dirname, '../src/cli/forge.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: resolve(__dirname, '../out/cli/forge.js'),
      format: 'cjs',
      banner: {
        js: '#!/usr/bin/env node\n'
      },
      external: [
        'electron',
        'sharp',
        'commander'
      ],
      sourcemap: false,
      minify: false,
      loader: {
        '.ts': 'ts'
      },
      tsconfig: resolve(__dirname, '../tsconfig.node.json'),
      logLevel: 'error'
    })
    
    console.log('✓ CLI built successfully')
  } catch (err) {
    console.error('Build failed:', err)
    process.exit(1)
  }
}

build()
