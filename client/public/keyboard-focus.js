// Clearspace - Keyboard focus indicators
// When "Keyboard focus indicators" is ON:
//   1. whatever has keyboard focus gets a thick blue + white + dark ring that is
//      visible on light AND dark websites, even if the site hides focus rings
//   2. the focused element is scrolled clear of sticky headers/footers
//   3. a "Skip to main content" link appears on the first Tab press; it jumps
//      past menus and side panels, even on sites without a <main> area (YouTube)
// Turning it OFF removes all of it.
// content.js keeps a smaller focus rule (also used by colour-vision cues);
// the ":root" rules here are stronger, so this ring wins when both are on.

(() => {
const storage = (globalThis.clearspacePreviewApi ?? globalThis.chrome)?.storage;
if (!storage?.local?.get || !storage?.onChanged?.addListener) {
  return { applied: false, error: "Extension storage is unavailable. Reload Clearspace and refresh this webpage." };
}
// Injected by both registerContentScripts and executeScript: run only once per frame.
if (globalThis.clearspaceKeyboardFocusLoaded) return;
globalThis.clearspaceKeyboardFocusLoaded = true;

const STYLE_ID = "clearspace-keyboard-focus-style";
const SKIP_ID = "clearspace-skip-link";
const TABINDEX_ATTR = "data-clearspace-added-tabindex"; // marks tabindex WE added

const CSS = `
  /* 1. Thick two-colour ring around whatever has keyboard focus */
  :root :focus-visible {
    outline: 4px solid #1a5fff !important;
    outline-offset: 3px !important;
    box-shadow: 0 0 0 7px #ffffff, 0 0 0 10px #111111 !important;
  }
  /* 2. Keep the focused element clear of sticky headers and footers */
  :root :focus {
    scroll-margin-block: 120px !important;
  }
  /* 3. Skip link: off-screen until it gets keyboard focus */
  :root #${SKIP_ID} {
    position: fixed !important;
    top: 12px !important;
    left: 12px !important;
    z-index: 2147483647 !important;
    transform: translateY(-300%) !important;
    padding: 14px 20px !important;
    background: #111111 !important;
    color: #ffffff !important;
    font: 600 18px/1.2 system-ui, sans-serif !important;
    border-radius: 8px !important;
    text-decoration: underline !important;
  }
  :root #${SKIP_ID}:focus {
    transform: none !important;
  }
`;

// ---------- skip link ----------
// Where should "Skip to main content" jump?
//   1. a proper <main> / role=main / <article> if the site has one (Wikipedia, news sites)
//   2. otherwise the first link or button that is NOT part of a menu, header or
//      side panel (e.g. YouTube: past the top bar and side menu, straight to the videos)
const NAV_REGION = "nav, header, aside, [role=navigation], [role=banner], [role=complementary], [role=search]";
// Common names sites give their menus, as words inside ids, classes or custom tag names
const NAV_WORDS = /(^|[-_\s])(guide|sidebar|side-bar|sidenav|nav|navbar|navigation|menu|masthead|header|drawer)([-_\s]|$)/i;
const FOCUSABLE = "a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex='-1'])";

function isInMenu(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.matches(NAV_REGION)) return true;
    const names = `${node.id} ${node.getAttribute("class") || ""} ${node.tagName}`;
    if (NAV_WORDS.test(names)) return true;
  }
  return false;
}

function isShown(el) {
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function findSkipTarget() {
  const landmark = document.querySelector("main, [role=main]") || document.querySelector("article");
  if (landmark) return landmark;
  for (const el of document.querySelectorAll(FOCUSABLE)) {
    if (el.id === SKIP_ID) continue;
    if (isShown(el) && !isInMenu(el)) return el; // first real content item
  }
  return document.querySelector("h1");
}

function addSkipLink() {
  if (document.getElementById(SKIP_ID) || !document.body) return;

  const link = document.createElement("a");
  link.id = SKIP_ID;
  link.href = "#";
  link.textContent = "Skip to main content";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    // Look it up now, not earlier: sites like YouTube change pages without reloading
    const target = findSkipTarget();
    if (!target) return;
    // Things like <main> can't take focus by default; allow it (and remember we did)
    if (!target.matches(FOCUSABLE) && !target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
      target.setAttribute(TABINDEX_ATTR, "");
    }
    target.focus();
    target.scrollIntoView({ block: "center" });
  });
  document.body.prepend(link); // first thing the Tab key reaches
}

function removeSkipLink() {
  document.getElementById(SKIP_ID)?.remove();
  document.querySelectorAll(`[${TABINDEX_ATTR}]`).forEach((el) => {
    el.removeAttribute("tabindex");
    el.removeAttribute(TABINDEX_ATTR);
  });
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
  const start = () => { if (isOn) addSkipLink(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

function turnOff() {
  if (!isOn) return;
  isOn = false;
  document.getElementById(STYLE_ID)?.remove();
  removeSkipLink();
}

// ---------- read the user's setting ----------
// Same shape the other scripts read: chrome.storage.local "settings" =
// { version: 1, enabled, selected: ["motor:Keyboard focus indicators", ...] }
function wantsFocus(settings) {
  if (!settings || settings.version !== 1 || !settings.enabled || !Array.isArray(settings.selected)) return false;
  return settings.selected.some((item) => typeof item === "string" && item.split(":")[1] === "Keyboard focus indicators");
}

function apply(settings) {
  if (wantsFocus(settings)) turnOn();
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
    globalThis.clearspaceKeyboardFocusLoaded = false;
    return { applied: false, error: error.message };
  }
})();
})();
