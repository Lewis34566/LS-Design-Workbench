// dialogs.js — 轻量模态对话框 / 提示框 / 自定义右键菜单（无框架实现）
const api = window.dwAPI;

// 通用 DOM 构建小工具（各模块共用）
const H = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

const Dialog = (() => {
  // show({title, body, width, buttons, onMount}) → {promise, close, box, body}
  // buttons: [{label, primary, value, onClick(bd, close) → 返回 false 则不关闭}]
  function show({ title = '', body = '', width = 440, buttons, onMount }) {
    let resolveFn = null;
    const promise = new Promise(res => { resolveFn = res; });
    const root = document.getElementById('dlg-root');
    const overlay = H('div', 'dlg-overlay');
    const box = H('div', 'dlg');
    if (width) box.style.width = width + 'px';
    const tb = H('div', 'dlg-title', title);
    const bd = H('div', 'dlg-body');
    if (typeof body === 'string') bd.innerHTML = body;
    else bd.appendChild(body);
    const btns = H('div', 'dlg-btns');
    const close = v => { overlay.remove(); resolveFn(v); };
    const list = buttons || [{ label: '确定', primary: true, value: true }, { label: '取消', value: null }];
    for (const b of list) {
      const btn = H('button', b.primary ? 'primary' : '', b.label);
      btn.addEventListener('click', () => {
        const keep = b.onClick ? b.onClick(bd, close) : true;
        if (keep !== false) close(b.value);
      });
      btns.appendChild(btn);
    }
    box.append(tb, bd, btns);
    overlay.appendChild(box);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(null); });
    box.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(null); return; }
      if (e.key === 'Enter' && e.target.closest('input,select,textarea')) {
        const prim = box.querySelector('.dlg-btns .primary');
        if (prim) prim.click();
      }
    });
    root.appendChild(overlay);
    if (onMount) onMount(bd, { close, box });
    const first = bd.querySelector('input,select,textarea');
    if (first) setTimeout(() => first.focus(), 0);
    return { promise, close, box, body: bd };
  }

  function field(labelText, control, note) {
    const wrap = H('label', 'dlg-field');
    wrap.appendChild(H('span', 'dlg-label', labelText));
    wrap.appendChild(control);
    if (note) wrap.appendChild(H('span', 'dlg-note', note));
    return wrap;
  }
  function numInput(value = '', min = '1') {
    const inp = H('input');
    inp.type = 'number';
    inp.value = value;
    if (min != null) inp.min = min;
    return inp;
  }
  function check(checked, labelText) {
    const wrap = H('label', 'dlg-check');
    const inp = H('input');
    inp.type = 'checkbox';
    inp.checked = !!checked;
    wrap.append(inp, H('span', '', labelText));
    wrap.input = inp;
    return wrap;
  }
  function select(options, value = '') {
    const sel = H('select');
    for (const [v, l] of options) {
      const o = H('option');
      o.value = v;
      o.textContent = l;
      sel.appendChild(o);
    }
    sel.value = value;
    if (sel.selectedIndex === -1) sel.selectedIndex = 0; // 值不匹配时回退到第一项
    return sel;
  }

  function confirm(msg) {
    return show({
      title: '确认', width: 360, body: H('div', 'dlg-msg', msg),
      buttons: [{ label: '确定', primary: true, value: true }, { label: '取消', value: false }],
    }).promise;
  }

  // 保存确认：返回 'save' | 'discard' | 'cancel'
  function confirmSave() {
    return show({
      title: '未保存的更改', width: 400, body: H('div', 'dlg-msg', '当前文档有未保存的修改，要先保存吗？'),
      buttons: [
        { label: '保存', primary: true, value: 'save' },
        { label: '不保存', value: 'discard' },
        { label: '取消', value: 'cancel' },
      ],
    }).promise;
  }

  // 单行输入框，返回输入值或 null
  function prompt(title, labelText, defValue = '', { required = true } = {}) {
    const dlg = show({
      title, width: 380, buttons: [{ label: '确定', primary: true, value: true }, { label: '取消', value: null }],
      onMount: (bd, ctrl) => {
        const inp = H('input');
        inp.value = defValue;
        bd.appendChild(field(labelText, inp));
        setTimeout(() => { inp.focus(); inp.select(); }, 0);
        bd.addEventListener('keydown', e => {
          if (e.key === 'Enter' && bd.contains(e.target)) {
            e.preventDefault();
            if (required && !inp.value.trim()) return;
            ctrl.close(inp.value.trim());
          }
        });
        const ok = ctrl.box.querySelector('.dlg-btns .primary');
        ok.addEventListener('click', () => {
          if (required && !inp.value.trim()) { inp.focus(); return; }
          ctrl.close(inp.value.trim());
        });
      },
    });
    return dlg.promise;
  }

  return { show, field, numInput, check, select, confirm, confirmSave, prompt };
})();

// 自定义右键菜单（支持悬停子菜单）
const ContextMenu = (() => {
  let el = null;
  let hideHandler = null;

  function show(items, x, y) {
    if (!el) el = document.getElementById('ctxmenu');
    el.innerHTML = '';
    el.appendChild(buildList(items));
    el.classList.remove('hidden');
    el.style.left = '0px';
    el.style.top = '0px';
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.min(x, window.innerWidth - w - 6) + 'px';
    el.style.top = Math.min(y, window.innerHeight - h - 6) + 'px';
    if (hideHandler) document.removeEventListener('mousedown', hideHandler, true);
    hideHandler = e => {
      if (!el.contains(e.target)) hide();
    };
    document.addEventListener('mousedown', hideHandler, true);
  }

  function hide() {
    if (!el) return;
    el.classList.add('hidden');
    if (hideHandler) { document.removeEventListener('mousedown', hideHandler, true); hideHandler = null; }
  }

  function buildList(items) {
    const ul = H('ul', 'ctx-list');
    for (const it of items) {
      if (it === '-') { ul.appendChild(H('li', 'ctx-sep')); continue; }
      const li = H('li', 'ctx-item' + (it.disabled ? ' disabled' : ''));
      li.appendChild(H('span', 'ctx-label', it.label));
      if (it.sub) {
        li.classList.add('has-sub');
        li.appendChild(H('span', 'ctx-arrow', '▶'));
        li.appendChild(buildList(it.sub));
      } else if (!it.disabled) {
        li.addEventListener('mousedown', e => {
          e.preventDefault();
          e.stopPropagation();
          hide();
          it.run();
        });
      }
      ul.appendChild(li);
    }
    return ul;
  }

  return { show, hide };
})();
