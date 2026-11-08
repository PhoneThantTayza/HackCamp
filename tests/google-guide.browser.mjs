import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(join(tmpdir(), 'a11yfix-browser-tests/node_modules/playwright-core/index.mjs')));
const folder = await mkdtemp(join(tmpdir(), 'clearspace-google-guide-'));
await cp('dist', join(folder, 'extension'), {recursive:true});
const manifestPath = join(folder, 'extension/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions = ['https://www.google.com/*'];
await writeFile(manifestPath, JSON.stringify(manifest));
const browser = await chromium.launchPersistentContext(join(folder, 'profile'), {
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args:['--enable-unsafe-extension-debugging'], ignoreDefaultArgs:['--disable-extensions'] });
const session = await browser.browser().newBrowserCDPSession();
const { id } = await session.send('Extensions.loadUnpacked', {path:join(folder,'extension')});
const page = await browser.newPage();
const source = await readFile('client/public/dyslexia.js', 'utf8');
page.on('pageerror', error => console.log('PAGE ERROR', error.message));
try {
  await page.goto('https://www.google.com', { waitUntil:'domcontentloaded', timeout:30000 });
  console.log('Page', await page.title());
  await page.evaluate(source);
  await page.evaluate(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) {
      const root = attach.call(this, options);
      if (options.mode === 'closed') globalThis.guideRoot = root;
      return root;
    };
    globalThis.reader = clearspaceDyslexia.createController(document);
    reader.apply({experiences:{losePlace:true}});
  });
  for (const [x, y] of [[100, 100], [500, 350], [700, 500]]) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(100);
    const state = await page.evaluate(() => {
      const line = guideRoot?.querySelector('.line');
      const host = guideRoot?.host;
      if (!line) return null;
      const rect = line.getBoundingClientRect();
      return { hidden:line.hidden || line.parentElement.hidden, width:rect.width,height:rect.height,
        display:getComputedStyle(host).display, visibility:getComputedStyle(host).visibility, opacity:getComputedStyle(host).opacity,
        lineDisplay:getComputedStyle(line).display, hostRect:host.getBoundingClientRect().toJSON() };
    });
    console.log('Guide', x, y, JSON.stringify(state));
    assert.ok(state && !state.hidden && state.width > 0 && state.height > 0);
  }
  await page.screenshot({path:join(tmpdir(),'a11yfix-google-guide.png')});
  console.log('PASS Google homepage guide dimensions');
  await page.evaluate(() => reader.reset());
  const options = await browser.newPage();
  await options.goto(`chrome-extension://${id}/index.html`);
  const tabId = await options.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('https://www.google.com/')).id);
  await options.evaluate(async tabId => {
    await chrome.storage.local.set({settings:{version:1,enabled:true,selected:[],dyslexia:{experiences:{losePlace:true}}}});
    await chrome.scripting.executeScript({target:{tabId},func:() => {
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) {
        const root = attach.call(this, options);
        if (options.mode === 'closed') globalThis.extensionGuideRoot = root;
        return root;
      };
    }});
    await chrome.scripting.executeScript({target:{tabId},files:['color-vision.js','low-vision.js','light-sensitivity.js','dyslexia.js','selection-reader.js','content.js']});
  },tabId);
  const visible = () => options.evaluate(async tabId => (await chrome.scripting.executeScript({target:{tabId},func:() => {
    const line = globalThis.extensionGuideRoot?.querySelector('.line');
    return Boolean(line && !line.hidden && !line.parentElement.hidden && line.getBoundingClientRect().width > 0);
  }}))[0].result, tabId);
  await page.bringToFront();
  await page.mouse.move(300,250);
  await page.waitForTimeout(150);
  assert.equal(await visible(),true);
  const search = page.locator('textarea[name=q],input[name=q]').first();
  await search.fill('guide input remains editable');
  assert.equal(await search.inputValue(),'guide input remains editable');
  await search.click({button:'right'});
  assert.equal(await visible(),false);
  await search.click({button:'right'});
  assert.equal(await visible(),true);
  await options.evaluate(async () => chrome.storage.local.set({settings:{version:1,enabled:false,selected:[]}}));
  await page.waitForTimeout(100);
  assert.equal(await visible(),false);
  console.log('PASS loaded extension on Google: guide, typing, right-click off/on and disable');
} finally { await browser.close(); }
