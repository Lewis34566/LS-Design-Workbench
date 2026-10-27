// preload.js - Renderer security bridge (contextIsolation enabled, exposes only whitelisted APIs)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dwAPI', {
  getStartupArgs: () => ipcRenderer.invoke('dw:get-startup-args'),
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  openFile: (filters) => ipcRenderer.invoke('dialog:open-file', filters),
  saveFile: (def) => ipcRenderer.invoke('dialog:save-file', def),
  pickFile: (kind) => ipcRenderer.invoke('dialog:pick-file', kind),
  readTree: (root) => ipcRenderer.invoke('fs:read-tree', root),
  read: (p) => ipcRenderer.invoke('fs:read', p),
  write: (p, c) => ipcRenderer.invoke('fs:write', p, c),
  mkdir: (p) => ipcRenderer.invoke('fs:mkdir', p),
  copy: (a, b) => ipcRenderer.invoke('fs:copy', a, b),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),
  remove: (p) => ipcRenderer.invoke('fs:remove', p),
  rename: (a, b) => ipcRenderer.invoke('fs:rename', a, b),
  tempPath: () => ipcRenderer.invoke('fs:temp-path'),
  pathJoin: (...ps) => ipcRenderer.invoke('path:join', ...ps),
  pathDirname: (p) => ipcRenderer.invoke('path:dirname', p),
  pathBasename: (p) => ipcRenderer.invoke('path:basename', p),
  pathExtname: (p) => ipcRenderer.invoke('path:extname', p),
  pathRelative: (a, b) => ipcRenderer.invoke('path:relative', a, b),
  shellOpen: (p) => ipcRenderer.invoke('shell:open', p),
  shellShowItem: (p) => ipcRenderer.invoke('shell:show-item', p),
  onMenu: (cb) => ipcRenderer.on('menu:action', (e, type) => cb(type)),
});
