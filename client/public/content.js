(() => {
  // Isolated-world guard prevents duplicate storage listeners on repeated Apply.
  if (globalThis.clearspaceApply) {
    chrome.storage.local.get("settings").then(({ settings }) => globalThis.clearspaceApply(settings));
    return;
  }
  let sheet;
  const rules = {
    "Larger text": "html { font-size: 125% !important; } body :where(p, li, input, textarea, button, label, td, th) { font-size: max(1.1rem, 18px) !important; }",
    "High contrast": "html, body, body :where(main, article, section, div, p, li, header, footer, nav, input, textarea, button, select) { background-color: #fff !important; color: #111 !important; } body a { color: #0033a0 !important; }",
    "Extra line spacing": "body :where(p, li, blockquote, input, textarea) { line-height: 1.8 !important; }",
    "Reduce motion": "*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }",
    "Underline links": "body a { text-decoration: underline !important; text-underline-offset: .15em !important; }",
    "Readable font": "body :where(p, li, a, h1, h2, h3, h4, h5, h6, button, input, textarea, label) { font-family: Arial, sans-serif !important; }",
    "Wider letter spacing": "body :where(p, li, a, h1, h2, h3, button, label) { letter-spacing: .08em !important; word-spacing: .12em !important; }",
    "Shorter lines": "body :where(p, blockquote) { max-width: 65ch !important; }",
    "Left-aligned text": "body :where(p, li, blockquote) { text-align: left !important; }",
    "Larger click targets": "body :where(button, input:not([type=checkbox]):not([type=radio]), select) { min-height: 44px !important; min-width: 44px !important; }",
    "Extra button spacing": "body button { margin: 6px !important; }",
    "Keyboard focus indicators": ":focus-visible { outline: 3px solid #005fcc !important; outline-offset: 3px !important; box-shadow: 0 0 0 6px #fff !important; }"
  };
  globalThis.clearspaceApply = settings => {
    if (sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(item => item !== sheet);
    sheet = undefined;
    if (!settings || settings.version !== 1 || !settings.enabled || !Array.isArray(settings.selected)) return;
    const names = new Set(settings.selected.filter(item => typeof item === "string").map(item => item.split(":")[1]));
    const css = [...names].map(name => rules[name] || "").join("\n");
    if (!css) return;
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) globalThis.clearspaceApply(changes.settings.newValue);
  });
  chrome.storage.local.get("settings").then(({ settings }) => globalThis.clearspaceApply(settings));
})();
