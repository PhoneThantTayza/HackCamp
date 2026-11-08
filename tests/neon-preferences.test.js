import test from 'node:test';
import assert from 'node:assert/strict';
import { neonPreferences } from '../server/neon-preferences.js';

test('Neon queries scope reads and writes to parameterized account IDs', async () => {
  const calls = [];
  const settings = { version: 1, selected: ["quote ' and SQL ; --"] };
  const sql = async (parts, ...values) => {
    const query = parts.join('?');
    calls.push({ query, values });
    if (query.includes('SELECT')) return values[0] === 'account-a'
      ? [{ settings, updated_at: '2026-11-08T00:00:00Z' }] : [];
    if (query.includes('INSERT')) return [{ updated_at: '2026-11-08T00:00:00Z' }];
    return [];
  };
  const store = neonPreferences('unused', sql);
  assert.equal(await store.put('account-a', settings), '2026-11-08T00:00:00Z');
  assert.deepEqual(await store.get('account-a'), { settings, updatedAt: '2026-11-08T00:00:00Z' });
  assert.equal(await store.get('account-b'), null);
  assert.equal(calls.filter(call => call.query.includes('CREATE TABLE')).length, 1);
  const insert = calls.find(call => call.query.includes('INSERT'));
  assert.deepEqual(insert.values, ['account-a', JSON.stringify(settings)]);
  assert.match(insert.query, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.ok(!insert.query.includes(settings.selected[0]));
  assert.deepEqual(calls.filter(call => call.query.includes('SELECT')).map(call => call.values), [['account-a'], ['account-b']]);
});

test('initialization retries after failure and save failures are propagated', async () => {
  let attempts = 0;
  const store = neonPreferences('unused', async parts => {
    if (parts.join('').includes('CREATE TABLE')) {
      if (++attempts === 1) throw new Error('database asleep');
      return [];
    }
    throw new Error('database unavailable');
  });
  await assert.rejects(store.get('account-a'), /database asleep/);
  await assert.rejects(store.put('account-a', {}), /database unavailable/);
  assert.equal(attempts, 2);
});
