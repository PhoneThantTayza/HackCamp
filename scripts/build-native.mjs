import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

mkdirSync('build/native', { recursive: true });
let result;
if (process.platform === 'darwin') {
  // Dev builds only compile for this Mac's chip (much faster). Set CLEARSPACE_UNIVERSAL=1 to build both for packaging.
  const arches = process.env.CLEARSPACE_UNIVERSAL ? ['arm64', 'x86_64'] : [process.arch === 'arm64' ? 'arm64' : 'x86_64'];
  for (const arch of arches) {
    result = spawnSync('swiftc', ['desktop/native/main.swift', 'desktop/native/macos-appearance.swift', 'desktop/native/macos-colour.swift', 'desktop/native/macos-scale.swift', '-O', '-target', `${arch}-apple-macos12.0`, '-module-cache-path', path.resolve('build/swift-cache'), '-o', `build/clearspace-native-${arch}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  result = spawnSync('lipo', ['-create', ...arches.map(arch => `build/clearspace-native-${arch}`), '-output', 'build/native/clearspace-native'], { stdio: 'inherit' });
} else if (process.platform === 'win32') {
  result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-windows.ps1'], { stdio: 'inherit' });
} else { console.error('Build the native helper on macOS or Windows.'); process.exit(1); }
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
