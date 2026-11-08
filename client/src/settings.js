import { emptyDyslexia, restoreDyslexia } from "./dyslexia-settings.js";

export const unsupported = new Set(["Reading guide", "Simplified layout", "Hide distractions", "Clear headings", "Shorter paragraphs"]);
export const defaults = { version: 1, enabled: true, selected: [], light: false, dyslexia: emptyDyslexia() };
export const isExtension = Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.storage);
export async function loadSettings() {
  const saved = isExtension ? (await chrome.storage.local.get("settings")).settings : JSON.parse(localStorage.getItem("clearspace-demo") || "null");
  const selected = Array.isArray(saved?.selected) ? saved.selected.filter(item => typeof item === "string") : [];
  return { ...defaults, ...saved, dyslexia: restoreDyslexia({ ...saved, selected }), selected: selected.filter(item => !item.startsWith("dyslexia:") && !unsupported.has(item.split(":")[1])) };
}
export async function saveSettings(settings) {
  if (isExtension) await chrome.storage.local.set({ settings });
  else localStorage.setItem("clearspace-demo", JSON.stringify(settings));
}
export async function applyToTarget() {
  if (!isExtension) return "Demo settings saved. Webpages are not changed in Vite.";
  const value = new URLSearchParams(location.search).get("tab");
  if (!value || !/^\d+$/.test(value)) return "Settings saved. Click the extension icon on a webpage to apply there, or enable automatic site access.";
  try {
    // Main-frame success is reported separately from best-effort permitted frame support.
    await chrome.scripting.executeScript({ target: { tabId: Number(value) }, files: ["dyslexia.js", "selection-reader.js", "content.js"] });
    try {
      await chrome.scripting.executeScript({ target: { tabId: Number(value), allFrames: true }, files: ["dyslexia.js", "selection-reader.js", "content.js"] });
      return "Settings saved and sent to the original tab and accessible frames. Already connected pages also receive updates.";
    } catch {
      return "Settings saved and sent to the original page. Some embedded frames could not be adjusted; they may need separate site permission.";
    }
  } catch {
    throw new Error("Settings saved, but that tab could not be adjusted. It may be closed, restricted, or need permission. Click the extension icon on a regular webpage and try again.");
  }
}
