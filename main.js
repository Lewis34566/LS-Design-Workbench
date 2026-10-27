// main.js - Electron main process: window, menus, file system and dialog IPC
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

// Disable GPU hardware acceleration: the editor mostly renders static HTML, and software rendering is more stable
// (fixes intermittent renderer crashes on some Windows machines)
app.disableHardwareAcceleration();

// Command-line arguments: --site=<site folder> --file=<page to open> (also used by automated tests)
function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    if (a.startsWith('--site=')) args.site = a.slice(7);
    else if (a.startsWith('--file=')) args.file = a.slice(7);
  }
  return args;
}
const startupArgs = parseArgs(process.argv);

let mainWindow = null;

function send(action) {
  return () => { if (mainWindow) mainWindow.webContents.send('menu:action', action); };
}

const INSERT_MENU = [
  ['Paragraph', 'p'], ['Heading 1', 'h1'], ['Heading 2', 'h2'], ['Heading 3', 'h3'],
  ['Heading 4', 'h4'], ['Heading 5', 'h5'], ['Heading 6', 'h6'],
  ['Line break <br>', 'br'], ['Non-breaking space', 'nbsp'],
  ['Copyright', 'copy'], ['Registered trademark', 'reg'], ['Trademark', 'tm'], ['Yen sign', 'yen'],
  ['Insert date...', 'date'],
  ['Bulleted list', 'ul'], ['Numbered list', 'ol'],
  ['Insert image...', 'img'],
  ['Hyperlink...', 'link'], ['Named anchor...', 'anchor'], ['Email link...', 'mailto'], ['Empty link', 'emptylink'],
  ['Insert table...', 'table'],
  ['Horizontal rule', 'hr'], ['Scrolling text', 'marquee'], ['Video...', 'video'], ['Audio...', 'audio'], ['Background music...', 'bgsound'],
  ['Form', 'form'], ['Text field', 'input-text'], ['Password field', 'input-password'], ['Text area', 'textarea'],
  ['Radio button', 'radio'], ['Checkbox', 'checkbox'], ['Drop-down menu', 'select'], ['Submit button', 'submit'], ['Reset button', 'reset'],
  ['Frame (iframe)...', 'iframe'], ['Navigation bar...', 'navbar'],
];

