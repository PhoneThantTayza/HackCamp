// Firefox's document background uses Web Speech; only local OS voices are exposed.
(() => {
  if (!globalThis.browser?.runtime?.getBrowserInfo || !globalThis.speechSynthesis || globalThis.clearspaceSpeech) return;
  const synth = globalThis.speechSynthesis;
  const listeners = new Set();
  synth.addEventListener('voiceschanged', () => listeners.forEach(fn => fn()));
  globalThis.clearspaceSpeech = {
    async getVoices() {
      if (!synth.getVoices().length) {
        await new Promise(resolve => {
          const done = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', done); resolve(); };
          const timer = setTimeout(done, 1500);
          synth.addEventListener('voiceschanged', done);
        });
      }
      return synth.getVoices().filter(voice => voice.localService === true).map(voice => ({ voiceName: voice.name, lang: voice.lang, remote: false }));
    },
    async speak(text, options = {}) {
      const voice = synth.getVoices().find(voice => voice.localService === true && voice.name === options.voiceName);
      if (!voice) throw new Error('No matching local voice is installed. Add a voice in your operating system speech settings.');
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice; utterance.lang = options.lang || voice.lang;
      utterance.rate = Math.min(2, Math.max(0.5, Number(options.rate) || 1));
      utterance.onstart = () => options.onEvent?.({ type: 'start' });
      utterance.onend = () => options.onEvent?.({ type: 'end' });
      utterance.onerror = event => options.onEvent?.({ type: ['interrupted', 'canceled'].includes(event.error) ? 'interrupted' : 'error' });
      if (!options.enqueue) synth.cancel();
      synth.speak(utterance);
    },
    stop: () => synth.cancel(), pause: () => synth.pause(), resume: () => synth.resume(),
    onVoicesChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
  };
  globalThis.addEventListener?.('pagehide', () => synth.cancel());
})();
