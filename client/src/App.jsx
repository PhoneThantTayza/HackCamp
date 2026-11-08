import React, { useEffect, useRef, useState } from "react";
import { defaults, motor, focusMode, colorVision, lowVision, lowVisionOptions, lightSensitivity, lightSensitivityOptions, unsupported, isExtension, isFirefox, extensionApi, loadSettings, saveSettings, applyToTarget } from "./settings.js";
import { emptyDyslexia, restoreDyslexia, dyslexiaChoiceCount } from "./dyslexia-settings.js";
import ReadAloud from "./ReadAloud.jsx";
import CombinedPreview from "./CombinedPreview.jsx";
import DyslexiaSlider from './DyslexiaSlider.jsx';

const groups = [
  { id: "vision", name: "Vision", icon: "eye", description: "A little more clarity.", options: [] },
  { id: "dyslexia", name: "Dyslexia", icon: "type", description: "Reading at your rhythm.", options: [] },
  { id: "motor", name: "Motor / mobility", icon: "hand", description: "More room to navigate.", options: ["Larger click targets", "Extra button spacing", "Keyboard focus indicators", "Reduce motion"] },
  { id: "cognitive", name: "Cognitive", icon: "brain", description: "Less noise. More focus.", options: ["Focus mode", "Hide distractions"] },
];

function Icon({ name, size = 20, ...props }) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    moon: <path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z" />,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    brain: <><path d="M12 5a3 3 0 0 0-6 0v.4a4 4 0 0 0-2 6.6 4 4 0 0 0 2 6.6v.4a3 3 0 0 0 6 0V5Zm0 0a3 3 0 0 1 6 0v.4a4 4 0 0 1 2 6.6 4 4 0 0 1-2 6.6v.4a3 3 0 0 1-6 0" /><g className="brain-folds"><path d="M6 5c0 2 1 3 3 3m-5 4h3c2 0 2 3 0 3m-1 4c0-2 1-3 3-3m9-11c0 2-1 3-3 3m5 4h-3c-2 0-2 3 0 3m1 4c0-2-1-3-3-3" /></g></>,
    type: <><path d="M4 19 10 5l6 14M6 15h8m2-5h6m-3 0v9" /></>,
    hand: <><path d="M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2Z" /></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    link: <><path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    github: <><path d="M9 19c-5 1-5-2-7-2m14 5v-4c0-1-.4-2-1-2 4-.5 6-2 6-6 0-1-.5-3-1.5-4 .5-1 .5-2 0-3-2 0-3 1-4 1a13 13 0 0 0-7 0C7 3 6 2 4 3c-.5 1-.5 2 0 3-1 1-1.5 3-1.5 4 0 4 2 5.5 6 6-.6.5-1 1-1 2v4" /></>,
  };
  return <svg data-icon={name} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function ColourVisionControls({ value, onChange, enabled }) {
  const [open, setOpen] = useState(false);
  const filtered = enabled && value.mode !== "off" && value.strength > 0;
  const samples = [["#d53b35", "Red", "●"], ["#27834a", "Green", "▲"], ["#246fce", "Blue", "■"], ["#e5b52e", "Yellow", "◆"]];
  return <div className="colour-controls">
    <h3 className="text-sm font-medium"><button type="button" className="category-button colour-toggle" aria-expanded={open} aria-controls="colour-options" onClick={() => setOpen(!open)}><span>Colour blindness</span><span className={`chevron ${open ? "rotate-180" : ""}`}><Icon name="chevron" size={18} /></span></button></h3>
    <div id="colour-options" hidden={!open}>
    <p id="colour-help" className="muted control-description">Try a palette and choose the strength that makes colours easier for you to tell apart.</p>
    <label htmlFor="colour-mode" className="colour-label">Colour assistance</label>
    <select id="colour-mode" className="colour-select" value={value.mode} aria-describedby={value.mode === "off" ? "colour-help" : "colour-help colour-limit"} onChange={event => onChange({ ...value, mode: event.target.value })}>
      <option value="off">Off — original colours</option>
      <option value="protan">Red–green: red emphasis (protan)</option>
      <option value="deutan">Red–green: green emphasis (deutan)</option>
      <option value="tritan">Blue–yellow (tritan)</option>
    </select>
    {value.mode !== "off" && <>
    <div className="colour-strength"><label htmlFor="colour-strength">Strength</label><output htmlFor="colour-strength">{value.strength}%</output></div>
    <input id="colour-strength" className="colour-range" type="range" min="0" max="200" step="5" value={value.strength} disabled={value.mode === "off"} onChange={event => onChange({ ...value, strength: Number(event.target.value) })} />
    <label className="option-row"><input type="checkbox" checked={value.cues} onChange={event => onChange({ ...value, cues: event.target.checked })} /><span>Use cues beyond colour<small className="muted block">Underline links, outline controls and mark invalid fields with dashed outlines.</small></span></label>
    <div className="colour-preview">
      <svg width="0" height="0" aria-hidden="true" className="colour-filter-defs"><defs><filter id="clearspace-sample-colour" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={colorVision.matrix(value)} /></filter></defs></svg>
      <p className="colour-label">Live colour sample{!enabled && " · adjustments paused"}</p>
      {[false, true].map(adjusted => <div key={String(adjusted)} className="colour-sample-row"><span className="muted">{adjusted ? "Your settings" : "Original"}</span><div className="colour-swatches" style={{ filter: adjusted && filtered ? "url(#clearspace-sample-colour)" : "none" }}>{samples.map(([colour, name, shape]) => <div key={name} className="colour-swatch"><span style={{ backgroundColor: colour }} aria-hidden="true">{shape}</span><small>{name}</small></div>)}</div></div>)}
    </div>
    <p id="colour-limit" className="muted control-caption">Colour remapping affects the whole page, including images. Results vary; this is assistance, not a simulation or a correction. Changes save and apply to connected webpages automatically.</p>
    </>}
    </div>
  </div>;
}

