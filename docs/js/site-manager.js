// site-manager.js — 站点管理：文件夹树、打开/保存/另存/新建页面、图片复制与相对路径
const Site = (() => {
  let tree = null;

  function isUnder(p, root) {
    if (!p || !root) return false;
    const np = p.replace(/\//g, '\\').toLowerCase();
    const nr = root.replace(/\/+$/, '').replace(/\//g, '\\').toLowerCase();
    return np === nr || np.startsWith(nr + '\\');
  }

  /* ---------------- 站点 ---------------- */
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

  /* ---------------- 文件树 ---------------- */
  function renderTree() {
    const box = document.getElementById('file-tree');
    if (!box) return;
    box.innerHTML = '';
    if (!State.siteRoot) {
      box.appendChild(H('div', 'hint', '尚未打开站点文件夹。\n点工具栏“打开站点”。'));
      return;
    }
    if (!tree || !tree.length) {
      box.appendChild(H('div', 'hint', '站点文件夹是空的，点“新建页面”开始。'));
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
      { label: '打开', run: () => openFile(node.path) },
      { label: '重命名…', run: () => renameFile(node) },
      { label: '删除', run: () => deleteFile(node) },
      { label: '在资源管理器中显示', run: () => api.shellShowItem(node.path) },
    ];
    ContextMenu.show(items, x, y);
  }

  /* ---------------- 打开 / 保存 ---------------- */
  async function openFileDialog() {
    const p = await api.openFile();
    if (p) await openFile(p);
  }

  async function openFile(p) {
    const ext = (await api.pathExtname(p)).toLowerCase();
    if (ext === '.css') {
      // css 文件 → 在 CSS 面板中编辑
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
    App.toast('已保存');
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
    App.toast('已保存到 ' + p);
  }

  // 直接写入指定路径（另存/保存/测试共用）
  async function saveToPath(p) {
    const html = Serialize.doc();
    await api.write(p, html);
    CodeView.lastSync = html;
    State.setDirty(false);
  }

  async function newPage() {
    if (!State.siteRoot) {
      App.toast('请先打开站点文件夹');
      return;
    }
    const name = await Dialog.prompt('新建页面', '文件名（不含扩展名）', 'page' + (Date.now() % 100));
    if (!name) return;
    const p = await api.pathJoin(State.siteRoot, name.replace(/\.html?$/i, '') + '.html');
    if (await api.exists(p)) {
      App.toast('文件已存在：' + p);
      return;
    }
    await api.write(p, App.newDocHtml(name));
    await refresh();
    await openFile(p);
  }

  async function renameFile(node) {
    const name = await Dialog.prompt('重命名', '新文件名', node.name);
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
    if (!await Dialog.confirm(`确定删除文件 ${node.name} 吗？此操作不可恢复。`)) return;
    await api.remove(node.path);
    if (State.docPath === node.path) {
      State.docPath = null;
      State.docName = '未命名-1';
      State.emit('file-changed');
    }
    await refresh();
  }

  /* ---------------- 资源复制与相对路径 ---------------- */
  // 复制外部文件进站点（subDir 为空 → 站点根目录），返回复制后的绝对路径
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

  // 当前文档到目标文件的相对路径（HTML 用正斜杠）
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
