// serialize.js — 干净序列化：导出不含任何编辑器注入痕迹的 HTML
const Serialize = (() => {
  function cleanClone(doc) {
    const clone = doc.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-dw-selected]').forEach(n => n.removeAttribute('data-dw-selected'));
    clone.querySelectorAll('[data-dw-hover]').forEach(n => n.removeAttribute('data-dw-hover'));
    clone.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
    const st = clone.querySelector('#dw-editor-style');
    if (st) st.remove();
    // 还原被抽离的 <script> 源码
    clone.querySelectorAll('[data-dw-sid]').forEach(n => {
      const i = Number(n.getAttribute('data-dw-sid'));
      n.removeAttribute('data-dw-sid');
      n.textContent = Editor.scripts[i] || '';
    });
    // 剥掉浏览器自动补的 <tbody>（Dreamweaver / 考试答案中不写 tbody）
    clone.querySelectorAll('tbody').forEach(tb => {
      const parent = tb.parentNode;
      while (tb.firstChild) parent.insertBefore(tb.firstChild, tb);
      tb.remove();
    });
    // 网页版：把渲染时替换掉的内联资源 URL 还原回原始相对路径
    if (window.DWVFS) window.DWVFS.restoreAssets(clone);
    return clone;
  }

  function doc() {
    if (!Editor.doc) return '';
    return '<!DOCTYPE html>\n' + cleanClone(Editor.doc).outerHTML;
  }

  return { doc, cleanClone };
})();
