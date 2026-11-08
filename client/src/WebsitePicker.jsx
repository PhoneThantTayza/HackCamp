import React, { useEffect, useState } from 'react';
import { isExtension, listOpenSites } from './settings.js';

export default function WebsitePicker({ ready, pausedSites, siteProfiles, onApply, onClear, onToggleSite, status, saveError }) {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const chosen = sites.filter(site => !pausedSites.includes(site.origin)).map(site => site.origin);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !isExtension) return;
    let disposed = false;
    async function refresh() {
      try { const next = await listOpenSites(); if (!disposed) setSites(next); }
      catch { if (!disposed) setError('Could not refresh open websites. Close and reopen this menu to retry.'); }
    }
    chrome.tabs.onCreated.addListener(refresh);
    chrome.tabs.onRemoved.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    return () => { disposed = true; chrome.tabs.onCreated.removeListener(refresh); chrome.tabs.onRemoved.removeListener(refresh); chrome.tabs.onUpdated.removeListener(refresh); };
  }, [open]);
  async function show() {
    if (open) { setOpen(false); return; }
    setError('');
    try {
      const granted = await chrome.permissions.request({ permissions: ['tabs'] });
      if (!granted) { setError('Tab-list access was declined. Your preferences are unchanged.'); return; }
      const next = await listOpenSites();
      setSites(next); setOpen(true);
    } catch { setError('Could not list websites. Reload the extension and try again.'); }
  }
  return <div className="website-picker mt-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-medium">Website preferences</h3><p className="muted control-description">Your choices save automatically in this browser.</p></div>
      <button type="button" className="secondary-button" disabled={!ready || !isExtension} aria-expanded={open} aria-controls="website-choices" onClick={show}>Choose websites {open ? '−' : '+'}</button>
    </div>
    <p className="muted control-caption">List open websites with optional tab-list access. Applying adjustments also requires site access.</p>
    {!isExtension && <p className="muted control-caption">Website selection is available in the Chrome extension.</p>}
    {open && <div id="website-choices" className="colour-preview">
      <p className="muted control-description">Website toggles save immediately. Checked websites use their saved preferences; unchecked websites are paused. Use Apply to copy the choices shown below to checked websites.</p>
      <fieldset disabled={!ready} className="mt-4"><legend className="sr-only">Open websites to adjust</legend>
        {sites.map(({ origin, count }) => <div key={origin} className="py-3 border-b border-current/10">
          <label className="option-row"><input type="checkbox" checked={chosen.includes(origin)} onChange={() => onToggleSite(origin)} /><span className="break-all">{origin}<small className="muted block">{count} open tab{count === 1 ? '' : 's'} · {pausedSites.includes(origin) ? 'Paused' : siteProfiles[origin] ? 'Saved website choices' : 'Using your current choices'}</small></span></label>
        </div>)}
      </fieldset>
      {!sites.length && <p className="muted control-description">No regular websites are open. Open a website to select it here.</p>}
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button type="button" className="secondary-button" disabled={!ready || !chosen.length} onClick={() => onApply(sites.map(site => site.origin), chosen)}>Apply to selected websites</button>
        <button type="button" className="clear-button" disabled={!ready || (!chosen.length && !Object.keys(siteProfiles).length)} onClick={() => onClear(sites.map(site => site.origin))}>Clear all</button>
      </div>
      <p className="muted control-caption">Clear all unchecks these websites and removes all saved website choices. Your adjustment preferences stay saved in this browser.</p>
    </div>}
    {error && <p role="alert" className="controls-feedback text-sm">{error}</p>}
    {status && <p role="status" className="controls-feedback text-sm">{status}</p>}
    {saveError && <p role="alert" className="controls-feedback text-sm">{saveError}</p>}
  </div>;
}