function ContrastSample({ active, strength }) {
  const ref = useRef(null);
  useEffect(() => {
    if (active) return lowVision.applyContrast(ref.current, strength);
  }, [active, strength]);
  return <div ref={ref}><p className="contrast-muted">Details should be easy to read, too.</p><button type="button">Sample control</button></div>;
}

function LowVisionSample({ kind, active, enabled, strength }) {
  const metrics = lowVision.metrics(strength);
  const sampleStyle = {
    "--low-zoom": metrics.zoom, "--low-target": `${metrics.target * metrics.zoom}px`,
    "--low-line-height": metrics.lineHeight, "--low-weight": metrics.weight, "--low-underline": `${metrics.underline}em`,
    "--low-offset": `${metrics.offset}em`, "--low-outline": `${metrics.outline}px`, "--low-ring": `${metrics.ring}px`,
  };
  return <div className="colour-preview low-vision-preview">
    <p className="colour-label">Live sample{!enabled && " · adjustments paused"}</p>
    {[false, true].map(adjusted => <div key={String(adjusted)} className="colour-sample-row">
      <span className="muted">{adjusted ? "Your settings" : "Original"}</span>
      <div style={sampleStyle} className={`low-vision-sample low-vision-sample-${kind}${adjusted && active && enabled && strength > 0 ? " is-adjusted" : ""}`}>
        {kind === "size" && <><p>A little more room to read.</p><button type="button">Sample control</button></>}
        {kind === "contrast" && <ContrastSample active={adjusted && active && enabled && strength > 0} strength={strength} />}
        {kind === "links" && <p>Read our <a href="#low-vision-options" onClick={event => event.preventDefault()}>browsing guide</a> for more ideas.</p>}
        {kind === "focus" && <button type="button" className="sample-focus-target">Sample focus</button>}
      </div>
    </div>)}
    {kind === "focus" && <p className="muted control-caption">Outline shown as a preview. Tab to a sample button to try keyboard focus.</p>}
  </div>;
}

function LowVisionControls({ selected, onToggle, enabled, strengths, onStrengthChange }) {
  const [open, setOpen] = useState(false);
  const descriptions = [
    "Enlarge the page by up to 50% and give controls more room.",
    "Gradually improve text contrast while keeping the page's background colours.",
    "Emphasize links with bold text and thicker underlines.",
    "Show a strong black-and-white outline as you tab through the page.",
  ];
  return <div className="low-vision-controls">
    <h3 className="text-sm font-medium"><button type="button" className="category-button colour-toggle" aria-expanded={open} aria-controls="low-vision-options" onClick={() => setOpen(!open)}><span>Low vision</span><span className={`chevron ${open ? "rotate-180" : ""}`}><Icon name="chevron" size={18} /></span></button></h3>
    <div id="low-vision-options" hidden={!open}>
      <p className="muted control-description">Choose what makes webpages easier to see. Changes apply automatically across websites with site access.</p>
      {lowVisionOptions.map((option, index) => <div key={option} className="low-vision-option">
        <label className="option-row"><input type="checkbox" checked={selected.includes(`vision:${option}`)} onChange={() => onToggle(`vision:${option}`)} /><span>{option}<small className="muted block">{descriptions[index]}</small></span></label>
        {selected.includes(`vision:${option}`) && <>
        <div className="colour-strength"><label htmlFor={`low-vision-strength-${index}`}>Strength<span className="sr-only"> for {option}</span></label><output htmlFor={`low-vision-strength-${index}`}>{strengths[option]}%</output></div>
        <input id={`low-vision-strength-${index}`} className="colour-range" type="range" min="0" max={lowVision.maxStrength} step="5" value={strengths[option]} disabled={!selected.includes(`vision:${option}`)} onChange={event => onStrengthChange({ ...strengths, [option]: Number(event.target.value) })} />
        <LowVisionSample strength={strengths[option]} kind={["size", "contrast", "links", "focus"][index]} active={selected.includes(`vision:${option}`)} enabled={enabled} />
        </>}
      </div>)}
      <p className="muted control-caption">Your choices save and apply to connected webpages automatically.</p>
    </div>
  </div>;
}

function LightSensitivitySample({ option, strengths, enabled }) {
  const ref = useRef(null);
  useEffect(() => {
    if (enabled) return lightSensitivity.applySurfaces(ref.current, [option], strengths);
  }, [option, strengths, enabled]);
  return <div className="colour-preview">
    <p className="colour-label">Live sample{!enabled && " · adjustments paused"}</p>
    {[false, true].map(adjusted => <div key={String(adjusted)} className="colour-sample-row">
      <span className="muted">{adjusted ? "Your settings" : "Original"}</span>
      <div ref={adjusted ? ref : undefined} className="light-sensitivity-sample" style={{ filter: adjusted && enabled ? lightSensitivity.filters([option], strengths) : undefined }}>
        <p>A softer space to browse.</p><p>Read a little, explore a little.</p>
        <a href="#light-sensitivity-options" onClick={event => event.preventDefault()}>Sample link</a>
        <button type="button">Sample control</button>
      </div>
    </div>)}
  </div>;
}

