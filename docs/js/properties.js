// properties.js - Properties panel: builds the property area dynamically for the selected element type; includes the CSS panel (internal stylesheet / rules / external links)
const Properties = (() => {
  let panel = null;
  let classCache = [];

  const FONT_VALUES = ['', 'SimSun', 'SimHei', 'Microsoft YaHei', 'KaiTi', 'Arial'];
  const FONT_LABELS = ['Default', 'SimSun', 'SimHei', 'Microsoft YaHei', 'KaiTi', 'Arial'];
  const SIZES = ['', '1', '2', '3', '4', '5', '6', '7'];
  const SIZE_LABELS = ['Default', '1 (10px)', '2 (13px)', '3 (16px)', '4 (18px)', '5 (24px)', '6 (32px)', '7 (48px)'];

  function init(el) { panel = el; }

  // Web edition: asset attributes are replaced with inline URLs in the design view; the panel still shows the original relative path
  const SHOW = v => (window.DWVFS ? window.DWVFS.display(v) : (v || ''));

  /* ---------------- Field builders ---------------- */
  function field(labelText, control) {
    const wrap = H('label', 'prop-field');
    wrap.appendChild(H('span', 'prop-label', labelText));
    wrap.appendChild(control);
    return wrap;
  }
  function rowWrap(...controls) {
    const wrap = H('div', 'prop-row');
    controls.forEach(c => wrap.appendChild(c));
    return wrap;
  }
  function btnRow(items) {
    const wrap = H('div', 'btn-row');
    items.forEach(b => wrap.appendChild(b));
    return wrap;
  }
  function section(title, ...children) {
    const det = H('details', 'prop-sec');
    det.open = true;
    det.appendChild(H('summary', '', title));
    const body = H('div', 'prop-sec-body');
    children.filter(Boolean).forEach(c => body.appendChild(c));
    det.appendChild(body);
    return det;
  }

  function textInput({ id, value = '', placeholder = '', onInput }) {
    const inp = H('input');
    inp.type = 'text';
    inp.value = value;
    if (placeholder) inp.placeholder = placeholder;
    if (id) inp.id = id;
    inp.addEventListener('input', () => onInput(inp.value));
    return inp;
  }
  function numberInput({ id, value = '', onInput, min }) {
    const inp = H('input');
    inp.type = 'number';
    inp.value = value;
    if (min != null) inp.min = min;
    if (id) inp.id = id;
    inp.addEventListener('input', () => onInput(inp.value));
    return inp;
  }
  function selectInput({ id, options, value = '', onInput }) {
    const sel = H('select');
    if (id) sel.id = id;
    for (const [v, l] of options) {
      const o = H('option');
      o.value = v;
      o.textContent = l;
      sel.appendChild(o);
    }
    sel.value = value;
    if (sel.selectedIndex === -1) sel.selectedIndex = 0; // Fall back to the first item when the value does not match
    sel.addEventListener('change', () => onInput(sel.value));
    return sel;
  }
  function colorInput({ id, value = '', onInput }) {
    const wrap = H('span', 'prop-color');
    const txt = H('input');
    txt.type = 'text';
    txt.value = value;
    txt.placeholder = '#RRGGBB';
    txt.spellcheck = false;
    const pick = H('input');
    pick.type = 'color';
    pick.value = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff';
    if (id) txt.id = id;
    txt.addEventListener('input', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(txt.value)) pick.value = txt.value;
      onInput(txt.value.trim());
    });
    pick.addEventListener('input', () => {
      txt.value = pick.value;
      onInput(pick.value);
    });
    wrap.append(txt, pick);
    return wrap;
  }
  function checkInput({ id, label: l, checked = false, onInput }) {
    const wrap = H('label', 'prop-check');
    const inp = H('input');
    inp.type = 'checkbox';
    inp.checked = !!checked;
    if (id) inp.id = id;
    inp.addEventListener('change', () => onInput(inp.checked));
    wrap.append(inp, H('span', '', l));
    return wrap;
  }
  function button(id, label, onClick, { primary = false, danger = false, disabled = false, active = false } = {}) {
    const b = H('button', 'prop-btn' + (primary ? ' primary' : '') + (danger ? ' danger' : '') + (active ? ' active' : ''));
    b.textContent = label;
    if (id) b.id = id;
    b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  /* ---------------- Generic attribute writers ---------------- */
  function applyAttr(el, attr, value) {
    if (value === '' || value == null) el.removeAttribute(attr);
    else el.setAttribute(attr, String(value));
    App.afterMutation({ commit: false });
  }
  function applyBool(el, attr, on) {
    if (on) el.setAttribute(attr, '');
    else el.removeAttribute(attr);
    App.afterMutation({ commit: false });
  }
  function applyStyle(el, prop, v, unit = '') {
    if (v === '' || v == null) el.style.removeProperty(prop);
    else el.style[prop] = v + unit;
    App.afterMutation({ commit: false });
  }

  function sizeFromPx(px) {
    const n = parseFloat(px);
    if (!n) return '';
    const map = { 10: '1', 13: '2', 16: '3', 18: '4', 24: '5', 32: '6', 48: '7' };
    let best = '', bd = Infinity;
    for (const [k, v] of Object.entries(map)) {
      const d = Math.abs(+k - n);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  function alignOf(el) { return el.getAttribute('align') || el.style.textAlign || ''; }

  function tagLabel(el) {
    const id = el.id ? `#${el.id}` : '';
    const cls = el.classList.length ? `.${el.classList[0]}` : '';
    return `<${el.tagName.toLowerCase()}${id}${cls}>`;
  }

  /* ---------------- CSS class cache (for the class drop-down) ---------------- */
  function collectClasses() {
    const set = new Set();
    const d = Editor.doc;
    if (d) {
      d.querySelectorAll('style').forEach(s => {
        if (s.id === 'dw-editor-style') return;
        for (const m of s.textContent.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) set.add(m[1]);
      });
      d.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
        const href = l.getAttribute('href') || '';
        const name = href.split('/').pop().replace(/\.css$/i, '');
        if (name && !/^[.#]/.test(name)) set.add(name);
      });
    }
    if (CssPanel && CssPanel.externalClasses) CssPanel.externalClasses().forEach(c => set.add(c));
    classCache = [...set];
    const dl = document.getElementById('class-list');
    if (dl) {
      dl.innerHTML = '';
      classCache.forEach(c => {
        const o = H('option');
        o.value = c;
        dl.appendChild(o);
      });
    }
  }
  function refreshClassCache() { collectClasses(); }

  /* ---------------- Panel rebuild ---------------- */
  function rebuild() {
    if (!panel) return;
    collectClasses();
    const el = Editor.getSelectedEl();
    panel.innerHTML = '';
    if (!el) {
      panel.appendChild(H('div', 'hint', 'Select an element on the left to insert, or click an element in the design view'));
      return;
    }
    const head = H('div', 'prop-head');
    head.appendChild(H('span', 'prop-tag', tagLabel(el)));
    const extra = Editor.getExtraEls().length;
    if (extra) head.appendChild(H('span', 'prop-note', `(${extra + 1} cells selected)`));
    if (el !== Editor.doc.body) head.appendChild(button('', 'Delete', () => App.deleteSelection(), { danger: true }));
    panel.appendChild(head);

    const secs = [];
    if (el === Editor.doc.body) {
      secs.push(secPage());
    } else {
      switch (el.tagName) {
        case 'IMG': secs.push(secImage(el)); break;
        case 'A':
          secs.push(el.getAttribute('name') != null ? secAnchor(el) : secLink(el));
          secs.push(secText(el));
          break;
        case 'TABLE': secs.push(secTable(el)); break;
        case 'TD': case 'TH': secs.push(secCell(el)); secs.push(secText(el)); break;
        case 'TR': secs.push(secRow(el)); break;
        case 'HR': secs.push(secHr(el)); break;
        case 'MARQUEE': secs.push(secMarquee(el)); break;
        case 'VIDEO': case 'AUDIO': secs.push(secMedia(el)); break;
        case 'FORM': secs.push(secForm(el)); break;
        case 'INPUT': secs.push(secInput(el)); break;
        case 'TEXTAREA': secs.push(secTextarea(el)); break;
        case 'SELECT': secs.push(secSelect(el)); break;
        case 'IFRAME': secs.push(secIframe(el)); break;
        case 'UL': case 'OL': secs.push(secList(el)); break;
        case 'BGSOUND': secs.push(secBgsound(el)); break;
        case 'TITLE': secs.push(secTitle(el)); break;
        default: secs.push(secText(el)); break;
      }
      if (el.closest && el.closest('table')) secs.push(secTableOps(el));
      secs.push(secCommon(el));
    }
    secs.filter(Boolean).forEach(s => panel.appendChild(s));
  }

  /* ================= Page properties ================= */
  function secPage() {
    const body = Editor.doc.body;
    return section('Page Properties (whole page)',
      field('Page title', textInput({
        id: 'prop-title',
        value: Editor.doc.title,
        onInput: v => {
          Editor.doc.title = v || 'Untitled Document';
          App.afterMutation({ commit: false });
        },
      })),
      field('Background color', colorInput({
        id: 'prop-bgcolor',
        value: body.getAttribute('bgcolor') || '',
        onInput: v => applyAttr(body, 'bgcolor', v),
      })),
      field('Background image', rowWrap(
        textInput({
          id: 'prop-bgimage',
          value: SHOW(body.getAttribute('background')),
          onInput: v => applyAttr(body, 'background', v),
        }),
        button('', 'Browse...', () => Insert.pickImageFor(body, 'background')),
      )),
      field('Text color', colorInput({
        id: 'prop-textcolor',
        value: body.getAttribute('text') || '',
        onInput: v => applyAttr(body, 'text', v),
      })),
      field('Link color', colorInput({ value: body.getAttribute('link') || '', onInput: v => applyAttr(body, 'link', v) })),
      field('Visited link color', colorInput({ value: body.getAttribute('vlink') || '', onInput: v => applyAttr(body, 'vlink', v) })),
      field('Active link color', colorInput({ value: body.getAttribute('alink') || '', onInput: v => applyAttr(body, 'alink', v) })),
      rowWrap(
        field('Left margin', numberInput({ value: body.getAttribute('leftmargin') || '', onInput: v => applyAttr(body, 'leftmargin', v) })),
        field('Top margin', numberInput({ value: body.getAttribute('topmargin') || '', onInput: v => applyAttr(body, 'topmargin', v) })),
      ),
      field('Page font', selectInput({
        value: body.style.fontFamily || '',
        options: FONT_VALUES.map((f, i) => [f, FONT_LABELS[i]]),
        onInput: v => applyStyle(body, 'font-family', v),
      })),
      field('Page font size (px)', numberInput({
        value: parseFloat(body.style.fontSize) || '',
        onInput: v => applyStyle(body, 'font-size', v, 'px'),
      })),
    );
  }

  /* ================= Text formatting ================= */
  function secText(el) {
    const isBlockFmt = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName);
    const f = DomOps.fontTagOf(el);
    const face = f ? (f.getAttribute('face') || '') : (el.style.fontFamily || '');
    const size = f ? (f.getAttribute('size') || '') : sizeFromPx(el.style.fontSize);
    const color = f ? (f.getAttribute('color') || '') : (el.style.color || '');
    const parts = [];
    if (isBlockFmt) {
      parts.push(field('Format', selectInput({
        value: el.tagName.toLowerCase(),
        options: [['p', 'Paragraph'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['h5', 'Heading 5'], ['h6', 'Heading 6'], ['', 'No formatting']],
        onInput: v => App.applyDom(() => DomOps.changeBlockTag(el, v ? v.toUpperCase() : '')),
      })));
    }
    parts.push(field('Font', selectInput({
      id: 'prop-face',
      value: face,
      options: FONT_VALUES.map((f, i) => [f, FONT_LABELS[i]]),
      onInput: v => applyFontWith(el, { face: v }),
    })));
    parts.push(field('Font size', selectInput({
      id: 'prop-size',
      value: size,
      options: SIZES.map((s, i) => [s, SIZE_LABELS[i]]),
      onInput: v => applyFontWith(el, { size: v }),
    })));
    parts.push(field('Text color', colorInput({ id: 'prop-color', value: color, onInput: v => applyFontWith(el, { color: v }) })));
    parts.push(btnRow([
      button('prop-b', 'B', () => App.applyDom(() => DomOps.toggleWrap('B', el)), { active: DomOps.isWrapped(el, 'b') }),
      button('prop-i', 'I', () => App.applyDom(() => DomOps.toggleWrap('I', el)), { active: DomOps.isWrapped(el, 'i') }),
      button('prop-u', 'U', () => App.applyDom(() => DomOps.toggleWrap('U', el)), { active: DomOps.isWrapped(el, 'u') }),
    ]));
    parts.push(field('Alignment', selectInput({
      value: alignOf(el),
      options: [['', 'Default'], ['left', 'Align left'], ['center', 'Center'], ['right', 'Align right'], ['justify', 'Justify']],
      onInput: v => App.applyDom(() => DomOps.setAlign(el, v)),
    })));
    return section('Text Formatting', ...parts);
  }

  // Keep the other two values when one of them is changed
  function applyFontWith(el, patch) {
    const f = DomOps.fontTagOf(el);
    const face = patch.face !== undefined ? patch.face : (f ? (f.getAttribute('face') || '') : (el.style.fontFamily || ''));
    const size = patch.size !== undefined ? patch.size : (f ? (f.getAttribute('size') || '') : sizeFromPx(el.style.fontSize));
    const color = patch.color !== undefined ? patch.color : (f ? (f.getAttribute('color') || '') : (el.style.color || ''));
    App.applyDom(() => DomOps.applyFont(el, { face, size, color }));
  }

  /* ================= Images ================= */
  function secImage(el) {
    return section('Image Properties',
      field('Source file', rowWrap(
        textInput({ id: 'prop-img-src', value: SHOW(el.getAttribute('src')), onInput: v => applyAttr(el, 'src', v) }),
        button('prop-img-browse', 'Browse...', () => Insert.replaceImage()),
      )),
      field('Alternative text alt', textInput({ value: el.getAttribute('alt') || '', onInput: v => applyAttr(el, 'alt', v) })),
      rowWrap(
        field('Width', numberInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('Height', numberInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      ),
      field('Border', numberInput({ value: el.getAttribute('border') || '', onInput: v => applyAttr(el, 'border', v) })),
      field('Alignment', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', 'Default'], ['baseline', 'Baseline'], ['top', 'Top'], ['middle', 'Center'], ['bottom', 'Bottom'], ['texttop', 'Text top'], ['absmiddle', 'Absolute middle'], ['absbottom', 'Absolute bottom'], ['left', 'Align left'], ['right', 'Align right']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      rowWrap(
        field('Horizontal spacing', numberInput({ value: el.getAttribute('hspace') || '', onInput: v => applyAttr(el, 'hspace', v) })),
        field('Vertical spacing', numberInput({ value: el.getAttribute('vspace') || '', onInput: v => applyAttr(el, 'vspace', v) })),
      ),
      btnRow([button('', 'Make hyperlink...', () => Insert.linkDialog())]),
    );
  }

  /* ================= Hyperlinks / anchors ================= */
  function secLink(el) {
    return section('Hyperlink',
      field('Link address', textInput({ id: 'prop-href', value: el.getAttribute('href') || '', onInput: v => applyAttr(el, 'href', v) })),
      field('Target', selectInput({
        value: el.getAttribute('target') || '',
        options: [['', 'Default (current window)'], ['_blank', 'New window _blank'], ['_self', 'Current window _self'], ['_parent', 'Parent window _parent'], ['_top', 'Top window _top']],
        onInput: v => applyAttr(el, 'target', v),
      })),
      field('Title', textInput({ value: el.getAttribute('title') || '', onInput: v => applyAttr(el, 'title', v) })),
      btnRow([
        button('', 'Make email link...', () => Insert.linkDialog({ kind: 'mail' })),
        button('', 'Make anchor link...', () => Insert.linkDialog({ kind: 'anchor' })),
        button('', 'Empty link #', () => App.applyDom(() => DomOps.setLinkAttrs(el, { href: '#' }))),
      ]),
      btnRow([button('', 'Remove link (keep content)', () => App.applyDom(() => DomOps.unwrapLink(el)), { danger: true })]),
    );
  }
  function secAnchor(el) {
    return section('Named Anchor',
      field('Anchor name', textInput({
        value: el.getAttribute('name') || '',
        onInput: v => {
          if (v) el.setAttribute('name', v);
          else el.removeAttribute('name');
          App.afterMutation({ commit: false });
        },
      })),
    );
  }

  /* ================= Tables ================= */
  function secTable(el) {
    return section('Table Properties',
      rowWrap(
        field('Width', textInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('Height', textInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      ),
      rowWrap(
        field('Border', numberInput({ value: el.getAttribute('border') || '', onInput: v => applyAttr(el, 'border', v) })),
        field('Cell padding', numberInput({ value: el.getAttribute('cellpadding') || '', onInput: v => applyAttr(el, 'cellpadding', v) })),
        field('Cell spacing', numberInput({ value: el.getAttribute('cellspacing') || '', onInput: v => applyAttr(el, 'cellspacing', v) })),
      ),
      field('Alignment', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', 'Default'], ['left', 'Align left'], ['center', 'Center'], ['right', 'Align right']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      field('Background color', colorInput({ value: el.getAttribute('bgcolor') || '', onInput: v => applyAttr(el, 'bgcolor', v) })),
      field('Background image', rowWrap(
        textInput({ value: SHOW(el.getAttribute('background')), onInput: v => applyAttr(el, 'background', v) }),
        button('', 'Browse...', () => Insert.pickImageFor(el, 'background')),
      )),
    );
  }
  function secCell(el) {
    return section('Cell Properties',
      field('Horizontal alignment', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', 'Default'], ['left', 'Align left'], ['center', 'Center'], ['right', 'Align right']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      field('Vertical alignment', selectInput({
        value: el.getAttribute('valign') || '',
        options: [['', 'Default'], ['top', 'Top'], ['middle', 'Center'], ['bottom', 'Bottom'], ['baseline', 'Baseline']],
        onInput: v => applyAttr(el, 'valign', v),
      })),
      rowWrap(
        field('Width', textInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('Height', textInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      ),
      field('Background color', colorInput({ value: el.getAttribute('bgcolor') || '', onInput: v => applyAttr(el, 'bgcolor', v) })),
      checkInput({ label: 'No wrap nowrap', checked: el.hasAttribute('nowrap'), onInput: on => applyBool(el, 'nowrap', on) }),
    );
  }
  function secRow(el) {
    return section('Row Properties',
      field('Horizontal alignment', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', 'Default'], ['left', 'Align left'], ['center', 'Center'], ['right', 'Align right']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      field('Vertical alignment', selectInput({
        value: el.getAttribute('valign') || '',
        options: [['', 'Default'], ['top', 'Top'], ['middle', 'Center'], ['bottom', 'Bottom'], ['baseline', 'Baseline']],
        onInput: v => applyAttr(el, 'valign', v),
      })),
      field('Background color', colorInput({ value: el.getAttribute('bgcolor') || '', onInput: v => applyAttr(el, 'bgcolor', v) })),
    );
  }
  function secTableOps(el) {
    const table = el.closest('table');
    if (!table) return null;
    const cell = el.closest('td,th');
    const nSel = Editor.getExtraEls().length + 1;
    const refCell = cell || table.rows[0].cells[0];
    const refRow = cell ? cell.parentElement : (el.tagName === 'TR' ? el : table.rows[0]);
    const parts = [
      btnRow([
        button('prop-row-above', 'Insert row above', () => App.applyDom(() => DomOps.insertRow(table, refRow, true))),
        button('prop-row-below', 'Insert row below', () => App.applyDom(() => DomOps.insertRow(table, refRow, false))),
      ]),
      btnRow([
        button('prop-col-left', 'Insert column left', () => App.applyDom(() => DomOps.insertCol(table, refCell, true))),
        button('prop-col-right', 'Insert column right', () => App.applyDom(() => DomOps.insertCol(table, refCell, false))),
      ]),
      btnRow([
        button('prop-row-del', 'Delete current row', () => App.applyDom(() => DomOps.deleteRow(table, refRow))),
        button('prop-col-del', 'Delete current column', () => App.applyDom(() => DomOps.deleteCol(table, refCell))),
      ]),
    ];
    if (cell) {
      parts.push(btnRow([
        button('prop-merge', `Merge cells (${nSel} selected)`, () => {
          const r = DomOps.mergeCells(table, Editor.getSelectedCells());
          App.applyDom(() => r || table);
        }, { disabled: nSel < 2 }),
        button('prop-split', 'Split cell...', () => Insert.splitCellDialog(cell)),
      ]));
    }
    return section('Table Operations', ...parts);
  }

  /* ================= Horizontal rule / scrolling text ================= */
  function secHr(el) {
    return section('Horizontal Rule',
      field('Width', textInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
      field('Height', numberInput({ value: el.getAttribute('size') || '', onInput: v => applyAttr(el, 'size', v) })),
      field('Alignment', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', 'Default'], ['left', 'Align left'], ['center', 'Center'], ['right', 'Align right']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      checkInput({ label: 'No shading noshade', checked: el.hasAttribute('noshade'), onInput: on => applyBool(el, 'noshade', on) }),
      field('Color', colorInput({ value: el.getAttribute('color') || '', onInput: v => applyAttr(el, 'color', v) })),
    );
  }
  function secMarquee(el) {
    const ta = H('textarea', 'prop-area');
    ta.value = el.textContent;
    ta.spellcheck = false;
    ta.addEventListener('input', () => {
      el.textContent = ta.value;
      App.afterMutation({ commit: false });
    });
    return section('Scrolling Text marquee',
      field('Text content', ta),
      field('Direction', selectInput({
        value: el.getAttribute('direction') || '',
        options: [['', 'Default (left)'], ['left', 'Left'], ['right', 'Right'], ['up', 'Up'], ['down', 'Down']],
        onInput: v => applyAttr(el, 'direction', v),
      })),
      field('Behavior', selectInput({
        value: el.getAttribute('behavior') || '',
        options: [['', 'Default (scroll)'], ['scroll', 'Scroll'], ['slide', 'Slide'], ['alternate', 'Alternate']],
        onInput: v => applyAttr(el, 'behavior', v),
      })),
      rowWrap(
        field('Speed', numberInput({ value: el.getAttribute('scrollamount') || '', onInput: v => applyAttr(el, 'scrollamount', v) })),
        field('Delay', numberInput({ value: el.getAttribute('scrolldelay') || '', onInput: v => applyAttr(el, 'scrolldelay', v) })),
      ),
      rowWrap(
        field('Width', textInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('Height', textInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      ),
      field('Loop count (-1 = infinite)', numberInput({ value: el.getAttribute('loop') || '', onInput: v => applyAttr(el, 'loop', v) })),
      field('Background color', colorInput({ value: el.getAttribute('bgcolor') || '', onInput: v => applyAttr(el, 'bgcolor', v) })),
    );
  }

  /* ================= Video / audio (modern replacement for Flash) ================= */
  function secMedia(el) {
    const isV = el.tagName === 'VIDEO';
    return section(isV ? 'Video (video)' : 'Audio (audio)',
      field('Source file', rowWrap(
        textInput({ value: SHOW(el.getAttribute('src')), onInput: v => applyAttr(el, 'src', v) }),
        button('', 'Browse...', async () => {
          const p = await api.pickFile(isV ? 'video' : 'audio');
          if (!p) return;
          const dest = await Site.copyInto(null, p);
          el.setAttribute('src', await Site.docRelative(dest));
          App.afterMutation({ commit: true });
        }),
      )),
      ...(isV ? [rowWrap(
        field('Width', numberInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('Height', numberInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      )] : []),
      checkInput({ label: 'Show controls controls', checked: el.hasAttribute('controls'), onInput: on => applyBool(el, 'controls', on) }),
      checkInput({ label: 'Autoplay autoplay', checked: el.hasAttribute('autoplay'), onInput: on => applyBool(el, 'autoplay', on) }),
      checkInput({ label: 'Loop playback loop', checked: el.hasAttribute('loop'), onInput: on => applyBool(el, 'loop', on) }),
      checkInput({ label: 'Mute muted', checked: el.hasAttribute('muted'), onInput: on => applyBool(el, 'muted', on) }),
    );
  }

  /* ================= Forms ================= */
  function secForm(el) {
    return section('Form (form)',
      field('Action action (submit to)', textInput({ value: el.getAttribute('action') || '', onInput: v => applyAttr(el, 'action', v) })),
      field('Method method', selectInput({
        value: (el.getAttribute('method') || '').toUpperCase(),
        options: [['POST', 'POST'], ['GET', 'GET'], ['', 'Default']],
        onInput: v => applyAttr(el, 'method', v),
      })),
      field('Name name', textInput({ value: el.getAttribute('name') || '', onInput: v => applyAttr(el, 'name', v) })),
      field('Target target', selectInput({
        value: el.getAttribute('target') || '',
        options: [['', 'Default'], ['_blank', '_blank'], ['_self', '_self'], ['_parent', '_parent'], ['_top', '_top']],
        onInput: v => applyAttr(el, 'target', v),
      })),
    );
  }
  function secInput(el) {
    const type = el.getAttribute('type') || 'text';
    const s = section('Form Element - input',
      field('Type', selectInput({
        value: type,
        options: [['text', 'Text field'], ['password', 'Password field'], ['radio', 'Radio button'], ['checkbox', 'Checkbox'], ['submit', 'Submit button'], ['reset', 'Reset button'], ['button', 'Normal button'], ['file', 'File field'], ['hidden', 'Hidden field']],
        onInput: v => {
          el.setAttribute('type', v);
          App.afterMutation({ commit: true });
          Properties.rebuild();
        },
      })),
      field('Name name', textInput({ value: el.getAttribute('name') || '', onInput: v => applyAttr(el, 'name', v) })),
      field('Value value', textInput({ value: el.getAttribute('value') || '', onInput: v => applyAttr(el, 'value', v) })),
    );
    if (type === 'text' || type === 'password') {
      s.lastChild.appendChild(rowWrap(
        field('Character width size', numberInput({ value: el.getAttribute('size') || '', onInput: v => applyAttr(el, 'size', v) })),
        field('Max characters maxlength', numberInput({ value: el.getAttribute('maxlength') || '', onInput: v => applyAttr(el, 'maxlength', v) })),
      ));
    }
    if (type === 'radio' || type === 'checkbox') {
      s.lastChild.appendChild(checkInput({ label: 'Checked by default checked', checked: el.hasAttribute('checked'), onInput: on => applyBool(el, 'checked', on) }));
    }
    return s;
  }
  function secTextarea(el) {
    const ta = H('textarea', 'prop-area');
    ta.value = el.value;
    ta.spellcheck = false;
    ta.addEventListener('input', () => {
      el.value = ta.value;
      App.afterMutation({ commit: false });
    });
    return section('Text Area textarea',
      field('Name name', textInput({ value: el.getAttribute('name') || '', onInput: v => applyAttr(el, 'name', v) })),
      rowWrap(
        field('Rows rows', numberInput({ value: el.getAttribute('rows') || '', onInput: v => applyAttr(el, 'rows', v) })),
        field('Columns cols', numberInput({ value: el.getAttribute('cols') || '', onInput: v => applyAttr(el, 'cols', v) })),
      ),
      field('Wrap wrap', selectInput({
        value: el.getAttribute('wrap') || '',
        options: [['', 'Default'], ['off', 'Off'], ['soft', 'Soft (auto wrap)'], ['hard', 'Hard (add line breaks on submit)']],
        onInput: v => applyAttr(el, 'wrap', v),
      })),
      field('Initial value', ta),
    );
  }
  function secSelect(el) {
    return section('Drop-Down Menu select',
      field('Name name', textInput({ value: el.getAttribute('name') || '', onInput: v => applyAttr(el, 'name', v) })),
      field('List height size', numberInput({ value: el.getAttribute('size') || '', onInput: v => applyAttr(el, 'size', v) })),
      checkInput({ label: 'Allow multiple selection multiple', checked: el.hasAttribute('multiple'), onInput: on => applyBool(el, 'multiple', on) }),
      btnRow([button('', 'Edit list values...', () => optionsDialog(el))]),
    );
  }

  function optionsDialog(el) {
    const rows = [...el.options].map(o => ({ value: o.getAttribute('value') || '', label: o.textContent }));
    const dlg = Dialog.show({
      title: 'List Values', width: 430,
      buttons: [{ label: 'OK', primary: true, value: true }, { label: 'Cancel', value: null }],
      onMount: (bd) => {
        const list = H('div', 'opt-list');
        bd.appendChild(list);
        const addBtn = H('button', '', '+ Add option');
        addBtn.addEventListener('click', () => { rows.push({ value: '', label: 'Option' }); render(); });
        bd.appendChild(addBtn);
        function render() {
          list.innerHTML = '';
          rows.forEach((r, i) => {
            const row = H('div', 'opt-row');
            const vInp = H('input');
            vInp.value = r.value;
            vInp.placeholder = 'Value value (submitted value)';
            vInp.addEventListener('input', () => { r.value = vInp.value; });
            const lInp = H('input');
            lInp.value = r.label;
            lInp.placeholder = 'Display text';
            lInp.addEventListener('input', () => { r.label = lInp.value; });
            const up = H('button', '', 'Up');
            up.addEventListener('click', () => { if (i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); } });
            const down = H('button', '', 'Down');
            down.addEventListener('click', () => { if (i < rows.length - 1) { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); } });
            const del = H('button', '', 'X');
            del.addEventListener('click', () => { rows.splice(i, 1); render(); });
            row.append(vInp, lInp, up, down, del);
            list.appendChild(row);
          });
        }
        render();
      },
    });
    dlg.promise.then(ok => {
      if (!ok) return;
      el.innerHTML = '';
      rows.forEach(r => {
        const o = Editor.doc.createElement('option');
        o.textContent = r.label || 'Option';
        if (r.value && r.value !== r.label) o.setAttribute('value', r.value);
        el.appendChild(o);
      });
      App.afterMutation({ commit: true });
    });
  }

  /* ================= IFrame / background music / lists / title ================= */
  function secIframe(el) {
    return section('IFrame (iframe)',
      field('Source file src', textInput({ value: SHOW(el.getAttribute('src')), onInput: v => applyAttr(el, 'src', v) })),
      rowWrap(
        field('Width', numberInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('Height', numberInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      ),
      field('Name name', textInput({ value: el.getAttribute('name') || '', onInput: v => applyAttr(el, 'name', v) })),
      field('Alignment', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', 'Default'], ['left', 'Left'], ['middle', 'Center'], ['top', 'Top'], ['right', 'Right'], ['bottom', 'Bottom']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      field('Scrolling scrolling', selectInput({
        value: el.getAttribute('scrolling') || 'auto',
        options: [['auto', 'Auto'], ['yes', 'Always'], ['no', 'Never']],
        onInput: v => applyAttr(el, 'scrolling', v),
      })),
      field('Border frameborder', selectInput({
        value: el.getAttribute('frameborder') || '0',
        options: [['1', 'With border'], ['0', 'No border']],
        onInput: v => applyAttr(el, 'frameborder', v),
      })),
      rowWrap(
        field('Margin width marginwidth', numberInput({ value: el.getAttribute('marginwidth') || '', onInput: v => applyAttr(el, 'marginwidth', v) })),
        field('Margin height marginheight', numberInput({ value: el.getAttribute('marginheight') || '', onInput: v => applyAttr(el, 'marginheight', v) })),
      ),
    );
  }
  function secBgsound(el) {
    return section('Background Music bgsound',
      field('Source file', rowWrap(
        textInput({ value: SHOW(el.getAttribute('src')), onInput: v => applyAttr(el, 'src', v) }),
        button('', 'Browse...', async () => {
          const p = await api.pickFile('audio');
          if (!p) return;
          const dest = await Site.copyInto(null, p);
          el.setAttribute('src', await Site.docRelative(dest));
          App.afterMutation({ commit: true });
        }),
      )),
      field('Loop count loop (-1 = infinite)', numberInput({ value: el.getAttribute('loop') || '', onInput: v => applyAttr(el, 'loop', v) })),
      field('Volume volume (-10000 to 0)', numberInput({ value: el.getAttribute('volume') || '', onInput: v => applyAttr(el, 'volume', v) })),
    );
  }
  function secList(el) {
    const s = section('List Properties',
      field('List type', selectInput({
        value: el.tagName.toLowerCase(),
        options: [['ul', 'Bulleted list ul'], ['ol', 'Numbered list ol']],
        onInput: v => App.applyDom(() => DomOps.changeBlockTag(el, v.toUpperCase())),
      })),
    );
    if (el.tagName === 'OL') {
      s.lastChild.appendChild(field('Start number start', numberInput({ value: el.getAttribute('start') || '', onInput: v => applyAttr(el, 'start', v) })));
    }
    return s;
  }
  function secTitle(el) {
    return section('Page Title',
      field('Title', textInput({ value: el.textContent, onInput: v => { el.textContent = v; App.afterMutation({ commit: false }); } })),
    );
  }

  /* ================= General ================= */
  function secCommon(el) {
    return section('General',
      field('ID', textInput({
        value: el.id || '',
        onInput: v => {
          if (v.trim()) el.id = v.trim();
          else el.removeAttribute('id');
          App.afterMutation({ commit: false });
        },
      })),
      field('Class class', textInput({
        id: 'prop-class',
        value: el.getAttribute('class') || '',
        list: 'class-list',
        onInput: v => {
          if (v.trim()) el.setAttribute('class', v.trim());
          else el.removeAttribute('class');
          App.afterMutation({ commit: false });
        },
      })),
      field('Title title (tooltip)', textInput({ value: el.getAttribute('title') || '', onInput: v => applyAttr(el, 'title', v) })),
    );
  }

  return { init, rebuild, refreshClassCache, collectClasses, get classCache() { return classCache; } };
})();

/* ================= CSS panel (third tab in the left column) ================= */
const CssPanel = (() => {
  let editor, label, saveBtn, backBtn;
  let externalPath = null;   // non-null = editing an external CSS file
  let externalContent = null;

  function init() {
    editor = document.getElementById('css-editor');
    label = document.getElementById('css-target-label');
    saveBtn = document.getElementById('btn-css-save');
    backBtn = document.getElementById('btn-css-back');
    editor.addEventListener('input', onInput);
    document.getElementById('btn-css-new-rule').addEventListener('click', newRuleDialog);
    document.getElementById('btn-css-link').addEventListener('click', linkExternal);
    document.getElementById('btn-css-new-file').addEventListener('click', newCssFile);
    saveBtn.addEventListener('click', saveExternal);
    backBtn.addEventListener('click', refresh);
  }

  function internalStyle() {
    if (!Editor.doc) return null;
    // Skip styles injected by the editor and external stylesheets inlined by the web edition
    return [...Editor.doc.querySelectorAll('style')]
      .find(s => s.id !== 'dw-editor-style' && !s.hasAttribute('data-dw-inlined')) || null;
  }

  function refresh() {
    externalPath = null;
    externalContent = null;
    label.textContent = 'Internal stylesheet';
    saveBtn.disabled = true;
    backBtn.classList.add('hidden');
    editor.value = internalStyle() ? internalStyle().textContent.trim() : '';
    Properties.refreshClassCache();
  }

  function setExternal(path, content) {
    externalPath = path;
    externalContent = content;
    label.textContent = 'File: ' + path;
    saveBtn.disabled = false;
    backBtn.classList.remove('hidden');
    editor.value = content;
    Properties.refreshClassCache();
  }

  function onInput() {
    if (externalPath) return; // External file: writes to disk only when "Save" is clicked
    let st = internalStyle();
    if (!st) {
      st = Editor.doc.createElement('style');
      st.setAttribute('type', 'text/css');
      Editor.doc.head.appendChild(st);
    }
    st.textContent = editor.value;
    App.afterMutation({ commit: false });
    Properties.refreshClassCache();
  }

  async function saveExternal() {
    if (!externalPath) return;
    await api.write(externalPath, editor.value);
    externalContent = editor.value;
    App.toast('Saved ' + externalPath);
  }

  async function linkExternal() {
    const p = await api.pickFile('css');
    if (!p) return;
    const dest = await Site.copyInto(null, p);
    const rel = await Site.docRelative(dest);
    const r = DomOps.insertHeadLink(rel);
    App.applyDom(() => r);
    App.toast('Linked stylesheet: ' + rel);
  }

  async function newCssFile() {
    if (!State.siteRoot) {
      App.toast('Open a site folder first');
      return;
    }
    const name = await Dialog.prompt('New CSS File', 'File name (without .css)', 'style');
    if (!name) return;
    const p = await api.pathJoin(State.siteRoot, name.replace(/\.css$/i, '') + '.css');
    if (await api.exists(p)) {
      App.toast('File already exists');
      return;
    }
    await api.write(p, '/* ' + name + ' */\n');
    const rel = await Site.docRelative(p);
    const r = DomOps.insertHeadLink(rel);
    App.applyDom(() => r);
    await Site.refresh();
    App.toast('Created and linked: ' + rel);
  }

  function newRuleDialog() {
    const dlg = Dialog.show({
      title: 'New CSS Rule', width: 440,
      buttons: [{ label: 'OK', primary: true, value: true }, { label: 'Cancel', value: null }],
      onMount: (bd, ctrl) => {
        const typeSel = Dialog.select([['class', 'Class selector (.name)'], ['id', 'ID selector (#name)'], ['tag', 'Tag selector']], 'class');
        typeSel.id = 'dlg-rule-type';
        const nameInp = H('input');
        nameInp.id = 'dlg-rule-name';
        nameInp.placeholder = 'e.g. title1 / red / p';
        const fontSel = Dialog.select([['', 'Default'], ['SimSun', 'SimSun'], ['SimHei', 'SimHei'], ['Microsoft YaHei', 'Microsoft YaHei'], ['KaiTi', 'KaiTi'], ['Arial', 'Arial']], '');
        fontSel.id = 'dlg-rule-font';
        const sizeInp = Dialog.numInput('', null);
        sizeInp.id = 'dlg-rule-size';
        sizeInp.placeholder = 'e.g. 16';
        const colorInp = H('input');
        colorInp.id = 'dlg-rule-color';
        colorInp.placeholder = '#RRGGBB';
        const bgInp = H('input');
        bgInp.id = 'dlg-rule-bg';
        bgInp.placeholder = '#RRGGBB';
        const alignSel = Dialog.select([['', 'Default'], ['left', 'Align left'], ['center', 'Center'], ['right', 'Align right'], ['justify', 'Justify']], '');
        alignSel.id = 'dlg-rule-align';
        const extraTa = H('textarea');
        extraTa.id = 'dlg-rule-extra';
        extraTa.rows = 3;
        extraTa.placeholder = 'More properties, one per line, e.g.:\nmargin: 10px;\nborder: 1px solid #ccc;';
        extraTa.spellcheck = false;
        bd.append(
          Dialog.field('Selector type', typeSel),
          Dialog.field('Name', nameInp),
          Dialog.field('Font font-family', fontSel),
          Dialog.field('Font size font-size (px)', sizeInp),
          Dialog.field('Color color', colorInp),
          Dialog.field('Background color background-color', bgInp),
          Dialog.field('Text alignment text-align', alignSel),
          Dialog.field('Other properties (free input)', extraTa),
        );
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          const prefix = typeSel.value === 'id' ? '#' : (typeSel.value === 'class' ? '.' : '');
          const selName = prefix + nameInp.value.trim();
          if (!nameInp.value.trim()) { nameInp.focus(); return; }
          const lines = [];
          if (fontSel.value) lines.push(`\tfont-family: ${fontSel.value};`);
          if (sizeInp.value) lines.push(`\tfont-size: ${sizeInp.value}px;`);
          if (/^#[0-9a-fA-F]{6}$/.test(colorInp.value.trim())) lines.push(`\tcolor: ${colorInp.value.trim()};`);
          if (/^#[0-9a-fA-F]{6}$/.test(bgInp.value.trim())) lines.push(`\tbackground-color: ${bgInp.value.trim()};`);
          if (alignSel.value) lines.push(`\ttext-align: ${alignSel.value};`);
          extraTa.value.split('\n').map(s => s.trim()).filter(Boolean).forEach(l => lines.push('\t' + l + (l.endsWith(';') ? '' : ';')));
          const rule = `${selName} {\n${lines.join('\n')}\n}\n`;
          let st = internalStyle();
          if (!st) {
            st = Editor.doc.createElement('style');
            st.setAttribute('type', 'text/css');
            Editor.doc.head.appendChild(st);
          }
          st.textContent = st.textContent.replace(/\s+$/, '') + '\n\n' + rule;
          ctrl.close(true);
          App.afterMutation({ commit: true });
          CssPanel.refresh();
        });
      },
    });
  }

  function externalClasses() {
    const set = new Set();
    const src = externalContent || editor.value || '';
    for (const m of src.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) set.add(m[1]);
    return [...set];
  }

  return { init, refresh, setExternal, externalClasses, get external() { return externalPath != null; } };
})();
