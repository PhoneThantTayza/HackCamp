import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemEffects } from '../desktop/system-effects.mjs';
import { normalizePreferences, browserPreferences, engines } from '../desktop/preferences.mjs';

const settings = patch => normalizePreferences({ selected: ['vision:Dark page theme'], colorVision: { mode: 'protan', strength: 100 }, ...patch });
test('desktop effects request OS appearance and the native channel matrix on each platform', async () => {
  for (const platform of ['darwin', 'win32']) {
    const calls = [];
    const effects = new SystemEffects(platform, async (name, value) => { calls.push([name, value]); return { applied: name === 'colour' ? !!value.matrix : value.enabled }; });
    await effects.update(settings());
    assert.equal(effects.status.colour.state, 'active');
    assert.equal(effects.status.appearance.state, 'active');
    assert.equal(calls.find(([name]) => name === 'appearance')[1].enabled, true);
    const matrix = calls.find(([name]) => name === 'colour')[1].matrix;
    assert.equal(matrix.length, platform === 'darwin' ? 20 : 25);
    if (platform === 'darwin') assert.deepEqual(matrix, engines.colour.matrix(settings().colorVision).split(/\s+/).map(Number));
    await effects.update(settings());
    assert.equal(calls.length, 2, 'context changes do not reapply an unchanged filter');
    await effects.update(settings({ enabled: false }));
    assert.equal(effects.status.colour.state, 'off');
    assert.equal(effects.status.appearance.state, 'off');
    assert.deepEqual(calls.slice(2), [['colour', { matrix: null }], ['appearance', { enabled: false }]]);
  }
});
test('pause during native startup removes the effect after its delayed acknowledgement', async () => {
  let acknowledge;
  const calls = [];
  const effects = new SystemEffects('darwin', async (name, value) => {
    calls.push([name, value]);
    if (name === 'colour' && value.matrix) return new Promise(resolve => { acknowledge = resolve; });
    return { applied: false };
  });
  const starting = effects.update(settings({ selected: [] }));
  assert.equal(effects.status.colour.applied, false);
  await effects.update(settings({ enabled: false }));
  assert.ok(calls.some(([name, value]) => name === 'colour' && value.matrix === null), 'pause must send stop without waiting for capture startup');
  acknowledge({ applied: true });
  await starting;
  assert.equal(effects.status.colour.state, 'off');
  assert.deepEqual(calls.filter(([name]) => name === 'colour').at(-1)[1], { matrix: null });
});
test('permission failures retain the browser fallback, do not loop prompts, and can be retried', async () => {
  let allowed = false, attempts = 0;
  const p = settings({ selected: [] });
  const effects = new SystemEffects('darwin', async (name, value) => {
    if (name === 'appearance') return { applied: false };
    attempts++;
    if (!allowed) throw new Error('Screen Recording permission required');
    return { applied: !!value.matrix };
  });
  await effects.update(p);
  assert.match(effects.status.colour.error, /permission/);
  assert.equal(browserPreferences(p, { nativeColour: effects.status.colour.applied }).colorVision.mode, 'protan');
  await effects.update(p); assert.equal(attempts, 1);
  allowed = true; await effects.retry('colour');
  assert.equal(effects.status.colour.state, 'active');
  assert.equal(browserPreferences(p, { nativeColour: effects.status.colour.applied }).colorVision.mode, 'off');
  effects.failed('colour', 'The capture stream stopped');
  assert.equal(effects.status.colour.applied, false);
  assert.equal(browserPreferences(p, { nativeColour: effects.status.colour.applied }).colorVision.mode, 'protan');
  await effects.retry('colour'); assert.equal(effects.status.colour.state, 'active');
  assert.throws(() => effects.retry('shell'), /Unknown/);
});
test('zero strength stops the desktop filter while keeping the selected palette', async () => {
  const calls = [];
  const effects = new SystemEffects('win32', async (name, value) => { calls.push([name, value]); return { applied: name === 'colour' ? !!value.matrix : value.enabled }; });
  await effects.update(settings());
  await effects.update(settings({ colorVision: { mode: 'deutan', strength: 0 } }));
  assert.equal(effects.status.colour.state, 'off');
  assert.equal(effects.status.appearance.state, 'active');
  assert.deepEqual(calls.at(-1), ['colour', { matrix: null }]);
});
test('native refusal is never advertised as active', async () => {
  const effects = new SystemEffects('darwin', async () => ({ applied: false }));
  await effects.update(settings());
  assert.equal(effects.status.appearance.state, 'error');
  assert.equal(effects.status.colour.state, 'error');
});
test('a failed restoration retains the last native filter until removal is confirmed', async () => {
  let fail = true;
  const effects = new SystemEffects('win32', async (name, value) => {
    if (name === 'colour' && !value.matrix && fail) throw new Error('Could not restore the display');
    return { applied: name === 'colour' ? !!value.matrix : value.enabled };
  });
  await effects.update(settings());
  await effects.update(settings({ enabled: false }));
  assert.equal(effects.status.colour.state, 'error');
  assert.equal(effects.status.colour.applied, true);
  fail = false; await effects.retry('colour');
  assert.equal(effects.status.colour.state, 'off');
  assert.equal(effects.status.colour.applied, false);
});
