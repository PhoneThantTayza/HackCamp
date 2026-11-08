import React, { useId } from 'react';

export default function DyslexiaSlider({ field, custom, suggested, onChange }) {
  const [key, label, min, max, step] = field;
  const id = useId();
  const overridden = Number.isFinite(custom[key]);
  const effective = overridden ? custom[key] : suggested[key];
  const value = Math.min(max, Math.max(min, Number.isFinite(effective) ? effective : min));
  return <div className="dyslexia-field dyslexia-slider">
    <div className="dyslexia-slider-heading">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{Number.isFinite(effective) ? Number(value.toFixed(2)) : 'Website default'}{!overridden && <span className="muted"> · Suggested</span>}</output>
    </div>
    <input id={id} type="range" min={min} max={max} step={step} value={value}
      aria-valuetext={Number.isFinite(effective) ? String(Number(value.toFixed(2))) : 'Suggested: website default'}
      onChange={event => onChange(key, event.target.valueAsNumber)} />
    {overridden && <button type="button" className="clear-button dyslexia-slider-reset"
      aria-label={`Use suggested ${label.toLowerCase()}`} onClick={() => onChange(key, undefined)}>Use suggested</button>}
  </div>;
}
