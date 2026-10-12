// main.js — Electron 主进程：窗口、菜单、文件系统与对话框 IPC
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

// 禁用 GPU 硬件加速：编辑器以静态 HTML 为主，软渲染更稳
// （修复部分 Windows 机器上渲染进程间歇性崩溃的问题）
app.disableHardwareAcceleration();

// 命令行参数：--site=<站点文件夹> --file=<要打开的网页>（也用于自动化测试）
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
  ['段落', 'p'], ['标题 1', 'h1'], ['标题 2', 'h2'], ['标题 3', 'h3'],
  ['标题 4', 'h4'], ['标题 5', 'h5'], ['标题 6', 'h6'],
  ['换行 <br>', 'br'], ['空格 &nbsp;', 'nbsp'],
  ['© 版权', 'copy'], ['® 注册商标', 'reg'], ['™ 商标', 'tm'], ['¥ 人民币', 'yen'],
  ['插入日期…', 'date'],
  ['项目列表', 'ul'], ['编号列表', 'ol'],
  ['插入图片…', 'img'],
  ['超链接…', 'link'], ['命名锚记…', 'anchor'], ['邮件链接…', 'mailto'], ['空链接', 'emptylink'],
  ['插入表格…', 'table'],
  ['水平线', 'hr'], ['滚动文字', 'marquee'], ['视频…', 'video'], ['音频…', 'audio'], ['背景音乐…', 'bgsound'],
  ['表单', 'form'], ['文本框', 'input-text'], ['密码框', 'input-password'], ['文本区域', 'textarea'],
  ['单选按钮', 'radio'], ['复选框', 'checkbox'], ['下拉菜单', 'select'], ['提交按钮', 'submit'], ['重置按钮', 'reset'],
  ['框架 iframe…', 'iframe'], ['导航条…', 'navbar'],
];

function buildMenu() {
  const template = [
    {
      label: '文件', submenu: [
        { label: '新建页面', click: send('new') },
        { label: '打开网页…', click: send('open') },
        { label: '打开站点文件夹…', click: send('open-site') },
        { type: 'separator' },
        { label: '保存', click: send('save') },
        { label: '另存为…', click: send('save-as') },
        { type: 'separator' },
        { label: '在浏览器中预览', click: send('preview') },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑', submenu: [
        { label: '撤销', click: send('undo') },
        { label: '重做', click: send('redo') },
        { type: 'separator' },
        { label: '删除元素', click: send('delete') },
        { label: '上移', click: send('move-up') },
        { label: '下移', click: send('move-down') },
      ],
    },
    {
      label: '视图', submenu: [
        { label: '代码视图', click: send('mode-code') },
        { label: '拆分视图', click: send('mode-split') },
        { label: '设计视图', click: send('mode-design') },
        { type: 'separator' },
        { label: '刷新设计视图（应用代码修改）', click: send('refresh-design') },
      ],
    },
    {
      label: '插入', submenu: INSERT_MENU.map(([label, type]) => ({ label, click: send('insert:' + type) })),
    },
    {
      label: '帮助', submenu: [
        { label: '打开使用说明 (README)', click: () => shell.openPath(path.join(__dirname, 'README.md')) },
        { type: 'separator' },
        { label: '开发者工具', click: () => mainWindow && mainWindow.webContents.openDevTools() },
        {
          label: '关于 LS的DW', click: () => dialog.showMessageBox(mainWindow, {
            type: 'info', title: '关于', message: 'LS的DW 1.0.0',
            detail: '类 Dreamweaver 网页可视化编辑器\n用于上海高校计算机一级 DW 操作练习\n技术栈：Electron + 原生 HTML/CSS/JS',
            buttons: ['好'],
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
    title: 'LS的DW',
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

/* ---------------- 文件树（递归，过滤隐藏文件与常见大目录） ---------------- */
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
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'zh') : (a.type === 'dir' ? -1 : 1)));
    return nodes;
  }
  try { return await walk(root); } catch { return []; }
}

/* ---------------- IPC ---------------- */
ipcMain.handle('dw:get-startup-args', () => startupArgs);

ipcMain.handle('dialog:open-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { title: '选择站点文件夹', properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:open-file', async (e, filters) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: '打开网页',
    filters: filters || [{ name: '网页', extensions: ['html', 'htm'] }],
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:save-file', async (e, defName) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: '另存为',
    defaultPath: defName,
    filters: [{ name: '网页', extensions: ['html', 'htm'] }],
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:pick-file', async (e, kind) => {
  const map = {
    image: { title: '选择图片', filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'] }] },
    audio: { title: '选择音频', filters: [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'mid', 'midi'] }] },
    video: { title: '选择视频', filters: [{ name: '视频', extensions: ['mp4', 'webm', 'ogg', 'avi', 'mov'] }] },
    css: { title: '选择样式表', filters: [{ name: '样式表', extensions: ['css'] }] },
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
