// insert-panel.js — 左侧插入面板与各类插入对话框（表格/链接/媒体/导航条等）
const Insert = (() => {
  const GROUPS = [
    {
      title: '文本', items: [
        ['段落', 'p'], ['标题 1', 'h1'], ['标题 2', 'h2'], ['标题 3', 'h3'],
        ['标题 4', 'h4'], ['标题 5', 'h5'], ['标题 6', 'h6'],
        ['换行 <br>', 'br'], ['空格 &nbsp;', 'nbsp'],
        ['© 版权', 'copy'], ['® 注册商标', 'reg'], ['™ 商标', 'tm'], ['¥ 人民币', 'yen'],
        ['插入日期…', 'date'],
      ],
    },
    { title: '列表', items: [['项目列表', 'ul'], ['编号列表', 'ol']] },
    { title: '图片', items: [['插入图片…', 'img']] },
    {
      title: '超链接', items: [
        ['超链接…', 'link'], ['命名锚记…', 'anchor'], ['邮件链接…', 'mailto'], ['空链接', 'emptylink'],
      ],
    },
    { title: '表格', items: [['插入表格…', 'table']] },
    {
      title: '媒体', items: [
        ['水平线', 'hr'], ['滚动文字', 'marquee'], ['视频…', 'video'], ['音频…', 'audio'], ['背景音乐…', 'bgsound'],
      ],
    },
    {
      title: '表单', items: [
        ['表单', 'form'], ['文本框', 'input-text'], ['密码框', 'input-password'], ['文本区域', 'textarea'],
        ['单选按钮', 'radio'], ['复选框', 'checkbox'], ['下拉菜单', 'select'], ['提交按钮', 'submit'], ['重置按钮', 'reset'],
      ],
    },
    { title: '其他', items: [['框架 iframe…', 'iframe'], ['导航条…', 'navbar']] },
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
        b.title = '插入：' + label;
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
      case 'copy': App.applyDom(() => DomOps.insertChar('©')); break;
      case 'reg': App.applyDom(() => DomOps.insertChar('®')); break;
      case 'tm': App.applyDom(() => DomOps.insertChar('™')); break;
      case 'yen': App.applyDom(() => DomOps.insertChar('¥')); break;
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

  /* ---------------- 图片 ---------------- */
  function naturalSize(p) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res(null);
      img.src = 'file:///' + p.replace(/\\/g, '/');
    });
  }

  // 核心流程：复制到站点 images 文件夹 → 相对路径 → 写入宽高
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

  // 替换选中图片（属性面板“浏览”）
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

  // 给任意元素设置背景图像（页面 / 表格）
  async function pickImageFor(el, attr) {
    const p = await api.pickFile('image');
    if (!p) return;
    const dest = await Site.copyInto('images', p);
    el.setAttribute(attr, await Site.docRelative(dest));
    App.afterMutation({ commit: true });
  }

  /* ---------------- 表格 ---------------- */
  function tableDialog() {
    const dlg = Dialog.show({
      title: '插入表格', width: 380,
      buttons: [{ label: '插入', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd, ctrl) => {
        const rowsInp = Dialog.numInput(3, 1);
        rowsInp.id = 'dlg-table-rows';
        const colsInp = Dialog.numInput(3, 1);
        colsInp.id = 'dlg-table-cols';
        const wInp = H('input');
        wInp.id = 'dlg-table-width';
        wInp.value = '400';
        wInp.placeholder = '像素或 %，留空为自动';
        const bInp = Dialog.numInput(1, 0);
        bInp.id = 'dlg-table-border';
        const cpInp = Dialog.numInput(2, 0);
        cpInp.id = 'dlg-table-pad';
        const csInp = Dialog.numInput(0, 0);
        csInp.id = 'dlg-table-space';
        bd.append(
          H('div', 'dlg-row'),
        );
        bd.children[0].append(Dialog.field('行数', rowsInp), Dialog.field('列数', colsInp));
        bd.appendChild(Dialog.field('表格宽度', wInp));
        const row2 = H('div', 'dlg-row');
        row2.append(Dialog.field('边框粗细', bInp), Dialog.field('单元格填充', cpInp), Dialog.field('单元格间距', csInp));
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
      title: '拆分单元格', width: 360,
      buttons: [{ label: '拆分', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd, ctrl) => {
        const cols = Dialog.numInput(2, 1);
        cols.id = 'dlg-split-cols';
        cols.max = cs;
        const rows = Dialog.numInput(1, 1);
        rows.id = 'dlg-split-rows';
        rows.max = rs;
        bd.appendChild(Dialog.field(`拆分为几列（当前跨 ${cs} 列，最多 ${cs}）`, cols));
        bd.appendChild(Dialog.field(`拆分为几行（当前跨 ${rs} 行，最多 ${rs}）`, rows));
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

  /* ---------------- 链接 / 锚记 ---------------- */
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
      title: isA ? '编辑超链接' : '插入超链接', width: 450,
      buttons: [{ label: '确定', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd, ctrl) => {
        const kindSel = Dialog.select([
          ['url', '普通链接'],
          ['mail', '电子邮件'],
          ['anchor', '锚记链接'],
          ['empty', '空链接'],
        ], opts.kind || (isA ? (/^mailto:/i.test(curHref) ? 'mail' : (/^#/.test(curHref) ? 'anchor' : 'url')) : 'url'));
        kindSel.id = 'dlg-link-kind';
        const urlInp = H('input');
        urlInp.id = 'dlg-link-href';
        urlInp.value = /^mailto:/i.test(curHref) ? curHref.slice(7) : curHref;
        urlInp.placeholder = '如 https://www.example.com 或 index.html';
        const anchorSel = Dialog.select(anchors.map(n => [n, '#' + n]), anchors[0] || '');
        anchorSel.id = 'dlg-link-anchor';
        const textInp = H('input');
        textInp.id = 'dlg-link-text';
        textInp.value = '';
        textInp.placeholder = '链接文字（选中元素为空时使用）';
        const tgtSel = Dialog.select([['', '默认（当前窗口）'], ['_blank', '_blank 新窗口'], ['_self', '_self 当前窗口'], ['_parent', '_parent'], ['_top', '_top']], isA ? (sel.getAttribute('target') || '') : '_blank');
        tgtSel.id = 'dlg-link-target';
        const titleInp = H('input');
        titleInp.value = isA ? (sel.getAttribute('title') || '') : '';
        titleInp.placeholder = '标题（悬停提示，可选）';
        const syncKind = () => {
          urlInp.hidden = !['url', 'mail'].includes(kindSel.value);
          anchorSel.hidden = kindSel.value !== 'anchor';
          if (kindSel.value === 'anchor') urlInp.value = '';
        };
        kindSel.addEventListener('change', syncKind);
        syncKind();
        bd.append(
          Dialog.field('链接类型', kindSel),
          Dialog.field('链接地址 / 邮箱', urlInp),
          Dialog.field('选择锚记', anchorSel),
          Dialog.field('文字', textInp),
          Dialog.field('目标', tgtSel),
          Dialog.field('标题', titleInp),
        );
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          let href = urlInp.value.trim();
          if (kindSel.value === 'mail') href = 'mailto:' + (href.replace(/^mailto:/i, '') || 'name@example.com');
          else if (kindSel.value === 'anchor') href = '#' + anchorSel.value;
          else if (kindSel.value === 'empty') href = '#';
          const linkOpts = { href, target: tgtSel.value, title: titleInp.value.trim(), text: textInp.value.trim() || '链接文字' };
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
    const name = await Dialog.prompt('插入命名锚记', '锚记名称', 'top');
    if (!name) return;
    const r = DomOps.insertAnchor(name);
    App.applyDom(() => r);
  }

  /* ---------------- 媒体 ---------------- */
  function mediaDialog(kind) {
    const dlg = Dialog.show({
      title: kind === 'video' ? '插入视频（Flash 的现代替代）' : '插入音频', width: 390,
      buttons: [{ label: '插入', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd, ctrl) => {
        let src = '';
        const srcInp = H('input');
        srcInp.id = 'dlg-media-src';
        srcInp.readOnly = true;
        srcInp.placeholder = '选择文件后自动复制到站点';
        const browse = H('button', '', '选择文件…');
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
        const controlsCb = Dialog.check(true, '显示播放控件 controls');
        const autoplayCb = Dialog.check(false, '自动播放 autoplay');
        const loopCb = Dialog.check(false, '循环播放 loop');
        bd.append(Dialog.field('源文件', H('div', 'dlg-row')));
        bd.lastChild.lastChild.append(srcInp, browse);
        if (kind === 'video') {
          const row = H('div', 'dlg-row');
          row.append(Dialog.field('宽', wInp), Dialog.field('高', hInp));
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
      title: '插入背景音乐 bgsound', width: 390,
      buttons: [{ label: '插入', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd, ctrl) => {
        let src = '';
        const srcInp = H('input');
        srcInp.readOnly = true;
        srcInp.placeholder = '选择文件后自动复制到站点';
        const browse = H('button', '', '选择文件…');
        browse.addEventListener('click', async () => {
          const p = await api.pickFile('audio');
          if (!p) return;
          const dest = await Site.copyInto(null, p);
          src = await Site.docRelative(dest);
          srcInp.value = src;
        });
        const loopInp = Dialog.numInput(-1);
        const volInp = Dialog.numInput('');
        bd.append(Dialog.field('源文件', H('div', 'dlg-row')));
        bd.lastChild.lastChild.append(srcInp, browse);
        bd.append(Dialog.field('循环次数（-1 无限）', loopInp));
        bd.appendChild(Dialog.field('音量（-10000 ~ 0，留空默认）', volInp));
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

  /* ---------------- 日期 / iframe / 导航条 ---------------- */
  async function dateDialog() {
    const now = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    const dlg = Dialog.show({
      title: '插入日期', width: 360,
      buttons: [{ label: '插入', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd, ctrl) => {
        const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
        const fmtSel = Dialog.select([
          [`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, `${y}-${m}-${d}`],
          [`${y}年${m}月${d}日`, `${y}年${m}月${d}日`],
          [`${y}年${m}月${d}日 星期${week}`, `${y}年${m}月${d}日 星期${week}`],
        ], 0);
        bd.appendChild(Dialog.field('日期格式', fmtSel));
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
      title: '插入框架 iframe', width: 400,
      buttons: [{ label: '插入', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd, ctrl) => {
        const srcInp = H('input');
        srcInp.placeholder = '如 https://www.example.com 或 page.html';
        const wInp = H('input'); wInp.value = '400';
        const hInp = H('input'); hInp.value = '300';
        const nameInp = H('input');
        const scrollSel = Dialog.select([['auto', '自动'], ['yes', '总是'], ['no', '从不']], 'auto');
        const frameSel = Dialog.select([['0', '无边框'], ['1', '有边框']], '0');
        bd.append(Dialog.field('源文件 src', srcInp));
        const row = H('div', 'dlg-row');
        row.append(Dialog.field('宽', wInp), Dialog.field('高', hInp));
        bd.appendChild(row);
        bd.appendChild(Dialog.field('名称 name', nameInp));
        bd.append(Dialog.field('滚动 scrolling', scrollSel), Dialog.field('边框 frameborder', frameSel));
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
    const items = [{ text: '首页', href: 'index.html' }];
    const dlg = Dialog.show({
      title: '插入导航条（超链接列表）', width: 460,
      buttons: [{ label: '插入', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd, ctrl) => {
        const list = H('div');
        list.id = 'dlg-nav-list';
        bd.appendChild(list);
        const addBtn = H('button', '', '＋ 添加一项');
        addBtn.addEventListener('click', () => { items.push({ text: '', href: '' }); render(); });
        bd.appendChild(addBtn);
        const alignSel = Dialog.select([['center', '居中'], ['left', '左对齐'], ['right', '右对齐']], 'center');
        bd.appendChild(Dialog.field('对齐', alignSel));
        function render() {
          list.innerHTML = '';
          items.forEach((it, i) => {
            const row = H('div', 'nav-row');
            const tInp = H('input');
            tInp.value = it.text;
            tInp.placeholder = '文字';
            tInp.addEventListener('input', () => { it.text = tInp.value; });
            const hInp = H('input');
            hInp.value = it.href;
            hInp.placeholder = '链接（如 index.html）';
            hInp.addEventListener('input', () => { it.href = hInp.value; });
            const del = H('button', '', '✕');
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
