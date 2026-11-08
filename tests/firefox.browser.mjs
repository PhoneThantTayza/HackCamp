// Real Firefox MV3 integration through GeckoDriver, using a temporary unsigned package.
import assert from 'node:assert/strict';
import { mkdtemp, cp, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const folder = await mkdtemp(join(tmpdir(), 'accessify-firefox-test-'));
const extension = join(folder, 'extension'); await cp(resolve('dist-firefox'), extension, { recursive: true });
const manifestPath = join(extension, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
// Grants are scoped to this disposable package; production access remains optional.
manifest.host_permissions = ['http://127.0.0.1/*'];
manifest.browser_specific_settings.gecko.data_collection_permissions = { required: ['websiteContent'] };
await writeFile(manifestPath, JSON.stringify(manifest));
// Keep the real lookup message/window path, but replace its destination in the test copy.
for (const file of ['word-lookup-background.js', 'preview.js']) {
  const lookupPath = join(extension, file);
  const lookupSource = await readFile(lookupPath, 'utf8');
  const mockLookup = lookupSource.replace(/const url = `https:\/\/www\.google\.com\/search[^;]+;/, 'const url = "about:blank#" + encodeURIComponent(text);');
  assert.notEqual(mockLookup, lookupSource);
  await writeFile(lookupPath, mockLookup);
}
const zip = join(folder, 'extension.zip'); const xpi = join(folder, 'extension.xpi');
const packed = spawnSync(join(process.env.SystemRoot ?? 'C:/Windows', 'System32/tar.exe'), ['-a', '-cf', zip, '-C', extension, ...await readdir(extension)], { windowsHide: true, encoding: 'utf8' });
if (packed.status !== 0) throw new Error(packed.stderr || packed.error?.message);
await copyFile(zip, xpi);
const binary = process.env.A11YFIX_FIREFOX ?? join(tmpdir(), 'accessify-native-firefox/firefox/firefox.exe');
const driverPath = process.env.A11YFIX_GECKODRIVER ?? join(tmpdir(), 'accessify-geckodriver/geckodriver.exe');
const fixture = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><html lang="en"><style>body{font:18px Arial}#word{width:max-content}button{margin:8px}</style><p id="word">Extraordinary</p><p>A longer passage for accessible reading.</p><div class="ad-banner" aria-label="Advertisement">Sample advertisement</div><div><button>Sample button</button><button>Another button</button></div><input value="Keep my input">');
});
await new Promise(resolve => fixture.listen(0, '0.0.0.0', resolve));
const portServer = createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
const driver = spawn(driverPath, ['--host', '127.0.0.1', '--port', String(port), '--allow-system-access'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
async function cornerBrightness() {
  const png = Buffer.from(await request(`${endpoint}/screenshot`, undefined, 'GET'), 'base64');
  const chunks = [];
  assert.equal(png[24], 8); assert.ok([2, 6].includes(png[25]));
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(chunks));
  return pixels[1] + pixels[2] + pixels[3];
}
async function selectWord() {
  const rect = await evaluate("const r=document.querySelector('#word').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}");
  await call('/actions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', ...rect, origin: 'viewport' },
    { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }, { type: 'pause', duration: 50 },
    { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 },
  ] }] });
}
try {
  for (let count = 0; count < 100; count++) {
    try { await request('/status', undefined, 'GET'); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const uuid = randomUUID();
  const created = await request('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': {
    binary, args: ['-headless'], prefs: {
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
  await rightClick(); const bandOff = await cornerBrightness();
  await rightClick(); assert.ok(await cornerBrightness() < bandOff, 'Right-click enables the focus band in Firefox');
  await call('/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' }] }] });
  await call('/actions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', x: 200, y: 150, origin: 'viewport' }] }] });
  assert.equal(await cornerBrightness(), bandOff, 'Escape stays off after moving the pointer');
  await rightClick(); assert.ok(await cornerBrightness() < bandOff);
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
  const handlesBefore = await request(`${endpoint}/window/handles`, undefined, 'GET');
  await switchTo(first); await selectWord();
  let popup;
  for (let attempt = 0; attempt < 60; attempt++) {
    popup = (await request(`${endpoint}/window/handles`, undefined, 'GET')).find(handle => !handlesBefore.includes(handle));
    if (popup) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(popup, 'Firefox word selection opens a lookup window');
  await switchTo(popup);
  assert.equal(await request(`${endpoint}/url`, undefined, 'GET'), 'about:blank#Extraordinary');
  await save({ ...settings, selected: [], dyslexia: { experiences: { unfamiliarWords: false }, customization: {} } });
  await switchTo(first); await selectWord(); await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal((await request(`${endpoint}/window/handles`, undefined, 'GET')).length, handlesBefore.length + 1);
  assert.equal(await evaluate("return document.querySelectorAll('[data-clearspace-lookup]').length"), 0);
  await switchTo(options);
  const speech = await evaluateAsync('window.clearspaceSpeech.getVoices().then(voices=>arguments[arguments.length-1](voices))');
  console.log(`Firefox local voices available: ${speech.length}; audible output is not asserted in headless mode.`);
  assert.equal(await evaluateAsync('browser.permissions.contains({data_collection:["websiteContent"]}).then(value=>arguments[arguments.length-1](value))'), true);
  await evaluate("const button=document.createElement('button');button.id='test-sidebar';button.textContent='Open sidebar';button.onclick=()=>browser.sidebarAction.open().then(()=>document.body.dataset.sidebar='open',e=>document.body.dataset.sidebar=e.message);document.body.append(button)");
  await click('#test-sidebar');
  await waitFor("return Boolean(document.body.dataset.sidebar)");
  assert.equal(await evaluate('return document.body.dataset.sidebar'), 'open');
  await save({ ...settings, selected: [], dyslexia: { experiences: { unfamiliarWords: true }, customization: {} } });
  await switchTo(options); await call('/refresh');
  await waitFor("return Boolean(document.querySelector('fieldset:not([disabled])'))");
  await click('.panel-preview > summary');
  const iframe = await call('/element', { using: 'css selector', value: 'iframe' });
  await call('/frame', { id: iframe });
  await waitFor("return Boolean(document.querySelector('#preview-reading'))");
  const paragraph = await call('/element', { using: 'css selector', value: '#preview-reading' });
  const offset = await evaluate("const p=document.querySelector('#preview-reading');const r=document.createRange();r.setStart(p.firstChild,0);r.setEnd(p.firstChild,5);const word=r.getBoundingClientRect(),box=p.getBoundingClientRect();return {x:Math.round(word.x+word.width/2-box.x-box.width/2),y:Math.round(word.y+word.height/2-box.y-box.height/2)}");
  const previewHandles = await request(`${endpoint}/window/handles`, undefined, 'GET');
  await call('/actions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', origin: paragraph, ...offset }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 },
    { type: 'pause', duration: 50 }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 },
  ] }] });
  let previewPopup;
  for (let attempt = 0; attempt < 60; attempt++) {
    previewPopup = (await request(`${endpoint}/window/handles`, undefined, 'GET')).find(handle => !previewHandles.includes(handle));
    if (previewPopup) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(previewPopup, 'Firefox preview selections open a lookup window');
  await switchTo(previewPopup);
  assert.equal(await request(`${endpoint}/url`, undefined, 'GET'), 'about:blank#Small');
  assert.equal(await evaluate('return window.opener'), null);
  await switchTo(options); await call('/frame', { id: null });
  await save({ version: 1, enabled: true, selected: [], dyslexia: { experiences: {}, customization: {} } });
  await switchTo(first); await waitFor("return getComputedStyle(document.documentElement).filter==='none'");
  await switchTo(options); await call('/refresh');
  await waitFor("return Boolean(document.querySelector('fieldset:not([disabled])'))");
  assert.deepEqual(await evaluateAsync('browser.storage.local.get("settings").then(value=>arguments[arguments.length-1](value.settings.selected))'), []);
  console.log('PASS real Firefox: MV3 background, UI/sidebar, two windows, existing/new tabs, navigation, dimming, motor targets, dynamic content, focus toggling, webpage/preview lookup, silent disable, reset and persistence.');
} catch (error) {
  console.error(logs.slice(-5000)); throw error;
} finally {
  if (session) await request(`/session/${session}`, undefined, 'DELETE').catch(() => {});
  driver.kill(); fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve));
}
