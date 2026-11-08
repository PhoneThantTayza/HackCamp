import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('lookup validates sender, setting and short selections, reuses its popup, and recovers after close', async () => {
  let handler, removed, enabled = true;
  const creates = [], navigations = [];
  const context = vm.createContext({ chrome: {
    runtime: { id: 'extension', onMessage: { addListener(fn) { handler = fn; } } },
    storage: { local: { get: async () => ({ settings: { version: 1, enabled, dyslexia: { experiences: { unfamiliarWords: true } } } }) } },
    tabs: { get: async () => ({ windowId: 9 }), update: async (id, details) => navigations.push({ id, ...details }) },
    windows: {
      onRemoved: { addListener(fn) { removed = fn; } },
      get: async () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      update: async () => {},
      create: async details => { creates.push(details); return { id: 9, tabs: [{ id: 90 }] }; },
    },
  } });
  vm.runInContext(readFileSync('client/public/word-lookup-background.js', 'utf8'), context);
  const sender = { id: 'extension', url: 'https://example.com', tab: { id: 1, windowId: 2 } };
  const send = (text, from = sender) => new Promise(resolve => {
    assert.equal(handler({ type: 'clearspace:word-lookup', text }, from, resolve), true);
  });
  assert.equal((await send('hello', { ...sender, id: 'other' })).ok, false);
  assert.equal((await send('a '.repeat(10))).ok, false);
  assert.equal((await send('x'.repeat(121))).ok, false);
  enabled = false;
  assert.equal((await send('hello')).ok, false);
  assert.equal(creates.length, 0);
  enabled = true;
  assert.equal((await send('café & tea')).ok, true);
  assert.equal(creates.length, 1);
  assert.equal(creates[0].type, 'popup');
  assert.equal(new URL(creates[0].url).searchParams.get('q'), 'café & tea definition pronunciation');
  assert.equal((await send('another')).ok, true);
  assert.equal(creates.length, 1);
  assert.equal(navigations.length, 1);
  assert.equal((await send('recursive', { ...sender, tab: { id: 90, windowId: 9 } })).ok, false);
  removed(9);
  await send('fresh');
  assert.equal(creates.length, 2);
  assert.equal((await send('frame', { ...sender, url: 'about:blank', origin: 'https://example.com' })).ok, true);
  assert.equal((await send('frame', { ...sender, url: 'about:blank', origin: 'null' })).ok, false);
  context.chrome.windows.get = async () => { throw new Error('Source window unavailable'); };
  removed(9);
  const failure = await send('error');
  assert.equal(failure.ok, false);
  assert.equal(failure.message, 'Source window unavailable');
});
