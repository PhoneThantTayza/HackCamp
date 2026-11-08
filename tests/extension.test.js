import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

test("adaptive contrast is gradual, preserves readable colours and respects light/dark backgrounds", () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync("client/public/low-vision.js", "utf8"), context);
  vm.runInContext(readFileSync("client/public/light-sensitivity.js", "utf8"), context);
  const { improveText, parseColor, contrast, rules } = context.clearspaceLowVision;
  const white = [255, 255, 255], dark = [25, 35, 44];
  const muted = [150, 150, 150, 1];
  assert.equal(improveText(muted, [white], 0), null);
  const low = parseColor(improveText(muted, [white], 5));
  const normal = parseColor(improveText(muted, [white], 100));
  const high = parseColor(improveText(muted, [white], 200));
  assert.ok(low[0] < muted[0] && low[0] > normal[0]);
  assert.ok(contrast(low, white) > contrast(muted, white));
  assert.ok(contrast(normal, white) >= 4.45);
  assert.ok(contrast(high, white) >= 6.95);
  assert.ok(high[0] < normal[0]);
  const onDark = parseColor(improveText([70, 70, 70, 1], [dark], 100));
  assert.ok(onDark[0] > 70);
  assert.ok(contrast(onDark, dark) >= 4.45);
  for (const strength of [5, 50, 100, 200]) {
    assert.equal(improveText([255, 255, 255, 1], [[183, 28, 28], [198, 40, 40]], strength), null, 'white-on-red heading must stay white');
    assert.equal(rules('Higher contrast', strength), '', 'no blanket background or foreground overrides');
  }
  assert.equal(improveText([17, 17, 17, 1], [white], 100), null);
  assert.equal(improveText(muted, null, 100), null, 'unknown surfaces must not be guessed');
  // A gradient spanning black and white has no universally readable text colour.
  assert.equal(improveText([0, 0, 0, 1], [[0, 0, 0], white], 100), null);
});

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
  vm.runInContext(readFileSync("client/public/low-vision.js", "utf8"), context);
  vm.runInContext(readFileSync("client/public/light-sensitivity.js", "utf8"), context);
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
  for (const file of [manifest.options_page, manifest.background.service_worker, "color-vision.js", "low-vision.js", "light-sensitivity.js", "content.js"]) {
    assert.ok(readFileSync(`dist/${file}`).length);
  }
  assert.equal(manifest.manifest_version, 3);
  assert.ok(!manifest.host_permissions, "broad site access must remain optional");
});

test("low vision choices persist while obsolete vision choices are ignored", async t => {
  const previousStorage = globalThis.localStorage;
  t.after(() => {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  });
  let stored;
  globalThis.localStorage = { getItem: () => stored ?? null, setItem: (_, value) => { stored = value; } };
  const { loadSettings, saveSettings, defaults, lowVisionOptions, lightSensitivityOptions } = await import("../client/src/settings.js?low-vision-test");
  assert.deepEqual((await loadSettings()).selected, []);
  const selected = [...lowVisionOptions, ...lightSensitivityOptions].map(option => `vision:${option}`);
  const lowVision = Object.fromEntries(lowVisionOptions.map((option, index) => [option, 125 + index * 25]));
  const lightSensitivity = { "Dim page": 25, "Soften bright backgrounds": 70, "Warm colour tint": 60 };
  await saveSettings({ ...defaults, selected, lowVision, lightSensitivity });
  assert.deepEqual((await loadSettings()).lightSensitivity, lightSensitivity);
  assert.deepEqual((await loadSettings()).lowVision, lowVision);
  await saveSettings({ ...defaults, selected: [...selected, "vision:Larger text", "vision:High contrast", "motor:Reduce motion"] });
  assert.deepEqual((await loadSettings()).selected, [...selected, "motor:Reduce motion"]);
  await saveSettings(defaults);
  assert.deepEqual((await loadSettings()).selected, []);
  assert.deepEqual((await loadSettings()).lowVision, defaults.lowVision);
  assert.deepEqual((await loadSettings()).lightSensitivity, defaults.lightSensitivity);
});

