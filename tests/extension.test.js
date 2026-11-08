import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

test("page styles update without duplication and disable removes only our sheet", async () => {
  const websiteSheet = { website: true };
  const document = { adoptedStyleSheets: [websiteSheet] };
  const listeners = [];
  let settings = { version: 1, enabled: true, selected: ["dyslexia:Readable font", "motor:Reduce motion", "cognitive:Reduce motion"] };
  const context = vm.createContext({ document, CSSStyleSheet: class { replaceSync(css) { this.css = css; } }, chrome: {
    storage: { local: { get: async () => ({ settings }) }, onChanged: { addListener: fn => listeners.push(fn) } }
  } });
  const source = readFileSync("client/public/content.js", "utf8");
  vm.runInContext(readFileSync("client/public/color-vision.js", "utf8"), context);
  vm.runInContext(source, context);
  await Promise.resolve();
  assert.equal(document.adoptedStyleSheets.length, 2);
  assert.match(document.adoptedStyleSheets[1].css, /font-family: Arial/);
  assert.equal(document.adoptedStyleSheets[1].css.match(/animation: none/g).length, 1);
  vm.runInContext(source, context);
  await Promise.resolve();
  assert.equal(listeners.length, 1);
  assert.equal(document.adoptedStyleSheets.length, 2);
  listeners[0]({ settings: { newValue: { ...settings, enabled: false } } }, "local");
  assert.equal(document.adoptedStyleSheets.length, 1);
  assert.equal(document.adoptedStyleSheets[0], websiteSheet);
  listeners[0]({ settings: { newValue: { ...settings, selected: ["motor:Keyboard focus indicators"] } } }, "local");
  assert.match(document.adoptedStyleSheets[1].css, /:focus-visible/);
  assert.doesNotMatch(document.adoptedStyleSheets[1].css, /animation: none/);
  listeners[0]({ settings: { newValue: { version: 1, enabled: true, selected: [] } } }, "local");
  assert.equal(document.adoptedStyleSheets.length, 1);
  assert.equal(document.adoptedStyleSheets[0], websiteSheet);
  // Previously saved Vision choices must no longer affect webpages.
  listeners[0]({ settings: { newValue: { version: 1, enabled: true, selected: [
    "vision:Larger text", "vision:High contrast", "vision:Extra line spacing",
    "vision:Reduce motion", "vision:Underline links",
  ] } } }, "local");
  assert.deepEqual(Array.from(document.adoptedStyleSheets), [websiteSheet]);
});

test("build contains the files referenced by the manifest", () => {
  const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
  for (const file of [manifest.options_page, manifest.background.service_worker, "color-vision.js", "content.js"]) {
    assert.ok(readFileSync(`dist/${file}`).length);
  }
  assert.equal(manifest.manifest_version, 3);
  assert.ok(!manifest.host_permissions, "broad site access must remain optional");
});

