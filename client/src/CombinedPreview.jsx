import React, { useEffect, useRef, useState } from "react";

export default function CombinedPreview({ settings }) {
  const frame = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  useEffect(() => {
    if (loaded) frame.current?.contentWindow?.postMessage({ type: "clearspace:preview-settings", settings: showOriginal ? { ...settings, enabled: false } : settings }, location.origin);
  }, [loaded, settings, showOriginal]);
  return <section className="combined-preview" aria-labelledby="preview-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="preview-title" className="text-base font-medium">Preview all adjustments</h2>
      <span className="optional-tag">{showOriginal ? "ORIGINAL PAGE" : settings.enabled ? "LIVE PREVIEW" : "ADJUSTMENTS PAUSED"}</span>
    </div>
    <p className="muted control-description">Your choices work together here immediately and save automatically. Connected websites update as you make changes.</p>
    <div className="preview-comparison" role="group" aria-label="Preview version">
      <button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>Before adjustments</button>
      <button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>After adjustments</button>
    </div>
    <p className="muted control-caption" role="status">{showOriginal ? "Showing the original page without adjustments. Your choices are kept." : settings.enabled ? "Showing the page with your current adjustments." : "Adjustments are paused. Both views show the original page."}</p>
    <p id="preview-help" className="muted control-caption">Try links, buttons, text selection and Tab. With word lookup enabled, select a word to open Google results for its definition and pronunciation; selected text is sent to Google. Hover over text for reading tools; right-click to toggle a selected reading guide or focus band. Listening uses your browser’s available voices.</p>
    <iframe ref={frame} src="./preview.html" title={showOriginal ? "Original webpage before adjustments" : "Webpage with all your selected adjustments"} aria-describedby="preview-help" onLoad={() => setLoaded(true)} />
  </section>;
}
