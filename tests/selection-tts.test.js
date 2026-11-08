import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync('client/public/selection-tts.js','utf8');
function fixture() {
  let receive, change, removed, updated;
  const spoken=[], statuses=[];
  let stops=0;
  const settings={version:1,enabled:true,dyslexia:{experiences:{preferListening:true},speech:{rate:1.4,voiceName:'Remote'}}};
  const chrome={runtime:{id:'extension',getURL:()=> 'chrome-extension://extension/',onMessage:{addListener:fn=>receive=fn}},
    storage:{local:{get:async()=>({settings})},onChanged:{addListener:fn=>change=fn}},
    tabs:{get:async()=>({active:true}),sendMessage:async(...args)=>statuses.push(args),onRemoved:{addListener:fn=>removed=fn},onUpdated:{addListener:fn=>updated=fn}},
    tts:{getVoices:async()=>[{voiceName:'Remote',remote:true},{voiceName:'Local',remote:false}],stop:()=>stops++,speak:async(text,options)=>spoken.push({text,options})}};
  vm.runInNewContext(source,{chrome,setTimeout,clearTimeout});
  const sender={id:'extension',tab:{id:42},frameId:0,documentId:'doc-a',url:'https://example.com/'};
  const send=(message,from=sender)=>new Promise(resolve=>receive(message,from,resolve));
  return {chrome,settings,spoken,statuses,sender,send,change:(...args)=>change(...args),removed:tab=>removed(tab),updated:(...args)=>updated(...args),stops:()=>stops};
}
test('selected text uses a saved rate and local voice, sends text-free status to the originating document',async()=>{
  const f=fixture(); assert.equal((await f.send({type:'clearspace:selection-read',text:'Read this selection',requestId:1})).ok,true);
  assert.equal(f.spoken[0].text,'Read this selection');assert.equal(f.spoken[0].options.voiceName,'Local');assert.equal(f.spoken[0].options.rate,1.4);
  f.spoken[0].options.onEvent({type:'start'});
  assert.equal(f.statuses[0][2].documentId,'doc-a');assert.equal(f.statuses[0][1].text,undefined);
});
test('disabled preferences, background tabs, oversized text and missing local voices do not speak',async()=>{
  for(const setup of [f=>f.settings.enabled=false,f=>f.chrome.tabs.get=async()=>({active:false}),f=>f.chrome.tts.getVoices=async()=>[{remote:true}]]){
    const f=fixture();setup(f);const result=await f.send({type:'clearspace:selection-read',text:'Read me',requestId:1});assert.equal(result.ok,false);assert.equal(f.spoken.length,0);
  }
  const f=fixture();assert.equal((await f.send({type:'clearspace:selection-read',text:'a'.repeat(32769),requestId:1})).ok,false);assert.equal(f.spoken.length,0);
});
test('only the owning document can stop reading; disable and navigation stop speech',async()=>{
  const f=fixture();await f.send({type:'clearspace:selection-read',text:'Read me',requestId:1});
  await f.send({type:'clearspace:selection-stop'},{...f.sender,documentId:'other'});assert.equal(f.stops(),0);
  await f.send({type:'clearspace:selection-stop'});assert.equal(f.stops(),1);
  await f.send({type:'clearspace:selection-read',text:'Again',requestId:2});f.change({settings:{newValue:{...f.settings,enabled:false}}},'local');assert.equal(f.stops(),2);
  await f.send({type:'clearspace:selection-read',text:'Navigation',requestId:3});f.updated(42,{status:'loading'});assert.equal(f.stops(),3);
});
test('Escape during voice loading and newer selections cancel delayed utterances',async()=>{
  const f=fixture();let release;f.chrome.tts.getVoices=()=>new Promise(resolve=>release=resolve);
  const first=f.send({type:'clearspace:selection-read',text:'Old selection',requestId:1});
  await new Promise(resolve=>setImmediate(resolve));await f.send({type:'clearspace:selection-stop'});release([{voiceName:'Local',remote:false}]);await first;assert.equal(f.spoken.length,0);
  f.chrome.tts.getVoices=async()=>[{voiceName:'Local',remote:false}];await f.send({type:'clearspace:selection-read',text:'New selection',requestId:2});assert.equal(f.spoken[0].text,'New selection');
});

