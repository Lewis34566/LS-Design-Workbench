// app.js - Assembly: startup, view modes, design <-> code sync, shortcuts, undo/redo, context menu, status bar
const App = (() => {
  let toastTimer = null;

  function newDocHtml(title = 'Untitled Document') {
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

  /* ---------------- Document load / save ---------------- */
  async function loadDocument(html, path) {
    State.selection = null;
    State.docPath = path || null;
    State.docName = path ? await api.pathBasename(path) : `Untitled-${++State.untitledSeq}`;
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

  // Clean serialization of the current document (shared by the undo stack and export)
  function currentHtml() {
    return Serialize.doc();
  }

  // Single exit point after every DOM mutation: sync the code view + mark dirty + push to undo stack
  function afterMutation({ commit = false } = {}) {
    if (!Editor.doc) return;
    const html = Serialize.doc();
    CodeView.setValue(html);
    State.setDirty(true);
    if (commit) Undo.commit(html);
    else Undo.debounce();
    updateStatus();
  }

  // Structural operation wrapper: execute -> commit snapshot -> reselect
  function applyDom(fn) {
    const r = fn();
    afterMutation({ commit: true });
    if (r && r.nodeType === 1) Editor.selectEl(r);
    else Editor.refreshSelectionSafe();
    return r;
  }

  /* ---------------- Undo / redo ---------------- */
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

  /* ---------------- Delete / context menu ---------------- */
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
      items.push({ label: 'Delete element', run: () => deleteSelection() });
    }
    if (el && el.tagName === 'IMG') {
      items.push({ label: 'Replace image...', run: () => Insert.replaceImage() });
    }
    if (el && DomOps.isTextContainer(el) && !['A', 'IMG', 'BODY'].includes(el.tagName)) {
      items.push({ label: 'Make hyperlink...', run: () => Insert.linkDialog() });
    }
    if (el && el.tagName === 'A' && el.getAttribute('name') == null) {
      items.push(
        { label: 'Edit link...', run: () => Insert.linkDialog() },
        { label: 'Remove link (keep content)', run: () => applyDom(() => DomOps.unwrapLink(el)) },
      );
    }
    const table = el && el.closest('table');
    if (table) {
      const cell = el.closest('td,th');
      const refRow = cell ? cell.parentElement : (el.tagName === 'TR' ? el : table.rows[0]);
      const refCell = cell || table.rows[0].cells[0];
      items.push({
        label: 'Table', sub: [
          { label: 'Insert row above', run: () => applyDom(() => DomOps.insertRow(table, refRow, true)) },
          { label: 'Insert row below', run: () => applyDom(() => DomOps.insertRow(table, refRow, false)) },
          { label: 'Insert column left', run: () => applyDom(() => DomOps.insertCol(table, refCell, true)) },
          { label: 'Insert column right', run: () => applyDom(() => DomOps.insertCol(table, refCell, false)) },
          '-',
          { label: 'Delete current row', run: () => applyDom(() => DomOps.deleteRow(table, refRow)) },
          { label: 'Delete current column', run: () => applyDom(() => DomOps.deleteCol(table, refCell)) },
          '-',
          { label: `Merge cells (${Editor.getExtraEls().length + 1} selected)`, disabled: !(cell && Editor.getExtraEls().length), run: () => applyDom(() => DomOps.mergeCells(table, Editor.getSelectedCells()) || table) },
          { label: 'Split cell...', disabled: !cell, run: () => Insert.splitCellDialog(cell) },
        ],
      });
    }
    if (el && el !== doc.body && el.parentElement) {
      items.push('-');
      items.push({ label: 'Move up', run: () => applyDom(() => DomOps.moveEl(el, 'up')) });
      items.push({ label: 'Move down', run: () => applyDom(() => DomOps.moveEl(el, 'down')) });
    }
    ContextMenu.show(items, x, y);
  }

  /* ---------------- View modes and two-way sync ---------------- */
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

  // Code -> design: render the code view content into the design view (scripts are extracted, not executed)
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

  /* ---------------- Shortcuts ---------------- */
  function handleShortcutKey(e) {
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'z') {
      if (CodeView.focused()) return; // Native undo inside the code view
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

  /* ---------------- Preview ---------------- */
  async function preview() {
    const html = Serialize.doc();
    if (!State.docPath) {
      const tmp = await api.tempPath();
      await api.write(tmp, html);
      await api.shellOpen(tmp);
      toast('Opened preview in the browser (temporary file)');
      return;
    }
    if (State.dirty) {
      const p = await api.pathJoin(await api.pathDirname(State.docPath), '.dw-preview.html');
      await api.write(p, html);
      await api.shellOpen(p);
      toast('Opened preview in the browser');
    } else {
      await api.shellOpen(State.docPath);
    }
  }

  /* ---------------- Menu events ---------------- */
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

  /* ---------------- Status bar ---------------- */
  function breadcrumbHtml(el) {
    if (!el || !Editor.doc) return 'Nothing selected';
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
    document.getElementById('st-dims').textContent = el && el !== Editor.doc.body ? `${el.offsetWidth}x${el.offsetHeight}` : '';
    document.getElementById('st-mode').textContent = { design: 'Design', split: 'Split', code: 'Code' }[State.mode] || '';
    document.getElementById('dirty-dot').classList.toggle('hidden', !State.dirty);
    document.getElementById('doc-name').textContent = State.docName + (State.dirty ? ' *' : '');
    document.title = `${State.docName}${State.dirty ? ' *' : ''} - LS's DW`;
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

  /* ---------------- Toolbar / tabs ---------------- */
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

  /* ---------------- Startup ---------------- */
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

// Exposed for automated tests and debugging
window.DW = {
  code: CodeView, editor: Editor, domops: DomOps, insert: Insert,
  site: Site, undo: Undo, app: App, state: State, serialize: Serialize,
  props: Properties, css: CssPanel,
};

// Debug helper: makes it obvious who closes the window
const __origClose = window.close.bind(window);
window.close = function () {
  console.error('[window.close called]', new Error().stack);
  return __origClose();
};

App.boot();
