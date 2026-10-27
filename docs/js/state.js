// state.js - Global state and a minimal pub/sub
const State = (() => {
  const listeners = {};
  const state = {
    docPath: null,        // Absolute path of the current document (null if unsaved)
    docName: 'Untitled-1',   // Display name
    dirty: false,         // Whether there are unsaved changes
    siteRoot: null,       // Open site folder
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
