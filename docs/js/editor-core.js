// editor-core.js — 设计视图核心：iframe 渲染、点选/高亮、双击编辑、Delete 删除
const Editor = (() => {
  let iframe = null;
  let doc = null;
  let win = null;
  let loaded = false;
  let editing = null;       // { el }
  let hoverEl = null;
  let pendingPath = null;   // 重新渲染后尝试恢复的选中路径
  const scripts = [];       // 页面 <script> 源码备份（设计视图不执行脚本）

  // 双击不可编辑的元素
  const EDIT_BAN = new Set([
    'TABLE', 'TR', 'IMG', 'HR', 'IFRAME', 'VIDEO', 'AUDIO', 'INPUT', 'SELECT',
    'TEXTAREA', 'BUTTON', 'FORM', 'UL', 'OL', 'BODY', 'HTML', 'HEAD', 'STYLE',
    'SCRIPT', 'TITLE', 'LINK', 'META', 'BGSOUND',
  ]);

  // 编辑器注入的样式（导出时会被完全剔除）
  const INJECTED_CSS = [
    '[data-dw-selected]{outline:2px solid #1e6fd9 !important;outline-offset:-1px}',
    '[data-dw-hover]{outline:1px dashed #7aa5e0 !important;outline-offset:-1px}',
    'html{background:transparent}html,body{min-height:100%}',
    'a[name]:empty::before{content:"⚓";color:#c25e00;font-size:13px}',
    'form{outline:1px dashed #d9534f;outline-offset:2px}',
    'script{display:none!important}',
  ].join('\n');

  function init(frame) {
    iframe = frame;
    frame.addEventListener('load', onLoad);
  }

  // 渲染 HTML 源码到设计视图（脚本被抽离成占位，导出时原样放回）
  function render(html) {
    scripts.length = 0;
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    parsed.querySelectorAll('script').forEach((s, i) => {
      scripts.push(s.textContent);
      s.textContent = '';
      s.setAttribute('data-dw-sid', String(i));
    });
    pendingPath = State.selection ? State.selection.path : null;
    loaded = false;
    editing = null;
    hoverEl = null;
    // 网页版：把站点内的相对路径资源（图片/音视频/背景图）换成可直接加载的 URL，
    // 只影响这一次渲染用的副本，原始 DOM 与导出结果不受影响（导出时 Serialize 会还原）
    if (window.DWVFS) window.DWVFS.inlineAssets(parsed);
    iframe.srcdoc = '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML;
  }

  function onLoad() {
    doc = iframe.contentDocument;
    win = iframe.contentWindow;
    loaded = true;
    const st = doc.createElement('style');
    st.id = 'dw-editor-style';
    st.textContent = INJECTED_CSS;
    (doc.head || doc.documentElement).appendChild(st);
    wireEvents();
    editing = null;
    const p = pendingPath;
    pendingPath = null;
    const el = p ? resolve(p) : null;
    if (el) selectEl(el);
    else selectBody();
    State.emit('design-loaded');
  }

  /* ---------------- 事件 ---------------- */
  function wireEvents() {
    doc.addEventListener('click', onCaptureClick, true);
    doc.addEventListener('dblclick', onDblClick, true);
    doc.addEventListener('contextmenu', onCtx, true);
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('mouseover', onOver, true);
    doc.addEventListener('mouseout', onOut, true);
    doc.addEventListener('input', onInput, true);
    doc.addEventListener('submit', e => e.preventDefault(), true);
    doc.addEventListener('focusout', onFocusOut, true);
  }

  function pick(target) {
    if (!target) return doc.body;
    let el = target;
    while (el && el.nodeType !== 1) el = el.parentElement;
    if (!el || el.tagName === 'HTML') return doc.body;
    return el;
  }

  function onCaptureClick(e) {
    e.preventDefault(); // 阻断链接跳转、复选框切换等页面默认行为
    if (editing) return;
    const el = pick(e.target);
    if (!el) return;
    if (e.ctrlKey || e.metaKey) { addToSelection(el); return; }
    selectEl(el);
  }

  function onDblClick(e) {
    e.preventDefault();
    if (editing) return;
    const el = pick(e.target);
    if (!el || el === doc.body || EDIT_BAN.has(el.tagName)) return;
    startEdit(el, e);
  }

  function onCtx(e) {
    e.preventDefault();
    if (editing) return;
    const el = pick(e.target);
    if (el && el !== getSelectedEl()) selectEl(el); // 右键同时选中
    App.showContextMenu(e.clientX, e.clientY);
  }

  function onKey(e) {
    if (editing) {
      if (e.key === 'Enter') {
        // 在列表项里回车 → 新起一个 <li>（Dreamweaver 行为）
        if (editing.el.tagName === 'LI') {
          e.preventDefault();
          const cur = editing.el;
          editing = null;
          cur.removeAttribute('contenteditable');
          const li = DomOps.insertListItemAfter(cur);
          App.afterMutation({ commit: true });
          startEdit(li, null, true);
          return;
        }
        e.preventDefault();
        try { doc.execCommand('insertLineBreak'); } catch {}
      } else if (e.key === 'Escape') {
        e.preventDefault();
        endEdit();
        editing && editing.el && editing.el.blur && editing.el.blur();
      }
      return;
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      e.stopPropagation();
      App.deleteSelection();
      return;
    }
    App.handleShortcutKey(e);
  }

  function onOver(e) {
    if (editing) return;
    const el = pick(e.target);
    if (el && el !== doc.body && el !== hoverEl) {
      if (hoverEl) hoverEl.removeAttribute('data-dw-hover');
      el.setAttribute('data-dw-hover', '');
      hoverEl = el;
    }
  }

  function onOut(e) {
    if (editing) return;
    const el = pick(e.target);
    if (el === hoverEl) {
      el.removeAttribute('data-dw-hover');
      hoverEl = null;
    }
  }

  function onInput(e) {
    // 设计视图内直接打字（contenteditable 编辑 / 直接往输入框里敲）都要同步
    if (editing || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
      App.afterMutation({ commit: false });
    }
  }

  function onFocusOut() {
    if (editing) endEdit();
  }

  /* ---------------- 双击编辑 ---------------- */
  function startEdit(el, e, selectAll) {
    selectEl(el);
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus(); // 先聚焦再挂 editing，避免 focusout 立即结束编辑
    editing = { el };
    try {
      if (!selectAll && e) {
        const pos = doc.caretPositionFromPoint(e.clientX, e.clientY);
        if (pos && pos.offsetNode) {
          const r = doc.createRange();
          r.setStart(pos.offsetNode, pos.offset);
          r.collapse(true);
          const s = win.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        }
      }
    } catch {}
    const isEmpty = !el.textContent.trim() && !el.querySelector('br,img,input,select,textarea');
    if (selectAll || isEmpty) {
      const r = doc.createRange();
      r.selectNodeContents(el);
      const s = win.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
  }

  function endEdit() {
    if (!editing) return;
    const el = editing.el;
    editing = null;
    el.removeAttribute('contenteditable');
    normalizeText(el);
    const isEmpty = !el.hasChildNodes() || (el.textContent.trim() === '' && !el.querySelector('br,img,input,select,textarea'));
    if (isEmpty) el.innerHTML = '&nbsp;';
    selectEl(el);
    App.afterMutation({ commit: true });
  }

  // 把换行文本节点转成 <br>
  function normalizeText(root) {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const bad = [];
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.includes('\n')) bad.push(walker.currentNode);
    }
    for (const t of bad) {
      const parts = t.nodeValue.split('\n');
      const frag = doc.createDocumentFragment();
      parts.forEach((p, i) => {
        if (i) frag.appendChild(doc.createElement('br'));
        if (p) frag.appendChild(doc.createTextNode(p));
      });
      t.parentNode.replaceChild(frag, t);
    }
  }

  /* ---------------- 选中 / 路径 ---------------- */
  function selectEl(el) {
    clearMarks();
    State.selection = { path: pathOf(el), extras: [] };
    markSelection();
    State.emit('selection-changed');
  }

  function addToSelection(el) {
    const sel = State.selection;
    if (!sel) return;
    const primary = resolve(sel.path);
    if (!primary || el === primary) return;
    const bothCells = ['TD', 'TH'].includes(el.tagName) && ['TD', 'TH'].includes(primary.tagName);
    if (!bothCells || el.closest('table') !== primary.closest('table')) return;
    const p = pathOf(el);
    const i = sel.extras.findIndex(x => x.join(',') === p.join(','));
    if (i >= 0) sel.extras.splice(i, 1);
    else sel.extras.push(p);
    markSelection();
    State.emit('selection-changed');
  }

  function markSelection() {
    clearMarks();
    const el = getSelectedEl();
    if (el) el.setAttribute('data-dw-selected', '');
    getExtraEls().forEach(x => x.setAttribute('data-dw-selected', ''));
  }

  function clearMarks() {
    doc.querySelectorAll('[data-dw-selected]').forEach(n => n.removeAttribute('data-dw-selected'));
  }

  function getSelectedEl() {
    return State.selection ? resolve(State.selection.path) : null;
  }

  function getExtraEls() {
    if (!State.selection) return [];
    return State.selection.extras.map(resolve).filter(Boolean);
  }

  // 主选 + 附加选中的单元格（同一表格内）
  function getSelectedCells() {
    const primary = getSelectedEl();
    if (!primary || !['TD', 'TH'].includes(primary.tagName)) return [];
    const out = [primary];
    for (const el of getExtraEls()) {
      if (el.closest('table') === primary.closest('table')) out.push(el);
    }
    return out;
  }

  function selectBody() { selectEl(doc.body); }

  function selectPath(path) {
    const el = resolve(path);
    if (el) selectEl(el);
  }

  // 结构变化后：路径失效则退回 body
  function refreshSelectionSafe() {
    const el = getSelectedEl();
    if (el) selectEl(el);
    else selectBody();
  }

  // 从元素到根的子元素下标链（只数元素子节点，文字编辑不影响）
  function pathOf(el) {
    const path = [];
    let n = el;
    while (n && n !== doc.documentElement) {
      const p = n.parentElement;
      if (!p) break;
      path.unshift(Array.prototype.indexOf.call(p.children, n));
      n = p;
    }
    return path;
  }

  function resolve(path) {
    if (!path || !doc) return null;
    let n = doc.documentElement;
    for (const i of path) {
      n = n.children[i];
      if (!n) return null;
    }
    return n;
  }

  return {
    init, render,
    get doc() { return doc; },
    get win() { return win; },
    get loaded() { return loaded; },
    get scripts() { return scripts; },
    get editing() { return editing; },
    getSelectedEl, getExtraEls, getSelectedCells,
    selectEl, selectBody, selectPath, pathOf, resolve, refreshSelectionSafe,
  };
})();
