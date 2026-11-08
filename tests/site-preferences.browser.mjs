import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const { chromium } = await import(pathToFileURL(process.env.A11YFIX_PLAYWRIGHT ?? join(tmpdir(), 'a11yfix-browser-tests/node_modules/playwright-core/index.mjs')));
const folder = await mkdtemp(join(tmpdir(), 'accessify-site-preferences-'));
await cp(resolve('dist'), join(folder, 'extension'), { recursive: true });
const manifestPath = join(folder, 'extension/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
// Grant fixture permissions so this test does not depend on Chrome's native prompt.
manifest.permissions.push('tabs'); manifest.optional_permissions = [];
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(manifestPath, JSON.stringify(manifest));
const servers = [0, 1].map(() => createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><p>Reading page</p><div class="ad-banner">Advertisement</div><button>Website button</button><input value="Keep my input">');
}));
await Promise.all(servers.map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))));
let context;
try {
  context = await chromium.launchPersistentContext(join(folder, 'profile'), {
    executablePath: process.env.A11YFIX_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-unsafe-extension-debugging'], ignoreDefaultArgs: ['--disable-extensions'],
  });
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: join(folder, 'extension') });
  const origins = servers.map(server => `http://127.0.0.1:${server.address().port}`);
  const first = await context.newPage(); await first.goto(origins[0]);
  const second = await context.newPage(); await second.goto(origins[1]);
  const duplicate = await context.newPage(); await duplicate.goto(origins[0] + '/second');
  const options = await context.newPage(); await options.setViewportSize({ width: 360, height: 900 });
  const errors = []; options.on('pageerror', error => errors.push(error.message));
  await options.goto(`chrome-extension://${id}/index.html?panel=1`);
  await options.locator('fieldset:not([disabled])').first().waitFor();
  await options.locator('button[aria-controls="cognitive-options"]').click();
  const hide = options.getByRole('checkbox', { name: /Too many distractions on the page/ });
  await hide.check();
  const hidden = page => page.waitForFunction(() => getComputedStyle(document.querySelector('.ad-banner')).display === 'none');
  const visible = page => page.waitForFunction(() => getComputedStyle(document.querySelector('.ad-banner')).display !== 'none');
  await Promise.all([hidden(first), hidden(second)]);
  await options.getByRole('button', { name: /Choose websites/ }).click();
  const menu = options.locator('#website-choices');
  assert.equal(await menu.getByRole('checkbox').count(), 2, 'websites are grouped across tabs');
  const firstRow = menu.locator('label').filter({ hasText: origins[0] }).locator('..');
  const secondRow = menu.locator('label').filter({ hasText: origins[1] }).locator('..');
  assert.equal(await menu.getByRole('button', { name: /Edit website|Save as default|Edit default/ }).count(), 0);
  await options.reload();
  await options.locator('fieldset:not([disabled])').first().waitFor();
  await options.locator('button[aria-controls="cognitive-options"]').click();
  await options.getByRole('button', { name: /Choose websites/ }).click();
  assert.equal(await hide.isChecked(), true, 'choices save automatically in the browser');
  await secondRow.getByRole('checkbox').uncheck();
  await visible(second);
  await options.getByRole('button', { name: /Choose websites/ }).click();
  await options.getByRole('button', { name: /Choose websites/ }).click();
  assert.equal(await secondRow.getByRole('checkbox').isChecked(), false, 'closing the menu keeps website toggles without Apply');
  await options.reload();
  await options.locator('fieldset:not([disabled])').first().waitFor();
  await options.locator('button[aria-controls="cognitive-options"]').click();
  await options.getByRole('button', { name: /Choose websites/ }).click();
  assert.equal(await secondRow.getByRole('checkbox').isChecked(), false, 'website toggle persists after reopening settings without Apply');
  await menu.getByRole('button', { name: 'Apply to selected websites' }).click();
  await Promise.all([hidden(first), hidden(duplicate), visible(second)]);
  const navigated = await context.newPage(); await navigated.goto(origins[1] + '/new'); await visible(navigated);
  await first.reload(); await hidden(first);
  await secondRow.getByRole('checkbox').check();
  await menu.getByRole('button', { name: 'Apply to selected websites' }).click();
  await Promise.all([hidden(first), hidden(second), hidden(navigated)]);
  assert.equal(await menu.getByRole('button', { name: 'Clear all', exact: true }).count(), 1);
  await menu.getByRole('button', { name: 'Clear all', exact: true }).click();
  await Promise.all([visible(first), visible(second), visible(duplicate), visible(navigated)]);
  await options.waitForFunction(async origins => {
    const { settings } = await chrome.storage.local.get('settings');
    return origins.every(origin => settings.pausedSites.includes(origin)) && !Object.keys(settings.siteProfiles).length;
  }, origins);
  assert.equal(await hide.isChecked(), true, 'Clear all keeps adjustment preferences');
  await options.reload();
  await options.locator('fieldset:not([disabled])').first().waitFor();
  await options.getByRole('button', { name: /Choose websites/ }).click();
  assert.equal(await firstRow.getByRole('checkbox').isChecked(), false, 'Clear all persists after reopening settings');
  assert.equal(await secondRow.getByRole('checkbox').isChecked(), false);
  await visible(second);
  assert.equal(await first.locator('input').inputValue(), 'Keep my input');
  assert.equal(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await options.setViewportSize({ width: 180, height: 900 });
  assert.equal(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('PASS MV3 site dropdown: one Clear all button, cleared website choices, persisted selections, preserved adjustment preferences, checked-site apply, navigation, and narrow layouts.');
} finally {
  await context?.close();
  await Promise.all(servers.map(server => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); }));
}
