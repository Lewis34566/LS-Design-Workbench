// dom-ops.js - Design view DOM operations: inserting elements, text formatting, table rows/columns (colspan/rowspan grid algorithm), links
const DomOps = (() => {
  const D = () => Editor.doc;

  const BLOCK_CONTAINERS = ['BODY', 'DIV', 'TD', 'TH', 'LI', 'BLOCKQUOTE', 'CENTER', 'FORM', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'MAIN', 'FIGURE', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DD', 'DT'];
  const INLINE_TAGS = new Set(['A', 'FONT', 'B', 'I', 'U', 'STRONG', 'EM', 'SPAN', 'BR', 'IMG', 'SUB', 'SUP', 'SMALL', 'BIG', 'LABEL', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);
  const TEXT_CONTAINERS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'LI', 'DIV', 'SPAN', 'A', 'FONT', 'B', 'I', 'U', 'STRONG', 'EM', 'LABEL', 'BLOCKQUOTE', 'CENTER', 'MARQUEE', 'CAPTION', 'DD', 'DT', 'ADDRESS'];
  const ALIGN_ATTR_TAGS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'TD', 'TH', 'TR', 'TABLE', 'HR', 'IMG', 'IFRAME', 'MARQUEE', 'CENTER', 'CAPTION'];
  const SIZE_PX = { 1: '10px', 2: '13px', 3: '16px', 4: '18px', 5: '24px', 6: '32px', 7: '48px' };

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const isTextContainer = el => el && TEXT_CONTAINERS.includes(el.tagName);
  const isInlineContent = el => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) continue;
      if (n.nodeType === 1 && INLINE_TAGS.has(n.tagName)) continue;
      return false;
    }
    return true;
  };

  /* ================= Placement and insertion ================= */
  // Place an element: block-level elements go into the nearest block container; inline elements go into/after a text container
  function place(el, { block = false } = {}) {
    const sel = Editor.getSelectedEl();
    if (block) {
      const host = targetContainer(sel);
      if (host) { host.appendChild(el); return el; }
      if (sel && sel.parentElement) { sel.after(el); return el; }
      D().body.appendChild(el);
      return el;
    }
    if (sel && isTextContainer(sel)) { sel.appendChild(el); return el; }
    if (sel && sel !== D().body) {
      const p = sel.parentElement;
      if (p && isTextContainer(p)) { sel.after(el); return el; }
    }
    D().body.appendChild(el);
    return el;
  }

  function targetContainer(sel) {
    if (sel && BLOCK_CONTAINERS.includes(sel.tagName)) return sel;
    let host = sel ? sel.parentElement : null;
    while (host && !BLOCK_CONTAINERS.includes(host.tagName)) host = host.parentElement;
    return host;
  }

  function insertHtml(html, opts) {
    const t = D().createElement('div');
    t.innerHTML = html;
    const el = t.firstElementChild;
    place(el, opts);
    return el;
  }

  function insertBlock(tag, { text = '', html = '' } = {}) {
    const el = D().createElement(tag);
    if (html) el.innerHTML = html;
    else if (text) el.textContent = text;
    if (!el.hasChildNodes() && tag !== 'HR' && tag !== 'BR') el.innerHTML = '&nbsp;';
    place(el, { block: true });
    return el;
  }

  function insertInlineNode(node) {
    place(node);
    return node;
  }
  const insertBr = () => insertInlineNode(D().createElement('br'));
  const insertNbsp = () => insertInlineNode(D().createTextNode(String.fromCharCode(160)));
  const insertChar = ch => insertInlineNode(D().createTextNode(ch));
  const insertDateText = str => insertInlineNode(D().createTextNode(str));

  function insertList(type) {
    return insertBlock(type, { html: '<li>&nbsp;</li>' });
  }
  function insertListItemAfter(li) {
    const n = D().createElement('li');
    n.innerHTML = '&nbsp;';
    li.after(n);
    return n;
  }
  const insertHr = () => insertBlock('hr');
  const insertMarquee = () => insertBlock('marquee', { text: 'Scrolling text' });

  function insertTable({ rows = 3, cols = 3, width = '', border = '1', cellpadding = '2', cellspacing = '0' } = {}) {
    let h = '<table';
    if (width) h += ` width="${esc(width)}"`;
    if (border != null && border !== '') h += ` border="${esc(border)}"`;
    if (cellpadding) h += ` cellpadding="${esc(cellpadding)}"`;
    if (cellspacing) h += ` cellspacing="${esc(cellspacing)}"`;
    h += '>';
    for (let i = 0; i < rows; i++) h += '<tr>' + '<td>&nbsp;</td>'.repeat(cols) + '</tr>';
    h += '</table>';
    return insertHtml(h, { block: true });
  }

  function insertImage({ src, alt = '', width = '', height = '' }) {
    return insertHtml(
      `<img src="${esc(src)}" alt="${esc(alt)}"` +
      `${width ? ` width="${esc(width)}"` : ''}${height ? ` height="${esc(height)}"` : ''}>`
    );
  }

  function insertForm() {
    return insertHtml('<form action="" method="post">&nbsp;</form>', { block: true });
  }

  function insertInput(type) {
    const defs = { submit: 'Submit', reset: 'Reset', button: 'Button' };
    let attrs = `type="${type}" name=""`;
    if (defs[type]) attrs += ` value="${defs[type]}"`;
    if (type === 'text' || type === 'password') attrs += ' size="20"';
    return insertHtml(`<input ${attrs}>`);
  }
  const insertTextarea = () => insertHtml('<textarea name="" rows="4" cols="40"></textarea>');
  const insertSelect = () => insertHtml('<select name=""><option>Option 1</option><option>Option 2</option></select>');

  function insertVideo({ src = '', width = '320', height = '240', controls = true, autoplay = false, loop = false } = {}) {
    return insertHtml(
      `<video src="${esc(src)}" width="${esc(width)}" height="${esc(height)}"` +
      `${controls ? ' controls' : ''}${autoplay ? ' autoplay' : ''}${loop ? ' loop' : ''}>Your browser does not support the video tag</video>`,
      { block: true }
    );
  }
  function insertAudio({ src = '', controls = true, autoplay = false, loop = false } = {}) {
    return insertHtml(
      `<audio src="${esc(src)}"${controls ? ' controls' : ''}${autoplay ? ' autoplay' : ''}${loop ? ' loop' : ''}>Your browser does not support the audio tag</audio>`
    );
  }
  function insertBgsound({ src = '', loop = '-1' } = {}) {
    const el = D().createElement('bgsound');
    if (src) el.setAttribute('src', src);
    el.setAttribute('loop', loop);
    D().head.appendChild(el);
    return el;
  }
  function insertIframe({ src = '', width = '400', height = '300', name = '', scrolling = 'auto', frameborder = '0' } = {}) {
    return insertHtml(
      `<iframe src="${esc(src)}" width="${esc(width)}" height="${esc(height)}" scrolling="${esc(scrolling)}" frameborder="${esc(frameborder)}"` +
      `${name ? ` name="${esc(name)}"` : ''}></iframe>`,
      { block: true }
    );
  }
  function insertNavBar(items, align = 'center') {
    const links = items.map(it => `<a href="${esc(it.href)}">${esc(it.text)}</a>`).join(' | ');
    return insertHtml(`<div align="${align}">${links}</div>`, { block: true });
  }
  function insertHeadLink(href) {
    const el = D().createElement('link');
    el.setAttribute('rel', 'stylesheet');
    el.setAttribute('href', href);
    D().head.appendChild(el);
    return el;
  }

  /* ================= Links ================= */
  function setLinkAttrs(a, { href, target = '', title = '' }) {
    if (href != null) a.setAttribute('href', href);
    target ? a.setAttribute('target', target) : a.removeAttribute('target');
    title ? a.setAttribute('title', title) : a.removeAttribute('title');
    return a;
  }
  function wrapElInA(el, opts) {
    const a = D().createElement('a');
    setLinkAttrs(a, opts);
    el.after(a);
    a.appendChild(el);
    return a;
  }
  function wrapContentInA(el, opts) {
    const a = D().createElement('a');
    setLinkAttrs(a, opts);
    const isEmpty = !el.textContent.trim() && !el.querySelector('img,br,input,select,textarea');
    if (isEmpty) {
      a.textContent = opts.text || 'link text';
      el.appendChild(a);
    } else {
      while (el.firstChild) a.appendChild(el.firstChild);
      el.appendChild(a);
    }
    return a;
  }
  function unwrapLink(el) {
    const parent = el.parentElement;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
    return parent;
  }
  function insertAnchor(name = 'top') {
    const a = D().createElement('a');
    a.setAttribute('name', name);
    place(a);
    return a;
  }

  /* ================= Text formatting ================= */
  function fontTagOf(el) {
    if (el.tagName === 'FONT') return el;
    return [...el.children].find(c => c.tagName === 'FONT') || null;
  }
  function setFontAttrs(f, { face = '', size = '', color = '' }) {
    if (face != null) face ? f.setAttribute('face', face) : f.removeAttribute('face');
    if (size != null) size ? f.setAttribute('size', size) : f.removeAttribute('size');
    if (color != null) color ? f.setAttribute('color', color) : f.removeAttribute('color');
    if (!f.hasChildNodes()) f.innerHTML = '&nbsp;';
    return f;
  }
  // Apply a font: inline content is wrapped in <font face size color> (the standard exam style); block-level content falls back to CSS
  function applyFont(el, { face = '', size = '', color = '' }) {
    if (!el || el === D().body) return el;
    if (el.tagName === 'FONT') return setFontAttrs(el, { face, size, color });
    if (isInlineContent(el)) {
      let f = fontTagOf(el);
      if (!f) {
        f = D().createElement('font');
        while (el.firstChild) f.appendChild(el.firstChild);
        el.appendChild(f);
      }
      return setFontAttrs(f, { face, size, color });
    }
    if (face != null) face ? el.style.fontFamily = face : el.style.removeProperty('font-family');
    if (size != null) size ? el.style.fontSize = SIZE_PX[size] || (/^\d+$/.test(size) ? size + 'px' : size) : el.style.removeProperty('font-size');
    if (color != null) color ? el.style.color = color : el.style.removeProperty('color');
    return el;
  }

  const WRAP_PROPS = { B: 'bold', STRONG: 'bold', I: 'italic', EM: 'italic', U: 'underline' };
  const WRAP_STYLE = { bold: ['fontWeight', 'bold'], italic: ['fontStyle', 'italic'], underline: ['textDecoration', 'underline'] };

  function unwrapEl(el) {
    const parent = el.parentElement;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
    return parent;
  }

  // Toggle bold (B)/italic (I)/underline (U): clicking again removes it
  function toggleWrap(tag, el) {
    if (!el || el === D().body) return el;
    if (el.tagName === tag) return unwrapEl(el);
    const p = el.parentElement;
    if (p && p.tagName === tag && p.childNodes.length === 1) return unwrapEl(p);
    const inside = el.closest(tag);
    if (inside) return unwrapEl(inside);
    if (isInlineContent(el)) {
      const w = D().createElement(tag);
      while (el.firstChild) w.appendChild(el.firstChild);
      el.appendChild(w);
      return w;
    }
    const [prop, val] = WRAP_STYLE[WRAP_PROPS[tag]] || [];
    if (prop) el.style[prop] = el.style[prop] === val ? '' : val;
    return el;
  }
  function isWrapped(el, tags) {
    return !!el.closest(tags);
  }

  function setAlign(el, v) {
    if (ALIGN_ATTR_TAGS.includes(el.tagName)) v ? el.setAttribute('align', v) : el.removeAttribute('align');
    else v ? el.style.textAlign = v : el.style.removeProperty('text-align');
    return el;
  }

  // Change the block-level tag (p<->h1..h6 / ul<->ol); empty tag -> remove formatting
  function changeBlockTag(el, tag) {
    if (!el) return null;
    if (!tag) return unwrapEl(el);
    if (el.tagName === tag) return el;
    const n = D().createElement(tag);
    for (const a of [...el.attributes]) n.setAttribute(a.name, a.value);
    while (el.firstChild) n.appendChild(el.firstChild);
    el.replaceWith(n);
    return n;
  }

  /* ================= Delete / move ================= */
  function ensureClickable(el) {
    if (el && isTextContainer(el) && !el.hasChildNodes()) el.innerHTML = '&nbsp;';
    return el;
  }
  function deleteEl(el) {
    const doc = D();
    if (!el || el === doc.body) return null;
    if (el.tagName === 'TD' || el.tagName === 'TH') {
      el.innerHTML = '&nbsp;';
      return el;
    }
    if (el.tagName === 'TR') {
      const table = el.closest('table');
      el.remove();
      if (table && table.rows.length === 0) {
        table.remove();
        return table.parentElement || doc.body;
      }
      return table;
    }
    const parent = el.parentElement;
    el.remove();
    if (parent) ensureClickable(parent);
    return parent || doc.body;
  }
  function moveEl(el, dir) {
    if (!el || el === D().body) return el;
    const sib = dir === 'up' ? el.previousElementSibling : el.nextElementSibling;
    if (!sib) return el;
    if (dir === 'up') sib.before(el); else sib.after(el);
    return el;
  }

  /* ================= Table grid algorithm ================= */
  // Expand the table into a 2D grid, handling colspan / rowspan correctly
  function buildGrid(table) {
    const rows = Array.from(table.rows);
    const cols = rows.reduce((m, tr) => Math.max(m, Array.from(tr.cells).reduce((s, td) => s + Math.max(1, td.colSpan), 0)), 0);
    const grid = rows.map(() => new Array(cols).fill(null));
    const origins = new Map();
    for (let r = 0; r < rows.length; r++) {
      let c = 0;
      for (const td of Array.from(rows[r].cells)) {
        while (c < cols && grid[r][c]) c++;
        const cs = Math.max(1, td.colSpan), rs = Math.max(1, td.rowSpan);
        const cell = { el: td, colSpan: cs, rowSpan: rs, r0: r, c0: c };
        origins.set(td, cell);
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
          if (grid[r + i]) grid[r + i][c + j] = cell;
        }
        c += cs;
      }
    }
    return { grid, origins, rows, cols };
  }

  // Insert a row above/below refTr (cells spanning rows get rowspan+1 automatically)
  function insertRow(table, refTr, above) {
    const { grid, origins, rows, cols } = buildGrid(table);
    const refIdx = rows.indexOf(refTr);
    const k = Math.max(0, above ? refIdx - 1 : refIdx);
    for (const info of origins.values()) {
      if (info.r0 <= k && info.r0 + info.rowSpan - 1 > k) info.el.rowSpan = info.rowSpan + 1;
    }
    const newTr = D().createElement('tr');
    for (let c = 0; c < cols; c++) {
      const cell = grid[k] && grid[k][c];
      if (cell && cell.r0 + cell.rowSpan - 1 === k) {
        const td = cell.el.cloneNode(false);
        td.removeAttribute('rowspan');
        td.innerHTML = '&nbsp;';
        newTr.appendChild(td);
      } else if (!cell) {
        const td = D().createElement('td');
        td.innerHTML = '&nbsp;';
        newTr.appendChild(td);
      }
    }
    if (above) refTr.before(newTr); else refTr.after(newTr);
    return newTr;
  }

  // Insert a column left/right of refCell (cells spanning columns get colspan+1 automatically)
  function insertCol(table, refCell, left) {
    const { grid, origins, rows } = buildGrid(table);
    const ref = origins.get(refCell);
    if (!ref) return table;
    const k = Math.max(0, left ? ref.c0 - 1 : ref.c0 + ref.colSpan - 1);
    for (const info of origins.values()) {
      if (info.c0 <= k && info.c0 + info.colSpan - 1 > k) info.el.colSpan = info.colSpan + 1;
    }
    const created = [];
    for (let r = 0; r < rows.length; r++) {
      const tr = rows[r];
      const cell = grid[r][k];
      if (cell && cell.c0 + cell.colSpan - 1 === k) {
        const td = cell.el.cloneNode(false);
        td.removeAttribute('colspan');
        td.removeAttribute('rowspan');
        td.innerHTML = '&nbsp;';
        if (cell.r0 === r) cell.el.after(td);
        else {
          let anchor = null;
          for (const t of Array.from(tr.cells)) {
            const inf = origins.get(t);
            if (inf && inf.c0 > k) { anchor = t; break; }
          }
          if (anchor) anchor.before(td); else tr.appendChild(td);
        }
        created.push(td);
      } else if (!cell) {
        const td = D().createElement('td');
        td.innerHTML = '&nbsp;';
        tr.appendChild(td);
        created.push(td);
      }
    }
    return created.find(t => t.parentElement === ref.el.parentElement) || created[0] || table;
  }

  function deleteRow(table, refTr) {
    const { grid, origins } = buildGrid(table);
    if (table.rows.length <= 1) {
      const parent = table.parentElement;
      table.remove();
      return parent || D().body;
    }
    const idx = Array.prototype.indexOf.call(table.rows, refTr);
    const nextTr = table.rows[idx + 1];
    const cells = new Set();
    for (let c = 0; c < grid[idx].length; c++) if (grid[idx][c]) cells.add(grid[idx][c]);
    const list = [...cells].sort((a, b) => a.c0 - b.c0);
    for (const info of list) {
      if (info.rowSpan > 1) {
        info.el.rowSpan = info.rowSpan - 1;
        if (info.r0 === idx && nextTr) {
          let anchor = null;
          for (const t of Array.from(nextTr.cells)) {
            const inf = origins.get(t);
            if (inf && inf.c0 > info.c0) { anchor = t; break; }
          }
          if (anchor) anchor.before(info.el); else nextTr.appendChild(info.el);
        }
      } else {
        info.el.remove();
      }
    }
    refTr.remove();
    return table;
  }

  function deleteCol(table, refCell) {
    const { grid, origins } = buildGrid(table);
    const ref = origins.get(refCell);
    if (!ref) return table;
    const k = ref.c0;
    const cells = new Set();
    for (let r = 0; r < grid.length; r++) if (grid[r][k]) cells.add(grid[r][k]);
    const list = [...cells].sort((a, b) => a.r0 - b.r0);
    for (const info of list) {
      if (info.colSpan > 1) info.el.colSpan = info.colSpan - 1;
      else info.el.remove();
    }
    return table;
  }

  // Merge the selected cells (must form a complete rectangular region)
  function mergeCells(table, els) {
    const { grid, origins } = buildGrid(table);
    const infos = els.map(el => origins.get(el)).filter(Boolean);
    if (infos.length < 2) return null;
    const r0 = Math.min(...infos.map(i => i.r0));
    const r1 = Math.max(...infos.map(i => i.r0 + i.rowSpan - 1));
    const c0 = Math.min(...infos.map(i => i.c0));
    const c1 = Math.max(...infos.map(i => i.c0 + i.colSpan - 1));
    for (const i of infos) {
      if (i.r0 < r0 || i.c0 < c0 || i.r0 + i.rowSpan - 1 > r1 || i.c0 + i.colSpan - 1 > c1) return null;
    }
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const cell = grid[r] && grid[r][c];
      if (!cell || !infos.includes(cell)) return null;
    }
    infos.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
    const target = infos[0];
    target.el.colSpan = c1 - c0 + 1;
    target.el.rowSpan = r1 - r0 + 1;
    for (const i of infos.slice(1)) {
      target.el.innerHTML += i.el.innerHTML;
      i.el.remove();
    }
    return target.el;
  }

  // Split a cell into nRows x nCols (must not exceed the original spans)
  function splitCell(td, nRows, nCols) {
    const table = td.closest('table');
    const { grid, origins } = buildGrid(table);
    const info = origins.get(td);
    if (!info) return null;
    const { r0, c0, colSpan: cs, rowSpan: rs } = info;
    if (nRows > rs || nCols > cs) return null;
    const widths = splitParts(cs, nCols);
    const heights = splitParts(rs, nRows);
    const oldHtml = td.innerHTML;
    const anchors = [];
    for (let i = 0; i < nRows; i++) {
      const tr = table.rows[r0 + i];
      let anchor = null;
      for (const t of Array.from(tr.cells)) {
        const x = origins.get(t);
        if (x && x.c0 > c0) { anchor = t; break; }
      }
      anchors.push(anchor);
    }
    td.remove();
    for (let i = 0; i < nRows; i++) {
      const tr = table.rows[r0 + i];
      for (let j = 0; j < nCols; j++) {
        const ntd = D().createElement('td');
        if (widths[j] > 1) ntd.colSpan = widths[j];
        if (heights[i] > 1) ntd.rowSpan = heights[i];
        ntd.innerHTML = (i === 0 && j === 0) ? oldHtml : '&nbsp;';
        if (anchors[i]) anchors[i].before(ntd); else tr.appendChild(ntd);
      }
    }
    return table.rows[r0] ? table.rows[r0].cells[0] : table;
  }

  function splitParts(total, n) {
    const base = Math.floor(total / n);
    const rem = total % n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
  }

  return {
    esc, isTextContainer, isInlineContent,
    insertHtml, insertBlock, insertBr, insertNbsp, insertChar, insertDateText,
    insertList, insertListItemAfter, insertHr, insertMarquee, insertTable, insertImage,
    insertForm, insertInput, insertTextarea, insertSelect,
    insertVideo, insertAudio, insertBgsound, insertIframe, insertNavBar, insertHeadLink,
    setLinkAttrs, wrapElInA, wrapContentInA, unwrapLink, insertAnchor,
    fontTagOf, applyFont, toggleWrap, isWrapped, unwrapEl, setAlign, changeBlockTag,
    deleteEl, moveEl, ensureClickable,
    buildGrid, insertRow, insertCol, deleteRow, deleteCol, mergeCells, splitCell,
  };
})();
