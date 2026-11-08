// Shared controls and rendering for previews and webpages.
(() => {
  const options = ["Dim page", "Soften bright backgrounds", "Warm colour tint", "Dark page theme"];
  const defaults = { "Dim page": 35, "Soften bright backgrounds": 50, "Warm colour tint": 40 };
  function normalize(value) {
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key,
      Number.isFinite(value?.[key]) ? Math.round(Math.max(0, Math.min(100, value[key]))) : fallback]));
  }
  function filters(selected, value) {
    const strengths = normalize(value), result = [];
    if (selected.includes(options[0]) && strengths[options[0]] > 0) result.push(`brightness(${1 - strengths[options[0]] / 200})`);
    if (selected.includes(options[2]) && strengths[options[2]] > 0) {
      const amount = strengths[options[2]] / 100;
      result.push(`sepia(${amount * .35})`, `saturate(${1 + amount * .2})`);
    }
    return result.join(' ');
  }
  function surface(color, strength, dark) {
    if (!color || color[3] === 0) return null;
    if (dark) return `rgba(30, 34, 40, ${color[3]})`;
    const channels = color.slice(0, 3);
    // Only soften bright, nearly neutral surfaces; keep coloured indicators.
    if (Math.min(...channels) < 220 || Math.max(...channels) - Math.min(...channels) > 25 || strength <= 0) return null;
    const target = [222, 218, 208];
    return `rgba(${channels.map((c, i) => Math.round(c + (target[i] - c) * strength / 100)).join(', ')}, ${color[3]})`;
  }
  function applySurfaces(root, selected, value) {
    const dark = selected.includes(options[3]);
    const strength = selected.includes(options[1]) ? normalize(value)[options[1]] : 0;
    if (!root || (!dark && strength === 0)) return () => {};
    const view = root.ownerDocument.defaultView;
    const { parseColor, improveText } = globalThis.clearspaceLowVision;
    let originals = [], timer;
    const restore = () => {
      for (const { node, property, value, priority, applied } of [...originals].reverse()) {
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
      const plans = [root, ...root.querySelectorAll('*')].filter(node => !node.closest('svg, img, video, canvas, picture, iframe, script, style, noscript')).map(node => {
        const style = view.getComputedStyle(node);
        return { node, background: surface(parseColor(style.backgroundColor), strength, dark), image: style.backgroundImage,
          color: style.color, fill: style.webkitTextFillColor };
      });
      // Set a canvas colour as well, covering pages with transparent bodies.
      if (root === root.ownerDocument.documentElement) {
        const canvas = parseColor(view.getComputedStyle(root).backgroundColor);
        const body = root.ownerDocument.body;
        const bodyColor = body && parseColor(view.getComputedStyle(body).backgroundColor);
        if (dark || (canvas?.[3] === 0 && (!bodyColor || bodyColor[3] === 0))) {
          write(root, 'background-color', dark ? '#1e2228' : surface([255, 255, 255, 1], strength, false));
        }
      }
      for (const { node, background, image, color, fill } of plans) {
        if (background) write(node, 'background-color', background);
        if (dark) {
          if (image?.includes('gradient(')) write(node, 'background-image', 'none');
          const foreground = node.matches('a[href], [role="link"]') ? '#9cc9ff' : '#e6e8eb';
          // Keep transparent text fills used for gradient lettering visible.
          write(node, 'color', foreground);
          write(node, '-webkit-text-fill-color', foreground);
          write(node, 'border-color', '#69717e');
        } else if (background) {
          const adjusted = improveText(parseColor(fill || color), [parseColor(background)], 100);
          if (adjusted) { write(node, 'color', adjusted); write(node, '-webkit-text-fill-color', adjusted); }
        }
      }
      // Ignore style writes from other assistance features to avoid observer loops.
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    refresh();
    return () => { observer.disconnect(); view.clearTimeout(timer); restore(); };
  }
  globalThis.clearspaceLightSensitivity = { options, normalize, filters, surface, applySurfaces };
})();
