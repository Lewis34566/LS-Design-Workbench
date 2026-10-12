// properties.js — 属性面板：随选中元素类型动态生成属性区；含 CSS 面板（内部样式表 / 规则 / 外部链接）
const Properties = (() => {
  let panel = null;
  let classCache = [];

  const FONT_VALUES = ['', '宋体', '黑体', '微软雅黑', '楷体', 'Arial'];
  const FONT_LABELS = ['默认', '宋体', '黑体', '微软雅黑', '楷体', 'Arial'];
  const SIZES = ['', '1', '2', '3', '4', '5', '6', '7'];
  const SIZE_LABELS = ['默认', '1（10px）', '2（13px）', '3（16px）', '4（18px）', '5（24px）', '6（32px）', '7（48px）'];

  function init(el) { panel = el; }

  // 网页版：资源属性在设计视图里被换成了内联 URL，面板上仍显示原始相对路径
  const SHOW = v => (window.DWVFS ? window.DWVFS.display(v) : (v || ''));

  /* ---------------- 字段构建器 ---------------- */
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
    if (sel.selectedIndex === -1) sel.selectedIndex = 0; // 值不匹配时回退到第一项
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

  /* ---------------- 通用写属性 ---------------- */
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

  /* ---------------- CSS 类缓存（供 class 下拉） ---------------- */
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

  /* ---------------- 面板重建 ---------------- */
  function rebuild() {
    if (!panel) return;
    collectClasses();
    const el = Editor.getSelectedEl();
    panel.innerHTML = '';
    if (!el) {
      panel.appendChild(H('div', 'hint', '在左侧选择元素插入，或单击设计视图中的元素'));
      return;
    }
    const head = H('div', 'prop-head');
    head.appendChild(H('span', 'prop-tag', tagLabel(el)));
    const extra = Editor.getExtraEls().length;
    if (extra) head.appendChild(H('span', 'prop-note', `（已选 ${extra + 1} 个单元格）`));
    if (el !== Editor.doc.body) head.appendChild(button('', '删除', () => App.deleteSelection(), { danger: true }));
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

  /* ================= 页面属性 ================= */
  function secPage() {
    const body = Editor.doc.body;
    return section('页面属性（整页）',
      field('页面标题', textInput({
        id: 'prop-title',
        value: Editor.doc.title,
        onInput: v => {
          Editor.doc.title = v || '无标题文档';
          App.afterMutation({ commit: false });
        },
      })),
      field('背景颜色', colorInput({
        id: 'prop-bgcolor',
        value: body.getAttribute('bgcolor') || '',
        onInput: v => applyAttr(body, 'bgcolor', v),
      })),
      field('背景图像', rowWrap(
        textInput({
          id: 'prop-bgimage',
          value: SHOW(body.getAttribute('background')),
          onInput: v => applyAttr(body, 'background', v),
        }),
        button('', '浏览…', () => Insert.pickImageFor(body, 'background')),
      )),
      field('文本颜色', colorInput({
        id: 'prop-textcolor',
        value: body.getAttribute('text') || '',
        onInput: v => applyAttr(body, 'text', v),
      })),
      field('链接颜色', colorInput({ value: body.getAttribute('link') || '', onInput: v => applyAttr(body, 'link', v) })),
      field('已访问链接颜色', colorInput({ value: body.getAttribute('vlink') || '', onInput: v => applyAttr(body, 'vlink', v) })),
      field('活动链接颜色', colorInput({ value: body.getAttribute('alink') || '', onInput: v => applyAttr(body, 'alink', v) })),
      rowWrap(
        field('左边距', numberInput({ value: body.getAttribute('leftmargin') || '', onInput: v => applyAttr(body, 'leftmargin', v) })),
        field('上边距', numberInput({ value: body.getAttribute('topmargin') || '', onInput: v => applyAttr(body, 'topmargin', v) })),
      ),
      field('整页字体', selectInput({
        value: body.style.fontFamily || '',
        options: FONT_VALUES.map((f, i) => [f, FONT_LABELS[i]]),
        onInput: v => applyStyle(body, 'font-family', v),
      })),
      field('整页字号（px）', numberInput({
        value: parseFloat(body.style.fontSize) || '',
        onInput: v => applyStyle(body, 'font-size', v, 'px'),
      })),
    );
  }

  /* ================= 文本格式 ================= */
  function secText(el) {
    const isBlockFmt = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName);
    const f = DomOps.fontTagOf(el);
    const face = f ? (f.getAttribute('face') || '') : (el.style.fontFamily || '');
    const size = f ? (f.getAttribute('size') || '') : sizeFromPx(el.style.fontSize);
    const color = f ? (f.getAttribute('color') || '') : (el.style.color || '');
    const parts = [];
    if (isBlockFmt) {
      parts.push(field('格式', selectInput({
        value: el.tagName.toLowerCase(),
        options: [['p', '段落'], ['h1', '标题 1'], ['h2', '标题 2'], ['h3', '标题 3'], ['h4', '标题 4'], ['h5', '标题 5'], ['h6', '标题 6'], ['', '无格式']],
        onInput: v => App.applyDom(() => DomOps.changeBlockTag(el, v ? v.toUpperCase() : '')),
      })));
    }
    parts.push(field('字体', selectInput({
      id: 'prop-face',
      value: face,
      options: FONT_VALUES.map((f, i) => [f, FONT_LABELS[i]]),
      onInput: v => applyFontWith(el, { face: v }),
    })));
    parts.push(field('字号', selectInput({
      id: 'prop-size',
      value: size,
      options: SIZES.map((s, i) => [s, SIZE_LABELS[i]]),
      onInput: v => applyFontWith(el, { size: v }),
    })));
    parts.push(field('文字颜色', colorInput({ id: 'prop-color', value: color, onInput: v => applyFontWith(el, { color: v }) })));
    parts.push(btnRow([
      button('prop-b', 'B', () => App.applyDom(() => DomOps.toggleWrap('B', el)), { active: DomOps.isWrapped(el, 'b') }),
      button('prop-i', 'I', () => App.applyDom(() => DomOps.toggleWrap('I', el)), { active: DomOps.isWrapped(el, 'i') }),
      button('prop-u', 'U', () => App.applyDom(() => DomOps.toggleWrap('U', el)), { active: DomOps.isWrapped(el, 'u') }),
    ]));
    parts.push(field('对齐', selectInput({
      value: alignOf(el),
      options: [['', '默认'], ['left', '左对齐'], ['center', '居中'], ['right', '右对齐'], ['justify', '两端对齐']],
      onInput: v => App.applyDom(() => DomOps.setAlign(el, v)),
    })));
    return section('文本格式', ...parts);
  }

  // 保证修改一项时其余两项沿用当前值
  function applyFontWith(el, patch) {
    const f = DomOps.fontTagOf(el);
    const face = patch.face !== undefined ? patch.face : (f ? (f.getAttribute('face') || '') : (el.style.fontFamily || ''));
    const size = patch.size !== undefined ? patch.size : (f ? (f.getAttribute('size') || '') : sizeFromPx(el.style.fontSize));
    const color = patch.color !== undefined ? patch.color : (f ? (f.getAttribute('color') || '') : (el.style.color || ''));
    App.applyDom(() => DomOps.applyFont(el, { face, size, color }));
  }

  /* ================= 图片 ================= */
  function secImage(el) {
    return section('图片属性',
      field('源文件', rowWrap(
        textInput({ id: 'prop-img-src', value: SHOW(el.getAttribute('src')), onInput: v => applyAttr(el, 'src', v) }),
        button('prop-img-browse', '浏览…', () => Insert.replaceImage()),
      )),
      field('替代文本 alt', textInput({ value: el.getAttribute('alt') || '', onInput: v => applyAttr(el, 'alt', v) })),
      rowWrap(
        field('宽', numberInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('高', numberInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      ),
      field('边框', numberInput({ value: el.getAttribute('border') || '', onInput: v => applyAttr(el, 'border', v) })),
      field('对齐', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', '默认'], ['baseline', '基线'], ['top', '顶端'], ['middle', '居中'], ['bottom', '底部'], ['texttop', '文本上方'], ['absmiddle', '绝对居中'], ['absbottom', '绝对底部'], ['left', '左对齐'], ['right', '右对齐']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      rowWrap(
        field('水平边距', numberInput({ value: el.getAttribute('hspace') || '', onInput: v => applyAttr(el, 'hspace', v) })),
        field('垂直边距', numberInput({ value: el.getAttribute('vspace') || '', onInput: v => applyAttr(el, 'vspace', v) })),
      ),
      btnRow([button('', '设为超链接…', () => Insert.linkDialog())]),
    );
  }

  /* ================= 超链接 / 锚记 ================= */
  function secLink(el) {
    return section('超链接',
      field('链接地址', textInput({ id: 'prop-href', value: el.getAttribute('href') || '', onInput: v => applyAttr(el, 'href', v) })),
      field('目标', selectInput({
        value: el.getAttribute('target') || '',
        options: [['', '默认（当前窗口）'], ['_blank', '新窗口 _blank'], ['_self', '当前窗口 _self'], ['_parent', '父窗口 _parent'], ['_top', '顶层窗口 _top']],
        onInput: v => applyAttr(el, 'target', v),
      })),
      field('标题', textInput({ value: el.getAttribute('title') || '', onInput: v => applyAttr(el, 'title', v) })),
      btnRow([
        button('', '设为邮件链接…', () => Insert.linkDialog({ kind: 'mail' })),
        button('', '设为锚记链接…', () => Insert.linkDialog({ kind: 'anchor' })),
        button('', '空链接 #', () => App.applyDom(() => DomOps.setLinkAttrs(el, { href: '#' }))),
      ]),
      btnRow([button('', '删除链接（保留内容）', () => App.applyDom(() => DomOps.unwrapLink(el)), { danger: true })]),
    );
  }
  function secAnchor(el) {
    return section('命名锚记',
      field('锚记名称', textInput({
        value: el.getAttribute('name') || '',
        onInput: v => {
          if (v) el.setAttribute('name', v);
          else el.removeAttribute('name');
          App.afterMutation({ commit: false });
        },
      })),
    );
  }

  /* ================= 表格 ================= */
  function secTable(el) {
    return section('表格属性',
      rowWrap(
        field('宽', textInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('高', textInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      ),
      rowWrap(
        field('边框', numberInput({ value: el.getAttribute('border') || '', onInput: v => applyAttr(el, 'border', v) })),
        field('填充', numberInput({ value: el.getAttribute('cellpadding') || '', onInput: v => applyAttr(el, 'cellpadding', v) })),
        field('间距', numberInput({ value: el.getAttribute('cellspacing') || '', onInput: v => applyAttr(el, 'cellspacing', v) })),
      ),
      field('对齐', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', '默认'], ['left', '左对齐'], ['center', '居中'], ['right', '右对齐']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      field('背景颜色', colorInput({ value: el.getAttribute('bgcolor') || '', onInput: v => applyAttr(el, 'bgcolor', v) })),
      field('背景图像', rowWrap(
        textInput({ value: SHOW(el.getAttribute('background')), onInput: v => applyAttr(el, 'background', v) }),
        button('', '浏览…', () => Insert.pickImageFor(el, 'background')),
      )),
    );
  }
  function secCell(el) {
    return section('单元格属性',
      field('水平对齐', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', '默认'], ['left', '左对齐'], ['center', '居中'], ['right', '右对齐']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      field('垂直对齐', selectInput({
        value: el.getAttribute('valign') || '',
        options: [['', '默认'], ['top', '顶端'], ['middle', '居中'], ['bottom', '底部'], ['baseline', '基线']],
        onInput: v => applyAttr(el, 'valign', v),
      })),
      rowWrap(
        field('宽', textInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('高', textInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      ),
      field('背景颜色', colorInput({ value: el.getAttribute('bgcolor') || '', onInput: v => applyAttr(el, 'bgcolor', v) })),
      checkInput({ label: '不换行 nowrap', checked: el.hasAttribute('nowrap'), onInput: on => applyBool(el, 'nowrap', on) }),
    );
  }
  function secRow(el) {
    return section('行属性',
      field('水平对齐', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', '默认'], ['left', '左对齐'], ['center', '居中'], ['right', '右对齐']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      field('垂直对齐', selectInput({
        value: el.getAttribute('valign') || '',
        options: [['', '默认'], ['top', '顶端'], ['middle', '居中'], ['bottom', '底部'], ['baseline', '基线']],
        onInput: v => applyAttr(el, 'valign', v),
      })),
      field('背景颜色', colorInput({ value: el.getAttribute('bgcolor') || '', onInput: v => applyAttr(el, 'bgcolor', v) })),
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
        button('prop-row-above', '上方插入行', () => App.applyDom(() => DomOps.insertRow(table, refRow, true))),
        button('prop-row-below', '下方插入行', () => App.applyDom(() => DomOps.insertRow(table, refRow, false))),
      ]),
      btnRow([
        button('prop-col-left', '左侧插入列', () => App.applyDom(() => DomOps.insertCol(table, refCell, true))),
        button('prop-col-right', '右侧插入列', () => App.applyDom(() => DomOps.insertCol(table, refCell, false))),
      ]),
      btnRow([
        button('prop-row-del', '删除当前行', () => App.applyDom(() => DomOps.deleteRow(table, refRow))),
        button('prop-col-del', '删除当前列', () => App.applyDom(() => DomOps.deleteCol(table, refCell))),
      ]),
    ];
    if (cell) {
      parts.push(btnRow([
        button('prop-merge', `合并单元格（已选 ${nSel} 个）`, () => {
          const r = DomOps.mergeCells(table, Editor.getSelectedCells());
          App.applyDom(() => r || table);
        }, { disabled: nSel < 2 }),
        button('prop-split', '拆分单元格…', () => Insert.splitCellDialog(cell)),
      ]));
    }
    return section('表格操作', ...parts);
  }

  /* ================= 水平线 / 滚动文字 ================= */
  function secHr(el) {
    return section('水平线',
      field('宽', textInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
      field('高', numberInput({ value: el.getAttribute('size') || '', onInput: v => applyAttr(el, 'size', v) })),
      field('对齐', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', '默认'], ['left', '左对齐'], ['center', '居中'], ['right', '右对齐']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      checkInput({ label: '去掉阴影 noshade', checked: el.hasAttribute('noshade'), onInput: on => applyBool(el, 'noshade', on) }),
      field('颜色', colorInput({ value: el.getAttribute('color') || '', onInput: v => applyAttr(el, 'color', v) })),
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
    return section('滚动文字 marquee',
      field('文字内容', ta),
      field('方向', selectInput({
        value: el.getAttribute('direction') || '',
        options: [['', '默认（左）'], ['left', '左'], ['right', '右'], ['up', '上'], ['down', '下']],
        onInput: v => applyAttr(el, 'direction', v),
      })),
      field('方式', selectInput({
        value: el.getAttribute('behavior') || '',
        options: [['', '默认（scroll）'], ['scroll', '滚动'], ['slide', '滑动'], ['alternate', '交替']],
        onInput: v => applyAttr(el, 'behavior', v),
      })),
      rowWrap(
        field('速度', numberInput({ value: el.getAttribute('scrollamount') || '', onInput: v => applyAttr(el, 'scrollamount', v) })),
        field('延迟', numberInput({ value: el.getAttribute('scrolldelay') || '', onInput: v => applyAttr(el, 'scrolldelay', v) })),
      ),
      rowWrap(
        field('宽', textInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('高', textInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      ),
      field('循环次数（-1 无限）', numberInput({ value: el.getAttribute('loop') || '', onInput: v => applyAttr(el, 'loop', v) })),
      field('背景颜色', colorInput({ value: el.getAttribute('bgcolor') || '', onInput: v => applyAttr(el, 'bgcolor', v) })),
    );
  }

  /* ================= 视频 / 音频（Flash 的现代替代） ================= */
  function secMedia(el) {
    const isV = el.tagName === 'VIDEO';
    return section(isV ? '视频 video' : '音频 audio',
      field('源文件', rowWrap(
        textInput({ value: SHOW(el.getAttribute('src')), onInput: v => applyAttr(el, 'src', v) }),
        button('', '浏览…', async () => {
          const p = await api.pickFile(isV ? 'video' : 'audio');
          if (!p) return;
          const dest = await Site.copyInto(null, p);
          el.setAttribute('src', await Site.docRelative(dest));
          App.afterMutation({ commit: true });
        }),
      )),
      ...(isV ? [rowWrap(
        field('宽', numberInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('高', numberInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      )] : []),
      checkInput({ label: '显示控件 controls', checked: el.hasAttribute('controls'), onInput: on => applyBool(el, 'controls', on) }),
      checkInput({ label: '自动播放 autoplay', checked: el.hasAttribute('autoplay'), onInput: on => applyBool(el, 'autoplay', on) }),
      checkInput({ label: '循环播放 loop', checked: el.hasAttribute('loop'), onInput: on => applyBool(el, 'loop', on) }),
      checkInput({ label: '静音 muted', checked: el.hasAttribute('muted'), onInput: on => applyBool(el, 'muted', on) }),
    );
  }

  /* ================= 表单 ================= */
  function secForm(el) {
    return section('表单 form',
      field('动作 action（提交到）', textInput({ value: el.getAttribute('action') || '', onInput: v => applyAttr(el, 'action', v) })),
      field('方法 method', selectInput({
        value: (el.getAttribute('method') || '').toUpperCase(),
        options: [['POST', 'POST'], ['GET', 'GET'], ['', '默认']],
        onInput: v => applyAttr(el, 'method', v),
      })),
      field('名称 name', textInput({ value: el.getAttribute('name') || '', onInput: v => applyAttr(el, 'name', v) })),
      field('目标 target', selectInput({
        value: el.getAttribute('target') || '',
        options: [['', '默认'], ['_blank', '_blank'], ['_self', '_self'], ['_parent', '_parent'], ['_top', '_top']],
        onInput: v => applyAttr(el, 'target', v),
      })),
    );
  }
  function secInput(el) {
    const type = el.getAttribute('type') || 'text';
    const s = section('表单元素 · input',
      field('类型', selectInput({
        value: type,
        options: [['text', '文本框'], ['password', '密码框'], ['radio', '单选按钮'], ['checkbox', '复选框'], ['submit', '提交按钮'], ['reset', '重置按钮'], ['button', '普通按钮'], ['file', '文件域'], ['hidden', '隐藏域']],
        onInput: v => {
          el.setAttribute('type', v);
          App.afterMutation({ commit: true });
          Properties.rebuild();
        },
      })),
      field('名称 name', textInput({ value: el.getAttribute('name') || '', onInput: v => applyAttr(el, 'name', v) })),
      field('值 value', textInput({ value: el.getAttribute('value') || '', onInput: v => applyAttr(el, 'value', v) })),
    );
    if (type === 'text' || type === 'password') {
      s.lastChild.appendChild(rowWrap(
        field('字符宽度 size', numberInput({ value: el.getAttribute('size') || '', onInput: v => applyAttr(el, 'size', v) })),
        field('最多字符 maxlength', numberInput({ value: el.getAttribute('maxlength') || '', onInput: v => applyAttr(el, 'maxlength', v) })),
      ));
    }
    if (type === 'radio' || type === 'checkbox') {
      s.lastChild.appendChild(checkInput({ label: '初始状态已选中 checked', checked: el.hasAttribute('checked'), onInput: on => applyBool(el, 'checked', on) }));
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
    return section('文本区域 textarea',
      field('名称 name', textInput({ value: el.getAttribute('name') || '', onInput: v => applyAttr(el, 'name', v) })),
      rowWrap(
        field('行数 rows', numberInput({ value: el.getAttribute('rows') || '', onInput: v => applyAttr(el, 'rows', v) })),
        field('列数 cols', numberInput({ value: el.getAttribute('cols') || '', onInput: v => applyAttr(el, 'cols', v) })),
      ),
      field('换行 wrap', selectInput({
        value: el.getAttribute('wrap') || '',
        options: [['', '默认'], ['off', '关'], ['soft', '软（自动换行）'], ['hard', '硬（提交时加换行）']],
        onInput: v => applyAttr(el, 'wrap', v),
      })),
      field('初始值', ta),
    );
  }
  function secSelect(el) {
    return section('下拉菜单 select',
      field('名称 name', textInput({ value: el.getAttribute('name') || '', onInput: v => applyAttr(el, 'name', v) })),
      field('列表高度 size', numberInput({ value: el.getAttribute('size') || '', onInput: v => applyAttr(el, 'size', v) })),
      checkInput({ label: '允许多选 multiple', checked: el.hasAttribute('multiple'), onInput: on => applyBool(el, 'multiple', on) }),
      btnRow([button('', '编辑列表值…', () => optionsDialog(el))]),
    );
  }

  function optionsDialog(el) {
    const rows = [...el.options].map(o => ({ value: o.getAttribute('value') || '', label: o.textContent }));
    const dlg = Dialog.show({
      title: '列表值', width: 430,
      buttons: [{ label: '确定', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd) => {
        const list = H('div', 'opt-list');
        bd.appendChild(list);
        const addBtn = H('button', '', '＋ 添加选项');
        addBtn.addEventListener('click', () => { rows.push({ value: '', label: '选项' }); render(); });
        bd.appendChild(addBtn);
        function render() {
          list.innerHTML = '';
          rows.forEach((r, i) => {
            const row = H('div', 'opt-row');
            const vInp = H('input');
            vInp.value = r.value;
            vInp.placeholder = '值 value（提交的值）';
            vInp.addEventListener('input', () => { r.value = vInp.value; });
            const lInp = H('input');
            lInp.value = r.label;
            lInp.placeholder = '显示文字';
            lInp.addEventListener('input', () => { r.label = lInp.value; });
            const up = H('button', '', '↑');
            up.addEventListener('click', () => { if (i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); } });
            const down = H('button', '', '↓');
            down.addEventListener('click', () => { if (i < rows.length - 1) { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); } });
            const del = H('button', '', '✕');
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
        o.textContent = r.label || '选项';
        if (r.value && r.value !== r.label) o.setAttribute('value', r.value);
        el.appendChild(o);
      });
      App.afterMutation({ commit: true });
    });
  }

  /* ================= 框架 iframe / 背景音乐 / 列表 / 标题 ================= */
  function secIframe(el) {
    return section('框架 iframe',
      field('源文件 src', textInput({ value: SHOW(el.getAttribute('src')), onInput: v => applyAttr(el, 'src', v) })),
      rowWrap(
        field('宽', numberInput({ value: el.getAttribute('width') || '', onInput: v => applyAttr(el, 'width', v) })),
        field('高', numberInput({ value: el.getAttribute('height') || '', onInput: v => applyAttr(el, 'height', v) })),
      ),
      field('名称 name', textInput({ value: el.getAttribute('name') || '', onInput: v => applyAttr(el, 'name', v) })),
      field('对齐', selectInput({
        value: el.getAttribute('align') || '',
        options: [['', '默认'], ['left', '左'], ['middle', '居中'], ['top', '顶端'], ['right', '右'], ['bottom', '底部']],
        onInput: v => applyAttr(el, 'align', v),
      })),
      field('滚动 scrolling', selectInput({
        value: el.getAttribute('scrolling') || 'auto',
        options: [['auto', '自动'], ['yes', '总是'], ['no', '从不']],
        onInput: v => applyAttr(el, 'scrolling', v),
      })),
      field('边框 frameborder', selectInput({
        value: el.getAttribute('frameborder') || '0',
        options: [['1', '有边框'], ['0', '无边框']],
        onInput: v => applyAttr(el, 'frameborder', v),
      })),
      rowWrap(
        field('边距宽 marginwidth', numberInput({ value: el.getAttribute('marginwidth') || '', onInput: v => applyAttr(el, 'marginwidth', v) })),
        field('边距高 marginheight', numberInput({ value: el.getAttribute('marginheight') || '', onInput: v => applyAttr(el, 'marginheight', v) })),
      ),
    );
  }
  function secBgsound(el) {
    return section('背景音乐 bgsound',
      field('源文件', rowWrap(
        textInput({ value: SHOW(el.getAttribute('src')), onInput: v => applyAttr(el, 'src', v) }),
        button('', '浏览…', async () => {
          const p = await api.pickFile('audio');
          if (!p) return;
          const dest = await Site.copyInto(null, p);
          el.setAttribute('src', await Site.docRelative(dest));
          App.afterMutation({ commit: true });
        }),
      )),
      field('循环次数 loop（-1 无限）', numberInput({ value: el.getAttribute('loop') || '', onInput: v => applyAttr(el, 'loop', v) })),
      field('音量 volume（-10000 ~ 0）', numberInput({ value: el.getAttribute('volume') || '', onInput: v => applyAttr(el, 'volume', v) })),
    );
  }
  function secList(el) {
    const s = section('列表属性',
      field('列表类型', selectInput({
        value: el.tagName.toLowerCase(),
        options: [['ul', '项目列表 ul'], ['ol', '编号列表 ol']],
        onInput: v => App.applyDom(() => DomOps.changeBlockTag(el, v.toUpperCase())),
      })),
    );
    if (el.tagName === 'OL') {
      s.lastChild.appendChild(field('起始编号 start', numberInput({ value: el.getAttribute('start') || '', onInput: v => applyAttr(el, 'start', v) })));
    }
    return s;
  }
  function secTitle(el) {
    return section('页面标题',
      field('标题', textInput({ value: el.textContent, onInput: v => { el.textContent = v; App.afterMutation({ commit: false }); } })),
    );
  }

  /* ================= 通用 ================= */
  function secCommon(el) {
    return section('通用',
      field('ID', textInput({
        value: el.id || '',
        onInput: v => {
          if (v.trim()) el.id = v.trim();
          else el.removeAttribute('id');
          App.afterMutation({ commit: false });
        },
      })),
      field('类 class', textInput({
        id: 'prop-class',
        value: el.getAttribute('class') || '',
        list: 'class-list',
        onInput: v => {
          if (v.trim()) el.setAttribute('class', v.trim());
          else el.removeAttribute('class');
          App.afterMutation({ commit: false });
        },
      })),
      field('标题 title（悬停提示）', textInput({ value: el.getAttribute('title') || '', onInput: v => applyAttr(el, 'title', v) })),
    );
  }

  return { init, rebuild, refreshClassCache, collectClasses, get classCache() { return classCache; } };
})();

/* ================= CSS 面板（左栏第三页） ================= */
const CssPanel = (() => {
  let editor, label, saveBtn, backBtn;
  let externalPath = null;   // 非空 = 正在编辑外部 css 文件
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
    // 跳过编辑器注入的样式与网页版内联进来的外部样式表
    return [...Editor.doc.querySelectorAll('style')]
      .find(s => s.id !== 'dw-editor-style' && !s.hasAttribute('data-dw-inlined')) || null;
  }

  function refresh() {
    externalPath = null;
    externalContent = null;
    label.textContent = '内部样式表';
    saveBtn.disabled = true;
    backBtn.classList.add('hidden');
    editor.value = internalStyle() ? internalStyle().textContent.trim() : '';
    Properties.refreshClassCache();
  }

  function setExternal(path, content) {
    externalPath = path;
    externalContent = content;
    label.textContent = '文件：' + path;
    saveBtn.disabled = false;
    backBtn.classList.remove('hidden');
    editor.value = content;
    Properties.refreshClassCache();
  }

  function onInput() {
    if (externalPath) return; // 外部文件：点“保存”才写盘
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
    App.toast('已保存 ' + externalPath);
  }

  async function linkExternal() {
    const p = await api.pickFile('css');
    if (!p) return;
    const dest = await Site.copyInto(null, p);
    const rel = await Site.docRelative(dest);
    const r = DomOps.insertHeadLink(rel);
    App.applyDom(() => r);
    App.toast('已链接样式表：' + rel);
  }

  async function newCssFile() {
    if (!State.siteRoot) {
      App.toast('请先打开站点文件夹');
      return;
    }
    const name = await Dialog.prompt('新建 CSS 文件', '文件名（不含 .css）', 'style');
    if (!name) return;
    const p = await api.pathJoin(State.siteRoot, name.replace(/\.css$/i, '') + '.css');
    if (await api.exists(p)) {
      App.toast('文件已存在');
      return;
    }
    await api.write(p, '/* ' + name + ' */\n');
    const rel = await Site.docRelative(p);
    const r = DomOps.insertHeadLink(rel);
    App.applyDom(() => r);
    await Site.refresh();
    App.toast('已创建并链接：' + rel);
  }

  function newRuleDialog() {
    const dlg = Dialog.show({
      title: '新建 CSS 规则', width: 440,
      buttons: [{ label: '确定', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd, ctrl) => {
        const typeSel = Dialog.select([['class', '类选择器（.名称）'], ['id', 'ID 选择器（#名称）'], ['tag', '标签选择器']], 'class');
        typeSel.id = 'dlg-rule-type';
        const nameInp = H('input');
        nameInp.id = 'dlg-rule-name';
        nameInp.placeholder = '如：title1 / red / p';
        const fontSel = Dialog.select([['', '默认'], ['宋体', '宋体'], ['黑体', '黑体'], ['微软雅黑', '微软雅黑'], ['楷体', '楷体'], ['Arial', 'Arial']], '');
        fontSel.id = 'dlg-rule-font';
        const sizeInp = Dialog.numInput('', null);
        sizeInp.id = 'dlg-rule-size';
        sizeInp.placeholder = '如 16';
        const colorInp = H('input');
        colorInp.id = 'dlg-rule-color';
        colorInp.placeholder = '#RRGGBB';
        const bgInp = H('input');
        bgInp.id = 'dlg-rule-bg';
        bgInp.placeholder = '#RRGGBB';
        const alignSel = Dialog.select([['', '默认'], ['left', '左对齐'], ['center', '居中'], ['right', '右对齐'], ['justify', '两端对齐']], '');
        alignSel.id = 'dlg-rule-align';
        const extraTa = H('textarea');
        extraTa.id = 'dlg-rule-extra';
        extraTa.rows = 3;
        extraTa.placeholder = '更多属性，每行一条，如：\nmargin: 10px;\nborder: 1px solid #ccc;';
        extraTa.spellcheck = false;
        bd.append(
          Dialog.field('选择器类型', typeSel),
          Dialog.field('名称', nameInp),
          Dialog.field('字体 font-family', fontSel),
          Dialog.field('字号 font-size（px）', sizeInp),
          Dialog.field('颜色 color', colorInp),
          Dialog.field('背景色 background-color', bgInp),
          Dialog.field('文本对齐 text-align', alignSel),
          Dialog.field('其他属性（自由输入）', extraTa),
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