function LightSensitivityControls({ selected, onToggle, enabled, strengths, onStrengthChange }) {
  const [open, setOpen] = useState(false);
  const active = lightSensitivityOptions.filter(option => selected.includes(`vision:${option}`));
  const titles = [
    'Webpages feel too bright',
    'Bright backgrounds are uncomfortable',
    'Cool or harsh colours bother my eyes',
    'Light backgrounds make reading difficult',
  ];
  const descriptions = [
    "Lower the brightness of the webpage, including images and videos.",
    "Replace bright, nearly white surfaces with softer neutral shades.",
    "Give the page a gentle warm tint, including images and videos.",
    "Use dark page surfaces and light text while keeping images in their original colours.",
  ];
  return <div className="low-vision-controls">
    <h3 className="text-sm font-medium"><button type="button" className="category-button colour-toggle" aria-expanded={open} aria-controls="light-sensitivity-options" onClick={() => setOpen(!open)}><span>Light sensitivity</span><span className={`chevron ${open ? "rotate-180" : ""}`}><Icon name="chevron" size={18} /></span></button></h3>
    <div id="light-sensitivity-options" hidden={!open}>
      <p className="muted control-description">Choose a comfortable level of light and warmth for your webpages.</p>
      {lightSensitivityOptions.map((option, index) => <div key={option} className="low-vision-option">
        <label className="option-row"><input type="checkbox" checked={active.includes(option)} onChange={() => onToggle(`vision:${option}`)} /><span>{titles[index]}<small className="muted block">{descriptions[index]}</small></span></label>
        {active.includes(option) && <>
        {option !== "Dark page theme" && <>
          <div className="colour-strength"><label htmlFor={`light-strength-${index}`}>Strength<span className="sr-only"> for {titles[index]}</span></label><output htmlFor={`light-strength-${index}`}>{strengths[option]}%</output></div>
          <input id={`light-strength-${index}`} className="colour-range" type="range" min="0" max="200" step="5" value={strengths[option]} onChange={event => onStrengthChange({ ...strengths, [option]: Number(event.target.value) })} />
        </>}
        <LightSensitivitySample option={option} strengths={strengths} enabled={enabled} />
        </>}
      </div>)}
      <p className="muted control-caption">Changes save and apply to connected webpages automatically. Brightness adjustments affect webpage content, not your screen brightness. Website styling can affect results.</p>
    </div>
  </div>;
}

function FocusModeControls({ value, onChange, enabled }) {
  const [center, setCenter] = useState(90);
  return <div className="focus-controls">
    <p className="muted control-description">Keep a clear reading band while dimming the surrounding page. Follow your pointer or Tab through links and controls. After saving, right-click anywhere on the webpage to turn the reading band on, then right-click again to turn it off. Escape also turns it off. Focus mode must stay selected; right-click replaces the usual context menu while selected.</p>
    <div className="colour-strength"><label htmlFor="focus-height">Reading band height</label><output htmlFor="focus-height">{value.height}px</output></div>
    <input id="focus-height" className="colour-range" type="range" min="40" max="320" step="10" value={value.height} onChange={event => onChange({ ...value, height: Number(event.target.value) })} />
    <div className="colour-strength"><label htmlFor="focus-dimming">Surrounding dimming</label><output htmlFor="focus-dimming">{value.dimming}%</output></div>
    <input id="focus-dimming" className="colour-range" type="range" min="0" max="90" step="5" value={value.dimming} onChange={event => onChange({ ...value, dimming: Number(event.target.value) })} />
    <p className="colour-label">Live sample{!enabled && " · adjustments paused"}</p>
    <div className="focus-sample" onPointerMove={event => setCenter(event.clientY - event.currentTarget.getBoundingClientRect().top)} onFocus={() => setCenter(100)}>
      <p>A quieter space to read.</p><p>Move your pointer over this sample.</p><p>Keep your place, one line at a time.</p>
      <button type="button">Sample control</button>
      {enabled && <div className="focus-sample-shade" aria-hidden="true" style={{ background: focusMode.background(value, center) }} />}
    </div>
    <p className="muted control-caption">Changes save and apply to connected webpages automatically. At 0% dimming, the page stays unchanged.</p>
  </div>;
}

function DyslexiaLabel({ id, label, value, active, interacting }) {
  const host = useRef(null);
  useEffect(() => {
    const root = host.current.shadowRoot ?? host.current.attachShadow({ mode: 'open' });
    const text = document.createElement('p');
    text.style.margin = '0';
    text.textContent = label;
    root.append(text);
    const controller = globalThis.clearspaceDyslexia.createController(root);
    if (active) controller.apply({
      experiences: { [id]: true },
      // Avoid the engine's document-wide contrast scan in a local preview.
      customization: { ...value.customization, allTextContrast: false,
        ...(!interacting ? { guide: false, wordHighlight: false, focusParagraph: false } : {}) },
    });
    return () => { controller.reset(); text.remove(); };
  }, [id, label, active, interacting, value.customization]);
  return <span ref={host} className="dyslexia-live-label" />;
}

