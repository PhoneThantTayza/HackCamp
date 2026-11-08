import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { extensionManifest } from './scripts/extension-manifest.js';

export default defineConfig(({ mode }) => {
  const envDir = process.cwd();
  const env = loadEnv(mode, envDir, 'VITE_');
  const apiUrl = process.env.VITE_API_URL || env.VITE_API_URL || 'http://127.0.0.1:3000';
  const api = new URL(apiUrl);
  if (api.username || api.password || api.pathname !== '/' || api.search || api.hash ||
      (api.protocol !== 'https:' && !(api.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(api.hostname)))) {
    throw new Error('VITE_API_URL must be an HTTPS origin (for example https://your-server.onrender.com), or HTTP localhost for development.');
  }
  const target = mode === 'firefox' ? 'firefox' : 'chrome';
  const outDir = target === 'firefox' ? '../dist-firefox' : '../dist';
  return {
  root: "client",
  envDir,
  base: "./",
  plugins: [react(), tailwindcss(), {
    name: 'accessify-extension-manifest',
    writeBundle() {
      const base = JSON.parse(readFileSync(new URL('./client/public/manifest.json', import.meta.url), 'utf8'));
      // Grant access to the same sync server used by the settings UI.
      base.host_permissions = base.host_permissions.filter(host => host !== 'http://127.0.0.1:3000/*');
      base.host_permissions.push(`${api.origin}/*`);
      writeFileSync(resolve('client', outDir, 'manifest.json'), JSON.stringify(extensionManifest(base, target), null, 2) + '\n');
      if (target === 'firefox') {
        const fixture = resolve('client', outDir, 'dyslexia-fixture.html');
        if (existsSync(fixture)) unlinkSync(fixture);
      }
    },
  }],
  build: {
    outDir,
    emptyOutDir: true,
  },
  };
});
