// Run after npm run build. Set A11YFIX_PLAYWRIGHT and A11YFIX_CHROME as needed.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.A11YFIX_PLAYWRIGHT ?? join(tmpdir(), 'a11yfix-browser-tools/node_modules/playwright-core/index.mjs')));
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    const file = resolve('dist', path === '/' ? 'index.html' : `.${path}`);
    if (!file.startsWith(resolve('dist') + sep)) throw new Error('Invalid path');
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
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('clearspace-demo'))?.selected.includes('motor:Larger click targets'));
  assert.equal(await page.locator('#clearspace-click-targets-style').count(), 0, 'Controls outside preview stay unaffected');
  await page.locator('button[aria-controls="cognitive-options"]').click();
  await page.getByRole('checkbox', { name: 'Hide distractions' }).check();
  await preview.locator('.ad-banner').waitFor({ state: 'hidden' });
  await preview.locator('aside').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('clearspace-demo'))?.selected.includes('cognitive:Hide distractions'));
  const savedBeforeComparison = await page.evaluate(() => localStorage.getItem('clearspace-demo'));
  await page.getByRole('button', { name: 'Before adjustments', exact: true }).click();
  await preview.locator('.ad-banner').waitFor({ state: 'visible' });
  await preview.locator('#clearspace-click-targets-style').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'Before adjustments', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('clearspace-demo')), savedBeforeComparison, 'Comparison must not change saved settings');
  assert.equal(await page.getByRole('switch').count(), 0);
  assert.equal(await page.getByRole('checkbox', { name: 'Hide distractions' }).isChecked(), true);
  // Changes in the original view save automatically while the sample stays unadjusted.
  await page.getByRole('checkbox', { name: 'Larger click targets', exact: true }).uncheck();
  await page.getByRole('button', { name: 'After adjustments', exact: true }).click();
  await preview.locator('.ad-banner').waitFor({ state: 'hidden' });
  assert.equal(await preview.locator('#clearspace-click-targets-style').count(), 0);
  await page.getByRole('checkbox', { name: 'Larger click targets', exact: true }).check();
  await preview.locator('#clearspace-click-targets-style').waitFor({ state: 'attached' });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('clearspace-demo'))?.selected.includes('motor:Larger click targets'));
  await preview.getByRole('button', { name: 'Try a button' }).click();
  assert.match(await preview.locator('#sample-result').textContent(), /You tried the button/);
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await preview.locator('.ad-banner').waitFor({ state: 'visible' });
  await preview.locator('#clearspace-click-targets-style').waitFor({ state: 'detached' });
  // Exercise the entire composition through the same message used by the UI.
  const settings = { version: 1, enabled: true, selected: ['vision:Higher contrast', 'vision:Dim page', 'vision:Larger text and controls', 'motor:Extra button spacing', 'motor:Keyboard focus indicators', 'motor:Reduce motion'], colorVision: { mode: 'deutan', strength: 50, cues: true }, dyslexia: { enabled: true, experiences: { distinguishWords: true, overwhelmingParagraphs: true, losePlace: true }, customization: {} } };
  await page.evaluate(settings => document.querySelector('iframe').contentWindow.postMessage({ type: 'clearspace:preview-settings', settings }, location.origin), settings);
  const frame = page.frames().find(frame => frame.url().endsWith('/preview.html'));
  await page.context().route('https://www.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Mock search results</p>' }));
  const lookupSettings = { version: 1, enabled: true, selected: [], dyslexia: { experiences: { unfamiliarWords: true } } };
  await page.evaluate(settings => document.querySelector('iframe').contentWindow.postMessage({ type: 'clearspace:preview-settings', settings }, location.origin), lookupSettings);
  await frame.waitForFunction(() => Boolean(globalThis.clearspaceWordLookup));
  const selectPreviewWord = async (start = 0, end = 5) => {
    await preview.locator('#preview-reading').click();
    await frame.evaluate(({ start, end }) => {
      const range = document.createRange();
      const text = document.querySelector('#preview-reading').firstChild;
      range.setStart(text, start); range.setEnd(text, end);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }, { start, end });
    await page.keyboard.press('Shift');
  };
  const popupPromise = page.context().waitForEvent('page');
  await selectPreviewWord();
  const lookup = await popupPromise;
  await lookup.waitForURL('https://www.google.com/search?**');
  assert.equal(new URL(lookup.url()).searchParams.get('q'), 'Small definition pronunciation');
  assert.equal(await lookup.evaluate(() => window.opener), null);
  await lookup.close(); await page.bringToFront();
  await frame.evaluate(() => { window.open = () => null; });
  await selectPreviewWord(6, 13);
  await preview.locator('[data-clearspace-lookup]').waitFor({ state: 'attached' });
  await page.evaluate(settings => document.querySelector('iframe').contentWindow.postMessage({ type: 'clearspace:preview-settings', settings: { ...settings, enabled: false } }, location.origin), lookupSettings);
  await preview.locator('[data-clearspace-lookup]').waitFor({ state: 'detached' });
  await selectPreviewWord();
  await page.waitForTimeout(500);
  assert.equal(await preview.locator('[data-clearspace-lookup]').count(), 0);
  console.log('PASS preview lookup: keyboard selection, Google popup, opener isolation, blocked-popup fallback, and disabled cleanup (results mocked).');
  await page.evaluate(settings => document.querySelector('iframe').contentWindow.postMessage({ type: 'clearspace:preview-settings', settings }, location.origin), settings);
  await frame.waitForFunction(() => getComputedStyle(document.documentElement).filter.includes('brightness') && document.documentElement.dataset.a11yfixReduceMotion === 'on');
  await frame.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('#preview-reading')).letterSpacing) > 0);
  await page.getByRole('button', { name: 'Reset choices', exact: true }).click();
  await frame.waitForFunction(() => getComputedStyle(document.documentElement).filter === 'none' && !document.querySelector('#clearspace-colour'));
  assert.deepEqual(errors, []);
  console.log('PASS combined preview: live UI updates, isolation, composition, controls, autosave, comparison, clear and reset');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
