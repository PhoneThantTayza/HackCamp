// A11yFix - Motion accessibility
// When "Reduce motion" is ON, this calms the page down:
//   1. stops CSS animations and transitions
//   2. turns off smooth scrolling
//   3. stops videos from playing by themselves (you can still press play)
//   4. freezes animated GIFs
//   5. pauses JavaScript animations and <marquee> scrolling text
// The Motor slider picks how much of this runs (settings.motor.motion):
//   Gentle = 1 + 2 · Calm = also 3 + 5 · Still = everything (default)
// Turning it OFF puts everything back.

(() => {
const storage = globalThis.chrome?.storage;
if (!storage?.local?.get || !storage?.onChanged?.addListener) {
  return { applied: false, error: "Extension storage is unavailable. Reload Clearspace and refresh this webpage." };
}
// Injected by both registerContentScripts and executeScript: run only once per frame.
if (globalThis.a11yfixMotionLoaded) return;
globalThis.a11yfixMotionLoaded = true;

const STYLE_ID = "a11yfix-motion-style";

// 1 Gentle, 2 Calm, 3 Still - same thresholds as motor-levels.js (keep them in sync)
let level = 3;
function readLevel(settings) {
  const value = Number(settings?.motor?.motion);
  if (!Number.isFinite(value)) return 3;
  return value < 34 ? 1 : value < 67 ? 2 : 3;
}

// ---------- 1 + 2: CSS that stops animations, transitions and smooth scroll ----------
const BASE_CSS = `
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    animation-delay: 0s !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
`;
const GIF_CSS = `
  /* Hide moving images the INSTANT they appear, so they never visibly move.
     The frozen still picture (a canvas) is shown in their place. */
  img[src*=".gif"], img[src*="an_webp"] {
    visibility: hidden !important;
  }
`;

function addMotionStyle() {
  if (document.getElementById(STYLE_ID)) return; // already added
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = level >= 3 ? BASE_CSS + GIF_CSS : BASE_CSS; // GIF hiding only at Still
  document.documentElement.appendChild(style);
}

function removeMotionStyle() {
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}

// ---------- 3: stop videos playing by themselves ----------
// Browsers only let videos autoplay if they are MUTED.
// So: a muted video that starts by itself = autoplay (hover previews, ads,
// background videos) -> we pause it.
// A video playing WITH SOUND, or one the user just clicked -> leave it alone.
let lastUserAction = 0;
const userStartedVideos = new WeakSet(); // videos the user chose to play

function rememberUserAction() {
  lastUserAction = Date.now();
}

function hasSound(video) {
  return !video.muted && video.volume > 0;
}

function onVideoPlay(event) {
  const video = event.target;
  if (!(video instanceof HTMLMediaElement)) return;
  if (userStartedVideos.has(video)) return; // user chose this one
  if (hasSound(video)) return; // playing with sound = the user wanted it

  const userJustActed = Date.now() - lastUserAction < 1000; // within the last second
  if (userJustActed) {
    userStartedVideos.add(video); // e.g. user pressed play on a muted video
  } else {
    video.pause(); // muted + nobody asked = autoplay
  }
}

// When a video element loads a NEW video (YouTube reuses the same player),
// forget the old choice so the new one is judged fresh
function onVideoLoad(event) {
  if (event.target instanceof HTMLMediaElement) userStartedVideos.delete(event.target);
}

function pauseAutoplayVideos() {
  document.querySelectorAll("video").forEach((video) => {
    if (userStartedVideos.has(video) || hasSound(video)) return; // leave the user's videos alone
    video.autoplay = false;
    if (!video.paused) video.pause();
  });
}

// ---------- 4: freeze animated GIFs (and YouTube's moving thumbnails) ----------
// We draw the current frame onto a <canvas> (a still picture), hide the GIF,
// and show the canvas in its place. Turning off swaps them back.
function isGif(img) {
  const src = img.currentSrc || img.src;
  // .gif files, plus YouTube's animated thumbnails (their address contains "an_webp")
  return /\.gif($|\?)/i.test(src) || /an_webp/i.test(src);
}

function freezeGif(img) {
  const src = img.currentSrc || img.src;
  if (img.dataset.a11yfixFrozen === src) return; // already frozen with this picture
  if (img.dataset.a11yfixFrozen) unfreezeGif(img); // site swapped the picture: start over
  if (!img.complete || img.naturalWidth === 0) {
    if (!img.dataset.a11yfixWaiting) {
      img.dataset.a11yfixWaiting = "true";
      img.addEventListener("load", () => {
        delete img.dataset.a11yfixWaiting;
        if (isOn && isGif(img)) freezeGif(img); // try again once loaded
      }, { once: true });
    }
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return; // very rare: no canvas support
  ctx.drawImage(img, 0, 0); // copy the current frame = a still picture
  canvas.className = img.className; // keep the same look
  canvas.style.cssText = img.style.cssText;
  canvas.style.width = img.offsetWidth + "px";
  canvas.style.height = img.offsetHeight + "px";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", img.alt || "");
  canvas.dataset.a11yfixCanvas = "true";

  img.dataset.a11yfixFrozen = src; // remember WHICH picture we froze
  img.dataset.a11yfixDisplay = img.style.display;
  img.style.display = "none";
  img.after(canvas);
}

function unfreezeGif(img) {
  const next = img.nextElementSibling;
  if (next && next.dataset.a11yfixCanvas) next.remove(); // remove its still picture
  img.style.display = img.dataset.a11yfixDisplay || "";
  delete img.dataset.a11yfixFrozen;
  delete img.dataset.a11yfixDisplay;
}

function freezeAllGifs() {
  document.querySelectorAll("img").forEach((img) => {
    if (isGif(img)) freezeGif(img);
    else if (img.dataset.a11yfixFrozen) unfreezeGif(img); // picture is no longer moving
  });
}

function unfreezeAllGifs() {
  document.querySelectorAll("img[data-a11yfix-frozen]").forEach(unfreezeGif);
  document.querySelectorAll("canvas[data-a11yfix-canvas]").forEach((canvas) => canvas.remove());
}

// ---------- 5: JavaScript animations + <marquee> ----------
// CSS rules can't stop animations started by JavaScript, so we pause those directly.
let pausedAnimations = [];

function pauseScriptAnimations() {
  if (!document.getAnimations) return;
  document.getAnimations().forEach((animation) => {
    // CSS ones are already handled by our CSS; only pause the JavaScript ones
    const isCssOne = animation instanceof CSSAnimation || animation instanceof CSSTransition;
    if (!isCssOne && animation.playState === "running") {
      animation.pause();
      pausedAnimations.push(animation);
    }
  });
  document.querySelectorAll("marquee").forEach((m) => m.stop());
}

function resumeScriptAnimations() {
  pausedAnimations.forEach((animation) => animation.play());
  pausedAnimations = [];
  document.querySelectorAll("marquee").forEach((m) => m.start());
}

// ---------- keep up with new content ----------
// Many sites add things after loading (infinite scroll, pop-ups, ads).
// A MutationObserver tells us when the page changes, so we can calm new things too.
let observer = null;
let pending = false;

function onPageChanged() {
  if (pending) return; // don't run hundreds of times a second
  pending = true;
  setTimeout(() => {
    pending = false;
    if (level >= 2) { pauseAutoplayVideos(); pauseScriptAnimations(); }
    if (level >= 3) freezeAllGifs();
  }, 300);
}

// ---------- turn everything ON / OFF ----------
let isOn = false;

function turnOn() {
  if (isOn) return;
  isOn = true;
  addMotionStyle();
  if (level >= 2) { // Calm and Still also stop videos playing by themselves
    document.documentElement.dataset.a11yfixReduceMotion = "on"; // tells motion-main.js
    document.addEventListener("pointerdown", rememberUserAction, true);
    document.addEventListener("keydown", rememberUserAction, true);
    document.addEventListener("play", onVideoPlay, true); // "true" catches it for every video on the page
    document.addEventListener("loadstart", onVideoLoad, true);
  }

  const start = () => {
    if (level >= 2) { pauseAutoplayVideos(); pauseScriptAnimations(); }
    if (level >= 3) freezeAllGifs();
    observer = new MutationObserver(onPageChanged);
    // watch for new things AND for pictures being swapped (src changes)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  };
  // The page might still be loading; wait for it if needed
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

function turnOff() {
  if (!isOn) return;
  isOn = false;
  delete document.documentElement.dataset.a11yfixReduceMotion; // tells motion-main.js
  removeMotionStyle();
  document.removeEventListener("pointerdown", rememberUserAction, true);
  document.removeEventListener("keydown", rememberUserAction, true);
  document.removeEventListener("play", onVideoPlay, true);
  document.removeEventListener("loadstart", onVideoLoad, true);
  if (observer) observer.disconnect();
  observer = null;
  unfreezeAllGifs();
  resumeScriptAnimations();
  // Videos stay paused on purpose: suddenly starting them again would be jarring
}

// ---------- read the user's setting ----------
// Clearspace saves { version: 1, enabled, selected: ["motor:Reduce motion", ...] }
// under "settings" in chrome.storage.local. Any section's "Reduce motion" counts,
// matching how content.js reads the same settings.
function wantsReduceMotion(settings) {
  if (!settings || settings.version !== 1 || !settings.enabled || !Array.isArray(settings.selected)) return false;
  return settings.selected.some((item) => typeof item === "string" && item.split(":")[1] === "Reduce motion");
}

function apply(settings) {
  const newLevel = readLevel(settings);
  if (isOn && newLevel !== level) turnOff(); // slider moved: restart at the new level
  level = newLevel;
  if (wantsReduceMotion(settings)) turnOn();
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
    globalThis.a11yfixMotionLoaded = false;
    return { applied: false, error: error.message };
  }
})();
})();
