import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { normalizePreferences } from './preferences.mjs';

export function atomicJSON(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
}

export function loadPreferences(file) {
  try { return { preferences: normalizePreferences(JSON.parse(readFileSync(file, 'utf8'))), error: null }; }
  catch (error) {
    return { preferences: normalizePreferences(), error: error.code === 'ENOENT' ? null : 'Saved preferences could not be read. Defaults are active; your next change will save a new copy.' };
  }
}
