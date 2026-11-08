// Real extension isolated-world check in a disposable profile and localhost-only test package.
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const { chromium } = await import(pathToFileURL(join(tmpdir(), 'a11yfix-browser-tests/node_modules/playwright-core/index.mjs')));
const folder = await mkdtemp(join(tmpdir(), 'clearspace-guide-'));
await cp(resolve('dist'), join(folder, 'extension'), { recursive: true });
const manifestPath = join(folder, 'extension/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(manifestPath, JSON.stringify(manifest));
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><p>Reading guide test text</p><button>Button</button><input value="Keep my input"><script>document.addEventListener("contextmenu",e=>{e.preventDefault();e.stopImmediatePropagation()},true)</script>');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let context;
try {
  context = await chromium.launchPersistentContext(join(folder, 'profile'), {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-unsafe-extension-debugging'], ignoreDefaultArgs: ['--disable-extensions']
  });
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: join(folder, 'extension') });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/index.html`);
  const tabId = await options.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('http://127.0.0.1:')).id);
  await options.evaluate(async tabId => {
    await chrome.scripting.executeScript({ target: { tabId }, func: () => {
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) {
        const root = attach.call(this, options);
        if (options.mode === 'closed') globalThis.testGuideRoot = root;
        return root;
      };
    } });
    await chrome.storage.local.set({ settings: { version: 1, enabled: true, selected: [], dyslexia: { experiences: { losePlace: true } } } });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['dyslexia.js', 'selection-reader.js', 'content.js'] });
  }, tabId);
  const visible = () => options.evaluate(async tabId => (await chrome.scripting.executeScript({ target: { tabId }, func: () => {
    const line = globalThis.testGuideRoot?.querySelector('.line');
    return Boolean(line && !line.hidden && !line.parentElement.hidden);
  } }))[0].result, tabId);
  await page.bringToFront();
  await page.locator('button').hover();
  await page.waitForTimeout(100);
  assert.equal(await visible(), true);
  for (let i = 0; i < 5; i++) {
    await page.locator('input').click({ button: 'right' });
    assert.equal(await visible(), false);
    await page.locator('input').click({ button: 'right' });
    assert.equal(await visible(), true);
    await page.locator('button').hover();
    await page.waitForTimeout(50);
    assert.equal(await visible(), true);
  }
  assert.equal(await page.locator('input').inputValue(), 'Keep my input');
  console.log('PASS real loaded extension: five right-click off/on cycles in isolated world with a blocking website context-menu handler');
} finally {
  await context?.close();
  await new Promise(done => server.close(done));
}