function multilingualFixture() {
  const f=fixture();f.settings.dyslexia.speech={rate:1};
  f.chrome.tts.getVoices=async()=>[
    {voiceName:'English',lang:'en-US',remote:false},
    {voiceName:'French',lang:'fr-FR',remote:false},
    {voiceName:'Thai',lang:'th-TH',remote:false},
    {voiceName:'Remote Spanish',lang:'es-ES',remote:true},
  ];
  f.chrome.i18n={detectLanguage:async()=>({isReliable:true,languages:[{language:'fr',percentage:99}]}),getUILanguage:()=> 'en-US'};
  return f;
}
test('auto-detection is the default and chooses a matching local language voice',async()=>{
  const f=multilingualFixture();
  await f.send({type:'clearspace:selection-read',text:'Bonjour tout le monde. Ceci est un passage français.',requestId:1});
  assert.equal(f.spoken[0].options.voiceName,'French');assert.equal(f.spoken[0].options.lang,'fr-FR');
  f.chrome.i18n.detectLanguage=async()=>({isReliable:true,languages:[{language:'th',percentage:100}]});
  await f.send({type:'clearspace:selection-read',text:'สวัสดีครับ',requestId:2});assert.equal(f.spoken[1].options.voiceName,'Thai');
});
test('exact locales win; manual choices bypass detection',async()=>{
  const f=multilingualFixture();
  f.chrome.tts.getVoices=async()=>[{voiceName:'US',lang:'en-US',remote:false},{voiceName:'UK',lang:'en-GB',remote:false}];
  f.chrome.i18n.detectLanguage=async()=>({isReliable:true,languages:[{language:'en-GB',percentage:100}]});
  await f.send({type:'clearspace:selection-read',text:'An English passage.',requestId:1});assert.equal(f.spoken[0].options.voiceName,'UK');
  f.settings.dyslexia.speech.voiceName='US';f.chrome.i18n.detectLanguage=async()=>{throw new Error('Manual should bypass detection');};
  await f.send({type:'clearspace:selection-read',text:'Bonjour',requestId:2});assert.equal(f.spoken[1].options.voiceName,'US');
});
test('uncertain, mixed, failed and unavailable detection use a local fallback with notice',async()=>{
  for(const result of [undefined,{isReliable:false,languages:[{language:'fr',percentage:100}]},{isReliable:true,languages:[{language:'en',percentage:55},{language:'fr',percentage:45}]},{isReliable:true,languages:[{language:'und',percentage:100}]}]) {
    const f=multilingualFixture();f.chrome.i18n.detectLanguage=async()=>result;
    await f.send({type:'clearspace:selection-read',text:'Hello bonjour',requestId:1});assert.equal(f.spoken[0].options.voiceName,'English');
    f.spoken[0].options.onEvent({type:'start'});assert.match(f.statuses[0][1].message,/Language uncertain/);
  }
  const f=multilingualFixture();f.chrome.i18n.detectLanguage=async()=>{throw new Error('unavailable');};
  await f.send({type:'clearspace:selection-read',text:'Short',requestId:1});assert.equal(f.spoken[0].options.voiceName,'English');
});
test('missing matching languages never use a remote voice silently',async()=>{
  const f=multilingualFixture();f.chrome.i18n.detectLanguage=async()=>({isReliable:true,languages:[{language:'es',percentage:99}]});
  const result=await f.send({type:'clearspace:selection-read',text:'Un pasaje español para leer.',requestId:1});
  assert.equal(result.ok,false);assert.match(result.message,/No local voice for es/);assert.equal(f.spoken.length,0);
});
test('Stop during language detection prevents delayed speech',async()=>{
  const f=multilingualFixture();let release;
  f.chrome.i18n.detectLanguage=()=>new Promise(resolve=>release=resolve);
  const pending=f.send({type:'clearspace:selection-read',text:'Bonjour',requestId:1});await new Promise(resolve=>setImmediate(resolve));
  await f.send({type:'clearspace:selection-stop'});release({isReliable:true,languages:[{language:'fr',percentage:99}]});
  await pending;assert.equal(f.spoken.length,0);
});

test('short selections use their declared language; clear Thai script beats an unrelated page language',async()=>{
  const f=multilingualFixture();f.chrome.i18n.detectLanguage=async()=>({isReliable:false,languages:[{language:'no',percentage:100}]});
  await f.send({type:'clearspace:selection-read',text:'Bonjour',languageHint:'fr-FR',requestId:1});
  assert.equal(f.spoken[0].options.voiceName,'French');
  f.chrome.i18n.detectLanguage=async()=>({isReliable:false,languages:[{language:'th',percentage:100}]});
  await f.send({type:'clearspace:selection-read',text:'สวัสดีครับ',languageHint:'en-US',requestId:2});
  assert.equal(f.spoken[1].options.voiceName,'Thai');
});
test('reliable selected-text detection takes priority over an incorrect page language',async()=>{
  const f=multilingualFixture();
  await f.send({type:'clearspace:selection-read',text:'Bonjour tout le monde',languageHint:'en',requestId:1});
  assert.equal(f.spoken[0].options.voiceName,'French');
});
test('an initially empty platform voice list is retried when voices finish loading',async()=>{
  const f=multilingualFixture();let ready, calls=0;
  f.chrome.tts.getVoices=async()=>++calls===1?[]:[{voiceName:'French',lang:'fr-FR',remote:false}];
  f.chrome.tts.onVoicesChanged={addListener:fn=>ready=fn,removeListener:()=>{}};
  const pending=f.send({type:'clearspace:selection-read',text:'Bonjour tout le monde',requestId:1});
  await new Promise(resolve=>setImmediate(resolve));ready();await pending;
  assert.equal(f.spoken[0].options.voiceName,'French');assert.equal(calls,2);
});
