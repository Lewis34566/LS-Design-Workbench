/* ============================================================
 * web-shim.js — 网页版兼容层
 * 桌面版（Electron）靠 preload.js 暴露 window.dwAPI 来读写本机磁盘。
 * 网页版没有本机文件系统，这里用「浏览器内的虚拟站点」实现同一套 dwAPI：
 *   - C:\LS站点     站点的根目录（文本文件存 localStorage，刷新不丢）
 *   - C:\本机导入   “浏览…”选中的本机文件，会自动复制到站点的 images/ 等目录
 *   - C:\临时       浏览器预览用的临时文件
 * 只要 index.html 先加载本文件，上层 12 个模块的代码一行都不用改（除 4 处小补丁）。
 * ============================================================ */
(function () {
  'use strict';

  var ROOT = 'C:\\LS站点';
  var UPLOAD = 'C:\\本机导入';
  var TMP = 'C:\\临时';
  var LS_KEY = 'ls-dw-web-vfs-v1';

  var TEXT_EXT = ['.html', '.htm', '.css', '.js', '.txt', '.json'];

  /* ---------------- 路径工具（Windows 风格，反斜杠） ---------------- */
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

  /* ---------------- 虚拟文件系统 ---------------- */
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

  /* 本机持久化：只存文本（图片体积大，超配额会失败，失败就忽略） */
  function persist() {
    try {
      var entries = [];
      files.forEach(function (e) {
        if (e.isDir) entries.push({ p: e.path, d: 1 });
        else if (e.text != null) entries.push({ p: e.path, t: e.text });
      });
      localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, entries: entries }));
    } catch (err) { /* 配额不足 / 隐私模式：忽略 */ }
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

  /* ---------------- 文件树 ---------------- */
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
        return a.name.localeCompare(b.name, 'zh');
      });
      nodes.forEach(function (n) { if (n.children) sort(n.children); });
    })(rootNode.children);
    return rootNode.children;
  }

  /* ---------------- 资源 URL：虚拟路径 ↔ 可用 URL ---------------- */
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

  /* 渲染前：把相对路径的媒体资源换成浏览器能直接显示的 URL
     （只改这一次渲染用的副本；导出时 restoreAssets 会全部还原） */
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
    // 外链样式表：站点内的 .css 在设计视图里内联成 <style>，否则相对路径取不到文件、样式不生效
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

  /* 导出前：把 URL / 内联样式还原成原始写法，保证导出代码和桌面版完全一致 */
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

  /* 属性面板显示：把内联 URL 还原成用户看得懂的相对路径 */
  function display(v) {
    if (!v) return v || '';
    var abs = pathForUrl(v);
    return abs ? relFor(abs) : v;
  }

  /* ---------------- 浏览器文件选择 ---------------- */
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
      // 用户直接关掉系统选择框时 change 不触发，靠窗口重新获得焦点兜底
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
  /* 自动识别 UTF-8 / GBK：考试素材常见 GBK 编码，直接按 UTF-8 读会乱码 */
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

  /* ---------------- 导入 / 导出 ---------------- */
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

  /* ---------------- dwAPI 实现 ---------------- */
  var api = {
    getStartupArgs: async function () {
      return { site: ROOT, file: pathJoin(ROOT, 'index.html') };
    },
    openFolder: async function () {
      toast('网页版使用内置的虚拟站点文件夹，文件保存在你本机浏览器里');
      return ROOT;
    },
    openFile: async function () {
      var f = await pickBrowserFile('.html,.htm,text/html,text/plain');
      if (!f) return null;
      var r = await importFileInto(ROOT, f);
      toast('已导入网页：' + pathBasename(r.path));
      return r.path;
    },
    saveFile: async function (def) {
      var d = win(def || pathJoin(ROOT, '未保存.html'));
      var cur = pathBasename(d) || 'index.html';
      var input = await askName('另存为', '文件名（保存在站点的 ' + pathDirname(d) + ' 下）', cur);
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
      if (!e || e.isDir) throw new Error('无法读取：' + p);
      return e.text != null ? e.text : (e.dataUrl || '');
    },
    write: async function (p, content) { putText(p, content); return true; },
    mkdir: async function (p) { ensureParents(p); files.set(key(p), { path: win(p), isDir: true }); persist(); return true; },
    copy: async function (src, dest) {
      var e = entry(src);
      if (!e) throw new Error('找不到文件：' + src);
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
      if (!e || e.isDir) { toast('预览失败：文件不存在'); return; }
      var html;
      if (e.text != null) {
        var parsed = new DOMParser().parseFromString(e.text, 'text/html');
        inlineAssets(parsed);
        html = '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML;
      } else if (e.blob) {
        window.open(urlFor(p), '_blank');
        return;
      } else { toast('该文件无法预览'); return; }
      var url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    },
    shellShowItem: async function () { toast('网页版：文件都在页面内的虚拟站点里'); },

    onMenu: function () { /* 网页版没有原生菜单，工具栏与插入面板已覆盖全部功能 */ },
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

  /* ---------------- 对外暴露 ---------------- */
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

  /* ---------------- 初始化：恢复上次内容，或写入示例站点 ---------------- */
  if (!restore()) seed();

  function seed() {
    var demo = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<title>示例网页</title>',
      '</head>',
      '<body bgcolor="#ffffff" text="#333333" leftmargin="24" topmargin="24">',
      '<h1 align="center"><font face="微软雅黑" color="#1e6fd9">网页制作练习示例</font></h1>',
      '<hr width="80%" size="2" color="#1e6fd9">',
      '<p><font face="宋体" size="3">这是一个练习用的小站点。用左边的<b>插入面板</b>或顶部工具栏，试着修改它。</font></p>',
      '<p><font face="楷体" size="4" color="#c25e00">提示：单击选中元素 → 双击直接改文字 → 右侧属性面板改属性。</font></p>',
      '',
      '<h2>一、常用考点速查</h2>',
      '<ul>',
      '<li>文本：标题、段落、<b>粗体</b>、<i>斜体</i>、<u>下划线</u>、字号、颜色</li>',
      '<li>列表：项目列表 &lt;ul&gt; / 编号列表 &lt;ol&gt;</li>',
      '<li>表格：插入表格、合并单元格、拆分单元格</li>',
      '<li>超链接：文字链接、邮件链接、命名锚记</li>',
      '<li>表单：文本框、单选、复选、下拉菜单、按钮</li>',
      '</ul>',
      '',
      '<h2>二、表格练习</h2>',
      '<table width="560" border="1" cellpadding="6" cellspacing="0" bordercolor="#9bb4d4">',
      '<tr bgcolor="#e8f0fb">',
      '<td align="center"><b>考点</b></td>',
      '<td align="center"><b>标签</b></td>',
      '<td align="center"><b>重点属性</b></td>',
      '</tr>',
      '<tr>',
      '<td>图片</td>',
      '<td>&lt;img&gt;</td>',
      '<td>src / alt / width / height</td>',
      '</tr>',
      '<tr>',
      '<td>框架</td>',
      '<td>&lt;iframe&gt;</td>',
      '<td>src / scrolling / frameborder</td>',
      '</tr>',
      '</table>',
      '',
      '<h2>三、表单练习</h2>',
      '<form name="form1" action="mailto:someone@example.com" method="post">',
      '<p>姓名：<input type="text" name="uname" size="18"></p>',
      '<p>密码：<input type="password" name="pwd" size="18"></p>',
      '<p>年级：<input type="radio" name="grade" value="1" checked>大一',
      '<input type="radio" name="grade" value="2">大二</p>',
      '<p>兴趣：<input type="checkbox" name="hobby" value="code" checked>编程',
      '<input type="checkbox" name="hobby" value="art">绘画</p>',
      '<p>城市：<select name="city">',
      '<option value="sh" selected>上海</option>',
      '<option value="bj">北京</option>',
      '</select></p>',
      '<p><input type="submit" value="提交">&nbsp;&nbsp;<input type="reset" value="重置"></p>',
      '</form>',
      '',
      '<hr>',
      '<p align="center"><font size="2" color="#888888">LS的DW · 网页版　|　类 Dreamweaver 可视化编辑器</font></p>',
      '</body>',
      '</html>',
    ].join('\n');

    var about = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<title>关于本工具</title>',
      '<link rel="stylesheet" href="css/style.css">',
      '</head>',
      '<body>',
      '<h1>关于 LS的DW</h1>',
      '<p>类 Dreamweaver 的网页可视化编辑器，用于练习<b>上海高校计算机一级「网页制作」</b>操作题。</p>',
      '<h2>双视图编辑</h2>',
      '<p>设计视图所见即所得，代码视图带语法高亮与行号，两者实时同步（代码改完按 F5 应用）。</p>',
      '<h2>覆盖的一级考点</h2>',
      '<ol start="1">',
      '<li>页面属性（标题 / 背景 / 边距 / 字体）</li>',
      '<li>文本格式化</li>',
      '<li>列表</li>',
      '<li>图片</li>',
      '<li>超链接与锚记</li>',
      '<li>表格与单元格合并拆分</li>',
      '<li>媒体（水平线 / 滚动文字 / 视频音频 / 背景音乐）</li>',
      '<li>表单控件</li>',
      '<li>CSS 样式表</li>',
      '<li>iframe 框架 / 导航条 / 站点文件管理</li>',
      '</ol>',
      '<p><a href="index.html">← 返回示例首页</a></p>',
      '</body>',
      '</html>',
    ].join('\n');

    var css = [
      '/* 外部样式表：在左栏 CSS 面板中可以打开并保存 */',
      'body {',
      '  background-color: #f4f6fb;',
      '  font-family: "微软雅黑", Arial, sans-serif;',
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
