import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

test("page styles update without duplication and disable removes only our sheet", async () => {
  const websiteSheet = { website: true };
  const document = { adoptedStyleSheets: [websiteSheet] };
  const listeners = [];
  let settings = { version: 1, enabled: true, selected: ["vision:Larger text", "vision:Reduce motion", "motor:Reduce motion"] };
  const context = vm.createContext({ document, CSSStyleSheet: class { replaceSync(css) { this.css = css; } }, chrome: {
    storage: { local: { get: async () => ({ settings }) }, onChanged: { addListener: fn => listeners.push(fn) } }
  } });
  const source = readFileSync("client/public/content.js", "utf8");
  vm.runInContext(source, context);
  await Promise.resolve();
  assert.equal(document.adoptedStyleSheets.length, 2);
  assert.match(document.adoptedStyleSheets[1].css, /125%/);
  assert.equal(document.adoptedStyleSheets[1].css.match(/animation: none/g).length, 1);
  vm.runInContext(source, context);
  await Promise.resolve();
  assert.equal(listeners.length, 1);
  assert.equal(document.adoptedStyleSheets.length, 2);
  listeners[0]({ settings: { newValue: { ...settings, enabled: false } } }, "local");
  assert.equal(document.adoptedStyleSheets.length, 1);
  assert.equal(document.adoptedStyleSheets[0], websiteSheet);
  listeners[0]({ settings: { newValue: { ...settings, selected: ["vision:Underline links"] } } }, "local");
  assert.match(document.adoptedStyleSheets[1].css, /underline/);
  assert.doesNotMatch(document.adoptedStyleSheets[1].css, /125%/);
  listeners[0]({ settings: { newValue: { version: 1, enabled: true, selected: [] } } }, "local");
  assert.equal(document.adoptedStyleSheets.length, 1);
  assert.equal(document.adoptedStyleSheets[0], websiteSheet);
});

test("build contains the files referenced by the manifest", () => {
  const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
  for (const file of [manifest.options_page, manifest.background.service_worker, "dyslexia.js", "selection-reader.js", "selection-tts.js", "content.js"]) {
    assert.ok(readFileSync(`dist/${file}`).length);
  }
  assert.equal(manifest.manifest_version, 3);
  assert.ok(!manifest.host_permissions, "broad site access must remain optional");
});
