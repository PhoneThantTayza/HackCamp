(() => {
  let settings = { version: 1, enabled: false, selected: [] }, previousText = '';
  const listeners = new Set(), speechListeners = new Set();
  const event = set => ({ addListener: fn => set.add(fn), removeListener: fn => set.delete(fn) });
  globalThis.clearspacePreviewApi = {
    storage: { local: { get: async () => ({ settings }) }, onChanged: event(listeners) },
    runtime: { onMessage: event(speechListeners), async sendMessage(message) {
      if (message.type === 'clearspace:selection-stop') { speechSynthesis.cancel(); return { ok: true }; }
      if (message.type !== 'clearspace:selection-read' || !settings.enabled) return { ok: false };
      speechSynthesis.cancel();
      const voices = speechSynthesis.getVoices().filter(v => v.localService);
      if (!voices.length) return { ok: false, message: 'No local speech voice is available. Install a system voice and try again.' };
      const utterance = new SpeechSynthesisUtterance(message.text);
      utterance.voice = voices.find(v => message.languageHint && v.lang.startsWith(message.languageHint.split('-')[0])) || voices[0];
      utterance.rate = settings.dyslexia?.speech?.rate || 1;
      const report = (state, text) => speechListeners.forEach(fn => fn({ type: 'clearspace:speech-status', requestId: message.requestId, state, message: text }));
      utterance.onstart = () => report('speaking', 'Reading…'); utterance.onend = () => report('done', 'Finished reading.');
      utterance.onerror = () => report('error', 'Could not read this passage.');
      speechSynthesis.speak(utterance); return { ok: true };
    } },
  };
  addEventListener('message', e => {
    if (e.source !== parent || e.origin !== location.origin || e.data?.type !== 'clearspace:reader') return;
    if (e.data.settings?.version !== 1 || !Array.isArray(e.data.settings.selected) || typeof e.data.text !== 'string') return;
    const text = e.data.text.slice(0, 32768);
    if (text !== previousText) {
      globalThis.clearspaceApply?.({ version: 1, enabled: false, selected: [] });
      const nodes = text.split(/\n\s*\n/).map(part => { const p = document.createElement('p'); p.textContent = part; return p; });
      document.querySelector('#passage').replaceChildren(...nodes); previousText = text; speechSynthesis.cancel();
    }
    const oldValue = settings; settings = e.data.settings;
    if (!settings.enabled) speechSynthesis.cancel();
    listeners.forEach(fn => fn({ settings: { oldValue, newValue: settings } }, 'local'));
  });
  addEventListener('pagehide', () => speechSynthesis.cancel());
})();
