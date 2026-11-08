(() => {
  const fields = ['selected', 'colorVision', 'lowVision', 'lightSensitivity', 'focusMode', 'dyslexia', 'motor'];
  function profile(settings) {
    return JSON.parse(JSON.stringify(Object.fromEntries(fields.filter(key => settings[key] !== undefined).map(key => [key, settings[key]]))));
  }
  function resolve(settings, page = globalThis.location) {
    if (!settings) return settings;
    const origin = page?.ancestorOrigins?.length ? page.ancestorOrigins[page.ancestorOrigins.length - 1] : page?.origin;
    const override = Object.hasOwn(settings.siteProfiles ?? {}, origin) ? settings.siteProfiles[origin] : null;
    const result = override ? { ...settings, ...profile(override) } : settings;
    return settings.pausedSites?.includes(origin) ? { ...result, enabled: false } : result;
  }
  globalThis.clearspaceSiteSettings = { profile, resolve };
})();