function DyslexiaControls({ value, onChange, enabled, speechReset, query, mutualOnly = false, prefix = 'dyslexia' }) {
  const [previewChoice, setPreviewChoice] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedChoices, setExpandedChoices] = useState(() => ({ ...value.experiences }));
  const custom = value.customization;

  const sections = [
    { title: 'Reading comfort', choices: [
      ['distinguishWords', 'Hard to distinguish letters or words', 'Readable font, wider spacing. Hover to highlight the current word.'],
      ['readingFatigue', 'Reading feels tiring over time', 'Hover a passage to highlight it without hiding surrounding content.'],
    ] },
    { title: 'Reading comprehension', choices: [
      ['overwhelmingParagraphs', 'Long paragraphs feel overwhelming', 'Extra paragraph space, shorter lines, more line spacing.'],
      ['unfamiliarWords', 'Unfamiliar words are hard to sound out', 'Select a word or short phrase to open Google results for its definition and pronunciation. Selected text is sent to Google.'],
    ] },
    { title: 'Reading focus & tracking', choices: [
      ['losePlace', 'Hard to stay focused while reading', 'Shared by Dyslexia and Cognitive. A colored reading band follows your pointer. Right-click toggles.'],
    ] },
    { title: 'Reading pace & listening', choices: [
      ['preferListening', 'I prefer listening to text', 'Highlight text to hear it read aloud. Escape stops.'],
    ] },
  ];
  const numberFields = [
    ['lineHeight', 'Space between lines', 1, 2.5, 0.1],
    ['letterSpacing', 'Space between letters (em)', 0, 0.2, 0.01],
    ['wordSpacing', 'Space between words (em)', 0, 0.5, 0.01],
    ['lineLength', 'Line width (characters)', 30, 100, 1],
    ['paragraphSpacing', 'Space after paragraphs (em)', 0, 2, 0.1],
    ['guideSize', 'Guide height (pixels)', 20, 160, 1],
    ['dimming', 'Surrounding dimness (0–0.6)', 0, 0.6, 0.05],
  ];

  function customize(key, next) {
    const customization = { ...custom };
    if (next === undefined) delete customization[key];
    else customization[key] = next;
    onChange({ ...value, enabled: true, customization });
  }

  const fieldsByChoice = {
    distinguishWords: ['font', 'letterSpacing', 'wordSpacing', 'wordHighlight', 'allTextContrast'],
    readingFatigue: ['focusParagraph', 'dimming'],
    overwhelmingParagraphs: ['lineHeight', 'lineLength', 'paragraphSpacing', 'alignStart'],
    losePlace: ['guideSize', 'dimming', 'guideColor'],
  };

  const filtered = sections.filter(section => !mutualOnly || section.choices.some(([id]) => id === 'losePlace')).map(section => ({ ...section, choices: section.choices.filter(choice =>
    `${section.title} ${choice[1]} ${choice[2]}`.toLowerCase().includes(query.toLowerCase())) })).filter(section => section.choices.length);

  return <div className="dyslexia-controls">
      {Object.keys(custom).length > 0 && <div className="dyslexia-help">
        <p className="muted">Custom settings are overriding some suggestions.</p>
        <button type="button" className="clear-button" onClick={() => onChange({ ...value, enabled: true, customization: {} })}>Clear custom overrides</button>
      </div>}
      {filtered.map(section => {
        const sectionId = `${prefix}-section-${section.choices[0][0]}`;
        const expanded = Boolean(mutualOnly || expandedSections[section.title] || query);
        return <section className="dyslexia-section" key={section.title}>
        {!mutualOnly && <h3 className="text-sm font-medium"><button type="button" className="category-button colour-toggle" aria-expanded={expanded} aria-controls={sectionId}
          onClick={() => setExpandedSections(current => ({ ...current, [section.title]: !expanded }))}>
          <span>{section.title}</span><span className={`chevron ${expanded ? "rotate-180" : ""}`}><Icon name="chevron" size={18} /></span>
        </button></h3>}
        <div id={sectionId} hidden={!expanded}>
        {section.choices.map(([id, label, help, unavailable]) => <details key={id} className="dyslexia-choice" open={expandedChoices[id] === true}
          onToggle={event => { const expanded = event.currentTarget.open; setExpandedChoices(current => current[id] === expanded ? current : { ...current, [id]: expanded }); }}>
          <summary className="dyslexia-choice-summary"
            onPointerEnter={() => setPreviewChoice(id)} onPointerLeave={() => setPreviewChoice(null)}
            onFocusCapture={() => setPreviewChoice(id)}
            onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPreviewChoice(null); }}>
            <label className="option-row" htmlFor={`${prefix}-${id}`}>
              <input id={`${prefix}-${id}`} type="checkbox" disabled={unavailable} checked={!unavailable && value.experiences[id] === true}
                onChange={event => {
                  const checked = event.target.checked;
                  setExpandedChoices(current => ({ ...current, [id]: checked }));
                  onChange({ ...value, enabled: true, experiences: { ...value.experiences, [id]: checked } });
                }} />
              <span className="dyslexia-label-copy"><DyslexiaLabel id={id} label={label} value={value}
                interacting={previewChoice === id}
                active={!unavailable && (previewChoice === id || value.experiences[id] === true)} />
                <small className="muted block">{help}</small></span>
            </label>
          </summary>
          <div className="dyslexia-choice-content">
            {fieldsByChoice[id] && <div className="dyslexia-customization">
        {id === "distinguishWords" && <label className="dyslexia-field">Font
          <select aria-label="Font" value={custom.font === null ? 'website' : custom.font ?? ''} onChange={event => customize('font', event.target.value === '' ? undefined : event.target.value === 'website' ? null : event.target.value)}>
            <option value="">Suggested</option><option value="website">Keep website font</option><option value="sans">Arial / sans serif</option><option value="serif">Georgia / serif</option><option value="system">System font</option>
          </select>
        </label>}
        {numberFields.filter(([key]) => fieldsByChoice[id].includes(key)).map(field => <DyslexiaSlider key={field[0]}
          field={field} custom={custom} onChange={customize}
          suggested={globalThis.clearspaceDyslexia.suggest({ ...value, experiences: { ...value.experiences, [id]: true } })} />)}
        {[['wordHighlight', 'Highlight the word under your pointer'], ['focusParagraph', 'Highlight the current passage'], ['allTextContrast', 'Contrast backgrounds for all text'], ['alignStart', 'Align to reading direction']].filter(([key]) => fieldsByChoice[id].includes(key)).map(([key, label]) => <label className="dyslexia-field" key={key}>{label}
          <select aria-label={label} value={custom[key] === undefined ? '' : String(custom[key])} onChange={event => customize(key, event.target.value === '' ? undefined : event.target.value === 'true')}>
            <option value="">Suggested</option><option value="true">On</option><option value="false">Off</option>
          </select>
        </label>)}
        {[['guideColor', 'Guide color', '#ffe58a']].filter(([key]) => fieldsByChoice[id].includes(key)).map(([key, label, fallback]) => <div className="dyslexia-color" key={key}>
          <label className="option-row"><input type="checkbox" checked={Boolean(custom[key])} onChange={event => customize(key, event.target.checked ? fallback : undefined)} /><span>Choose {label.toLowerCase()}</span></label>
          {custom[key] && <input type="color" aria-label={label} value={custom[key]} onChange={event => customize(key, event.target.value)} />}
        </div>)}
        <button type="button" className="clear-button text-xs" onClick={() => onChange({ ...value, enabled: true, customization: Object.fromEntries(Object.entries(custom).filter(([key]) => !fieldsByChoice[id].includes(key))) })}>Use suggested settings</button>
      </div>}
            {id === 'preferListening' && value.experiences.preferListening === true &&
              <ReadAloud key={speechReset} enabled={enabled} embedded preferences={value.speech}
                onChange={speech => onChange({ ...value, speech })} />}
          </div>
        </details>)}
        {section.note && <p className="muted dyslexia-help">{section.note}</p>}
        </div>
      </section>; })}
      {!filtered.length && <p className="muted text-xs">No matching experiences.</p>}
      <p className="muted dyslexia-help mt-3">Changes save and apply to connected webpages automatically.</p>
  </div>;
}

