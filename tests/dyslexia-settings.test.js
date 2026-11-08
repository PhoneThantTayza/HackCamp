import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDyslexia, restoreDyslexia, dyslexiaChoiceCount } from '../client/src/dyslexia-settings.js';

test('migrate old dyslexia adjustments without inferring a diagnosis or changing other choices', () => {
  const old = { selected: ['vision:Larger text and controls', 'dyslexia:Readable font', 'dyslexia:Shorter lines', 'dyslexia:Wider letter spacing'] };
  assert.deepEqual(restoreDyslexia(old), { experiences: {}, customization: {
    font: 'sans', lineLength: 65, letterSpacing: 0.08, wordSpacing: 0.12,
  } });
  assert.equal(old.selected.length, 4);
});

test('new preferences take precedence over legacy selections and resets produce independent objects', () => {
  const preferences = { enabled: false, experiences: { losePlace: true }, customization: { guide: false } };
  const restored = restoreDyslexia({ dyslexia: preferences, selected: ['dyslexia:Readable font'] });
  assert.deepEqual(restored, preferences);
  restored.customization.guide = true;
  assert.equal(preferences.customization.guide, false);
  assert.equal(dyslexiaChoiceCount(restored), 2);
  const first = emptyDyslexia();
  first.experiences.losePlace = true;
  assert.deepEqual(emptyDyslexia(), { experiences: {}, customization: {} });
});

test('settings adapter saves and reopens dyslexia preferences in the explicitly labelled local demo', async () => {
  const stored = new Map();
  globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  try {
    const { loadSettings, saveSettings, defaults, applyToTarget } = await import('../client/src/settings.js');
    await saveSettings({ ...defaults, selected: ['vision:Larger text and controls'], dyslexia: {
      experiences: { distinguishWords: true, losePlace: true }, customization: { guideSize: 60 },
    } });
    const reopened = await loadSettings();
    assert.equal(reopened.dyslexia.experiences.losePlace, true);
    assert.equal(reopened.dyslexia.customization.guideSize, 60);
    assert.deepEqual(reopened.selected, ['vision:Larger text and controls']);
    await saveSettings({ ...reopened, enabled: false });
    const resumed = await loadSettings();
    assert.equal(resumed.dyslexia.experiences.losePlace, true);
    assert.equal(resumed.enabled, true);
    assert.equal(JSON.parse(stored.get('clearspace-demo')).enabled, true);
    await saveSettings({ ...defaults, dyslexia: emptyDyslexia() });
    assert.deepEqual((await loadSettings()).dyslexia, emptyDyslexia());
    assert.match(await applyToTarget(), /Demo settings saved/);
  } finally { delete globalThis.localStorage; }
});

test('extension adapter persists the UI contract and injects the engine before its storage listener', async () => {
  let stored;
  const injections = [];
  globalThis.chrome = { runtime: { id: 'test-extension' }, storage: { local: {
    get: async () => ({ settings: stored }),
    set: async value => { stored = value.settings; },
  } }, tabs: { query: async () => [] }, permissions: { contains: async () => false }, scripting: { executeScript: async value => {
    injections.push(value);
    return [{ frameId: 0, documentId: 'test-document', result: { applied: true } }];
  } } };
  globalThis.location = { search: '?tab=42' };
  try {
    const { loadSettings, saveSettings, applyToTarget } = await import('../client/src/settings.js?extension-test');
    await saveSettings({ version: 1, enabled: true, light: true, selected: ['vision:Larger text and controls'],
      dyslexia: { experiences: { visualStress: true }, customization: { background: '#f5f0e6' } } });
    const restored = await loadSettings();
    assert.equal(restored.light, true);
    assert.equal(restored.dyslexia.experiences.visualStress, undefined);
    assert.equal(restored.dyslexia.customization.background, undefined);
    assert.deepEqual(restored.selected, ['vision:Larger text and controls']);
    assert.match(await applyToTarget(), /applied to 1 website tab/);
    assert.deepEqual(injections[0], {
      target: { tabId: 42 }, world: 'ISOLATED',
      files: ['color-vision.js', 'low-vision.js', 'light-sensitivity.js', 'focus-mode.js', 'dyslexia.js', 'selection-reader.js', 'word-lookup.js', 'content.js'],
    });
    assert.deepEqual(injections[1].target, { tabId: 42, documentIds: ['test-document'] });
    assert.equal(typeof injections[1].func, 'function');
    chrome.scripting.executeScript = async value => {
      if (value.func) return [{ frameId: 0, result: { applied: false, error: 'application failed' } }];
      return [{ frameId: 0 }];
    };
    await assert.rejects(applyToTarget(), /application failed/);
    chrome.scripting.executeScript = async () => { throw new Error('restricted page'); };
    await assert.rejects(applyToTarget(), /Settings saved, but the webpage could not be adjusted/);
    assert.equal(stored.dyslexia.experiences.visualStress, true);
  } finally { delete globalThis.chrome; delete globalThis.location; }
});
