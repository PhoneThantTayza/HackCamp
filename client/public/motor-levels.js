// Clearspace - Motor / mobility slider levels
// Shared by the settings page (sliders + samples) and the page scripts
// (click-targets.js, button-spacing.js), so both always agree on the numbers.
// Settings shape: settings.motor = { targetSize: 0-100, spacing: 0-100, motion: 0-100 }

(() => {
  if (globalThis.clearspaceMotor) return;

  const clamp = (value, fallback = 50) => (Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : fallback);

  function normalize(value) {
    return { targetSize: clamp(value?.targetSize), spacing: clamp(value?.spacing), motion: clamp(value?.motion, 100) };
  }

  // Click target size: Comfortable 44px  ->  Extra large 72px
  const targetPx = (level) => Math.round(44 + (28 * clamp(level)) / 100);
  // Gap between neighbouring targets: Small 12px  ->  Large 40px
  const gapPx = (level) => Math.round(12 + (28 * clamp(level)) / 100);

  const sizeLabel = (level) => (clamp(level) < 34 ? "Comfortable" : clamp(level) < 67 ? "Large" : "Extra large");
  const gapLabel = (level) => (clamp(level) < 34 ? "Small" : clamp(level) < 67 ? "Medium" : "Large");

  // Reduce motion: 1 Gentle (animations) -> 2 Calm (+ autoplay videos) -> 3 Still (+ GIFs)
  const motionStep = (level) => (clamp(level, 100) < 34 ? 1 : clamp(level, 100) < 67 ? 2 : 3);
  const motionLabel = (level) => ["Gentle", "Calm", "Still"][motionStep(level) - 1];

  globalThis.clearspaceMotor = { normalize, targetPx, gapPx, sizeLabel, gapLabel, motionStep, motionLabel };
})();
