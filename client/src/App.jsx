import React, { useEffect, useState } from "react";
import { defaults, colorVision, unsupported, isExtension, loadSettings, saveSettings, applyToTarget } from "./settings.js";

const groups = [
  { id: "vision", name: "Vision", icon: "eye", description: "A little more clarity.", options: ["Larger text", "High contrast", "Extra line spacing", "Reduce motion", "Underline links"] },
  { id: "dyslexia", name: "Dyslexia", icon: "type", description: "Reading at your rhythm.", options: ["Readable font", "Wider letter spacing", "Shorter lines", "Reading guide", "Left-aligned text"] },
  { id: "motor", name: "Motor / mobility", icon: "hand", description: "More room to navigate.", options: ["Larger click targets", "Extra button spacing", "Keyboard focus indicators", "Reduce motion"] },
  { id: "cognitive", name: "Cognitive", icon: "spark", description: "Less noise. More focus.", options: ["Simplified layout", "Hide distractions", "Clear headings", "Shorter paragraphs", "Reduce motion"] },
];

function Icon({ name, size = 20, ...props }) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    moon: <path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z" />,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    type: <><path d="M4 19 10 5l6 14M6 15h8m2-5h6m-3 0v9" /></>,
    hand: <><path d="M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2Z" /></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    link: <><path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    github: <><path d="M9 19c-5 1-5-2-7-2m14 5v-4c0-1-.4-2-1-2 4-.5 6-2 6-6 0-1-.5-3-1.5-4 .5-1 .5-2 0-3-2 0-3 1-4 1a13 13 0 0 0-7 0C7 3 6 2 4 3c-.5 1-.5 2 0 3-1 1-1.5 3-1.5 4 0 4 2 5.5 6 6-.6.5-1 1-1 2v4" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function ColourVisionControls({ value, onChange, enabled }) {
  const filtered = enabled && value.mode !== "off" && value.strength > 0;
  const samples = [["#d53b35", "Red", "●"], ["#27834a", "Green", "▲"], ["#246fce", "Blue", "■"], ["#e5b52e", "Yellow", "◆"]];
  return <div className="colour-controls">
    <h3 className="text-sm font-medium">Colour blindness</h3>
    <p id="colour-help" className="muted control-description">Try a palette and choose the strength that makes colours easier for you to tell apart.</p>
    <label htmlFor="colour-mode" className="colour-label">Colour assistance</label>
    <select id="colour-mode" className="colour-select" value={value.mode} aria-describedby="colour-help colour-limit" onChange={event => onChange({ ...value, mode: event.target.value })}>
      <option value="off">Off — original colours</option>
      <option value="protan">Red–green: red emphasis (protan)</option>
      <option value="deutan">Red–green: green emphasis (deutan)</option>
      <option value="tritan">Blue–yellow (tritan)</option>
    </select>
    <div className="colour-strength"><label htmlFor="colour-strength">Strength</label><output htmlFor="colour-strength">{value.strength}%</output></div>
    <input id="colour-strength" className="colour-range" type="range" min="0" max="100" step="5" value={value.strength} disabled={value.mode === "off"} onChange={event => onChange({ ...value, strength: Number(event.target.value) })} />
    <label className="option-row"><input type="checkbox" checked={value.cues} onChange={event => onChange({ ...value, cues: event.target.checked })} /><span>Use cues beyond colour<small className="muted block">Underline links, outline controls and mark invalid fields with dashed outlines.</small></span></label>
    <div className="colour-preview">
      <svg width="0" height="0" aria-hidden="true" className="colour-filter-defs"><defs><filter id="clearspace-sample-colour" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={colorVision.matrix(value)} /></filter></defs></svg>
      <p className="colour-label">Live colour sample{!enabled && " · adjustments paused"}</p>
      {[false, true].map(adjusted => <div key={String(adjusted)} className="colour-sample-row"><span className="muted">{adjusted ? "Your settings" : "Original"}</span><div className="colour-swatches" style={{ filter: adjusted && filtered ? "url(#clearspace-sample-colour)" : "none" }}>{samples.map(([colour, name, shape]) => <div key={name} className="colour-swatch"><span style={{ backgroundColor: colour }} aria-hidden="true">{shape}</span><small>{name}</small></div>)}</div></div>)}
    </div>
    <p id="colour-limit" className="muted control-caption">Colour remapping affects the whole page, including images. Results vary; this is assistance, not a simulation or a correction. The sample updates now; save to apply to your webpage.</p>
  </div>;
}

