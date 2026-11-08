import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const context = vm.createContext({});
vm.runInContext(readFileSync('client/public/site-settings.js', 'utf8'), context);
const { profile, resolve } = context.clearspaceSiteSettings;

test('website overrides preserve defaults and other sites; pause wins over an override', () => {
  const settings = { version: 1, enabled: true, light: true, selected: ['motor:Extra button spacing'], motor: { spacing: 1 },
    siteProfiles: { 'https://news.example': { selected: ['motor:Extra button spacing'], motor: { spacing: 3 }, enabled: true, light: false } }, pausedSites: ['https://mail.example'] };
  assert.equal(resolve(settings, { origin: 'https://other.example' }), settings);
  assert.equal(resolve(settings, { origin: 'https://news.example' }).motor.spacing, 3);
  assert.equal(resolve(settings, { origin: 'https://news.example' }).light, true);
  assert.equal(resolve(settings, { origin: 'https://mail.example' }).enabled, false);
  assert.equal(settings.enabled, true);
  assert.equal(settings.motor.spacing, 1);
  settings.pausedSites.push('https://news.example');
  assert.equal(resolve(settings, { origin: 'https://frame.example', ancestorOrigins: ['https://news.example'] }).enabled, false);
  settings.pausedSites = [];
  assert.equal(resolve(settings, { origin: 'https://frame.example', ancestorOrigins: ['https://news.example'] }).motor.spacing, 3);
  delete settings.siteProfiles['https://news.example'];
  assert.equal(resolve(settings, { origin: 'https://news.example' }).motor.spacing, 1);
});

test('profile copies are independent and exclude UI theme and website control metadata', () => {
  const settings = { selected: ['motor:Reduce motion'], motor: { motion: 2 }, light: true, pausedSites: ['https://example.com'], siteProfiles: {}, enabled: false };
  const copy = profile(settings);
  copy.motor.motion = 3;
  copy.selected.length = 0;
  assert.equal(settings.motor.motion, 2);
  assert.equal(settings.selected.length, 1);
  assert.deepEqual(Object.keys(copy).sort(), ['motor', 'selected']);
});

test('open website listing groups tabs across windows and excludes protected or unreadable URLs', async () => {
  globalThis.chrome = { runtime: { id: 'fixture' }, storage: {}, tabs: { query: async () => [
    { url: 'https://news.example/story', windowId: 1 }, { url: 'https://news.example/other', windowId: 2 },
    { url: 'https://mail.example/inbox' }, { url: 'chrome://settings' }, { url: 'https://chromewebstore.google.com/detail/test' },
    { url: 'https://chrome.google.com/webstore/detail/test' }, {}, { url: 'invalid' },
  ] } };
  try {
    const { listOpenSites } = await import('../client/src/settings.js');
    assert.deepEqual(await listOpenSites(), [{ origin: 'https://mail.example', count: 1 }, { origin: 'https://news.example', count: 2 }]);
  } finally { delete globalThis.chrome; }
});
