// Shared strength values keep the live samples and webpage effects in sync.
(() => {
  const options = ["Larger text and controls", "Higher contrast", "More visible links", "More visible keyboard focus"];
  const maxStrength = 200;
  function normalize(value) {
    return Object.fromEntries(options.map(option => [option, Number.isFinite(value?.[option]) ? Math.round(Math.max(0, Math.min(maxStrength, value[option]))) : 100]));
  }
  function metrics(strength) {
    const amount = Math.max(0, Math.min(maxStrength, strength)) / 100;
    const mix = (start, end) => Number((start + (end - start) * amount).toFixed(3));
    return {
      zoom: mix(1, 1.25), target: mix(24, 44), lineHeight: mix(1.2, 1.5),
      border: mix(1, 2), weight: Math.min(1000, mix(400, 700)), underline: mix(.05, .15), offset: mix(.05, .2),
      outline: mix(1, 4), ring: mix(2, 8),
    };
  }
  function rules(option, strength) {
    if (strength <= 0) return "";
    const m = metrics(strength);
    switch (option) {
      case options[0]: return `html { zoom: ${m.zoom} !important; }
        body :where(button, input:not([type="hidden"]), select, textarea, [role="button"]) { min-height: ${m.target}px !important; min-width: ${m.target}px !important; }
        body :where(p, li, blockquote, label) { line-height: ${m.lineHeight} !important; }`;
      case options[1]: {
        // Text contrast is measured against each element's existing surface by
        // applyContrast(). Never repaint backgrounds or remove page gradients.
        return "";
      }
      case options[2]: return `body :where(a[href], [role="link"]) { font-weight: ${m.weight} !important; text-decoration: underline !important; text-decoration-thickness: ${m.underline}em !important; text-underline-offset: ${m.offset}em !important; }
        body a[href] { color: #003c8f !important; background-color: #fff !important; }
        body a[href]:visited { color: #551a8b !important; }`;
      case options[3]: return `:focus-visible { outline: ${m.outline}px solid #000 !important; outline-offset: ${m.outline}px !important; box-shadow: 0 0 0 ${m.ring}px #fff !important; }`;
      default: return "";
    }
  }
  function parseColor(value) {
    const match = value?.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
    return match ? [...match.slice(1, 4).map(Number), match[4] === undefined ? 1 : Number(match[4])] : null;
  }
  const composite = (top, bottom) => top.slice(0, 3).map((c, i) => c * top[3] + bottom[i] * (1 - top[3]));
  const luminance = rgb => rgb.slice(0, 3).reduce((sum, c, i) => {
    const v = c / 255;
    return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
  function contrast(first, second) {
    const a = luminance(first), b = luminance(second);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  }
  const worstContrast = (foreground, backgrounds) => Math.min(...backgrounds.map(bg => contrast(composite(foreground, bg), bg)));
  const cssColor = color => color[3] < 1
    ? `rgba(${color.slice(0, 3).map(Math.round).join(", ")}, ${Number(color[3].toFixed(5))})`
    : `rgb(${color.slice(0, 3).map(Math.round).join(", ")})`;

  // Preserve compliant colours. Below 100%, move gradually from the original
  // ratio toward 4.5:1; 100–200% raises the goal to 7:1 where the surface permits.
  function improveText(foreground, backgrounds, strength) {
    if (!foreground || !backgrounds?.length || strength <= 0) return null;
    const original = worstContrast(foreground, backgrounds);
    const amount = Math.min(maxStrength, strength) / 100;
    const target = amount <= 1 ? original + Math.max(0, 4.5 - original) * amount : 4.5 + (amount - 1) * 2.5;
    if (original >= target - .001) return null;
    const endpoints = [[0, 0, 0, 1], [255, 255, 255, 1]];
    const maximum = Math.max(...endpoints.map(color => worstContrast(color, backgrounds)));
    const achievable = Math.min(target, maximum);
    if (achievable <= original + .01) return null;
    let best;
    for (const end of endpoints) {
      if (worstContrast(end, backgrounds) < achievable - .001) continue;
      let low = 0, high = 1;
      const mix = t => foreground.map((c, i) => c + (end[i] - c) * t);
      for (let i = 0; i < 24; i++) {
        const mid = (low + high) / 2;
        if (worstContrast(mix(mid), backgrounds) >= achievable) high = mid;
        else low = mid;
      }
      let candidate = parseColor(cssColor(mix(high)));
      // Account for rounding to CSS channel values without undershooting.
      while (high < 1 && worstContrast(candidate, backgrounds) < achievable) {
        high = Math.min(1, high + 1 / 255);
        candidate = parseColor(cssColor(mix(high)));
      }
      const distance = candidate.slice(0, 3).reduce((n, c, i) => n + (c - foreground[i]) ** 2, 0);
      if (worstContrast(candidate, backgrounds) > original && (!best || distance < best.distance)) best = { color: cssColor(candidate), distance };
    }
    return best?.color ?? null;
  }

  function applyContrast(root, strength) {
    if (!root || strength <= 0) return () => {};
    const view = root.ownerDocument.defaultView;
    const excluded = 'svg, img, video, canvas, picture, iframe, script, style, noscript, [hidden]';
    let originals = [];
    let timer;
    const restore = () => {
      for (const { node, property, value, priority, applied } of originals) {
        // Respect inline changes made by the website while assistance was on.
        if (node.style.getPropertyValue(property) !== applied || node.style.getPropertyPriority(property) !== 'important') continue;
        if (value) node.style.setProperty(property, value, priority);
        else node.style.removeProperty(property);
      }
      originals = [];
    };
    const write = (node, property, value) => {
      const previous = node.style.getPropertyValue(property), priority = node.style.getPropertyPriority(property);
      node.style.setProperty(property, value, 'important');
      originals.push({ node, property, value: previous, priority, applied: node.style.getPropertyValue(property) });
    };
    const schedule = () => {
      if (timer) return;
      timer = view.setTimeout(() => { timer = undefined; refresh(); }, 100);
    };
    const observer = new view.MutationObserver(schedule);
    function refresh() {
      observer.disconnect();
      restore();
      const styles = new WeakMap(), surfaces = new WeakMap(), composited = new WeakMap();
      const styleOf = node => {
        if (!styles.has(node)) styles.set(node, view.getComputedStyle(node));
        return styles.get(node);
      };
      const hasCompositing = node => {
        if (!node) return false;
        if (!composited.has(node)) {
          const style = styleOf(node);
          composited.set(node, Number(style.opacity) !== 1 || style.mixBlendMode !== 'normal'
            || (style.filter !== 'none' && !style.filter.includes('clearspace-colour-')) || hasCompositing(node.parentElement));
        }
        return composited.get(node);
      };
      function backgroundOf(node) {
        if (!node) return [[255, 255, 255]];
        if (surfaces.has(node)) return surfaces.get(node);
        const style = styleOf(node);
        const clipText = style.backgroundClip === 'text';
        const bg = clipText ? [0, 0, 0, 0] : parseColor(style.backgroundColor);
        let result = null;
        if (bg && Number(style.opacity) === 1 && style.filter === 'none' && style.mixBlendMode === 'normal' && style.backgroundBlendMode === 'normal') {
          // An opaque solid surface does not depend on layers behind it.
          const behind = bg[3] === 1 ? [[255, 255, 255]] : backgroundOf(node.parentElement);
          if (behind) {
            result = behind.map(base => composite(bg, base));
            if (!clipText && style.backgroundImage !== 'none') {
              const image = style.backgroundImage;
              // Only simple sRGB gradients with explicit rgb stops can be
              // estimated. Skip photos, repeating patterns and layered images.
              const stops = image.match(/rgba?\([^)]+\)/g)?.map(parseColor);
              if (/^(linear|radial)-gradient\(/.test(image) && (image.match(/gradient\(/g)?.length === 1) && stops?.length >= 2 && stops.every(Boolean) && !/\bin\s+|url\(/.test(image)) {
                const samples = stops.flatMap((stop, i) => i === 0 ? [stop] : [stops[i - 1].map((c, j) => (c + stop[j]) / 2), stop]);
                result = result.flatMap(base => samples.map(stop => composite(stop, base))).slice(0, 32);
              } else result = null;
            }
          }
        }
        surfaces.set(node, result);
        return result;
      }
      // Read before writing, so a parent's adjustment cannot distort the
      // measurements or unintentionally recolour a compliant nested link.
      const plans = [];
      for (const node of [root, ...root.querySelectorAll('*')]) {
        if (node.closest(excluded)) continue;
        const hasText = [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim());
        if (!hasText && !node.matches('input, textarea, select')) continue;
        const style = styleOf(node);
        if (style.display === 'none' || style.visibility !== 'visible' || hasCompositing(node)) continue;
        const foreground = parseColor(style.webkitTextFillColor || style.color);
        if (!foreground || foreground[3] === 0) continue; // Preserve gradient lettering.
        plans.push({ node, color: style.color, fill: style.webkitTextFillColor, adjusted: improveText(foreground, backgroundOf(node), strength) });
      }
      const changed = new Set(plans.filter(plan => plan.adjusted).map(plan => plan.node));
      for (const plan of plans) {
        let inherited = false;
        for (let parent = plan.node.parentElement; parent; parent = parent.parentElement) {
          if (changed.has(parent)) { inherited = true; break; }
        }
        if (!plan.adjusted && !inherited) continue;
        write(plan.node, 'color', plan.adjusted || plan.color);
        write(plan.node, '-webkit-text-fill-color', plan.adjusted || plan.fill || plan.color);
      }
      observer.observe(root === root.ownerDocument.body ? root.ownerDocument.documentElement : root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
    refresh();
    view.addEventListener('resize', schedule);
    return () => { observer.disconnect(); view.clearTimeout(timer); view.removeEventListener('resize', schedule); restore(); };
  }
  globalThis.clearspaceLowVision = { options, maxStrength, normalize, metrics, rules, parseColor, contrast, improveText, applyContrast };
})();
