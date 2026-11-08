import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.A11YFIX_PLAYWRIGHT ??
  join(tmpdir(), 'a11yfix-browser-tests/node_modules/playwright-core/index.mjs')));
const browser = await chromium.launch({ executablePath: process.env.A11YFIX_CHROME ??
  'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.setContent('<style>body{background:#fff;color:#222;font:18px Arial}p{padding:12px}#dark{background:#000;color:#eee}#glass{background:rgba(255,255,255,.15)}</style><p id="light">Dark text on an inherited light background.</p><div id="dark"><p id="night">Light text on an inherited black background.</p><div id="glass"><p id="alpha">Text over translucent ancestors.</p></div></div><div id="host" style="background:#123;color:white"></div><input value="Keep my input">');
  await page.evaluate(() => {
    const shadow = document.querySelector('#host').attachShadow({mode:'open'});
    const p = document.createElement('p'); p.id = 'shadow-text'; p.textContent = 'Shadow text inherits the host background.'; shadow.append(p);
  });
  await page.addScriptTag({ path: resolve('client/public/dyslexia.js') });
  await page.evaluate(() => {
    window.reader = clearspaceDyslexia.createController(document);
    reader.apply({experiences:{readingFatigue:true}});
  });
  for (const selector of ['#light', '#night', '#alpha', '#shadow-text']) {
    const element = page.locator(selector);
    const original = await element.evaluate(el => getComputedStyle(el).color);
    await element.hover();
    await page.waitForFunction(() => [...CSS.highlights.keys()].some(name => name.includes('-passage-')));
    const result = await element.evaluate(el => {
      const name = [...CSS.highlights.keys()].find(name => name.includes('-passage-'));
      return { text:getComputedStyle(el).color, highlight:getComputedStyle(el, `::highlight(${name})`).backgroundColor };
    });
    assert.equal(result.text, original);
    assert.notEqual(result.highlight, 'rgba(0, 0, 0, 0)');
    console.log(`PASS ${selector}: ${result.text} on ${result.highlight}`);
  }
  await page.evaluate(() => {
    const p = document.createElement('p'); p.id='dynamic'; p.textContent='Dynamically added coloured text';
    p.style.color='#0050c8'; document.body.append(p);
  });
  await page.locator('#dynamic').hover();
  await page.waitForFunction(() => [...CSS.highlights.keys()].some(name => name.includes('-passage-')));
  assert.equal(await page.locator('#dynamic').evaluate(el => getComputedStyle(el).color), 'rgb(0, 80, 200)');
  // Reapplication must replace owned styles/highlights; reset must remove them.
  await page.evaluate(() => { reader.apply({experiences:{readingFatigue:true}}); reader.reset(); });
  assert.equal(await page.evaluate(() => CSS.highlights.size), 0);
  assert.equal(await page.locator('input').inputValue(), 'Keep my input');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('*')].some(el =>
    [...el.attributes].some(a => a.name.startsWith('data-cs-reading-')))), false);
  assert.deepEqual(errors, []);
  console.log('PASS dynamic text, repeated application, unchanged text colours/input and reset');
} finally { await browser.close(); }