const motorDescriptions = {
  "Larger click targets": "Buttons and links get bigger, with a soft outline, so they're easier to hit.",
  "Extra button spacing": "Buttons and links get more room between them, so you don't hit the wrong one.",
  "Keyboard focus indicators": "A strong outline shows what you've tabbed to, plus a \"Skip to main content\" button on the first Tab.",
  "Reduce motion": "Animations, autoplaying videos and moving GIFs calm down.",
};

// Each option's slider: which setting it changes and how each level is described
const motorSliders = {
  "Larger click targets": { key: "targetSize", name: "Size", text: level => `${motor.sizeLabel(level)} · ${motor.targetPx(level)}px`, ends: ["Comfortable", "Extra large"], kind: "size" },
  "Extra button spacing": { key: "spacing", name: "Gap", text: level => `${motor.gapLabel(level)} · ${motor.gapPx(level)}px`, ends: ["Small", "Large"], kind: "spacing" },
  "Keyboard focus indicators": { key: "focus", name: "Outline thickness", text: level => `${motor.ringLabel(level)} · ${motor.ringPx(level)}px`, ends: ["Thin", "Thick"], kind: "focus" },
  "Reduce motion": { key: "motion", name: "Strength", text: level => motor.motionLabel(level), ends: ["Gentle", "Still"], kind: "motion" },
};

// One slide-down per Motor adjustment, styled like the Vision sections
const motorSections = [
  { id: "targets", name: "Larger click targets", turnOn: "Small buttons are difficult to click", description: "Choose how big buttons and links should be. Save to apply across websites with site access.", options: ["Larger click targets"] },
  { id: "spacing", name: "Extra button spacing", turnOn: "Buttons are too close together", description: "Choose how much room to leave between buttons and links.", options: ["Extra button spacing"] },
  { id: "keyboard", name: "Keyboard", turnOn: "Hard to tell which element is selected", description: "For browsing with the Tab key instead of a mouse.", options: ["Keyboard focus indicators"] },
  { id: "motion", name: "Reduce motion", turnOn: "Animations and movement are uncomfortable", description: "Stop things moving on their own. Choose how much to calm down.", options: ["Reduce motion"] },
];

function MotorSample({ kind, level, enabled }) {
  if (kind === "motion") {
    const step = motor.motionStep(level);
    const parts = [["Animations and sliding effects", 1], ["Videos that play by themselves", 2], ["Animated GIFs and moving thumbnails", 3]];
    return <div className="colour-preview">
      <p className="colour-label">What {motor.motionLabel(level)} stops{!enabled && " · adjustments paused"}</p>
      <ul className="motor-motion-list">{parts.map(([label, needed]) => <li key={label} className={step >= needed ? "" : "muted"}>{step >= needed ? "✓" : "–"} {label}</li>)}</ul>
    </div>;
  }
  if (kind === "focus") {
    const ring = motor.ringPx(level);
    return <div className="colour-preview">
      <p className="colour-label">Live sample{!enabled && " · adjustments paused"}</p>
      {[false, true].map(adjusted => <div key={String(adjusted)} className="colour-sample-row">
        <span className="muted">{adjusted ? "Your settings" : "Original"}</span>
        <div className="motor-sample"><button type="button" style={adjusted && enabled ? { outline: `${ring}px solid #1a5fff`, outlineOffset: 3, boxShadow: `0 0 0 ${ring + 3}px #fff, 0 0 0 ${ring + 6}px #111` } : {}}>Sample focus</button></div>
      </div>)}
      <p className="muted control-caption">Outline shown as a preview of what keyboard focus looks like.</p>
    </div>;
  }
  return <div className="colour-preview">
    <p className="colour-label">Live sample{!enabled && " · adjustments paused"}</p>
    {[false, true].map(adjusted => {
      const on = adjusted && enabled;
      const px = motor.targetPx(level);
      const linkStyle = on && kind === "size" ? { minWidth: px, minHeight: px, padding: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 10, outline: "2px solid color-mix(in srgb, currentColor 35%, transparent)", outlineOffset: -2 } : {};
      const gap = on && kind === "spacing" ? motor.gapPx(level) : 4;
      return <div key={String(adjusted)} className="colour-sample-row">
        <span className="muted">{adjusted ? "Your settings" : "Original"}</span>
        <div className="motor-sample" style={{ gap }}>
          {["Reply", "Share", "Save"].map(label => <a key={label} href="#motor-options" style={linkStyle} onClick={event => event.preventDefault()}>{label}</a>)}
        </div>
      </div>;
    })}
  </div>;
}

