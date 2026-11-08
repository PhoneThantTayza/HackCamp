import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

mkdirSync('build/native', { recursive: true });
let result;
if (process.platform === 'darwin') {
  for (const arch of ['arm64', 'x86_64']) {
    result = spawnSync('swiftc', ['desktop/native/main.swift', 'desktop/native/macos-appearance.swift', 'desktop/native/macos-colour.swift', '-O', '-target', `${arch}-apple-macos12.0`, '-module-cache-path', path.resolve('build/swift-cache'), '-o', `build/clearspace-native-${arch}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  result = spawnSync('lipo', ['-create', 'build/clearspace-native-arm64', 'build/clearspace-native-x86_64', '-output', 'build/native/clearspace-native'], { stdio: 'inherit' });
} else if (process.platform === 'win32') {
  result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-windows.ps1'], { stdio: 'inherit' });
} else { console.error('Build the native helper on macOS or Windows.'); process.exit(1); }
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
