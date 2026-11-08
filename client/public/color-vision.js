// Shared by the bundled settings UI and Chrome's non-module content scripts.
(() => {
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // Assistance palettes: move selected channels into additional colour channels.
  // These are colour remappings, not simulations or medical corrections.
  const palettes = {
    protan: [0.65, 0.35, 0, 0, 1, 0, 0.35, -0.35, 1],
    deutan: [1, 0, 0, 0.35, 0.65, 0, -0.35, 0.35, 1],
    tritan: [1, -0.3, 0.3, 0, 1, 0, 0, 0.3, 0.7],
  };
  function normalize(value) {
    return {
      mode: Object.hasOwn(palettes, value?.mode) ? value.mode : "off",
      strength: Number.isFinite(value?.strength) ? Math.round(Math.max(0, Math.min(100, value.strength))) : 70,
      cues: value?.cues === true,
    };
  }
  function matrix(value) {
    const { mode, strength } = normalize(value);
    const palette = palettes[mode] || identity;
    const channels = identity.map((channel, index) => channel + (palette[index] - channel) * strength / 100);
    return [0, 1, 2].map(row => [...channels.slice(row * 3, row * 3 + 3), 0, 0].join(" ")).join(" ") + " 0 0 0 1 0";
  }
  globalThis.clearspaceColorVision = { normalize, matrix };
})();
