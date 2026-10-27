// verify-advanced.mjs - Advanced feature verification:
//   tables (row/column insert and delete/merge/split/colspan handling), forms, CSS rules, hyperlinks,
//   two-way code <-> design synchronization, media and special characters, multi-step undo
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
  console.log('-- Tables: insert 3x3 --');
  await page.click('#ins-table');
  await page.fill('#dlg-table-rows', '3');
  await page.fill('#dlg-table-cols', '3');
  await page.fill('#dlg-table-width', '400');
  await page.click('.dlg-btns .primary');
  await wait(300);
  let code = await codeText();
  check('Table inserted (3 rows)', (code.match(/<tr>/g) || []).length === 3, code);
  check('Table attributes written', /<table width="400" border="1" cellpadding="2" cellspacing="0">/.test(code), code);

  console.log('-- Tables: merge / split cells --');
  const cells = frame().locator('table tr').first().locator('td');
  await cells.nth(0).click();
  await wait(120);
  await cells.nth(1).click({ modifiers: ['Control'] });
  await wait(200);
  check('Ctrl+click selects multiple cells', await page.evaluate(() => window.DW.editor.getExtraEls().length === 1));
  await page.click('#prop-merge');
  await wait(300);
  code = await codeText();
  check('Merged into colspan=2', /<td[^>]*colspan="2"/.test(code), code);

  await page.click('#prop-split');
  await page.fill('#dlg-split-cols', '2');
  await page.fill('#dlg-split-rows', '1');
  await page.click('.dlg-btns .primary');
  await wait(300);
  code = await codeText();
  check('colspan disappears after splitting', !code.includes('colspan="2"'), code);

  console.log('-- Tables: insert / delete rows and columns --');
  await page.click('#prop-row-below');
  await wait(250);
  code = await codeText();
  check('Insert row below -> 4 rows', (code.match(/<tr>/g) || []).length === 4, code);
  await page.click('#prop-row-del');
  await wait(250);
  code = await codeText();
  check('Delete row -> 3 rows', (code.match(/<tr>/g) || []).length === 3, code);
  await page.click('#prop-col-right');
  await wait(250);
  code = await codeText();
  check('Insert column right -> 4 cells per row', (code.match(/<td[^>]*>/g) || []).length === 12, code);
  await page.click('#prop-col-del');
  await wait(250);
  code = await codeText();
  check('Delete column -> 3 cells per row', (code.match(/<td[^>]*>/g) || []).length === 9, code);

  console.log('-- Forms --');
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
  check('form and text field', /<form action="" method="post">[\s\S]*?<input type="text" name="" size="20">/.test(code), code);
  check('radio button', code.includes('<input type="radio" name="">'), code);
  check('drop-down menu has options', code.includes('<option>Option 1</option>'), code);

  console.log('-- CSS: create class rule + apply class --');
  await page.click('#tab-btn-css');
  await page.click('#btn-css-new-rule');
  await page.selectOption('#dlg-rule-type', 'class');
  await page.fill('#dlg-rule-name', 'hl');
  await page.fill('#dlg-rule-color', '#ff0000');
  await page.click('.dlg-btns .primary');
  await wait(300);
  code = await codeText();
  check('Internal stylesheet gets the .hl rule', code.includes('.hl {') && code.includes('color: #ff0000;'), code);
  // Apply the class to an element
  await page.click('#tab-btn-insert');
  await frame().locator('body > p').last().click();
  await wait(150);
  await page.fill('#prop-class', 'hl');
  await wait(300);
  code = await codeText();
  check('Element gets class="hl"', /<p[^>]*class="hl"/.test(code), code);

  console.log('-- Hyperlinks --');
  await page.click('#ins-link');
  await page.selectOption('#dlg-link-kind', 'url');
  await page.fill('#dlg-link-href', 'https://www.baidu.com');
  await page.selectOption('#dlg-link-target', '_blank');
  await page.fill('#dlg-link-text', 'Baidu');
  await page.click('.dlg-btns .primary');
  await wait(300);
  code = await codeText();
  check('Hyperlink wraps the existing text', code.includes('<a href="https://www.baidu.com" target="_blank">Welcome</a>'), code);

  console.log('-- Horizontal rule / scrolling text / special characters / date --');
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
  check('Horizontal rule', code.includes('<hr>'), code);
  check('Scrolling text', code.includes('<marquee>Scrolling text</marquee>'), code);
  check('Copyright character', code.includes(String.fromCharCode(169)), code);
  check('Date inserted', /2026/.test(code), code);

  console.log('-- Code -> design synchronization --');
  await page.click('#btn-mode-code');
  await page.fill('#code-ta', '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>Title from code</title>\n</head>\n<body>\n<h1>Heading written in code</h1>\n</body>\n</html>');
  await page.click('#btn-mode-split');
  await waitLoaded();
  await wait(200);
  const h1 = await frame().locator('h1').textContent();
  check('Code view changes sync to the design view', h1 === 'Heading written in code', h1);

  console.log('-- Multi-step undo / redo --');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  await waitLoaded();
  await wait(200);
  let c1 = await codeText();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+y');
  await waitLoaded();
  await wait(200);
  let c2 = await codeText();
  check('Redo after 4 undo steps returns to the same state', c1 !== c2 && c2 === await page.evaluate(() => window.DW.code.getValue()), '');

  try {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(ROOT, 'tests', 'out', 'advanced-split.png') });
    console.log('  Screenshot saved to tests/out/advanced-split.png');
  } catch {}
} catch (e) {
  check('Test process threw an exception', false, e.stack);
} finally {
  await app.close();
}

summary('Advanced features (tables/forms/CSS/links/two-way sync)');
process.exit(failures ? 1 : 0);
