import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
const { chromium } = await import(pathToFileURL(process.env.A11YFIX_PLAYWRIGHT ?? join(tmpdir(), 'a11yfix-browser-tests/node_modules/playwright-core/index.mjs')));
const browser = await chromium.launch({ executablePath: process.env.A11YFIX_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<style>body{font:24px Arial} p{margin:40px;width:max-content} button{transform:scale(1.1)}</style><p id="word">Extraordinary</p><input value="private"><div contenteditable>secret</div><button>Original button</button>');
  await page.addScriptTag({ path: resolve('client/public/word-lookup.js') });
  await page.evaluate(() => {
    window.requests = [];
    window.preferences = { version: 1, enabled: true, dyslexia: { experiences: { unfamiliarWords: true } } };
    window.controller = clearspaceWordLookup.createController(document, { runtime: { sendMessage: async message => { requests.push(message); return { ok: true }; } } });
    controller.update(preferences); controller.update(preferences);
  });
  await page.locator('#word').dblclick();
  await page.waitForFunction(() => requests.length === 1);
  assert.equal(await page.evaluate(() => requests[0].text), 'Extraordinary');
  await page.locator('input').click(); await page.keyboard.press('Control+a');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => requests.length), 1);
  await page.locator('[contenteditable]').dblclick();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => requests.length), 1);
  await page.evaluate(() => {
    document.getSelection().removeAllRanges();
    document.querySelector('input').blur();
    const dynamic = document.createElement('p'); dynamic.id = 'dynamic'; dynamic.textContent = 'Resilience'; document.body.append(dynamic);
  });
  await page.locator('#dynamic').dblclick();
  await page.waitForFunction(() => requests.length === 2);
  await page.evaluate(() => controller.update({ ...preferences, enabled: false }));
  await page.locator('#word').dblclick();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => requests.length), 2);
  await page.evaluate(() => { controller.update(preferences); document.getSelection().removeAllRanges(); });
  await page.locator('#word').click();
  await page.keyboard.press('Home'); await page.keyboard.press('Control+Shift+ArrowRight');
  // Explicit keyboard range with Shift+Arrow works with Chrome caret browsing disabled too.
  await page.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector('#word'));
    const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => requests.length >= 3);
  await page.evaluate(() => controller.disable());
  assert.equal(await page.locator('[data-clearspace-lookup]').count(), 0);
  await page.evaluate(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) {
      const root = attach.call(this, options);
      if (this.hasAttribute('data-clearspace-lookup')) window.lookupNotice = root;
      return root;
    };
    controller = clearspaceWordLookup.createController(document, { runtime: { sendMessage: async () => ({ ok: false, message: 'Window creation denied by browser.' }) } });
    controller.update(preferences); document.getSelection().removeAllRanges();
  });
  await page.locator('#dynamic').dblclick();
  await page.waitForFunction(() => window.lookupNotice?.querySelector('a'));
  const notice = await page.evaluate(() => ({ text: lookupNotice.textContent, href: lookupNotice.querySelector('a').href, rel: lookupNotice.querySelector('a').rel }));
  assert.match(notice.text, /Window creation denied by browser/);
  assert.equal(new URL(notice.href).searchParams.get('q'), 'Resilience definition pronunciation');
  assert.match(notice.rel, /noopener/);
  await page.evaluate(() => controller.disable());
  assert.equal(await page.locator('[data-clearspace-lookup]').count(), 0);
  console.log('PASS: lookup failure displays its cause, offers a safe direct search link, and cleans up.');
  await page.evaluate(() => {
    window.disabledRequests = 0;
    controller = clearspaceWordLookup.createController(document, {
      storage: { local: { get: async () => ({ settings: { ...preferences, dyslexia: { experiences: { unfamiliarWords: false } } } }) } },
      runtime: { sendMessage: async () => { disabledRequests++; throw new Error('Should not send'); } },
    });
    controller.update(preferences); document.getSelection().removeAllRanges();
  });
  await page.locator('#word').dblclick(); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => disabledRequests), 0);
  assert.equal(await page.locator('[data-clearspace-lookup]').count(), 0);
  await page.evaluate(() => {
    window.disconnectedRequests = 0;
    controller = clearspaceWordLookup.createController(document, { runtime: { sendMessage: async () => {
      disconnectedRequests++; throw new Error('Extension context invalidated.');
    } } });
    controller.update(preferences); document.getSelection().removeAllRanges();
  });
  await page.locator('#dynamic').dblclick(); await page.waitForTimeout(500);
  await page.locator('#word').dblclick(); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => disconnectedRequests), 1);
  assert.equal(await page.locator('[data-clearspace-lookup]').count(), 0);
  await page.evaluate(() => {
    controller = clearspaceWordLookup.createController(document, { runtime: { sendMessage: () => new Promise(resolve => { window.resolveLookup = resolve; }) } });
    controller.update(preferences); document.getSelection().removeAllRanges();
  });
  await page.locator('#dynamic').dblclick(); await page.waitForFunction(() => window.resolveLookup);
  await page.evaluate(() => {
    controller.update({ ...preferences, dyslexia: { experiences: { unfamiliarWords: false } } });
    resolveLookup({ ok: false, message: 'Late failure' });
  });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-clearspace-lookup]').count(), 0);
  console.log('PASS: disabled stored preference, disconnected listener, and in-flight failure after disable stay silent.');
  console.log('PASS: real Chrome selection, keyboard, dynamic content, repeated enable, protected fields, disable cleanup.');
} finally { await browser.close(); }

