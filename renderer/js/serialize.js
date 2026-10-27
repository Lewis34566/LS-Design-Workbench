// serialize.js - Clean serialization: exports HTML with no editor-injected traces
const Serialize = (() => {
  function cleanClone(doc) {
    const clone = doc.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-dw-selected]').forEach(n => n.removeAttribute('data-dw-selected'));
    clone.querySelectorAll('[data-dw-hover]').forEach(n => n.removeAttribute('data-dw-hover'));
    clone.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
    const st = clone.querySelector('#dw-editor-style');
    if (st) st.remove();
    // Restore the extracted <script> source
    clone.querySelectorAll('[data-dw-sid]').forEach(n => {
      const i = Number(n.getAttribute('data-dw-sid'));
      n.removeAttribute('data-dw-sid');
      n.textContent = Editor.scripts[i] || '';
    });
    // Strip the <tbody> that browsers add automatically (Dreamweaver / exam answers do not write tbody)
    clone.querySelectorAll('tbody').forEach(tb => {
      const parent = tb.parentNode;
      while (tb.firstChild) parent.insertBefore(tb.firstChild, tb);
      tb.remove();
    });
    return clone;
  }

  function doc() {
    if (!Editor.doc) return '';
    return '<!DOCTYPE html>\n' + cleanClone(Editor.doc).outerHTML;
  }

  return { doc, cleanClone };
})();
