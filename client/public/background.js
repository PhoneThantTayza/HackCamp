importScripts('selection-tts.js');

// The clicked tab is kept in the settings URL, even after settings take focus.
chrome.action.onClicked.addListener(tab => {
  chrome.tabs.create({ url: chrome.runtime.getURL(`index.html?tab=${tab.id}`) });
});

async function syncAutomaticAccess() {
  const origins = ["http://*/*", "https://*/*"];
  const granted = await chrome.permissions.contains({ origins });
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: ["clearspace-auto"] });
  if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: ["clearspace-auto"] });
  if (granted) {
    await chrome.scripting.registerContentScripts([{
      id: "clearspace-auto", matches: origins, js: ["dyslexia.js", "selection-reader.js", "content.js"], runAt: "document_idle",
      allFrames: true, matchOriginAsFallback: true
    }]);
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true }, files: ["dyslexia.js", "selection-reader.js", "content.js"]
    })));
  }
}
chrome.permissions.onAdded.addListener(() => syncAutomaticAccess().catch(console.error));
chrome.permissions.onRemoved.addListener(() => syncAutomaticAccess().catch(console.error));
chrome.runtime.onInstalled.addListener(() => syncAutomaticAccess().catch(console.error));
chrome.runtime.onStartup.addListener(() => syncAutomaticAccess().catch(console.error));
