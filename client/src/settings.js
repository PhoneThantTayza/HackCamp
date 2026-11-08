export const unsupported = new Set(["Reading guide", "Simplified layout", "Hide distractions", "Clear headings", "Shorter paragraphs"]);
import "../public/color-vision.js";
export const colorVision = globalThis.clearspaceColorVision;
export const defaults = { version: 1, enabled: true, selected: [], light: false, colorVision: colorVision.normalize() };
export const isExtension = Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.storage);
export async function loadSettings() {
  const saved = isExtension ? (await chrome.storage.local.get("settings")).settings : JSON.parse(localStorage.getItem("clearspace-demo") || "null");
  return { ...defaults, ...saved, colorVision: colorVision.normalize(saved?.colorVision), selected: Array.isArray(saved?.selected) ? saved.selected.filter(item => typeof item === "string" && !unsupported.has(item.split(":")[1])) : [] };
}
export async function saveSettings(settings) {
  if (isExtension) await chrome.storage.local.set({ settings });
  else localStorage.setItem("clearspace-demo", JSON.stringify(settings));
}
export async function applyToTarget() {
  if (!isExtension) return "Demo settings saved. Webpages are not changed in Vite.";
  const value = new URLSearchParams(location.search).get("tab");
  const targetId = value && /^\d+$/.test(value) ? Number(value) : null;
  const automatic = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
  const tabs = automatic ? await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }) : [];
  const targetIds = new Set(tabs.map(tab => tab.id));
  if (targetId !== null) targetIds.add(targetId);
  if (!targetIds.size) {
    if (automatic) return "Settings saved. Open a website to use your adjustments automatically.";
    throw new Error("Settings saved, but no website is connected. Open the website you want to adjust, click the Clearspace toolbar icon, then Save and apply. Or select Allow site access here to apply automatically.");
  }
  const results = await Promise.allSettled([...targetIds].map(async tabId => {
    const frames = await chrome.scripting.executeScript({ target: { tabId }, files: ["color-vision.js", "content.js"] });
    if (!frames.some(frame => frame.frameId === 0 && frame.result?.applied === true)) {
      throw new Error("The webpage did not confirm that adjustments were applied. Reload the extension and refresh the webpage, then try again.");
    }
  }));
  const count = results.filter(result => result.status === "fulfilled").length;
  const primary = targetId === null ? null : results[[...targetIds].indexOf(targetId)];
  try {
    if (primary?.status === "rejected") throw primary.reason;
    if (!count) throw new Error("No website confirmed the adjustments.");
    return `Settings saved and applied to ${count} website tab${count === 1 ? "" : "s"}.`;
  } catch {
    throw new Error("Settings saved, but the webpage could not be adjusted. Reload Clearspace in chrome://extensions and refresh the webpage, then click its Clearspace toolbar icon and try again. Browser settings and protected pages cannot be adjusted.");
  }
}
