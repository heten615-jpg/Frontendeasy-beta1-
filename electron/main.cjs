'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('node:fs/promises');

const isDev = !app.isPackaged;

// Per-folder cache of files Frontendeasy wrote on the previous sync, so stale files
// (e.g. a frame that was renamed) can be removed on the next write cycle.
const lastWrittenByFolder = new Map();

function lastFolderPath() {
  return path.join(app.getPath('userData'), 'frontendeasy-last-folder.json');
}

async function readLastFolderPath() {
  try {
    const raw = await fs.readFile(lastFolderPath(), 'utf8');
    const data = JSON.parse(raw);
    if (typeof data?.folderPath === 'string') return data.folderPath;
  } catch {
    /* ignore — no record yet */
  }
  return null;
}

async function persistLastFolderPath(folderPath) {
  try {
    await fs.writeFile(lastFolderPath(), JSON.stringify({ folderPath }), 'utf8');
  } catch {
    /* best-effort — don't crash the app on persistence failure */
  }
}

function safeFilename(name) {
  // Block path traversal and slashes — writes must stay inside the chosen folder.
  // Whitelisted extensions: .html / .htm (frames + orphans), .xml (sitemap),
  // .txt (robots), and PWA export files (.json / .js / .svg).
  return typeof name === 'string'
    && !name.includes('/') && !name.includes('\\') && !name.startsWith('.')
    && /\.(html?|xml|txt|json|js|svg)$/i.test(name);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: 'Frontendeasy',
    show: false,
    backgroundColor: '#111113',
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  ipcMain.handle('frontendeasy:pickFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folderPath = result.filePaths[0];
    await persistLastFolderPath(folderPath);
    return { folderPath, name: path.basename(folderPath) };
  });

  ipcMain.handle('frontendeasy:getLastFolder', async () => {
    const folderPath = await readLastFolderPath();
    if (!folderPath) return null;
    try {
      const stat = await fs.stat(folderPath);
      if (!stat.isDirectory()) return null;
    } catch {
      return null;
    }
    return { folderPath, name: path.basename(folderPath) };
  });

  ipcMain.handle('frontendeasy:writeFiles', async (_event, payload) => {
    const { folderPath, files } = payload ?? {};
    if (typeof folderPath !== 'string' || !Array.isArray(files)) {
      return { ok: false, error: 'invalid payload' };
    }
    try {
      await fs.mkdir(folderPath, { recursive: true });
      const expected = new Set();
      for (const f of files) {
        if (!safeFilename(f?.name) || typeof f?.contents !== 'string') {
          return { ok: false, error: `unsafe filename: ${f?.name}` };
        }
        expected.add(f.name);
        await fs.writeFile(path.join(folderPath, f.name), f.contents, 'utf8');
      }
      const prev = lastWrittenByFolder.get(folderPath) ?? new Set();
      for (const name of prev) {
        if (!expected.has(name)) {
          try { await fs.unlink(path.join(folderPath, name)); } catch { /* already gone */ }
        }
      }
      lastWrittenByFolder.set(folderPath, expected);
      await persistLastFolderPath(folderPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
