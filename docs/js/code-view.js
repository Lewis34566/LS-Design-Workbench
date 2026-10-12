// code-view.js — 代码视图：textarea + 语法高亮叠层 + 行号（零依赖轻量实现）
const CodeView = (() => {
  let ta, pre, gutter, hint, applyBtn;
  let lastSync = null;
  let pending = false;

  function init() {
    ta = document.getElementById('code-ta');
    pre = document.getElementById('code-pre');
    gutter = document.getElementById('code-gutter');
    hint = document.getElementById('code-hint');
    applyBtn = document.getElementById('btn-apply-code');
    ta.addEventListener('input', onInput);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        insertText('  ');
      }
    });
    if (applyBtn) applyBtn.addEventListener('click', () => App.applyCodeToDesign());
  }

  function setValue(v) {
    ta.value = v;
    lastSync = v;
    pending = false;
    clearPendingUI();
    render();
  }
  function getValue() { return ta.value; }
  function focused() { return document.activeElement === ta; }
  function hasPendingChanges() { return pending; }

  function insertText(s) {
    ta.setRangeText(s, ta.selectionStart, ta.selectionEnd, 'end');
    render();
    onInput();
  }

  function onInput() {
    render();
    pending = true;
    hint.textContent = '代码已修改 — 按 F5 / 切到设计视图生效';
    applyBtn.classList.remove('hidden');
  }
  function clearPendingUI() {
    pending = false;
    if (hint) hint.textContent = '';
    if (applyBtn) applyBtn.classList.add('hidden');
  }

  function render() {
    if (!pre) return;
    const src = ta.value;
    pre.innerHTML = tokenize(src) + '\n';
    const lines = src.split('\n').length;
    let g = '';
    for (let i = 1; i <= lines; i++) g += i + '\n';
    gutter.textContent = g;
  }

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function tokenize(src) {
    const out = [];
    const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<[^>]*>|[^<]+/g;
    let m;
    while ((m = re.exec(src))) {
      const t = m[0];
      if (t.startsWith('<!--')) out.push(`<span class="tk-c">${esc(t)}</span>`);
      else if (t.startsWith('<!DOCTYPE')) out.push(`<span class="tk-d">${esc(t)}</span>`);
      else if (t.startsWith('<')) out.push(tagHtml(t));
      else out.push(esc(t));
    }
    return out.join('');
  }

  function tagHtml(t) {
    const close = t.startsWith('</');
    const i = close ? 2 : 1;
    const mname = /^[^\s>\/]+/.exec(t.slice(i));
    if (!mname) return esc(t);
    let html = esc(t.slice(0, i)) + `<span class="tk-t">${esc(mname[0])}</span>`;
    let lastIdx = i + mname[0].length;
    const are = /([^\s"'=<>\/]+)(=("[^"]*"|'[^']*'|[^\s"'=<>`]*))?/g;
    are.lastIndex = lastIdx;
    let am;
    while ((am = are.exec(t))) {
      html += ` <span class="tk-a">${esc(am[1])}</span>`;
      if (am[2] != null) html += `=<span class="tk-s">${esc(am[2])}</span>`;
      lastIdx = are.lastIndex;
    }
    html += esc(t.slice(lastIdx));
    return html;
  }

  return { init, setValue, getValue, focused, hasPendingChanges, insertText, clearPendingUI, get pending() { return pending; } };
})();
