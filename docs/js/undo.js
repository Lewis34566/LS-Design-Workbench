// undo.js — 撤销/重做：整页 HTML 快照栈（上限 100 步）
const Undo = (() => {
  const MAX = 100;
  let stack = [];
  let idx = -1;
  let timer = null;
  let pending = false;

  function clearPending() {
    if (timer) { clearTimeout(timer); timer = null; }
    pending = false;
  }

  function reset(html) {
    stack = [html];
    idx = 0;
    clearPending();
  }

  function commit(html) {
    clearPending();
    if (html === stack[idx]) return;
    stack = stack.slice(0, idx + 1);
    stack.push(html);
    if (stack.length > MAX) stack.shift();
    idx = stack.length - 1;
  }

  // 连续修改（颜色拖拽、打字）合并成一次提交
  function debounce() {
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      pending = false;
      commit(App.currentHtml());
    }, 500);
  }

  // 撤销前先把未落盘的修改提交，保证能退到“上一步”
  function flush() {
    if (!pending) return;
    clearPending();
    commit(App.currentHtml());
  }

  function canUndo() { return idx > 0; }
  function canRedo() { return idx < stack.length - 1; }
  function undo() {
    flush();
    if (!canUndo()) return null;
    return stack[--idx];
  }
  function redo() {
    flush();
    if (!canRedo()) return null;
    return stack[++idx];
  }
  function depth() { return { idx, len: stack.length }; }

  return { reset, commit, debounce, flush, canUndo, canRedo, undo, redo, depth };
})();
