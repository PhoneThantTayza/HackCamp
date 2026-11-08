// Exercises real extension APIs in a disposable browser profile, not the user's profile.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
const { chromium } = await import(pathToFileURL(join(tmpdir(),'a11yfix-browser-tests/node_modules/playwright-core/index.mjs')));
const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(),'clearspace-speech-')),{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--enable-unsafe-extension-debugging'],ignoreDefaultArgs:['--disable-extensions']});
try {
  const session=await context.browser().newBrowserCDPSession();
  const {id}=await session.send('Extensions.loadUnpacked',{path:resolve('dist')});
  const page=await context.newPage();
  await page.goto(`chrome-extension://${id}/index.html`);
  const result=await page.evaluate(async()=>({
    voices:(await chrome.tts.getVoices()).map(({voiceName,lang,remote,extensionId})=>({voiceName,lang,remote,extensionId})),
    detection:await Promise.all([
      'Hello', 'Bonjour', 'สวัสดีครับ',
      'This is an English paragraph that should be detected reliably by the browser language detector.',
      'Bonjour tout le monde. Nous utilisons ce texte pour tester la détection automatique de la langue française.',
      'ภาษาไทยเป็นภาษาที่ใช้ในการสื่อสารในประเทศไทยและข้อความนี้ใช้ทดสอบการอ่านออกเสียง',
    ].map(async text=>({sample:text,result:await chrome.i18n.detectLanguage(text)}))),
  }));
  console.log(JSON.stringify(result,null,2));
  for (const [index, language] of [[3,'en'],[4,'fr'],[5,'th']]) {
    assert.equal(result.detection[index].result.isReliable,true);
    assert.equal(result.detection[index].result.languages[0].language,language);
  }
  console.log('PASS real Chrome language detection for English, French and Thai paragraphs');
  if (!result.voices.length) console.log('SKIP audible speech: this headless test profile has no platform voices.');
} finally {await context.close();}
