importScripts('selection-tts.js');
const host = 'org.clearspace.desktop';
const origins = ['http://*/*', 'https://*/*'];
let port, poll, pending = Promise.resolve(), lastSettings = '', connectionGeneration = 0, lastReply = 0;
let connectionQueue = Promise.resolve();
function queueConnection(action) { connectionQueue = connectionQueue.catch(() => {}).then(action); return connectionQueue; }
const paused = { version: 1, enabled: false, selected: [] };
const scripts = [
  { id: 'clearspace-desktop-core', js: ['color-vision.js', 'low-vision.js', 'light-sensitivity.js', 'focus-mode.js', 'dyslexia.js', 'selection-reader.js', 'content.js'], world: 'ISOLATED', runAt: 'document_idle' },
  { id: 'clearspace-desktop-motion-main', js: ['motion-main.js'], world: 'MAIN', runAt: 'document_start' },
  ...['motion', 'click-targets', 'button-spacing', 'keyboard-focus'].map(name => ({ id: `clearspace-desktop-${name}`, js: ['motor-levels.js', `${name}.js`], world: 'ISOLATED', runAt: 'document_idle' })),
];
async function register() {
  if (!await chrome.permissions.contains({ origins })) throw new Error('Allow website access from the companion popup first.');
  const old = await chrome.scripting.getRegisteredContentScripts({ ids: scripts.map(s => s.id) });
  if (old.length) await chrome.scripting.unregisterContentScripts({ ids: old.map(s => s.id) });
  await chrome.scripting.registerContentScripts(scripts.map(s => ({ ...s, matches: origins, allFrames: true, matchOriginAsFallback: true })));
  const tabs = await chrome.tabs.query({ url: origins });
  await Promise.allSettled(tabs.flatMap(tab => scripts.map(s => chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: s.js, world: s.world }))));
}
function saveSnapshot(settings, status) {
  pending = pending.catch(() => {}).then(async () => {
    const serialized = JSON.stringify(settings);
    if (serialized !== lastSettings) {
      await chrome.storage.local.set({ settings }); lastSettings = serialized;
    }
    await chrome.storage.local.set({ desktopStatus: status });
  });
  return pending;
}
function disconnect(status = 'Disconnected. Website adjustments are paused.') {
  connectionGeneration++;
  clearInterval(poll); poll = null;
  const previous = port; port = null; previous?.disconnect();
  return saveSnapshot(paused, status);
}
async function connect() {
  await disconnect();
  await register();
  const generation = ++connectionGeneration;
  lastReply = Date.now();
  const current = chrome.runtime.connectNative(host); port = current;
  current.onMessage.addListener(message => {
    if (generation !== connectionGeneration || message?.type !== 'clearspace:desktop-settings') return;
    const s = message.settings;
    if (s && (s.version !== 1 || !Array.isArray(s.selected))) return;
    lastReply = Date.now();
    void saveSnapshot(s || paused, s ? (s.enabled ? 'Connected. Desktop preferences are active.' : 'Connected. Adjustments are paused.') : 'Waiting for Clearspace desktop. Open the app to resume.');
  });
  current.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message;
    if (generation !== connectionGeneration) return;
    void disconnect(reason ? `Connection unavailable: ${reason}` : 'Desktop connection closed. Reconnect from this popup.');
  });
  const request = () => {
    if (generation !== connectionGeneration) return;
    if (Date.now() - lastReply > 8000) void saveSnapshot(paused, 'Desktop is not responding. Website adjustments are paused.');
    try { current.postMessage({ type: 'get-settings' }); }
    catch { void disconnect('Desktop connection closed. Reconnect from this popup.'); }
  };
  request(); poll = setInterval(request, 2000);
  await chrome.storage.local.set({ desktopAutoConnect: true });
}
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === 'desktop:connect') { queueConnection(connect).then(() => reply({ ok: true }), e => reply({ error: e.message })); return true; }
  if (message?.type === 'desktop:disconnect') { queueConnection(async () => { await chrome.storage.local.set({ desktopAutoConnect: false }); await disconnect(); }).then(() => reply({ ok: true }), e => reply({ error: e.message })); return true; }
});
chrome.runtime.onInstalled.addListener(() => disconnect('Open Clearspace desktop and follow Connections to set up this companion.'));
async function restore() {
  const { desktopAutoConnect } = await chrome.storage.local.get('desktopAutoConnect');
  await saveSnapshot(paused, 'Connecting to Clearspace desktop…');
  if (desktopAutoConnect) await connect().catch(e => disconnect(e.message));
}
chrome.runtime.onStartup.addListener(() => queueConnection(restore));
// A restarted service worker must not leave a stale enabled setting behind.
void queueConnection(restore);
