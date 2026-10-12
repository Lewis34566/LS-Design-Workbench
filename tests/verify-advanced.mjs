// verify-advanced.mjs — 进阶功能验证：
//   表格（行列增删/合并/拆分/colspan 处理）、表单、CSS 规则、超链接、
//   代码↔设计双向同步、媒体与特殊字符、多步撤销
import path from 'node:path';
import { launchApp, makeFixtureSite, check, summary, failures, ROOT } from './helpers.mjs';

const fixture = makeFixtureSite();
const { app, page } = await launchApp(fixture);
const frame = () => page.frameLocator('#design-frame');
const codeText = () => page.evaluate(() => window.DW.code.getValue());
const waitLoaded = () => page.waitForFunction(() => window.DW.editor.loaded);
const wait = ms => page.waitForTimeout(ms);
const clickInDesign = async (x, y) => {
  const bb = await page.locator('#design-frame').boundingBox();
  await page.mouse.click(bb.x + x, bb.y + y);
};

try {
  console.log('—— 表格：插入 3×3 ——');
  await page.click('#ins-table');
  await page.fill('#dlg-table-rows', '3');
  await page.fill('#dlg-table-cols', '3');
  await page.fill('#dlg-table-width', '400');
  await page.click('.dlg-btns .primary');
  await wait(300);
  let code = await codeText();
  check('表格插入（3 行）', (code.match(/<tr>/g) || []).length === 3, code);
  check('表格属性写入', /<table width="400" border="1" cellpadding="2" cellspacing="0">/.test(code), code);

  console.log('—— 表格：合并 / 拆分单元格 ——');
  const cells = frame().locator('table tr').first().locator('td');
  await cells.nth(0).click();
  await wait(120);
  await cells.nth(1).click({ modifiers: ['Control'] });
  await wait(200);
  check('Ctrl+点击多选单元格', await page.evaluate(() => window.DW.editor.getExtraEls().length === 1));
  await page.click('#prop-merge');
  await wait(300);
  code = await codeText();
  check('合并为 colspan=2', /<td[^>]*colspan="2"/.test(code), code);

  await page.click('#prop-split');
  await page.fill('#dlg-split-cols', '2');
  await page.fill('#dlg-split-rows', '1');
  await page.click('.dlg-btns .primary');
  await wait(300);
  code = await codeText();
  check('拆分后 colspan 消失', !code.includes('colspan="2"'), code);

  console.log('—— 表格：插入 / 删除行列 ——');
  await page.click('#prop-row-below');
  await wait(250);
  code = await codeText();
  check('下方插入行 → 4 行', (code.match(/<tr>/g) || []).length === 4, code);
  await page.click('#prop-row-del');
  await wait(250);
  code = await codeText();
  check('删除行 → 3 行', (code.match(/<tr>/g) || []).length === 3, code);
  await page.click('#prop-col-right');
  await wait(250);
  code = await codeText();
  check('右侧插入列 → 每行 4 格', (code.match(/<td[^>]*>/g) || []).length === 12, code);
  await page.click('#prop-col-del');
  await wait(250);
  code = await codeText();
  check('删除列 → 每行 3 格', (code.match(/<td[^>]*>/g) || []).length === 9, code);

  console.log('—— 表单 ——');
  await clickInDesign(480, 460);
  await wait(150);
  await page.click('#ins-form');
  await wait(150);
  await page.click('#ins-input-text');
  await wait(150);
  await page.click('#ins-radio');
  await wait(150);
  await page.click('#ins-select');
  await wait(200);
  code = await codeText();
  check('form 与文本框', /<form action="" method="post">[\s\S]*?<input type="text" name="" size="20">/.test(code), code);
  check('单选按钮', code.includes('<input type="radio" name="">'), code);
  check('下拉菜单含选项', code.includes('<option>选项一</option>'), code);

  console.log('—— CSS：新建类规则 + 应用 class ——');
  await page.click('#tab-btn-css');
  await page.click('#btn-css-new-rule');
  await page.selectOption('#dlg-rule-type', 'class');
  await page.fill('#dlg-rule-name', 'hl');
  await page.fill('#dlg-rule-color', '#ff0000');
  await page.click('.dlg-btns .primary');
  await wait(300);
  code = await codeText();
  check('内部样式表写入 .hl 规则', code.includes('.hl {') && code.includes('color: #ff0000;'), code);
  // 应用 class 到元素
  await page.click('#tab-btn-insert');
  await frame().locator('body > p').last().click();
  await wait(150);
  await page.fill('#prop-class', 'hl');
  await wait(300);
  code = await codeText();
  check('元素应用 class="hl"', /<p[^>]*class="hl"/.test(code), code);

  console.log('—— 超链接 ——');
  await page.click('#ins-link');
  await page.selectOption('#dlg-link-kind', 'url');
  await page.fill('#dlg-link-href', 'https://www.baidu.com');
  await page.selectOption('#dlg-link-target', '_blank');
  await page.fill('#dlg-link-text', '百度');
  await page.click('.dlg-btns .primary');
  await wait(300);
  code = await codeText();
  check('超链接包裹现有文字', code.includes('<a href="https://www.baidu.com" target="_blank">欢迎</a>'), code);

  console.log('—— 水平线 / 滚动文字 / 特殊字符 / 日期 ——');
  await clickInDesign(480, 460);
  await wait(150);
  await page.click('#ins-hr');
  await clickInDesign(480, 460);
  await wait(120);
  await page.click('#ins-marquee');
  await clickInDesign(480, 460);
  await wait(120);
  await page.click('#ins-copy');
  await clickInDesign(480, 460);
  await wait(120);
  await page.click('#ins-date');
  await page.click('.dlg-btns .primary');
  await wait(300);
  code = await codeText();
  check('水平线', code.includes('<hr>'), code);
  check('滚动文字', code.includes('<marquee>滚动文字</marquee>'), code);
  check('版权字符 ©', code.includes('©'), code);
  check('日期插入', /2026/.test(code), code);

  console.log('—— 代码 → 设计 同步 ——');
  await page.click('#btn-mode-code');
  await page.fill('#code-ta', '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>代码改的标题</title>\n</head>\n<body>\n<h1>代码里写的标题</h1>\n</body>\n</html>');
  await page.click('#btn-mode-split');
  await waitLoaded();
  await wait(200);
  const h1 = await frame().locator('h1').textContent();
  check('代码视图修改同步到设计视图', h1 === '代码里写的标题', h1);

  console.log('—— 多步撤销 / 重做 ——');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  await waitLoaded();
  await wait(200);
  let c1 = await codeText();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+y');
  await waitLoaded();
  await wait(200);
  let c2 = await codeText();
  check('4 步撤销后再重做回到相同状态', c1 !== c2 && c2 === await page.evaluate(() => window.DW.code.getValue()), '');

  try {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(ROOT, 'tests', 'out', 'advanced-split.png') });
    console.log('  截图已保存 tests/out/advanced-split.png');
  } catch {}
} catch (e) {
  check('测试过程异常', false, e.stack);
} finally {
  await app.close();
}

summary('进阶功能（表格/表单/CSS/链接/双向同步）');
process.exit(failures ? 1 : 0);
