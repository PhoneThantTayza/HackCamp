import { windowsColourMatrix, desktopColourMatrix, desktopScaleFactor } from './preferences.mjs';

// Each effect reconciles to the latest choice after a slow native reply. Failed
// choices wait for an explicit retry, rather than repeatedly prompting the OS.
export class SystemEffects {
  constructor(platform, request, changed = () => {}) {
    this.platform = platform; this.request = request; this.changed = changed;
    this.effects = Object.fromEntries(['colour', 'appearance', 'scale'].map(name => [name, {
      desired: null, key: undefined, running: false, status: { state: 'off', applied: false, error: '' },
    }]));
  }
  get status() { return Object.fromEntries(Object.entries(this.effects).map(([name, effect]) => [name, { ...effect.status }])); }
  update(settings) {
    const svg = desktopColourMatrix(settings), colour = !!svg;
    if (!colour && this.effects.colour.running && this.effects.colour.desired?.matrix) {
      // Cancel a pending ScreenCaptureKit startup immediately on pause. The
      // normal reconciliation still verifies removal after that request settles.
      void this.request('colour', { matrix: null }).catch(() => {});
    }
    this.effects.colour.desired = { matrix: colour ? (this.platform === 'win32' ? windowsColourMatrix(settings.colorVision, svg) : svg) : null };
    // Display scaling is macOS only. Only send "off" if we changed the scale before.
    const factor = this.platform === 'darwin' ? desktopScaleFactor(settings) : null, scale = this.effects.scale;
    scale.desired = factor ? { factor } : (scale.status.applied || scale.running ? { factor: null } : scale.desired);
    this.effects.appearance.desired = { enabled: settings.enabled && settings.selected.includes('vision:Dark page theme') };
    return Promise.all(Object.keys(this.effects).map(name => this.reconcile(name)));
  }
  retry(name) {
    if (!this.effects[name]) throw new Error('Unknown display effect.');
    this.effects[name].key = undefined;
    return this.reconcile(name);
  }
  failed(name, error) {
    const effect = this.effects[name]; if (!effect) return;
    effect.status = { state: 'error', applied: false, error }; this.changed(this.status);
  }
  async reconcile(name) {
    const effect = this.effects[name];
    if (effect.running || !effect.desired) return;
    effect.running = true;
    try {
      while (effect.desired && effect.key !== JSON.stringify(effect.desired)) {
        const desired = effect.desired;
        effect.key = JSON.stringify(desired);
        effect.status = { ...effect.status, state: 'pending', error: '' }; this.changed(this.status);
        try {
          const result = await this.request(name, desired);
          const expected = name === 'colour' ? !!desired.matrix : name === 'scale' ? !!desired.factor : desired.enabled;
          if (expected && result.applied !== true) throw new Error('The system did not activate this adjustment.');
          effect.status = { state: result.applied ? 'active' : 'off', applied: result.applied === true, error: '' };
        } catch (error) {
          // A failed replacement/restoration can leave the previous native
          // filter active. Keep suppressing duplicate webpage filtering then.
          effect.status = { state: 'error', applied: error.applied ?? effect.status.applied, error: error.message };
        }
        this.changed(this.status);
      }
    } finally { effect.running = false; }
  }
}
