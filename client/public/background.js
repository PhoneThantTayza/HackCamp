// Chrome loads dependencies in its worker. Firefox lists them in background.scripts.
if (typeof importScripts === 'function') {
  importScripts('selection-tts.js');
  importScripts('word-lookup-background.js');
}
const extensionApi = globalThis.browser ?? globalThis.chrome;

// Open alongside the current webpage while the toolbar gesture is still active.
extensionApi.action.onClicked.addListener(tab => {
  const panel = extensionApi.sidebarAction ? extensionApi.sidebarAction.open() : extensionApi.sidePanel.open({ windowId: tab.windowId });
  panel.catch(() => extensionApi.runtime.openOptionsPage());
  // Clicking the toolbar grants activeTab access; connect this page immediately.
  if (Number.isInteger(tab.id)) applyToOpenTab(tab.id).catch(() => {});
});

async function applyToOpenTab(tabId) {
  const core = extensionApi.scripting.executeScript({ target: { tabId }, files: ["color-vision.js", "low-vision.js", "light-sensitivity.js", "focus-mode.js", "dyslexia.js", "selection-reader.js", "word-lookup.js", "content.js"], world: "ISOLATED" });
  const addons = Promise.allSettled([
    extensionApi.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["motion-main.js"], world: "MAIN" }),
    extensionApi.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["motion.js"], world: "ISOLATED" }),
    extensionApi.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["motor-levels.js", "click-targets.js"], world: "ISOLATED" }),
    extensionApi.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["motor-levels.js", "button-spacing.js"], world: "ISOLATED" }),
    extensionApi.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["keyboard-focus.js"], world: "ISOLATED" }),
  ]);
  // Attach both handlers immediately; one denied page must not stop other tabs.
  const results = await Promise.allSettled([core, addons]);
  if (results[0].status === 'rejected') throw results[0].reason;
}

let updateQueue = Promise.resolve();
let updateRevision = 0;
function reapplyOpenTabs() {
  const revision = ++updateRevision;
  updateQueue = updateQueue.catch(() => {}).then(async () => {
    if (revision !== updateRevision) return;
    // No tabs/history permission needed: Chrome checks access for each injection.
    const tabs = await extensionApi.tabs.query({});
    await Promise.allSettled(tabs.filter(tab => Number.isInteger(tab.id) && (!tab.url || /^https?:\/\//.test(tab.url))).map(tab => applyToOpenTab(tab.id)));
  });
  return updateQueue;
}

extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) reapplyOpenTabs().catch(() => {});
});
extensionApi.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'complete' && (!tab.url || /^https?:\/\//.test(tab.url))) applyToOpenTab(tabId).catch(() => {});
});

async function syncAutomaticAccess() {
  const origins = ["http://*/*", "https://*/*"];
  const granted = await extensionApi.permissions.contains({ origins });
  const ids = ["clearspace-auto", "clearspace-motion-main", "clearspace-motion", "clearspace-click-targets", "clearspace-button-spacing", "clearspace-keyboard-focus"];
  const registered = await extensionApi.scripting.getRegisteredContentScripts({ ids });
  if (registered.length) await extensionApi.scripting.unregisterContentScripts({ ids: registered.map(script => script.id) });
  if (granted) {
    await extensionApi.scripting.registerContentScripts([{
      id: "clearspace-auto", matches: origins, js: ["color-vision.js", "low-vision.js", "light-sensitivity.js", "focus-mode.js", "dyslexia.js", "selection-reader.js", "word-lookup.js", "content.js"], runAt: "document_idle", world: "ISOLATED",
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
    await reapplyOpenTabs();
  }
}
extensionApi.permissions.onAdded.addListener(() => syncAutomaticAccess().catch(console.error));
extensionApi.permissions.onRemoved.addListener(() => syncAutomaticAccess().catch(console.error));
extensionApi.runtime.onInstalled.addListener(() => syncAutomaticAccess().catch(console.error));
extensionApi.runtime.onStartup.addListener(() => syncAutomaticAccess().catch(console.error));
