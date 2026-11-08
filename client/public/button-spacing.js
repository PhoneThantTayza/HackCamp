// Clearspace - Extra button spacing
// When "Extra button spacing" is ON, one <style> tag adds clear space AROUND
// buttons, form controls and standalone links (menus, "hide | comments" rows),
// so a shaky hand is less likely to hit the neighbour by mistake.
// Links inside sentences are left alone so paragraphs keep their shape.
// Turning it OFF removes the tag and the link markers.
// This file is the only place that styles the "Extra button spacing" option.

(() => {
const storage = (globalThis.clearspacePreviewApi ?? globalThis.chrome)?.storage;
if (!storage?.local?.get || !storage?.onChanged?.addListener) {
  return { applied: false, error: "Extension storage is unavailable. Reload Clearspace and refresh this webpage." };
}
// Injected by both registerContentScripts and executeScript: run only once per frame.
if (globalThis.clearspaceButtonSpacingLoaded) return;
globalThis.clearspaceButtonSpacingLoaded = true;

const STYLE_ID = "clearspace-button-spacing-style";
const LINK_ATTR = "data-clearspace-spacing-link"; // "block" or "inline"

// ":root" makes these rules win over "Larger click targets" (which uses a
// smaller 4px margin) when both options are on.
const CSS = `
  :root :is(
    button, select, textarea,
    input:not([type=hidden]):not([type=checkbox]):not([type=radio]),
    [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox],
    a[${LINK_ATTR}]
  ) {
    margin: 10px !important; /* 20px of clear space between neighbours */
  }
  :root a[${LINK_ATTR}="inline"] {
    /* margins above/below do nothing on plain inline links */
    display: inline-block !important;
  }
  :root input:is([type=checkbox], [type=radio]) {
    margin: 10px 12px !important;
  }
  /* Menus and toolbars built from list items: space the items apart */
  :root :is(nav, [role=menu], [role=menubar], [role=tablist], [role=toolbar]) li {
    margin: 6px !important;
  }
`;

// ---------- standalone vs. in-text links ----------
// A link is "in text" only if a REAL WORD sits right next to it, like
// "read the <a>docs</a> first". Separators like " | ", "·", "(" don't count.
const INLINE_WRAPPERS = new Set(["SPAN", "STRONG", "B", "EM", "I", "U", "SMALL", "MARK", "CODE", "ABBR", "SUP", "SUB"]);
const HAS_WORD = /[\p{L}\p{N}]/u; // any letter or number, in any language

function neighbourHasWords(node) {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) return HAS_WORD.test(node.textContent);
  // A wrapper holding another link (like "(<a>site.com</a>)") is a neighbouring
  // target, not sentence text, so it doesn't count as words.
  if (node.nodeType === Node.ELEMENT_NODE && INLINE_WRAPPERS.has(node.tagName)) {
    return !node.querySelector("a[href]") && HAS_WORD.test(node.textContent);
  }
  return false;
}

function isInText(link) {
  let el = link;
  while (el && el.parentElement) {
    if (neighbourHasWords(el.previousSibling) || neighbourHasWords(el.nextSibling)) return true;
    if (!INLINE_WRAPPERS.has(el.parentElement.tagName)) return false;
    el = el.parentElement;
  }
  return false;
}

function markLinks() {
  document.querySelectorAll("a[href]").forEach((link) => {
    if (isInText(link)) {
      link.removeAttribute(LINK_ATTR);
    } else if (!link.hasAttribute(LINK_ATTR)) {
      const inline = getComputedStyle(link).display === "inline";
      link.setAttribute(LINK_ATTR, inline ? "inline" : "block");
    }
  });
}

function unmarkLinks() {
  document.querySelectorAll(`[${LINK_ATTR}]`).forEach((link) => link.removeAttribute(LINK_ATTR));
}

// ---------- keep up with new content ----------
let observer = null;
let pending = false;

function onPageChanged() {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    if (isOn) markLinks();
  }, 300);
}

// ---------- turn ON / OFF ----------
let isOn = false;

function turnOn() {
  if (isOn) return;
  isOn = true;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.documentElement.appendChild(style);
  }
  const start = () => {
    if (!isOn) return;
    markLinks();
    observer = new MutationObserver(onPageChanged);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

function turnOff() {
  if (!isOn) return;
  isOn = false;
  document.getElementById(STYLE_ID)?.remove();
  if (observer) observer.disconnect();
  observer = null;
  unmarkLinks();
}

// ---------- read the user's setting ----------
// Same shape the other scripts read: chrome.storage.local "settings" =
// { version: 1, enabled, selected: ["motor:Extra button spacing", ...] }
function wantsSpacing(settings) {
  if (!settings || settings.version !== 1 || !settings.enabled || !Array.isArray(settings.selected)) return false;
  return settings.selected.some((item) => typeof item === "string" && item.split(":")[1] === "Extra button spacing");
}

function apply(settings) {
  if (wantsSpacing(settings)) turnOn();
  else turnOff();
}

// Keep asynchronous storage failures out of Chrome's uncaught-error log and
// allow a later injection to retry startup instead of leaving a loaded flag.
const onStorageChange = (changes, area) => {
  if (area === "local" && changes.settings) apply(changes.settings.newValue);
};
return (async () => {
  try {
    storage.onChanged.addListener(onStorageChange);
    const { settings } = await storage.local.get("settings");
    apply(settings);
    return { applied: true };
  } catch (error) {
    try { storage.onChanged.removeListener?.(onStorageChange); } catch { /* Context may already be invalidated. */ }
    globalThis.clearspaceButtonSpacingLoaded = false;
    return { applied: false, error: error.message };
  }
})();
})();
