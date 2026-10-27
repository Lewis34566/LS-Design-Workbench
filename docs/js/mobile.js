// mobile.js - Phone / narrow-screen adaptation: panel minimization, panel toggle menu, global zoom, long-press context menu
// Purely additive injection; it does not change any existing desktop logic.
(function () {
  'use strict';
  if (window.__dwMobileReady) return;
  window.__dwMobileReady = true;

  var MQ = window.matchMedia('(max-width: 900px)');
  var ZOOM_MIN = 0.45;
  var ZOOM_MAX = 1.5;
  var ZOOM_STEP = 0.1;
  var ZOOM_STORE = 'dw-zoom';
  var zoom = 1;

  /* The four panel units that can be minimized independently */
  var UNITS = [
    { id: 'design-pane', name: 'Design view',          head: null,                      built: false },
    { id: 'code-pane',   name: 'Code',                 head: '#code-pane .code-head',   built: false },
    { id: 'left',        name: 'Insert / Files / CSS', head: '#left .tabs',             built: false },
    { id: 'right',       name: 'Properties',           head: '#right .props-title',     built: false },
  ];

  var bar, zoomVal, allBtn, menuEl = null;

  function byId(id) { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }

  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function unitOf(id) {
    for (var i = 0; i < UNITS.length; i++) if (UNITS[i].id === id) return UNITS[i];
    return null;
  }

  /* ==========================================================
     1. Panel minimization
     ========================================================== */

  function injectToggles() {
    UNITS.forEach(function (u) {
      var box = byId(u.id);
      if (!box || u.built) return;
      var head = u.head ? qs(u.head) : null;

      if (!head) {
        // The design view originally has no header bar, so build one
        head = make('div', 'm-head');
        head.appendChild(make('span', 'm-title', u.name));
        head.appendChild(make('span', 'm-sp'));
        box.insertBefore(head, box.firstChild);
      } else if (u.id === 'right' && !qs('.m-sp', head)) {
        head.appendChild(make('span', 'm-sp'));
      }

      var btn = make('button', 'm-toggle');
      btn.type = 'button';
      btn.title = 'Minimize / expand "' + u.name + '"';
      btn.setAttribute('aria-label', 'Minimize ' + u.name);
      btn.textContent = '-';
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleUnit(u.id);
      });
      head.appendChild(btn);

      u.btn = btn;
      u.headEl = head;
      u.built = true;
    });
  }

  function toggleUnit(id, force) {
    var box = byId(id);
    if (!box) return;
    var u = unitOf(id);
    var min = (typeof force === 'boolean') ? force : !box.classList.contains('m-min');
    box.classList.toggle('m-min', min);
    if (u && u.btn) u.btn.textContent = min ? '>' : '-';
    syncBar();
  }

  function setAll(min) {
    UNITS.forEach(function (u) { toggleUnit(u.id, min); });
  }

  function allMinimized() {
    return UNITS.every(function (u) {
      var box = byId(u.id);
      return box && box.classList.contains('m-min');
    });
  }

  /* ==========================================================
     2. Bottom control bar
     ========================================================== */

  function buildBar() {
    bar = make('div');
    bar.id = 'm-bar';

    var panelBtn = make('button', '', 'Panels');
    panelBtn.title = 'Show or minimize the panels';
    panelBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (menuEl) closeMenu(); else openMenu();
    });

    var out = make('button', 'm-zbtn', '-');
    out.title = 'Zoom out';
    out.addEventListener('click', function () { applyZoom(zoom - ZOOM_STEP); });

    zoomVal = make('span');
    zoomVal.id = 'm-zoom-val';
    zoomVal.textContent = '100%';
    zoomVal.title = 'Click to reset to 100%';
    zoomVal.addEventListener('click', function () { applyZoom(1); });

    var inc = make('button', 'm-zbtn', '+');
    inc.title = 'Zoom in';
    inc.addEventListener('click', function () { applyZoom(zoom + ZOOM_STEP); });

    allBtn = make('button', '', 'Collapse all');
    allBtn.title = 'Collapse all panels to title bars';
    allBtn.addEventListener('click', function () {
      setAll(!allMinimized());
    });

    bar.append(panelBtn, out, zoomVal, inc, make('span', 'm-sp'), allBtn);
    byId('app').appendChild(bar);
    syncBar();
  }

  function syncBar() {
    if (!allBtn) return;
    allBtn.textContent = allMinimized() ? 'Expand all' : 'Collapse all';
    if (menuEl) refreshMenu();
  }

  /* ==========================================================
     3. Panel toggle menu
     ========================================================== */

  function buildMenu() {
    menuEl = make('div');
    menuEl.id = 'm-menu';
    menuEl.addEventListener('click', function (e) { e.stopPropagation(); });
    document.body.appendChild(menuEl);
  }

  function refreshMenu() {
    if (!menuEl) return;
    var tip = make('div', 'm-tip', 'Click a panel name to minimize / expand it and jump to that panel');
    menuEl.innerHTML = '';
    menuEl.appendChild(tip);

    UNITS.forEach(function (u) {
      var box = byId(u.id);
      var off = box.classList.contains('m-min');
      var item = make('div', 'm-item' + (off ? ' off' : ''));
      item.appendChild(make('span', 'm-dot'));
      item.appendChild(make('span', '', u.name));
      item.appendChild(make('span', 'm-st', off ? 'Minimized' : 'Visible'));
      item.addEventListener('click', function () {
        toggleUnit(u.id);
        closeMenu();
        if (!byId(u.id).classList.contains('m-min')) {
          try { byId(u.id).scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { byId(u.id).scrollIntoView(); }
        }
      });
      menuEl.appendChild(item);
    });
  }

  function openMenu() {
    if (!menuEl) buildMenu();
    refreshMenu();
    menuEl.classList.remove('hidden');
    menuEl.style.display = 'block';
    setTimeout(function () { document.addEventListener('click', onDocClick, true); }, 0);
  }

  function closeMenu() {
    if (!menuEl) return;
    menuEl.style.display = 'none';
    document.removeEventListener('click', onDocClick, true);
  }

  function onDocClick(e) {
    if (menuEl && !menuEl.contains(e.target)) closeMenu();
  }

  /* ==========================================================
     4. Global zoom
     ========================================================== */

  function applyZoom(z, silent) {
    zoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
    var app = byId('app');
    if (!app) return;

    if (zoom === 1) {
      app.style.zoom = '';
      app.style.width = '';
      app.style.height = '';
      document.documentElement.classList.remove('dw-zoomed');
    } else {
      app.style.zoom = zoom;
      // zoom also scales the element boxes; compensate in reverse so the view fills the viewport exactly
      app.style.width = (100 / zoom) + '%';
      app.style.height = (100 / zoom) + '%';
      document.documentElement.classList.add('dw-zoomed');
    }
    if (zoomVal) zoomVal.textContent = Math.round(zoom * 100) + '%';
    if (!silent) {
      try { localStorage.setItem(ZOOM_STORE, String(zoom)); } catch (e) { /* ignore */ }
    }
    // Zooming changes the usable width of the design view, so let the inner layout reflow once
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ }
  }

  /* ==========================================================
     5. Touch long-press = context menu (inside the design view)
     ========================================================== */

  function bindFrameTouch() {
    var frame = byId('design-frame');
    if (!frame) return;
    var doc;
    try { doc = frame.contentDocument; } catch (e) { return; }
    if (!doc || doc.__dwTouchBound) return;
    doc.__dwTouchBound = true;

    var timer = null, sx = 0, sy = 0, moved = false, fired = false;

    doc.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { clearTimeout(timer); timer = null; return; }
      var t = e.touches[0];
      sx = t.clientX; sy = t.clientY; moved = false; fired = false;
      clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        fired = true;
        try {
          var el = doc.elementFromPoint(sx, sy);
          // Note: in the main script App/Editor/State are top-level consts, not properties of window; use window.DW
          var dw = window.DW || {};
          if (el && dw.editor && dw.editor.selectEl) dw.editor.selectEl(el);
          var rect = frame.getBoundingClientRect();
          if (dw.app && dw.app.showContextMenu) {
            dw.app.showContextMenu(rect.left + sx, rect.top + sy);
          }
        } catch (err) { /* ignore */ }
      }, 480);
    }, { passive: true });

    doc.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8) {
        moved = true;
        if (timer) { clearTimeout(timer); timer = null; }
      }
    }, { passive: true });

    doc.addEventListener('touchend', function (e) {
      if (timer) { clearTimeout(timer); timer = null; return; }
      if (fired) {
        // The long-press already opened the menu; swallow the click / mousedown synthesized on release to avoid hitting a menu item by mistake
        e.preventDefault();
        fired = false;
      } else if (moved) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  /* ==========================================================
     6. Startup
     ========================================================== */

  function boot() {
    injectToggles();
    buildBar();

    // Restore the last zoom level
    var saved = 1;
    try { saved = parseFloat(localStorage.getItem(ZOOM_STORE)) || 1; } catch (e) { /* ignore */ }
    applyZoom(saved, true);
    if (zoom !== 1) zoomVal.textContent = Math.round(zoom * 100) + '%';
    else zoomVal.textContent = '100%';

    bindFrameTouch();
    if (window.DW && DW.state && DW.state.on) DW.state.on('design-loaded', function () { setTimeout(bindFrameTouch, 0); });

    // Refresh the control bar state when switching from wide to narrow (or rotating)
    var onMq = function () {
      closeMenu();
      applyZoom(zoom, true);
    };
    if (MQ.addEventListener) MQ.addEventListener('change', onMq);
    else if (MQ.addListener) MQ.addListener(onMq);

    if (byId('app') && !document.body.classList.contains('dw-ready')) {
      // The app has not finished starting yet; try again a bit later (the head elements should exist by then)
      setTimeout(function () { injectToggles(); bindFrameTouch(); }, 600);
    }
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(boot);

  // For automated tests / debugging
  window.DWMobile = {
    toggleUnit: toggleUnit,
    setAll: setAll,
    allMinimized: allMinimized,
    applyZoom: applyZoom,
    getZoom: function () { return zoom; },
    openMenu: openMenu,
    closeMenu: closeMenu,
    isNarrow: function () { return MQ.matches; },
    units: UNITS,
  };
})();
