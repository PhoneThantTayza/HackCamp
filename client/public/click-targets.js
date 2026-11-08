// Clearspace - Larger click targets
// When "Larger click targets" is ON, one <style> tag makes controls at least
// 44x44px (WCAG 2.5.5), enlarges checkboxes/radios to ~24px and pads small
// icon buttons. Links inside running text are left alone so paragraphs don't
// break apart; only standalone links (menus, "Read more", icon links) grow.
// Turning it OFF removes the tag and the link markers.
// content.js has a smaller rule for the same option; the two agree (44px minimum).

(() => {
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
    min-width: 44px !important;
    min-height: 44px !important;
    padding: max(6px, 0.4em) max(10px, 0.6em) !important;
    box-sizing: border-box !important;
  }
  a[${LINK_ATTR}="inline"] {
    /* min-height does nothing on inline elements */
    display: inline-flex !important;
    align-items: center !important;
  }
  input[type=checkbox], input[type=radio] {
    width: 24px !important;
    height: 24px !important;
    min-width: 24px !important;
    min-height: 24px !important;
    margin: 10px !important; /* 24px box + margin = 44px target */
  }
  /* Small icon buttons: a single icon and no text */
  :is(button, [role=button], a[${LINK_ATTR}]):has(> :is(svg, img, i, span:empty):only-child) {
    padding: 10px !important;
    min-width: 44px !important;
    min-height: 44px !important;
  }
`;

// ---------- standalone vs. in-text links ----------
const INLINE_WRAPPERS = new Set(["SPAN", "STRONG", "B", "EM", "I", "U", "SMALL", "MARK", "CODE", "ABBR", "SUP", "SUB"]);

function hasTextAround(el) {
  for (const node of el.parentNode ? el.parentNode.childNodes : []) {
    if (node === el) continue;
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return true;
    if (node.nodeType === Node.ELEMENT_NODE && INLINE_WRAPPERS.has(node.tagName) && node.textContent.trim()) return true;
  }
  return false;
}

function isInText(link) {
  // Walk up through inline wrappers (<strong><a>…</a></strong>) looking for words next to us.
  let el = link;
  while (el && el.parentElement) {
    if (hasTextAround(el)) return true;
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

chrome.storage.local.get("settings").then(({ settings }) => apply(settings));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) apply(changes.settings.newValue);
});
})();
