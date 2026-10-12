// state.js — 全局状态与极简发布订阅
const State = (() => {
  const listeners = {};
  const state = {
    docPath: null,        // 当前文档的绝对路径（未保存为 null）
    docName: '未命名-1',   // 显示名
    dirty: false,         // 是否有未保存修改
    siteRoot: null,       // 已打开的站点文件夹
    mode: 'split',        // 'design' | 'split' | 'code'
    selection: null,      // { path: number[], extras: number[][] }
    untitledSeq: 0,
  };

  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, data) { (listeners[ev] || []).forEach(fn => fn(data)); }
  function setDirty(v) {
    if (state.dirty !== v) { state.dirty = v; emit('dirty-changed'); }
  }

  return Object.assign(state, { on, emit, setDirty });
})();
