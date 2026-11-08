import '../client/public/color-vision.js';
import '../client/public/low-vision.js';
import '../client/public/light-sensitivity.js';
import '../client/public/focus-mode.js';
import '../client/public/motor-levels.js';
import '../client/public/dyslexia.js';

export const engines = {
  colour: globalThis.clearspaceColorVision, low: globalThis.clearspaceLowVision,
  light: globalThis.clearspaceLightSensitivity, focus: globalThis.clearspaceFocusMode,
  motor: globalThis.clearspaceMotor, dyslexia: globalThis.clearspaceDyslexia,
};
export const choices = [
  ...engines.low.options.map(x => `vision:${x}`), ...engines.light.options.map(x => `vision:${x}`),
  ...['Larger click targets', 'Extra button spacing', 'Keyboard focus indicators', 'Reduce motion'].map(x => `motor:${x}`),
  'cognitive:Focus mode', 'cognitive:Hide distractions',
];
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const bounded = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function normalizePreferences(input) {
  const value = object(input), desktop = object(value.desktop), dyslexia = object(value.dyslexia);
  const suggested = engines.dyslexia.suggest(dyslexia);
  const customization = {};
  for (const key of Object.keys(object(dyslexia.customization))) {
    if (Object.hasOwn(suggested, key) && !['enabled', 'warnings', 'needsSeparateEngine', 'background', 'textColor'].includes(key)) customization[key] = suggested[key];
  }
  return {
    version: 1, enabled: value.enabled !== false,
    selected: [...new Set((Array.isArray(value.selected) ? value.selected : []).filter(x => choices.includes(x)))],
    colorVision: engines.colour.normalize(value.colorVision), lowVision: engines.low.normalize(value.lowVision),
    lightSensitivity: engines.light.normalize(value.lightSensitivity), focusMode: engines.focus.normalize(value.focusMode),
    motor: engines.motor.normalize(value.motor),
    dyslexia: {
      experiences: Object.fromEntries(['distinguishWords', 'readingFatigue', 'overwhelmingParagraphs', 'losePlace', 'preferListening'].map(key => [key, dyslexia.experiences?.[key] === true])),
      customization, speech: { rate: bounded(dyslexia.speech?.rate, 0.5, 2, 1) },
    },
    desktop: {
      detectApps: desktop.detectApps !== false, followKeyboard: desktop.followKeyboard !== false,
      pointerHalo: desktop.pointerHalo === true,
      excludedApps: [...new Set((Array.isArray(desktop.excludedApps) ? desktop.excludedApps : []).filter(x => typeof x === 'string' && x.length < 300))].slice(0, 100),
    },
  };
}

export function effectivePreferences(preferences, appId) {
  return { ...preferences, enabled: preferences.enabled && !preferences.desktop.excludedApps.includes(appId) };
}

export function overlayEffects(preferences) {
  const s = normalizePreferences(preferences), has = name => s.selected.includes(name);
  const reading = engines.dyslexia.suggest(s.dyslexia);
  const visionFocus = has('vision:More visible keyboard focus') && s.lowVision['More visible keyboard focus'] > 0;
  const focusWidth = Math.max(
    has('motor:Keyboard focus indicators') ? engines.motor.ringPx(s.motor.focus) : 0,
    visionFocus ? engines.low.metrics(s.lowVision['More visible keyboard focus']).outline : 0,
  );
  return {
    enabled: s.enabled,
    dim: has('vision:Dim page') ? s.lightSensitivity['Dim page'] / 400 : 0,
    soften: has('vision:Soften bright backgrounds') ? s.lightSensitivity['Soften bright backgrounds'] / 400 : 0,
    warm: has('vision:Warm colour tint') ? s.lightSensitivity['Warm colour tint'] / 800 : 0,
    guide: reading.guide || has('cognitive:Focus mode'),
    guideHeight: reading.guide ? reading.guideSize : s.focusMode.height,
    guideColor: reading.guideColor,
    surrounding: reading.guide ? reading.dimming : s.focusMode.dimming / 100,
    isolateWindow: has('cognitive:Hide distractions'),
    focus: focusWidth > 0,
    focusWidth,
    followKeyboard: s.desktop.followKeyboard,
    halo: s.desktop.pointerHalo,
  };
}

// One full-screen colour matrix (SVG 4x5 layout) for the native renderer:
// the colour-blindness palette first, then Higher contrast on top of it.
// Returns null when neither is on.
export function desktopColourMatrix(preferences) {
  const s = normalizePreferences(preferences);
  if (!s.enabled) return null;
  const palette = s.colorVision.mode !== 'off' && s.colorVision.strength > 0;
  const strength = s.selected.includes('vision:Higher contrast') ? s.lowVision['Higher contrast'] : 0;
  if (!palette && strength <= 0) return null;
  const m = engines.colour.matrix(s.colorVision).trim().split(/\s+/).map(Number);
  if (strength > 0) {
    // Stretch colours away from mid-grey: out = c * (in - 0.5) + 0.5
    const c = 1 + 0.35 * Math.min(strength, 200) / 100;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) m[row * 5 + col] = Number((m[row * 5 + col] * c).toFixed(4));
      m[row * 5 + 4] = Number((m[row * 5 + 4] * c + 0.5 * (1 - c)).toFixed(4));
    }
  }
  return m;
}

// Larger text across the desktop = a bigger macOS display scale. Null = normal.
export function desktopScaleFactor(preferences) {
  const s = normalizePreferences(preferences);
  const strength = s.enabled && s.selected.includes('vision:Larger text and controls') ? s.lowVision['Larger text and controls'] : 0;
  return strength > 0 ? engines.low.metrics(strength).zoom : null;
}

// Windows' colour matrix is the transpose of SVG's four row matrix.
export function windowsColourMatrix(colour, svgMatrix) {
  const svg = svgMatrix || engines.colour.matrix(colour).trim().split(/\s+/).map(Number);
  const matrix = new Array(25).fill(0);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) matrix[col * 5 + row] = svg[row * 5 + col];
  matrix[24] = 1;
  return matrix;
}

// Desktop overlays and native filters already affect the browser's pixels.
export function browserPreferences(preferences, { nativeColour = false } = {}) {
  const s = normalizePreferences(preferences);
  s.selected = s.selected.filter(x => !['vision:Dim page', 'vision:Soften bright backgrounds', 'vision:Warm colour tint', 'cognitive:Focus mode'].includes(x));
  s.dyslexia.customization.guide = false;
  if (nativeColour) s.colorVision.mode = 'off';
  return s;
}

export function validRect(rect) {
  return !!rect && ['x', 'y', 'width', 'height'].every(k => typeof rect[k] === 'number' && Number.isFinite(rect[k])) && rect.width > 0 && rect.height > 0 && rect.width < 100000 && rect.height < 100000;
}

export function localRect(rect, display) {
  if (!validRect(rect)) return null;
  const x = Math.max(rect.x, display.x), y = Math.max(rect.y, display.y);
  const right = Math.min(rect.x + rect.width, display.x + display.width);
  const bottom = Math.min(rect.y + rect.height, display.y + display.height);
  return right > x && bottom > y ? { x: x - display.x, y: y - display.y, width: right - x, height: bottom - y } : null;
}
