(() => {
  const clamp = (value, fallback, min, max) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  function normalize(value) {
    return { height: clamp(value?.height, 120, 40, 320), dimming: clamp(value?.dimming, 60, 0, 90) };
  }
  function background(value, center) {
    const { height, dimming } = normalize(value);
    const top = Math.max(0, center - height / 2);
    const bottom = Math.max(0, center + height / 2);
    const shade = `rgba(0, 0, 0, ${dimming / 100})`;
    return `linear-gradient(to bottom, ${shade} 0px, ${shade} ${top}px, transparent ${top}px, transparent ${bottom}px, ${shade} ${bottom}px)`;
  }
  function apply(document, value) {
    const settings = normalize(value);
    if (!settings.dimming) return;
    const view = document.defaultView;
    const host = document.createElement("div");
    host.setAttribute("data-clearspace-focus", "");
    // A manual popover escapes page filters. Cancel the root's CSS zoom
    // so the reading band stays aligned with viewport coordinates.
    host.setAttribute("popover", "manual");
    host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;margin:0!important;border:0!important;padding:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;pointer-events:none!important;z-index:2147483647!important;background:transparent!important;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = ":host::backdrop { background: transparent !important; pointer-events: none !important; } ";
    const shade = document.createElement("div");
    shade.setAttribute("aria-hidden", "true");
    shade.style.cssText = "position:absolute;inset:0;pointer-events:none;";
    shadow.append(style, shade);
    let active = false;
    let center = view.innerHeight / 2;
    function setActive(value) {
      active = value;
      shade.style.display = active ? "block" : "none";
      paint();
    }
    function contextMenu(event) {
      event.preventDefault();
      if (Number.isFinite(event.clientY)) center = event.clientY;
      setActive(!active);
    }
    function paint() { shade.style.background = background(settings, center); }
    function move(event) { if (active) { center = event.clientY; paint(); } }
    function focus(event) {
      if (!active || event.target === host) return;
      const rect = event.target.getBoundingClientRect();
      center = Math.max(0, Math.min(view.innerHeight, rect.top + rect.height / 2));
      paint();
    }
    function resize() {
      const zoom = Number.parseFloat(view.getComputedStyle(document.documentElement).zoom) || 1;
      host.style.setProperty("zoom", String(1 / zoom), "important");
      center = Math.min(center, view.innerHeight);
      paint();
    }
    function key(event) { if (event.key === "Escape") setActive(false); }
    let removed = false;
    function cleanup() {
      if (removed) return;
      removed = true;
      document.removeEventListener("contextmenu", contextMenu, true);
      host.remove();
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("keydown", key, true);
      view.removeEventListener("resize", resize);
    }
    setActive(false);
    document.addEventListener("contextmenu", contextMenu, true);
    document.documentElement.append(host);
    resize();
    if (typeof host.showPopover === "function") host.showPopover();
    document.addEventListener("pointermove", move, { capture: true, passive: true });
    document.addEventListener("focusin", focus, true);
    document.addEventListener("keydown", key, true);
    view.addEventListener("resize", resize);
    return cleanup;
  }
  globalThis.clearspaceFocusMode = { normalize, background, apply };
})();
