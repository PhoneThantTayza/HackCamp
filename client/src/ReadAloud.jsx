import React, { useEffect, useState } from 'react';
import { isExtension } from './settings.js';
import { speechAvailable } from './read-aloud.js';

export default function ReadAloud({ enabled, embedded = false, preferences = {}, onChange }) {
  const [voices, setVoices] = useState([]);
  const [message, setMessage] = useState('');
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const available = isExtension && speechAvailable(globalThis.chrome);
  useEffect(() => {
    if (!available) return;
    let active = true;
    const refresh = async () => {
      try { const items = await chrome.tts.getVoices(); if (active) { setVoices(items.filter(item => item.remote === false)); setVoicesLoaded(true); } }
      catch { if (active) setMessage('Could not load local voices. Reload the extension.'); }
    };
    void refresh(); chrome.tts.onVoicesChanged?.addListener(refresh);
    return () => { active = false; chrome.tts.onVoicesChanged?.removeListener(refresh); };
  }, [available]);
  return <section className={embedded ? 'dyslexia-help' : 'extension-controls'} aria-labelledby="read-aloud-title">
    <h2 id="read-aloud-title" className="text-base font-medium">Read highlighted text aloud</h2>
    <p className="muted control-description">Reading starts when you release the selection. Press Escape or use the page’s Stop button to stop.</p>
    <p className="muted control-description">To hear a button’s label without clicking it, point at it or focus it with Tab, then choose Read button label or press Alt+Shift+R.</p>
    {!isExtension && <p className="muted text-sm">Try listening by selecting text in Preview all adjustments. Reading on other websites requires the installed extension.</p>}
    {isExtension && !available && <p role="alert">Reload the extension to enable speech support.</p>}
    {available && voicesLoaded && !voices.length && <p role="alert" className="muted control-description">No local speech voices are available yet. If this persists, add a voice in your device’s speech settings and restart Chrome.</p>}
    <fieldset disabled={!enabled} className="mt-4">
      <label className="dyslexia-field">Voice
        <select aria-label="Read-aloud voice" value={voices.some(voice => voice.voiceName === preferences.voiceName) ? preferences.voiceName : ''} disabled={!available} onChange={event => onChange?.({ ...preferences, voiceName: event.target.value })}>
          <option value="">Auto-detect language</option>
          {voices.map((voice, index) => <option key={index} value={voice.voiceName}>{voice.voiceName} ({voice.lang})</option>)}
        </select>
      </label>
      <label className="dyslexia-field">Speed: {preferences.rate ?? 1}×
        <input aria-label="Read-aloud speed" type="range" min="0.5" max="2" step="0.1" value={preferences.rate ?? 1} onChange={event => onChange?.({ ...preferences, rate: Number(event.target.value) })} />
      </label>
      <button type="button" className="secondary-button" disabled={!available} onClick={async () => {
        try { await chrome.runtime.sendMessage({ type: 'clearspace:speech-stop-all' }); setMessage('Reading stopped.'); }
        catch { setMessage('Reload the extension to reconnect speech.'); }
      }}>Stop reading</button>
    </fieldset>
    <p role="status" className="muted text-sm mt-4">{message}</p>
  </section>;
}
