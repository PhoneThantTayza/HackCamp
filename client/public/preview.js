// An in-memory adapter keeps draft preview choices separate from saved preferences.
(() => {
  let settings = { version: 1, enabled: false, selected: [] };
  const storageListeners = new Set();
  const speechListeners = new Set();
  let lookupWindow;
  const event = listeners => ({ addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) });
  globalThis.clearspacePreviewApi = {
    storage: {
      local: { get: async () => ({ settings }) },
      onChanged: event(storageListeners),
    },
    runtime: {
      onMessage: event(speechListeners),
      async sendMessage(message) {
        if (message.type === 'clearspace:word-lookup') {
          if (!settings.enabled || settings.dyslexia?.enabled === false || settings.dyslexia?.experiences?.unfamiliarWords !== true) return { ok: false, cancelled: true };
          const text = typeof message.text === 'string' ? message.text.replace(/\s+/gu, ' ').trim() : '';
          if (!text || text.length > 120 || text.split(' ').length > 8 || !/\p{L}/u.test(text)) return { ok: false, message: 'Select a word or short phrase (up to 8 words and 120 characters).' };
          const url = `https://www.google.com/search?q=${encodeURIComponent(`${text} definition pronunciation`)}`;
          try {
            if (!lookupWindow || lookupWindow.closed) {
              lookupWindow = window.open('', '_blank', 'popup,width=480,height=700');
              if (!lookupWindow) return { ok: false, message: 'Your browser blocked the preview popup. Use the link below, or allow popups for this page.' };
              lookupWindow.opener = null;
            }
            lookupWindow.location.href = url;
            lookupWindow.focus();
            return { ok: true };
          } catch {
            lookupWindow = undefined;
            return { ok: false, message: 'The preview could not open its lookup window. Use the link below to search.' };
          }
        }
        if (!globalThis.speechSynthesis) return { ok: false, message: "Listening is unavailable in this browser." };
        if (message.type === "clearspace:selection-stop") {
          speechSynthesis.cancel();
          return { ok: true };
        }
        if (message.type !== "clearspace:selection-read") return { ok: false };
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message.text);
        const speech = settings.dyslexia?.speech;
        utterance.rate = Math.min(2, Math.max(0.5, Number(speech?.rate) || 1));
        if (message.languageHint) utterance.lang = message.languageHint;
        const voice = speechSynthesis.getVoices().find(item => item.name === speech?.voiceName);
        if (voice) utterance.voice = voice;
        const report = (state, text) => speechListeners.forEach(fn => fn({ type: "clearspace:speech-status", requestId: message.requestId, state, message: text }));
        utterance.onstart = () => report("speaking", "Reading preview…");
        utterance.onend = () => report("done", "Finished reading.");
        utterance.onerror = () => report("error", "Could not read the preview. Check your browser’s speech voices.");
        speechSynthesis.speak(utterance);
        return { ok: true };
      },
    },
  };
  addEventListener("message", event => {
    if (event.source !== parent || event.origin !== location.origin || event.data?.type !== "clearspace:preview-settings") return;
    const next = event.data.settings;
    if (next?.version !== 1 || !Array.isArray(next.selected)) return;
    const oldValue = settings;
    settings = next;
    storageListeners.forEach(fn => fn({ settings: { oldValue, newValue: settings } }, "local"));
  });
  addEventListener("pagehide", () => globalThis.speechSynthesis?.cancel());
  document.addEventListener("click", event => {
    if (event.target.closest("#sample-button")) document.querySelector("#sample-result").textContent = "You tried the button. Your controls still work.";
    if (event.target.closest("#sample-reset")) {
      document.querySelector("#sample-result").textContent = "Your sample is ready.";
      document.querySelector("input[type=text]").value = "";
      document.querySelector("input[type=checkbox]").checked = false;
    }
  });
})();
