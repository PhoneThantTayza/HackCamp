import React, { useEffect, useRef, useState } from 'react';
import { engines, browserPreferences } from '../../../desktop/preferences.mjs';

const bridge = globalThis.clearspaceDesktop;
const sample = 'A little space to find your focus.\n\nClearspace brings your reading preferences beyond the browser. A guide can follow you from a document to your email, while gentle dimming makes the whole desktop more comfortable.\n\nFor a different font, more space between letters, or a simpler reading surface, bring selected text here. The original document stays intact.\n\nChoose the adjustments that feel useful. You can pause them at any time.';
const categories = [
  ['vision', 'Vision', 'A little more clarity.', '◉'], ['dyslexia', 'Dyslexia', 'Reading at your rhythm.', 'Aa'],
  ['motor', 'Motor / mobility', 'More room to navigate.', '↗'], ['cognitive', 'Cognitive', 'Less noise. More focus.', '✧'],
  ['connect', 'Connections', 'Your desktop and browser.', '⇄'],
];
function Toggle({ label, help, scope, checked, onChange, children }) {
  return <div className={`adjustment ${checked ? 'selected' : ''}`}>
    <label className="toggle-row"><span><strong>{label}</strong>{help && <small>{help}</small>}{scope && <span className="scope">{scope}</span>}</span>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
    </label>{checked && children && <div className="adjustment-detail">{children}</div>}
  </div>;
}
function Range({ label, value, min = 0, max = 100, step = 5, onChange, unit = '%' }) {
  return <label className="range-field"><span>{label}<output>{value}{unit}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
function EffectStatus({ effect, name, active, action }) {
  if (!effect || effect.state === 'off') return null;
  return <div className={`notice ${effect.state === 'error' ? 'error' : ''}`} role={effect.state === 'error' ? 'alert' : 'status'}>
    {effect.state === 'pending' ? 'Applying to the desktop… Check for a system permission dialog.' : effect.state === 'active' ? active : effect.error}
    {effect.state === 'error' && <div><button onClick={() => action(() => bridge.retryEffect(name))}>Retry {name === 'colour' ? 'palette' : 'Dark mode'}</button></div>}
  </div>;
}
function ColourSample({ state }) {
  const filtered = state.preferences.enabled && !state.nativeColour && state.preferences.colorVision.mode !== 'off';
  return <div className="colour-sample" aria-label="Palette sample">
    <svg width="0" height="0" aria-hidden="true"><defs><filter id="desktop-palette-sample" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={engines.colour.matrix(state.preferences.colorVision)} /></filter></defs></svg>
    <div className="colour-swatches" style={{ filter: filtered ? 'url(#desktop-palette-sample)' : undefined }}>
      {[['#d93646', '●', 'Red'], ['#339653', '■', 'Green'], ['#377fce', '▲', 'Blue'], ['#e6c243', '◆', 'Yellow']].map(([color, shape, label]) => <span key={label}><b style={{ color }} aria-hidden="true">{shape}</b>{label}</span>)}
    </div><p className="small muted">Palette sample. Neutral greys stay unchanged.</p>
  </div>;
}
function Frame({ state, text = sample }) {
  const ref = useRef(null), [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) ref.current?.contentWindow?.postMessage({ type: 'clearspace:reader', text,
      settings: browserPreferences(state.preferences, { nativeColour: state.nativeColour }) }, location.origin);
  }, [ready, state.preferences, state.nativeColour, text]);
  return <iframe className="reading-frame" ref={ref} src="./desktop-reader.html" title="Adjusted reading view" onLoad={() => setReady(true)} />;
}
function useDesktop() {
  const [state, setState] = useState(null), [error, setError] = useState('');
  const latest = useRef(null);
  useEffect(() => {
    if (!bridge) { setError('Start Clearspace with npm run desktop. This page needs the desktop app.'); return; }
    const update = value => { latest.current = value; setState(value); };
    let active = true;
    const remove = bridge.onState(value => { if (active) update(value); });
    bridge.getState().then(value => { if (active) update(value); }).catch(e => setError(e.message));
    return () => { active = false; remove(); };
  }, []);
  async function action(fn) { try { setError(''); return await fn(); } catch (e) { setError(e.message); } }
  function change(patch) {
    const next = { ...latest.current.preferences, ...patch };
    latest.current = { ...latest.current, preferences: next }; setState(latest.current);
    void action(() => bridge.save(next));
  }
  return { state, error, action, change };
}