function AccessibilityCard({ group, selected, onToggle, colour, onColourChange, enabled }) {
  const [open, setOpen] = useState(group.id === "vision");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const count = group.options.filter(option => selected.includes(`${group.id}:${option}`)).length + (group.id === "vision" ? Number(colour.mode !== "off") + Number(colour.cues) : 0);
  const options = group.options.filter(option => option.toLowerCase().includes(query.toLowerCase()));
  return <section className={`choice-card ${open ? "is-open" : ""}`}>
    <div className="flex items-start justify-between gap-2">
      <span className="category-icon"><Icon name={group.icon} size={23} /></span>
      <button type="button" className="icon-button small" aria-label={`Search ${group.name} adjustments`} aria-expanded={searching} onClick={() => { setSearching(!searching); setOpen(true); }}><Icon name="search" size={16} /></button>
    </div>
    <button type="button" className="category-button" aria-expanded={open} aria-controls={`${group.id}-options`} onClick={() => setOpen(!open)}>
      <span className="flex items-center justify-between gap-2"><span className="text-base font-medium">{group.name}</span><span className={`chevron ${open ? "rotate-180" : ""}`}><Icon name="chevron" size={18} /></span></span>
      <span className="muted mt-2 block text-xs">{group.description}</span>
      <span className="muted mt-5 block text-xs">{count ? `${count} selected` : `${group.options.length} adjustments`}</span>
    </button>
    {open && <div id={`${group.id}-options`} className="options-list">
      {searching && <input autoFocus type="search" aria-label={`Find ${group.name} adjustment`} placeholder="Find an adjustment…" value={query} onChange={event => setQuery(event.target.value)} className="option-search" />}
      {options.map(option => <label key={option} className="option-row"><input type="checkbox" disabled={unsupported.has(option)} checked={selected.includes(`${group.id}:${option}`)} onChange={() => onToggle(`${group.id}:${option}`)} /><span>{option}{unsupported.has(option) && <small className="muted block">Coming later</small>}</span></label>)}
      {!options.length && !(group.id === "vision" && "colour color blindness protan deutan tritan red green blue yellow strength cues".includes(query.toLowerCase())) && <p className="muted text-xs py-2">No matching adjustments.</p>}
      {group.id === "vision" && (!query || "colour color blindness protan deutan tritan red green blue yellow strength cues".includes(query.toLowerCase())) && <ColourVisionControls value={colour} onChange={onColourChange} enabled={enabled} />}
    </div>}
  </section>;
}

