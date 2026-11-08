// Real Firefox MV3 integration through GeckoDriver, using a temporary unsigned package.
import assert from 'node:assert/strict';
import { mkdtemp, cp, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const folder = await mkdtemp(join(tmpdir(), 'accessify-firefox-test-'));
const extension = join(folder, 'extension'); await cp(resolve('dist-firefox'), extension, { recursive: true });
const manifestPath = join(extension, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
// Grants are scoped to this disposable package; production access remains optional.
manifest.host_permissions = ['http://127.0.0.1/*'];
manifest.browser_specific_settings.gecko.data_collection_permissions = { required: ['websiteContent'] };
await writeFile(manifestPath, JSON.stringify(manifest));
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const zip = join(folder, 'extension.zip'); const xpi = join(folder, 'extension.xpi');
const packed = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -Path ${quote(join(extension, '*'))} -DestinationPath ${quote(zip)}`], { windowsHide: true, encoding: 'utf8' });
if (packed.status !== 0) throw new Error(packed.stderr);
await copyFile(zip, xpi);
const browserRoot = join(tmpdir(), 'accessify-firefox-browser');
const installed = (await readdir(browserRoot)).find(name => /^firefox-\d+$/.test(name));
const binary = process.env.A11YFIX_FIREFOX ?? join(browserRoot, installed, 'firefox/firefox.exe');
const driverPath = process.env.A11YFIX_GECKODRIVER ?? join(tmpdir(), 'accessify-geckodriver/geckodriver.exe');
const fixture = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><html lang="en"><style>body{font:18px Arial}#word{width:max-content}button{margin:8px}</style><p id="word">Extraordinary</p><p>A longer passage for accessible reading.</p><div class="ad-banner" aria-label="Advertisement">Sample advertisement</div><div><button>Sample button</button><button>Another button</button></div><input value="Keep my input">');
});
await new Promise(resolve => fixture.listen(0, '0.0.0.0', resolve));
const portServer = createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
const driver = spawn(driverPath, ['--host', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; driver.stdout.on('data', chunk => { logs += chunk; }); driver.stderr.on('data', chunk => { logs += chunk; });
let session, endpoint;
async function request(path, body, method = 'POST') {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }) });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw new Error(`${path}: ${JSON.stringify(result.value)}`);
  return result.value;
}
const call = (path, body) => request(`${endpoint}${path}`, body);
const evaluate = (script, args = []) => call('/execute/sync', { script, args });
const evaluateAsync = (script, args = []) => call('/execute/async', { script, args });
async function waitFor(script, args = []) {
  for (let count = 0; count < 100; count++) {
    if (await evaluate(script, args)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${script}`);
}
const navigate = url => call('/url', { url });
const switchTo = handle => call('/window', { handle });
async function click(selector) {
  const element = await call('/element', { using: 'css selector', value: selector });
  await call(`/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`);
}
async function rightClick() {
  await call('/actions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', x: 100, y: 100, origin: 'viewport' }, { type: 'pointerDown', button: 2 }, { type: 'pointerUp', button: 2 },
  ] }] });
}
try {
  for (let count = 0; count < 100; count++) {
    try { await request('/status', undefined, 'GET'); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const uuid = randomUUID();
  const created = await request('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': {
    binary, args: ['-headless', '--remote-allow-system-access'], prefs: {
      'xpinstall.signatures.required': false,
      'extensions.webextensions.uuids': JSON.stringify({ [manifest.browser_specific_settings.gecko.id]: uuid }),
    },
  } } } });
  session = created.sessionId; endpoint = `/session/${session}`;
  await call('/timeouts', { script: 15000, pageLoad: 30000 });
  await call('/moz/addon/install', { path: xpi, temporary: true });
  await navigate(`moz-extension://${uuid}/index.html?panel=1`);
  await waitFor("return Boolean(document.querySelector('fieldset:not([disabled])'))");
  const options = await request(`${endpoint}/window`, undefined, 'GET');
  assert.equal(await evaluate('return typeof browser.sidebarAction.open'), 'function');
  assert.equal(await evaluate('return Boolean(window.clearspaceSpeech)'), true);
  const url = `http://127.0.0.1:${fixture.address().port}/`;
  const first = (await call('/window/new', { type: 'tab' })).handle;
  await switchTo(first); await navigate(url);
  const second = (await call('/window/new', { type: 'window' })).handle;
  await switchTo(second); await navigate(`${url}?second`);
  const settings = { version: 1, enabled: true, selected: ['cognitive:Hide distractions', 'vision:Dim page', 'motor:Larger click targets', 'motor:Reduce motion'], lightSensitivity: { 'Dim page': 40 }, motor: { targetSize: 100, motion: 100 }, dyslexia: { experiences: { losePlace: true }, customization: {} } };
  const save = async value => {
    await switchTo(options);
    const result = await evaluateAsync('browser.storage.local.set({settings:arguments[0]}).then(()=>arguments[arguments.length-1](true),error=>arguments[arguments.length-1](error.message))', [value]);
    assert.equal(result, true);
  };
  await save(settings);
  for (const handle of [first, second]) {
    await switchTo(handle);
    await waitFor("return getComputedStyle(document.querySelector('.ad-banner')).display==='none' && getComputedStyle(document.documentElement).filter.includes('brightness') && parseFloat(getComputedStyle(document.querySelector('button')).minHeight)===72");
  }
  await evaluate("const node=document.createElement('div');node.className='advertisement';node.textContent='Dynamic advertisement';document.body.append(node)");
  assert.equal(await evaluate("return getComputedStyle(document.querySelector('.advertisement')).display"), 'none');
  const third = (await call('/window/new', { type: 'tab' })).handle;
  await switchTo(third); await navigate(`${url}?new`);
  await waitFor("return getComputedStyle(document.querySelector('.ad-banner')).display==='none'");
  await navigate(`${url}navigated`);
  await waitFor("return getComputedStyle(document.querySelector('.ad-banner')).display==='none'");
  await save({ ...settings, enabled: false });
  for (const handle of [first, second, third]) {
    await switchTo(handle);
    await waitFor("return getComputedStyle(document.querySelector('.ad-banner')).display!=='none' && getComputedStyle(document.documentElement).filter==='none' && !document.querySelector('#clearspace-click-targets-style')");
    assert.equal(await evaluate("return document.querySelector('input').value"), 'Keep my input');
  }
  // Background permission check and the popup API run in Firefox, without a Google request.
  await save({ ...settings, selected: [], dyslexia: { experiences: { unfamiliarWords: true }, customization: {} } });
  await switchTo(options);
  const speech = await evaluateAsync('window.clearspaceSpeech.getVoices().then(voices=>arguments[arguments.length-1](voices))');
  console.log(`Firefox local voices available: ${speech.length}; audible output is not asserted in headless mode.`);
  assert.equal(await evaluateAsync('browser.permissions.contains({data_collection:["websiteContent"]}).then(value=>arguments[arguments.length-1](value))'), true);
  await evaluate("const button=document.createElement('button');button.id='test-sidebar';button.textContent='Open sidebar';button.onclick=()=>browser.sidebarAction.open().then(()=>document.body.dataset.sidebar='open',e=>document.body.dataset.sidebar=e.message);document.body.append(button)");
  await click('#test-sidebar');
  await waitFor("return Boolean(document.body.dataset.sidebar)");
  assert.equal(await evaluate('return document.body.dataset.sidebar'), 'open');
  await save({ version: 1, enabled: true, selected: [], dyslexia: { experiences: {}, customization: {} } });
  await switchTo(first); await waitFor("return getComputedStyle(document.documentElement).filter==='none'");
  await switchTo(options); await call('/refresh');
  await waitFor("return Boolean(document.querySelector('fieldset:not([disabled])'))");
  assert.deepEqual(await evaluateAsync('browser.storage.local.get("settings").then(value=>arguments[arguments.length-1](value.settings.selected))'), []);
  console.log('PASS real Firefox: MV3 background, settings UI, native sidebar, two windows, existing/new tabs, navigation, dimming, motor targets, dynamic content, disable/reset and persistence.');
} catch (error) {
  console.error(logs.slice(-5000)); throw error;
} finally {
  if (session) await request(`/session/${session}`, undefined, 'DELETE').catch(() => {});
  driver.kill(); fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve));
}