function Reader({ state, action, error }) {
  const [draft, setDraft] = useState(state.reader.text), [editing, setEditing] = useState(!state.reader.text);
  const [voices, setVoices] = useState([]), [speaking, setSpeaking] = useState(false), [speechError, setSpeechError] = useState('');
  const run = useRef(0);
  const text = state.reader.text;
  function stop() { run.current++; globalThis.speechSynthesis?.cancel(); setSpeaking(false); }
  useEffect(() => {
    const update = () => setVoices(globalThis.speechSynthesis?.getVoices().filter(v => v.localService) || []);
    update(); globalThis.speechSynthesis?.addEventListener('voiceschanged', update);
    return () => { run.current++; globalThis.speechSynthesis?.cancel(); globalThis.speechSynthesis?.removeEventListener('voiceschanged', update); };
  }, []);
  useEffect(() => { setDraft(text); setEditing(!text); stop(); }, [text]);
  useEffect(() => { if (!state.preferences.enabled) stop(); }, [state.preferences.enabled]);
  useEffect(() => { const escape = e => { if (e.key === 'Escape') stop(); }; addEventListener('keydown', escape); return () => removeEventListener('keydown', escape); }, []);
  function read() {
    stop(); setSpeechError('');
    if (!voices.length) { setSpeechError('No local speech voice is available. Install a voice in your system speech settings.'); return; }
    const chunks = text.match(/.{1,220}(?:\s|$)|\S{1,220}/gs) || [];
    const revision = run.current;
    function next() {
      if (run.current !== revision) return;
      const chunk = chunks.shift(); if (!chunk) { setSpeaking(false); return; }
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.voice = voices.find(v => v.lang.startsWith(navigator.language.split('-')[0])) || voices[0];
      utterance.rate = state.preferences.dyslexia.speech.rate;
      utterance.onend = next;
      utterance.onerror = event => { if (revision === run.current) { setSpeaking(false); setSpeechError(`Speech stopped: ${event.error}.`); } };
      setSpeaking(true); speechSynthesis.speak(utterance);
    }
    next();
  }
  const motor = state.preferences.enabled && state.preferences.selected.includes('motor:Larger click targets');
  const spaced = state.preferences.enabled && state.preferences.selected.includes('motor:Extra button spacing');
  return <main className="reader-app" style={{ '--target-size': motor ? `${engines.motor.targetPx(state.preferences.motor.targetSize)}px` : '42px', '--control-gap': spaced ? `${engines.motor.gapPx(state.preferences.motor.spacing)}px` : '10px' }}>
    <header className="reader-header"><a className="wordmark" href="#">✧ clearspace</a><span className="scope">READING VIEW</span><span className="muted">{state.reader.source || 'Text from any app'}</span></header>
    <div className="reader-toolbar"><button className="primary" onClick={() => action(() => bridge.readClipboard())}>Paste clipboard</button>
      <button onClick={() => setEditing(!editing)}>{editing ? 'Close editor' : 'Edit text'}</button>
      <button disabled={!text || speaking || !state.preferences.enabled} onClick={read}>Read aloud</button><button disabled={!speaking} onClick={stop}>Stop reading</button>
      <button disabled={!text} onClick={() => action(() => bridge.setReader(''))}>Clear text</button>
    </div>
    <p className="reader-hint">Select text in another app and press {state.platform === 'darwin' ? '⌘' : 'Ctrl'}+Shift+R, or paste a passage here. Text stays on this device and is cleared when Clearspace quits.</p>
    {(error || speechError) && <p role="alert" className="notice error">{error || speechError}</p>}
    {editing && <section className="text-editor"><label htmlFor="reader-text">Your passage</label><textarea id="reader-text" maxLength={32768} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Paste text from a document, email, PDF or other application…" /><button className="primary" onClick={() => action(() => bridge.setReader(draft))}>Apply reading preferences</button></section>}
    {text ? <Frame state={state} text={text} /> : <div className="empty-reader"><span>✧</span><h1>A little room to read.</h1><p>Bring a passage here to use your font, spacing, contrast and listening preferences.</p></div>}
  </main>;
}

function Connections({ state, action, change }) {
  const [browser, setBrowser] = useState('chrome'), [extensionId, setExtensionId] = useState(''), [message, setMessage] = useState('');
  return <>
    <section className="panel"><h2>Desktop detection</h2><p>Recognize the active app and follow accessible controls. App names and focus positions stay in memory. Text is read only when you use the reading shortcut.</p>
      <Toggle label="Detect the active application" checked={state.preferences.desktop.detectApps} scope="Desktop" onChange={detectApps => change({ desktop: { ...state.preferences.desktop, detectApps } })} />
      {state.platform === 'darwin' && <div className="notice"><strong>{state.accessibility ? 'Accessibility access is available.' : 'Allow Accessibility access for focus outlines and selected text.'}</strong><p>macOS may list the development helper as clearspace-native. Enable it in Privacy & Security → Accessibility.</p><button onClick={() => action(() => bridge.requestAccessibility())}>Request Accessibility access</button><button onClick={() => action(() => bridge.openSystemSettings('accessibility'))}>Open system settings</button></div>}
      <p className="small muted">Custom-drawn controls, protected windows and apps that do not expose accessibility information may not provide a focus position or selected text. Paste remains available.</p>
    </section>
    <section className="panel"><h2>Connect Chrome or Edge</h2><p>The companion applies your desktop preferences inside webpages, including fonts, spacing, larger buttons and distraction removal.</p>
      <ol className="setup-steps"><li>Open your browser’s extensions page, enable Developer mode and load the companion folder. <button onClick={() => action(() => bridge.showCompanion())}>Show companion folder</button></li><li>Copy its extension ID and enter it below.</li><li>Install the connection, then open the extension and choose Connect to desktop. It will request website access.</li></ol>
      <label className="select-field">Browser<select value={browser} onChange={e => setBrowser(e.target.value)}><option value="chrome">Google Chrome</option><option value="edge">Microsoft Edge</option></select></label>
      <label className="select-field">Companion extension ID<input value={extensionId} maxLength={32} spellCheck={false} placeholder="32 letters from the extensions page" onChange={e => setExtensionId(e.target.value.trim())} /></label>
      <button className="primary" onClick={() => action(async () => { setMessage(await bridge.installCompanion(browser, extensionId)); })}>Install browser connection</button><p role="status">{message}</p>
      <p className="small muted">Use the desktop companion in place of the standalone Clearspace extension to avoid duplicate adjustments. Your browser requests permission before changing websites. The companion pauses when the desktop app closes.</p>
    </section>
    <section className="panel"><h2>Keyboard shortcuts</h2>{state.shortcuts.map(item => <div className="shortcut" key={item.accelerator}><span>{item.label}</span><kbd>{item.accelerator.replace('CommandOrControl', state.platform === 'darwin' ? '⌘' : 'Ctrl')}</kbd>{!item.registered && <span role="alert">Unavailable — another app may be using it.</span>}</div>)}<p className="small muted">Closing the settings window keeps Clearspace in the menu bar or system tray. Choose Quit Clearspace there to stop it.</p></section>
  </>;
}

export default function DesktopApp() {
  const { state, error, action, change } = useDesktop();
  const [category, setCategory] = useState('vision');
  useEffect(() => { document.documentElement.dataset.theme = state?.dark ? 'dark' : 'light'; }, [state?.dark]);
  if (!state) return <main className="loading"><span className="wordmark">✧ clearspace</span><p role={error ? 'alert' : 'status'}>{error || 'Opening your space…'}</p></main>;
  if (new URLSearchParams(location.search).get('view') === 'reader') return <Reader state={state} action={action} error={error} />;
  const p = state.preferences, active = categories.find(c => c[0] === category);
  const selected = choice => p.selected.includes(choice);
  const toggle = choice => change({ selected: selected(choice) ? p.selected.filter(x => x !== choice) : [...p.selected, choice] });
  const desktop = value => change({ desktop: { ...p.desktop, ...value } });
  const dyslexia = value => change({ dyslexia: { ...p.dyslexia, ...value } });
  const experience = (key, value) => {
    const customization = { ...p.dyslexia.customization };
    const fields = {
      distinguishWords: ['font', 'letterSpacing', 'wordSpacing', 'wordHighlight', 'allTextContrast'],
      readingFatigue: ['focusParagraph'], overwhelmingParagraphs: ['lineHeight', 'lineLength', 'paragraphSpacing', 'alignStart'],
      losePlace: ['guide', 'guideSize', 'guideColor', 'dimming'],
    };
    if (!value) for (const field of fields[key] || []) delete customization[field];
    dyslexia({ experiences: { ...p.dyslexia.experiences, [key]: value }, customization });
  };
  const customize = (key, value) => dyslexia({ customization: { ...p.dyslexia.customization, [key]: value } });
  const suggested = engines.dyslexia.suggest(p.dyslexia);
  const lastApp = state.lastExternalApp;
  const excluding = lastApp && p.desktop.excludedApps.includes(lastApp.id);
  return <div className="desktop-app" style={{
    '--target-size': p.enabled && selected('motor:Larger click targets') ? `${engines.motor.targetPx(p.motor.targetSize)}px` : '42px',
    '--control-gap': p.enabled && selected('motor:Extra button spacing') ? `${engines.motor.gapPx(p.motor.spacing)}px` : '10px',
  }}>
    <aside className="sidebar"><div className="wordmark">✧ clearspace<span>DESKTOP</span></div><p className="sidebar-intro">A little space.<br />Across your day.</p>
      <nav aria-label="Adjustment categories">{categories.map(([id, label, , icon]) => <button key={id} aria-current={id === category ? 'page' : undefined} onClick={() => setCategory(id)}><span className="nav-icon" aria-hidden="true">{icon}</span>{label}</button>)}</nav>
      <div className="sidebar-bottom"><span className={`status-dot ${p.enabled ? 'on' : ''}`} />{p.enabled ? 'Adjustments active' : 'Adjustments paused'}<button className="pause-button" onClick={() => change({ enabled: !p.enabled })}>{p.enabled ? 'Pause all adjustments' : 'Resume adjustments'}</button><small>{state.platform === 'darwin' ? 'macOS' : 'Windows'} · {state.displays} display{state.displays === 1 ? '' : 's'}</small></div>
    </aside>
    <main className="desktop-main"><header className="desktop-header"><div><span className="eyebrow">YOUR SPACE, YOUR PREFERENCES</span><h1>The desktop, on your terms.</h1><p>Choose what helps. Take it with you from app to app.</p></div><button className="primary" onClick={() => action(() => bridge.openReader())}>Open reading view <span aria-hidden="true">↗</span></button></header>
      <section className="detection-strip" aria-label="Desktop detection"><span className="app-symbol" aria-hidden="true">▣</span><div><span className="eyebrow">{state.detection ? 'ACTIVE APPLICATION' : 'DESKTOP DETECTION PAUSED'}</span><strong>{state.app?.name || (state.nativeAvailable ? 'Waiting for an application…' : 'Native integration unavailable')}</strong></div><span className="scope">{state.excluded ? 'Paused for this app' : state.accessibility ? 'Focus tracking available' : 'Visual overlays available'}</span>{!state.accessibility && <button onClick={() => setCategory('connect')}>Set up detection</button>}</section>
      {(error || state.warning || state.nativeError) && <p className="notice error" role="alert">{error || state.warning || state.nativeError}</p>}
      {!p.enabled && <p className="notice" role="status">Adjustments are paused. Your preferences are saved.</p>}
      <div className={`workspace ${category === 'connect' ? 'wide' : ''}`}><div className="category-content"><div className="category-heading"><span className="category-symbol">{active[3]}</span><div><h2>{active[1]}</h2><p>{active[2]}</p></div></div>
      {category === 'vision' && <>
        <section className="panel"><h3>Light sensitivity</h3><p>Make the screen feel gentler.</p>
          {engines.light.options.map((name, index) => <Toggle key={name} label={['Dim screen', 'Soften bright backgrounds', 'Warm colour tint', 'Dark mode'][index]} checked={selected(`vision:${name}`)} onChange={() => toggle(`vision:${name}`)} scope={index < 3 ? 'Across the desktop' : 'System appearance + apps that follow it'} help={['A translucent shade across all displays.', 'A soft paper-coloured veil across all displays. Text and images are tinted too.', 'A warm overlay across all displays.', 'Switch the operating system to Dark mode. Apps with their own theme settings may need to follow the system. Your previous appearance is restored on pause or quit.'][index]}>
            {index !== 3 && <Range label="Strength" max={200} value={p.lightSensitivity[name]} onChange={value => change({ lightSensitivity: { ...p.lightSensitivity, [name]: value } })} />}
          </Toggle>)}
          <EffectStatus effect={state.effects?.appearance} name="appearance" active="System Dark mode is active." action={action} />
          {state.effects?.appearance.state === 'error' && <button onClick={() => action(() => bridge.openSystemSettings(state.platform === 'darwin' ? 'automation' : 'appearance'))}>Open {state.platform === 'darwin' ? 'Automation permissions' : 'appearance settings'}</button>}
        </section>
        <section className="panel"><h3>Colour blindness</h3><p>Choose an assistance palette. These are colour remappings; choose what helps you distinguish colours.</p>
          <label className="select-field">Palette<select value={p.colorVision.mode} onChange={e => change({ colorVision: { ...p.colorVision, mode: e.target.value } })}><option value="off">Original colours</option><option value="protan">Red–green · red emphasis</option><option value="deutan">Red–green · green emphasis</option><option value="tritan">Blue–yellow</option></select></label>
          {p.colorVision.mode !== 'off' && <Range label="Palette strength" value={p.colorVision.strength} onChange={strength => change({ colorVision: { ...p.colorVision, strength } })} />}
          <ColourSample state={state} />
          <EffectStatus effect={state.effects?.colour} name="colour" active="Colour assistance is active across the desktop." action={action} />
          {state.platform === 'darwin' && <><p className="small muted">Desktop palettes need Screen Recording permission on macOS 12.3 or later. Frames are processed locally in memory and never saved or uploaded. Protected video may appear blank. Turn off any system colour filter to avoid combining filters.</p>
            {p.colorVision.mode !== 'off' && !state.nativeColour && <div className="permission-actions"><button onClick={() => action(() => bridge.requestScreenCapture())}>Allow desktop colour processing</button><button onClick={() => action(() => bridge.openSystemSettings('screenCapture'))}>Screen Recording settings</button></div>}</>}
          <button onClick={() => action(() => bridge.openSystemSettings('display'))}>System colour filters</button>
          <Toggle label="Use cues beyond colour" help="Outline controls and emphasize links." scope="Reading view + websites" checked={p.colorVision.cues} onChange={cues => change({ colorVision: { ...p.colorVision, cues } })} />
        </section>
        <section className="panel"><h3>Low vision</h3>{engines.low.options.map(name => <Toggle key={name} label={name} checked={selected(`vision:${name}`)} onChange={() => toggle(`vision:${name}`)} scope={name === 'More visible keyboard focus' ? 'Desktop focus outline + reading view + websites' : 'Reading view + websites'}><Range label="Strength" max={200} value={p.lowVision[name]} onChange={value => change({ lowVision: { ...p.lowVision, [name]: value } })} /></Toggle>)}<p className="small muted">Use system magnification to enlarge other applications without changing their layouts.</p><button onClick={() => action(() => bridge.openSystemSettings('zoom'))}>System magnification</button></section>
      </>}
      {category === 'dyslexia' && <>
        <section className="panel"><h3>Reading comfort</h3>
          <Toggle label="Hard to distinguish letters or words" help="Readable fonts, wider spacing and a highlight under the word you point at." scope="Reading view + websites" checked={p.dyslexia.experiences.distinguishWords} onChange={v => experience('distinguishWords', v)}>
            <label className="select-field">Font<select value={suggested.font || 'system'} onChange={e => customize('font', e.target.value)}><option value="sans">Arial / sans serif</option><option value="serif">Georgia / serif</option><option value="system">System font</option></select></label>
            <Range label="Letter spacing" max={0.2} step={0.01} unit="em" value={suggested.letterSpacing ?? 0.06} onChange={v => customize('letterSpacing', v)} /><Range label="Word spacing" max={0.5} step={0.01} unit="em" value={suggested.wordSpacing ?? 0.12} onChange={v => customize('wordSpacing', v)} />
            <Toggle label="Highlight the current word" checked={suggested.wordHighlight} onChange={v => customize('wordHighlight', v)} />
          </Toggle>
          <Toggle label="Reading feels tiring over time" help="Highlight the passage under your pointer." scope="Reading view + websites" checked={p.dyslexia.experiences.readingFatigue} onChange={v => experience('readingFatigue', v)} />
          <Toggle label="Long paragraphs feel overwhelming" help="Shorter lines and more room between lines and paragraphs." scope="Reading view + websites" checked={p.dyslexia.experiences.overwhelmingParagraphs} onChange={v => experience('overwhelmingParagraphs', v)}>
            <Range label="Line height" min={1} max={2.5} step={0.1} unit="×" value={suggested.lineHeight ?? 1.8} onChange={v => customize('lineHeight', v)} /><Range label="Line length" min={30} max={100} step={1} unit="ch" value={suggested.lineLength ?? 60} onChange={v => customize('lineLength', v)} /><Range label="Paragraph spacing" max={2} step={0.1} unit="em" value={suggested.paragraphSpacing ?? 0.9} onChange={v => customize('paragraphSpacing', v)} />
          </Toggle>
        </section>
        <section className="panel"><h3>Focus and listening</h3><FocusControls p={p} suggested={suggested} experience={experience} customize={customize} desktop={desktop} />
          <Toggle label="I prefer listening to text" help="Read highlighted text in the reading view and websites. Bring a selection from another app with the reading shortcut." scope="Selected text from accessible apps + reading view + websites" checked={p.dyslexia.experiences.preferListening} onChange={v => experience('preferListening', v)}><Range label="Reading speed" min={0.5} max={2} step={0.1} value={p.dyslexia.speech.rate} unit="×" onChange={rate => dyslexia({ speech: { rate } })} /></Toggle>
          <p className="small muted">Fonts and paragraph layouts are adjusted in the reading view and connected websites. Other apps keep control of their own typography.</p>
        </section>
      </>}
      {category === 'motor' && <>
        <section className="panel"><h3>More room to navigate</h3>{[['Larger click targets', 'targetSize', 'Target size'], ['Extra button spacing', 'spacing', 'Button spacing'], ['Keyboard focus indicators', 'focus', 'Focus thickness'], ['Reduce motion', 'motion', 'Motion reduction']].map(([name, key, label]) => <Toggle key={key} label={name} checked={selected(`motor:${name}`)} onChange={() => toggle(`motor:${name}`)} scope={key === 'focus' ? 'Desktop focus outline + reading view + websites' : key === 'motion' ? 'Clearspace + websites · system settings for other apps' : 'Clearspace controls + websites'} help={key === 'focus' ? 'Outline the focused control when the active application exposes its position.' : key === 'motion' ? 'Stop supported webpage animations and autoplay. Other applications follow their own motion settings.' : undefined}><Range label={label} value={p.motor[key]} onChange={v => change({ motor: { ...p.motor, [key]: v } })} />{key === 'motion' && <button onClick={() => action(() => bridge.openSystemSettings('motion'))}>System motion settings</button>}</Toggle>)}
          <Toggle label="Make the pointer easier to find" help="A high-contrast ring follows the pointer on every display." scope="Across the desktop" checked={p.desktop.pointerHalo} onChange={pointerHalo => desktop({ pointerHalo })} />
          <p className="small muted">Other apps own their button sizes and spacing. Your operating system provides additional pointer and keyboard tools.</p><button onClick={() => action(() => bridge.openSystemSettings('motor'))}>System pointer and keyboard tools</button>
        </section>
      </>}
      {category === 'cognitive' && <>
        <section className="panel"><h3>Less noise. More focus.</h3><FocusControls p={p} suggested={suggested} experience={experience} customize={customize} desktop={desktop} />
          <Toggle label="Hide distractions" help="Dim the space outside the active window. Connected websites also hide recognized ads and sidebars." scope="Desktop window isolation + websites" checked={selected('cognitive:Hide distractions')} onChange={() => toggle('cognitive:Hide distractions')} />
          <p className="small muted">Window isolation needs access to the active window’s bounds. For a page with no surrounding controls, bring its text into the reading view.</p><button onClick={() => action(() => bridge.openReader())}>Open reading view</button>
        </section>
        <section className="panel"><h3>Make an exception</h3><p>Pause adjustments when a particular application is active.</p>{lastApp ? <Toggle label={lastApp.name} help="Pause while this app is active" checked={excluding} onChange={v => desktop({ excludedApps: v ? [...p.desktop.excludedApps, lastApp.id] : p.desktop.excludedApps.filter(x => x !== lastApp.id) })} /> : <p className="muted">Switch to another application first.</p>}{p.desktop.excludedApps.length > 0 && <div className="exclusions">{p.desktop.excludedApps.map(id => <button key={id} onClick={() => desktop({ excludedApps: p.desktop.excludedApps.filter(x => x !== id) })}>Remove exception: {id} ×</button>)}</div>}</section>
      </>}
      {category === 'connect' && <Connections state={state} action={action} change={change} />}
      <footer className="preferences-footer"><span>Preferences save automatically on this device.</span><button onClick={() => action(() => bridge.reset())}>Reset preferences</button></footer>
      </div>
      {category !== 'connect' && <aside className="preview-column"><section className="preview-panel"><div className="preview-heading"><span className="eyebrow">YOUR READING SPACE</span><span className="live-label">Live</span></div><Frame state={state} /><p>Your reading preferences, working together. Desktop overlays also apply outside this window.</p><button onClick={() => action(() => bridge.openReader())}>Try your own text ↗</button></section><div className="coverage-note"><span>✧</span><p><strong>One set of preferences.</strong><br />Desktop effects follow you between apps. Text and layout adjustments work in the reading view and connected websites.</p></div></aside>}
      </div>
    </main>
  </div>;
}

function FocusControls({ p, suggested, experience, customize, desktop }) {
  return <Toggle label="Focus mode" help="A reading band follows your pointer across the desktop." scope="Across the desktop · shared with Dyslexia and Cognitive" checked={p.dyslexia.experiences.losePlace} onChange={v => experience('losePlace', v)}>
    <Range label="Reading band height" min={20} max={160} step={1} unit="px" value={suggested.guideSize} onChange={v => customize('guideSize', v)} /><Range label="Surrounding dimming" max={0.6} step={0.05} unit="" value={suggested.dimming} onChange={v => customize('dimming', v)} />
    <label className="color-field">Guide colour<input type="color" value={suggested.guideColor} onChange={e => customize('guideColor', e.target.value)} /></label><Toggle label="Follow keyboard focus too" help="Use a control’s location when its app exposes it." checked={p.desktop.followKeyboard} onChange={followKeyboard => desktop({ followKeyboard })} />
  </Toggle>;
}
