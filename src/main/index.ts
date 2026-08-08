/**
 * Electron main entry.
 *
 * Security hardening (see SECURITY.md):
 *   - contextIsolation ON, nodeIntegration OFF, sandbox ON.
 *   - A strict Content-Security-Policy is injected for the renderer.
 *   - The renderer reaches the main process only through the typed preload
 *     bridge; it has no direct Node/fs/child_process access.
 *   - External navigation and new-window requests are blocked.
 */
import { app, BrowserWindow, session, shell } from 'electron';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { Orchestrator } from './orchestrator.js';
import { registerIpc } from './ipc.js';

const CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "font-src 'self' data:; " +
  "connect-src 'self'; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'none'; " +
  "frame-ancestors 'none'";

let mainWindow: BrowserWindow | null = null;

function resolveScriptPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'steamos-nvidia-installer.sh')
    : join(app.getAppPath(), 'resources', 'steamos-nvidia-installer.sh');
}

async function ensureDirs(): Promise<{ workspace: string; logFile: string }> {
  const workspace = join(app.getPath('userData'), 'workspace');
  const logDir = join(app.getPath('userData'), 'logs');
  await mkdir(workspace, { recursive: true });
  await mkdir(logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return { workspace, logFile: join(logDir, `session-${stamp}.log`) };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#100603',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Block external navigation / new windows.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:') && process.env['ELECTRON_RENDERER_URL'] === undefined) {
      event.preventDefault();
    }
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap(): Promise<void> {
  const { workspace, logFile } = await ensureDirs();
  const orchestrator = new Orchestrator({
    scriptWindowsPath: resolveScriptPath(),
    workspaceWindowsPath: workspace,
    logFilePath: logFile,
  });
  registerIpc(orchestrator, () => mainWindow);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });

  createWindow();
}

// Single-instance lock — a disk writer should never run twice concurrently.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(bootstrap);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
