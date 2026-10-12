// helpers.mjs — 测试公共设施：临时站点、PNG 生成、启动 Electron
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
export const electronPath = require('electron');

/* ---------------- PNG 生成（无依赖，纯 zlib） ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export function makePng(w, h, [r, g, b] = [255, 0, 0]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- 临时测试站点 ---------------- */
export function makeFixtureSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsdw-site-'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>测试站点</title>
</head>
<body>
<p>欢迎</p>
</body>
</html>
`);
  return dir;
}

/* ---------------- 启动 ---------------- */
export async function launchApp(fixture) {
  const { _electron } = await import('playwright-core');
  // 剥离环境里的 ELECTRON_RUN_AS_NODE（若被全局设置，Electron 会退化成纯 Node 模式）
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: electronPath,
    args: ['--disable-gpu', '.', `--site=${fixture}`, `--file=${path.join(fixture, 'index.html')}`],
    cwd: ROOT,
    env,
  });
  const page = await app.firstWindow();
  page.on('pageerror', err => console.log('[页面错误]', err.message));
  app.on('close', () => console.log('[TEST] app close 事件'));
  app.process().on('exit', code => console.log('[TEST] 主进程退出 code =', code));
  await page.waitForSelector('.dw-ready', { timeout: 30000 });
  return { app, page };
}

export let failures = 0;
export function check(name, cond, extra = '') {
  if (cond) console.log('  ✓ ' + name);
  else {
    failures++;
    console.log('  ✗ FAIL: ' + name + (extra ? '\n      ' + String(extra).slice(0, 400) : ''));
  }
}

export function summary(title) {
  if (failures === 0) console.log(`\n【${title}】全部通过 ✔`);
  else console.log(`\n【${title}】失败 ${failures} 项 ✘`);
}