function MotorSection({ section, options, selected, onToggle, value, onChange, enabled }) {
  const [open, setOpen] = useState(false);
  return <div className="low-vision-controls">
    <h3 className="text-sm font-medium"><button type="button" className="category-button colour-toggle" aria-expanded={open} aria-controls={`motor-${section.id}-options`} onClick={() => setOpen(!open)}><span>{section.name}</span><span className={`chevron ${open ? "rotate-180" : ""}`}><Icon name="chevron" size={18} /></span></button></h3>
    <div id={`motor-${section.id}-options`} hidden={!open}>
      <p className="muted control-description">{section.description}</p>
      {options.map(option => {
        const on = selected.includes(`motor:${option}`);
        const slider = motorSliders[option];
        const level = value[slider.key];
        const id = `motor-${slider.key}`;
        return <div key={option} className="low-vision-option">
          <label className="option-row"><input type="checkbox" checked={on} onChange={() => onToggle(`motor:${option}`)} /><span>{section.turnOn}<small className="muted block">{motorDescriptions[option]}</small></span></label>
          {on && <>
            <div className="colour-strength"><label htmlFor={id}>{slider.name}<span className="sr-only"> for {option}</span></label><output htmlFor={id}>{slider.text(level)}</output></div>
            <input id={id} className="colour-range" type="range" min="0" max="100" step="5" value={level} aria-valuetext={slider.text(level)} onChange={event => onChange({ ...value, [slider.key]: Number(event.target.value) })} />
            <div className="motor-range-ends muted" aria-hidden="true"><span>{slider.ends[0]}</span><span>{slider.ends[1]}</span></div>
            <MotorSample kind={slider.kind} level={level} enabled={enabled} />
          </>}
        </div>;
      })}
    </div>
  </div>;
}

function MotorControls({ options, ...props }) {
  return <div id="motor-options">
    {motorSections.map(section => {
      const shown = section.options.filter(option => options.includes(option)); // respects the card's search
      return shown.length > 0 && <MotorSection key={section.id} section={section} options={shown} {...props} />;
    })}
  </div>;
}

function AccessibilityCard({ group, motorSettings, onMotorChange, selected, onToggle, colour, onColourChange, enabled, lowVisionStrengths, onLowVisionChange, lightStrengths, onLightChange, focusSettings, onFocusChange, dyslexia, onDyslexiaChange, speechReset }) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const count = group.options.filter(option => option !== 'Focus mode' && selected.includes(`${group.id}:${option}`)).length + (group.id === 'cognitive' ? Number(dyslexia.experiences.losePlace === true) : 0) + (group.id === "vision" ? Number(colour.mode !== "off") + Number(colour.cues) + [...lowVisionOptions, ...lightSensitivityOptions].filter(option => selected.includes(`vision:${option}`)).length : 0) + (group.id === "dyslexia" ? dyslexiaChoiceCount(dyslexia) : 0);
  const options = group.options.filter(option => option !== 'Focus mode' && `${option} ${option === 'Hide distractions' ? 'Too many distractions on the page' : ''} ${group.id === 'motor' ? motorSections.find(section => section.options.includes(option))?.turnOn ?? '' : ''}`.toLowerCase().includes(query.toLowerCase()));
  const showColour = group.id === "vision" && "colour color blindness protan deutan tritan red green blue yellow strength cues".includes(query.toLowerCase());
  const showLowVision = group.id === "vision" && `low vision strength ${lowVisionOptions.join(" ")}`.toLowerCase().includes(query.toLowerCase());
  const showLight = group.id === "vision" && `light sensitivity brightness dim page soften bright backgrounds warm colour color tint dark page theme strength webpages feel too bright bright backgrounds are uncomfortable cool or harsh colours bother my eyes light backgrounds make reading difficult`.includes(query.toLowerCase());
  const showDyslexia = group.id === "dyslexia" && `dyslexia reading comfort comprehension focus pace listening distinguish words fatigue overwhelming paragraphs unfamiliar lose place listening font spacing line length paragraph guide dimming highlight color`.includes(query.toLowerCase());
  return <section className={`choice-card ${open ? "is-open" : ""}`}>
    <div className="flex items-start justify-between gap-2">
      <span className="category-icon"><Icon name={group.icon} size={23} /></span>
      <button type="button" className="icon-button small" aria-label={`Search ${group.name} adjustments`} aria-expanded={searching} onClick={() => { setSearching(!searching); setOpen(true); }}><Icon name="search" size={16} /></button>
    </div>
    <button type="button" className="category-button" aria-expanded={open} aria-controls={`${group.id}-options`} onClick={() => setOpen(!open)}>
      <span className="flex items-center justify-between gap-2"><span className="text-base font-medium">{group.name}</span><span className={`chevron ${open ? "rotate-180" : ""}`}><Icon name="chevron" size={18} /></span></span>
      <span className="muted mt-2 block text-xs">{group.description}</span>
      <span className="muted mt-5 block text-xs">{count ? `${count} selected` : `${group.id === "vision" ? 3 : group.id === "dyslexia" ? 5 : group.options.length} adjustments`}</span>
    </button>
    {open && <div id={`${group.id}-options`} className="options-list">
      {searching && <input autoFocus type="search" aria-label={`Find ${group.name} adjustment`} placeholder="Find an adjustment…" value={query} onChange={event => setQuery(event.target.value)} className="option-search" />}
      {group.id === "motor" && options.length > 0 && <MotorControls options={options} selected={selected} onToggle={onToggle} value={motorSettings} onChange={onMotorChange} enabled={enabled} />}
      {group.id !== "motor" && options.map(option => <React.Fragment key={option}>
        <label className="option-row"><input type="checkbox" disabled={unsupported.has(option)} checked={selected.includes(`${group.id}:${option}`)} onChange={() => onToggle(`${group.id}:${option}`)} /><span>{option === 'Hide distractions' ? 'Too many distractions on the page' : option}{option === "Hide distractions" && <small className="muted block">Hide ads across the page, plus sidebars, related content and share widgets. Some ads may escape detection. Turn off to restore hidden content.</small>}{unsupported.has(option) && <small className="muted block">Coming later</small>}</span></label>
        {group.id === "cognitive" && option === "Focus mode" && selected.includes("cognitive:Focus mode") && <FocusModeControls value={focusSettings} onChange={onFocusChange} enabled={enabled} />}
      </React.Fragment>)}
      {!options.length && !showColour && !showLowVision && !showLight && group.id !== "dyslexia" && <p className="muted text-xs py-2">No matching adjustments.</p>}
      {showColour && <ColourVisionControls value={colour} onChange={onColourChange} enabled={enabled} />}
      {showLight && <LightSensitivityControls selected={selected} onToggle={onToggle} enabled={enabled} strengths={lightStrengths} onStrengthChange={onLightChange} />}
      {showLowVision && <LowVisionControls strengths={lowVisionStrengths} onStrengthChange={onLowVisionChange} selected={selected} onToggle={onToggle} enabled={enabled} />}
      {group.id === "cognitive" && <DyslexiaControls mutualOnly prefix="cognitive" value={dyslexia} onChange={onDyslexiaChange} enabled={enabled} query={query} />}
      {group.id === "dyslexia" && <DyslexiaControls value={dyslexia} onChange={onDyslexiaChange} enabled={enabled} speechReset={speechReset} query={query} />}
    </div>}
  </section>;
}

