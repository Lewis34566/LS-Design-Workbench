// web-ui.js - Web edition UI enhancements: export HTML, help entry, notice bar
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  /* ---------------- Export HTML ---------------- */
  function buildHtml(inline) {
    const clean = Serialize.doc();
    if (!inline) return clean;
    const parsed = new DOMParser().parseFromString(clean, 'text/html');
    window.DWVFS.inlineAssets(parsed);
    return '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML;
  }

  async function exportHtml() {
    if (!Editor.doc) { App.toast('There is nothing to export yet'); return; }
    const body = H('div', 'dlg-msg');
    const p1 = H('p', '', 'Choose an export mode:');
    const p2 = H('p', '', '- Standard code: images are referenced by relative paths such as images/xxx.png, exactly like files saved by the desktop edition; best for submitting assignments.');
    const p3 = H('p', '', '- Self-contained file: images become inline data, so a single file still shows its images when sent to others, but the code becomes longer.');
    body.append(p1, p2, p3);

    const mode = await Dialog.show({
      title: 'Export HTML', width: 430, body,
      buttons: [
        { label: 'Standard code', primary: true, value: 'plain' },
        { label: 'Self-contained file', value: 'inline' },
        { label: 'Cancel', value: null },
      ],
    }).promise;
    if (!mode) return;

    const html = buildHtml(mode === 'inline');
    let name = (State.docName || 'index.html').replace(/[\\/:*?"<>|]/g, '_');
    if (!/\.[a-z0-9]+$/i.test(name)) name += '.html';
    window.DWVFS.download(name, html);
    App.toast('Exported ' + name);
  }

  /* ---------------- Help / notice bar ---------------- */
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

    // Save once before the page is hidden so closing the browser by mistake does not lose content
    window.addEventListener('beforeunload', function () {
      try { Site.saveToPath && State.docPath && State.dirty && Site.saveToPath(State.docPath); } catch (e) {}
    });
  });

  window.DWWeb = { exportHtml, buildHtml };
})();
