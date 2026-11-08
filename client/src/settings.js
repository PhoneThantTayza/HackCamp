import "../public/focus-mode.js";
export const focusMode = globalThis.clearspaceFocusMode;
import { emptyDyslexia, restoreDyslexia } from "./dyslexia-settings.js";

import "../public/color-vision.js";
import "../public/low-vision.js";
import "../public/light-sensitivity.js";
import "../public/dyslexia.js";
import "../public/motor-levels.js";
export const lightSensitivity = globalThis.clearspaceLightSensitivity;
export const lightSensitivityOptions = lightSensitivity.options;
export const lowVision = globalThis.clearspaceLowVision;
export const colorVision = globalThis.clearspaceColorVision;
export const lowVisionOptions = lowVision.options;
export const dyslexia = globalThis.clearspaceDyslexia;
export const motor = globalThis.clearspaceMotor; // Motor slider levels (click target size, button spacing)
export const unsupported = new Set(["Reading guide", "Simplified layout", "Clear headings", "Shorter paragraphs"]);
export const defaults = { version: 1, enabled: true, selected: [], light: false, colorVision: colorVision.normalize(), lowVision: lowVision.normalize(), lightSensitivity: lightSensitivity.normalize(), focusMode: focusMode.normalize(), dyslexia: emptyDyslexia(), motor: motor.normalize() };
export const extensionApi = globalThis.browser ?? globalThis.chrome;
export const isFirefox = Boolean(extensionApi?.runtime?.getBrowserInfo);
export const browserName = isFirefox ? 'Firefox' : 'Chrome';
export const isExtension = Boolean(extensionApi?.runtime?.id && extensionApi?.storage);
export async function loadSettings() {
  const saved = isExtension ? (await extensionApi.storage.local.get("settings")).settings : JSON.parse(localStorage.getItem("clearspace-demo") || "null");
  if (saved?.selected?.includes('cognitive:Focus mode')) {
    const shared = restoreDyslexia(saved);
    if (!shared.experiences.losePlace) {
      const previous = focusMode.normalize(saved.focusMode);
      Object.assign(shared.customization, { guideSize: Math.min(160, previous.height), dimming: Math.min(0.6, previous.dimming / 100) });
    }
    shared.experiences.losePlace = true;
    delete shared.customization.guide;
    saved.dyslexia = shared;
    saved.selected = saved.selected.filter(option => option !== 'cognitive:Focus mode');
  }

  const settings = { ...defaults, ...saved, enabled: true, focusMode: focusMode.normalize(saved?.focusMode), colorVision: colorVision.normalize(saved?.colorVision), lowVision: lowVision.normalize(saved?.lowVision), lightSensitivity: lightSensitivity.normalize(saved?.lightSensitivity), dyslexia: restoreDyslexia(saved), selected: Array.isArray(saved?.selected) ? saved.selected.filter(item => typeof item === "string" && (!item.startsWith("vision:") || [...lowVisionOptions, ...lightSensitivityOptions].some(option => item === `vision:${option}`)) && !unsupported.has(item.split(":")[1])) : [] };
  // Restore previously paused preferences now that adjustments are always enabled.
  if (saved?.enabled === false) await saveSettings(settings);
  return settings;
}
export async function saveSettings(settings) {
  if (isExtension) await extensionApi.storage.local.set({ settings });
  else localStorage.setItem("clearspace-demo", JSON.stringify(settings));
}
export async function applyToTarget() {
  if (!isExtension) return "Demo settings saved. Webpages are not changed in Vite.";
  const value = new URLSearchParams(location.search).get("tab");
  const targetId = value && /^\d+$/.test(value) ? Number(value) : null;
  const automatic = await extensionApi.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
  const tabs = await extensionApi.tabs.query({});
  const targetIds = new Set(tabs.filter(tab => Number.isInteger(tab.id) && (!tab.url || /^https?:\/\//.test(tab.url))).map(tab => tab.id));
  if (targetId !== null) targetIds.add(targetId);
  if (!targetIds.size) {
    if (automatic) return "Settings saved. Open a website to use your adjustments automatically.";
    throw new Error("Settings saved, but no website is connected. Open the website you want to adjust, click the Clearspace toolbar icon, and your saved settings will apply. Or select Allow site access here to apply automatically.");
  }
  const results = await Promise.allSettled([...targetIds].map(async tabId => {
    const injected = await extensionApi.scripting.executeScript({ target: { tabId }, files: ["color-vision.js", "low-vision.js", "light-sensitivity.js", "focus-mode.js", "dyslexia.js", "selection-reader.js", "word-lookup.js", "content.js"], world: "ISOLATED" });
    const main = injected.find(frame => frame.frameId === 0);
    // Verify explicitly instead of relying on the completion value of a batch
    // of script files. Pin verification to the injected document if available.
    const frames = await extensionApi.scripting.executeScript({
      target: main?.documentId ? { tabId, documentIds: [main.documentId] } : { tabId },
      func: async () => {
        const extensionApi = globalThis.browser ?? globalThis.chrome;
        try {
          if (typeof globalThis.clearspaceApply !== "function") {
            throw new Error("Clearspace's page script did not start. Rebuild the extension and reload its card in chrome://extensions.");
          }
          const { settings } = await extensionApi.storage.local.get("settings");
          globalThis.clearspaceApply(settings);
          return { applied: true };
        } catch (error) {
          return { applied: false, error: error.message };
        }
      },
    });
    // Reduce motion, click targets, button spacing + keyboard focus add-ons; failures here must not affect the content.js result.
    await Promise.allSettled([
      extensionApi.scripting.executeScript({ target: { tabId }, files: ["motion-main.js"], world: "MAIN" }),
      extensionApi.scripting.executeScript({ target: { tabId }, files: ["motion.js"], world: "ISOLATED" }),
      extensionApi.scripting.executeScript({ target: { tabId }, files: ["motor-levels.js", "click-targets.js"], world: "ISOLATED" }),
      extensionApi.scripting.executeScript({ target: { tabId }, files: ["motor-levels.js", "button-spacing.js"], world: "ISOLATED" }),
      extensionApi.scripting.executeScript({ target: { tabId }, files: ["keyboard-focus.js"], world: "ISOLATED" })
    ]);
    if (!frames.some(frame => frame.frameId === 0 && frame.result?.applied === true)) {
      throw new Error(frames.find(frame => frame.frameId === 0)?.result?.error || "The webpage did not confirm the adjustments. It may have navigated or closed; click Clearspace on the webpage again.");
    }
  }));
  const count = results.filter(result => result.status === "fulfilled").length;
  const primary = targetId === null ? null : results[[...targetIds].indexOf(targetId)];
  const isProtected = result => result?.status === "rejected" && /Cannot access a chrome|extensions gallery cannot be scripted|Cannot access.*(?:chrome:\/\/|chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i.test(result.reason?.message || String(result.reason));
  const protectedHelp = `${browserName} protects this page from adjustments. Open a regular http or https website, click the Accessify toolbar icon there, and your saved settings will apply.`;
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
      help = ` ${browserName} protects this page. Try a regular http or https webpage.`;
    } else if (/Cannot access|permission|not allowed/i.test(reason)) {
      help = ` Click Accessify's toolbar icon on the target webpage to grant access, or select Allow site access in Accessify.${isFirefox ? '' : " For local files, enable Allow access to file URLs in Chrome's extension Details."}`;
    }
    throw new Error(`Settings saved, but the webpage could not be adjusted. ${reason}${help}`);
  }
}