export default function App() {
  const [light, setLight] = useState(false);
  const [selected, setSelected] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [colour, setColour] = useState(defaults.colorVision);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { loadSettings().then(settings => {
    setLight(settings.light); setSelected(settings.selected); setEnabled(settings.enabled); setColour(settings.colorVision); setReady(true);
  }).catch(() => setError("Could not load settings. Reopen Clearspace to retry.")); }, []);
  function toggle(option) { setSelected(current => current.includes(option) ? current.filter(item => item !== option) : [...current, option]); setStatus("Unsaved changes. Select Save and apply."); }
  function changeColour(value) { setColour(value); setStatus("Unsaved changes. Select Save and apply."); }
  function clearChoices() { setSelected([]); setColour(defaults.colorVision); setStatus("Unsaved changes. Select Save and apply."); }
  const selectionCount = selected.length + Number(colour.mode !== "off") + Number(colour.cues);
  async function persist(reset = false) {
    setBusy(true); setError(""); setStatus("");
    try {
      await saveSettings(reset ? { ...defaults, light } : { version: 1, enabled, selected, light, colorVision: colour });
      if (reset) { setSelected([]); setEnabled(true); setColour(defaults.colorVision); }
      setStatus(await applyToTarget());
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function allowAutomatic() {
    setError("");
    try {
      const granted = await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] });
      setStatus(granted ? "Site access granted. Saved settings will apply automatically on permitted webpages." : "Site access declined. Use the extension icon on individual webpages.");
    } catch (error) { setError(error.message); }
  }
  return <div className={`app ${light ? "light" : ""}`}>
    <header className="site-header flex items-center justify-between gap-4">
      <a href="#" className="brand flex items-center gap-2.5" aria-label="Clearspace home"><span className="brand-mark"><Icon name="spark" size={21} /></span>clearspace<span className="prototype-tag">BETA</span></a>
      <div className="flex items-center gap-4"><span className="header-caption muted hidden sm:block">A web that works for you.</span><button className="icon-button" disabled={!ready || busy} onClick={() => { setLight(!light); setStatus("Theme changed. Select Save and apply to remember it."); }} aria-label={`Switch to ${light ? "dark" : "light"} mode`}><Icon name={light ? "moon" : "sun"} /></button></div>
    </header>

    <main className="main-content w-full mx-auto">
      <section className="welcome text-center" aria-labelledby="welcome-title">
        <div className="welcome-icon mx-auto"><Icon name="spark" size={29} /></div>
        <p className="eyebrow muted">LESS FRICTION. MORE POSSIBILITY.</p>
        <h1 id="welcome-title">The web, on your terms.</h1>
        <p className="intro muted">Welcome to Clearspace. A little space to make the web feel right for you.</p>
        {!isExtension && <p className="controls-feedback text-sm">You’re viewing the local demo. To adjust websites, run <code>npm run build</code>, open <code>chrome://extensions</code>, enable Developer mode and load this project’s <code>dist</code> folder. Then open a website and click the Clearspace toolbar icon.</p>}
      </section>

      <section className="accessibility-section" aria-labelledby="adjustments-title">
        <div className="flex items-center justify-between gap-3 mb-2"><h2 id="adjustments-title" className="text-sm font-medium">What would make browsing easier?</h2><span className="optional-tag">OPTIONAL</span></div>
        <p className="muted text-sm">Choose what works for you. You can mix and match.</p>
        <fieldset disabled={!ready || busy} className="adjustments-fieldset grid grid-cols-1 min-[480px]:grid-cols-2 gap-3 mt-6 items-start">{groups.map(group => <AccessibilityCard key={group.id} group={group} selected={selected} onToggle={toggle} colour={colour} onColourChange={changeColour} enabled={enabled} />)}</fieldset>
        <div className="selection-summary muted flex items-center justify-between gap-3 text-xs"><span>{selectionCount ? `${selectionCount} adjustment${selectionCount === 1 ? "" : "s"} selected. Your space, your preferences.` : "No labels needed. Just choose the adjustments that help."}</span>{selectionCount > 0 && <button type="button" className="clear-button shrink-0" disabled={!ready || busy} onClick={clearChoices}>Clear all</button>}</div>
      </section>

      <section className="extension-controls" aria-label="Extension controls">
        {!isExtension && <p className="optional-tag mb-4">LOCAL UI DEMO — does not adjust websites</p>}
        <div className="browsing-controls">
          <div className="controls-heading">
            <div><h2 className="text-base font-medium">Your browsing preferences</h2><p id="adjustments-help" className="muted control-description">Choose adjustments below, then save to use them on your page.</p></div>
            <label className="adjustments-switch">
              <input type="checkbox" role="switch" aria-label="Enable webpage adjustments" aria-describedby="adjustments-help adjustments-off-help" checked={enabled} disabled={!ready || busy} onChange={event => { setEnabled(event.target.checked); setStatus("Unsaved changes. Select Save and apply."); }} />
              <span className="switch-track" aria-hidden="true"><span /></span>
              <span className="switch-label">{enabled ? "On" : "Off"}</span>
            </label>
          </div>
          <p id="adjustments-off-help" className="muted control-description">Switch off and save to pause adjustments. Your choices stay remembered.</p>
          <div className="controls-actions">
            <button type="button" className="preview-button controls-save" disabled={!ready || busy} onClick={() => persist()}>{busy ? "Saving…" : "Save and apply"}<Icon name="arrow" size={16} /></button>
            <button type="button" className="secondary-button" aria-describedby="reset-help" disabled={!ready || busy} onClick={() => persist(true)}>Reset choices</button>
          </div>
          <p id="reset-help" className="muted control-caption">Reset clears your selections and removes their effects.</p>
          {isExtension && <div className="automatic-access">
            <span className="automatic-icon"><Icon name="spark" size={20} /></span>
            <div className="automatic-copy"><h3 className="text-sm font-medium">Take your preferences with you</h3><p className="muted control-description">Allow site access to use saved adjustments automatically as you browse.</p></div>
            <button type="button" className="secondary-button" disabled={!ready || busy} onClick={allowAutomatic}>Allow site access<Icon name="arrow" size={15} /></button>
          </div>}
        </div>
        <details className="controls-help muted"><summary>How does site access work?</summary><p>Without automatic access, open a webpage and click the Clearspace extension icon first. Automatic access is optional and also covers new webpages. Browser settings pages and some protected pages cannot be adjusted. Manage site access in Chrome's extension Details page.</p></details>
        <p role="status" className={status ? "controls-feedback text-sm" : ""}>{status}</p>
        {error && <p role="alert" className="controls-feedback text-sm">{error}</p>}
      </section>

      <p className="closing-note muted text-center text-xs">Made for different minds, eyes, and ways of moving through the world.</p>
    </main>

    <footer className="site-footer"><div className="flex flex-wrap items-center justify-between gap-4"><p className="text-xs">A small project. A more accessible web.</p><a className="repo-link flex items-center gap-2 text-xs" href="https://github.com/PhoneThantTayza/HackCamp" target="_blank" rel="noreferrer"><Icon name="github" size={16} />Built together on GitHub<Icon name="arrow" size={14} /></a></div><div className="footer-bottom flex flex-wrap items-center justify-between gap-3 text-xs muted"><span>Gricelia Lin <span aria-hidden="true">·</span> Phone Thant Tayza <span aria-hidden="true">·</span> Tonnam Tantikamnerdkul</span><span>Clearspace · HackCamp 2026</span></div></footer>
  </div>;
}
