import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Run with CHROME_BIN pointing to Chrome/Chromium to test actual CSS matching.
test("distraction hiding covers ads throughout a page and restores original content", { skip: !process.env.CHROME_BIN }, () => {
  const directory = mkdtempSync(join(tmpdir(), "clearspace-ads-"));
  try {
    const scripts = ["color-vision.js", "low-vision.js", "light-sensitivity.js", "content.js"]
      .map(file => readFileSync(`client/public/${file}`, "utf8"));
    const fixture = `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <header id="header">Header <div id="ad-banner">Banner ad</div></header>
      <main id="article"><h1>Article</h1><p id="reading">Keep this text.</p>
        <div id="inline" class="article-ad">Inline ad</div>
        <div id="multi" class="card ad-container active">Ad with multiple classes</div>
        <div id="middle" class="card article-ad-slot active">Ad slot</div>
        <div id="data" data-ad-slot="123">AdSense slot</div>
        <ins id="adsense" class="adsbygoogle">AdSense</ins>
        <div id="sponsor" class="sponsored-content">Sponsored card</div>
        <iframe id="embed" title="Advertisement" src="about:blank"></iframe>
        <iframe id="network" src="about:blank"></iframe>
        <div id="label" aria-label="Advertisement">Labelled ad</div>
        <p id="shadow" class="shadow">Shadow utility</p>
        <p id="download" class="download">Download</p>
        <p id="padding" class="padding">Padding</p>
        <iframe id="video" title="Article video" src="about:blank"></iframe>
      </main>
      <div id="sticky" class="sticky_ad">Sticky ad</div>
      <div id="popup" class="ad-popup" role="dialog"><form>Ad signup</form></div>
      <aside id="sidebar">Sidebar</aside>
      <aside id="useful"><form>Search</form></aside>
      <div id="protected" class="ad-wrapper"><main>Primary content</main></div>
      <main id="primary" class="ad-container">Primary content</main>
      <pre id="test-results"></pre>
      <script>
      (async () => {
        const report = document.getElementById("test-results");
        try {
          const settings = { version: 1, enabled: true, selected: ["cognitive:Hide distractions"] };
          const listeners = [];
          globalThis.chrome = { storage: {
            local: { get: async () => ({ settings }) },
            onChanged: { addListener: listener => listeners.push(listener) }
          } };
          ${scripts.slice(0, 3).join("\n")}
          const result = await ${scripts[3]};
          if (!result.applied) throw new Error(result.error);
          const assertDisplay = (id, hidden) => {
            if ((getComputedStyle(document.getElementById(id)).display === "none") !== hidden)
              throw new Error(id + (hidden ? " should be hidden" : " should remain visible"));
          };
          // Set the source without loading a remote ad in this offline fixture.
          const network = document.getElementById("network");
          network.setAttribute("loading", "lazy");
          network.setAttribute("src", "https://ads.doubleclick.net/example");
          const hidden = ["ad-banner", "inline", "multi", "middle", "data", "adsense", "sponsor", "embed", "network", "label", "sticky", "popup", "sidebar"];
          const visible = ["header", "article", "reading", "shadow", "download", "padding", "video", "useful", "protected", "primary"];
          hidden.forEach(id => assertDisplay(id, true));
          visible.forEach(id => assertDisplay(id, false));
          const late = document.createElement("div");
          late.id = "late"; late.className = "content advertisement-banner loaded";
          document.getElementById("article").append(late);
          assertDisplay("late", true);
          hidden.push("late");
          // Repeat injection and verify that only one listener/sheet is retained.
          await ${scripts[3]};
          if (listeners.length !== 1 || document.adoptedStyleSheets.length !== 1)
            throw new Error("Repeated apply duplicated listeners or styles");
          const change = update => listeners[0]({ settings: { newValue: { ...settings, ...update } } }, "local");
          for (const update of [{ selected: [] }, { enabled: false }]) {
            change(update);
            hidden.forEach(id => assertDisplay(id, false));
            change({});
            hidden.forEach(id => assertDisplay(id, true));
          }
          report.textContent = JSON.stringify({ passed: true, hidden: hidden.length, preserved: visible.length });
        } catch (error) { report.textContent = JSON.stringify({ error: error.message }); }
      })();
      </script></body></html>`;
    const page = join(directory, "fixture.html");
    writeFileSync(page, fixture);
    const output = execFileSync(process.env.CHROME_BIN, [
      "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND",
      `--user-data-dir=${join(directory, "profile")}`, "--dump-dom", pathToFileURL(page).href,
    ], { encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    const result = output.match(/<pre id="test-results">(.*?)<\/pre>/s)?.[1];
    assert.ok(result, "Browser should report fixture results");
    assert.deepEqual(JSON.parse(result), { passed: true, hidden: 14, preserved: 10 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
