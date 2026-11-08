import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extensionManifest } from './scripts/extension-manifest.js';

export default defineConfig(({ mode }) => {
  const target = mode === 'firefox' ? 'firefox' : 'chrome';
  const outDir = target === 'firefox' ? '../dist-firefox' : '../dist';
  return {
  root: "client",
  base: "./",
  plugins: [react(), tailwindcss(), {
    name: 'accessify-extension-manifest',
    writeBundle() {
      const base = JSON.parse(readFileSync(new URL('./client/public/manifest.json', import.meta.url), 'utf8'));
      writeFileSync(resolve('client', outDir, 'manifest.json'), JSON.stringify(extensionManifest(base, target), null, 2) + '\n');
    },
  }],
  build: {
    outDir,
    emptyOutDir: true,
  },
  };
});
