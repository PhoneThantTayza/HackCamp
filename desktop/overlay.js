const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
window.clearspaceOverlay.onFrame(({ effects: fx, pointer, focus, activeWindow, guideY }) => {
  const scale = window.devicePixelRatio;
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * scale) || canvas.height !== Math.round(h * scale)) {
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!fx.enabled) return;
  const fill = (colour, x = 0, y = 0, width = w, height = h) => { ctx.fillStyle = colour; ctx.fillRect(x, y, width, height); };
  // A paper-coloured veil affects all pixels; it does not identify app backgrounds.
  // At 100% strength, white becomes approximately rgb(222, 218, 208), matching
  // the existing webpage softening palette. Paint first so focus dimming can stack.
  if (fx.soften) fill(`rgba(123,107,67,${fx.soften})`);
  if (fx.isolateWindow && fx.windowKnown) {
    // Clip the shade, rather than clearing the active window: clearing would
    // also remove the softening veil inside the window the user is reading.
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h);
    if (activeWindow) ctx.rect(activeWindow.x, activeWindow.y, activeWindow.width, activeWindow.height);
    ctx.clip('evenodd'); fill('rgba(0,0,0,0.55)'); ctx.restore();
  }
  if (fx.guide) {
    const top = Math.max(0, Math.min(h, guideY - fx.guideHeight / 2));
    const bottom = Math.max(0, Math.min(h, guideY + fx.guideHeight / 2));
    fill(`rgba(0,0,0,${fx.surrounding})`, 0, 0, w, top);
    fill(`rgba(0,0,0,${fx.surrounding})`, 0, bottom, w, h - bottom);
    if (bottom > top) { fill(`${fx.guideColor}18`, 0, top, w, bottom - top); fill(`${fx.guideColor}bb`, 0, top, w, 1); }
  }
  if (fx.dim) fill(`rgba(0,0,0,${fx.dim})`);
  if (fx.warm) fill(`rgba(255,155,45,${fx.warm})`);
  if (fx.focus && focus) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = fx.focusWidth + 4;
    ctx.strokeRect(focus.x - 3, focus.y - 3, focus.width + 6, focus.height + 6);
    ctx.strokeStyle = '#111111'; ctx.lineWidth = fx.focusWidth;
    ctx.strokeRect(focus.x - 3, focus.y - 3, focus.width + 6, focus.height + 6);
  }
  if (fx.halo && pointer.inside) {
    ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 22, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#17694e'; ctx.lineWidth = 2; ctx.stroke();
  }
});
