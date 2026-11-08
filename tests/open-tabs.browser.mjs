import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const { chromium } = await import(pathToFileURL(process.env.A11YFIX_PLAYWRIGHT ?? join(tmpdir(), 'a11yfix-browser-tests/node_modules/playwright-core/index.mjs')));
const folder = await mkdtemp(join(tmpdir(), 'accessify-open-tabs-'));
await cp(resolve('dist'), join(folder, 'extension'), { recursive: true });
const manifestPath = join(folder, 'extension/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
// Only the disposable package grants localhost access. Production permissions stay optional.
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(manifestPath, JSON.stringify(manifest));
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><p>Original page content</p><div class="ad-banner" aria-label="Advertisement">An advertisement</div><button>Sample button</button><input value="Keep this input">');
});
await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let context;
try {
  context = await chromium.launchPersistentContext(join(folder, 'profile'), {
    executablePath: process.env.A11YFIX_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-unsafe-extension-debugging'], ignoreDefaultArgs: ['--disable-extensions'],
  });
  const first = await context.newPage();
  await first.goto(`${url}?first`);
  await first.locator('input').fill('User input survives updates');
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: join(folder, 'extension') });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/index.html`);
  const secondPromise = context.waitForEvent('page');
  await options.evaluate(url => chrome.windows.create({ url }), `${url}?second`);
  const second = await secondPromise; await second.waitForLoadState();
  const windowIds = await options.evaluate(async () => (await chrome.tabs.query({})).filter(tab => tab.url?.startsWith('http://127.0.0.1:')).map(tab => tab.windowId));
  assert.equal(new Set(windowIds).size, 2);
  const denied = await context.newPage();
  await denied.goto(`http://localhost:${server.address().port}/?denied`);
  const initial = { version: 1, enabled: true, selected: ['cognitive:Hide distractions', 'vision:Dim page', 'motor:Larger click targets'], lightSensitivity: { 'Dim page': 20 }, motor: { targetSize: 0 }, dyslexia: { experiences: {}, customization: {} } };
  const save = settings => options.evaluate(settings => chrome.storage.local.set({ settings }), settings);
  const adjusted = page => page.waitForFunction(() => getComputedStyle(document.querySelector('.ad-banner')).display === 'none' && getComputedStyle(document.documentElement).filter.includes('brightness') && parseFloat(getComputedStyle(document.querySelector('button')).minHeight) === 44);
  await save(initial);
  await Promise.all([adjusted(first), adjusted(second)]);
  assert.notEqual(await denied.locator('.ad-banner').evaluate(node => getComputedStyle(node).display), 'none');
  const before = await first.evaluate(() => getComputedStyle(document.documentElement).filter);
  const modified = { ...initial, lightSensitivity: { 'Dim page': 70 }, motor: { targetSize: 100 } };
  await save(modified);
  await Promise.all([first, second].map(page => page.waitForFunction(before => getComputedStyle(document.documentElement).filter !== before && parseFloat(getComputedStyle(document.querySelector('button')).minHeight) === 72, before)));
  await first.evaluate(() => {
    const ad = document.createElement('div'); ad.className = 'advertisement'; ad.textContent = 'Dynamic ad'; document.body.append(ad);
  });
  assert.equal(await first.locator('.advertisement').evaluate(node => getComputedStyle(node).display), 'none');
  const third = await context.newPage(); await third.goto(`${url}?new`);
  await third.waitForFunction(() => getComputedStyle(document.querySelector('.ad-banner')).display === 'none' && parseFloat(getComputedStyle(document.querySelector('button')).minHeight) === 72);
  await second.goto(`${url}navigated`);
  await second.waitForFunction(() => getComputedStyle(document.querySelector('.ad-banner')).display === 'none');
  await save({ ...modified, enabled: false });
  await Promise.all([first, second, third].map(page => page.waitForFunction(() => getComputedStyle(document.querySelector('.ad-banner')).display !== 'none' && getComputedStyle(document.documentElement).filter === 'none' && !document.querySelector('#clearspace-click-targets-style'))));
  assert.equal(await first.locator('input').inputValue(), 'User input survives updates');
  await save(modified);
  await first.waitForFunction(() => getComputedStyle(document.querySelector('.ad-banner')).display === 'none');
  await save({ version: 1, enabled: true, selected: [], dyslexia: { experiences: {}, customization: {} } });
  await first.waitForFunction(() => getComputedStyle(document.querySelector('.ad-banner')).display !== 'none' && getComputedStyle(document.documentElement).filter === 'none');
  assert.equal(await first.locator('input').inputValue(), 'User input survives updates');
  await options.reload();
  assert.deepEqual(await options.evaluate(async () => (await chrome.storage.local.get('settings')).settings.selected), []);
  console.log('PASS actual MV3: pre-existing tabs, two windows, edits, dynamic content, new tab, navigation, disabled/reset cleanup, persistence, and denied host.');
} finally {
  await context?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
