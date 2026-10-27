// verify-main-paths.mjs - Main-path verification:
//   1. Select an element -> change font / size / color / background (really writes the DOM and syncs the code)
//   2. Local image insertion (copied into the site images folder + relative path + width/height)
//   3. Double-click text editing, undo/redo, clean export
import fs from 'node:fs';
import path from 'node:path';
import { launchApp, makeFixtureSite, makePng, check, summary, failures, ROOT } from './helpers.mjs';

const fixture = makeFixtureSite();
const { app, page } = await launchApp(fixture);
const frame = () => page.frameLocator('#design-frame');
const codeText = () => page.evaluate(() => window.DW.code.getValue());
const waitLoaded = () => page.waitForFunction(() => window.DW.editor.loaded);
const wait = ms => page.waitForTimeout(ms);
// Click a point inside the design view using absolute coordinates (used to click empty space and select body, avoiding hangs caused by scroll checks on large elements)
const clickInDesign = async (x, y) => {
  const bb = await page.locator('#design-frame').boundingBox();
  await page.mouse.click(bb.x + x, bb.y + y);
};

try {
  console.log('-- Path 1: select element -> change font / size / color --');

  // 1. Insert a paragraph and select it
  await page.click('#ins-p');
  await wait(150);
  await frame().locator('body > p').last().click();
  await wait(150);
  check('Insert paragraph and select it', await page.evaluate(() => !!window.DW.editor.getSelectedEl()?.closest('p')));

  // 2. Font SimHei / size 5 / color red
  await page.selectOption('#prop-face', 'SimHei');
  await page.selectOption('#prop-size', '5');
  await page.fill('#prop-color', '#ff0000');
  await wait(200);
  let code = await codeText();
  check('Code writes <font face size color>', code.includes('<font face="SimHei" size="5" color="#ff0000">'), code);

  // 3. The design view really applies it (computed style)
  const cs = await frame().locator('p font').evaluate(el => {
    const s = getComputedStyle(el);
    return { f: s.fontFamily, c: s.color };
  });
  check('Design view font applied', cs.f.includes('SimHei'), cs.f);
  check('Design view color applied', cs.c === 'rgb(255, 0, 0)', cs.c);

  // 4. Double-click text editing (keyboard types ASCII, insertText inserts the rest, avoiding CDP keyboard compatibility issues on some machines)
  await frame().locator('body > p').last().dblclick();
  await page.keyboard.type('DW ');
  await page.evaluate(() => {
    const d = document.getElementById('design-frame').contentDocument;
    d.execCommand('insertText', false, 'Hello, DW!');
  });
  await clickInDesign(480, 420); // Click empty space to finish editing and select body
  await wait(250);
  code = await codeText();
  check('Double-click editing writes text into the code', code.includes('Hello, DW!'), code);

  console.log('-- Path 2: page properties (body) --');

  // Select body (click empty space) -> change title / background color
  await page.waitForSelector('#prop-title');
  await page.fill('#prop-title', 'My First Web Page');
  await page.fill('#prop-bgcolor', '#ccffcc');
  await wait(700); // Wait for the debounced commit
  code = await codeText();
  check('Page title written into <title>', code.includes('<title>My First Web Page</title>'), code);
  check('Background color written into <body bgcolor>', /<body[^>]*bgcolor="#ccffcc"/.test(code), code);

  console.log('-- Path 3: undo / redo --');
  await page.keyboard.press('Control+z');
  await waitLoaded();
  await wait(200);
  code = await codeText();
  check('Ctrl+Z undoes the background color', !code.includes('bgcolor="#ccffcc"'), code);
  await page.keyboard.press('Control+y');
  await waitLoaded();
  await wait(200);
  code = await codeText();
  check('Ctrl+Y redoes it', code.includes('bgcolor="#ccffcc"'), code);

  console.log('-- Path 4: local image insertion --');
  const pngPath = path.join(fixture, '..', 'dw-test-img.png');
  fs.writeFileSync(pngPath, makePng(8, 8, [30, 144, 255]));
  const imgInfo = await page.evaluate(p => window.DW.insert.insertImageFromPath(p), pngPath);
  await wait(400);
  code = await codeText();
  const m = code.match(/src="(images\/[^"]+)"/);
  check('Image uses a site-relative images path', !!m && !!imgInfo.src.startsWith('images/'), code);
  check('Image copied into the site images folder', !!m && fs.existsSync(path.join(fixture, m[1])), m && m[1]);
  check('img automatically gets width and height attributes', /width="8" height="8"/.test(code), code);
  check('img has an empty alt', /<img[^>]*alt=""/.test(code), code);

  console.log('-- Path 5: clean export --');
  const outPath = path.join(fixture, 'saved-test.html');
  await page.evaluate(p => window.DW.site.saveToPath(p), outPath);
  const saved = fs.readFileSync(outPath, 'utf8');
  check('Export keeps the DOCTYPE', saved.startsWith('<!DOCTYPE html>'));
  check('Export has no editor-injected styles', !saved.includes('dw-editor-style') && !saved.includes('data-dw-'));
  check('Export has no contenteditable', !saved.includes('contenteditable'));
  check('Export keeps bgcolor', saved.includes('bgcolor="#ccffcc"'));
  check('Export keeps font formatting', saved.includes('<font face="SimHei" size="5" color="#ff0000">'));
  check('Export keeps relative image paths', saved.includes('images/') && saved.includes('width="8"'));

  // Save a screenshot archive
  try {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(ROOT, 'tests', 'out', 'main-design.png') });
    console.log('  Screenshot saved to tests/out/main-design.png');
  } catch {}
} catch (e) {
  check('Test process threw an exception', false, e.stack);
  try {
    const alive = await app.evaluate(({ app: a }) => a.isReady());
    console.log('[Diagnostics] main process alive:', alive, ' window count:', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length));
  } catch (e2) {
    console.log('[Diagnostics] main process unreachable:', e2.message.split('\n')[0]);
  }
} finally {
  await app.close();
}

summary('Main paths (font formatting + page properties + image insertion + undo + clean export)');
process.exit(failures ? 1 : 0);
