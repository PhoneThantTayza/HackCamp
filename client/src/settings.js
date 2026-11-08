export const unsupported = new Set(["Reading guide", "Simplified layout", "Hide distractions", "Clear headings", "Shorter paragraphs"]);
export const defaults = { version: 1, enabled: true, selected: [], light: false };
export const isExtension = Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.storage);
export async function loadSettings() {
  const saved = isExtension ? (await chrome.storage.local.get("settings")).settings : JSON.parse(localStorage.getItem("clearspace-demo") || "null");
  return { ...defaults, ...saved, selected: Array.isArray(saved?.selected) ? saved.selected.filter(item => typeof item === "string" && !unsupported.has(item.split(":")[1])) : [] };
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
    await chrome.scripting.executeScript({ target: { tabId: Number(value) }, files: ["content.js"] });
    // Reduce motion + click targets add-ons; failures here must not affect the content.js result above.
    await Promise.allSettled([
      chrome.scripting.executeScript({ target: { tabId: Number(value) }, files: ["motion-main.js"], world: "MAIN" }),
      chrome.scripting.executeScript({ target: { tabId: Number(value) }, files: ["motion.js"] }),
      chrome.scripting.executeScript({ target: { tabId: Number(value) }, files: ["click-targets.js"] })
    ]);
    return "Settings saved and sent to the original tab. Already connected tabs also receive updates.";
  } catch {
    throw new Error("Settings saved, but that tab could not be adjusted. It may be closed, restricted, or need permission. Click the extension icon on a regular webpage and try again.");
  }
}
