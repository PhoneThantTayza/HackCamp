// Runs in the original page's isolated world. Never reads form values.
export function speechAvailable(api) {
  return ["getVoices", "speak", "stop", "pause", "resume"].every(name => typeof api?.tts?.[name] === "function");
}

export function selectedPageText() {
  return { text: window.getSelection()?.toString().trim() || "" };
}

export async function readSelection(api, tabValue, { rate = 1, voiceName } = {}, onEvent, isCurrent = () => true) {
  if (!speechAvailable(api)) throw new Error("Speech is unavailable. Reload Clearspace at chrome://extensions, close this settings tab, then reopen it from the extension icon.");
  if (!/^\d+$/.test(tabValue || "")) throw new Error("Select text on a webpage, then click the Clearspace extension icon on that page.");
  const voices = await api.tts.getVoices();
  const local = voices.filter(voice => voice.remote === false);
  const voice = local.find(item => item.voiceName === voiceName) || local[0];
  if (!voice) throw new Error("No local speech voice is available. Install a voice in your device's speech settings and reopen Clearspace.");
  let results;
  try {
    results = await api.scripting.executeScript({ target: { tabId: Number(tabValue) }, func: selectedPageText });
  } catch {
    throw new Error("Cannot read this page. It may be closed, protected, or need site permission. Open Clearspace again from a regular webpage.");
  }
  const text = results[0]?.result?.text;
  if (!text) throw new Error("No text selected. Highlight text on the original webpage, then choose Read selection.");
  if (text.length > 32768) throw new Error("Select a shorter passage (under 32,768 characters).");
  if (!isCurrent()) return;
  api.tts.stop();
  await api.tts.speak(text, {
    voiceName: voice.voiceName, ...(voice.extensionId ? { extensionId: voice.extensionId } : {}),
    rate: Math.min(2, Math.max(0.5, Number(rate) || 1)), enqueue: false, onEvent
  });
}
