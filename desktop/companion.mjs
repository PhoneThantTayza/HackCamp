import { mkdirSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';

export const HOST = 'org.clearspace.desktop';
export async function installCompanion({ browser, extensionId }, executable, userData) {
  if (!['chrome', 'edge'].includes(browser) || !/^[a-p]{32}$/.test(extensionId)) throw new Error('Enter the 32-letter extension ID shown on the browser’s extensions page.');
  let directory;
  if (process.platform === 'darwin') directory = path.join(os.homedir(), 'Library/Application Support', browser === 'chrome' ? 'Google/Chrome' : 'Microsoft Edge', 'NativeMessagingHosts');
  else if (process.platform === 'win32') directory = path.join(userData, 'NativeMessagingHosts');
  else throw new Error('The browser companion supports Windows and macOS.');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${HOST}.json`);
  writeFileSync(file, JSON.stringify({ name: HOST, description: 'Read Clearspace desktop preferences', path: executable, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`] }, null, 2), { mode: 0o600 });
  if (process.platform === 'win32') {
    const vendor = browser === 'chrome' ? 'Google\\Chrome' : 'Microsoft\\Edge';
    await promisify(execFile)('reg.exe', ['ADD', `HKCU\\Software\\${vendor}\\NativeMessagingHosts\\${HOST}`, '/ve', '/t', 'REG_SZ', '/d', file, '/f'], { windowsHide: true });
  }
  return 'Connection installed. Open the companion extension and select Connect to desktop.';
}
