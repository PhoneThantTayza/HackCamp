import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';

export class NativeClient {
  constructor(executable, onContext, onError, onEffectError = () => {}) {
    this.pending = new Map(); this.sequence = 0;
    if (!existsSync(executable)) { onError('Native helper is missing. Run npm run desktop:prepare.'); return; }
    this.child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child.on('error', error => onError(`Native helper: ${error.message}`));
    this.child.stdin.on('error', () => {});
    // Never relay application text from stderr into logs or the UI.
    this.child.stderr.resume();
    createInterface({ input: this.child.stdout }).on('line', line => {
      if (line.length > 150000) return;
      try {
        const event = JSON.parse(line);
        if (event.type === 'context' || event.type === 'pointer-text') onContext(event);
        else if (event.type === 'effect-error') onEffectError(event);
        else if (this.pending.has(event.requestId)) {
          const { resolve, reject, timer } = this.pending.get(event.requestId);
          clearTimeout(timer); this.pending.delete(event.requestId);
          if (event.error) {
            const error = new Error(event.error);
            if (typeof event.applied === 'boolean') error.applied = event.applied;
            reject(error);
          } else resolve(event);
        }
      } catch { /* Ignore incomplete native output. */ }
    });
    this.child.on('exit', () => {
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('Native helper stopped.')); }
      this.pending.clear(); this.child = null;
      if (!this.stopping) onError('Desktop detection stopped. Restart Clearspace to reconnect.');
    });
  }
  send(message) { if (this.child?.stdin.writable) this.child.stdin.write(`${JSON.stringify(message)}\n`); }
  request(command, values = {}) {
    if (!this.child) return Promise.reject(new Error('Native desktop integration is unavailable. You can still paste text into the reading view.'));
    return new Promise((resolve, reject) => {
      const requestId = ++this.sequence;
      const timeout = ['appearance', 'capture-permission'].includes(command) ? 45000 : command === 'colour' ? 15000 : 5000;
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(command === 'selection' ? 'The application did not respond. Try copying the text into the reading view.' : 'The system did not respond. Check its permission dialog, then retry this adjustment.')); }, timeout);
      this.pending.set(requestId, { resolve, reject, timer }); this.send({ command, requestId, ...values });
    });
  }
  stop() { this.stopping = true; this.child?.stdin.end(); }
}
