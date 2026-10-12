// app.js — 总装配：启动、视图模式、设计↔代码双向同步、快捷键、撤销/重做、右键菜单、状态栏
const App = (() => {
  let toastTimer = null;

  function newDocHtml(title = '无标题文档') {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
</head>
<body>

</body>
</html>`;
  }

  /* ---------------- 文档加载 / 保存 ---------------- */
  async function loadDocument(html, path) {
    State.selection = null;
    State.docPath = path || null;
    State.docName = path ? await api.pathBasename(path) : `未命名-${++State.untitledSeq}`;
    CodeView.setValue(html);
    Editor.render(html);
    Undo.reset(html);
    State.setDirty(false);
    CssPanel.refresh();
    Site.renderTree();
    State.emit('file-changed');
  }

  async function newDocument() {
    if (State.dirty) {
      const d = await Dialog.confirmSave();
      if (d === 'cancel') return;
      if (d === 'save') await Site.save();
    }
    await loadDocument(newDocHtml(), null);
  }

  // 当前文档的干净序列化（撤销栈、导出共用）
  function currentHtml() {
    return Serialize.doc();
  }

  // 每次 DOM 修改后的统一出口：同步代码视图 + 标记脏 + 入撤销栈
  function afterMutation({ commit = false } = {}) {
    if (!Editor.doc) return;
    const html = Serialize.doc();
    CodeView.setValue(html);
    State.setDirty(true);
    if (commit) Undo.commit(html);
    else Undo.debounce();
    updateStatus();
  }

  // 结构操作包装：执行 → 提交快照 → 重新选中
  function applyDom(fn) {
    const r = fn();
    afterMutation({ commit: true });
    if (r && r.nodeType === 1) Editor.selectEl(r);
    else Editor.refreshSelectionSafe();
    return r;
  }

  /* ---------------- 撤销 / 重做 ---------------- */
  function undo() {
    const html = Undo.undo();
    if (html != null) loadSnapshot(html);
  }
  function redo() {
    const html = Undo.redo();
    if (html != null) loadSnapshot(html);
  }
  function loadSnapshot(html) {
    CodeView.setValue(html);
    Editor.render(html);
    State.setDirty(true);
  }

  /* ---------------- 删除 / 右键菜单 ---------------- */
  function deleteSelection() {
    const el = Editor.getSelectedEl();
    if (!el || el === Editor.doc.body) return;
    if (el.tagName === 'TD' || el.tagName === 'TH') {
      el.innerHTML = '&nbsp;';
      afterMutation({ commit: true });
      return;
    }
    const r = DomOps.deleteEl(el);
    applyDom(() => r);
  }

  function showContextMenu(x, y) {
    const doc = Editor.doc;
    const el = Editor.getSelectedEl();
    const items = [];
    if (el && el !== doc.body) {
      items.push({ label: '删除元素', run: () => deleteSelection() });
    }
    if (el && el.tagName === 'IMG') {
      items.push({ label: '替换图片…', run: () => Insert.replaceImage() });
    }
    if (el && DomOps.isTextContainer(el) && !['A', 'IMG', 'BODY'].includes(el.tagName)) {
      items.push({ label: '设为超链接…', run: () => Insert.linkDialog() });
    }
    if (el && el.tagName === 'A' && el.getAttribute('name') == null) {
      items.push(
        { label: '编辑链接…', run: () => Insert.linkDialog() },
        { label: '删除链接（保留内容）', run: () => applyDom(() => DomOps.unwrapLink(el)) },
      );
    }
    const table = el && el.closest('table');
    if (table) {
      const cell = el.closest('td,th');
      const refRow = cell ? cell.parentElement : (el.tagName === 'TR' ? el : table.rows[0]);
      const refCell = cell || table.rows[0].cells[0];
      items.push({
        label: '表格', sub: [
          { label: '上方插入行', run: () => applyDom(() => DomOps.insertRow(table, refRow, true)) },
          { label: '下方插入行', run: () => applyDom(() => DomOps.insertRow(table, refRow, false)) },
          { label: '左侧插入列', run: () => applyDom(() => DomOps.insertCol(table, refCell, true)) },
          { label: '右侧插入列', run: () => applyDom(() => DomOps.insertCol(table, refCell, false)) },
          '-',
          { label: '删除当前行', run: () => applyDom(() => DomOps.deleteRow(table, refRow)) },
          { label: '删除当前列', run: () => applyDom(() => DomOps.deleteCol(table, refCell)) },
          '-',
          { label: `合并单元格（已选 ${Editor.getExtraEls().length + 1} 个）`, disabled: !(cell && Editor.getExtraEls().length), run: () => applyDom(() => DomOps.mergeCells(table, Editor.getSelectedCells()) || table) },
          { label: '拆分单元格…', disabled: !cell, run: () => Insert.splitCellDialog(cell) },
        ],
      });
    }
    if (el && el !== doc.body && el.parentElement) {
      items.push('-');
      items.push({ label: '上移', run: () => applyDom(() => DomOps.moveEl(el, 'up')) });
      items.push({ label: '下移', run: () => applyDom(() => DomOps.moveEl(el, 'down')) });
    }
    ContextMenu.show(items, x, y);
  }

  /* ---------------- 视图模式与双向同步 ---------------- */
  function setMode(m) {
    if (m !== State.mode) {
      if ((m === 'design' || m === 'split') && CodeView.hasPendingChanges()) {
        applyCodeToDesign();
      }
      State.mode = m;
    }
    document.body.dataset.mode = m;
    document.querySelectorAll('.seg button[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    updateStatus();
  }

  // 代码 → 设计：把代码视图内容渲染进设计视图（脚本抽离不执行）
  function applyCodeToDesign() {
    if (!CodeView.hasPendingChanges()) return;
    const html = CodeView.getValue();
    if (!html.trim()) return;
    State.selection = null;
    CodeView.clearPendingUI();
    CodeView.lastSync = html;
    Editor.render(html);
    Undo.commit(html);
    State.setDirty(true);
    updateStatus();
  }

  /* ---------------- 快捷键 ---------------- */
  function handleShortcutKey(e) {
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'z') {
      if (CodeView.focused()) return; // 代码视图内用原生撤销
      e.preventDefault();
      undo();
    } else if (ctrl && k === 'y') {
      if (CodeView.focused()) return;
      e.preventDefault();
      redo();
    } else if (ctrl && e.shiftKey && k === 's') {
      e.preventDefault();
      Site.saveAs();
    } else if (ctrl && k === 's') {
      e.preventDefault();
      Site.save();
    } else if (ctrl && k === 'n') {
      e.preventDefault();
      newDocument();
    } else if (ctrl && k === 'o') {
      e.preventDefault();
      Site.openFileDialog();
    } else if (e.key === 'F5') {
      e.preventDefault();
      applyCodeToDesign();
    } else if (e.key === 'Tab' && CodeView.focused()) {
      e.preventDefault();
      CodeView.insertText('  ');
    }
  }

  /* ---------------- 预览 ---------------- */
  async function preview() {
    const html = Serialize.doc();
    if (!State.docPath) {
      const tmp = await api.tempPath();
      await api.write(tmp, html);
      await api.shellOpen(tmp);
      toast('已在浏览器打开预览（临时文件）');
      return;
    }
    if (State.dirty) {
      const p = await api.pathJoin(await api.pathDirname(State.docPath), '.dw-preview.html');
      await api.write(p, html);
      await api.shellOpen(p);
      toast('已在浏览器打开预览');
    } else {
      await api.shellOpen(State.docPath);
    }
  }

  /* ---------------- 菜单事件 ---------------- */
  function bindMenu() {
    api.onMenu(type => {
      if (type.startsWith('insert:')) { Insert.run(type.slice(7)); return; }
      switch (type) {
        case 'new': newDocument(); break;
        case 'open': Site.openFileDialog(); break;
        case 'open-site': Site.openFolderDialog(); break;
        case 'save': Site.save(); break;
        case 'save-as': Site.saveAs(); break;
        case 'preview': preview(); break;
        case 'undo': undo(); break;
        case 'redo': redo(); break;
        case 'delete': deleteSelection(); break;
        case 'move-up': applyDom(() => DomOps.moveEl(Editor.getSelectedEl(), 'up')); break;
        case 'move-down': applyDom(() => DomOps.moveEl(Editor.getSelectedEl(), 'down')); break;
        case 'mode-code': setMode('code'); break;
        case 'mode-split': setMode('split'); break;
        case 'mode-design': setMode('design'); break;
        case 'refresh-design': applyCodeToDesign(); break;
      }
    });
  }

  /* ---------------- 状态栏 ---------------- */
  function breadcrumbHtml(el) {
    if (!el || !Editor.doc) return '未选中';
    const chain = [];
    let n = el;
    while (n && n !== Editor.doc.documentElement) {
      chain.unshift(n);
      n = n.parentElement;
    }
    return chain.map(c => {
      const tag = c.tagName.toLowerCase();
      const id = c.id ? `#${c.id}` : '';
      const cls = c.classList.length ? `.${c.classList[0]}` : '';
      return `<span class="crumb" data-path="${Editor.pathOf(c).join('-')}">${tag}${id}${cls}</span>`;
    }).join(' &gt; ');
  }

  function updateStatus() {
    const el = Editor.getSelectedEl();
    const crumb = document.getElementById('crumb');
    crumb.innerHTML = breadcrumbHtml(el);
    crumb.querySelectorAll('.crumb').forEach(sp => {
      sp.addEventListener('click', () => Editor.selectPath(sp.dataset.path.split('-').map(Number)));
    });
    document.getElementById('st-dims').textContent = el && el !== Editor.doc.body ? `${el.offsetWidth}×${el.offsetHeight}` : '';
    document.getElementById('st-mode').textContent = { design: '设计', split: '拆分', code: '代码' }[State.mode] || '';
    document.getElementById('dirty-dot').classList.toggle('hidden', !State.dirty);
    document.getElementById('doc-name').textContent = State.docName + (State.dirty ? ' *' : '');
    document.title = `${State.docName}${State.dirty ? ' *' : ''} - LS的DW`;
    document.getElementById('btn-undo').disabled = !Undo.canUndo();
    document.getElementById('btn-redo').disabled = !Undo.canRedo();
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------------- 工具栏 / 标签页 ---------------- */
  function bindToolbar() {
    document.getElementById('btn-new').addEventListener('click', newDocument);
    document.getElementById('btn-open').addEventListener('click', () => Site.openFileDialog());
    document.getElementById('btn-open-site').addEventListener('click', () => Site.openFolderDialog());
    document.getElementById('btn-save').addEventListener('click', () => Site.save());
    document.getElementById('btn-saveas').addEventListener('click', () => Site.saveAs());
    document.getElementById('btn-preview').addEventListener('click', preview);
    document.getElementById('btn-refresh').addEventListener('click', applyCodeToDesign);
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-new-page').addEventListener('click', () => Site.newPage());
    document.querySelectorAll('.seg button[data-mode]').forEach(b => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
    });
    document.querySelectorAll('.tabs button[data-tab]').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.tabs button[data-tab]').forEach(x => x.classList.toggle('on', x === b));
        document.querySelectorAll('.tabpane').forEach(p => p.classList.add('hidden'));
        document.getElementById('tab-' + b.dataset.tab).classList.remove('hidden');
        if (b.dataset.tab === 'css' && !CssPanel.external) CssPanel.refresh();
        if (b.dataset.tab === 'files') Site.renderTree();
      });
    });
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    Editor.init(document.getElementById('design-frame'));
    CodeView.init();
    Properties.init(document.getElementById('props'));
    Insert.init();
    CssPanel.init();
    bindToolbar();
    bindMenu();
    window.addEventListener('keydown', e => handleShortcutKey(e));
    window.addEventListener('error', e => console.error('[renderer]', e.message));
    State.on('selection-changed', () => {
      setTimeout(() => { Properties.rebuild(); updateStatus(); }, 0);
    });
    State.on('dirty-changed', updateStatus);
    State.on('file-changed', updateStatus);
    State.on('design-loaded', () => {
      CssPanel.refresh();
      updateStatus();
    });

    const args = await api.getStartupArgs();
    if (args.site) await Site.openFolder(args.site);
    if (args.file && await api.exists(args.file)) await Site.openFile(args.file);
    else await newDocument();

    document.body.classList.add('dw-ready');
    updateStatus();
  }

  return {
    boot, newDocument, loadDocument, currentHtml, afterMutation, applyDom,
    undo, redo, deleteSelection, showContextMenu,
    setMode, applyCodeToDesign, handleShortcutKey, preview, toast, newDocHtml, updateStatus,
  };
})();

// 暴露给自动化测试与调试
window.DW = {
  code: CodeView, editor: Editor, domops: DomOps, insert: Insert,
  site: Site, undo: Undo, app: App, state: State, serialize: Serialize,
  props: Properties, css: CssPanel,
};

// 调试用：谁关闭窗口一目了然
const __origClose = window.close.bind(window);
window.close = function () {
  console.error('[window.close 调用]', new Error().stack);
  return __origClose();
};

App.boot();
