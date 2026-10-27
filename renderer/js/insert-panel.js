// insert-panel.js - Left insert panel and the various insertion dialogs (table/link/media/navigation bar, etc.)
const Insert = (() => {
  const GROUPS = [
    {
      title: 'Text', items: [
        ['Paragraph', 'p'], ['Heading 1', 'h1'], ['Heading 2', 'h2'], ['Heading 3', 'h3'],
        ['Heading 4', 'h4'], ['Heading 5', 'h5'], ['Heading 6', 'h6'],
        ['Line break <br>', 'br'], ['Non-breaking space &nbsp;', 'nbsp'],
        ['Copyright', 'copy'], ['Registered trademark', 'reg'], ['Trademark', 'tm'], ['Yen sign', 'yen'],
        ['Insert date...', 'date'],
      ],
    },
    { title: 'Lists', items: [['Bulleted list', 'ul'], ['Numbered list', 'ol']] },
    { title: 'Images', items: [['Insert image...', 'img']] },
    {
      title: 'Hyperlinks', items: [
        ['Hyperlink...', 'link'], ['Named anchor...', 'anchor'], ['Email link...', 'mailto'], ['Empty link', 'emptylink'],
      ],
    },
    { title: 'Tables', items: [['Insert table...', 'table']] },
    {
      title: 'Media', items: [
        ['Horizontal rule', 'hr'], ['Scrolling text', 'marquee'], ['Video...', 'video'], ['Audio...', 'audio'], ['Background music...', 'bgsound'],
      ],
    },
    {
      title: 'Forms', items: [
        ['Form', 'form'], ['Text field', 'input-text'], ['Password field', 'input-password'], ['Text area', 'textarea'],
        ['Radio button', 'radio'], ['Checkbox', 'checkbox'], ['Drop-down menu', 'select'], ['Submit button', 'submit'], ['Reset button', 'reset'],
      ],
    },
    { title: 'Other', items: [['Frame (iframe)...', 'iframe'], ['Navigation bar...', 'navbar']] },
  ];

  function init() {
    const box = document.getElementById('tab-insert');
    for (const g of GROUPS) {
      const det = H('details', 'ins-group');
      det.open = true;
      det.appendChild(H('summary', '', g.title));
      const body = H('div', 'ins-body');
      for (const [label, type] of g.items) {
        const b = H('button', 'ins-btn', label);
        b.id = 'ins-' + type;
        b.title = 'Insert: ' + label;
        b.addEventListener('click', () => run(type));
        body.appendChild(b);
      }
      det.appendChild(body);
      box.appendChild(det);
    }
  }

  function simple(tag) {
    const r = DomOps.insertBlock(tag);
    App.applyDom(() => r);
  }

  function run(type) {
    switch (type) {
      case 'p': case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        simple(type);
        break;
      case 'br': App.applyDom(() => DomOps.insertBr()); break;
      case 'nbsp': App.applyDom(() => DomOps.insertNbsp()); break;
      case 'copy': App.applyDom(() => DomOps.insertChar(String.fromCharCode(169))); break;
      case 'reg': App.applyDom(() => DomOps.insertChar(String.fromCharCode(174))); break;
      case 'tm': App.applyDom(() => DomOps.insertChar(String.fromCharCode(8482))); break;
      case 'yen': App.applyDom(() => DomOps.insertChar(String.fromCharCode(165))); break;
      case 'date': dateDialog(); break;
      case 'ul': case 'ol': App.applyDom(() => DomOps.insertList(type)); break;
      case 'img': insertImageDialog(); break;
      case 'link': linkDialog(); break;
      case 'anchor': anchorDialog(); break;
      case 'mailto': linkDialog({ kind: 'mail' }); break;
      case 'emptylink': linkDialog({ kind: 'empty' }); break;
      case 'table': tableDialog(); break;
      case 'hr': App.applyDom(() => DomOps.insertHr()); break;
      case 'marquee': App.applyDom(() => DomOps.insertMarquee()); break;
      case 'video': mediaDialog('video'); break;
      case 'audio': mediaDialog('audio'); break;
      case 'bgsound': bgsoundDialog(); break;
      case 'form': App.applyDom(() => DomOps.insertForm()); break;
      case 'input-text': App.applyDom(() => DomOps.insertInput('text')); break;
      case 'input-password': App.applyDom(() => DomOps.insertInput('password')); break;
      case 'textarea': App.applyDom(() => DomOps.insertTextarea()); break;
      case 'radio': App.applyDom(() => DomOps.insertInput('radio')); break;
      case 'checkbox': App.applyDom(() => DomOps.insertInput('checkbox')); break;
      case 'select': App.applyDom(() => DomOps.insertSelect()); break;
      case 'submit': App.applyDom(() => DomOps.insertInput('submit')); break;
      case 'reset': App.applyDom(() => DomOps.insertInput('reset')); break;
      case 'iframe': iframeDialog(); break;
      case 'navbar': navBarDialog(); break;
    }
  }

  /* ---------------- Images ---------------- */
  function naturalSize(p) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res(null);
      img.src = 'file:///' + p.replace(/\\/g, '/');
    });
  }

  // Core flow: copy into the site images folder -> relative path -> write width and height
  async function insertImageFromPath(absPath) {
    const dest = await Site.copyInto('images', absPath);
    const src = await Site.docRelative(dest);
    const dims = await naturalSize(dest);
    const el = DomOps.insertImage({ src, width: dims ? dims.w : '', height: dims ? dims.h : '' });
    App.applyDom(() => el);
    return { src, dest };
  }

  async function insertImageDialog() {
    const p = await api.pickFile('image');
    if (p) await insertImageFromPath(p);
  }

  // Replace the selected image (properties panel "Browse")
  async function replaceImage() {
    const el = Editor.getSelectedEl();
    if (!el || el.tagName !== 'IMG') return;
    const p = await api.pickFile('image');
    if (!p) return;
    const dest = await Site.copyInto('images', p);
    const src = await Site.docRelative(dest);
    const dims = await naturalSize(dest);
    el.setAttribute('src', src);
    if (dims) {
      el.setAttribute('width', dims.w);
      el.setAttribute('height', dims.h);
    }
    App.afterMutation({ commit: true });
  }

  // Set a background image on any element (page / table)
  async function pickImageFor(el, attr) {
    const p = await api.pickFile('image');
    if (!p) return;
    const dest = await Site.copyInto('images', p);
    el.setAttribute(attr, await Site.docRelative(dest));
    App.afterMutation({ commit: true });
  }

  /* ---------------- Tables ---------------- */
  function tableDialog() {
    const dlg = Dialog.show({
      title: 'Insert Table', width: 380,
      buttons: [{ label: 'Insert', primary: true, value: true }, { label: 'Cancel', value: null }],
      onMount: (bd, ctrl) => {
        const rowsInp = Dialog.numInput(3, 1);
        rowsInp.id = 'dlg-table-rows';
        const colsInp = Dialog.numInput(3, 1);
        colsInp.id = 'dlg-table-cols';
        const wInp = H('input');
        wInp.id = 'dlg-table-width';
        wInp.value = '400';
        wInp.placeholder = 'Pixels or %, empty for auto';
        const bInp = Dialog.numInput(1, 0);
        bInp.id = 'dlg-table-border';
        const cpInp = Dialog.numInput(2, 0);
        cpInp.id = 'dlg-table-pad';
        const csInp = Dialog.numInput(0, 0);
        csInp.id = 'dlg-table-space';
        bd.append(
          H('div', 'dlg-row'),
        );
        bd.children[0].append(Dialog.field('Rows', rowsInp), Dialog.field('Columns', colsInp));
        bd.appendChild(Dialog.field('Table width', wInp));
        const row2 = H('div', 'dlg-row');
        row2.append(Dialog.field('Border thickness', bInp), Dialog.field('Cell padding', cpInp), Dialog.field('Cell spacing', csInp));
        bd.appendChild(row2);
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          const r = DomOps.insertTable({
            rows: Math.max(1, +rowsInp.value || 1),
            cols: Math.max(1, +colsInp.value || 1),
            width: wInp.value.trim(),
            border: bInp.value,
            cellpadding: cpInp.value,
            cellspacing: csInp.value,
          });
          ctrl.close(true);
          App.applyDom(() => r);
        });
      },
    });
    return dlg.promise;
  }

  function splitCellDialog(cell) {
    const cs = cell.colSpan, rs = cell.rowSpan;
    const dlg = Dialog.show({
      title: 'Split Cell', width: 360,
      buttons: [{ label: 'Split', primary: true, value: true }, { label: 'Cancel', value: null }],
      onMount: (bd, ctrl) => {
        const cols = Dialog.numInput(2, 1);
        cols.id = 'dlg-split-cols';
        cols.max = cs;
        const rows = Dialog.numInput(1, 1);
        rows.id = 'dlg-split-rows';
        rows.max = rs;
        bd.appendChild(Dialog.field(`Split into columns (currently spans ${cs} columns, max ${cs})`, cols));
        bd.appendChild(Dialog.field(`Split into rows (currently spans ${rs} rows, max ${rs})`, rows));
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          const r = DomOps.splitCell(cell, Math.max(1, +rows.value || 1), Math.max(1, +cols.value || 1));
          ctrl.close(true);
          App.applyDom(() => r);
        });
      },
    });
    return dlg.promise;
  }

  /* ---------------- Links / anchors ---------------- */
  function listAnchors() {
    const out = [];
    Editor.doc.querySelectorAll('a[name]').forEach(a => {
      const n = a.getAttribute('name');
      if (n && !out.some(x => x === n)) out.push(n);
    });
    return out;
  }

  function linkDialog(opts = {}) {
    const sel = Editor.getSelectedEl();
    const isA = sel && sel.tagName === 'A' && sel.getAttribute('name') == null;
    const curHref = isA ? (sel.getAttribute('href') || '') : '';
    const anchors = listAnchors();
    const dlg = Dialog.show({
      title: isA ? 'Edit Hyperlink' : 'Insert Hyperlink', width: 450,
      buttons: [{ label: 'OK', primary: true, value: true }, { label: 'Cancel', value: null }],
      onMount: (bd, ctrl) => {
        const kindSel = Dialog.select([
          ['url', 'Regular link'],
          ['mail', 'Email'],
          ['anchor', 'Anchor link'],
          ['empty', 'Empty link'],
        ], opts.kind || (isA ? (/^mailto:/i.test(curHref) ? 'mail' : (/^#/.test(curHref) ? 'anchor' : 'url')) : 'url'));
        kindSel.id = 'dlg-link-kind';
        const urlInp = H('input');
        urlInp.id = 'dlg-link-href';
        urlInp.value = /^mailto:/i.test(curHref) ? curHref.slice(7) : curHref;
        urlInp.placeholder = 'e.g. https://www.example.com or index.html';
        const anchorSel = Dialog.select(anchors.map(n => [n, '#' + n]), anchors[0] || '');
        anchorSel.id = 'dlg-link-anchor';
        const textInp = H('input');
        textInp.id = 'dlg-link-text';
        textInp.value = '';
        textInp.placeholder = 'Link text (used when the selected element is empty)';
        const tgtSel = Dialog.select([['', 'Default (current window)'], ['_blank', '_blank New window'], ['_self', '_self Current window'], ['_parent', '_parent'], ['_top', '_top']], isA ? (sel.getAttribute('target') || '') : '_blank');
        tgtSel.id = 'dlg-link-target';
        const titleInp = H('input');
        titleInp.value = isA ? (sel.getAttribute('title') || '') : '';
        titleInp.placeholder = 'Title (tooltip, optional)';
        const syncKind = () => {
          urlInp.hidden = !['url', 'mail'].includes(kindSel.value);
          anchorSel.hidden = kindSel.value !== 'anchor';
          if (kindSel.value === 'anchor') urlInp.value = '';
        };
        kindSel.addEventListener('change', syncKind);
        syncKind();
        bd.append(
          Dialog.field('Link type', kindSel),
          Dialog.field('Link address / email', urlInp),
          Dialog.field('Choose anchor', anchorSel),
          Dialog.field('Text', textInp),
          Dialog.field('Target', tgtSel),
          Dialog.field('Title', titleInp),
        );
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          let href = urlInp.value.trim();
          if (kindSel.value === 'mail') href = 'mailto:' + (href.replace(/^mailto:/i, '') || 'name@example.com');
          else if (kindSel.value === 'anchor') href = '#' + anchorSel.value;
          else if (kindSel.value === 'empty') href = '#';
          const linkOpts = { href, target: tgtSel.value, title: titleInp.value.trim(), text: textInp.value.trim() || 'link text' };
          const target = isA ? sel : Editor.getSelectedEl();
          let r;
          if (target && target.tagName === 'A') r = DomOps.setLinkAttrs(target, linkOpts);
          else if (target && target.tagName === 'IMG') r = DomOps.wrapElInA(target, linkOpts);
          else if (target && target !== Editor.doc.body && DomOps.isTextContainer(target) && target.tagName !== 'A') r = DomOps.wrapContentInA(target, linkOpts);
          else r = DomOps.insertHtml(
            `<a href="${DomOps.esc(linkOpts.href)}"` +
            `${linkOpts.target ? ` target="${DomOps.esc(linkOpts.target)}"` : ''}` +
            `${linkOpts.title ? ` title="${DomOps.esc(linkOpts.title)}"` : ''}>${DomOps.esc(linkOpts.text)}</a>`
          );
          ctrl.close(true);
          App.applyDom(() => r);
        });
      },
    });
    return dlg.promise;
  }

  async function anchorDialog() {
    const name = await Dialog.prompt('Insert Named Anchor', 'Anchor name', 'top');
    if (!name) return;
    const r = DomOps.insertAnchor(name);
    App.applyDom(() => r);
  }

  /* ---------------- Media ---------------- */
  function mediaDialog(kind) {
    const dlg = Dialog.show({
      title: kind === 'video' ? 'Insert Video (modern replacement for Flash)' : 'Insert Audio', width: 390,
      buttons: [{ label: 'Insert', primary: true, value: true }, { label: 'Cancel', value: null }],
      onMount: (bd, ctrl) => {
        let src = '';
        const srcInp = H('input');
        srcInp.id = 'dlg-media-src';
        srcInp.readOnly = true;
        srcInp.placeholder = 'The file is copied into the site after selection';
        const browse = H('button', '', 'Choose File...');
        browse.addEventListener('click', async () => {
          const p = await api.pickFile(kind);
          if (!p) return;
          const dest = await Site.copyInto(null, p);
          src = await Site.docRelative(dest);
          srcInp.value = src;
        });
        const wInp = H('input');
        wInp.value = '320';
        const hInp = H('input');
        hInp.value = '240';
        const controlsCb = Dialog.check(true, 'Show playback controls (controls)');
        const autoplayCb = Dialog.check(false, 'Autoplay (autoplay)');
        const loopCb = Dialog.check(false, 'Loop playback (loop)');
        bd.append(Dialog.field('Source file', H('div', 'dlg-row')));
        bd.lastChild.lastChild.append(srcInp, browse);
        if (kind === 'video') {
          const row = H('div', 'dlg-row');
          row.append(Dialog.field('Width', wInp), Dialog.field('Height', hInp));
          bd.appendChild(row);
        }
        bd.append(controlsCb, autoplayCb, loopCb);
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          const r = kind === 'video'
            ? DomOps.insertVideo({ src, width: wInp.value, height: hInp.value, controls: controlsCb.input.checked, autoplay: autoplayCb.input.checked, loop: loopCb.input.checked })
            : DomOps.insertAudio({ src, controls: controlsCb.input.checked, autoplay: autoplayCb.input.checked, loop: loopCb.input.checked });
          ctrl.close(true);
          App.applyDom(() => r);
        });
      },
    });
    return dlg.promise;
  }

  function bgsoundDialog() {
    const dlg = Dialog.show({
      title: 'Insert Background Music (bgsound)', width: 390,
      buttons: [{ label: 'Insert', primary: true, value: true }, { label: 'Cancel', value: null }],
      onMount: (bd, ctrl) => {
        let src = '';
        const srcInp = H('input');
        srcInp.readOnly = true;
        srcInp.placeholder = 'The file is copied into the site after selection';
        const browse = H('button', '', 'Choose File...');
        browse.addEventListener('click', async () => {
          const p = await api.pickFile('audio');
          if (!p) return;
          const dest = await Site.copyInto(null, p);
          src = await Site.docRelative(dest);
          srcInp.value = src;
        });
        const loopInp = Dialog.numInput(-1);
        const volInp = Dialog.numInput('');
        bd.append(Dialog.field('Source file', H('div', 'dlg-row')));
        bd.lastChild.lastChild.append(srcInp, browse);
        bd.append(Dialog.field('Loop count (-1 = infinite)', loopInp));
        bd.appendChild(Dialog.field('Volume (-10000 to 0, empty for default)', volInp));
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          const r = DomOps.insertBgsound({ src, loop: loopInp.value === '' ? '-1' : loopInp.value });
          if (volInp.value !== '') r.setAttribute('volume', volInp.value);
          ctrl.close(true);
          App.applyDom(() => r);
        });
      },
    });
    return dlg.promise;
  }

  /* ---------------- Date / iframe / navigation bar ---------------- */
  async function dateDialog() {
    const now = new Date();
    const week = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
    const dlg = Dialog.show({
      title: 'Insert Date', width: 360,
      buttons: [{ label: 'Insert', primary: true, value: true }, { label: 'Cancel', value: null }],
      onMount: (bd, ctrl) => {
        const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
        const fmtSel = Dialog.select([
          [`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, `${y}-${m}-${d}`],
          [`${y}/${m}/${d}`, `${y}/${m}/${d}`],
          [`${y}/${m}/${d} ${week}`, `${y}/${m}/${d} ${week}`],
        ], 0);
        bd.appendChild(Dialog.field('Date format', fmtSel));
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          const r = DomOps.insertDateText(fmtSel.value);
          ctrl.close(true);
          App.applyDom(() => r);
        });
      },
    });
    return dlg.promise;
  }

  function iframeDialog() {
    const dlg = Dialog.show({
      title: 'Insert Frame (iframe)', width: 400,
      buttons: [{ label: 'Insert', primary: true, value: true }, { label: 'Cancel', value: null }],
      onMount: (bd, ctrl) => {
        const srcInp = H('input');
        srcInp.placeholder = 'e.g. https://www.example.com or page.html';
        const wInp = H('input'); wInp.value = '400';
        const hInp = H('input'); hInp.value = '300';
        const nameInp = H('input');
        const scrollSel = Dialog.select([['auto', 'Auto'], ['yes', 'Always'], ['no', 'Never']], 'auto');
        const frameSel = Dialog.select([['0', 'No border'], ['1', 'Show border']], '0');
        bd.append(Dialog.field('Source src', srcInp));
        const row = H('div', 'dlg-row');
        row.append(Dialog.field('Width', wInp), Dialog.field('Height', hInp));
        bd.appendChild(row);
        bd.appendChild(Dialog.field('Name', nameInp));
        bd.append(Dialog.field('Scrolling', scrollSel), Dialog.field('Frameborder', frameSel));
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          const r = DomOps.insertIframe({
            src: srcInp.value.trim(), width: wInp.value, height: hInp.value,
            name: nameInp.value.trim(), scrolling: scrollSel.value, frameborder: frameSel.value,
          });
          ctrl.close(true);
          App.applyDom(() => r);
        });
      },
    });
    return dlg.promise;
  }

  function navBarDialog() {
    const items = [{ text: 'Home', href: 'index.html' }];
    const dlg = Dialog.show({
      title: 'Insert Navigation Bar (hyperlink list)', width: 460,
      buttons: [{ label: 'Insert', primary: true, value: true }, { label: 'Cancel', value: null }],
      onMount: (bd, ctrl) => {
        const list = H('div');
        list.id = 'dlg-nav-list';
        bd.appendChild(list);
        const addBtn = H('button', '', '+ Add item');
        addBtn.addEventListener('click', () => { items.push({ text: '', href: '' }); render(); });
        bd.appendChild(addBtn);
        const alignSel = Dialog.select([['center', 'Center'], ['left', 'Left'], ['right', 'Right']], 'center');
        bd.appendChild(Dialog.field('Alignment', alignSel));
        function render() {
          list.innerHTML = '';
          items.forEach((it, i) => {
            const row = H('div', 'nav-row');
            const tInp = H('input');
            tInp.value = it.text;
            tInp.placeholder = 'Text';
            tInp.addEventListener('input', () => { it.text = tInp.value; });
            const hInp = H('input');
            hInp.value = it.href;
            hInp.placeholder = 'Link (e.g. index.html)';
            hInp.addEventListener('input', () => { it.href = hInp.value; });
            const del = H('button', '', 'X');
            del.addEventListener('click', () => { items.splice(i, 1); render(); });
            row.append(tInp, hInp, del);
            list.appendChild(row);
          });
        }
        render();
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          const r = DomOps.insertNavBar(items.filter(x => x.text || x.href), alignSel.value);
          ctrl.close(true);
          App.applyDom(() => r);
        });
      },
    });
    return dlg.promise;
  }

  return {
    init, run,
    insertImageFromPath, insertImageDialog, replaceImage, pickImageFor,
    tableDialog, splitCellDialog, linkDialog,
  };
})();
