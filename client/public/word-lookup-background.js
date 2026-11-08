// Only an enabled, permitted content script can request a fixed Google lookup URL.
(() => {
  const chrome = globalThis.browser ?? globalThis.chrome;
  const windows = new Map();
  let queue = Promise.resolve();
  chrome.windows.onRemoved.addListener(id => {
    for (const [source, lookup] of windows) if (lookup.windowId === id || source === id) windows.delete(source);
  });
  async function lookup(message, sender) {
    if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id)) return { ok: false, message: 'Open lookup from a webpage with Clearspace site access.' };
    // about:blank/srcdoc frames may inherit an allowed HTTP(S) page's origin.
    if (!/^https?:\/\//.test(sender.url ?? '') && !(/^about:(blank|srcdoc)/.test(sender.url ?? '') && /^https?:\/\//.test(sender.origin ?? ''))) return { ok: false, message: 'Automatic lookup is available on permitted HTTP and HTTPS webpages.' };
    if ([...windows.values()].some(value => value.tabId === sender.tab.id)) return { ok: false, cancelled: true };
    const text = typeof message.text === 'string' ? message.text.replace(/\s+/gu, ' ').trim() : '';
    if (!text || text.length > 120 || text.split(' ').length > 8 || !/\p{L}/u.test(text)) return { ok: false, message: 'Select a word or short phrase (up to 8 words and 120 characters).' };
    const { settings } = await chrome.storage.local.get('settings');
    if (settings?.version !== 1 || settings.enabled !== true || settings.dyslexia?.enabled === false || settings.dyslexia?.experiences?.unfamiliarWords !== true) return { ok: false, cancelled: true, message: 'Enable word lookup and select Save and apply in Clearspace.' };
    if (globalThis.browser?.runtime?.getBrowserInfo && !(await chrome.permissions.contains({ data_collection: ['websiteContent'] }))) return { ok: false, cancelled: true, message: 'Allow word lookup to send selected words to Google in Accessify settings.' };
    const url = `https://www.google.com/search?q=${encodeURIComponent(`${text} definition pronunciation`)}`;
    const previous = windows.get(sender.tab.windowId);
    if (previous) {
      try {
        const tab = await chrome.tabs.get(previous.tabId);
        if (tab.windowId !== previous.windowId) throw new Error('Lookup moved');
        await chrome.tabs.update(previous.tabId, { url });
        await chrome.windows.update(previous.windowId, { focused: true });
        return { ok: true };
      } catch { windows.delete(sender.tab.windowId); }
    }
    const source = await chrome.windows.get(sender.tab.windowId);
    const width = Math.min(480, source.width ?? 480);
    const height = Math.max(300, Math.min(760, source.height ?? 760));
    const options = { url, type: 'popup', incognito: sender.tab.incognito === true, focused: true };
    let created;
    try {
      created = await chrome.windows.create({ ...options, width, height,
        left: Math.max(0, (source.left ?? 0) + (source.width ?? width) - width), top: source.top ?? 0 });
    } catch {
      // Chrome may reject bounds on small screens or when the source is offscreen.
      created = await chrome.windows.create(options);
    }
    if (created.tabs?.[0]) windows.set(sender.tab.windowId, { windowId: created.id, tabId: created.tabs[0].id });
    return { ok: true };
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'clearspace:word-lookup') return;
    queue = queue.then(() => lookup(message, sender)).catch(error => ({ ok: false, message: error.message }));
    queue.then(respond);
    return true;
  });
})();
