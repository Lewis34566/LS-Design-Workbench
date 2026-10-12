// verify-main-paths.mjs — 主链路验证：
//   ① 选中元素 → 改字体 / 字号 / 颜色 / 背景（真实写入 DOM 并同步代码）
//   ② 本地图片插入（复制到站点 images + 相对路径 + 宽高）
//   ③ 双击编辑文字、撤销/重做、干净导出
import fs from 'node:fs';
import path from 'node:path';
import { launchApp, makeFixtureSite, makePng, check, summary, failures, ROOT } from './helpers.mjs';

const fixture = makeFixtureSite();
const { app, page } = await launchApp(fixture);
const frame = () => page.frameLocator('#design-frame');
const codeText = () => page.evaluate(() => window.DW.code.getValue());
const waitLoaded = () => page.waitForFunction(() => window.DW.editor.loaded);
const wait = ms => page.waitForTimeout(ms);
// 以绝对坐标点击设计视图内某点（用于点空白处选中 body，规避大元素滚动检查卡死）
const clickInDesign = async (x, y) => {
  const bb = await page.locator('#design-frame').boundingBox();
  await page.mouse.click(bb.x + x, bb.y + y);
};

try {
  console.log('—— 链路一：选中元素 → 改字体 / 字号 / 颜色 ——');

  // 1. 插入段落并选中
  await page.click('#ins-p');
  await wait(150);
  await frame().locator('body > p').last().click();
  await wait(150);
  check('插入段落并选中', await page.evaluate(() => !!window.DW.editor.getSelectedEl()?.closest('p')));

  // 2. 字体 黑体 / 字号 5 / 颜色 红
  await page.selectOption('#prop-face', '黑体');
  await page.selectOption('#prop-size', '5');
  await page.fill('#prop-color', '#ff0000');
  await wait(200);
  let code = await codeText();
  check('代码写入 <font face size color>', code.includes('<font face="黑体" size="5" color="#ff0000">'), code);

  // 3. 设计视图真实生效（计算样式）
  const cs = await frame().locator('p font').evaluate(el => {
    const s = getComputedStyle(el);
    return { f: s.fontFamily, c: s.color };
  });
  check('设计视图字体生效', cs.f.includes('黑体'), cs.f);
  check('设计视图颜色生效', cs.c === 'rgb(255, 0, 0)', cs.c);

  // 4. 双击编辑文字（键盘敲 ASCII + insertText 中文，规避部分机器上 CDP 键盘输入中文标点的兼容问题）
  await frame().locator('body > p').last().dblclick();
  await page.keyboard.type('DW ');
  await page.evaluate(() => {
    const d = document.getElementById('design-frame').contentDocument;
    d.execCommand('insertText', false, '你好，DW！');
  });
  await clickInDesign(480, 420); // 点空白结束编辑并选中 body
  await wait(250);
  code = await codeText();
  check('双击编辑文字写入代码', code.includes('你好，DW！'), code);

  console.log('—— 链路二：页面属性（body） ——');

  // 选中 body（点空白处）→ 改标题 / 背景色
  await page.waitForSelector('#prop-title');
  await page.fill('#prop-title', '我的第一个网页');
  await page.fill('#prop-bgcolor', '#ccffcc');
  await wait(700); // 等防抖提交
  code = await codeText();
  check('页面标题写入 <title>', code.includes('<title>我的第一个网页</title>'), code);
  check('背景色写入 <body bgcolor>', /<body[^>]*bgcolor="#ccffcc"/.test(code), code);

  console.log('—— 链路三：撤销 / 重做 ——');
  await page.keyboard.press('Control+z');
  await waitLoaded();
  await wait(200);
  code = await codeText();
  check('Ctrl+Z 撤销背景色', !code.includes('bgcolor="#ccffcc"'), code);
  await page.keyboard.press('Control+y');
  await waitLoaded();
  await wait(200);
  code = await codeText();
  check('Ctrl+Y 重做恢复', code.includes('bgcolor="#ccffcc"'), code);

  console.log('—— 链路四：本地图片插入 ——');
  const pngPath = path.join(fixture, '..', 'dw-test-img.png');
  fs.writeFileSync(pngPath, makePng(8, 8, [30, 144, 255]));
  const imgInfo = await page.evaluate(p => window.DW.insert.insertImageFromPath(p), pngPath);
  await wait(400);
  code = await codeText();
  const m = code.match(/src="(images\/[^"]+)"/);
  check('图片使用站点 images 相对路径', !!m && !!imgInfo.src.startsWith('images/'), code);
  check('图片已复制到站点 images 文件夹', !!m && fs.existsSync(path.join(fixture, m[1])), m && m[1]);
  check('img 自动带宽高属性', /width="8" height="8"/.test(code), code);
  check('img 带空 alt', /<img[^>]*alt=""/.test(code), code);

  console.log('—— 链路五：干净导出 ——');
  const outPath = path.join(fixture, 'saved-test.html');
  await page.evaluate(p => window.DW.site.saveToPath(p), outPath);
  const saved = fs.readFileSync(outPath, 'utf8');
  check('导出保留 DOCTYPE', saved.startsWith('<!DOCTYPE html>'));
  check('导出无编辑器注入样式', !saved.includes('dw-editor-style') && !saved.includes('data-dw-'));
  check('导出无 contenteditable', !saved.includes('contenteditable'));
  check('导出保留 bgcolor', saved.includes('bgcolor="#ccffcc"'));
  check('导出保留 font 格式', saved.includes('<font face="黑体" size="5" color="#ff0000">'));
  check('导出保留图片相对路径', saved.includes('images/') && saved.includes('width="8"'));

  // 截图存档
  try {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(ROOT, 'tests', 'out', 'main-design.png') });
    console.log('  截图已保存 tests/out/main-design.png');
  } catch {}
} catch (e) {
  check('测试过程异常', false, e.stack);
  try {
    const alive = await app.evaluate(({ app: a }) => a.isReady());
    console.log('[诊断] 主进程存活:', alive, ' 窗口数:', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length));
  } catch (e2) {
    console.log('[诊断] 主进程不可达:', e2.message.split('\n')[0]);
  }
} finally {
  await app.close();
}

summary('主链路（字体格式 + 页面属性 + 图片插入 + 撤销 + 干净导出）');
process.exit(failures ? 1 : 0);
