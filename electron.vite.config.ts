import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** Dedicated renderer port so other Vite apps can keep 5173. Override with INDIE_FORGE_DEV_PORT. */
function indieForgeDevPort(): number {
  const raw = process.env.INDIE_FORGE_DEV_PORT
  if (raw === undefined || String(raw).trim() === '') return 5180
  const port = Number.parseInt(String(raw), 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`INDIE_FORGE_DEV_PORT must be an integer 1–65535, got ${JSON.stringify(raw)}`)
  }
  return port
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@core': resolve('src/core')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@core': resolve('src/core')
      }
    }
  },
  renderer: {
    server: {
      port: indieForgeDevPort(),
      strictPort: true
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer')
      }
    },
    plugins: [react()]
  }
})
