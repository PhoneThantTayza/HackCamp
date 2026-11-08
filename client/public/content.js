(() => {
  // Return an acknowledgement only after the stored settings reach the page.
  // Otherwise executeScript can succeed while this asynchronous work fails.
  const applySavedSettings = () => chrome.storage.local.get("settings")
    .then(({ settings }) => {
      globalThis.clearspaceApply(settings);
      return { applied: true };
    })
    .catch(error => ({ applied: false, error: error.message }));
  // Isolated-world guard prevents duplicate storage listeners on repeated Apply.
  if (globalThis.clearspaceApply) {
    return applySavedSettings();
  }
  let sheet;
  let filterSvg;
  // An identifier, not a security token; works on ordinary HTTP pages too.
  const filterId = `clearspace-colour-${Math.random().toString(36).slice(2)}`;
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
    "Keyboard focus indicators": ":focus-visible { outline: 3px solid #005fcc !important; outline-offset: 3px !important; box-shadow: 0 0 0 6px #fff !important; }"
  };
  globalThis.clearspaceApply = settings => {
    if (sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(item => item !== sheet);
    sheet = undefined;
    filterSvg?.remove();
    filterSvg = undefined;
    if (!settings || settings.version !== 1 || !settings.enabled || !Array.isArray(settings.selected)) return;
    const names = new Set(settings.selected.filter(item => typeof item === "string").map(item => item.split(":")[1]));
    let css = [...names].map(name => rules[name] || "").join("\n");
    const colour = globalThis.clearspaceColorVision.normalize(settings.colorVision);
    if (colour.mode !== "off" && colour.strength > 0) {
      const ns = "http://www.w3.org/2000/svg";
      filterSvg = document.createElementNS(ns, "svg");
      filterSvg.setAttribute("aria-hidden", "true");
      filterSvg.setAttribute("width", "0");
      filterSvg.setAttribute("height", "0");
      filterSvg.style.cssText = "position:absolute;pointer-events:none;overflow:hidden";
      const filter = document.createElementNS(ns, "filter");
      filter.setAttribute("id", filterId);
      filter.setAttribute("color-interpolation-filters", "sRGB");
      const matrix = document.createElementNS(ns, "feColorMatrix");
      matrix.setAttribute("type", "matrix");
      matrix.setAttribute("values", globalThis.clearspaceColorVision.matrix(colour));
      filter.append(matrix);
      filterSvg.append(filter);
      document.documentElement.append(filterSvg);
      // Anchor to this document even on websites with a different <base href>.
      const filterUrl = new URL(document.URL);
      filterUrl.hash = filterId;
      css += `\nhtml { filter: url(${JSON.stringify(filterUrl.href)}) !important; }`;
    }
    if (colour.cues) {
      css += `\n${rules["Underline links"]}\n${rules["Keyboard focus indicators"]}
        body :where(button, input, select, textarea) { border: 2px solid currentColor !important; }
        body :where([aria-invalid="true"]) { outline: 3px dashed currentColor !important; outline-offset: 3px !important; }`;
    }
    if (!css) return;
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) globalThis.clearspaceApply(changes.settings.newValue);
  });
  return applySavedSettings();
})();
