importScripts('selection-tts.js');

// The clicked tab is kept in the settings URL, even after settings take focus.
chrome.action.onClicked.addListener(tab => {
  chrome.tabs.create({ url: chrome.runtime.getURL(`index.html?tab=${tab.id}`) });
});

async function syncAutomaticAccess() {
  const origins = ["http://*/*", "https://*/*"];
  const granted = await chrome.permissions.contains({ origins });
  const ids = ["clearspace-auto", "clearspace-motion-main", "clearspace-motion", "clearspace-click-targets", "clearspace-button-spacing", "clearspace-keyboard-focus"];
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids });
  if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: registered.map(script => script.id) });
  if (granted) {
    await chrome.scripting.registerContentScripts([{
      id: "clearspace-auto", matches: origins, js: ["color-vision.js", "low-vision.js", "light-sensitivity.js", "focus-mode.js", "dyslexia.js", "selection-reader.js", "content.js"], runAt: "document_idle", world: "ISOLATED",
      allFrames: true, matchOriginAsFallback: true
    }, {
      // Reduce motion: wraps HTMLMediaElement.prototype.play in the page's own world.
      id: "clearspace-motion-main", matches: origins, js: ["motion-main.js"], runAt: "document_start", allFrames: true, world: "MAIN"
    }, {
      id: "clearspace-motion", matches: origins, js: ["motion.js"], runAt: "document_start", allFrames: true, world: "ISOLATED"
    }, {
      id: "clearspace-click-targets", matches: origins, js: ["motor-levels.js", "click-targets.js"], runAt: "document_start", allFrames: true, world: "ISOLATED"
    }, {
      id: "clearspace-button-spacing", matches: origins, js: ["motor-levels.js", "button-spacing.js"], runAt: "document_start", allFrames: true, world: "ISOLATED"
    }, {
      id: "clearspace-keyboard-focus", matches: origins, js: ["keyboard-focus.js"], runAt: "document_start", allFrames: true, world: "ISOLATED"
    }]);
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs.flatMap(tab => [
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["color-vision.js", "low-vision.js", "light-sensitivity.js", "focus-mode.js", "dyslexia.js", "selection-reader.js", "content.js"], world: "ISOLATED" }),
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["motion-main.js"], world: "MAIN" }),
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["motion.js"], world: "ISOLATED" }),
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["motor-levels.js", "click-targets.js"], world: "ISOLATED" }),
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["motor-levels.js", "button-spacing.js"], world: "ISOLATED" }),
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["keyboard-focus.js"], world: "ISOLATED" })
    ]));
  }
}
chrome.permissions.onAdded.addListener(() => syncAutomaticAccess().catch(console.error));
chrome.permissions.onRemoved.addListener(() => syncAutomaticAccess().catch(console.error));
chrome.runtime.onInstalled.addListener(() => syncAutomaticAccess().catch(console.error));
chrome.runtime.onStartup.addListener(() => syncAutomaticAccess().catch(console.error));