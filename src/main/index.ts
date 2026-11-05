import { app, BrowserWindow, shell, protocol, net } from 'electron'
import { existsSync, readFileSync, createReadStream, statSync } from 'fs'
import { join, normalize, relative } from 'path'
import { registerIpcHandlers, ensureAppDataDirs } from './ipc/handlers'
import { getDataDir } from '../core/storage/dataDir'
import { getPreviewMimeType } from './storage/previewMime'

function loadEnvFile(): void {
  const envPath = join(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile()

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'forge-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
])

function createWindow(): void {
  const isDev = !app.isPackaged
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Indie Forge AI',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await ensureAppDataDirs()
  registerIpcHandlers()

  protocol.handle('forge-file', async (request) => {
    try {
      const url = new URL(request.url)
      
      // Expect forge-file://local/<absolute-path>
      // Host must be "local" for security
      if (url.hostname !== 'local') {
        console.error(`forge-file: invalid host "${url.hostname}", expected "local"`)
        return new Response('Forbidden: invalid host', { status: 403 })
      }
      
      // Decode pathname (Chromium decodes, but be explicit for safety)
      // Split by /, decode each segment, rejoin to handle %2F vs / properly
      let filePath = url.pathname.split('/').map(seg => decodeURIComponent(seg)).join('/')
      
      // On Windows, pathname starts with / before drive letter, remove it
      if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(filePath)) {
        filePath = filePath.slice(1)
      }
      
      filePath = normalize(filePath)
      const dataDir = normalize(getDataDir())
      const resolvedPath = normalize(join(dataDir, relative(dataDir, filePath)))
      
      if (!resolvedPath.startsWith(dataDir)) {
        return new Response('Forbidden', { status: 403 })
      }
      
      if (!existsSync(resolvedPath)) {
        return new Response('Not Found', { status: 404 })
      }
      
      const stat = statSync(resolvedPath)
      if (!stat.isFile()) {
        return new Response('Not a file', { status: 400 })
      }
      
      const mimeType = getPreviewMimeType(resolvedPath)
      const rangeHeader = request.headers.get('range')
      
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        if (match) {
          const start = parseInt(match[1], 10)
          const end = match[2] ? parseInt(match[2], 10) : stat.size - 1
          const chunkSize = end - start + 1
          
          const stream = createReadStream(resolvedPath, { start, end })
          return new Response(stream as any, {
            status: 206,
            headers: {
              'Content-Type': mimeType,
              'Content-Length': chunkSize.toString(),
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Accept-Ranges': 'bytes'
            }
          })
        }
      }
      
      const stream = createReadStream(resolvedPath)
      return new Response(stream as any, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': stat.size.toString(),
          'Accept-Ranges': 'bytes'
        }
      })
    } catch (err) {
      console.error('forge-file protocol error:', err)
      return new Response('Internal Server Error', { status: 500 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