function buildMenu() {
  const template = [
    {
      label: 'File', submenu: [
        { label: 'New Page', click: send('new') },
        { label: 'Open Page...', click: send('open') },
        { label: 'Open Site Folder...', click: send('open-site') },
        { type: 'separator' },
        { label: 'Save', click: send('save') },
        { label: 'Save As...', click: send('save-as') },
        { type: 'separator' },
        { label: 'Preview in Browser', click: send('preview') },
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
    {
      label: 'Edit', submenu: [
        { label: 'Undo', click: send('undo') },
        { label: 'Redo', click: send('redo') },
        { type: 'separator' },
        { label: 'Delete Element', click: send('delete') },
        { label: 'Move Up', click: send('move-up') },
        { label: 'Move Down', click: send('move-down') },
      ],
    },
    {
      label: 'View', submenu: [
        { label: 'Code View', click: send('mode-code') },
        { label: 'Split View', click: send('mode-split') },
        { label: 'Design View', click: send('mode-design') },
        { type: 'separator' },
        { label: 'Refresh Design View (Apply Code Changes)', click: send('refresh-design') },
      ],
    },
    {
      label: 'Insert', submenu: INSERT_MENU.map(([label, type]) => ({ label, click: send('insert:' + type) })),
    },
    {
      label: 'Help', submenu: [
        { label: 'Open Usage Instructions (README)', click: () => shell.openPath(path.join(__dirname, 'README.md')) },
        { type: 'separator' },
        { label: 'Developer Tools', click: () => mainWindow && mainWindow.webContents.openDevTools() },
        {
          label: "About LS's DW", click: () => dialog.showMessageBox(mainWindow, {
            type: 'info', title: 'About', message: "LS's DW 1.0.0",
            detail: 'Dreamweaver-style visual web page editor\nFor Shanghai college Computer Level 1 DW operation practice\nTech stack: Electron + vanilla HTML/CSS/JS',
            buttons: ['OK'],
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    backgroundColor: '#26282e',
    title: "LS's DW",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('render-process-gone', (e, details) => {
    try {
      fs.writeFileSync(path.join(os.tmpdir(), 'ls-dw-crash.log'), JSON.stringify(details, null, 2));
    } catch {}
  });
  mainWindow.on('close', () => {
    try {
      fs.appendFileSync(path.join(os.tmpdir(), 'ls-dw-close.log'), new Date().toISOString() + ' window close event\n');
    } catch {}
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ---------------- File tree (recursive, skips hidden files and common large directories) ---------------- */
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', 'dist', '.idea', '.vscode']);
async function readTree(root) {
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const nodes = [];
    for (const en of entries) {
      if (en.name.startsWith('.')) continue;
      const p = path.join(dir, en.name);
      if (en.isDirectory()) {
        if (SKIP_DIRS.has(en.name)) continue;
        nodes.push({ name: en.name, path: p, type: 'dir', children: await walk(p) });
      } else if (en.isFile()) {
        nodes.push({ name: en.name, path: p, type: 'file', ext: path.extname(en.name).toLowerCase() });
      }
    }
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'en') : (a.type === 'dir' ? -1 : 1)));
    return nodes;
  }
  try { return await walk(root); } catch { return []; }
}

/* ---------------- IPC ---------------- */
ipcMain.handle('dw:get-startup-args', () => startupArgs);

ipcMain.handle('dialog:open-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { title: 'Select Site Folder', properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:open-file', async (e, filters) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Page',
    filters: filters || [{ name: 'Web Page', extensions: ['html', 'htm'] }],
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:save-file', async (e, defName) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Save As',
    defaultPath: defName,
    filters: [{ name: 'Web Page', extensions: ['html', 'htm'] }],
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:pick-file', async (e, kind) => {
  const map = {
    image: { title: 'Choose Image', filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'] }] },
    audio: { title: 'Choose Audio', filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'mid', 'midi'] }] },
    video: { title: 'Choose Video', filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'avi', 'mov'] }] },
    css: { title: 'Choose Stylesheet', filters: [{ name: 'Stylesheets', extensions: ['css'] }] },
  };
  const cfg = map[kind] || map.image;
  const r = await dialog.showOpenDialog(mainWindow, { title: cfg.title, filters: cfg.filters, properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('fs:read-tree', (e, root) => readTree(root));
ipcMain.handle('fs:read', async (e, p) => fsp.readFile(p, 'utf8'));
ipcMain.handle('fs:write', async (e, p, content) => {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, content, 'utf8');
  return true;
});
ipcMain.handle('fs:mkdir', async (e, p) => { await fsp.mkdir(p, { recursive: true }); return true; });
ipcMain.handle('fs:copy', async (e, src, dest) => { await fsp.copyFile(src, dest); return true; });
ipcMain.handle('fs:exists', (e, p) => fs.existsSync(p));
ipcMain.handle('fs:remove', async (e, p) => { await fsp.rm(p, { recursive: true, force: true }); return true; });
ipcMain.handle('fs:rename', async (e, a, b) => { await fsp.rename(a, b); return true; });
ipcMain.handle('fs:temp-path', () => path.join(os.tmpdir(), `ls-dw-preview-${Date.now()}.html`));

ipcMain.handle('path:join', (e, ...ps) => path.join(...ps));
ipcMain.handle('path:dirname', (e, p) => path.dirname(p));
ipcMain.handle('path:basename', (e, p) => path.basename(p));
ipcMain.handle('path:extname', (e, p) => path.extname(p));
ipcMain.handle('path:relative', (e, from, to) => path.relative(from, to));

ipcMain.handle('shell:open', (e, p) => shell.openPath(p));
ipcMain.handle('shell:show-item', (e, p) => shell.showItemInFolder(p));

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
