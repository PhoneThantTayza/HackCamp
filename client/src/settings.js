export const unsupported = new Set(["Reading guide", "Simplified layout", "Hide distractions", "Clear headings", "Shorter paragraphs"]);
import "../public/color-vision.js";
import "../public/low-vision.js";
export const lowVision = globalThis.clearspaceLowVision;
export const colorVision = globalThis.clearspaceColorVision;
export const lowVisionOptions = lowVision.options;
export const defaults = { version: 1, enabled: true, selected: [], light: false, colorVision: colorVision.normalize(), lowVision: lowVision.normalize() };
export const isExtension = Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.storage);
export async function loadSettings() {
  const saved = isExtension ? (await chrome.storage.local.get("settings")).settings : JSON.parse(localStorage.getItem("clearspace-demo") || "null");
  return { ...defaults, ...saved, colorVision: colorVision.normalize(saved?.colorVision), lowVision: lowVision.normalize(saved?.lowVision), selected: Array.isArray(saved?.selected) ? saved.selected.filter(item => typeof item === "string" && (!item.startsWith("vision:") || lowVisionOptions.some(option => item === `vision:${option}`)) && !unsupported.has(item.split(":")[1])) : [] };
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
    const injected = await chrome.scripting.executeScript({ target: { tabId }, files: ["color-vision.js", "low-vision.js", "content.js"] });
    const main = injected.find(frame => frame.frameId === 0);
    // Verify explicitly instead of relying on the completion value of a batch
    // of script files. Pin verification to the injected document if available.
    const frames = await chrome.scripting.executeScript({
      target: main?.documentId ? { tabId, documentIds: [main.documentId] } : { tabId },
      func: async () => {
        try {
          if (typeof globalThis.clearspaceApply !== "function") {
            throw new Error("Clearspace's page script did not start. Rebuild the extension and reload its card in chrome://extensions.");
          }
          const { settings } = await chrome.storage.local.get("settings");
          globalThis.clearspaceApply(settings);
          return { applied: true };
        } catch (error) {
          return { applied: false, error: error.message };
        }
      },
    });
    if (!frames.some(frame => frame.frameId === 0 && frame.result?.applied === true)) {
      throw new Error(frames.find(frame => frame.frameId === 0)?.result?.error || "The webpage did not confirm the adjustments. It may have navigated or closed; click Clearspace on the webpage again.");
    }
  }));
  const count = results.filter(result => result.status === "fulfilled").length;
  const primary = targetId === null ? null : results[[...targetIds].indexOf(targetId)];
  const isProtected = result => result?.status === "rejected" && /Cannot access a chrome|extensions gallery cannot be scripted|Cannot access.*(?:chrome:\/\/|chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i.test(result.reason?.message || String(result.reason));
  const protectedHelp = "Chrome protects this page from adjustments. Open a regular http or https website, click the Clearspace toolbar icon there, then select Save and apply.";
  try {
    if (isProtected(primary) || (!count && results.every(isProtected))) {
      if (count) return `Settings saved and applied to ${count} website tab${count === 1 ? "" : "s"}. ${protectedHelp}`;
      return `Settings saved. ${protectedHelp}`;
    }
    if (primary?.status === "rejected") throw primary.reason;
    if (!count) throw results.find(result => result.status === "rejected")?.reason || new Error("No website confirmed the adjustments.");
    return `Settings saved and applied to ${count} website tab${count === 1 ? "" : "s"}.`;
  } catch (error) {
    const reason = error?.message || String(error);
    let help = "";
    if (/No tab with id|No document with id|Frame.*removed/i.test(reason)) {
      help = " Open the webpage and click its Clearspace toolbar icon to reconnect it.";
    } else if (/chrome:\/\/|extensions gallery|webstore|Cannot access a chrome/i.test(reason)) {
      help = " Chrome protects this page. Try a regular http or https webpage.";
    } else if (/Cannot access|permission|not allowed/i.test(reason)) {
      help = " Click Clearspace's toolbar icon on the target webpage to grant access, or enable Allow automatic adjustments on websites. For local files, enable Allow access to file URLs in Chrome's extension Details.";
    }
    throw new Error(`Settings saved, but the webpage could not be adjusted. ${reason}${help}`);
  }
}
