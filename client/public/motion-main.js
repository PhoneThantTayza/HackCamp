// A11yFix - Motion accessibility (runs INSIDE the website's own code)
// Websites start videos by calling video.play(). This file wraps play() so
// that when Reduce motion is ON, muted videos that nobody asked for simply
// don't start. No start = no play/pause fight = no "slow motion" flicker.
// motion.js tells us if Reduce motion is ON by putting a flag on the <html> tag.

(() => {
  if (window.__a11yfixPlayWrapped) return; // injected twice: don't wrap play() again
  window.__a11yfixPlayWrapped = true;
  const realPlay = HTMLMediaElement.prototype.play; // keep the original
  const allowedVideos = new WeakSet(); // videos the user chose to play
  let lastUserAction = 0;

  const remember = () => (lastUserAction = Date.now());
  addEventListener("pointerdown", remember, true);
  addEventListener("keydown", remember, true);

  // A player loading a new video gets judged fresh (YouTube reuses players)
  addEventListener("loadstart", (e) => allowedVideos.delete(e.target), true);

  HTMLMediaElement.prototype.play = function (...args) {
    const reduceMotionOn = document.documentElement.dataset.a11yfixReduceMotion === "on";
    const hasSound = !this.muted && this.volume > 0;
    const userJustActed = Date.now() - lastUserAction < 1000; // within the last second

    if (userJustActed) allowedVideos.add(this);

    const isAutoplay = reduceMotionOn && !hasSound && !allowedVideos.has(this);
    if (isAutoplay) {
      return Promise.resolve(); // quietly refuse to play
    }
    return realPlay.apply(this, args); // normal play
  };
})();