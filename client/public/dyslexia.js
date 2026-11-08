// Local reading tools: no copied HTML, word wrappers, or replacement of app nodes.
(() => {
  if (globalThis.clearspaceDyslexia?.version === 4) return;
  const fonts = { sans: 'Arial, Helvetica, sans-serif', serif: 'Georgia, serif', system: 'system-ui, sans-serif' };
  const presets = {
    distinguishWords: { font: 'sans', letterSpacing: 0.06, wordSpacing: 0.12, wordHighlight: true },
    overwhelmingParagraphs: { lineHeight: 1.8, lineLength: 60, paragraphSpacing: 0.9, alignStart: true },
    readingFatigue: { focusParagraph: true },
    losePlace: { guide: true },
  };
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  const limits = { letterSpacing: [0, 0.2], wordSpacing: [0, 0.5], lineHeight: [1, 2.5], lineLength: [30, 100],
    paragraphSpacing: [0, 2], guideSize: [20, 160], dimming: [0, 0.6], allTextContrast: [0, 1] };
  function suggest(preferences = {}, context = {}) {
    preferences = object(preferences); context = object(context);
    const choices = object(preferences.experiences);
    const result = { enabled: preferences.enabled !== false, font: null, letterSpacing: null, wordSpacing: null,
      lineHeight: null, lineLength: null, paragraphSpacing: null, alignStart: false, background: null, textColor: null,
      wordHighlight: false, focusParagraph: false, guide: false, guideColor: '#ffe58a', guideSize: 40, dimming: 0.15, allTextContrast: false };
    for (const [name, preset] of Object.entries(presets)) if (choices[name] === true) Object.assign(result, preset);
    const custom = object(preferences.customization);
    if (custom.font === null || (typeof custom.font === 'string' && Object.hasOwn(fonts, custom.font))) result.font = custom.font;
    for (const [key, [min, max]] of Object.entries(limits)) {
      if (typeof custom[key] === 'number' && Number.isFinite(custom[key])) result[key] = Math.min(max, Math.max(min, custom[key]));
    }
    if (color(custom.guideColor)) result.guideColor = custom.guideColor;
    for (const key of ['guide', 'alignStart', 'wordHighlight', 'focusParagraph', 'allTextContrast']) {
      const value = custom[key];
      if (typeof value === 'boolean') result[key] = value;
      else if (value === 'true') result[key] = true;
      else if (value === 'false') result[key] = false;
    }
    const warnings = [];
    if (context.extraLineSpacing === true) result.lineHeight = Math.max(1.8, result.lineHeight ?? 0);
    const needsSeparateEngine = [];
    if (choices.unfamiliarWords === true) needsSeparateEngine.push('wordExplanations');
    if (choices.writingDifficulty === true) needsSeparateEngine.push('spellingAndGrammar');
    if (choices.preferListening === true || choices.readingPace === true) needsSeparateEngine.push('speech');
    return { ...result, warnings, needsSeparateEngine };
  }
  const excluded = 'script,style,noscript,template,canvas,input,textarea,select,option,' +
    '[role="textbox"],[aria-hidden="true"],[hidden],iframe';
  const hasText = element => Array.from(element.childNodes).some(node => node.nodeType === 3 && /[\p{L}\p{N}]/u.test(node.data));
  // Avoid inherited typography changes in editors, fields and known icon glyphs.
  const protectedChildren = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[aria-hidden="true"],.icon,[class*="material-icons"],[class*="fa-"]';
  function createController(root = document) {
    if (!root || typeof root !== 'object' || ![9, 11].includes(root.nodeType) || !root.querySelectorAll) throw new TypeError('Expected a live Document or open ShadowRoot');
    const doc = root.nodeType === 9 ? root : root.ownerDocument, view = doc.defaultView;
    const token = `cs-reading-${Math.random().toString(36).slice(2)}`, attribute = `data-${token}`;
    const wordName = `${token}-word`, passageName = `${token}-passage`;
    const passageBackgrounds = new Map(); // highlight name -> bg hex
    const backgroundCache = new Map();    // text fill -> bg hex
    const toHex = rgb => '#' + rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('');
    const passageHighlights = new Map();
    let colorContext;
    const targets = new Set(), originals = new Map(), roots = new Map(), hosts = new Set();
    let settings, jobs = [], queued = new Set(), timer, poll, pointerFrame, overlay, overlayBody, line, outline;
    let active = false, guideDismissed = false, wordHighlight, latestPointer, hostCursor = 0;
    const listeners = [];
    const listen = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
    function safe(element) {
      if (!element || element.nodeType !== 1 || !['http://www.w3.org/1999/xhtml', 'http://www.w3.org/2000/svg', 'http://www.w3.org/1998/Math/MathML'].includes(element.namespaceURI)) return false;
      for (let current = element; current; current = current.parentElement ?? current.getRootNode().host) {
        if (current === overlay || current.matches(excluded) || current.isContentEditable ||
          (current.hasAttribute('contenteditable') && current.getAttribute('contenteditable') !== 'false')) return false;
      }
      return true;
    }
    function restoreInline(element) {
      const values = originals.get(element);
      if (!values) return;
      for (const [key, entry] of values) {
        if (element.style.getPropertyValue(key) === entry.applied && element.style.getPropertyPriority(key) === 'important') {
          if (entry.value) element.style.setProperty(key, entry.value, entry.priority);
          else element.style.removeProperty(key);
        }
      }
      originals.delete(element);
    }
    function unmark(element) {
      element.removeAttribute(attribute); targets.delete(element);
      roots.get(element.getRootNode())?.targets.delete(element); restoreInline(element);
    }
    function typography() {
      const rules = {};
      if (settings.font) rules['font-family'] = fonts[settings.font];
      if (settings.letterSpacing !== null) rules['letter-spacing'] = `${settings.letterSpacing}em`;
      if (settings.wordSpacing !== null) rules['word-spacing'] = `${settings.wordSpacing}em`;
      if (settings.lineHeight !== null) rules['line-height'] = String(settings.lineHeight);
      if (settings.alignStart) rules['text-align'] = 'start';
      return rules;
    }
    function cssFor() {
      // Owned marker, not a site class; specificity defeats ordinary framework rules.
      const target = `:is(#${token}#${token}#${token}, [${attribute}])`;
      const declarations = Object.entries(typography()).map(([key, value]) => `${key}:${value} !important`).join(';');
      let css = `${target} { ${declarations} }`;
      if (settings.lineLength !== null) css += `${target}[${attribute}="block"] { max-inline-size:${settings.lineLength}ch !important; }`;
      if (settings.paragraphSpacing !== null) css += `${target}[${attribute}="block"] { margin-block-end:${settings.paragraphSpacing}em !important; }`;
      if (settings.background) css += `${target}:not(a):not(a *) { background-color:${settings.background} !important; color:${settings.textColor} !important; }`;
      const passageRules = [...passageBackgrounds].map(([name, bg]) => `::highlight(${name}) { background-color:${bg}; }`).join('\n');
      return css + `::highlight(${wordName}) { background-color:#ffe58a; color:#171717; text-decoration:underline; }
        ${passageRules}`;
    }
    function addRoot(candidate) {
      if (roots.has(candidate) || !active) return;
      const entry = { targets: new Set() }; roots.set(candidate, entry);
      try {
        if (!view.CSSStyleSheet || !('adoptedStyleSheets' in candidate)) throw new Error('style fallback');
        entry.sheet = new view.CSSStyleSheet(); entry.sheet.replaceSync(cssFor());
        candidate.adoptedStyleSheets = [...candidate.adoptedStyleSheets, entry.sheet];
      } catch {
        entry.sheet = undefined;
        entry.style = doc.createElement('style'); entry.style.textContent = cssFor();
        (candidate.nodeType === 9 ? candidate.head ?? candidate.documentElement : candidate).append(entry.style);
      }
      entry.observer = new view.MutationObserver(records => {
        let refreshPassage = false;
        for (const record of records) {
          if (record.target === overlay || record.target === entry.style) continue;
          refreshPassage = true;
          if (record.type === 'childList') {
            for (const node of record.addedNodes) enqueue(node);
            for (const node of record.removedNodes) enqueue(node);
            enqueue(record.target, true);
          } else if (record.type === 'characterData') enqueue(record.target.parentElement, true);
          else if (record.attributeName === 'style' && originals.has(record.target)) {
            const values = originals.get(record.target);
            // Ignore our own inline fallback writes to prevent observer loops.
            if ([...values].some(([key, value]) => record.target.style.getPropertyValue(key) !== value.applied || record.target.style.getPropertyPriority(key) !== 'important')) enqueue(record.target, true);
          } else enqueue(record.target, record.attributeName === 'class' || record.attributeName === 'style');
        }
        // Another tool may change text colours while the pointer is stationary.
        if (refreshPassage && settings.focusParagraph && latestPointer && !pointerFrame) {
          pointerFrame = view.requestAnimationFrame(() => highlightAt(latestPointer));
        }
      });
      entry.observer.observe(candidate, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['style', 'class', 'role', 'hidden', 'aria-hidden', 'contenteditable'] });
      enqueue(candidate);
    }
    function enqueue(node, single = false) {
      if (!active || !node || node === overlay) return;
      if (node.nodeType === 3) node = node.parentElement;
      if (!node) return;
      if (queued.has(node)) {
        if (!single) { const pending = jobs.find(job => job.node === node); if (pending) pending.single = false; }
        return;
      }
      queued.add(node); jobs.push({ node, single, walker: null, started: false });
      if (!timer) timer = view.setTimeout(work, 16);
    }
    function process(element) {
      if (element.nodeType !== 1 || element === overlay || element.tagName === 'STYLE') return;
      if (!element.isConnected) {
        if (targets.has(element)) unmark(element);
        hosts.delete(element);
        if (element.shadowRoot && roots.has(element.shadowRoot)) removeRoot(element.shadowRoot);
        return;
      }
      if (element.shadowRoot) addRoot(element.shadowRoot);
      if (element.localName.includes('-')) hosts.add(element);
      if (!(Object.keys(typography()).length || settings.background || settings.lineLength !== null || settings.paragraphSpacing !== null)) return;
      if (!safe(element) || !hasText(element) || element.querySelector(protectedChildren)) {
        if (targets.has(element)) unmark(element); return;
      }
      if (!targets.has(element)) {
        const computed = view.getComputedStyle(element);
        if (/icon|awesome|material|symbol|glyph/i.test(computed.fontFamily) || computed.display === 'none' || computed.visibility === 'hidden') return;
        const paragraph = element.matches('p,blockquote,[role="paragraph"]') && computed.display === 'block' &&
          !/flex|grid|table/.test(view.getComputedStyle(element.parentElement ?? element).display) &&
          !element.style.height && !element.style.maxHeight;
        element.setAttribute(attribute, paragraph ? 'block' : 'text'); targets.add(element);
        roots.get(element.getRootNode())?.targets.add(element);
      } else if (!roots.get(element.getRootNode())?.targets.has(element)) {
        // Frameworks can move the same node between light DOM and shadow roots.
        for (const entry of roots.values()) entry.targets.delete(element);
        roots.get(element.getRootNode())?.targets.add(element);
      }
      // Stylesheets cannot defeat inline !important. Remember only conflicting properties.
      const rules = typography();
      if (settings.background && !element.closest('a')) Object.assign(rules, { 'background-color': settings.background, color: settings.textColor });
      let values = originals.get(element);
      for (const [key, value] of Object.entries(rules)) {
        const entry = values?.get(key);
        if (entry && element.style.getPropertyValue(key) === entry.applied && element.style.getPropertyPriority(key) === 'important') continue;
        if (element.style.getPropertyPriority(key) !== 'important' && !entry) continue;
        if (!values) { values = new Map(); originals.set(element, values); }
        const original = { value: element.style.getPropertyValue(key), priority: element.style.getPropertyPriority(key) };
        element.style.setProperty(key, value, 'important');
        values.set(key, { ...original, applied: element.style.getPropertyValue(key) });
      }
    }
    function work() {
      timer = undefined;
      if (!active) return;
      const start = view.performance.now(); let processed = 0;
      while (jobs.length && processed < 150 && view.performance.now() - start < 7) {
        const job = jobs[0];
        if (!job.started) { job.started = true; process(job.node); if (!job.single) job.walker = doc.createTreeWalker(job.node, 1); }
        const element = job.walker?.nextNode();
        if (element) process(element); else { jobs.shift(); queued.delete(job.node); }
        processed++;
      }
      if (jobs.length) timer = view.setTimeout(work, 16);
    }
    function removeRoot(candidate) {
      const entry = roots.get(candidate); if (!entry) return;
      entry.observer?.disconnect();
      if (entry.sheet) candidate.adoptedStyleSheets = candidate.adoptedStyleSheets.filter(item => item !== entry.sheet);
      entry.style?.remove();
      for (const element of [...entry.targets]) {
        if (element.isConnected && element.getRootNode() !== candidate && active) {
          roots.get(element.getRootNode())?.targets.add(element);
        } else unmark(element);
      }
      roots.delete(candidate);
    }
    function clearHighlights() {
      if (pointerFrame) view.cancelAnimationFrame(pointerFrame);
      pointerFrame = undefined;
      const registry = view.CSS?.highlights;
      if (wordHighlight && registry?.get(wordName) === wordHighlight) registry.delete(wordName);
      for (const [name, highlight] of passageHighlights) if (registry?.get(name) === highlight) registry.delete(name);
      passageHighlights.clear();
      wordHighlight = undefined;
      if (overlayBody) overlayBody.hidden = true;
    }
    function showOverlay() {
      if (overlay?.isConnected) return;
      overlay = doc.createElement('div'); overlay.setAttribute('aria-hidden', 'true');
      const shadow = overlay.attachShadow({ mode: 'closed' }), style = doc.createElement('style');
      // Toggle a child, not the host: important shadow host styles can lock host visibility.
      style.textContent = `:host { all:initial !important; position:fixed !important; inset:0 !important; pointer-events:none !important; z-index:2147483647 !important; }
        [hidden] { display:none !important; } .line { position:absolute; left:0; right:0; background:${settings.guideColor}33; box-shadow:0 0 0 100vmax rgb(0 0 0 / ${settings.dimming}); border-block:1px solid #3338; }
        .outline { position:absolute; box-sizing:border-box; border:2px solid #8a6500; background:#ffe58a22; border-radius:3px; }`;
      overlayBody = doc.createElement('div'); overlayBody.hidden = true;
      line = doc.createElement('div'); line.className = 'line'; outline = doc.createElement('div'); outline.className = 'outline';
      overlayBody.append(line, outline); shadow.append(style, overlayBody); doc.documentElement.append(overlay);
    }
    function showGuide(event, element) {
      if (!settings.guide || guideDismissed) return;
      showOverlay(); overlayBody.hidden = false; line.hidden = false; outline.hidden = true;
      const y = event.type === 'focusin' ? element.getBoundingClientRect().top : event.clientY;
      line.style.top = `${Math.max(0, y - settings.guideSize / 2)}px`;
      line.style.height = `${settings.guideSize}px`;
    }
    function syncPassageCss() {
      for (const entry of roots.values()) {
        if (entry.sheet) entry.sheet.replaceSync(cssFor());
        else if (entry.style) entry.style.textContent = cssFor();
      }
    }
    function channels(color) {
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = color; colorContext.fillRect(0, 0, 1, 1);
      return [...colorContext.getImageData(0, 0, 1, 1).data].slice(0, 3);
    }
    function luminance(rgb) {
      return rgb.map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    }
    function contrast(a, b) {
      const [x, y] = [luminance(a), luminance(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }
    function backgroundFor(fill, elementBg, isLink = false) {
      const cacheKey = fill + '|' + elementBg;
      if (backgroundCache.has(cacheKey)) return backgroundCache.get(cacheKey);
      const text = channels(fill);
      const bgColor = channels(elementBg);
      // Check if element has a meaningful (non-transparent) background.
      const hasRealBg = elementBg !== 'transparent' && elementBg !== 'rgba(0, 0, 0, 0)' &&
        !elementBg.startsWith('rgba(0, 0, 0, 0') && bgColor.some(c => c !== 0) &&
        !(elementBg === 'rgb(0, 0, 0)' && elementBg === 'transparent');
      // Detect blue-ish link colors (hue ~220-260, decent saturation)
      const [r, g, b] = text;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const isBlueLink = !isLink && b > r && b > g && b - Math.max(r, g) > 40 && saturation > 0.3;
      // Pure black for dark, cream for light.
      const cream = [255, 248, 235];
      const black = [0, 0, 0];
      // Build candidate bases: existing background (if real) + cream/black.
      const bases = [];
      if (hasRealBg) bases.push(bgColor);
      bases.push(cream, black);
      // Pick base that contrasts with BOTH text AND element background (if real).
      // For the existing bg, only check text contrast (it's already the background).
      let bestBase = bases[0];
      let bestScore = -1;
      for (const base of bases) {
        const textContrast = contrast(text, base);
        const bgContrast = hasRealBg && base !== bgColor ? contrast(bgColor, base) : Infinity;
        const score = Math.min(textContrast, bgContrast);
        if (score > bestScore) {
          bestScore = score;
          bestBase = base;
        }
      }
      // If existing background already provides good contrast (7:1), use it as-is.
      if (hasRealBg && bestBase === bgColor && contrast(text, bgColor) >= 7) {
        const hex = toHex(bgColor);
        backgroundCache.set(cacheKey, hex);
        return hex;
      }
      const extreme = bestBase === cream ? 255 : (bestBase === black ? 0 : null);
      let highlightBg = bestBase;
      // If we're using an existing bg as base, push toward cream or black for better contrast.
      if (hasRealBg && bestBase === bgColor) {
        // Pick direction: toward cream if text is dark, toward black if text is light.
        const textLum = luminance(text);
        extreme = textLum > 0.5 ? 0 : 255;
      }
      // Push toward extreme until contrast reaches 7:1 with text.
      if (extreme !== null) {
        for (let t = 0; t <= 1 && contrast(text, highlightBg) < 7; t += 0.05) {
          highlightBg = bestBase.map((channel, i) => {
            const target = extreme === 255 ? 255 : 0;
            return channel + (target - channel) * t;
          });
        }
      }
      // Snap to pure cream or pure black for consistency.
      if (highlightBg[0] > 200) highlightBg = cream;
      else highlightBg = black;
      const hex = toHex(highlightBg);
      backgroundCache.set(cacheKey, hex);
      return hex;
    }
    function paintPassage(passage) {
      if (!colorContext) {
        const canvas = doc.createElement('canvas'); canvas.width = canvas.height = 1;
        colorContext = canvas.getContext('2d', { willReadFrequently: true });
      }
      if (!colorContext) return;
      const groups = new Map();
      let dirty = false, text;
      const walker = doc.createTreeWalker(passage.commonAncestorContainer, 4);
      while ((text = walker.nextNode())) {
        if (!/\S/.test(text.data) || !safe(text.parentElement)) continue;
        const computed = view.getComputedStyle(text.parentElement);
        if (computed.visibility !== 'visible' || computed.display === 'none') continue;
        const isLink = text.parentElement.closest('a') !== null;
        const textColor = computed.webkitTextFillColor || computed.color;
        const elementBg = computed.backgroundColor;
        const bg = backgroundFor(textColor, elementBg, isLink);
        const name = `${passageName}-${bg.slice(1)}`;
        if (!passageBackgrounds.has(name)) { passageBackgrounds.set(name, bg); dirty = true; }
        if (!groups.has(name)) groups.set(name, new view.Highlight());
        const range = doc.createRange(); range.selectNodeContents(text); groups.get(name).add(range);
      }
      if (dirty) syncPassageCss();
      for (const [name, highlight] of groups) {
        passageHighlights.set(name, highlight); view.CSS.highlights.set(name, highlight);
      }
    }
    function paintAllText() {
      if (!settings.allTextContrast) return;
      const canHighlight = Boolean(view.CSS?.highlights && view.Highlight);
      if (!canHighlight) return;
      if (!colorContext) {
        const canvas = doc.createElement('canvas'); canvas.width = canvas.height = 1;
        colorContext = canvas.getContext('2d', { willReadFrequently: true });
      }
      if (!colorContext) return;
      const groups = new Map();
      let dirty = false, text;
      const walker = doc.createTreeWalker(doc, 4);
      while ((text = walker.nextNode())) {
        if (!/\S/.test(text.data) || !safe(text.parentElement)) continue;
        const computed = view.getComputedStyle(text.parentElement);
        if (computed.visibility !== 'visible' || computed.display === 'none') continue;
        const isLink = text.parentElement.closest('a') !== null;
        const textColor = computed.webkitTextFillColor || computed.color;
        const elementBg = computed.backgroundColor;
        const bg = backgroundFor(textColor, elementBg, isLink);
        const name = `${passageName}-${bg.slice(1)}`;
        if (!passageBackgrounds.has(name)) { passageBackgrounds.set(name, bg); dirty = true; }
        if (!groups.has(name)) groups.set(name, new view.Highlight());
        const range = doc.createRange(); range.selectNodeContents(text); groups.get(name).add(range);
      }
      if (dirty) syncPassageCss();
      for (const [name, highlight] of groups) {
        passageHighlights.set(name, highlight); view.CSS.highlights.set(name, highlight);
      }
    }
    function highlightAt(event) {
      pointerFrame = undefined;
      if (!active) return;
      clearHighlights();
      const path = event.composedPath?.() ?? [event.target];
      if (root.nodeType === 11 && !path.includes(root)) return;
      for (const candidate of path) {
        if (candidate?.nodeType === 11 && candidate.host) addRoot(candidate);
        else if (candidate?.shadowRoot) addRoot(candidate.shadowRoot);
      }
      const element = path.find(candidate => candidate?.nodeType === 1);
      // Native context menus can leave a selection behind; it must not hide the guide.
      if (doc.getSelection()?.isCollapsed === false) { if (element) showGuide(event, element); return; }
      // The pointer guide never edits its target, so it is safe over controls too.
      // Static text includes buttons, code, SVG and MathML text nodes.
      // Hover never changes Selection or sends speech messages.
      if (!safe(element)) { if (element) showGuide(event, element); return; }
      let node, offset = 0;
      if (event.type === 'focusin') node = doc.createTreeWalker(element, 4).nextNode();
      else {
        try {
          if (doc.caretPositionFromPoint) {
            const caret = doc.caretPositionFromPoint(event.clientX, event.clientY, { shadowRoots: [...roots.keys()].filter(item => item.nodeType === 11) });
            node = caret?.offsetNode; offset = caret?.offset ?? 0;
          } else {
            const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
            node = range?.startContainer; offset = range?.startOffset ?? 0;
          }
        } catch { /* Older engines can reject shadowRoots; the guide remains available. */ }
      }
      let range, passage;
      if (node?.nodeType === 3 && safe(node.parentElement)) {
        const hit = doc.createRange(); hit.selectNodeContents(node);
        const onText = event.type === 'focusin' || [...hit.getClientRects()].some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
        if (onText && /\S/.test(node.data)) {
          if (settings.wordHighlight) {
            const text = node.data; let start = Math.min(offset, text.length - 1), end = start;
            if (view.Intl?.Segmenter) {
              for (const part of new view.Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)) {
                if (part.index <= start && start < part.index + part.segment.length && part.isWordLike) { end = part.index + part.segment.length; start = part.index; break; }
              }
            } else { while (start > 0 && !/\s/.test(text[start - 1])) start--; while (end < text.length && !/\s/.test(text[end])) end++; }
            if (end > start) { range = doc.createRange(); range.setStart(node, start); range.setEnd(node, end); }
          }
        }
      }
      if (settings.focusParagraph) {
        // Keep the passage lit across line gaps and padding, rather than blinking
        // whenever the pointer slips off a letter while reading.
        const block = element.closest('p,li,blockquote,div,[role="paragraph"]') ?? element;
        if (safe(block) && /\S/.test(block.textContent) && block.textContent.length < 12000) {
          passage = doc.createRange(); passage.selectNodeContents(block);
        }
      }
      const canHighlight = Boolean(view.CSS?.highlights && view.Highlight);
      if (canHighlight) {
        if (passage) paintPassage(passage);
        if (range) { wordHighlight = new view.Highlight(range); wordHighlight.priority = 1; view.CSS.highlights.set(wordName, wordHighlight); }
      }
      const guideVisible = settings.guide && !guideDismissed;
      if (guideVisible || (!canHighlight && (range || passage))) {
        showOverlay(); overlayBody.hidden = false; line.hidden = !guideVisible; outline.hidden = true;
        if (guideVisible) showGuide(event, element);
        if (!canHighlight && (range || passage)) {
          const rect = (range ?? passage).getBoundingClientRect(); outline.hidden = false;
          Object.assign(outline.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        }
      }
    }
    function reset() {
      active = false;
      if (timer) view.clearTimeout(timer); if (poll) view.clearInterval(poll);
      if (pointerFrame) view.cancelAnimationFrame(pointerFrame);
      timer = poll = pointerFrame = undefined;
      listeners.splice(0).forEach(remove => remove());
      for (const candidate of [...roots.keys()]) removeRoot(candidate);
      for (const element of [...targets]) unmark(element);
      for (const element of [...originals.keys()]) restoreInline(element);
      clearHighlights(); overlay?.remove(); overlay = overlayBody = line = outline = undefined;
      jobs = []; queued.clear(); hosts.clear(); latestPointer = undefined;
    }
    function apply(preferences, context) {
      reset(); guideDismissed = false; settings = suggest(preferences, context);
      if (!settings.enabled) return settings;
      if (!(Object.keys(typography()).length || settings.background || settings.lineLength !== null || settings.paragraphSpacing !== null || settings.guide || settings.wordHighlight || settings.focusParagraph || settings.allTextContrast)) return settings;
      active = true; addRoot(root);
      if (settings.allTextContrast) paintAllText();
      poll = view.setInterval(() => {
        for (const [candidate, entry] of roots) {
          if (candidate.host && !candidate.host.isConnected) { removeRoot(candidate); continue; }
          if (entry.sheet && !candidate.adoptedStyleSheets.includes(entry.sheet)) candidate.adoptedStyleSheets = [...candidate.adoptedStyleSheets, entry.sheet];
          if (entry.style && !entry.style.isConnected) (candidate.nodeType === 9 ? candidate.head ?? candidate.documentElement : candidate).append(entry.style);
        }
        const candidates = [...hosts];
        for (let count = 0; count < Math.min(50, candidates.length); count++) {
          const host = candidates[hostCursor++ % candidates.length];
          if (!host.isConnected) hosts.delete(host); else if (host.shadowRoot) addRoot(host.shadowRoot);
        }
      }, 2000);
      if (settings.guide || settings.wordHighlight || settings.focusParagraph) {
        listen(doc, 'pointermove', event => {
          const path = event.composedPath();
          latestPointer = { type: event.type, target: event.target, clientX: event.clientX, clientY: event.clientY, composedPath: () => path };
          if (!pointerFrame) pointerFrame = view.requestAnimationFrame(() => highlightAt(latestPointer));
        }, { passive: true, capture: true });
        let toggledByPress = false;
        const toggleGuide = event => {
          if (!settings.guide) return;
          guideDismissed = !guideDismissed;
          clearHighlights();
          if (!guideDismissed) highlightAt(event);
        };
        // Window capture runs before document/target handlers used by editors
        // and custom menus. Toggle on the physical press, once per gesture.
        listen(view, 'pointerdown', event => {
          toggledByPress = false;
          if (!settings.guide || event.button !== 2 || event.pointerType === 'touch') return;
          toggledByPress = true;
          toggleGuide(event);
        }, { capture: true });
        listen(view, 'contextmenu', event => {
          if (!settings.guide || event.pointerType === 'touch') return;
          event.preventDefault();
          if (!toggledByPress) toggleGuide(event); // Keyboard context-menu key.
          toggledByPress = false;
        }, { capture: true });
        listen(doc, 'focusin', event => highlightAt(event)); listen(doc, 'pointerleave', clearHighlights);
        listen(doc, 'scroll', clearHighlights, { passive: true, capture: true }); listen(view, 'blur', clearHighlights);
        listen(doc, 'keydown', event => { if (event.key === 'Escape') clearHighlights(); });
      }
      return settings;
    }
    return { apply, update: apply, enable: apply, reset, disable: reset };
  }
  globalThis.clearspaceDyslexia = Object.freeze({ version: 4, suggest, createController });
})();