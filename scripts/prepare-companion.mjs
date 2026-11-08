import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
const files = ['color-vision.js', 'low-vision.js', 'light-sensitivity.js', 'focus-mode.js', 'dyslexia.js', 'selection-reader.js', 'selection-tts.js', 'content.js', 'motor-levels.js', 'motion-main.js', 'motion.js', 'click-targets.js', 'button-spacing.js', 'keyboard-focus.js', 'desktop-companion.js', 'desktop-companion.html', 'desktop-companion.css', 'desktop-companion-popup.js'];
mkdirSync('build/companion', { recursive: true });
for (const file of files) copyFileSync(path.join('client/public', file), path.join('build/companion', file));
const manifest = JSON.parse(readFileSync('client/public/manifest.json', 'utf8'));
delete manifest.options_page;
Object.assign(manifest, { name: 'Clearspace Desktop Companion', description: 'Use your Clearspace desktop preferences on websites.', permissions: [...manifest.permissions, 'nativeMessaging'], background: { service_worker: 'desktop-companion.js' }, action: { default_title: 'Clearspace desktop companion', default_popup: 'desktop-companion.html' } });
writeFileSync('build/companion/manifest.json', JSON.stringify(manifest, null, 2));
