import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { engines } from '../desktop/preferences.mjs';

const compile = spawnSync('swiftc', ['scripts/check-colour-renderer.swift', 'desktop/native/macos-colour.swift', '-O', '-module-cache-path', 'build/swift-cache', '-o', 'build/check-colour-renderer'], { stdio: 'inherit' });
assert.equal(compile.status, 0, 'compile the native renderer pixel check');
const cases = [];
const pixels = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 128, 128, 128, 255, 190, 90, 50, 255];
for (const mode of ['off', 'protan', 'deutan', 'tritan']) for (const strength of [0, 50, 100]) cases.push({ mode, strength, pixels, matrix: engines.colour.matrix({ mode, strength }).split(/\s+/).map(Number) });
const result = spawnSync('build/check-colour-renderer', { input: JSON.stringify(cases), encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
const output = JSON.parse(result.stdout);
for (let i = 0; i < cases.length; i++) {
  const { matrix, mode, strength } = cases[i];
  for (let pixel = 0; pixel < pixels.length; pixel += 4) for (let row = 0; row < 4; row++) {
    const expected = Math.round(Math.min(255, Math.max(0, pixels.slice(pixel, pixel + 4).reduce((sum, value, col) => sum + value * matrix[row * 5 + col], 255 * matrix[row * 5 + 4]))));
    assert.ok(Math.abs(output[i][pixel + row] - expected) <= 2, `${mode} ${strength}% pixel ${pixel / 4} channel ${row}: got ${output[i][pixel + row]}, expected ${expected}`);
  }
}
console.log('Native Metal colour renderer: all 12 palette/strength cases match the shared colour engine.');
