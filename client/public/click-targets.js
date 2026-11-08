// Clearspace - Larger click targets
// When "Larger click targets" is ON, one <style> tag makes controls at least
// 56x56px (well above WCAG 2.5.5 44px) with a small gap between them, enlarges
// checkboxes/radios to 32px, pads small icon buttons, draws a soft box around
// link targets and highlights the one under the mouse. Standalone links (menus,
// "Read more", icon links) grow like buttons; links inside running text only get
// extra padding so paragraphs don't break apart.
// Turning it OFF removes the tag and the link markers.
// This file is the only place that styles the "Larger click targets" option.

(() => {
const storage = globalThis.chrome?.storage;
if (!storage?.local?.get || !storage?.onChanged?.addListener) {
  return { applied: false, error: "Extension storage is unavailable. Reload Clearspace and refresh this webpage." };
}
// Injected by both registerContentScripts and executeScript: run only once per frame.
if (globalThis.clearspaceClickTargetsLoaded) return;
globalThis.clearspaceClickTargetsLoaded = true;

const STYLE_ID = "clearspace-click-targets-style";
const LINK_ATTR = "data-clearspace-target-link"; // "block" or "inline"

const CSS = `
  button, select, textarea,
  input:not([type=hidden]):not([type=checkbox]):not([type=radio]),
  [role=button], [role=link], [role=checkbox], [role=tab], [role=menuitem],
  a[${LINK_ATTR}] {
    min-width: 56px !important;
    min-height: 56px !important;
    padding: max(14px, 0.8em) max(20px, 1.1em) !important;
    margin: 4px !important; /* gap between neighbouring targets */
    font-size: max(1em, 16px) !important;
    box-sizing: border-box !important;
  }
  a[${LINK_ATTR}="inline"] {
    /* min-height does nothing on inline elements */
    display: inline-flex !important;
    align-items: center !important;
  }
  /* Links inside running text: grow the hit area with padding, which doesn't
     move the surrounding words around */
  a[href]:not([${LINK_ATTR}]) {
    padding: 0.25em 0.15em !important;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  input[type=checkbox], input[type=radio] {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    margin: 12px !important; /* 32px box + margin = 56px target */
  }
  /* Small icon buttons: a single icon and no text */
  :is(button, [role=button], a[${LINK_ATTR}]):has(> :is(svg, img, i, span:empty):only-child) {
    padding: 16px !important;
    min-width: 56px !important;
    min-height: 56px !important;
  }
  /* Show WHERE you can click: a soft rounded box around each link target.
     Skipped while keyboard-focused so the focus indicator stays visible. */
  :is(a[${LINK_ATTR}], [role=link], [role=tab], [role=menuitem]):not(:focus-visible) {
    border-radius: 10px !important;
    outline: 2px solid color-mix(in srgb, currentColor 35%, transparent) !important;
    outline-offset: -2px !important;
  }
  /* Highlight the target under the mouse, so you know what you'll hit */
  :is(a[href], [role=link], [role=tab], [role=menuitem]):hover {
    background-color: color-mix(in srgb, currentColor 16%, transparent) !important;
    border-radius: 10px !important;
  }
`;

// ---------- standalone vs. in-text links ----------
// A link is "in text" only if a REAL WORD sits right next to it, like
// "read the <a>docs</a> first". Separators like " | ", "·", "(" don't count,
// so menus such as "hide | 96 comments" still get bigger.
const INLINE_WRAPPERS = new Set(["SPAN", "STRONG", "B", "EM", "I", "U", "SMALL", "MARK", "CODE", "ABBR", "SUP", "SUB"]);
const HAS_WORD = /[\p{L}\p{N}]/u; // any letter or number, in any language

function neighbourHasWords(node) {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) return HAS_WORD.test(node.textContent);
  // A wrapper that holds another link (like "(<a>site.com</a>)") is a neighbouring
  // target, not sentence text, so it doesn't count as words.
  if (node.nodeType === Node.ELEMENT_NODE && INLINE_WRAPPERS.has(node.tagName)) {
    return !node.querySelector("a[href]") && HAS_WORD.test(node.textContent);
  }
  return false;
}

function isInText(link) {
  // Check the things directly before and after the link (walking out of
  // wrappers like <strong><a>…</a></strong>) for real words.
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
// Same shape content.js and motion.js read: chrome.storage.local "settings" =
// { version: 1, enabled, selected: ["motor:Larger click targets", ...] }
function wantsLargerTargets(settings) {
  if (!settings || settings.version !== 1 || !settings.enabled || !Array.isArray(settings.selected)) return false;
  return settings.selected.some((item) => typeof item === "string" && item.split(":")[1] === "Larger click targets");
}

function apply(settings) {
  if (wantsLargerTargets(settings)) turnOn();
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
    globalThis.clearspaceClickTargetsLoaded = false;
    return { applied: false, error: error.message };
  }
})();
})();