test("colour assistance updates and removes its own SVG and styles across save, pause and reset", async () => {
  function element(name) {
    return {
      name, attributes: {}, children: [], style: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      append(child) { this.children.push(child); child.parent = this; },
      remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
    };
  }
  const root = element("html");
  const websiteSvg = element("svg");
  root.append(websiteSvg);
  const websiteSheet = { website: true };
  const document = { URL: "https://example.test/article#section", documentElement: root, createElementNS: (_, name) => element(name), adoptedStyleSheets: [websiteSheet] };
  const listeners = [];
  const settings = { version: 1, enabled: true, selected: ["dyslexia:Readable font"], colorVision: { mode: "protan", strength: 70, cues: true } };
  const context = vm.createContext({ document, URL, CSSStyleSheet: class { replaceSync(css) { this.css = css; } }, chrome: {
    storage: { local: { get: async () => ({ settings }) }, onChanged: { addListener: fn => listeners.push(fn) } }
  } });
  const helper = readFileSync("client/public/color-vision.js", "utf8");
  const source = readFileSync("client/public/content.js", "utf8");
  vm.runInContext(helper, context);
  vm.runInContext(source, context);
  await Promise.resolve();
  function assertActive(mode, strength) {
    assert.equal(root.children.length, 2);
    assert.equal(document.adoptedStyleSheets.length, 2);
    const filter = root.children[1].children[0];
    assert.match(document.adoptedStyleSheets[1].css, new RegExp(filter.attributes.id));
    assert.equal(filter.children[0].attributes.values, context.clearspaceColorVision.matrix({ mode, strength }));
  }
  assertActive("protan", 70);
  assert.match(document.adoptedStyleSheets[1].css, /https:\/\/example\.test\/article#clearspace-colour-/);
  assert.match(document.adoptedStyleSheets[1].css, /font-family: Arial/);
  assert.match(document.adoptedStyleSheets[1].css, /dashed/);
  // The same scripts are injected every time the user applies to this tab.
  vm.runInContext(helper, context);
  vm.runInContext(source, context);
  await Promise.resolve();
  assertActive("protan", 70);
  assert.equal(listeners.length, 1);
  const apply = value => listeners[0]({ settings: { newValue: value } }, "local");
  apply({ ...settings, colorVision: { mode: "tritan", strength: 35, cues: false } });
  assertActive("tritan", 35);
  assert.doesNotMatch(document.adoptedStyleSheets[1].css, /dashed/);
  apply({ ...settings, enabled: false });
  assert.deepEqual(root.children, [websiteSvg]);
  assert.deepEqual(Array.from(document.adoptedStyleSheets), [websiteSheet]);
  apply(settings);
  assertActive("protan", 70);
  apply({ version: 1, enabled: true, selected: [], colorVision: { mode: "off", cues: true } });
  assert.deepEqual(root.children, [websiteSvg]);
  assert.match(document.adoptedStyleSheets[1].css, /underline/);
  assert.doesNotMatch(document.adoptedStyleSheets[1].css, /filter:/);
  apply({ version: 1, enabled: true, selected: [] });
  assert.deepEqual(root.children, [websiteSvg]);
  assert.deepEqual(Array.from(document.adoptedStyleSheets), [websiteSheet]);
});

test("colour palettes preserve neutral colours and opacity; zero strength is identity", () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync("client/public/color-vision.js", "utf8"), context);
  const { normalize, matrix } = context.clearspaceColorVision;
  const identity = "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0";
  for (const mode of ["protan", "deutan", "tritan"]) {
    assert.equal(matrix({ mode, strength: 0 }), identity);
    const values = matrix({ mode, strength: 100 }).split(" ").map(Number);
    assert.equal(values.length, 20);
    for (let row = 0; row < 3; row++) {
      assert.ok(Math.abs(values.slice(row * 5, row * 5 + 3).reduce((a, b) => a + b) - 1) < 1e-10);
      assert.equal(values[row * 5 + 3], 0);
      assert.equal(values[row * 5 + 4], 0);
    }
    assert.deepEqual(values.slice(15), [0, 0, 0, 1, 0]);
    assert.notEqual(matrix({ mode, strength: 100 }), identity);
  }
  assert.equal(matrix({ mode: "unexpected", strength: 100 }), identity);
  assert.equal(normalize({ mode: "constructor", strength: -200, cues: "true" }).mode, "off");
  assert.equal(normalize({ strength: -200 }).strength, 0);
  assert.equal(normalize({ strength: 200 }).strength, 100);
  assert.equal(normalize({ strength: NaN }).strength, 70);
  assert.equal(normalize().cues, false);
  assert.equal(normalize({ cues: "true" }).cues, false);
});

test("content injection acknowledges application and reports asynchronous failures", async () => {
  const context = vm.createContext({
    document: { adoptedStyleSheets: [] },
    CSSStyleSheet: class { replaceSync() { throw new Error("Styles could not be installed"); } },
    chrome: { storage: {
      local: { get: async () => ({ settings: { version: 1, enabled: true, selected: ["dyslexia:Readable font"] } }) },
      onChanged: { addListener() {} },
    } },
  });
  vm.runInContext(readFileSync("client/public/color-vision.js", "utf8"), context);
  const source = readFileSync("client/public/content.js", "utf8");
  const failure = await vm.runInContext(source, context);
  assert.equal(failure.applied, false);
  assert.match(failure.error, /Styles could not be installed/);
  context.chrome.storage.local.get = async () => ({ settings: { version: 1, enabled: false, selected: [] } });
  assert.equal((await vm.runInContext(source, context)).applied, true);
});

test("Save connects open websites with automatic access and requires a page acknowledgement", async t => {
  const previousChrome = globalThis.chrome;
  const previousLocation = globalThis.location;
  t.after(() => {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  });
  const injected = [];
  let automatic = true;
  let acknowledge = true;
  globalThis.location = { search: "" };
  globalThis.chrome = {
    runtime: { id: "clearspace-test" }, storage: {},
    permissions: { contains: async () => automatic },
    tabs: { query: async () => [{ id: 7 }, { id: 8 }] },
    scripting: { executeScript: async options => {
      injected.push(options);
      if (options.target.tabId === 8) throw new Error("Protected website");
      return [{ frameId: 0, result: acknowledge ? { applied: true } : undefined }];
    } },
  };
  const { applyToTarget } = await import("../client/src/settings.js?extension-test");
  assert.match(await applyToTarget(), /applied to 1 website tab/);
  assert.deepEqual(injected.map(item => item.target.tabId), [7, 8]);
  assert.deepEqual(injected[0].files, ["color-vision.js", "content.js"]);
  automatic = false;
  await assert.rejects(applyToTarget(), /no website is connected/);
  globalThis.location.search = "?tab=7";
  assert.match(await applyToTarget(), /applied to 1 website tab/);
  acknowledge = false;
  await assert.rejects(applyToTarget(), /could not be adjusted/);
  automatic = true;
  globalThis.chrome.tabs.query = async () => [];
  globalThis.location.search = "";
  assert.match(await applyToTarget(), /Open a website/);
});
