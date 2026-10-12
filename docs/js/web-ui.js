// web-ui.js — 网页版界面增强：导出 HTML、说明入口、提示条
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  /* ---------------- 导出 HTML ---------------- */
  function buildHtml(inline) {
    const clean = Serialize.doc();
    if (!inline) return clean;
    const parsed = new DOMParser().parseFromString(clean, 'text/html');
    window.DWVFS.inlineAssets(parsed);
    return '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML;
  }

  async function exportHtml() {
    if (!Editor.doc) { App.toast('还没有可导出的内容'); return; }
    const body = H('div', 'dlg-msg');
    const p1 = H('p', '', '选择导出方式：');
    const p2 = H('p', '', '· 为标准代码：图片用相对路径 images/xxx.png 引用，和桌面版保存的文件完全一致，适合交作业。');
    const p3 = H('p', '', '· 为自包含文件：图片转成内联数据，单个文件发给别人也能看到图，但代码会变长。');
    body.append(p1, p2, p3);

    const mode = await Dialog.show({
      title: '导出 HTML', width: 430, body,
      buttons: [
        { label: '标准代码', primary: true, value: 'plain' },
        { label: '自包含文件', value: 'inline' },
        { label: '取消', value: null },
      ],
    }).promise;
    if (!mode) return;

    const html = buildHtml(mode === 'inline');
    let name = (State.docName || 'index.html').replace(/[\\/:*?"<>|]/g, '_');
    if (!/\.[a-z0-9]+$/i.test(name)) name += '.html';
    window.DWVFS.download(name, html);
    App.toast('已导出 ' + name);
  }

  /* ---------------- 说明 / 提示条 ---------------- */
  function openHelp() {
    Site.openFile(window.DWVFS.root + '\\about.html');
  }

  function initNotice() {
    let hidden = false;
    try { hidden = sessionStorage.getItem('ls-dw-notice') === 'off'; } catch (e) {}
    if (hidden) document.body.classList.add('dw-hide-notice');

    const close = (id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => {
        document.body.classList.add('dw-hide-notice');
        try { sessionStorage.setItem('ls-dw-notice', 'off'); } catch (e) {}
      });
    };
    close('notice-close');
    const help = document.getElementById('notice-help');
    if (help) help.addEventListener('click', openHelp);
  }

  ready(function () {
    const exp = document.getElementById('btn-export');
    if (exp) exp.addEventListener('click', exportHtml);
    const help = document.getElementById('btn-help');
    if (help) help.addEventListener('click', openHelp);
    initNotice();

    // 页面被隐藏前保存一次，避免误关浏览器丢内容
    window.addEventListener('beforeunload', function () {
      try { Site.saveToPath && State.docPath && State.dirty && Site.saveToPath(State.docPath); } catch (e) {}
    });
  });

  window.DWWeb = { exportHtml, buildHtml };
})();
