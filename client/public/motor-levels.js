// Clearspace - Motor / mobility slider levels
// Shared by the settings page (sliders + samples) and the page scripts
// (click-targets.js, button-spacing.js), so both always agree on the numbers.
// Settings shape: settings.motor = { targetSize: 0-100, spacing: 0-100 }

(() => {
  if (globalThis.clearspaceMotor) return;

  const clamp = (value) => (Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 50);

  function normalize(value) {
    return { targetSize: clamp(value?.targetSize), spacing: clamp(value?.spacing) };
  }

  // Click target size: Comfortable 44px  ->  Extra large 72px
  const targetPx = (level) => Math.round(44 + (28 * clamp(level)) / 100);
  // Gap between neighbouring targets: Small 12px  ->  Large 40px
  const gapPx = (level) => Math.round(12 + (28 * clamp(level)) / 100);

  const sizeLabel = (level) => (clamp(level) < 34 ? "Comfortable" : clamp(level) < 67 ? "Large" : "Extra large");
  const gapLabel = (level) => (clamp(level) < 34 ? "Small" : clamp(level) < 67 ? "Medium" : "Large");

  globalThis.clearspaceMotor = { normalize, targetPx, gapPx, sizeLabel, gapLabel };
})();
