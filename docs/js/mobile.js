// mobile.js — 手机 / 窄屏适配：面板最小化、面板开关菜单、整体缩放、长按弹菜单
// 纯增量注入，不改动桌面版任何原有逻辑。
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

  /* 可独立最小化的四个面板单元 */
  var UNITS = [
    { id: 'design-pane', name: '设计视图',          head: null,                      built: false },
    { id: 'code-pane',   name: '源代码',            head: '#code-pane .code-head',   built: false },
    { id: 'left',        name: '插入 / 文件 / CSS', head: '#left .tabs',             built: false },
    { id: 'right',       name: '属性面板',          head: '#right .props-title',     built: false },
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
     1. 面板最小化
     ========================================================== */

  function injectToggles() {
    UNITS.forEach(function (u) {
      var box = byId(u.id);
      if (!box || u.built) return;
      var head = u.head ? qs(u.head) : null;

      if (!head) {
        // 设计视图原本没有标题栏，自建一条
        head = make('div', 'm-head');
        head.appendChild(make('span', 'm-title', u.name));
        head.appendChild(make('span', 'm-sp'));
        box.insertBefore(head, box.firstChild);
      } else if (u.id === 'right' && !qs('.m-sp', head)) {
        head.appendChild(make('span', 'm-sp'));
      }

      var btn = make('button', 'm-toggle');
      btn.type = 'button';
      btn.title = '最小化 / 展开「' + u.name + '」';
      btn.setAttribute('aria-label', '最小化 ' + u.name);
      btn.textContent = '—';
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
    if (u && u.btn) u.btn.textContent = min ? '▸' : '—';
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
     2. 底部控制条
     ========================================================== */

  function buildBar() {
    bar = make('div');
    bar.id = 'm-bar';

    var panelBtn = make('button', '', '▤ 面板');
    panelBtn.title = '显示或最小化各个面板';
    panelBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (menuEl) closeMenu(); else openMenu();
    });

    var out = make('button', 'm-zbtn', '−');
    out.title = '缩小界面';
    out.addEventListener('click', function () { applyZoom(zoom - ZOOM_STEP); });

    zoomVal = make('span');
    zoomVal.id = 'm-zoom-val';
    zoomVal.textContent = '100%';
    zoomVal.title = '点击恢复 100%';
    zoomVal.addEventListener('click', function () { applyZoom(1); });

    var inc = make('button', 'm-zbtn', '＋');
    inc.title = '放大界面';
    inc.addEventListener('click', function () { applyZoom(zoom + ZOOM_STEP); });

    allBtn = make('button', '', '收起全部');
    allBtn.title = '把所有面板收成标题条';
    allBtn.addEventListener('click', function () {
      setAll(!allMinimized());
    });

    bar.append(panelBtn, out, zoomVal, inc, make('span', 'm-sp'), allBtn);
    byId('app').appendChild(bar);
    syncBar();
  }

  function syncBar() {
    if (!allBtn) return;
    allBtn.textContent = allMinimized() ? '展开全部' : '收起全部';
    if (menuEl) refreshMenu();
  }

  /* ==========================================================
     3. 面板开关菜单
     ========================================================== */

  function buildMenu() {
    menuEl = make('div');
    menuEl.id = 'm-menu';
    menuEl.addEventListener('click', function (e) { e.stopPropagation(); });
    document.body.appendChild(menuEl);
  }

  function refreshMenu() {
    if (!menuEl) return;
    var tip = make('div', 'm-tip', '点面板名可最小化 / 展开，并跳到该面板');
    menuEl.innerHTML = '';
    menuEl.appendChild(tip);

    UNITS.forEach(function (u) {
      var box = byId(u.id);
      var off = box.classList.contains('m-min');
      var item = make('div', 'm-item' + (off ? ' off' : ''));
      item.appendChild(make('span', 'm-dot'));
      item.appendChild(make('span', '', u.name));
      item.appendChild(make('span', 'm-st', off ? '已最小化' : '显示中'));
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
     4. 整体缩放
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
      // zoom 会同时缩放元素占位，这里做反向补偿，让画面正好铺满视口
      app.style.width = (100 / zoom) + '%';
      app.style.height = (100 / zoom) + '%';
      document.documentElement.classList.add('dw-zoomed');
    }
    if (zoomVal) zoomVal.textContent = Math.round(zoom * 100) + '%';
    if (!silent) {
      try { localStorage.setItem(ZOOM_STORE, String(zoom)); } catch (e) { /* 忽略 */ }
    }
    // 缩放会改变设计视图可用宽度，让内部重排一次
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* 忽略 */ }
  }

  /* ==========================================================
     5. 触屏长按 = 右键菜单（设计视图内）
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
          // 注意：主脚本里 App/Editor/State 都是顶层 const，不在 window 上，统一走 window.DW
          var dw = window.DW || {};
          if (el && dw.editor && dw.editor.selectEl) dw.editor.selectEl(el);
          var rect = frame.getBoundingClientRect();
          if (dw.app && dw.app.showContextMenu) {
            dw.app.showContextMenu(rect.left + sx, rect.top + sy);
          }
        } catch (err) { /* 忽略 */ }
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
        // 长按已弹出菜单，吞掉这次抬手合成的 click / mousedown，避免误点到菜单项
        e.preventDefault();
        fired = false;
      } else if (moved) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  /* ==========================================================
     6. 启动
     ========================================================== */

  function boot() {
    injectToggles();
    buildBar();

    // 恢复上次的缩放比例
    var saved = 1;
    try { saved = parseFloat(localStorage.getItem(ZOOM_STORE)) || 1; } catch (e) { /* 忽略 */ }
    applyZoom(saved, true);
    if (zoom !== 1) zoomVal.textContent = Math.round(zoom * 100) + '%';
    else zoomVal.textContent = '100%';

    bindFrameTouch();
    if (window.DW && DW.state && DW.state.on) DW.state.on('design-loaded', function () { setTimeout(bindFrameTouch, 0); });

    // 从宽屏切到窄屏（或旋屏）时刷新控制条状态
    var onMq = function () {
      closeMenu();
      applyZoom(zoom, true);
    };
    if (MQ.addEventListener) MQ.addEventListener('change', onMq);
    else if (MQ.addListener) MQ.addListener(onMq);

    if (byId('app') && !document.body.classList.contains('dw-ready')) {
      // 应用还没启动完成，稍后再补一次（head 元素此时应已存在）
      setTimeout(function () { injectToggles(); bindFrameTouch(); }, 600);
    }
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(boot);

  // 供自动化测试 / 调试使用
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
