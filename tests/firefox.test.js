import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { extensionManifest } from '../scripts/extension-manifest.js';

test('Firefox manifest uses document background and sidebar without changing the Chrome manifest', () => {
  const base = JSON.parse(readFileSync('client/public/manifest.json', 'utf8'));
  const result = extensionManifest(base, 'firefox');
  assert.deepEqual(extensionManifest(base, 'chrome'), base);
  assert.equal(base.background.service_worker, 'background.js');
  assert.equal(result.background.service_worker, undefined);
  assert.deepEqual(result.background.scripts, ['firefox-speech.js', 'selection-tts.js', 'word-lookup-background.js', 'background.js']);
  assert.equal(result.sidebar_action.default_panel, 'index.html?panel=1');
  assert.equal(result.side_panel, undefined);
  assert.ok(!result.permissions.includes('sidePanel'));
  assert.ok(!result.permissions.includes('tts'));
  assert.deepEqual(result.optional_host_permissions, base.optional_host_permissions);
  assert.deepEqual(result.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'], optional: ['websiteContent', 'personallyIdentifyingInfo', 'technicalAndInteraction'] });
  for (const file of result.background.scripts) assert.ok(readFileSync(`client/public/${file}`, 'utf8'));
});

test('Firefox speech exposes only local voices and translates speech lifecycle events', async () => {
  const voices = [{ name: 'Local voice', lang: 'en-US', localService: true }, { name: 'Cloud voice', lang: 'en-US', localService: false }];
  const utterances = [], events = [];
  let stops = 0;
  const context = vm.createContext({
    browser: { runtime: { getBrowserInfo() {} } },
    speechSynthesis: { addEventListener() {}, getVoices: () => voices, cancel: () => stops++, speak: utterance => utterances.push(utterance), pause() {}, resume() {} },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
  });
  vm.runInContext(readFileSync('client/public/firefox-speech.js', 'utf8'), context);
  assert.deepEqual(Array.from(await context.clearspaceSpeech.getVoices(), voice => voice.voiceName), ['Local voice']);
  await context.clearspaceSpeech.speak('Hello', { voiceName: 'Local voice', rate: 9, onEvent: event => events.push(event.type) });
  assert.equal(utterances[0].voice, voices[0]); assert.equal(utterances[0].rate, 2);
  utterances[0].onstart(); utterances[0].onend();
  assert.deepEqual(events, ['start', 'end']);
  await assert.rejects(context.clearspaceSpeech.speak('Private text', { voiceName: 'Cloud voice' }), /local voice/);
  context.clearspaceSpeech.stop(); assert.equal(stops, 2);
});

test('Firefox toolbar opens the sidebar inside the action gesture', () => {
  let clicked, opened = 0;
  const noop = { addListener() {} };
  const context = vm.createContext({ browser: {
    action: { onClicked: { addListener(fn) { clicked = fn; } } },
    sidebarAction: { open() { opened++; return Promise.resolve(); } },
    runtime: { onInstalled: noop, onStartup: noop }, storage: { onChanged: noop },
    tabs: { onUpdated: noop }, permissions: { onAdded: noop, onRemoved: noop },
  } });
  vm.runInContext(readFileSync('client/public/background.js', 'utf8'), context);
  clicked({ windowId: 1 });
  assert.equal(opened, 1);
});

test('Firefox lookup sends no selected text without its optional data permission', async () => {
  let listener, consent = false;
  const opened = [];
  const browser = {
    runtime: { id: 'accessify', getBrowserInfo() {}, onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: { get: async () => ({ settings: { version: 1, enabled: true, dyslexia: { experiences: { unfamiliarWords: true } } } }) } },
    permissions: { contains: async () => consent },
    windows: { onRemoved: { addListener() {} }, get: async () => ({ width: 1000, height: 800, left: 0, top: 0 }), create: async options => { opened.push(options); return { id: 3, tabs: [{ id: 30 }] }; } },
  };
  const context = vm.createContext({ browser });
  vm.runInContext(readFileSync('client/public/word-lookup-background.js', 'utf8'), context);
  const send = () => new Promise(resolve => listener({ type: 'clearspace:word-lookup', text: 'Extraordinary' }, { id: 'accessify', tab: { id: 1, windowId: 2 }, url: 'https://example.com' }, resolve));
  assert.equal((await send()).cancelled, true);
  assert.equal(opened.length, 0);
  consent = true;
  assert.equal((await send()).ok, true);
  assert.equal(new URL(opened[0].url).searchParams.get('q'), 'Extraordinary definition pronunciation');
});
