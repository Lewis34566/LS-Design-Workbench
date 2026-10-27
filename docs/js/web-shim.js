/* ============================================================
 * web-shim.js - Web edition compatibility layer
 * The desktop edition (Electron) relies on preload.js exposing window.dwAPI to read and write the local disk.
 * The web edition has no local file system, so this file implements the same dwAPI with an "in-browser virtual site":
 *   - C:\LS Site      root of the site (text files are stored in localStorage and survive refreshes)
 *   - C:\Local Import files picked via "Browse..."; they are copied automatically into the site's images/ etc.
 *   - C:\Temp         temporary files for browser preview
 * As long as index.html loads this file first, the 12 upstream modules need no code changes (except 4 small patches).
 * ============================================================ */
(function () {
  'use strict';

  var ROOT = 'C:\\LS Site';
  var UPLOAD = 'C:\\Local Import';
  var TMP = 'C:\\Temp';
  var LS_KEY = 'ls-dw-web-vfs-v1';

  var TEXT_EXT = ['.html', '.htm', '.css', '.js', '.txt', '.json'];

  /* ---------------- Path utilities (Windows style, backslashes) ---------------- */
  function win(p) { return String(p == null ? '' : p).replace(/\//g, '\\'); }
  function key(p) {
    var s = win(p).replace(/\\+/g, '\\').replace(/\\+$/, '');
    return s ? s.toLowerCase() : '\\';
  }
  function pathJoin() {
    var ps = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (a != null && a !== '') ps.push(win(a));
    }
    if (!ps.length) return '';
    var out = ps[0].replace(/\\+$/, '');
    for (var j = 1; j < ps.length; j++) {
      var seg = ps[j].replace(/^\\+/, '');
      out += (out.charAt(out.length - 1) === '\\' ? '' : '\\') + seg;
    }
    return out.replace(/\\+/g, '\\');
  }
  function pathDirname(p) {
    var s = win(p).replace(/\\+$/, '');
    var i = s.lastIndexOf('\\');
    if (i < 0) return '';
    if (i === 2 && /^[a-zA-Z]:/.test(s)) return s.slice(0, 3);
    return s.slice(0, i) || '\\';
  }
  function pathBasename(p) {
    var s = win(p).replace(/\\+$/, '');
    var i = s.lastIndexOf('\\');
    return i < 0 ? s : s.slice(i + 1);
  }
  function pathExtname(p) {
    var b = pathBasename(p);
    var i = b.lastIndexOf('.');
    return i > 0 ? b.slice(i) : '';
  }
  function pathRelative(from, to) {
    var a = win(from).replace(/\\+$/, '').split('\\').filter(Boolean);
    var b = win(to).replace(/\\+$/, '').split('\\').filter(Boolean);
    var i = 0;
    while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
    var parts = [];
    for (var k = 0; k < a.length - i; k++) parts.push('..');
    var tail = b.slice(i);
    var out = parts.concat(tail).join('\\');
    return out || '.';
  }

  /* ---------------- Virtual file system ---------------- */
  // files: key -> { path, isDir, text?, dataUrl?, blob?, mime? }
  var files = new Map();
  var blobCache = new Map();   // key -> objectURL

  function entry(p) { return files.get(key(p)) || null; }
  function isFile(p) { var e = entry(p); return !!(e && !e.isDir); }

  function ensureParents(p) {
    var d = pathDirname(p);
    while (d && d !== '\\' && !files.has(key(d))) {
      files.set(key(d), { path: win(d), isDir: true });
      d = pathDirname(d);
    }
  }
  function putText(p, text) {
    ensureParents(p);
    files.set(key(p), { path: win(p), isDir: false, text: String(text), mime: 'text/plain' });
    persist();
  }
  function putBinary(p, dataUrl, blob, mime) {
    ensureParents(p);
    files.set(key(p), { path: win(p), isDir: false, dataUrl: dataUrl, blob: blob, mime: mime || 'application/octet-stream' });
  }
  function drop(p) {
    var k = key(p);
    if (files.has(k)) files.delete(k);
    var prefix = k + '\\';
    Array.from(files.keys()).forEach(function (x) { if (x.indexOf(prefix) === 0) files.delete(x); });
    var c = blobCache.get(k);
    if (c) { try { URL.revokeObjectURL(c); } catch (e) {} blobCache.delete(k); }
    persist();
  }

  /* Local persistence: store text only (images are large and may exceed the quota; ignore failures) */
  function persist() {
    try {
      var entries = [];
      files.forEach(function (e) {
        if (e.isDir) entries.push({ p: e.path, d: 1 });
        else if (e.text != null) entries.push({ p: e.path, t: e.text });
      });
      localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, entries: entries }));
    } catch (err) { /* Quota exceeded / private mode: ignore */ }
  }
  function restore() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !data.entries || !data.entries.length) return false;
      data.entries.forEach(function (it) {
        if (it.d) files.set(key(it.p), { path: it.p, isDir: true });
        else files.set(key(it.p), { path: it.p, isDir: false, text: it.t, mime: 'text/plain' });
      });
      return files.size > 0;
    } catch (err) { return false; }
  }

  /* ---------------- File tree ---------------- */
  function readTree(root) {
    var rk = key(root);
    var rootNode = { name: pathBasename(root) || root, path: win(root), type: 'dir', children: [] };
    var dirNodes = new Map();
    function dirNode(dirPath) {
      var dk = key(dirPath);
      if (dk === rk) return rootNode;
      if (dirNodes.has(dk)) return dirNodes.get(dk);
      var n = { name: pathBasename(dirPath), path: win(dirPath), type: 'dir', children: [] };
      dirNodes.set(dk, n);
      var parent = dirNode(pathDirname(dirPath));
      if (parent) parent.children.push(n);
      return n;
    }
    files.forEach(function (e) {
      var ek = key(e.path);
      if (ek !== rk && ek.indexOf(rk + '\\') !== 0) return;
      if (ek === rk) return;
      if (e.isDir) { dirNode(e.path); return; }
      var parent = pathDirname(e.path);
      var list = (key(parent) === rk) ? rootNode.children : dirNode(parent).children;
      list.push({ name: pathBasename(e.path), path: e.path, type: 'file', ext: pathExtname(e.path).toLowerCase() });
    });
    (function sort(nodes) {
      nodes.sort(function (a, b) {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name, 'en');
      });
      nodes.forEach(function (n) { if (n.children) sort(n.children); });
    })(rootNode.children);
    return rootNode.children;
  }

  /* ---------------- Asset URLs: virtual path <-> usable URL ---------------- */
  function urlFor(p) {
    var e = entry(p);
    if (!e || e.isDir) return null;
    if (e.blob) {
      var k = key(p);
      var c = blobCache.get(k);
      if (!c) { c = URL.createObjectURL(e.blob); blobCache.set(k, c); }
      return c;
    }
    return e.dataUrl || null;
  }
  function pathForUrl(u) {
    if (!u) return null;
    var hit = null;
    blobCache.forEach(function (url, k) { if (url === u) { var e = files.get(k); if (e) hit = e.path; } });
    if (hit) return hit;
    files.forEach(function (e) { if (e.dataUrl && e.dataUrl === u) hit = e.path; });
    return hit;
  }
  function currentBase() {
    try {
      if (typeof State !== 'undefined' && State) {
        if (State.docPath) return pathDirname(State.docPath);
        if (State.siteRoot) return State.siteRoot;
      }
    } catch (e) {}
    return ROOT;
  }
  function resolveRef(ref) {
    if (!ref) return null;
    if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(ref) || ref.indexOf('//') === 0 || ref.charAt(0) === '#') return null;
    return pathJoin(currentBase(), win(ref));
  }
  function relFor(absPath) {
    return pathRelative(currentBase(), absPath).replace(/\\/g, '/');
  }

  var INLINE_ATTRS = ['src', 'background', 'poster'];

  /* Before rendering: replace relative media asset paths with URLs the browser can display directly
     (this only changes the copy used for this render; restoreAssets restores everything on export) */
  function inlineAssets(doc) {
    var nodes = doc.querySelectorAll('[src],[background],[poster]');
    Array.prototype.forEach.call(nodes, function (el) {
      INLINE_ATTRS.forEach(function (a) {
        var v = el.getAttribute && el.getAttribute(a);
        if (!v) return;
        var abs = resolveRef(v);
        if (!abs) return;
        var u = urlFor(abs);
        if (u) el.setAttribute(a, u);
      });
    });
    // External stylesheets: .css files inside the site are inlined as <style> in the design view; otherwise the relative path cannot resolve and the styles do not apply
    Array.prototype.forEach.call(doc.querySelectorAll('link[rel~="stylesheet"][href]'), function (link) {
      var abs = resolveRef(link.getAttribute('href'));
      if (!abs) return;
      var e = files.get(key(abs));
      if (!e || e.text == null) return;
      var st = doc.createElement('style');
      st.setAttribute('data-dw-inlined', abs);
      st.textContent = e.text;
      link.parentNode.replaceChild(st, link);
    });
  }

  /* Before export: restore URLs / inlined styles to their original form so the exported code matches the desktop edition exactly */
  function restoreAssets(clone) {
    var nodes = clone.querySelectorAll('[src],[background],[poster]');
    Array.prototype.forEach.call(nodes, function (el) {
      INLINE_ATTRS.forEach(function (a) {
        var v = el.getAttribute && el.getAttribute(a);
        if (!v) return;
        var abs = pathForUrl(v);
        if (abs) el.setAttribute(a, window.DWVFS.relFor(abs));
      });
    });
    Array.prototype.forEach.call(clone.querySelectorAll('style[data-dw-inlined]'), function (st) {
      var abs = st.getAttribute('data-dw-inlined');
      var owner = clone.ownerDocument || document;
      var link = owner.createElement('link');
      link.setAttribute('rel', 'stylesheet');
      link.setAttribute('href', window.DWVFS.relFor(abs));
      if (st.parentNode) st.parentNode.replaceChild(link, st);
    });
  }

  /* Properties panel display: turn an inline URL back into the relative path the user understands */
  function display(v) {
    if (!v) return v || '';
    var abs = pathForUrl(v);
    return abs ? relFor(abs) : v;
  }

  /* ---------------- Browser file picker ---------------- */
  function pickBrowserFile(accept) {
    return new Promise(function (resolve) {
      var inp = document.createElement('input');
      inp.type = 'file';
      if (accept) inp.accept = accept;
      inp.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(inp);
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        try { inp.remove(); } catch (e) {}
        resolve(v);
      }
      inp.addEventListener('change', function () {
        finish(inp.files && inp.files[0] ? inp.files[0] : null);
      });
      // When the user closes the system picker directly, change never fires; fall back to window focus
      window.addEventListener('focus', function () { setTimeout(function () { finish(null); }, 1200); }, { once: true });
      inp.click();
    });
  }

  function toArrayBuffer(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsArrayBuffer(file);
    });
  }
  function toDataUrl(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(file);
    });
  }
  /* Detect UTF-8 / GBK automatically: exam materials are often GBK encoded, and reading them as UTF-8 produces garbled text */
  function decodeSmart(buf) {
    var bytes = new Uint8Array(buf);
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      try { return new TextDecoder('utf-8').decode(bytes.subarray(3)); } catch (e) {}
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) {}
    try { return new TextDecoder('gbk').decode(bytes); } catch (e) {}
    try { return new TextDecoder('utf-8').decode(bytes); } catch (e) {}
    return '';
  }
  async function readSmartText(file) { return decodeSmart(await toArrayBuffer(file)); }

  function isTextName(name) { return TEXT_EXT.indexOf(pathExtname(name).toLowerCase()) >= 0; }

  function uniqName(p) {
    if (!isFile(p) && !files.has(key(p))) return p;
    var ext = pathExtname(p), base = pathBasename(p);
    var stem = base.slice(0, base.length - ext.length), dir = pathDirname(p);
    var i = 1, n;
    do { n = pathJoin(dir, stem + '_' + (i++) + ext); } while (files.has(key(n)));
    return n;
  }

  function toast(msg) {
    try { if (typeof App !== 'undefined' && App.toast) { App.toast(msg); return; } } catch (e) {}
    console.log('[DW]', msg);
  }

  /* ---------------- Import / export ---------------- */
  async function importFileInto(dirPath, file) {
    var name = uniqName(pathJoin(dirPath, file.name));
    if (isTextName(file.name)) {
      putText(name, await readSmartText(file));
      return { path: name };
    }
    var dataUrl = await toDataUrl(file);
    var blob;
    try { blob = await (await fetch(dataUrl)).blob(); } catch (e) { blob = new Blob([], { type: file.type || '' }); }
    putBinary(name, dataUrl, blob, file.type);
    return { path: name, blob: blob };
  }

  function download(name, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  /* ---------------- dwAPI implementation ---------------- */
  var api = {
    getStartupArgs: async function () {
      return { site: ROOT, file: pathJoin(ROOT, 'index.html') };
    },
    openFolder: async function () {
      toast('The web edition uses a built-in virtual site folder; files are stored in your local browser');
      return ROOT;
    },
    openFile: async function () {
      var f = await pickBrowserFile('.html,.htm,text/html,text/plain');
      if (!f) return null;
      var r = await importFileInto(ROOT, f);
      toast('Imported page: ' + pathBasename(r.path));
      return r.path;
    },
    saveFile: async function (def) {
      var d = win(def || pathJoin(ROOT, 'Unsaved.html'));
      var cur = pathBasename(d) || 'index.html';
      var input = await askName('Save As', 'File name (saved under ' + pathDirname(d) + ' in the site)', cur);
      if (!input) return null;
      var name = String(input).replace(/[\\/:*?"<>|]/g, '_').trim();
      if (!/\.[a-z0-9]+$/i.test(name)) name += '.html';
      return pathJoin(pathDirname(d), name);
    },
    pickFile: async function (kind) {
      var accept = { image: 'image/*', audio: 'audio/*', video: 'video/*', css: '.css,text/css' }[kind] || '*/*';
      var f = await pickBrowserFile(accept);
      if (!f) return null;
      var r = await importFileInto(UPLOAD, f);
      return r.path;
    },
    readTree: async function (root) { return readTree(root); },
    read: async function (p) {
      var e = entry(p);
      if (!e || e.isDir) throw new Error('Cannot read: ' + p);
      return e.text != null ? e.text : (e.dataUrl || '');
    },
    write: async function (p, content) { putText(p, content); return true; },
    mkdir: async function (p) { ensureParents(p); files.set(key(p), { path: win(p), isDir: true }); persist(); return true; },
    copy: async function (src, dest) {
      var e = entry(src);
      if (!e) throw new Error('File not found: ' + src);
      ensureParents(dest);
      files.set(key(dest), Object.assign({}, e, { path: win(dest), isDir: false }));
      persist();
      return true;
    },
    exists: async function (p) { return files.has(key(p)); },
    remove: async function (p) { drop(p); return true; },
    rename: async function (a, b) {
      var src = entry(a);
      if (!src) return false;
      ensureParents(b);
      files.set(key(b), Object.assign({}, src, { path: win(b) }));
      files.delete(key(a));
      var prefix = key(a) + '\\', np = key(b) + '\\';
      Array.from(files.keys()).forEach(function (x) {
        if (x.indexOf(prefix) === 0) {
          var e = files.get(x);
          e.path = win(b) + e.path.slice(win(a).length);
          files.set(np + x.slice(prefix.length), e);
          files.delete(x);
        }
      });
      persist();
      return true;
    },
    tempPath: async function () { return pathJoin(TMP, 'ls-dw-preview-' + Date.now() + '.html'); },
    pathJoin: async function () { return pathJoin.apply(null, arguments); },
    pathDirname: async function (p) { return pathDirname(p); },
    pathBasename: async function (p) { return pathBasename(p); },
    pathExtname: async function (p) { return pathExtname(p); },
    pathRelative: async function (a, b) { return pathRelative(a, b); },

    shellOpen: async function (p) {
      var e = entry(p);
      if (!e || e.isDir) { toast('Preview failed: the file does not exist'); return; }
      var html;
      if (e.text != null) {
        var parsed = new DOMParser().parseFromString(e.text, 'text/html');
        inlineAssets(parsed);
        html = '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML;
      } else if (e.blob) {
        window.open(urlFor(p), '_blank');
        return;
      } else { toast('This file cannot be previewed'); return; }
      var url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    },
    shellShowItem: async function () { toast('Web edition: files live in the virtual site inside this page'); },

    onMenu: function () { /* The web edition has no native menu; the toolbar and insert panel cover all features */ },
  };

  async function askName(title, label, def) {
    try {
      if (typeof Dialog !== 'undefined' && Dialog && Dialog.prompt) {
        var v = await Dialog.prompt(title, label, def);
        return v;
      }
    } catch (e) {}
    return window.prompt(label, def);
  }

  /* ---------------- Exposed API ---------------- */
  window.dwAPI = api;
  window.__dwUrl = urlFor;
  window.DWVFS = {
    inlineAssets: inlineAssets,
    restoreAssets: restoreAssets,
    display: display,
    urlFor: urlFor,
    relFor: relFor,
    download: download,
    decodeSmart: decodeSmart,
    get root() { return ROOT; },
    stats: function () { var n = 0; files.forEach(function (e) { if (!e.isDir) n++; }); return n; },
    clearAll: function () { files.clear(); blobCache.clear(); try { localStorage.removeItem(LS_KEY); } catch (e) {} },
  };

  /* ---------------- Initialization: restore the previous content or write the sample site ---------------- */
  if (!restore()) seed();

  function seed() {
    var demo = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<title>Sample Page</title>',
      '</head>',
      '<body bgcolor="#ffffff" text="#333333" leftmargin="24" topmargin="24">',
      '<h1 align="center"><font face="Microsoft YaHei" color="#1e6fd9">Web Authoring Practice Sample</font></h1>',
      '<hr width="80%" size="2" color="#1e6fd9">',
      '<p><font face="SimSun" size="3">This is a small practice site. Use the <b>Insert panel</b> on the left or the toolbar at the top to try modifying it.</font></p>',
      '<p><font face="KaiTi" size="4" color="#c25e00">Tip: click to select an element -&gt; double-click to edit text directly -&gt; use the Properties panel on the right to change attributes.</font></p>',
      '',
      '<h2>1. Common Exam Topics at a Glance</h2>',
      '<ul>',
      '<li>Text: headings, paragraphs, <b>bold</b>, <i>italic</i>, <u>underline</u>, font size, color</li>',
      '<li>Lists: bulleted list &lt;ul&gt; / numbered list &lt;ol&gt;</li>',
      '<li>Tables: insert table, merge cells, split cells</li>',
      '<li>Hyperlinks: text links, email links, named anchors</li>',
      '<li>Forms: text fields, radio buttons, checkboxes, drop-down menus, buttons</li>',
      '</ul>',
      '',
      '<h2>2. Table Practice</h2>',
      '<table width="560" border="1" cellpadding="6" cellspacing="0" bordercolor="#9bb4d4">',
      '<tr bgcolor="#e8f0fb">',
      '<td align="center"><b>Topic</b></td>',
      '<td align="center"><b>Tag</b></td>',
      '<td align="center"><b>Key attributes</b></td>',
      '</tr>',
      '<tr>',
      '<td>Images</td>',
      '<td>&lt;img&gt;</td>',
      '<td>src / alt / width / height</td>',
      '</tr>',
      '<tr>',
      '<td>Frames</td>',
      '<td>&lt;iframe&gt;</td>',
      '<td>src / scrolling / frameborder</td>',
      '</tr>',
      '</table>',
      '',
      '<h2>3. Form Practice</h2>',
      '<form name="form1" action="mailto:someone@example.com" method="post">',
      '<p>Name: <input type="text" name="uname" size="18"></p>',
      '<p>Password: <input type="password" name="pwd" size="18"></p>',
      '<p>Year: <input type="radio" name="grade" value="1" checked>Freshman',
      '<input type="radio" name="grade" value="2">Sophomore</p>',
      '<p>Interests: <input type="checkbox" name="hobby" value="code" checked>Coding',
      '<input type="checkbox" name="hobby" value="art">Drawing</p>',
      '<p>City: <select name="city">',
      '<option value="sh" selected>Shanghai</option>',
      '<option value="bj">Beijing</option>',
      '</select></p>',
      '<p><input type="submit" value="Submit">&nbsp;&nbsp;<input type="reset" value="Reset"></p>',
      '</form>',
      '',
      '<hr>',
      '<p align="center"><font size="2" color="#888888">LS\'s DW - Web Edition | Dreamweaver-style visual editor</font></p>',
      '</body>',
      '</html>',
    ].join('\n');

    var about = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<title>About This Tool</title>',
      '<link rel="stylesheet" href="css/style.css">',
      '</head>',
      '<body>',
      '<h1>About LS\'s DW</h1>',
      '<p>A Dreamweaver-style visual web editor for practicing the <b>Shanghai College Computer Level 1 "Web Page Authoring"</b> operation tasks.</p>',
      '<h2>Dual-view Editing</h2>',
      '<p>The design view is WYSIWYG, the code view has syntax highlighting and line numbers, and both stay in sync (press F5 after editing the code to apply it).</p>',
      '<h2>Covered Level 1 Topics</h2>',
      '<ol start="1">',
      '<li>Page properties (title / background / margins / font)</li>',
      '<li>Text formatting</li>',
      '<li>Lists</li>',
      '<li>Images</li>',
      '<li>Hyperlinks and anchors</li>',
      '<li>Tables and merging/splitting cells</li>',
      '<li>Media (horizontal rule / scrolling text / video and audio / background music)</li>',
      '<li>Form controls</li>',
      '<li>CSS stylesheets</li>',
      '<li>iframe frames / navigation bar / site file management</li>',
      '</ol>',
      '<p><a href="index.html">&larr; Back to the sample home page</a></p>',
      '</body>',
      '</html>',
    ].join('\n');

    var css = [
      '/* External stylesheet: open and save it from the CSS panel on the left */',
      'body {',
      '  background-color: #f4f6fb;',
      '  font-family: "Microsoft YaHei", Arial, sans-serif;',
      '  line-height: 1.7;',
      '  margin: 24px;',
      '}',
      'h1 { color: #1e6fd9; }',
      'h2 { color: #c25e00; font-size: 18px; }',
      '.tip { color: #7a7a7a; font-size: 12px; }',
    ].join('\n');

    files.set(key(pathJoin(ROOT, 'index.html')), { path: pathJoin(ROOT, 'index.html'), isDir: false, text: demo, mime: 'text/html' });
    files.set(key(pathJoin(ROOT, 'about.html')), { path: pathJoin(ROOT, 'about.html'), isDir: false, text: about, mime: 'text/html' });
    files.set(key(pathJoin(ROOT, 'images')), { path: pathJoin(ROOT, 'images'), isDir: true });
    files.set(key(pathJoin(ROOT, 'css', 'style.css')), { path: pathJoin(ROOT, 'css', 'style.css'), isDir: false, text: css, mime: 'text/css' });
    persist();
  }
})();
