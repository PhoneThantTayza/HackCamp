// Explicit manual integration check: briefly changes appearance/colours and then
// asks the helper to restore them. Not part of the unattended test suite.
import assert from 'node:assert/strict';
import path from 'node:path';
import { NativeClient } from '../desktop/native-client.mjs';
import { engines, windowsColourMatrix } from '../desktop/preferences.mjs';

const client = new NativeClient(path.resolve('build/native', process.platform === 'win32' ? 'clearspace-native.exe' : 'clearspace-native'), () => {}, message => console.error(message), event => { console.error(event.error); process.exitCode = 1; });
client.send({ command: 'watch', enabled: false });
try {
  try {
    assert.equal((await client.request('appearance', { enabled: true })).applied, true);
    console.log('System Dark mode enabled and verified by the helper.');
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) { console.error(`Dark mode check blocked: ${error.message}`); process.exitCode = 1; }
  finally { await client.request('appearance', { enabled: false }); }
  for (const mode of ['protan', 'deutan', 'tritan']) {
    const settings = { mode, strength: 100 };
    const matrix = process.platform === 'win32' ? windowsColourMatrix(settings) : engines.colour.matrix(settings).split(/\s+/).map(Number);
    try {
      assert.equal((await client.request('colour', { matrix })).applied, true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log(`${mode}: desktop renderer started and acknowledged live frames.`);
    } catch (error) { console.error(`Desktop colour check blocked: ${error.message}`); process.exitCode = 1; break; }
  }
} finally {
  try { await client.request('colour', { matrix: null }); await client.request('appearance', { enabled: false }); }
  finally {
    const child = client.child; client.stop();
    if (child) await new Promise(resolve => child.once('exit', resolve));
    console.log('Native helper stopped; desktop adjustments removed.');
  }
}
