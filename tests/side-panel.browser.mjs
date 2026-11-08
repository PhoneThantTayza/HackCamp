import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const { chromium } = await import(pathToFileURL(process.env.A11YFIX_PLAYWRIGHT ?? join(tmpdir(), 'a11yfix-browser-tests/node_modules/playwright-core/index.mjs')));
const folder = await mkdtemp(join(tmpdir(), 'accessify-side-panel-'));
await cp(resolve('dist'), join(folder, 'extension'), { recursive: true });
const manifestPath = join(folder, 'extension/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(manifestPath, JSON.stringify(manifest));
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><p>Keep browsing beside Accessify.</p><div class="ad-banner" aria-label="Advertisement">Sample ad</div>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let context;
try {
  context = await chromium.launchPersistentContext(join(folder, 'profile'), {
    executablePath: process.env.A11YFIX_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-unsafe-extension-debugging'], ignoreDefaultArgs: ['--disable-extensions'],
  });
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: join(folder, 'extension') });
  const website = await context.newPage(); await website.goto(`http://127.0.0.1:${server.address().port}`);
  const panel = await context.newPage(); await panel.setViewportSize({ width: 360, height: 900 });
  const errors = []; panel.on('pageerror', error => errors.push(error.message));
  await panel.goto(`chrome-extension://${id}/index.html?panel=1`);
  await panel.locator('fieldset:not([disabled])').waitFor();
  await panel.waitForFunction(() => innerWidth === 360);
  assert.equal(await panel.locator('.side-panel').count(), 1);
  assert.equal(await panel.locator('.choice-card').count(), 4);
  assert.equal(await panel.locator('.panel-preview').getAttribute('open'), null);
  assert.equal(await panel.getByRole('link', { name: 'Open full settings page' }).getAttribute('href'), './index.html');
  assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await panel.locator('.choice-card').evaluateAll(cards => cards[0].getBoundingClientRect().left === cards[1].getBoundingClientRect().left), true);
  await panel.setViewportSize({ width: 800, height: 900 });
  await panel.waitForFunction(() => innerWidth === 800);
  assert.equal(await panel.locator('.choice-card').evaluateAll(cards => cards[1].getBoundingClientRect().left > cards[0].getBoundingClientRect().left), true);
  assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await panel.setViewportSize({ width: 360, height: 900 });
  await panel.waitForFunction(() => innerWidth === 360);
  await panel.screenshot({ path: join(folder, 'side-panel-dark.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Switch to light mode' }).click();
  assert.equal(await panel.locator('.app.light').count(), 1);
  await panel.locator('button[aria-controls="cognitive-options"]').click();
  await panel.getByRole('checkbox', { name: /Too many distractions on the page/ }).check();
  await website.locator('.ad-banner').waitFor({ state: 'hidden' });
  await panel.getByRole('checkbox', { name: /Too many distractions on the page/ }).uncheck();
  await website.locator('.ad-banner').waitFor({ state: 'visible' });
  await panel.locator('.panel-preview > summary').click();
  await panel.frameLocator('iframe').locator('#preview-reading').waitFor();
  await panel.setViewportSize({ width: 180, height: 800 });
  assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal page scrolling at 200% equivalent width');
  const native = await panel.evaluate(async () => ({ options: await chrome.sidePanel.getOptions({}), manifest: chrome.runtime.getManifest().side_panel }));
  assert.equal(native.options.path, 'index.html?panel=1');
  assert.equal(native.manifest.default_path, 'index.html?panel=1');
  // A real user gesture opens the native browser panel; it is not a webpage drawer.
  await panel.evaluate(() => {
    const button = document.createElement('button'); button.textContent = 'Test native side panel';
    button.addEventListener('click', async () => {
      try { const window = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: window.id }); document.body.dataset.nativePanel = 'opened'; }
      catch (error) { document.body.dataset.nativePanel = error.message; }
    }); document.body.append(button);
  });
  await panel.getByRole('button', { name: 'Test native side panel' }).click();
  await panel.waitForFunction(() => document.body.dataset.nativePanel);
  assert.equal(await panel.locator('body').getAttribute('data-native-panel'), 'opened');
  assert.deepEqual(errors, []);
  console.log(`PASS: compact panel at 360px/180px, light mode, live website updates, optional preview, full-settings link, and actual native sidePanel.open. Screenshot: ${join(folder, 'side-panel-dark.png')}`);
} finally {
  await context?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
