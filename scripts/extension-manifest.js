export function extensionManifest(base, target = 'chrome') {
  const manifest = structuredClone(base);
  if (target !== 'firefox') return manifest;
  delete manifest.minimum_chrome_version;
  delete manifest.side_panel;
  manifest.permissions = manifest.permissions.filter(name => !['sidePanel', 'tts'].includes(name));
  manifest.background = {
    scripts: ['firefox-speech.js', 'selection-tts.js', 'word-lookup-background.js', 'background.js'],
    persistent: false,
  };
  manifest.sidebar_action = {
    default_panel: 'index.html?panel=1',
    default_icon: manifest.icons,
    open_at_install: false,
  };
  manifest.options_ui = { page: manifest.options_page, open_in_tab: true };
  delete manifest.options_page;
  manifest.browser_specific_settings = {
    gecko: {
      id: 'accessify@hackcamp.local',
      strict_min_version: '142.0',
      data_collection_permissions: { required: ['none'], optional: ['websiteContent'] },
    },
  };
  return manifest;
}
