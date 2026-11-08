// Service-worker speech coordinator. Text stays in memory and uses local voices only.
(() => {
  let generation = 0, owner;
  const samePage = sender => owner && sender.tab?.id === owner.tabId &&
    (owner.documentId ? sender.documentId === owner.documentId : sender.frameId === owner.frameId);
  const enabled = settings => settings?.version === 1 && settings.enabled === true &&
    settings.dyslexia?.enabled !== false && settings.dyslexia?.experiences?.preferListening === true;
  function languageCode(value) {
    if (typeof value !== 'string' || value === 'und') return '';
    try { return Intl.getCanonicalLocales(value.replaceAll('_', '-'))[0]?.toLowerCase() ?? ''; }
    catch { return ''; }
  }
  function scriptLanguage(text) {
    // These scripts identify a spoken language much better than CLD on a short greeting.
    // Do not guess from shared scripts such as Latin, Cyrillic, Arabic or Han.
    const letters = [...text.slice(0, 4096)].filter(letter => /\p{L}/u.test(letter));
    if (!letters.length) return '';
    for (const [language, script] of [['th', /\p{Script=Thai}/u], ['ko', /\p{Script=Hangul}/u], ['ja', /[\p{Script=Hiragana}\p{Script=Katakana}]/u]]) {
      if (letters.filter(letter => script.test(letter)).length / letters.length >= 0.6) return language;
    }
    return '';
  }
  async function localVoices() {
    const get = async () => (await chrome.tts.getVoices()).filter(voice => voice.remote === false);
    let voices = await get();
    if (voices.length || !chrome.tts.onVoicesChanged) return voices;
    // Chrome can return [] while the platform voice list is still loading.
    await new Promise(resolve => {
      const done = () => { clearTimeout(timer); chrome.tts.onVoicesChanged.removeListener(done); resolve(); };
      const timer = setTimeout(done, 1500);
      chrome.tts.onVoicesChanged.addListener(done);
    });
    return get();
  }
  async function chooseVoice(text, voices, preference, hint) {
    const manual = typeof preference.voiceName === 'string' && preference.voiceName.length > 0
      ? voices.find(voice => voice.voiceName === preference.voiceName) : undefined;
    if (manual) return { voice: manual, notice: '' };
    let detected;
    try { detected = await chrome.i18n?.detectLanguage(text); }
    catch { /* Detection is optional: keep short/unknown text readable with a local fallback. */ }
    const ranked = (Array.isArray(detected?.languages) ? detected.languages : [])
      .filter(item => languageCode(item.language) && typeof item.percentage === 'number' && Number.isFinite(item.percentage))
      .sort((a, b) => b.percentage - a.percentage);
    const reliable = detected?.isReliable === true && ranked[0]?.percentage >= 60 &&
      ranked[0].percentage - (ranked[1]?.percentage ?? 0) >= 20;
    const language = reliable ? languageCode(ranked[0].language) : scriptLanguage(text) || languageCode(hint);
    if (language) {
      const voice = voices.find(item => languageCode(item.lang) === language) ??
        voices.find(item => languageCode(item.lang).split('-')[0] === language.split('-')[0]);
      if (!voice) throw new Error(`No local voice for ${language}. Install a matching voice or choose a voice manually.`);
      return { voice, notice: '' };
    }
    const uiLanguage = languageCode(chrome.i18n?.getUILanguage?.());
    const voice = voices.find(item => uiLanguage && languageCode(item.lang) === uiLanguage) ??
      voices.find(item => uiLanguage && languageCode(item.lang).split('-')[0] === uiLanguage.split('-')[0]) ?? voices[0];
    return { voice, notice: 'Language uncertain; using the default local voice.' };
  }
  function notify(target, state, message) {
    const options = target.documentId ? { documentId: target.documentId } : { frameId: target.frameId };
    chrome.tabs.sendMessage(target.tabId, { type: 'clearspace:speech-status', requestId: target.requestId, state, message }, options).catch(() => {});
  }
  function stop() {
    generation++;
    const previous = owner; owner = undefined;
    if (previous) { chrome.tts?.stop(); notify(previous, 'idle', 'Reading stopped.'); }
  }
  async function read(message, sender) {
    if (!Number.isInteger(sender.tab?.id) || !Number.isInteger(sender.frameId) ||
      typeof message.text !== 'string' || !message.text.trim() || message.text.length > 32768 ||
      !Number.isSafeInteger(message.requestId)) return { ok: false, message: 'Select a shorter passage (under 32,768 characters).' };
    const token = ++generation;
    const target = { tabId: sender.tab.id, frameId: sender.frameId, documentId: sender.documentId, requestId: message.requestId };
    // Stop the old utterance before any asynchronous work can start a replacement.
    const previous = owner; owner = target;
    if (previous) { chrome.tts?.stop(); notify(previous, 'idle', 'Reading stopped.'); }
    const [{ settings }, tab] = await Promise.all([chrome.storage.local.get('settings'), chrome.tabs.get(sender.tab.id)]);
    if (token !== generation) return { ok: false, cancelled: true };
    if (!enabled(settings) || !tab.active) { owner = undefined; return { ok: false, cancelled: true }; }
    if (!chrome.tts?.getVoices || !chrome.tts?.speak) throw new Error('Speech is unavailable. Reload the extension.');
    const voices = await localVoices();
    if (token !== generation) return { ok: false, cancelled: true };
    const preference = settings.dyslexia.speech ?? {};
    if (!voices.length) throw new Error('No local voice is installed. Add a voice in your device speech settings.');
    const { voice, notice } = await chooseVoice(message.text, voices, preference, message.languageHint);
    if (token !== generation) return { ok: false, cancelled: true };
    const rate = typeof preference.rate === 'number' && Number.isFinite(preference.rate) ? Math.min(2, Math.max(0.5, preference.rate)) : 1;
    await chrome.tts.speak(message.text.trim(), {
      voiceName: voice.voiceName, ...(voice.extensionId ? { extensionId: voice.extensionId } : {}),
      ...(languageCode(voice.lang) ? { lang: voice.lang.replaceAll('_', '-') } : {}), rate, enqueue: false,
      onEvent: event => {
        if (token !== generation) return;
        if (event.type === 'start') notify(target, 'speaking', notice || 'Reading selected text.');
        if (['end', 'interrupted', 'cancelled', 'error'].includes(event.type)) {
          owner = undefined;
          notify(target, event.type === 'error' ? 'error' : 'idle', event.type === 'error' ? 'Speech failed. Try another local voice.' : 'Reading finished or stopped.');
        }
      },
    });
    return { ok: true };
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'clearspace:selection-stop') {
      if (samePage(sender)) stop();
      respond({ ok: true }); return;
    }
    if (message?.type === 'clearspace:speech-stop-all') {
      if (sender.url?.startsWith(chrome.runtime.getURL(''))) { stop(); chrome.tts?.stop(); respond({ ok: true }); }
      return;
    }
    if (message?.type !== 'clearspace:selection-read') return;
    read(message, sender).then(respond).catch(error => {
      if (samePage(sender) && owner.requestId === message.requestId) stop();
      respond({ ok: false, message: error.message || 'Could not read this selection.' });
    });
    return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings && !enabled(changes.settings.newValue)) stop();
  });
  chrome.tabs.onRemoved.addListener(tabId => { if (owner?.tabId === tabId) stop(); });
  chrome.tabs.onUpdated.addListener((tabId, change) => { if (owner?.tabId === tabId && change.status === 'loading') stop(); });
})();
