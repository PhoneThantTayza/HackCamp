import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const { chromium } = await import(pathToFileURL(process.env.A11YFIX_PLAYWRIGHT ?? join(tmpdir(), 'a11yfix-browser-tests/node_modules/playwright-core/index.mjs')));
const folder = await mkdtemp(join(tmpdir(), 'accessify-lookup-'));
await cp(resolve('dist'), join(folder, 'extension'), { recursive: true });
const manifestPath = join(folder, 'extension/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(manifestPath, JSON.stringify(manifest));
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><style>p{font:24px Arial;width:max-content}</style><p id="first">Extraordinary</p><p id="second">Resilience</p><input value="Private input">');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let context;
try {
  context = await chromium.launchPersistentContext(join(folder, 'profile'), {
    executablePath: process.env.A11YFIX_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-unsafe-extension-debugging'], ignoreDefaultArgs: ['--disable-extensions'],
  });
  await context.route('https://www.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Mock dictionary results</p>' }));
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: join(folder, 'extension') });
  const source = await context.newPage(); await source.goto(`http://127.0.0.1:${server.address().port}`);
  const options = await context.newPage(); await options.goto(`chrome-extension://${id}/index.html?panel=1`);
  await options.locator('button[aria-controls="dyslexia-options"]').click();
  await options.getByRole('button', { name: 'Reading comprehension', exact: true }).click();
  const checkbox = options.locator('#dyslexia-unfamiliarWords');
  await checkbox.check();
  await options.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.dyslexia?.experiences?.unfamiliarWords === true);
  await source.bringToFront();
  const opened = context.waitForEvent('page'); await source.locator('#first').dblclick();
  const popup = await opened; await popup.waitForURL('https://www.google.com/search?**');
  assert.equal(new URL(popup.url()).searchParams.get('q'), 'Extraordinary definition pronunciation');
  await source.bringToFront(); await source.locator('#second').dblclick();
  await popup.waitForURL(url => url.searchParams.get('q') === 'Resilience definition pronunciation');
  assert.equal(context.pages().filter(page => page.url().startsWith('https://www.google.com/')).length, 1);
  await options.bringToFront(); await checkbox.uncheck();
  await options.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.dyslexia?.experiences?.unfamiliarWords === false);
  await source.bringToFront(); await source.locator('#first').dblclick(); await source.waitForTimeout(600);
  assert.equal(new URL(popup.url()).searchParams.get('q'), 'Resilience definition pronunciation');
  assert.equal(await source.locator('[data-clearspace-lookup]').count(), 0);
  await popup.close();
  await options.bringToFront(); await checkbox.check();
  await options.locator('.panel-preview > summary').click();
  const preview = options.frameLocator('iframe');
  await preview.locator('#preview-reading').click();
  await preview.locator('#preview-reading').evaluate(node => {
    const range = document.createRange(); range.setStart(node.firstChild, 0); range.setEnd(node.firstChild, 5);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  const previewOpened = context.waitForEvent('page'); await options.keyboard.press('Shift');
  const previewPopup = await previewOpened; await previewPopup.waitForURL('https://www.google.com/search?**');
  assert.equal(new URL(previewPopup.url()).searchParams.get('q'), 'Small definition pronunciation');
  assert.equal(await previewPopup.evaluate(() => window.opener), null);
  console.log('PASS restored lookup: enabled from UI, real webpage selections, popup reuse, silent disable, and live preview (external results mocked).');
} finally {
  await context?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
