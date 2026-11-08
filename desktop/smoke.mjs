import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

export async function runSmoke({ mainWindow, showReader, getReader, getState, overlays }) {
  const errors = [];
  mainWindow.webContents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message); });
  const evaluate = code => mainWindow.webContents.executeJavaScript(code);
  async function until(predicate, label, timeout = 12000) {
    const start = Date.now();
    while (!await predicate()) {
      if (Date.now() - start > timeout) throw new Error(`Smoke check timed out: ${label}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  await until(() => evaluate("!!document.querySelector('.desktop-app')"), 'desktop UI');
  mainWindow.showInactive();
  assert.equal(await evaluate("document.querySelector('h1').textContent"), 'The desktop, on your terms.');
  assert.equal(await evaluate("document.querySelectorAll('nav[aria-label] button').length"), 5);
  assert.equal(await evaluate("typeof window.require"), 'undefined');
  await evaluate('window.clearspaceDesktop.reset()');
  await until(() => evaluate("[...document.querySelectorAll('.toggle-row')].some(x => x.textContent.includes('Dim screen'))"), 'vision controls');
  await evaluate("[...document.querySelectorAll('.toggle-row')].find(x => x.querySelector('strong')?.textContent === 'Dark mode').querySelector('input').click()");
  await until(() => getState().preferences.selected.includes('vision:Dark page theme'), 'saved desktop Dark mode');
  await until(() => evaluate("document.documentElement.dataset.theme === 'dark'"), 'Clearspace dark appearance');
  await until(() => evaluate("[...document.querySelectorAll('[role=alert]')].some(x => x.textContent.includes('Retry Dark mode'))"), 'native refusal is visible instead of false success');
  for (const mode of ['protan', 'deutan', 'tritan']) {
    await evaluate(`(() => {
      const select = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'protan'));
      select.value = ${JSON.stringify(mode)}; select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await until(() => getState().preferences.colorVision.mode === mode, `saved ${mode} palette`);
    await until(() => evaluate("[...document.querySelectorAll('[role=alert]')].some(x => x.textContent.includes('Retry palette'))"), 'colour permission/native error is visible');
    assert.equal(getState().nativeColour, false, 'a failed native filter must retain the reader fallback');
    assert.notEqual(await evaluate("document.querySelector('#desktop-palette-sample feColorMatrix').getAttribute('values')"), '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
  }
  await evaluate('window.clearspaceDesktop.reset()');
  await until(() => getState().effects.colour.state === 'off' && getState().effects.appearance.state === 'off', 'reset native effects');
  // Exercise this option alone through the real UI -> persistence -> overlay path.
  // The overlays stay hidden in smoke mode, so these checks do not tint the desktop.
  assert.equal(overlays.size, getState().displays);
  await evaluate("[...document.querySelectorAll('.toggle-row')].find(x => x.textContent.includes('Soften bright backgrounds')).querySelector('input').click()");
  await until(() => getState().preferences.selected.includes('vision:Soften bright backgrounds'), 'saved background softening');
  await until(() => [...overlays.values()].every(entry => entry.ready && entry.active && JSON.parse(entry.frame || '{}').effects?.soften > 0), 'softening activates every desktop overlay');
  const overlayPixel = entry => entry.win.webContents.executeJavaScript("Array.from(document.querySelector('canvas').getContext('2d').getImageData(10,10,1,1).data)");
  const setSofteningStrength = async strength => {
    await evaluate(`(() => {
      const section = [...document.querySelectorAll('.adjustment')].find(x => x.querySelector('.toggle-row strong')?.textContent === 'Soften bright backgrounds');
      const slider = section.querySelector('input[type=range]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, ${JSON.stringify(String(strength))});
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await until(() => getState().preferences.lightSensitivity['Soften bright backgrounds'] === strength, 'softening slider');
  };
  await setSofteningStrength(100);
  for (const entry of overlays.values()) {
    await until(async () => Math.abs((await overlayPixel(entry))[3] - 64) <= 1, 'desktop softening rendered at 100%');
    const pixel = await overlayPixel(entry), alpha = pixel[3] / 255;
    const white = pixel.slice(0, 3).map(c => Math.round(c * alpha + 255 * (1 - alpha)));
    assert.ok(white.every((channel, i) => Math.abs(channel - [222, 218, 208][i]) <= 2), 'white is softened to the paper palette');
    assert.equal(entry.win.isVisible(), false, 'test overlays remain hidden');
  }
  await setSofteningStrength(200);
  for (const entry of overlays.values()) await until(async () => Math.abs((await overlayPixel(entry))[3] - 128) <= 1, 'desktop softening increases');
  await evaluate("document.querySelector('.pause-button').click()");
  await until(() => [...overlays.values()].every(entry => !entry.active), 'pause hides softening');
  await evaluate("document.querySelector('.pause-button').click()");
  await until(() => [...overlays.values()].every(entry => entry.active), 'resume restores softening');
  await setSofteningStrength(0);
  await until(() => [...overlays.values()].every(entry => !entry.active), 'zero strength removes softening');
  await setSofteningStrength(100);
  await until(() => [...overlays.values()].every(entry => entry.active), 'softening restored');
  await evaluate("[...document.querySelectorAll('.toggle-row')].find(x => x.textContent.includes('Soften bright backgrounds')).querySelector('input').click()");
  await until(() => [...overlays.values()].every(entry => !entry.active), 'unchecking removes softening');
  await evaluate('window.clearspaceDesktop.reset()');
  await evaluate("[...document.querySelectorAll('.toggle-row')].find(x => x.textContent.includes('Dim screen')).querySelector('input').click()");
  await until(() => getState().preferences.selected.includes('vision:Dim page'), 'saved dimming');
  await evaluate("document.querySelector('.pause-button').click()");
  await until(() => getState().preferences.enabled === false, 'pause');
  await until(() => evaluate("document.querySelector('.pause-button').textContent.includes('Resume')"), 'paused interface');
  const saved = JSON.parse(readFileSync('build/smoke-profile/preferences.json', 'utf8'));
  assert.equal(saved.enabled, false);
  assert.ok(saved.selected.includes('vision:Dim page'));
  // Navigate every category through its actual React event handler.
  for (const category of ['Dyslexia', 'Motor / mobility', 'Cognitive', 'Connections', 'Vision']) {
    await evaluate(`[...document.querySelectorAll('nav button')].find(x => x.textContent.endsWith(${JSON.stringify(category)})).click()`);
    await until(() => evaluate(`document.querySelector('.category-heading h2').textContent === ${JSON.stringify(category)}`), category);
  }
  mkdirSync('build', { recursive: true });
  await until(() => evaluate("!!document.querySelector('iframe')?.contentDocument?.querySelector('#passage p')"), 'live preview');
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  writeFileSync('build/desktop-smoke.png', (await mainWindow.webContents.capturePage()).toPNG());
  await evaluate(`window.clearspaceDesktop.save({ enabled: true, dyslexia: { experiences: { distinguishWords: true, overwhelmingParagraphs: true } } })`);
  await evaluate(`window.clearspaceDesktop.setReader(${JSON.stringify('A real reading passage.\n\n<img src=x onerror=alert(1)> stays plain text.\n\nWords should have more room between them.')})`);
  showReader();
  const readerWindow = getReader();
  const read = code => readerWindow.webContents.executeJavaScript(code);
  readerWindow.webContents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message); });
  await until(() => read("!!document.querySelector('.reading-frame')?.contentDocument?.querySelector('#passage p')"), 'reader text');
  assert.equal(await read("document.querySelector('iframe').contentDocument.querySelectorAll('img').length"), 0);
  assert.ok(await read("document.querySelector('iframe').contentDocument.querySelector('#passage').textContent.includes('<img src=x')"));
  await until(async () => Number.parseFloat(await read("document.querySelector('iframe').contentWindow.getComputedStyle(document.querySelector('iframe').contentDocument.querySelector('#passage p')).letterSpacing")) > 0, 'dyslexia typography');
  assert.equal(await read("typeof document.querySelector('iframe').contentWindow.clearspaceDesktop"), 'undefined');
  // Reset must remove the reading engine's owned styles as well as the saved choices.
  await evaluate('window.clearspaceDesktop.reset()');
  await until(async () => Number.parseFloat(await read("document.querySelector('iframe').contentWindow.getComputedStyle(document.querySelector('iframe').contentDocument.querySelector('#passage p')).letterSpacing")) === 0 || await read("document.querySelector('iframe').contentWindow.getComputedStyle(document.querySelector('iframe').contentDocument.querySelector('#passage p')).letterSpacing") === 'normal', 'reset typography');
  assert.equal(getState().preferences.selected.length, 0);
  for (const entry of overlays.values()) {
    await until(() => entry.ready, 'overlay loaded');
    assert.equal(entry.win.isFocusable(), false, 'overlays must not steal keyboard focus');
    assert.equal(entry.win.isAlwaysOnTop(), true);
    const paint = async frame => {
      entry.win.webContents.send('overlay:frame', frame);
      // Execute on the next renderer event loop after its IPC callback paints.
      await entry.win.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 30))');
    };
    const frame = { effects: { enabled: true, dim: .5, focus: false }, pointer: { inside: false } };
    await paint(frame);
    const alpha = () => entry.win.webContents.executeJavaScript("document.querySelector('canvas').getContext('2d').getImageData(10,10,1,1).data[3]");
    assert.ok((await alpha()) >= 126 && (await alpha()) <= 129, 'dimming paints a translucent shade');
    await paint({ ...frame, effects: { enabled: true, isolateWindow: true, windowKnown: true }, activeWindow: null });
    assert.ok((await alpha()) > 130, 'inactive displays are shaded by window isolation');
    await paint({ ...frame, effects: { enabled: true, soften: .25, isolateWindow: true, windowKnown: true }, activeWindow: { x: 0, y: 0, width: 30, height: 30 } });
    assert.ok(Math.abs((await alpha()) - 64) <= 1, 'window isolation preserves softening inside the active window');
    const outsideAlpha = await entry.win.webContents.executeJavaScript("(() => { const canvas = document.querySelector('canvas'); return canvas.getContext('2d').getImageData(canvas.width - 1, canvas.height - 1, 1, 1).data[3]; })()");
    assert.ok(outsideAlpha > 160, 'softening and distraction dimming combine outside the active window');
    await paint({ ...frame, effects: { enabled: false } });
    assert.equal(await alpha(), 0, 'pausing completely clears the overlay');
  }
  assert.deepEqual(errors, [], 'renderer errors');
}
