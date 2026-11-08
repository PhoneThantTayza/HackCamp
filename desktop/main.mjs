import { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain, globalShortcut, clipboard, shell, protocol, net, session, powerMonitor, nativeTheme } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { normalizePreferences, effectivePreferences, overlayEffects, browserPreferences, localRect, validRect } from './preferences.mjs';
import { loadPreferences, atomicJSON } from './store.mjs';
import { NativeClient } from './native-client.mjs';
import { SystemEffects } from './system-effects.mjs';
import { installCompanion } from './companion.mjs';
import { Auth } from './auth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
app.setName('Clearspace');
// Stable paths are also used by Chrome's native-messaging host.
app.setPath('userData', path.join(app.getPath('appData'), 'Clearspace'));
protocol.registerSchemesAsPrivileged([{ scheme: 'clearspace', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', path.resolve('build/smoke-profile'));
const singleInstance = smoke || app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

const preferenceFile = path.join(app.getPath('userData'), 'preferences.json');
const bridgeFile = path.join(app.getPath('userData'), 'browser-settings.json');
const loaded = loadPreferences(preferenceFile);
let preferences = loaded.preferences;
let mainWindow, readerWindow, tray, native, quitting = false, locked = false;
let context = {}, contextAt = 0, lastExternalApp = null, reader = { text: '', source: '' };
let warning = loaded.error || '', nativeError = '', nativeColour = false;
let shortcutStatus = [], systemEffects;
const overlays = new Map();
let auth, account = { syncing: false, lastSynced: null, error: '' }, uploadTimer;
const executable = path.join(app.isPackaged ? process.resourcesPath : path.resolve('build'), 'native', process.platform === 'win32' ? 'clearspace-native.exe' : 'clearspace-native');
const companionPath = path.join(app.isPackaged ? process.resourcesPath : path.resolve('build'), 'companion');
const assets = path.resolve(here, '../dist');
const live = () => ({ ...effectivePreferences(preferences, context.app?.id), enabled: !locked && effectivePreferences(preferences, context.app?.id).enabled });

function getState() {
  return { preferences, platform: process.platform, app: context.app || null, lastExternalApp,
    accessibility: context.accessibility === true, nativeAvailable: !!native?.child,
    nativeColour, effects: systemEffects?.status, dark: nativeTheme.shouldUseDarkColors, warning, nativeError, shortcuts: shortcutStatus,
    excluded: preferences.desktop.excludedApps.includes(context.app?.id), reader,
    detection: preferences.desktop.detectApps, displays: screen.getAllDisplays().length,
    account: { signedIn: !!auth?.user, ...(auth?.user || {}), ...account } };
}
function broadcast() {
  for (const win of [mainWindow, readerWindow]) if (win && !win.isDestroyed()) win.webContents.send('desktop:state-changed', getState());
}
function snapshot() {
  try { atomicJSON(bridgeFile, { expiresAt: quitting ? 0 : Date.now() + 6000, settings: browserPreferences(live(), { nativeColour }) }); }
  catch { warning = 'Could not share preferences with the browser companion.'; }
}
function updateSystemEffects() {
  const settings = live();
  nativeTheme.themeSource = settings.enabled && settings.selected.includes('vision:Dark page theme') ? 'dark' : 'system';
  void systemEffects?.update(settings);
}

function save(next) {
  const normalized = normalizePreferences(next);
  atomicJSON(preferenceFile, normalized);
  preferences = normalized;
  if (!preferences.desktop.detectApps) { context = {}; lastExternalApp = null; contextAt = 0; }
  native?.send({ command: 'watch', enabled: preferences.desktop.detectApps });
  updateSystemEffects(); snapshot(); updateTray(); broadcast();
  if (auth?.user && !applyingRemote) { clearTimeout(uploadTimer); uploadTimer = setTimeout(() => upload().catch(() => {}), 1500); }
  return getState();
}

// ---------- Auth0 account + settings sync ----------
// Only the accessibility settings are synced. Desktop-only things (app list, detection) stay on this computer.
let applyingRemote = false;
const syncable = () => { const { desktop, ...rest } = preferences; return rest; };
async function runSync(task) {
  account = { ...account, syncing: true, error: '' }; broadcast();
  try { await task(); account = { ...account, lastSynced: Date.now() }; }
  catch (error) { account = { ...account, error: error.message }; }
  finally { account = { ...account, syncing: false }; broadcast(); }
  return getState();
}
async function upload() { return runSync(() => auth.api('PUT', { settings: syncable() })); }
async function download() {
  return runSync(async () => {
    const { settings } = await auth.api('GET');
    if (!settings) return auth.api('PUT', { settings: syncable() }); // first time: upload ours
    applyingRemote = true;
    try { save({ ...settings, desktop: preferences.desktop }); } finally { applyingRemote = false; }
  });
}
function secureWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
}
function createWindow(view = 'settings') {
  const win = new BrowserWindow({ width: view === 'reader' ? 940 : 1160, height: 840, minWidth: 640, minHeight: 540,
    show: false, title: view === 'reader' ? 'Clearspace · Reading view' : 'Clearspace', backgroundColor: '#f5f4ef',
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  secureWindow(win);
  win.loadURL(`clearspace://app/desktop.html?view=${view}`);
  win.once('ready-to-show', () => { if (!smoke) win.show(); });
  return win;
}
function showSettings() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
    mainWindow.on('close', event => { if (!quitting && tray) { event.preventDefault(); mainWindow.hide(); } });
  }
  if (!smoke) { mainWindow.show(); mainWindow.focus(); }
}
function showReader() {
  if (!readerWindow || readerWindow.isDestroyed()) readerWindow = createWindow('reader');
  if (!smoke) { readerWindow.show(); readerWindow.focus(); }
  readerWindow.webContents.send('desktop:reader-changed', reader);
}
async function captureSelection() {
  try {
    const result = await native.request('selection');
    reader = { text: String(result.text || '').slice(0, 32768), source: String(result.source || 'Selected text').slice(0, 200) };
    warning = ''; showReader(); broadcast();
  } catch (error) { warning = error.message; showSettings(); broadcast(); }
}
function updateTray() {
  if (!tray) return;
  tray.setToolTip(`Clearspace · ${preferences.enabled ? 'Active' : 'Paused'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Clearspace', click: showSettings },
    { label: preferences.enabled ? 'Pause adjustments' : 'Resume adjustments', click: () => save({ ...preferences, enabled: !preferences.enabled }) },
    { label: 'Reading view', click: showReader },
    { type: 'separator' }, { label: 'Quit Clearspace', click: () => app.quit() },
  ]));
}
function refreshOverlays() {
  const displays = screen.getAllDisplays();
  for (const [id, entry] of overlays) if (!displays.some(d => d.id === id)) { entry.win.destroy(); overlays.delete(id); }
  for (const display of displays) {
    const entry = overlays.get(display.id);
    if (entry) { entry.win.setBounds(display.bounds); continue; }
    const win = new BrowserWindow({ ...display.bounds, frame: false, transparent: true, show: false, focusable: false,
      resizable: false, movable: false, hasShadow: false, skipTaskbar: true, enableLargerThanScreen: true,
      webPreferences: { preload: path.join(here, 'overlay-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    win.setIgnoreMouseEvents(true); win.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    secureWindow(win);
    const record = { win, ready: false, active: false, frame: '' };
    overlays.set(display.id, record);
    win.loadFile(path.join(here, 'overlay.html'));
    win.webContents.once('did-finish-load', () => { record.ready = true; });
  }
  broadcast();
}
let lastPointer, guidePoint, focusSignature = '';
function renderOverlays() {
  const fx = overlayEffects(live());
  const pointer = screen.getCursorScreenPoint();
  const recent = Date.now() - contextAt < 2000 && preferences.desktop.detectApps;
  fx.windowKnown = recent && validRect(context.window);
  const focus = recent && validRect(context.focus) ? context.focus : null;
  const signature = JSON.stringify(focus);
  if (!lastPointer || pointer.x !== lastPointer.x || pointer.y !== lastPointer.y) guidePoint = pointer;
  else if (fx.followKeyboard && focus && signature !== focusSignature) guidePoint = { x: focus.x + focus.width / 2, y: focus.y + focus.height / 2 };
  lastPointer = pointer; focusSignature = signature;
  for (const display of screen.getAllDisplays()) {
    const entry = overlays.get(display.id); if (!entry?.ready) continue;
    const activeWindow = recent ? localRect(context.window, display.bounds) : null;
    entry.active = Boolean(fx.enabled && (fx.dim || fx.soften || fx.warm || fx.guide || fx.halo || (fx.focus && focus) || (fx.isolateWindow && fx.windowKnown)));
    if (!entry.active) { if (entry.win.isVisible()) entry.win.hide(); continue; }
    const inside = pointer.x >= display.bounds.x && pointer.x < display.bounds.x + display.bounds.width && pointer.y >= display.bounds.y && pointer.y < display.bounds.y + display.bounds.height;
    const frame = { effects: fx, activeWindow, focus: localRect(focus, display.bounds), guideY: (guidePoint || pointer).y - display.bounds.y,
      pointer: { x: pointer.x - display.bounds.x, y: pointer.y - display.bounds.y, inside } };
    const serialized = JSON.stringify(frame);
    if (serialized !== entry.frame) { entry.win.webContents.send('overlay:frame', frame); entry.frame = serialized; }
    // Smoke tests exercise the same rendering path but keep the desktop untouched.
    if (!smoke && !entry.win.isVisible()) entry.win.showInactive();
  }
}

const systemSections = {
  darwin: { screenCapture: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture', automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation', appearance: 'x-apple.systempreferences:com.apple.Appearance-Settings.extension', display: 'x-apple.systempreferences:com.apple.preference.universalaccess?Seeing_Display', motion: 'x-apple.systempreferences:com.apple.preference.universalaccess', zoom: 'x-apple.systempreferences:com.apple.preference.universalaccess?Seeing_Zoom', motor: 'x-apple.systempreferences:com.apple.preference.universalaccess', accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility' },
  win32: { appearance: 'ms-settings:colors', display: 'ms-settings:easeofaccess-colorfilter', motion: 'ms-settings:easeofaccess-visualeffects', zoom: 'ms-settings:easeofaccess-magnifier', motor: 'ms-settings:easeofaccess-mouse', accessibility: 'ms-settings:easeofaccess' },
};
function handle(name, action) {
  ipcMain.handle(name, (event, ...args) => {
    const allowed = [mainWindow, readerWindow].some(win => win && !win.isDestroyed() && event.sender === win.webContents);
    if (!allowed || event.senderFrame !== event.sender.mainFrame || !event.senderFrame.url.startsWith('clearspace://app/desktop.html')) throw new Error('Untrusted desktop request.');
    return action(...args);
  });
}

if (singleInstance) app.whenReady().then(async () => {
  protocol.handle('clearspace', async request => {
    const url = new URL(request.url);
    let file;
    try { file = path.resolve(assets, `.${decodeURIComponent(url.pathname)}`); } catch { return new Response('Bad path', { status: 400 }); }
    if (url.hostname !== 'app' || !file.startsWith(`${assets}${path.sep}`)) return new Response('Forbidden', { status: 403 });
    const response = await net.fetch(pathToFileURL(file).href);
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'none'");
    return new Response(response.body, { status: response.status, headers });
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  handle('desktop:state', getState);
  handle('desktop:save', value => save(value));
  handle('desktop:reset', () => save(normalizePreferences()));
  auth = new Auth(path.join(app.getPath('userData'), 'account.bin'));
  handle('desktop:login', async () => {
    try { await auth.login(); } catch (error) { account = { ...account, error: error.message }; broadcast(); return getState(); }
    return download();
  });
  handle('desktop:logout', () => { auth.logout(); account = { syncing: false, lastSynced: null, error: '' }; broadcast(); return getState(); });
  handle('desktop:sync', () => download());
  if (auth.user && !smoke) download();
  handle('desktop:reader', () => { showReader(); return reader; });
  handle('desktop:set-reader', text => {
    if (typeof text !== 'string' || text.length > 32768) throw new Error('Use a passage under 32,768 characters.');
    reader = { text, source: 'Pasted text' }; broadcast(); return reader;
  });
  handle('desktop:clipboard', () => {
    const text = clipboard.readText();
    if (!text.trim()) throw new Error('The clipboard has no text. Copy a passage first.');
    if (text.length > 32768) throw new Error('Copy a shorter passage (under 32,768 characters).');
    reader = { text, source: 'Clipboard' }; broadcast(); return reader;
  });
  handle('desktop:system-settings', section => {
    const url = systemSections[process.platform]?.[section];
    if (!url) throw new Error('This system setting is unavailable.'); return shell.openExternal(url);
  });
  handle('desktop:retry-effect', name => systemEffects.retry(name));
  handle('desktop:capture-permission', async () => {
    const result = await native.request('capture-permission');
    if (result.allowed) await systemEffects.retry('colour');
    return result;
  });
  handle('desktop:accessibility', () => native.request('permission'));
  handle('desktop:install-companion', value => installCompanion(value || {}, executable, app.getPath('userData')));
  handle('desktop:show-companion', () => { shell.showItemInFolder(path.join(companionPath, 'manifest.json')); });

  if (!smoke) {
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFUlEQVR42mNk+P+/HgMlgHFUw6gGoQYAlAIC/nEXSO0AAAAASUVORK5CYII=');
    // Draw a legible monochrome mark; macOS can adapt a template icon to its menu bar.
    const pixels = Buffer.alloc(20 * 20 * 4);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const radius = Math.hypot(x - 9.5, y - 9.5);
      if ((radius > 6 && radius < 9) || (Math.abs(x - 9.5) < 1.3 && Math.abs(y - 9.5) < 4)) {
        const i = (y * 20 + x) * 4; pixels[i] = 40; pixels[i + 1] = 100; pixels[i + 2] = 45; pixels[i + 3] = 255;
      }
    }
    const drawn = nativeImage.createFromBitmap(pixels, { width: 20, height: 20, scaleFactor: 1 });
    if (process.platform === 'darwin') drawn.setTemplateImage(true);
    tray = new Tray(drawn.isEmpty() ? icon : drawn); tray.on('click', showSettings); updateTray();
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'Clearspace', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
  ]));
  systemEffects = new SystemEffects(process.platform, (command, values) => {
    if (smoke) return Promise.resolve({ applied: false });
    return native?.request(command, values) || Promise.reject(new Error('Native desktop integration is unavailable. Restart Clearspace.'));
  }, effects => { nativeColour = effects.colour.applied; snapshot(); broadcast(); });
  nativeTheme.on('updated', broadcast);
  if (!smoke) native = new NativeClient(executable, event => {
    if (!preferences.desktop.detectApps) return;
    if (event.units === 'physical' && process.platform === 'win32') {
      for (const key of ['focus', 'window']) if (validRect(event[key])) event[key] = screen.screenToDipRect(null, event[key]);
    }
    const previous = JSON.stringify(context); context = event; contextAt = Date.now();
    if (event.app && event.app.pid !== process.pid) lastExternalApp = event.app;
    if (JSON.stringify(context) !== previous) { updateSystemEffects(); snapshot(); broadcast(); }
  }, error => { nativeError = error; context = {}; contextAt = 0; nativeColour = false; systemEffects.failed('colour', error); systemEffects.failed('appearance', error); systemEffects.failed('scale', error); snapshot(); broadcast(); }, event => { systemEffects.failed(event.effect, event.error); });
  native?.send({ command: 'watch', enabled: preferences.desktop.detectApps });
  if (!smoke) for (const [accelerator, label, action] of [
    ['CommandOrControl+Shift+Space', 'Pause / resume', () => save({ ...preferences, enabled: !preferences.enabled })],
    ['CommandOrControl+Shift+R', 'Read selected text', captureSelection],
    ['CommandOrControl+Shift+Escape', 'Turn adjustments off', () => save({ ...preferences, enabled: false })],
  ]) shortcutStatus.push({ accelerator, label, registered: globalShortcut.register(accelerator, action) });
  showSettings(); refreshOverlays(); updateSystemEffects(); snapshot();
  screen.on('display-added', refreshOverlays); screen.on('display-removed', refreshOverlays); screen.on('display-metrics-changed', refreshOverlays);
  const timer = setInterval(renderOverlays, 33), heartbeat = setInterval(snapshot, 2500);
  for (const event of ['lock-screen', 'suspend']) powerMonitor.on(event, () => { locked = true; updateSystemEffects(); snapshot(); });
  for (const event of ['unlock-screen', 'resume']) powerMonitor.on(event, () => { locked = false; contextAt = 0; updateSystemEffects(); snapshot(); });
  app.on('before-quit', () => {
    quitting = true; clearInterval(timer); clearInterval(heartbeat); globalShortcut.unregisterAll();
    snapshot(); native?.stop(); for (const { win } of overlays.values()) win.destroy();
  });
  if (smoke) {
    const { runSmoke } = await import('./smoke.mjs');
    try { await runSmoke({ mainWindow, showReader, getReader: () => readerWindow, getState, overlays }); console.log('DESKTOP_SMOKE_OK'); }
    catch (error) { console.error(error); process.exitCode = 1; }
    app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => {});
app.on('second-instance', showSettings);
app.on('activate', () => { if (app.isReady()) showSettings(); });