test("low vision updates independently, restores website styles and combines with colour assistance", async () => {
  const websiteSheet = { website: true };
  const document = { adoptedStyleSheets: [websiteSheet] };
  const settings = { version: 1, enabled: true, selected: [
    "vision:More visible keyboard focus", "vision:More visible links", "vision:Higher contrast", "vision:Larger text and controls",
    "motor:Keyboard focus indicators",
  ], colorVision: { mode: "off", cues: true } };
  const listeners = [];
  const context = vm.createContext({ document, CSSStyleSheet: class { replaceSync(css) { this.css = css; } }, chrome: {
    storage: { local: { get: async () => ({ settings }) }, onChanged: { addListener: fn => listeners.push(fn) } }
  } });
  vm.runInContext(readFileSync("client/public/color-vision.js", "utf8"), context);
  vm.runInContext(readFileSync("client/public/low-vision.js", "utf8"), context);
  vm.runInContext(readFileSync("client/public/light-sensitivity.js", "utf8"), context);
  const source = readFileSync("client/public/content.js", "utf8");
  await vm.runInContext(source, context);
  const css = document.adoptedStyleSheets[1].css;
  assert.match(css, /zoom: 1.25/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /background-color: #fff/);
  assert.match(css, /text-decoration-thickness: 0\.15em/);
  assert.match(css, /outline: 4px solid #000/);
  assert.ok(css.lastIndexOf("outline: 4px") > css.lastIndexOf("outline: 3px"));
  assert.doesNotMatch(css, /color-scheme:|background-image: none/);
  await vm.runInContext(source, context);
  assert.equal(listeners.length, 1);
  assert.equal(document.adoptedStyleSheets.length, 2);
  const apply = value => listeners[0]({ settings: { newValue: value } }, "local");
  apply({ ...settings, selected: ["vision:More visible links"], colorVision: { mode: "off" } });
  assert.match(document.adoptedStyleSheets[1].css, /text-decoration-thickness/);
  assert.doesNotMatch(document.adoptedStyleSheets[1].css, /zoom:|outline:|color-scheme:/);
  apply({ ...settings, enabled: false });
  assert.deepEqual(Array.from(document.adoptedStyleSheets), [websiteSheet]);
  apply(settings);
  assert.match(document.adoptedStyleSheets[1].css, /zoom: 1.25/);
  apply({ ...settings, colorVision: { mode: "off" }, lowVision: {
    "Larger text and controls": 40, "Higher contrast": 50,
    "More visible links": 60, "More visible keyboard focus": 20,
  } });
  const partial = document.adoptedStyleSheets[1].css;
  assert.match(partial, /zoom: 1.1/);
  assert.match(partial, /min-height: 32px/);
  assert.doesNotMatch(partial, /color-scheme:|background-image: none/);
  assert.match(partial, /font-weight: 580/);
  assert.match(partial, /outline: 1.6px solid #000/);
  apply({ ...settings, colorVision: { mode: "off" }, lowVision: {
    "Larger text and controls": 200, "Higher contrast": 200,
    "More visible links": 200, "More visible keyboard focus": 200,
  } });
  const maximum = document.adoptedStyleSheets[1].css;
  assert.match(maximum, /zoom: 1.5/);
  assert.match(maximum, /min-height: 64px/);
  assert.doesNotMatch(maximum, /color-scheme:|background-image: none/);
  assert.match(maximum, /background-color: #fff/);

  assert.match(maximum, /font-weight: 1000/);
  assert.match(maximum, /text-decoration-thickness: 0\.25em/);
  assert.match(maximum, /outline: 7px solid #000/);
  assert.match(maximum, /box-shadow: 0 0 0 14px #fff/);
  for (const option of ["Larger text and controls", "Higher contrast", "More visible links", "More visible keyboard focus"]) {
    apply({ ...settings, selected: [`vision:${option}`], colorVision: { mode: "off" }, lowVision: { [option]: 0 } });
    assert.deepEqual(Array.from(document.adoptedStyleSheets), [websiteSheet]);
  }
  apply({ version: 1, enabled: true, selected: [] });
  assert.deepEqual(Array.from(document.adoptedStyleSheets), [websiteSheet]);
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
  const settings = { version: 1, enabled: true, selected: ["dyslexia:Readable font", "vision:Larger text and controls", "vision:Higher contrast"], colorVision: { mode: "protan", strength: 70, cues: true } };
  const context = vm.createContext({ document, URL, CSSStyleSheet: class { replaceSync(css) { this.css = css; } }, chrome: {
    storage: { local: { get: async () => ({ settings }) }, onChanged: { addListener: fn => listeners.push(fn) } }
  } });
  const helper = readFileSync("client/public/color-vision.js", "utf8");
  const source = readFileSync("client/public/content.js", "utf8");
  vm.runInContext(helper, context);
  vm.runInContext(readFileSync("client/public/low-vision.js", "utf8"), context);
  vm.runInContext(readFileSync("client/public/light-sensitivity.js", "utf8"), context);
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
  assert.match(document.adoptedStyleSheets[1].css, /zoom: 1.25/);
  assert.doesNotMatch(document.adoptedStyleSheets[1].css, /color-scheme:/);
  assert.match(document.adoptedStyleSheets[1].css, /https:\/\/example\.test\/article#clearspace-colour-/);
  assert.match(document.adoptedStyleSheets[1].css, /font-family: Arial/);
  assert.match(document.adoptedStyleSheets[1].css, /dashed/);
  // The same scripts are injected every time the user applies to this tab.
  vm.runInContext(helper, context);
  vm.runInContext(readFileSync("client/public/low-vision.js", "utf8"), context);
  vm.runInContext(readFileSync("client/public/light-sensitivity.js", "utf8"), context);
  vm.runInContext(source, context);
  await Promise.resolve();
  assertActive("protan", 70);
  assert.equal(listeners.length, 1);
  const apply = value => listeners[0]({ settings: { newValue: value } }, "local");
  apply({ ...settings, colorVision: { mode: "tritan", strength: 35, cues: false } });
  assertActive("tritan", 35);
  assert.doesNotMatch(document.adoptedStyleSheets[1].css, /dashed/);
  apply({ ...settings, selected: [...settings.selected, "vision:Dim page", "vision:Warm colour tint"], lightSensitivity: { "Dim page": 100, "Warm colour tint": 100 } });
  assertActive("protan", 70);
  assert.match(document.adoptedStyleSheets[1].css, /filter: url\([^\n]+ brightness\(0.5\) sepia\(0.35\) saturate\(1.2\)/);
  apply({ ...settings, colorVision: { mode: "off" }, selected: ["vision:Dim page"], lightSensitivity: { "Dim page": 0 } });
  assert.deepEqual(Array.from(document.adoptedStyleSheets), [websiteSheet]);
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
  vm.runInContext(readFileSync("client/public/low-vision.js", "utf8"), context);
  vm.runInContext(readFileSync("client/public/light-sensitivity.js", "utf8"), context);
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
  vm.runInContext(readFileSync("client/public/low-vision.js", "utf8"), context);
  vm.runInContext(readFileSync("client/public/light-sensitivity.js", "utf8"), context);
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
  let injectionError;
  let pageError;
  let applied = 0;
  const page = vm.createContext({
    chrome: { storage: { local: { get: async () => ({ settings: { enabled: true } }) } } },
    clearspaceApply(settings) {
      assert.equal(settings.enabled, true);
      if (pageError) throw new Error(pageError);
      applied++;
    },
  });
  globalThis.location = { search: "" };
  globalThis.chrome = {
    runtime: { id: "clearspace-test" }, storage: {},
    permissions: { contains: async () => automatic },
    tabs: { query: async () => [{ id: 7 }, { id: 8 }] },
    scripting: { executeScript: async options => {
      injected.push(options);
      if (injectionError) throw new Error(injectionError);
      if (options.target.tabId === 8) throw new Error("Protected website");
      // File injection may have no useful completion value. The explicit
      // verification function must still apply settings and confirm success.
      if (options.files) return [{ frameId: 0, documentId: "document-7", result: undefined }];
      const result = await vm.runInContext(`(${options.func.toString()})()`, page);
      return [{ frameId: 0, result: acknowledge ? result : undefined }];
    } },
  };
  const { applyToTarget } = await import("../client/src/settings.js?extension-test");
  assert.match(await applyToTarget(), /applied to 1 website tab/);
  assert.deepEqual(injected.filter(item => item.files).map(item => item.target.tabId), [7, 8]);
  assert.deepEqual(injected[0].files, ["color-vision.js", "low-vision.js", "light-sensitivity.js", "content.js"]);
  assert.deepEqual(injected.find(item => item.func).target, { tabId: 7, documentIds: ["document-7"] });
  assert.equal(applied, 1);
  automatic = false;
  await assert.rejects(applyToTarget(), /no website is connected/);
  globalThis.location.search = "?tab=7";
  assert.match(await applyToTarget(), /applied to 1 website tab/);
  acknowledge = false;
  await assert.rejects(applyToTarget(), /could not be adjusted/);
  acknowledge = true;
  pageError = "Styles could not be installed";
  await assert.rejects(applyToTarget(), /Styles could not be installed/);
  pageError = undefined;
  delete page.clearspaceApply;
  await assert.rejects(applyToTarget(), /page script did not start/);
  injectionError = "Cannot access contents of the page. Extension manifest must request permission";
  await assert.rejects(applyToTarget(), /toolbar icon.*grant access/);
  injectionError = "Cannot access a chrome:// URL";
  assert.match(await applyToTarget(), /^Settings saved\. Chrome protects this page.*toolbar icon there/);
  injectionError = undefined;
  automatic = true;
  globalThis.location.search = "?tab=8";
  const executeScript = globalThis.chrome.scripting.executeScript;
  globalThis.chrome.scripting.executeScript = async options => {
    if (options.target.tabId === 8) throw new Error("Cannot access a chrome:// URL");
    return executeScript(options);
  };
  page.clearspaceApply = () => {};
  assert.match(await applyToTarget(), /^Settings saved and applied to 1 website tab\. Chrome protects this page/);
  globalThis.chrome.scripting.executeScript = executeScript;
  automatic = false;
  globalThis.location.search = "?tab=7";
  injectionError = "No tab with id: 7";
  await assert.rejects(applyToTarget(), /reconnect it/);
  injectionError = undefined;
  automatic = true;
  globalThis.chrome.tabs.query = async () => [];
  globalThis.location.search = "";
  assert.match(await applyToTarget(), /Open a website/);
});

test("light sensitivity keeps coloured and dark surfaces, clamps strengths and restores inline styles", () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync("client/public/low-vision.js", "utf8"), context);
  vm.runInContext(readFileSync("client/public/light-sensitivity.js", "utf8"), context);
  const { normalize, filters, surface, applySurfaces } = context.clearspaceLightSensitivity;
  assert.equal(normalize({ "Dim page": -10 })["Dim page"], 0);
  assert.equal(normalize({ "Warm colour tint": 400 })["Warm colour tint"], 100);
  assert.equal(normalize({ "Dim page": NaN })["Dim page"], 35);
  assert.equal(filters([], {}), '');
  assert.equal(filters(['Dim page', 'Warm colour tint'], { 'Dim page': 0, 'Warm colour tint': 0 }), '');
  assert.equal(surface([255, 255, 255, 1], 100, false), 'rgba(222, 218, 208, 1)');
  assert.equal(surface([255, 255, 255, 1], 0, false), null);
  assert.equal(surface([25, 30, 35, 1], 100, false), null);
  assert.equal(surface([255, 0, 0, 1], 100, false), null);
  assert.equal(surface([0, 0, 0, 0], 100, true), null);

  const makeNode = (background, tag = 'div') => {
    const values = new Map(), priorities = new Map();
    return { background, tag, style: {
      getPropertyValue: key => values.get(key) || '',
      getPropertyPriority: key => priorities.get(key) || '',
      setProperty: (key, value, priority) => { values.set(key, value); priorities.set(key, priority); },
      removeProperty: key => { values.delete(key); priorities.delete(key); },
    }, closest: () => tag === 'img', matches: selector => tag === 'a' && selector.includes('a[href]') };
  };
  const root = makeNode('rgb(255, 255, 255)'), link = makeNode('rgba(0, 0, 0, 0)', 'a'), image = makeNode('rgb(255, 255, 255)', 'img');
  let children = [link, image], callback, disconnected = 0, scheduled;
  const document = { documentElement: root, defaultView: {
    getComputedStyle: node => ({ backgroundColor: node.style.getPropertyValue('background-color') || node.background,
      color: 'rgb(30, 30, 30)', webkitTextFillColor: 'rgb(30, 30, 30)', backgroundImage: 'none' }),
    MutationObserver: class { constructor(fn) { callback = fn; } disconnect() { disconnected++; } observe() {} },
    setTimeout: fn => { scheduled = fn; return 1; }, clearTimeout() { scheduled = undefined; },
  } };
  for (const node of [root, link, image]) node.ownerDocument = document;
  root.querySelectorAll = () => children;
  root.style.setProperty('background-color', 'rgb(255, 255, 255)', '');
  let restore = applySurfaces(root, ['Soften bright backgrounds'], { 'Soften bright backgrounds': 100 });
  assert.equal(root.style.getPropertyValue('background-color'), 'rgba(222, 218, 208, 1)');
  restore();
  assert.equal(root.style.getPropertyValue('background-color'), 'rgb(255, 255, 255)');
  assert.equal(root.style.getPropertyPriority('background-color'), '');
  restore = applySurfaces(root, ['Dark page theme'], {});
  assert.equal(root.style.getPropertyValue('background-color'), 'rgba(30, 34, 40, 1)');
  assert.equal(link.style.getPropertyValue('color'), '#9cc9ff');
  assert.equal(image.style.getPropertyValue('color'), '');
  const added = makeNode('rgb(255, 255, 255)');
  added.ownerDocument = document;
  children.push(added);
  callback(); scheduled();
  assert.equal(added.style.getPropertyValue('background-color'), 'rgba(30, 34, 40, 1)');
  link.style.setProperty('color', 'red', ''); // Preserve a site's later inline change.
  restore();
  assert.equal(link.style.getPropertyValue('color'), 'red');
  assert.equal(root.style.getPropertyValue('background-color'), 'rgb(255, 255, 255)');
  assert.equal(added.style.getPropertyValue('color'), '');
  assert.ok(disconnected > 0);
});