export default function App() {
  const sidePanel = new URLSearchParams(location.search).get('panel') === '1';
  const [light, setLight] = useState(false);
  const [selected, setSelected] = useState([]);
  const [dyslexia, setDyslexia] = useState(emptyDyslexia);
  const enabled = true;
  const [colour, setColour] = useState(defaults.colorVision);
  const [lowVisionStrengths, setLowVisionStrengths] = useState(defaults.lowVision);
  const [motorSettings, setMotorSettings] = useState(defaults.motor);
  const [focusSettings, setFocusSettings] = useState(defaults.focusMode);
  const [lightStrengths, setLightStrengths] = useState(defaults.lightSensitivity);
  const [ready, setReady] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const lastSettings = useRef(null);
  const saveRevision = useRef(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [speechReset, setSpeechReset] = useState(0);
  useEffect(() => { loadSettings().then(settings => {
    setFocusSettings(settings.focusMode); setLight(settings.light); setSelected(settings.selected); setDyslexia(restoreDyslexia(settings)); setColour(settings.colorVision); setLowVisionStrengths(settings.lowVision); setLightStrengths(settings.lightSensitivity); setMotorSettings(settings.motor); setReady(true);
  }).catch(() => setError("Could not load settings. Reopen Clearspace to retry.")); }, []);
  useEffect(() => {
    if (!ready) return;
    const settings = { version: 1, enabled, selected, light, colorVision: colour, lowVision: lowVisionStrengths, lightSensitivity: lightStrengths, focusMode: focusSettings, dyslexia, motor: motorSettings };
    const snapshot = JSON.stringify(settings);
    // Loading saved preferences must not overwrite them or trigger a new save.
    if (lastSettings.current === null) { lastSettings.current = snapshot; return; }
    if (lastSettings.current === snapshot) return;
    lastSettings.current = snapshot;
    const revision = ++saveRevision.current;
    setError("");
    setStatus("Saving and applying…");
    // Serialize writes and page updates; skip queued choices superseded by a newer edit.
    saveQueue.current = saveQueue.current.then(async () => {
      if (revision !== saveRevision.current) return;
      try {
        await saveSettings(settings);
        const message = await applyToTarget();
        if (revision === saveRevision.current) setStatus(message);
      } catch (error) {
        if (revision === saveRevision.current) { setStatus(""); setError(error.message); }
      }
    });
  }, [ready, enabled, selected, light, colour, lowVisionStrengths, lightStrengths, focusSettings, dyslexia, motorSettings]);
  function toggle(option) { setSelected(current => current.includes(option) ? current.filter(item => item !== option) : [...current, option]); }
  async function changeDyslexia(value) {
    if (isFirefox && value.experiences.unfamiliarWords === true && !dyslexia.experiences.unfamiliarWords) {
      try {
        const granted = await extensionApi.permissions.request({ data_collection: ['websiteContent'] });
        if (!granted) { setError('Word lookup stays off. It needs your permission to send selected words to Google.'); return; }
      } catch { setError('Firefox could not request word lookup permission. Update Firefox and try again.'); return; }
    }
    const customization = { ...value.customization }; delete customization.guide;
    setDyslexia({ ...value, customization }); setSelected(current => current.filter(item => item !== 'cognitive:Focus mode'));
  }
  function changeColour(value) { setColour(value); }
  function changeMotor(value) { setMotorSettings(value); }
  function changeLowVision(value) { setLowVisionStrengths(value); }
  function changeLight(value) { setLightStrengths(value); }
  function changeFocus(value) { setFocusSettings(value); }
  function clearChoices() { setFocusSettings(defaults.focusMode); setSelected([]); setDyslexia(emptyDyslexia()); setColour(defaults.colorVision); setLowVisionStrengths(defaults.lowVision); setLightStrengths(defaults.lightSensitivity); setMotorSettings(defaults.motor); }
  function resetChoices() { clearChoices(); setSpeechReset(value => value + 1); }
  const choiceCount = selected.length + Number(colour.mode !== "off") + Number(colour.cues) + dyslexiaChoiceCount(dyslexia);

  async function allowAutomatic() {
    setError("");
    try {
      const granted = await extensionApi.permissions.request({ origins: ["http://*/*", "https://*/*"] });
      setStatus(granted ? "Site access granted. Saved settings will apply automatically on permitted webpages." : "Site access declined. Use the extension icon on individual webpages.");
    } catch (error) { setError(error.message); }
  }
  const preview = <CombinedPreview settings={{ version: 1, enabled, selected, colorVision: colour, lowVision: lowVisionStrengths, lightSensitivity: lightStrengths, focusMode: focusSettings, dyslexia, motor: motorSettings }} />;
  return <div className={`app ${light ? "light" : ""} ${sidePanel ? 'side-panel' : ''}`}>
    <header className="site-header flex items-center justify-between gap-4">
      <a href="#" className="brand flex items-center gap-2.5" aria-label="Accessify home"><span className="brand-mark"><img src="./icons/logo-128.png" width="28" height="28" alt="" /></span>accessify<span className="prototype-tag">BETA</span></a>
      <div className="flex items-center gap-4"><span className="header-caption muted hidden sm:block">A web that accessible for you.</span>{sidePanel && <a className="icon-button" href="./index.html" target="_blank" rel="noopener noreferrer" aria-label="Open full settings page"><Icon name="arrow" size={18} /></a>}<button className="icon-button" disabled={!ready} onClick={() => setLight(current => !current)} aria-label={`Switch to ${light ? "dark" : "light"} mode`}><Icon name={light ? "moon" : "sun"} /></button></div>
    </header>

    <main className="main-content w-full mx-auto">
      <section className="welcome text-center" aria-labelledby="welcome-title">
        <div className="welcome-icon mx-auto"><img src="./icons/logo-128.png" width="48" height="48" alt="" /></div>
        <p className="eyebrow muted">LESS FRICTION. MORE POSSIBILITY.</p>
        <h1 id="welcome-title">The web, on your terms.</h1>
        <p className="intro muted">Welcome to Accessify. A little tool to make the web feel right for you.</p>
        {!isExtension && <p className="controls-feedback text-sm">You're viewing the local demo. To adjust websites, run <code>npm run build</code>, open <code>chrome://extensions</code>, enable Developer mode and load this project's <code>dist</code> folder. Then open a website and click the Accessify toolbar icon.</p>}
      </section>

      <section className="accessibility-section" aria-labelledby="adjustments-title">
        <div className="flex items-center justify-between gap-3 mb-2"><h2 id="adjustments-title" className="text-sm font-medium">What would make browsing easier?</h2><span className="optional-tag">OPTIONAL</span></div>
        <p className="muted text-sm">Choose what works for you. You can mix and match.</p>
        <fieldset disabled={!ready} className="adjustments-fieldset grid grid-cols-1 min-[480px]:grid-cols-2 gap-3 mt-6 items-start">{groups.map(group => <AccessibilityCard key={group.id} group={group} motorSettings={motorSettings} onMotorChange={changeMotor} focusSettings={focusSettings} onFocusChange={changeFocus} selected={selected} onToggle={toggle} colour={colour} onColourChange={changeColour} lowVisionStrengths={lowVisionStrengths} onLowVisionChange={changeLowVision} lightStrengths={lightStrengths} onLightChange={changeLight} dyslexia={dyslexia} onDyslexiaChange={changeDyslexia} enabled={enabled} speechReset={speechReset} />)}</fieldset>
        {choiceCount > 0 && <div className="selection-summary muted flex items-center justify-between gap-3 text-xs"><span>{`${choiceCount} preference${choiceCount === 1 ? "" : "s"} selected. Your space, your preferences.`}</span><button type="button" className="clear-button shrink-0" disabled={!ready} onClick={clearChoices}>Clear all</button></div>}

      </section>

      {ready && (sidePanel ? <details className="panel-preview"><summary>Try a sample page<span className="muted">Preview your adjustments</span></summary>{preview}</details> : preview)}

      <section className="extension-controls" aria-label="Browsing controls">
        {!isExtension && <p className="optional-tag mb-4">LOCAL UI DEMO — does not adjust websites</p>}
        <div className="browsing-controls">
          <div className="controls-actions">
            <div className="reset-copy"><h3 className="text-sm font-medium">Reset your preferences</h3><p className="muted control-description">Clear your choices and restore the default settings.</p></div>
            <button type="button" className="secondary-button" disabled={!ready} onClick={resetChoices}>Reset choices</button>
          </div>
          {isExtension && <div className="automatic-access">
            <span className="automatic-icon"><Icon name="spark" size={20} /></span>
            <div className="automatic-copy"><h3 className="text-sm font-medium">Apply automatically as you browse</h3><p className="muted control-description">Allow site access to apply your saved adjustments to existing and newly opened websites. This is optional.</p></div>
            <button type="button" className="secondary-button" disabled={!ready} onClick={allowAutomatic}>Allow site access<Icon name="arrow" size={15} /></button>
          </div>}
          {isExtension && <details className="controls-help muted"><summary>How does site access work?</summary><p>To adjust one website, open it and click the Accessify toolbar icon. To apply your choices automatically across websites, select Allow site access and accept your browser's permission prompt. Browser settings and other protected pages cannot be adjusted. {isFirefox ? 'Review or revoke access in about:addons → Accessify → Permissions.' : "Review or revoke access in Chrome's Extensions → Accessify → Details → Site access."} Refresh adjusted pages after revoking access to remove any remaining effects.</p></details>}
        </div>
        <p role="status" className={status ? "controls-feedback text-sm" : ""}>{status}</p>
        {error && <p role="alert" className="controls-feedback text-sm">{error}</p>}
      </section>

      <p className="closing-note muted text-center text-xs">Made for different minds, eyes, and ways of moving through the world.</p>
    </main>

    <footer className="site-footer"><div className="flex flex-wrap items-center justify-between gap-4"><p className="text-xs">A small project. A more accessible web.</p><a className="repo-link flex items-center gap-2 text-xs" href="https://github.com/PhoneThantTayza/HackCamp" target="_blank" rel="noreferrer"><Icon name="github" size={16} />Built together on GitHub<Icon name="arrow" size={14} /></a></div><div className="footer-bottom flex flex-wrap items-center justify-between gap-3 text-xs muted"><span>Gricelia Lin <span aria-hidden="true">·</span> Phone Thant Tayza <span aria-hidden="true">·</span> Tonnam Tantikamnerdkul</span><span>Accessify · HackCamp 2026</span></div></footer>
  </div>;
}
