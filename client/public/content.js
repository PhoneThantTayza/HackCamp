(() => {
  const api = globalThis.clearspacePreviewApi ?? globalThis.chrome;
  const storage = api?.storage;
  const storageError = "Clearspace's extension storage is unavailable. Reload Clearspace in chrome://extensions, refresh this webpage, then change an adjustment to try again.";
  if (!storage?.local?.get || !storage?.onChanged?.addListener) return { applied: false, error: storageError };
  // Return an acknowledgement only after the stored settings reach the page.
  // Otherwise executeScript can succeed while this asynchronous work fails.
  const applySavedSettings = async () => {
    try {
      const { settings } = await storage.local.get("settings");
      await globalThis.clearspaceApply(settings);
      return { applied: true };
    } catch (error) {
      return { applied: false, error: error.message };
    }
  };
  // Reuse this revision on repeated Apply, but replace older page scripts so
  // newly added adjustments work on tabs that were already connected.
  const revision = "word-lookup-restored-5";
  const previousApply = globalThis.clearspaceApply;
  if (previousApply?.revision === revision) {
    return applySavedSettings();
  }
  // Register before creating the new apply function. A failed registration
  // must not leave a loaded marker that prevents the next injection retry.
  if (!previousApply) {
    try {
      storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.settings) globalThis.clearspaceApply(changes.settings.newValue);
      });
    } catch (error) {
      return { applied: false, error: error.message };
    }
  }
  // Let the previous closure remove its own effects before replacing it.
  previousApply?.({ version: 1, enabled: false, selected: [] });
  let sheet;
  let restoreFocus;
  const dyslexia = globalThis.clearspaceDyslexia?.createController(document);
  const speech = globalThis.clearspaceSelectionReader?.createController(document, api);
  const wordLookup = globalThis.clearspaceWordLookup?.createController(document, api);
  let restoreContrast;
  let restoreSurfaces;
  let filterSvg;
  // An identifier, not a security token; works on ordinary HTTP pages too.
  const filterId = `clearspace-colour-${Math.random().toString(36).slice(2)}`;
  const lowVisionOptions = new Set(["Larger text and controls", "Higher contrast", "More visible links", "More visible keyboard focus"]);
  const rules = {
    "Reduce motion": "*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }",
    "Readable font": "body :where(p, li, a, h1, h2, h3, h4, h5, h6, button, input, textarea, label) { font-family: Arial, sans-serif !important; }",
    "Wider letter spacing": "body :where(p, li, a, h1, h2, h3, button, label) { letter-spacing: .08em !important; word-spacing: .12em !important; }",
    "Shorter lines": "body :where(p, blockquote) { max-width: 65ch !important; }",
    "Left-aligned text": "body :where(p, li, blockquote) { text-align: left !important; }",
    "Keyboard focus indicators": ":focus-visible { outline: 3px solid #005fcc !important; outline-offset: 3px !important; box-shadow: 0 0 0 6px #fff !important; }"
  };
  // Match whole ad tokens and their conventional separators. A bare substring
  // such as [class*="ad"] would also hide headers, downloads and padding utilities.
  const adSelectors = [
    ...["ad", "ads", "advert", "adverts", "advertisement", "advertisements", "advertising", "adslot", "adunit"].flatMap(token => [
      `.${token}`, `#${token}`,
      ...["-", "_"].flatMap(separator => [
        `[id^="${token}${separator}" i]`, `[id$="${separator}${token}" i]`, `[id*="${separator}${token}${separator}" i]`,
        `[class^="${token}${separator}" i]`, `[class*=" ${token}${separator}" i]`,
        `[class$="${separator}${token}" i]`, `[class*="${separator}${token} " i]`, `[class*="${separator}${token}${separator}" i]`,
      ]),
    ]),
    "[data-ad-slot]", "[data-ad-client]", "[data-ad-unit]", "[data-ad-unit-id]", "[data-advertisement]", "[data-google-query-id]",
    "ins.adsbygoogle", '[id^="google_ads_iframe"]', '[id^="div-gpt-ad"]',
    ".sponsored-content", ".sponsored-post", ".promoted-content", ".promoted-post",
    '[aria-label="Advertisement" i]', '[aria-label="Advertisements" i]', '[aria-label="Ads" i]',
    'iframe[title="Advertisement" i]', 'iframe[title="Advertising" i]',
    ...["doubleclick.net/", "googlesyndication.com/", "googleadservices.com/", "amazon-adsystem.com/", "adnxs.com/"].map(host => `iframe[src*="${host}" i]`),
    '[id^="taboola-"]', '[class~="OUTBRAIN"]', '[data-widget-id][data-ob-template]',
  ];
  globalThis.clearspaceApply = settings => {
    restoreFocus?.();
    restoreFocus = undefined;
    restoreContrast?.();
    restoreContrast = undefined;
    restoreSurfaces?.();
    restoreSurfaces = undefined;
    if (sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(item => item !== sheet);
    sheet = undefined;
    dyslexia?.reset();
    speech?.update(settings);
    wordLookup?.update(settings);
    filterSvg?.remove();
    filterSvg = undefined;
    if (!settings || settings.version !== 1 || !settings.enabled || !Array.isArray(settings.selected)) return;
    const names = new Set(settings.selected.filter(item => typeof item === "string" && (!item.startsWith("vision:") || (lowVisionOptions.has(item.slice(7)) || globalThis.clearspaceLightSensitivity.options.includes(item.slice(7))))).map(item => item.split(":")[1]));
    // Apply low-vision rules last so their stronger link/focus cues win in combinations.
    let css = [...names].filter(name => !lowVisionOptions.has(name)).map(name => rules[name] || "").join("\n");
    if (settings.selected.includes("cognitive:Hide distractions")) {
      // Ad rules apply throughout the page, including inside articles and dialogs.
      // CSS also covers ads inserted later without changing the site's DOM.
      // Never hide a primary-content container that happens to have an ad token,
      // or a video player: YouTube marks its own player "ad-created" once its
      // ad system loads, even when no ad is playing.
      const keep = `main, [role="main"], video, iframe[src*="youtube.com/embed" i], iframe[src*="youtube-nocookie.com/embed" i], iframe[src*="player.vimeo.com" i]`;
      css += `\nbody :is(${adSelectors.join(",\n")}):not(${keep}):not(:has(${keep})) { display: none !important; }`;
      // For general clutter, also preserve containers holding forms or dialogs.
      css += `\nbody :is(
        aside, [role="complementary"],
        #sidebar, .sidebar, #left-sidebar, #right-sidebar, .left-sidebar, .right-sidebar,
        #secondary, .widget-area,
        #related-posts, .related-posts, .related-articles, .recommended-posts,
        .social-share, .share-buttons, .sharing-buttons
      ):not(main, [role="main"], form, dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]):not(:has(main, [role="main"], form, dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"])) { display: none !important; }`;
    }
    const lightOptions = [...names].filter(name => globalThis.clearspaceLightSensitivity.options.includes(name));
    const pageFilters = [];
    const lightFilters = globalThis.clearspaceLightSensitivity.filters(lightOptions, settings.lightSensitivity);
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
      pageFilters.push(`url(${JSON.stringify(filterUrl.href)})`);
    }
    if (lightFilters) pageFilters.push(lightFilters);
    if (pageFilters.length) css += `\nhtml { filter: ${pageFilters.join(" ")} !important; }`;
    if (lightOptions.includes("Dark page theme")) css += "\nhtml { color-scheme: dark !important; }";
    if (colour.cues) {
      css += `\nbody a { text-decoration: underline !important; text-underline-offset: .15em !important; }\n${rules["Keyboard focus indicators"]}
        body :where(button, input, select, textarea) { border: 2px solid currentColor !important; }
        body :where([aria-invalid="true"]) { outline: 3px dashed currentColor !important; outline-offset: 3px !important; }`;
    }
    const strengths = globalThis.clearspaceLowVision.normalize(settings.lowVision);
    css += [...lowVisionOptions].filter(name => names.has(name)).map(name => globalThis.clearspaceLowVision.rules(name, strengths[name])).filter(Boolean).map(rule => `\n${rule}`).join("");
    if (css) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }
    if (settings.selected.includes("cognitive:Focus mode")) restoreFocus = globalThis.clearspaceFocusMode.apply(document, settings.focusMode);
    if (settings.dyslexia) dyslexia?.apply(settings.dyslexia, {
      highContrast: names.has("High contrast"), extraLineSpacing: names.has("Extra line spacing")
    });
    restoreSurfaces = globalThis.clearspaceLightSensitivity.applySurfaces(document.documentElement, lightOptions, settings.lightSensitivity);
    if (names.has("Higher contrast")) restoreContrast = globalThis.clearspaceLowVision.applyContrast(document.body, strengths["Higher contrast"]);
  };
  globalThis.clearspaceApply.version = 9;
  globalThis.clearspaceApply.revision = revision;
  return applySavedSettings();
})();
