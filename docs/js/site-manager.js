// site-manager.js - Site management: folder tree, open/save/save-as/new page, image copying and relative paths
const Site = (() => {
  let tree = null;

  function isUnder(p, root) {
    if (!p || !root) return false;
    const np = p.replace(/\//g, '\\').toLowerCase();
    const nr = root.replace(/\/+$/, '').replace(/\//g, '\\').toLowerCase();
    return np === nr || np.startsWith(nr + '\\');
  }

  /* ---------------- Site ---------------- */
  async function openFolderDialog() {
    const p = await api.openFolder();
    if (p) await openFolder(p);
  }

  async function openFolder(p) {
    State.siteRoot = p;
    await refresh();
    const idx = findIndexFile();
    if (idx && !State.docPath) await openFile(idx.path);
    State.emit('site-changed');
  }

  async function refresh() {
    if (!State.siteRoot) return;
    tree = await api.readTree(State.siteRoot);
    renderTree();
    State.emit('site-changed');
  }

  function findIndexFile(nodes) {
    const list = nodes || tree || [];
    for (const n of list) {
      if (n.type === 'file' && /^index\.html?$/i.test(n.name)) return n;
      if (n.type === 'dir') {
        const r = findIndexFile(n.children);
        if (r) return r;
      }
    }
    return null;
  }

  /* ---------------- File tree ---------------- */
  function renderTree() {
    const box = document.getElementById('file-tree');
    if (!box) return;
    box.innerHTML = '';
    if (!State.siteRoot) {
      box.appendChild(H('div', 'hint', 'No site folder is open.\nClick "Open Site" in the toolbar.'));
      return;
    }
    if (!tree || !tree.length) {
      box.appendChild(H('div', 'hint', 'The site folder is empty. Click "New Page" to start.'));
      return;
    }
    box.appendChild(treeNodes(tree, 0));
  }

  function treeNodes(nodes, depth) {
    const ul = H('ul');
    for (const n of nodes) {
      const li = H('li', 'ft-' + n.type + (n.ext ? ' ext-' + n.ext.slice(1) : ''));
      const name = H('span', 'ft-name', n.name);
      li.appendChild(name);
      if (n.type === 'dir') {
        li.appendChild(treeNodes(n.children, depth + 1));
      } else {
        if (State.docPath === n.path) li.classList.add('current');
        name.addEventListener('click', () => openFile(n.path));
        name.addEventListener('contextmenu', e => {
          e.preventDefault();
          fileMenu(n, e.clientX, e.clientY);
        });
      }
      ul.appendChild(li);
    }
    return ul;
  }

  function fileMenu(node, x, y) {
    const items = [
      { label: 'Open', run: () => openFile(node.path) },
      { label: 'Rename...', run: () => renameFile(node) },
      { label: 'Delete', run: () => deleteFile(node) },
      { label: 'Show in File Explorer', run: () => api.shellShowItem(node.path) },
    ];
    ContextMenu.show(items, x, y);
  }

  /* ---------------- Open / save ---------------- */
  async function openFileDialog() {
    const p = await api.openFile();
    if (p) await openFile(p);
  }

  async function openFile(p) {
    const ext = (await api.pathExtname(p)).toLowerCase();
    if (ext === '.css') {
      // CSS file -> edit in the CSS panel
      const content = await api.read(p);
      CssPanel.setExternal(p, content);
      document.querySelector('[data-tab="css"]') &&
        document.getElementById('tab-btn-css').click();
      return;
    }
    if (State.dirty) {
      const d = await Dialog.confirmSave();
      if (d === 'cancel') return;
      if (d === 'save') await save();
    }
    const html = await api.read(p);
    await App.loadDocument(html, p);
    renderTree();
  }

  async function save() {
    if (!Editor.doc) return;
    if (!State.docPath) return saveAs();
    await saveToPath(State.docPath);
    App.toast('Saved');
  }

  async function saveAs() {
    const def = State.docPath || (State.siteRoot ? await api.pathJoin(State.siteRoot, State.docName) : State.docName);
    const p = await api.saveFile(def);
    if (!p) return;
    await saveToPath(p);
    State.docPath = p;
    State.docName = await api.pathBasename(p);
    if (State.siteRoot && isUnder(p, State.siteRoot)) await refresh();
    State.emit('file-changed');
    renderTree();
    App.toast('Saved to ' + p);
  }

  // Write directly to the given path (shared by save-as/save/tests)
  async function saveToPath(p) {
    const html = Serialize.doc();
    await api.write(p, html);
    CodeView.lastSync = html;
    State.setDirty(false);
  }

  async function newPage() {
    if (!State.siteRoot) {
      App.toast('Open a site folder first');
      return;
    }
    const name = await Dialog.prompt('New Page', 'File name (without extension)', 'page' + (Date.now() % 100));
    if (!name) return;
    const p = await api.pathJoin(State.siteRoot, name.replace(/\.html?$/i, '') + '.html');
    if (await api.exists(p)) {
      App.toast('File already exists: ' + p);
      return;
    }
    await api.write(p, App.newDocHtml(name));
    await refresh();
    await openFile(p);
  }

  async function renameFile(node) {
    const name = await Dialog.prompt('Rename', 'New file name', node.name);
    if (!name || name === node.name) return;
    const np = await api.pathJoin(await api.pathDirname(node.path), name);
    await api.rename(node.path, np);
    if (State.docPath === node.path) {
      State.docPath = np;
      State.docName = name;
      State.emit('file-changed');
    }
    await refresh();
  }

  async function deleteFile(node) {
    if (!await Dialog.confirm(`Delete the file ${node.name}? This cannot be undone.`)) return;
    await api.remove(node.path);
    if (State.docPath === node.path) {
      State.docPath = null;
      State.docName = 'Untitled-1';
      State.emit('file-changed');
    }
    await refresh();
  }

  /* ---------------- Asset copying and relative paths ---------------- */
  // Copy an external file into the site (empty subDir -> site root); returns the absolute path after copying
  async function copyInto(subDir, absPath) {
    if (!State.siteRoot || isUnder(absPath, State.siteRoot)) return absPath;
    const dir = subDir ? await ensureDir(await api.pathJoin(State.siteRoot, subDir)) : State.siteRoot;
    const base = await api.pathBasename(absPath);
    const ext = await api.pathExtname(base);
    const stem = base.slice(0, base.length - ext.length);
    let name = base, i = 1;
    while (await api.exists(await api.pathJoin(dir, name))) {
      name = stem + '_' + (i++) + ext;
    }
    const dest = await api.pathJoin(dir, name);
    await api.copy(absPath, dest);
    return dest;
  }

  async function ensureDir(p) {
    await api.mkdir(p);
    return p;
  }

  // Relative path from the current document to the target file (forward slashes in HTML)
  async function docRelative(absPath) {
    let rel;
    if (State.docPath) rel = await api.pathRelative(await api.pathDirname(State.docPath), absPath);
    else if (State.siteRoot) rel = await api.pathRelative(State.siteRoot, absPath);
    else rel = absPath;
    return rel.replace(/\\/g, '/');
  }

  return {
    get tree() { return tree; },
    isUnder, openFolderDialog, openFolder, refresh, renderTree,
    openFileDialog, openFile, save, saveAs, saveToPath,
    newPage, renameFile, deleteFile,
    copyInto, docRelative,
  };
})();
