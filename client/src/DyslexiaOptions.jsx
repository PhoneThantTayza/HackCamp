import React, { useState } from 'react';
import { dyslexiaChoiceCount } from './dyslexia-settings.js';
import ReadAloud from './ReadAloud.jsx';
import DyslexiaSlider from './DyslexiaSlider.jsx';

const sections = [
  { title: 'Reading comfort', choices: [
    ['distinguishWords', 'Hard to distinguish letters or words', 'Readable font, wider spacing. Hover to highlight the current word.'],
    ['readingFatigue', 'Reading feels tiring over time', 'Hover a passage to highlight it without hiding surrounding content.'],
  ] },
  { title: 'Reading comprehension', choices: [
    ['overwhelmingParagraphs', 'Long paragraphs feel overwhelming', 'Extra paragraph space, shorter lines, more line spacing.'],
    ['unfamiliarWords', 'Unfamiliar words are hard to sound out', 'Word explanations coming later.', true],
  ], note: 'Summaries and simpler language coming later.' },
  { title: 'Reading focus & tracking', choices: [
    ['losePlace', 'I lose my place while reading', 'Pointer-following guide over text and controls. Right-click toggles.'],
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

export default function DyslexiaOptions({ value, onChange, enabled, speechReset, searchIcon }) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const count = dyslexiaChoiceCount(value);
  const custom = value.customization;
  function customize(key, next) {
    const customization = { ...custom };
    if (next === undefined) delete customization[key];
    else customization[key] = next;
    onChange({ ...value, enabled: true, customization });
  }
  const filtered = sections.map(section => ({ ...section, choices: section.choices.filter(choice =>
    `${section.title} ${choice[1]} ${choice[2]}`.toLowerCase().includes(query.toLowerCase())) })).filter(section => section.choices.length);
  return <section className={`choice-card dyslexia-card ${open ? 'is-open' : ''}`}>
    <div className="flex items-start justify-between gap-2">
      <span className="category-icon" aria-hidden="true">Aa</span>
      <button type="button" className="icon-button small" aria-label="Search Dyslexia adjustments" aria-expanded={searching}
        onClick={() => { setSearching(!searching); setOpen(true); }}>{searchIcon}</button>
    </div>
    <button type="button" className="category-button" aria-expanded={open} aria-controls="dyslexia-options" onClick={() => setOpen(!open)}>
      <span className="flex items-center justify-between gap-2"><span className="text-base font-medium">Dyslexia</span><span aria-hidden="true">{open ? '−' : '+'}</span></span>
      <span className="muted mt-2 block text-xs">Reading at your rhythm.</span>
      <span className="muted mt-5 block text-xs">{count ? `${count} selected` : 'Choose what reading feels like'}</span>
    </button>
    {open && <div id="dyslexia-options" className="options-list">
      <p className="muted text-xs leading-relaxed mb-3">Which describes your experience? Select any. We suggest changes for you; customization is optional.</p>
      {Object.keys(custom).length > 0 && <div className="dyslexia-help">
        <p className="muted">Custom settings are overriding some suggestions.</p>
        <button type="button" className="clear-button" onClick={() => onChange({ ...value, enabled: true, customization: {} })}>Clear custom overrides</button>
      </div>}
      {searching && <input autoFocus type="search" className="option-search" aria-label="Find Dyslexia experience" placeholder="Find an experience…" value={query} onChange={event => setQuery(event.target.value)} />}
      {filtered.map(section => <fieldset className="dyslexia-section" key={section.title}>
        <legend>{section.title}</legend>
        {section.choices.map(([id, label, help, unavailable]) => <details key={id} className="dyslexia-choice">
          <summary className="dyslexia-choice-summary">
            <label className="option-row" htmlFor={`dyslexia-${id}`}>
              <input id={`dyslexia-${id}`} type="checkbox" disabled={unavailable} checked={!unavailable && value.experiences[id] === true}
                onChange={event => onChange({ ...value, enabled: true,
                  experiences: { ...value.experiences, [id]: event.target.checked } })} />
              <span>{label}</span>
            </label>
          </summary>
          <div className="dyslexia-choice-content">
            <p className="muted dyslexia-help">{help}</p>
            {id === 'preferListening' && value.experiences.preferListening === true &&
              <ReadAloud key={speechReset} enabled={enabled} embedded preferences={value.speech}
                onChange={speech => onChange({ ...value, speech })} />}
          </div>
        </details>)}
        {section.note && <p className="muted dyslexia-help">{section.note}</p>}
      </fieldset>)}
      {!filtered.length && <p className="muted text-xs">No matching experiences.</p>}
      <details className="dyslexia-customization">
        <summary>Customize suggested changes</summary>
        <p className="muted dyslexia-help">Custom values override your experience choices. Use suggested settings below to remove overrides.</p>
        {Object.keys(custom).length > 0 && <p className="muted dyslexia-help" role="status">{Object.keys(custom).length} custom override{Object.keys(custom).length === 1 ? '' : 's'} active.</p>}
        <label className="dyslexia-field">Font
          <select aria-label="Font" value={custom.font === null ? 'website' : custom.font ?? ''} onChange={event => customize('font', event.target.value === '' ? undefined : event.target.value === 'website' ? null : event.target.value)}>
            <option value="">Suggested</option><option value="website">Keep website font</option><option value="sans">Arial / sans serif</option><option value="serif">Georgia / serif</option><option value="system">System font</option>
          </select>
        </label>
        {numberFields.map(field => <DyslexiaSlider key={field[0]} field={field} custom={custom}
          suggested={globalThis.clearspaceDyslexia.suggest(value)} onChange={customize} />)}
        {[['wordHighlight', 'Highlight the word under your pointer'], ['focusParagraph', 'Highlight the current passage'], ['allTextContrast', 'Contrast backgrounds for all text'], ['guide', 'Pointer reading guide'], ['alignStart', 'Align to reading direction']].map(([key, label]) => <label className="dyslexia-field" key={key}>{label}
          <select aria-label={label} value={custom[key] === undefined ? '' : String(custom[key])} onChange={event => customize(key, event.target.value === '' ? undefined : event.target.value === 'true')}>
            <option value="">Suggested</option><option value="true">On</option><option value="false">Off</option>
          </select>
        </label>)}
        {[['guideColor', 'Guide color', '#ffe58a']].map(([key, label, fallback]) => <div className="dyslexia-color" key={key}>
          <label className="option-row"><input type="checkbox" checked={Boolean(custom[key])} onChange={event => customize(key, event.target.checked ? fallback : undefined)} /><span>Choose {label.toLowerCase()}</span></label>
          {custom[key] && <input type="color" aria-label={label} value={custom[key]} onChange={event => customize(key, event.target.value)} />}
        </div>)}
        <button type="button" className="clear-button text-xs" onClick={() => onChange({ ...value, enabled: true, customization: {} })}>Use suggested settings</button>
      </details>
      <p className="muted dyslexia-help mt-3">Select Save and apply below to update connected webpages.</p>
    </div>}
  </section>;
}
