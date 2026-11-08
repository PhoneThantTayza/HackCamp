import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import vm from 'node:vm';
import { normalizePreferences, effectivePreferences, overlayEffects, browserPreferences, windowsColourMatrix, localRect, engines } from '../desktop/preferences.mjs';
import { atomicJSON, loadPreferences } from '../desktop/store.mjs';
import { NativeClient } from '../desktop/native-client.mjs';
import { installCompanion } from '../desktop/companion.mjs';

test('desktop preferences validate untrusted values and never enable effects by default', () => {
  const initial = normalizePreferences();
  assert.deepEqual(initial.selected, []);
  assert.equal(initial.colorVision.mode, 'off');
  const effects = overlayEffects(initial);
  for (const key of ['dim', 'soften', 'warm', 'guide', 'isolateWindow', 'focus', 'halo']) assert.ok(!effects[key], key);
  const bad = normalizePreferences({ enabled: false, selected: ['vision:Dim page', 'vision:Dim page', 'bogus'], colorVision: { mode: '__proto__', strength: 500 }, desktop: { excludedApps: [5, 'word', 'word'] }, dyslexia: { customization: { guideSize: 10000, guideColor: 'url(https://example.com)', arbitrary: 'value' }, speech: { rate: Infinity } } });
  assert.equal(bad.enabled, false);
  assert.deepEqual(bad.selected, ['vision:Dim page']);
  assert.equal(bad.colorVision.mode, 'off');
  assert.equal(bad.dyslexia.customization.guideSize, 160);
  assert.equal(bad.dyslexia.customization.guideColor, '#ffe58a');
  assert.equal(bad.dyslexia.customization.arbitrary, undefined);
  assert.equal(bad.dyslexia.speech.rate, 1);
  assert.deepEqual(bad.desktop.excludedApps, ['word']);
});
test('pause, exclusions, and all four categories have separate effective coverage', () => {
  const p = normalizePreferences({ selected: ['vision:Dim page', 'vision:Warm colour tint', 'motor:Keyboard focus indicators', 'cognitive:Hide distractions'], dyslexia: { experiences: { losePlace: true } }, desktop: { excludedApps: ['word'] } });
  assert.equal(overlayEffects(p).guide, true);
  assert.equal(overlayEffects(p).focus, true);
  assert.equal(overlayEffects(p).isolateWindow, true);
  assert.ok(overlayEffects(p).dim > 0);
  assert.equal(effectivePreferences(p, 'word').enabled, false);
  assert.equal(effectivePreferences(p, 'other').enabled, true);
  assert.equal(effectivePreferences({ ...p, enabled: false }, 'other').enabled, false);
  assert.equal(p.enabled, true, 'evaluation never modifies the saved preferences');
});
test('browser handoff avoids duplicate display effects but retains content adjustments', () => {
  const p = normalizePreferences({ selected: ['vision:Dim page', 'vision:Soften bright backgrounds', 'vision:Warm colour tint', 'vision:Dark page theme', 'cognitive:Focus mode', 'cognitive:Hide distractions', 'motor:Larger click targets'], colorVision: { mode: 'protan' }, dyslexia: { experiences: { losePlace: true, distinguishWords: true } } });
  const browser = browserPreferences(p, { nativeColour: true });
  assert.deepEqual(browser.selected, ['vision:Dark page theme', 'cognitive:Hide distractions', 'motor:Larger click targets']);
  assert.equal(browser.dyslexia.customization.guide, false);
  assert.equal(engines.dyslexia.suggest(browser.dyslexia).guide, false);
  assert.equal(browser.dyslexia.experiences.distinguishWords, true);
  assert.equal(browser.colorVision.mode, 'off');
  assert.equal(browserPreferences(p).colorVision.mode, 'protan');
  assert.equal(p.colorVision.mode, 'protan');
  assert.ok(p.selected.includes('vision:Soften bright backgrounds'), 'the desktop choice must remain saved');
});
test('background softening works alone without detection and follows strength, pause and app exceptions', () => {
  const settings = strength => normalizePreferences({ selected: ['vision:Soften bright backgrounds'], lightSensitivity: { 'Soften bright backgrounds': strength }, desktop: { detectApps: false, excludedApps: ['editor'] } });
  const zero = overlayEffects(settings(0)), low = overlayEffects(settings(50)), high = overlayEffects(settings(200));
  assert.equal(zero.soften, 0);
  assert.ok(low.soften > 0 && high.soften > low.soften && high.soften <= .5, 'softening is gradual and never becomes opaque');
  assert.equal(low.dim, 0); assert.equal(low.warm, 0);
  assert.equal(overlayEffects({ ...settings(100), selected: [] }).soften, 0, 'unchecking removes the effect');
  assert.equal(overlayEffects({ ...settings(100), enabled: false }).enabled, false);
  assert.equal(overlayEffects(effectivePreferences(settings(100), 'editor')).enabled, false);
  assert.ok(overlayEffects(effectivePreferences(settings(100), 'other')).soften > 0);
  assert.equal(overlayEffects(settings(-100)).soften, 0);
  assert.equal(overlayEffects(settings(10000)).soften, high.soften);
});
test('desktop focus outlines respect zero and increased vision strength and combine with motor settings', () => {
  const selected = ['vision:More visible keyboard focus'];
  assert.equal(overlayEffects({ selected, lowVision: { 'More visible keyboard focus': 0 } }).focus, false);
  const low = overlayEffects({ selected, lowVision: { 'More visible keyboard focus': 25 } });
  const high = overlayEffects({ selected, lowVision: { 'More visible keyboard focus': 200 } });
  assert.ok(high.focusWidth > low.focusWidth);
  assert.equal(overlayEffects({ selected: [...selected, 'motor:Keyboard focus indicators'], lowVision: { 'More visible keyboard focus': 0 }, motor: { focus: 100 } }).focusWidth, 8);
});
test('Windows matrix has the same channel transform as SVG and preserves alpha and neutral grey', () => {
  for (const mode of ['off', 'protan', 'deutan', 'tritan']) {
    const value = { mode, strength: 80 };
    const svg = engines.colour.matrix(value).split(/\s+/).map(Number), win = windowsColourMatrix(value);
    for (const input of [[.6, .1, .2, .4, 1], [.5, .5, .5, 1, 1]]) {
      for (let row = 0; row < 4; row++) {
        const expected = input.reduce((sum, x, col) => sum + x * svg[row * 5 + col], 0);
        const actual = input.reduce((sum, x, col) => sum + x * win[col * 5 + row], 0);
        assert.ok(Math.abs(expected - actual) < 1e-10);
      }
    }
    assert.equal(win[18], 1); assert.equal(win[24], 1);
  }
});
test('overlay geometry supports monitors left and above primary and clips intersecting windows', () => {
  const display = { x: -1920, y: -300, width: 1920, height: 1080 };
  assert.deepEqual(localRect({ x: -2000, y: -200, width: 400, height: 500 }, display), { x: 0, y: 100, width: 320, height: 500 });
  assert.equal(localRect({ x: 0, y: 0, width: 100, height: 100 }, display), null);
  assert.equal(localRect({ x: NaN, y: 0, width: 2, height: 2 }, display), null);
  assert.equal(localRect(null, display), null);
});
test('saved preferences are atomic, recover from corruption, and preserve pause', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'clearspace-test-'));
  try {
    const file = path.join(directory, 'preferences.json');
    assert.equal(loadPreferences(file).error, null);
    atomicJSON(file, { enabled: false, selected: ['vision:Dim page'] });
    assert.equal(loadPreferences(file).preferences.enabled, false);
    assert.equal(existsSync(`${file}.tmp`), false);
    writeFileSync(file, '{bad json');
    assert.match(loadPreferences(file).error, /could not be read/);
    assert.deepEqual(loadPreferences(file).preferences.selected, []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('companion installer rejects arbitrary origins and browser commands before writing', async () => {
  await assert.rejects(installCompanion({ browser: 'chrome', extensionId: '../../bad' }), /32-letter/);
  await assert.rejects(installCompanion({ browser: 'shell', extensionId: 'a'.repeat(32) }), /32-letter/);
});
const helper = path.resolve('build/native', process.platform === 'win32' ? 'clearspace-native.exe' : 'clearspace-native');
test('native helper rejects text capture while detection is off and exits on parent disconnect', { skip: !existsSync(helper), timeout: 10000 }, async () => {
  let failure;
  const client = new NativeClient(helper, event => { assert.equal(event.text, undefined, 'passive detection must never include text'); }, error => { failure = error; });
  client.send({ command: 'watch', enabled: false });
  try { await assert.rejects(client.request('selection'), /detection/i); assert.equal(failure, undefined); }
  finally { const child = client.child; client.stop(); if (child) await new Promise(resolve => child.once('exit', resolve)); }
});
test('native browser host accepts framed requests and never returns application text', { skip: !existsSync(helper), timeout: 10000 }, async () => {
  const child = spawn(helper, [`chrome-extension://${'a'.repeat(32)}/`], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = Buffer.alloc(0); child.stdout.on('data', chunk => { output = Buffer.concat([output, chunk]); });
  const data = Buffer.from(JSON.stringify({ type: 'get-settings' })), header = Buffer.alloc(4); header.writeUInt32LE(data.length);
  child.stdin.end(Buffer.concat([header, data]));
  const exit = await new Promise(resolve => child.once('exit', resolve));
  assert.equal(exit, 0);
  const length = output.readUInt32LE(0);
  assert.equal(output.length, length + 4);
  const reply = JSON.parse(output.subarray(4).toString());
  assert.equal(reply.type, 'clearspace:desktop-settings');
  assert.deepEqual(Object.keys(reply).sort(), ['settings', 'type']);
});
test('packaging includes a separate companion with the native messaging permission', { skip: !existsSync('build/companion/manifest.json') }, () => {
  const manifest = JSON.parse(readFileSync('build/companion/manifest.json', 'utf8'));
  assert.ok(manifest.permissions.includes('nativeMessaging'));
  assert.equal(manifest.background.service_worker, 'desktop-companion.js');
  const standalone = JSON.parse(readFileSync('client/public/manifest.json', 'utf8'));
  assert.equal(standalone.background.service_worker, 'background.js');
});

test('companion clears stale state, applies native snapshots and pauses on timeout/disconnect', async () => {
  const event = () => { const handlers = []; return { addListener(fn) { handlers.push(fn); }, emit(value) { for (const fn of handlers) fn(value); }, handlers }; };
  const storage = { settings: { version: 1, enabled: true, selected: ['vision:Dim page'] } };
  let clock = 0, timer;
  const ports = [], registered = [], injected = [];
  const messages = event();
  const chrome = {
    runtime: { onMessage: messages, onInstalled: event(), onStartup: event(), connectNative(name) {
      assert.equal(name, 'org.clearspace.desktop');
      const port = { onMessage: event(), onDisconnect: event(), postMessage(request) { assert.equal(request.type, 'get-settings'); }, disconnect() { this.onDisconnect.emit(); } };
      ports.push(port); return port;
    } },
    storage: { local: { async get(key) { return { [key]: storage[key] }; }, async set(value) { Object.assign(storage, value); } } },
    permissions: { contains: async () => true }, tabs: { query: async () => [{ id: 42 }] },
    scripting: { getRegisteredContentScripts: async () => [], unregisterContentScripts: async () => {}, registerContentScripts: async value => registered.push(...value), executeScript: async value => injected.push(value) },
  };
  const context = vm.createContext({ chrome, importScripts() {}, Date: { now: () => clock }, setInterval(fn) { timer = fn; return 1; }, clearInterval() { timer = null; } });
  vm.runInContext(readFileSync('client/public/desktop-companion.js', 'utf8'), context);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  assert.equal(storage.settings.enabled, false, 'restarting the service worker clears effects from a previous run');
  const send = type => new Promise(resolve => messages.handlers[0]({ type }, {}, resolve));
  assert.equal((await send('desktop:connect')).ok, true);
  assert.equal(registered.length, 6); assert.equal(injected.length, 6);
  ports[0].onMessage.emit({ type: 'clearspace:desktop-settings', settings: { version: 1, enabled: true, selected: ['motor:Larger click targets'] } });
  await settle(); assert.equal(storage.settings.enabled, true);
  assert.equal(storage.settings.selected[0], 'motor:Larger click targets');
  clock = 9000; timer(); await settle();
  assert.equal(storage.settings.enabled, false, 'an unresponsive host cannot leave effects active');
  ports[0].onMessage.emit({ type: 'clearspace:desktop-settings', settings: { version: 1, enabled: true, selected: [] } });
  await settle(); assert.equal(storage.settings.enabled, true);
  await send('desktop:disconnect');
  assert.equal(storage.settings.enabled, false);
  assert.equal(storage.desktopAutoConnect, false);
  // Late messages from a closed port cannot reactivate effects.
  ports[0].onMessage.emit({ type: 'clearspace:desktop-settings', settings: { version: 1, enabled: true, selected: [] } });
  await settle(); assert.equal(storage.settings.enabled, false);
});