// Exercise the actual MV3 worker and popup APIs in a disposable profile.
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<style>p{font:24px Arial;width:max-content}</style><p id="first">Extraordinary</p><p id="second">Resilience</p>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let context;
try {
  const folder = await mkdtemp(join(tmpdir(), 'clearspace-lookup-extension-'));
  await cp(resolve('dist'), join(folder, 'extension'), { recursive: true });
  const manifestPath = join(folder, 'extension/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), 'clearspace-lookup-')), {
    executablePath: process.env.A11YFIX_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-unsafe-extension-debugging'], ignoreDefaultArgs: ['--disable-extensions'],
  });
  // Verify popup navigation without sending test selections to Google.
  await context.route('https://www.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Mock dictionary search results</p>' }));
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: join(folder, 'extension') });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/index.html`);
  const source = await context.newPage();
  const url = `http://127.0.0.1:${server.address().port}/`;
  await source.goto(url);
  await options.evaluate(async url => {
    await chrome.storage.local.set({ settings: { version: 1, enabled: true, selected: [], dyslexia: { experiences: { unfamiliarWords: true }, customization: {} } } });
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
    // Only the disposable test manifest grants localhost access.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['word-lookup.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
      globalThis.lookupTestController = clearspaceWordLookup.createController(document, chrome);
      lookupTestController.update((await chrome.storage.local.get('settings')).settings);
    } });
  }, url);
  await source.bringToFront();
  const popupPromise = context.waitForEvent('page');
  await source.locator('#first').dblclick();
  const popup = await popupPromise;
  await popup.waitForURL('https://www.google.com/search?**');
  assert.equal(new URL(popup.url()).searchParams.get('q'), 'Extraordinary definition pronunciation');
  await source.bringToFront();
  await source.locator('#second').dblclick();
  await popup.waitForURL(url => url.searchParams.get('q') === 'Resilience definition pronunciation');
  assert.equal(context.pages().filter(page => page.url().startsWith('https://www.google.com/')).length, 1);
  await options.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    settings.dyslexia.experiences.unfamiliarWords = false;
    await chrome.storage.local.set({ settings });
  });
  await source.bringToFront();
  await source.locator('#first').dblclick(); await source.waitForTimeout(600);
  assert.equal(new URL(popup.url()).searchParams.get('q'), 'Resilience definition pronunciation');
  assert.equal(await source.locator('[data-clearspace-lookup]').count(), 0);
  console.log('PASS: actual MV3 message, Google popup URL, and popup reuse (external results mocked).');
} finally {
  await context?.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
