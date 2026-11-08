import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('settings changes reconnect existing tabs across windows and isolate permission failures', async () => {
  let settingsChanged, navigated, clicked;
  const injections = [];
  const openedPanels = [];
  const openedTabs = [];
  const noop = { addListener() {} };
  const context = vm.createContext({ importScripts() {}, chrome: {
    sidePanel: { open: async options => openedPanels.push(options) },
    action: { onClicked: { addListener(fn) { clicked = fn; } } },
    runtime: { getURL: value => `chrome-extension://test/${value}`, onInstalled: noop, onStartup: noop },
    storage: { onChanged: { addListener(fn) { settingsChanged = fn; } } },
    permissions: { onAdded: noop, onRemoved: noop },
    tabs: {
      onUpdated: { addListener(fn) { navigated = fn; } }, create(options) { openedTabs.push(options); },
      query: async () => [{ id: 1, windowId: 10 }, { id: 2, windowId: 20 }, { id: 3, url: 'https://denied.example' }, { id: 4, url: 'chrome://settings' }],
    },
    scripting: { executeScript: async options => {
      injections.push(options);
      if (options.target.tabId === 3) throw new Error('Access denied');
      return [{ frameId: 0 }];
    } },
  } });
  vm.runInContext(readFileSync('client/public/background.js', 'utf8'), context);
  settingsChanged({ settings: { newValue: { enabled: true } } }, 'local');
  await vm.runInContext('updateQueue', context);
  assert.deepEqual(injections.filter(item => item.files.includes('content.js')).map(item => item.target.tabId), [1, 2, 3]);
  assert.ok(injections.some(item => item.target.tabId === 2 && item.files.includes('click-targets.js')));
  assert.ok(!injections.some(item => item.target.tabId === 4));
  injections.length = 0;
  settingsChanged({ theme: {} }, 'local');
  await vm.runInContext('updateQueue', context);
  assert.equal(injections.length, 0);
  navigated(5, { status: 'loading' }, { url: 'https://example.com' });
  assert.equal(injections.length, 0);
  navigated(5, { status: 'complete' }, { url: 'https://example.com' });
  assert.ok(injections.some(item => item.target.tabId === 5 && item.files.includes('content.js')));
  clicked({ id: 6, windowId: 20 });
  assert.equal(openedPanels[0].windowId, 20);
  assert.equal(openedTabs.length, 0, 'Toolbar opens the side panel instead of a settings tab');
  assert.ok(injections.some(item => item.target.tabId === 6 && item.files.includes('content.js')));
});
