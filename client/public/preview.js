// An in-memory adapter keeps draft preview choices separate from saved preferences.
(() => {
  let settings = { version: 1, enabled: false, selected: [] };
  const storageListeners = new Set();
  const speechListeners = new Set();
  const event = listeners => ({ addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) });
  globalThis.clearspacePreviewApi = {
    storage: {
      local: { get: async () => ({ settings }) },
      onChanged: event(storageListeners),
    },
    runtime: {
      onMessage: event(speechListeners),
      async sendMessage(message) {
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
