// Real browser checks; playwright-core may live in a temporary directory (no app dependency).
// PowerShell: node tests/compatibility.browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
const playwrightPath = process.env.A11YFIX_PLAYWRIGHT ?? join(tmpdir(), 'a11yfix-browser-tests/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath));
const enginePath = resolve('client/public/dyslexia.js'), contentPath = resolve('client/public/content.js');
const engineSource = await readFile(enginePath, 'utf8');
const selectionReaderSource = await readFile(resolve('client/public/selection-reader.js'), 'utf8');
const fixture = kind => `<!doctype html><html lang="en"><meta charset="utf-8"><title>${kind} reading fixture</title>
<style>body{font:16px Georgia; margin:30px; background:white;color:#222}p{line-height:1.3}#reader .nested{font-family:Georgia !important;letter-spacing:0 !important}
.grid{display:grid;grid-template-columns:1fr 1fr}.row{display:flex;gap:8px}.icon{font-family:'Material Icons';}button:focus-visible{outline:3px solid blue}</style>
<main id="reader"><h1>Reading fixture</h1><p id="plain">Reading words should become easier to distinguish. Keep the original page behavior.</p>
<div id="generic"><span class="nested" id="nested" style="font-family:Georgia !important;letter-spacing:0px !important">Nested framework text with strong styling.</span></div>
<p id="paragraph">A longer reading paragraph with <strong>emphasis</strong> and a <a id="link" href="#notes">working link</a>.</p>
<div class="grid"><p id="grid-text">Grid item should keep its column layout.</p><span>Second grid column</span></div>
<p dir="rtl" id="rtl">هذا نص لاختبار اتجاه القراءة من اليمين إلى اليسار.</p>
<span class="icon" id="icon">home</span><pre><code id="code">const original = true;</code></pre><p id="mixed">Inline code: <code id="inline-code">keepSpacing()</code></p>
<div contenteditable="true" id="editor"><p id="editable">Editable content stays intact.</p></div>
<label>Notes <input id="notes" value="Original input"></label><button id="counter">Clicked 0</button><button id="navigate">Navigate dynamically</button>
<textarea id="text-notes" aria-label="Long notes"></textarea><input id="password" type="password" aria-label="Password"><input id="payment" autocomplete="cc-number" aria-label="Payment number">
<section id="dynamic"></section><test-reader id="shadow-host"></test-reader><test-late id="late-host"></test-late>
</main><script>
let clicks=0;document.querySelector('#counter').onclick=()=>document.querySelector('#counter').textContent='Clicked '+(++clicks);
document.querySelector('#navigate').onclick=()=>{history.pushState({},'', '?route=next');const p=document.createElement('p');p.id='spa-added';p.textContent='A dynamically navigated reading passage';document.querySelector('#dynamic').replaceChildren(p)};
document.querySelector('#shadow-host').attachShadow({mode:'open'}).innerHTML='<style>p span{font-family:Georgia!important}</style><p><span id="shadow-text">Text inside a web component.</span></p>';
</script></html>`;
let crossPort;
const serve = async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/assets/') || pathname === '/options') {
    const file = pathname === '/options' ? 'index.html' : pathname.slice(1);
    try { const body = await readFile(resolve('dist', file)); res.setHeader('Content-Type', extname(file) === '.js' ? 'text/javascript' : extname(file) === '.css' ? 'text/css' : 'text/html'); res.end(body); }
    catch { res.statusCode = 404; res.end(); }
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (pathname === '/frames') res.end(`${fixture('Frames')}<iframe id="same" src="/embedded"></iframe><iframe id="cross" src="http://127.0.0.1:${crossPort}/embedded"></iframe>`);
  else res.end(fixture(pathname));
};
const server = createServer((req, res) => { void serve(req, res); });
const cross = createServer((req, res) => { void serve(req, res); });
await new Promise(done => cross.listen(0, '127.0.0.1', done)); crossPort = cross.address().port;
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.A11YFIX_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };
const load = async path => { await page.goto(base + path); await page.addScriptTag({ path: enginePath }); };
const apply = async preferences => page.evaluate(value => { window.testReadingController ??= clearspaceDyslexia.createController(document); return testReadingController.apply(value); }, preferences);
const styles = selector => page.locator(selector).evaluate(element => {
  const s = getComputedStyle(element); return { font: s.fontFamily, spacing: s.letterSpacing, lineHeight: s.lineHeight, maxWidth: s.maxInlineSize, margin: s.marginBlockEnd, color: s.color, background: s.backgroundColor, align: s.textAlign };
});
const settled = () => page.waitForFunction(() => [...document.querySelector('#plain').attributes].some(a => a.name.startsWith('data-cs-reading-')));
try {
  await check('static text includes code and buttons; editors/icons stay intact', async () => {
    await load('/simple');
    const before = await styles('#nested'); const code = await styles('#code'); const edit = await styles('#editable'); const icon = await styles('#icon'); const inlineCode = await styles('#inline-code');
    await apply({ experiences: { distinguishWords: true } }); await settled();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#nested')).letterSpacing !== '0px');
    assert.match((await styles('#nested')).font, /Arial/);
    assert.match((await styles('#code')).font, /Arial/); assert.deepEqual(await styles('#editable'), edit); assert.deepEqual(await styles('#icon'), icon);
    assert.match((await styles('#inline-code')).font, /Arial/);
    assert.match((await styles('#counter')).font, /Arial/);
    await page.locator('#counter').hover();
    await page.waitForFunction(() => [...CSS.highlights.keys()].some(name => name.endsWith('-word')));
    assert.equal(await page.evaluate(() => document.getSelection().toString()), '');
    await page.locator('#notes').fill('Preserved typed input'); await page.locator('#counter').click();
    assert.equal(await page.locator('#counter').textContent(), 'Clicked 1');
    await page.evaluate(() => testReadingController.reset()); assert.deepEqual(await styles('#nested'), before);
    assert.equal(await page.locator('#notes').inputValue(), 'Preserved typed input');
    assert.deepEqual(await styles('#code'), code); assert.deepEqual(await styles('#inline-code'), inlineCode);
    assert.equal(await page.locator('#nested').getAttribute('style'), 'font-family: Georgia !important; letter-spacing: 0px !important;');
  });
  await check('dynamic SPA navigation, new content, new and late open shadow roots', async () => {
    await load('/spa'); await apply({ experiences: { distinguishWords: true } }); await settled();
    await page.locator('#navigate').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#spa-added')).fontFamily.includes('Arial'));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#shadow-host').shadowRoot.querySelector('span')).fontFamily.includes('Arial'));
    await page.evaluate(() => document.querySelector('#late-host').attachShadow({mode:'open'}).innerHTML='<p id="late-text">Late connected shadow content</p>');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#late-host').shadowRoot.querySelector('p')).fontFamily.includes('Arial'));
    await page.evaluate(() => { const host=document.createElement('div');host.id='added-shadow';host.attachShadow({mode:'open'}).innerHTML='<p>New shadow content</p>';document.body.append(host); });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#added-shadow').shadowRoot.querySelector('p')).fontFamily.includes('Arial'));
    await page.evaluate(() => { const text=document.querySelector('#shadow-host').shadowRoot.querySelector('span');text.id='moved-text';document.querySelector('#dynamic').append(text);document.querySelector('#shadow-host').remove(); });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#moved-text')).fontFamily.includes('Arial'));
    await page.evaluate(() => document.querySelector('#generic').contentEditable='true');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#nested')).fontFamily.includes('Georgia'));
    await page.evaluate(() => document.querySelector('#generic').contentEditable='false');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#nested')).fontFamily.includes('Arial'));
    await page.evaluate(() => testReadingController.reset());
    assert.match((await styles('#moved-text')).font, /Georgia/);
  });
  await check('complex CSS, distinct paragraph treatment, RTL, grid width and live website edits survive rollback', async () => {
    await load('/complex');
    const grid = await styles('#grid-text');
    await apply({ experiences: { overwhelmingParagraphs: true, distinguishWords: true } }); await settled();
    assert.notEqual((await styles('#plain')).maxWidth, 'none'); assert.notEqual((await styles('#plain')).margin, '0px');
    assert.equal((await styles('#grid-text')).maxWidth, grid.maxWidth); assert.equal((await styles('#rtl')).align, 'start');
    await page.evaluate(() => document.querySelector('#nested').style.setProperty('font-family','Verdana','important'));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#nested')).fontFamily.includes('Arial'));
    await page.evaluate(() => testReadingController.reset()); assert.match((await styles('#nested')).font, /Verdana/);
  });
  await check('word and passage highlighting preserve text nodes; guide is visible and click-through', async () => {
    await load('/highlight');
    await page.evaluate(() => { window.originalText = document.querySelector('#plain').firstChild; window.originalHTML = document.querySelector('#plain').innerHTML; });
    await apply({ experiences: { distinguishWords: true, readingFatigue: true, losePlace: true } }); await settled();
    const bounds = await page.locator('#plain').boundingBox(); await page.mouse.move(bounds.x + 24, bounds.y + 8);
    await page.waitForFunction(() => [...CSS.highlights.keys()].some(name => name.endsWith('-word')));
    assert.equal(await page.evaluate(() => [...CSS.highlights.keys()].filter(name => name.startsWith('cs-reading-')).length), 2);
    assert.equal(await page.evaluate(() => document.querySelector('#plain').firstChild === originalText && document.querySelector('#plain').innerHTML === originalHTML), true);
    const overlay = await page.locator('html > div[aria-hidden=true]').evaluate(element => ({ display:getComputedStyle(element).display, pointer:getComputedStyle(element).pointerEvents }));
    assert.notEqual(overlay.display, 'none'); assert.equal(overlay.pointer, 'none');
    await page.locator('#counter').click(); assert.equal(await page.locator('#counter').textContent(), 'Clicked 1');
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => [...CSS.highlights.keys()].filter(name=>name.startsWith('cs-reading-')).length), 0);
    await page.evaluate(() => testReadingController.reset()); assert.equal(await page.locator('html > div[aria-hidden=true]').count(), 0);
  });
  await check('passage backgrounds adapt to mixed text colours without overriding them or blinking in padding', async () => {
    await load('/passage-colours');
    await page.evaluate(() => {
      const p = document.querySelector('#plain');
      p.style.cssText = 'color:#222;padding:20px;line-height:2';
      const span = document.createElement('span'); span.id = 'light-text';
      span.style.color = '#eee'; span.textContent = ' Light text from another adjustment.'; p.append(span);
      window.passageOriginal = p.innerHTML;
    });
    await apply({ experiences: { readingFatigue: true } });
    const bounds = await page.locator('#plain').boundingBox();
    await page.mouse.move(bounds.x + 4, bounds.y + 4);
    await page.waitForFunction(() => [...CSS.highlights.keys()].filter(name => name.includes('-passage')).length === 2);
    const appearance = () => page.evaluate(() => {
      const names = [...CSS.highlights.keys()].filter(name => name.includes('-passage-'));
      const nameFor = id => names.find(name => [...CSS.highlights.get(name)].some(range => range.startContainer.parentElement.id === id));
      const name = nameFor('plain');
      const dark = nameFor('light-text');
      return {
        text: getComputedStyle(document.querySelector('#plain')).color,
        light: getComputedStyle(document.querySelector('#light-text')).color,
        background: getComputedStyle(document.querySelector('#plain'), `::highlight(${name})`).backgroundColor,
        darkBackground: getComputedStyle(document.querySelector('#light-text'), `::highlight(${dark})`).backgroundColor,
        preserved: document.querySelector('#plain').innerHTML === passageOriginal,
      };
    });
    const actual = await appearance();
    assert.equal(actual.text, 'rgb(34, 34, 34)');
    assert.equal(actual.light, 'rgb(238, 238, 238)');
    assert.equal(actual.preserved, true);
    assert.notEqual(actual.background, actual.darkBackground);
    assert.notEqual(actual.background, 'rgba(0, 0, 0, 0)');
    assert.notEqual(actual.darkBackground, 'rgba(0, 0, 0, 0)');
    await page.evaluate(() => document.querySelector('#light-text').style.color = '#222');
    await page.waitForFunction(() => [...CSS.highlights.keys()].filter(name => name.includes('-passage')).length === 1);
    await page.evaluate(() => testReadingController.reset());
    assert.equal(await page.evaluate(() => [...CSS.highlights.keys()].filter(name => name.includes('-passage')).length), 0);
    assert.equal((await styles('#light-text')).color, 'rgb(34, 34, 34)');
  });
  await check('guide tracks controls and right-click toggles repeatedly without blocking typing', async () => {
    await load('/guide-controls');
    // Capture our closed overlay root for assertions without changing production encapsulation.
    await page.evaluate(() => {
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) {
        const shadow = attach.call(this, options);
        if (options.mode === 'closed') window.guideTestRoot = shadow;
        return shadow;
      };
    });
    await page.evaluate(() => {
      window.websiteContextMenu = event => { event.preventDefault(); event.stopImmediatePropagation(); };
      document.addEventListener('contextmenu', websiteContextMenu, { capture: true });
    });
    await apply({ experiences: { losePlace: true } });
    const guide = () => page.evaluate(() => {
      const host = document.querySelector('html > div[aria-hidden=true]');
      const line = host && window.guideTestRoot?.querySelector('.line');
      return { visible: Boolean(line && !line.hidden && !line.parentElement.hidden), top: line?.style.top };
    });
    for (const selector of ['#counter', '#notes']) {
      const rect = await page.locator(selector).boundingBox();
      await page.mouse.move(rect.x + 8, rect.y + rect.height / 2);
      await page.waitForFunction(() => {
        const line = window.guideTestRoot?.querySelector('.line');
        return line && !line.hidden && !line.parentElement.hidden;
      });
      assert.ok(Math.abs(parseFloat((await guide()).top) - Math.max(0, rect.y + rect.height / 2 - 20)) < 1);
    }
    await page.locator('#notes').fill('Typing still works');
    await page.locator('#counter').click();
    assert.equal(await page.locator('#counter').textContent(), 'Clicked 1');
    await page.locator('#notes').click({ button: 'right' });
    await page.locator('#plain').hover();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await guide()).visible, false);
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.locator('#notes').click({ button: 'right' });
      await page.evaluate(() => {
        const range = document.createRange(); range.selectNodeContents(document.querySelector('#plain'));
        getSelection().removeAllRanges(); getSelection().addRange(range);
      });
      for (const selector of ['#counter', '#notes']) {
        await page.locator(selector).hover();
        await page.waitForFunction(() => {
          const line = window.guideTestRoot?.querySelector('.line');
          return line && !line.hidden && !line.parentElement.hidden;
        });
        assert.equal((await guide()).visible, true);
      }
      await page.locator('#notes').click({ button: 'right' });
      await page.locator('#plain').hover();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal((await guide()).visible, false);
    }
    await page.evaluate(() => getSelection().removeAllRanges());
    await apply({ experiences: { losePlace: true } });
    await page.locator('#counter').hover();
    await page.waitForFunction(() => {
      const line = window.guideTestRoot?.querySelector('.line');
      return line && !line.parentElement.hidden;
    });
    await page.evaluate(() => testReadingController.reset());
    assert.equal(await page.locator('html > div[aria-hidden=true]').count(), 0);
    assert.equal(await page.locator('#notes').inputValue(), 'Typing still works');
    await page.evaluate(() => document.removeEventListener('contextmenu', websiteContextMenu, { capture: true }));
    assert.equal(await page.locator('#notes').evaluate(element => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      element.dispatchEvent(event); return event.defaultPrevented;
    }), false);
  });
  await check('already-open page upgrades the old off-only guide and replaces its listeners', async () => {
    await page.goto(base + '/upgrade');
    await page.evaluate(() => {
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) {
        const shadow = attach.call(this, options);
        if (options.mode === 'closed') window.guideTestRoot = shadow;
        return shadow;
      };
      window.saved = { version: 1, enabled: true, selected: [], dyslexia: { experiences: { losePlace: true } } };
      window.storageListeners = [];
      window.chrome = { storage: { local: { get: async () => ({ settings: saved }) }, onChanged: {
        addListener: fn => storageListeners.push(fn),
        removeListener: fn => { storageListeners = storageListeners.filter(item => item !== fn); }
      } } };
    });
    // Reproduce the shipped version-2/off-only engine and its version-4 owner.
    const legacy = engineSource.replace(/version === \d+/, 'version === 2')
      .replace(/version: \d+, suggest/, 'version: 2, suggest')
      .replace('guideDismissed = !guideDismissed;', 'guideDismissed = true;');
    const owner = await readFile(contentPath, 'utf8');
    const ownerVersion = Number(owner.match(/clearspaceApply.version = (\d+)/)[1]);
    await page.evaluate(legacy);
    await page.evaluate(owner.replace(/version === \d+/, 'version === 4').replace(/clearspaceApply.version = \d+/, 'clearspaceApply.version = 4'));
    await page.locator('#notes').click({ button: 'right' });
    await page.locator('#notes').click({ button: 'right' });
    await page.locator('#counter').hover();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => Boolean(window.guideTestRoot && !guideTestRoot.querySelector('.line').parentElement.hidden)), false);
    await page.evaluate(engineSource);
    await page.evaluate(owner);
    assert.equal(await page.evaluate(() => clearspaceDyslexia.version), 5);
    assert.equal(await page.evaluate(() => clearspaceApply.version), ownerVersion);
    assert.equal(await page.evaluate(() => storageListeners.length), 1);
    const visible = () => page.evaluate(() => {
      const line = window.guideTestRoot?.querySelector('.line');
      return Boolean(line && !line.hidden && !line.parentElement.hidden);
    });
    for (let cycle = 0; cycle < 5; cycle++) {
      await page.locator('#notes').click({ button: 'right' });
      assert.equal(await visible(), false);
      await page.locator('#notes').click({ button: 'right' });
      assert.equal(await visible(), true); // Reopens immediately, without moving the mouse.
      await page.locator('#counter').hover();
      await page.waitForFunction(() => !guideTestRoot.querySelector('.line').parentElement.hidden);
    }
    assert.equal(await page.locator('html > div[aria-hidden=true]').count(), 1);
    await page.evaluate(() => storageListeners[0]({ settings: { newValue: { ...saved, enabled: false } } }, 'local'));
    assert.equal(await page.locator('html > div[aria-hidden=true]').count(), 0);
  });
  await check('style-element fallback and highlight fallback work without replacing content', async () => {
    await load('/fallback');
    const originalStyles = await page.locator('style').count();
    await page.evaluate(() => { Object.defineProperty(window,'CSSStyleSheet',{value:undefined, configurable:true}); Object.defineProperty(window,'Highlight',{value:undefined, configurable:true}); });
    await apply({ experiences: { distinguishWords: true } }); await settled();
    assert.match((await styles('#plain')).font, /Arial/);
    const bounds = await page.locator('#plain').boundingBox(); await page.mouse.move(bounds.x + 24,bounds.y + 8);
    await page.waitForFunction(() => Boolean(document.querySelector('html > div[aria-hidden=true]')));
    await page.evaluate(() => testReadingController.reset()); assert.equal(await page.locator('html > div[aria-hidden=true]').count(), 0);
    assert.equal(await page.locator('style').count(), originalStyles);
  });
  await check('same-origin and cross-origin frame documents work when independently injected', async () => {
    await load('/frames');
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      await frame.addScriptTag({ path: enginePath });
      await frame.evaluate(() => { window.testReadingController = clearspaceDyslexia.createController(document); testReadingController.apply({experiences:{distinguishWords:true}}); });
      await frame.waitForFunction(() => getComputedStyle(document.querySelector('#plain')).fontFamily.includes('Arial'));
      await frame.locator('#notes').fill('Frame input survives');
      await frame.evaluate(() => testReadingController.reset()); assert.equal(await frame.locator('#notes').inputValue(),'Frame input survives');
    }
  });
  await check('content-script storage updates, contrast precedence, reinjection and disable cleanup', async () => {
    await load('/storage');
    await page.evaluate(() => { window.saved = {version:1,enabled:true,selected:['vision:High contrast'],dyslexia:{experiences:{visualStress:true,distinguishWords:true,losePlace:true}}}; window.storageListeners=[];
      window.chrome = {storage:{local:{get:async()=>({settings:saved})},onChanged:{addListener:fn=>storageListeners.push(fn)}}}; });
    await page.addScriptTag({ path: contentPath }); await settled(); assert.equal((await styles('#plain')).background, 'rgb(255, 255, 255)');
    await page.addScriptTag({ path: enginePath }); await page.addScriptTag({ path: contentPath });
    assert.equal(await page.evaluate(() => storageListeners.length), 1);
    await page.evaluate(() => storageListeners[0]({settings:{newValue:{...saved,enabled:false}}},'local'));
    assert.equal(await page.locator('html > div[aria-hidden=true]').count(),0);
    assert.equal(await page.evaluate(() => document.adoptedStyleSheets.length),0);
    await page.evaluate(() => storageListeners[0]({settings:{newValue:{...saved,selected:[],dyslexia:{experiences:{distinguishWords:true}}}}},'local')); await settled();
    assert.match((await styles('#plain')).font,/Arial/);
  });
  await check('React configuration saves, reopens, clears overrides, and resets dyslexia', async () => {
    await page.goto(base+'/options');
    await page.getByRole('button', {name:/Dyslexia Reading at your rhythm/}).click();
    await page.getByLabel('Letters or words are difficult to distinguish', {exact:true}).check();
    await page.getByText('Customize suggested changes',{exact:true}).click();
    await page.getByLabel('Highlight the word under your pointer',{exact:true}).selectOption('false');
    await page.getByRole('button',{name:'Save and apply',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Demo settings saved'}).waitFor();
    await page.reload(); await page.getByRole('button', {name:/Dyslexia Reading at your rhythm/}).click();
    assert.equal(await page.getByLabel('Letters or words are difficult to distinguish',{exact:true}).isChecked(),true);
    await page.getByText('Customize suggested changes',{exact:true}).click();
    assert.equal(await page.getByLabel('Highlight the word under your pointer',{exact:true}).inputValue(),'false');
    await page.getByRole('button',{name:'Use suggested settings',exact:true}).click();
    assert.equal(await page.getByLabel('Highlight the word under your pointer',{exact:true}).inputValue(),'');
    await page.getByRole('button',{name:'Reset choices',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Demo settings saved'}).waitFor();
    assert.equal(await page.getByLabel('Letters or words are difficult to distinguish',{exact:true}).isChecked(),false);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  });
  await check('large dynamic insertion stays batched and disabling stops processing new nodes', async () => {
    await load('/large'); await apply({experiences:{distinguishWords:true}}); await settled();
    await page.evaluate(() => { const fragment=document.createDocumentFragment(); for(let i=0;i<2000;i++){const p=document.createElement('p');p.className='bulk';p.textContent='Dynamic reading paragraph '+i;fragment.append(p);} document.querySelector('#dynamic').append(fragment); });
    await page.waitForFunction(() => [...document.querySelectorAll('.bulk')].every(p=>[...p.attributes].some(a=>a.name.startsWith('data-cs-reading-'))));
    const count=await page.evaluate(()=>document.querySelectorAll('[style]').length);
    await page.waitForTimeout(100); assert.equal(await page.evaluate(()=>document.querySelectorAll('[style]').length),count);
    await page.evaluate(()=>{testReadingController.reset(); const p=document.createElement('p');p.id='after-disable';p.textContent='Disabled tools should leave this unchanged';document.querySelector('#dynamic').append(p);});
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('*')].some(p=>[...p.attributes].some(a=>a.name.startsWith('data-cs-reading-')))),false);
    assert.match((await styles('#after-disable')).font,/Georgia/);
  });
  await check('real user selection triggers speech; programmatic selection and passwords do not; Escape and disable clean up', async () => {
    await load('/selection-speech');
    await page.evaluate(()=>{window.speechMessages=[];window.speechListeners=[];window.speechApi={runtime:{sendMessage:async message=>{speechMessages.push(message);return {ok:true};},onMessage:{addListener:fn=>speechListeners.push(fn),removeListener:fn=>{speechListeners=speechListeners.filter(item=>item!==fn);}}}};});
    await page.addScriptTag({path:resolve('client/public/selection-reader.js')});
    await page.evaluate(()=>{window.selectionController=clearspaceSelectionReader.createController(document,speechApi);selectionController.update({version:1,enabled:true,dyslexia:{experiences:{preferListening:true}}});});
    await page.locator('#plain').click({clickCount:3});
    await page.waitForFunction(()=>speechMessages.some(message=>message.type==='clearspace:selection-read'));
    assert.match(await page.evaluate(()=>speechMessages.find(message=>message.type==='clearspace:selection-read').text),/Reading words/);
    assert.equal(await page.evaluate(()=>speechMessages.find(message=>message.type==='clearspace:selection-read').languageHint),'en');
    assert.equal(await page.evaluate(()=>{document.querySelector('#plain').lang='fr';return clearspaceSelectionReader.selectionLanguage(document,[]);}), 'fr');
    const reads=()=>page.evaluate(()=>speechMessages.filter(message=>message.type==='clearspace:selection-read').length);
    const initial=await reads();
    await page.locator('#password').fill('Private password');await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press('Shift');await page.waitForTimeout(350);assert.equal(await reads(),initial);
    await page.locator('#password').blur();
    await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#paragraph'));getSelection().removeAllRanges();getSelection().addRange(range);});
    await page.waitForTimeout(350);assert.equal(await reads(),initial);
    await page.locator('#paragraph').click({clickCount:3});await page.waitForFunction(count=>speechMessages.filter(message=>message.type==='clearspace:selection-read').length>count,initial);
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>speechMessages.at(-1).type),'clearspace:selection-stop');
    await page.evaluate(()=>selectionController.disable());const stopped=await reads();await page.locator('#plain').click({clickCount:3});await page.waitForTimeout(350);assert.equal(await reads(),stopped);
    assert.equal(await page.evaluate(()=>speechListeners.length),0);
  });
  await check('input/textarea selections and dynamic video-title links read only selected text without changing values', async () => {
    await load('/input-selection');
    await page.evaluate(()=>{window.speechMessages=[];window.speechListeners=[];window.speechApi={runtime:{sendMessage:async message=>{speechMessages.push(message);return {ok:true};},onMessage:{addListener:fn=>speechListeners.push(fn),removeListener:fn=>{speechListeners=speechListeners.filter(item=>item!==fn);}}}};});
    await page.addScriptTag({path:resolve('client/public/selection-reader.js')});
    await page.evaluate(()=>{window.selectionController=clearspaceSelectionReader.createController(document,speechApi);selectionController.update({version:1,enabled:true,dyslexia:{experiences:{preferListening:true}}});});
    const count=()=>page.evaluate(()=>speechMessages.filter(m=>m.type==='clearspace:selection-read').length);
    await page.locator('#notes').fill('Mouse selected words only');
    const mouseBounds=await page.locator('#notes').boundingBox();
    await page.mouse.move(mouseBounds.x+3,mouseBounds.y+mouseBounds.height/2);await page.mouse.down();
    await page.mouse.move(mouseBounds.x+mouseBounds.width+40,mouseBounds.y+mouseBounds.height/2,{steps:12});await page.mouse.up();
    await page.waitForTimeout(400);
    const mouseSelection=await page.locator('#notes').evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd));
    assert.ok(mouseSelection,'Mouse drag should select input text');
    assert.equal(await page.evaluate(()=>speechMessages.filter(m=>m.type==='clearspace:selection-read').at(-1)?.text),mouseSelection,'Dragging out of an input must still read its selection');
    await page.locator('#notes').evaluate(el=>{el.addEventListener('pointerup',event=>event.stopPropagation());el.addEventListener('keyup',event=>event.stopPropagation());});
    await page.locator('#notes').fill('Framework field selection');await page.keyboard.press('ControlOrMeta+A');
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>speechMessages.filter(m=>m.type==='clearspace:selection-read').at(-1)?.text),'Framework field selection','Page event propagation handlers must not suppress reading');
    await page.locator('#notes').fill('Before selected words After');await page.keyboard.press('Home');
    for(let i=0;i<7;i++) await page.keyboard.press('ArrowRight');
    for(let i=0;i<14;i++) await page.keyboard.press('Shift+ArrowRight');
    await page.waitForFunction(()=>speechMessages.some(m=>m.type==='clearspace:selection-read'&&m.text==='selected words'));
    assert.equal(await page.locator('#notes').inputValue(),'Before selected words After');
    assert.deepEqual(await page.locator('#notes').evaluate(el=>[el.selectionStart,el.selectionEnd]),[7,21]);
    await page.locator('#text-notes').fill('Line one\nRead this line\nLine three');
    await page.locator('#text-notes').evaluate(el=>el.setSelectionRange(9,23));await page.keyboard.press('Shift');
    await page.waitForFunction(()=>speechMessages.some(m=>m.type==='clearspace:selection-read'&&m.text==='Read this line'));
    assert.equal(await page.locator('#text-notes').inputValue(),'Line one\nRead this line\nLine three');
    await page.evaluate(()=>{const host=document.createElement('div');host.attachShadow({mode:'open'}).innerHTML='<input id="shadow-input" value="Shadow selected value">';document.body.append(host);});
    await page.locator('#shadow-input').focus();await page.keyboard.press('ControlOrMeta+A');
    await page.waitForFunction(()=>speechMessages.some(m=>m.type==='clearspace:selection-read'&&m.text==='Shadow selected value'));
    const beforeProtected=await count();
    for(const id of ['password','payment']) {await page.locator('#'+id).fill('Do not speak this');await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press('Shift');await page.waitForTimeout(300);}
    assert.equal(await count(),beforeProtected);
    await page.locator('#payment').blur();
    await page.evaluate(()=>{const title=document.createElement('h1');const link=document.createElement('a');link.id='video-title';link.href='#video';link.textContent='A dynamically loaded video title';title.append(link);document.querySelector('#dynamic').append(title);});
    await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#video-title'));getSelection().removeAllRanges();getSelection().addRange(range);});
    await page.keyboard.press('Shift');
    await page.waitForFunction(()=>speechMessages.some(m=>m.type==='clearspace:selection-read'&&m.text==='A dynamically loaded video title'));
    await page.locator('#video-title').click();assert.equal(new URL(page.url()).hash,'#video');
    await page.evaluate(()=>selectionController.disable());
  });
  await check('button labels read on explicit action without activating site buttons, including icons and open shadow DOM', async () => {
    await load('/button-speech');
    await page.evaluate(()=>{
      window.speechMessages=[];window.speechListeners=[];window.buttonActivations=0;window.readerShadows=[];
      const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=attach.call(this,options);if(options.mode==='closed')readerShadows.push(root);return root;};
      window.speechApi={runtime:{sendMessage:async message=>{speechMessages.push(message);return {ok:true};},onMessage:{addListener:fn=>speechListeners.push(fn),removeListener:fn=>{speechListeners=speechListeners.filter(item=>item!==fn);}}}};
      const fixtures=document.createElement('section');fixtures.innerHTML='<button id="speak-button" type="button">Save changes</button><button id="icon-button" aria-label="Play video"><span aria-hidden="true">triangle icon</span></button><span id="name-verb" hidden>Download</span><span id="name-item" hidden>report</span><button id="named-button" aria-labelledby="name-verb name-item" aria-label="Wrong fallback">Visible fallback</button><button id="visible-button"><span aria-hidden="true">Ignore icon</span><span style="display:none">Ignore hidden text</span>Continue</button><div id="role-button" role="button" tabindex="0">Custom action</div><input id="native-button" type="button" value="Upload"><button id="no-label"><span aria-hidden="true">?</span></button>';
      fixtures.addEventListener('click',()=>buttonActivations++);document.body.append(fixtures);
      const button=document.createElement('button');button.id='shadow-label-button';button.setAttribute('aria-label','Close player');button.addEventListener('click',()=>buttonActivations++);document.querySelector('#shadow-host').shadowRoot.append(button);
    });
    await page.addScriptTag({path:resolve('client/public/selection-reader.js')});
    await page.evaluate(()=>{window.selectionController=clearspaceSelectionReader.createController(document,speechApi);selectionController.update({version:1,enabled:true,dyslexia:{experiences:{preferListening:true}}});});
    const reads=()=>page.evaluate(()=>speechMessages.filter(m=>m.type==='clearspace:selection-read'));
    await page.locator('#speak-button').hover();assert.equal((await reads()).length,0);
    assert.equal(await page.locator('[data-clearspace-button-reader]').count(),1);
    // The production control uses a closed shadow root; retain the test-only reference to click it.
    await page.evaluate(()=>readerShadows.find(root=>root.host.hasAttribute('data-clearspace-button-reader')).querySelector('button').click());
    assert.equal((await reads()).at(-1).text,'Save changes');assert.equal(await page.evaluate(()=>buttonActivations),0);
    for(const [id,label] of [['icon-button','Play video'],['named-button','Download report'],['visible-button','Continue'],['role-button','Custom action'],['native-button','Upload'],['shadow-label-button','Close player']]) {
      const before=(await reads()).length;await page.locator('#'+id).focus();await page.keyboard.press('Alt+Shift+r');
      await page.waitForFunction(count=>speechMessages.filter(m=>m.type==='clearspace:selection-read').length>count,before);
      assert.equal((await reads()).at(-1).text,label);
    }
    assert.equal(await page.evaluate(()=>buttonActivations),0);
    await page.locator('#notes').fill('Do not replace the button reading');await page.keyboard.press('ControlOrMeta+A');await page.waitForTimeout(350);
    await page.locator('#icon-button').hover();await page.keyboard.press('Alt+Shift+r');await page.waitForTimeout(350);
    assert.equal((await reads()).at(-1).text,'Play video');
    const beforeMissing=(await reads()).length;await page.locator('#no-label').focus();await page.keyboard.press('Alt+Shift+r');await page.waitForTimeout(100);assert.equal((await reads()).length,beforeMissing);
    await page.locator('#speak-button').click();assert.equal(await page.evaluate(()=>buttonActivations),1);
    await page.keyboard.press('Escape');assert.equal(await page.locator('[data-clearspace-button-reader]').count(),0);
    await page.evaluate(()=>selectionController.disable());await page.locator('#icon-button').hover();assert.equal(await page.locator('[data-clearspace-button-reader]').count(),0);
    const afterDisable=(await reads()).length;await page.locator('#icon-button').focus();await page.keyboard.press('Alt+Shift+r');assert.equal((await reads()).length,afterDisable);
    assert.equal(await page.evaluate(()=>speechListeners.length),0);
  });
  await check('listening UI defaults to automatic language detection', async () => {
    await page.goto(base+'/options');
    await page.getByRole('button',{name:/Dyslexia Reading at your rhythm/}).click();
    await page.getByLabel('I prefer listening to text',{exact:true}).check();
    const voice=page.getByLabel('Read-aloud voice',{exact:true});
    assert.equal(await voice.inputValue(),'');
    assert.equal(await voice.locator('option:checked').textContent(),'Auto-detect language');
    await page.getByRole('button',{name:'Save and apply',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Demo settings saved'}).waitFor();
    await page.reload();await page.getByRole('button',{name:/Dyslexia Reading at your rhythm/}).click();
    assert.equal(await page.getByLabel('Read-aloud voice',{exact:true}).locator('option:checked').textContent(),'Auto-detect language');
  });
  if (process.env.A11YFIX_LIVE_SITES === '1' || process.argv.includes('--live-sites')) {
    const failures=[];
    for (const url of ['https://example.com','https://en.wikipedia.org/wiki/Dyslexia','https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model']) {
      try { await check(`public website ${url}`, async () => {
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
        // Protocol evaluation models content-script execution; a page script tag is blocked by site CSP.
        await page.evaluate(engineSource);
        const result = await page.evaluate(async () => {
          const controller=clearspaceDyslexia.createController(document); const element=[...document.querySelectorAll('p')].find(p=>[...p.childNodes].some(n=>n.nodeType===3 && n.data.trim().length>30) && !p.querySelector('code,input,button,[contenteditable]')); if(!element) throw Error('No article paragraph');
          const before=getComputedStyle(element).fontFamily, spacingBefore=getComputedStyle(element).letterSpacing;controller.apply({experiences:{distinguishWords:true}});
          await new Promise(done=>setTimeout(done,1500)); const after=getComputedStyle(element).fontFamily;
          const spacingAfter=getComputedStyle(element).letterSpacing;controller.reset(); return {before,after,spacingBefore,spacingAfter,restored:getComputedStyle(element).fontFamily};
        });
        assert.match(result.after,/Arial/); assert.notEqual(result.spacingAfter,result.spacingBefore); assert.equal(result.restored,result.before);
        await page.evaluate(selectionReaderSource);
        const buttonIndex=await page.evaluate(()=>{
          const buttons=[...document.querySelectorAll('button')];
          const index=buttons.findIndex(button=>!button.disabled&&button.getClientRects().length&&getComputedStyle(button).visibility!=='hidden'&&clearspaceSelectionReader.buttonLabel(button));
          if(index<0)return -1;
          window.a11yButtonTest={reads:[],listeners:[]};
          const api={runtime:{sendMessage:async message=>{if(message.type==='clearspace:selection-read')a11yButtonTest.reads.push(message);return {ok:true};},onMessage:{addListener:fn=>a11yButtonTest.listeners.push(fn),removeListener:fn=>{a11yButtonTest.listeners=a11yButtonTest.listeners.filter(item=>item!==fn);}}}};
          a11yButtonTest.controller=clearspaceSelectionReader.createController(document,api);
          a11yButtonTest.controller.update({version:1,enabled:true,dyslexia:{experiences:{preferListening:true}}});
          return index;
        });
        if(buttonIndex>=0){
          const beforeURL=page.url();await page.locator('button').nth(buttonIndex).focus();await page.keyboard.press('Alt+Shift+r');
          await page.waitForFunction(()=>a11yButtonTest.reads.length>0);assert.equal(page.url(),beforeURL);
          await page.evaluate(()=>{a11yButtonTest.controller.disable();delete window.a11yButtonTest;});
        }
      }); } catch(error) { console.error(`FAILED public website ${url}: ${error.message}`); failures.push(url); }
    }
    assert.deepEqual(failures,[], 'Public website checks must pass; network failures are not proof of compatibility.');
  }
  assert.deepEqual(errors,[]); console.log(`PASS ${passed} browser scenarios; no page errors`);
} finally { await browser.close(); await new Promise(done=>server.close(done)); await new Promise(done=>cross.close(done)); }
