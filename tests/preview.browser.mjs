// Run after npm run build. Set A11YFIX_PLAYWRIGHT and A11YFIX_CHROME as needed.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.A11YFIX_PLAYWRIGHT ?? join(tmpdir(), 'a11yfix-browser-tools/node_modules/playwright-core/index.mjs')));
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    const file = resolve('dist', path === '/' ? 'index.html' : `.${path}`);
    if (!file.startsWith(resolve('dist') + '/')) throw new Error('Invalid path');
    const content = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] ?? 'application/octet-stream');
    res.end(content);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.A11YFIX_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const preview = page.frameLocator('iframe');
  await preview.locator('#preview-reading').waitFor();
  await page.locator('button[aria-controls="motor-options"]').click();
  await page.getByRole('checkbox', { name: 'Larger click targets', exact: true }).check();
  await preview.locator('#sample-button').evaluate(element => new Promise(resolve => {
    const poll = () => parseFloat(getComputedStyle(element).minHeight) >= 56 ? resolve() : setTimeout(poll, 20); poll();
  }));
  assert.equal(await page.evaluate(() => localStorage.getItem('clearspace-demo')), null, 'Drafts must not be saved by preview');
  assert.equal(await page.locator('#clearspace-click-targets-style').count(), 0, 'Controls outside preview stay unaffected');
  await page.locator('button[aria-controls="cognitive-options"]').click();
  await page.getByRole('checkbox', { name: 'Hide distractions' }).check();
  await preview.locator('.ad-banner').waitFor({ state: 'hidden' });
  await preview.locator('aside').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Before adjustments', exact: true }).click();
  await preview.locator('.ad-banner').waitFor({ state: 'visible' });
  await preview.locator('#clearspace-click-targets-style').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'Before adjustments', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('switch', { name: 'Enable webpage adjustments' }).isChecked(), true);
  assert.equal(await page.getByRole('checkbox', { name: 'Hide distractions' }).isChecked(), true);
  // Draft changes in the original view stay unapplied until switching back.
  await page.getByRole('checkbox', { name: 'Larger click targets', exact: true }).uncheck();
  await page.getByRole('button', { name: 'After adjustments', exact: true }).click();
  await preview.locator('.ad-banner').waitFor({ state: 'hidden' });
  assert.equal(await preview.locator('#clearspace-click-targets-style').count(), 0);
  await page.getByRole('checkbox', { name: 'Larger click targets', exact: true }).check();
  await preview.locator('#clearspace-click-targets-style').waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => localStorage.getItem('clearspace-demo')), null, 'Comparison must not save choices');
  await preview.getByRole('button', { name: 'Try a button' }).click();
  assert.match(await preview.locator('#sample-result').textContent(), /You tried the button/);
  await page.getByRole('switch', { name: 'Enable webpage adjustments' }).uncheck();
  await preview.locator('.ad-banner').waitFor({ state: 'visible' });
  await preview.locator('#clearspace-click-targets-style').waitFor({ state: 'detached' });
  await page.getByRole('switch', { name: 'Enable webpage adjustments' }).check();
  await preview.locator('.ad-banner').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await preview.locator('.ad-banner').waitFor({ state: 'visible' });
  await preview.locator('#clearspace-click-targets-style').waitFor({ state: 'detached' });
  // Exercise the entire composition through the same message used by the UI.
  const settings = { version: 1, enabled: true, selected: ['vision:Higher contrast', 'vision:Dim page', 'vision:Larger text and controls', 'motor:Extra button spacing', 'motor:Keyboard focus indicators', 'motor:Reduce motion', 'cognitive:Focus mode'], colorVision: { mode: 'deutan', strength: 50, cues: true }, dyslexia: { enabled: true, experiences: { distinguishWords: true, overwhelmingParagraphs: true }, customization: {} } };
  await page.evaluate(settings => document.querySelector('iframe').contentWindow.postMessage({ type: 'clearspace:preview-settings', settings }, location.origin), settings);
  const frame = page.frames().find(frame => frame.url().endsWith('/preview.html'));
  await frame.waitForFunction(() => getComputedStyle(document.documentElement).filter.includes('brightness') && document.documentElement.dataset.a11yfixReduceMotion === 'on');
  await frame.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('#preview-reading')).letterSpacing) > 0);
  await page.getByRole('button', { name: 'Reset choices', exact: true }).click();
  await frame.waitForFunction(() => getComputedStyle(document.documentElement).filter === 'none' && !document.querySelector('#clearspace-colour'));
  assert.deepEqual(errors, []);
  console.log('PASS combined preview: live UI updates, isolation, composition, controls, pause, clear and reset');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
