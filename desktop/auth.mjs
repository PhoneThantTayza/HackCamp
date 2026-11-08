// Auth0 login for the desktop app (Auth0 "Native" app, PKCE flow).
// 1. Open the Auth0 login page in the user's normal browser.
// 2. Auth0 sends the browser back to a tiny local web server (127.0.0.1:53682).
// 3. We swap the one-time code for tokens (no client secret needed: PKCE).
// 4. Tokens are saved encrypted with Electron safeStorage.
import { shell, safeStorage } from 'electron';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';

const DOMAIN = process.env.AUTH0_DOMAIN || 'dev-tsmyxcbitdn1q1vy.us.auth0.com';
const CLIENT_ID = process.env.AUTH0_CLIENT_ID || 'lXZhBKJAB3KVeANrjy2G1nfcl6Lp0ts4';
const AUDIENCE = process.env.AUTH0_AUDIENCE || 'https://clearspace-api';
const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
export const API = process.env.CLEARSPACE_API_URL || 'http://localhost:3000';

const base64url = buffer => buffer.toString('base64url');
const decodeJwt = token => { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { return {}; } };

export class Auth {
  constructor(file) { this.file = file; this.session = this.#read(); }

  get user() {
    if (!this.session) return null;
    return { name: this.session.name, email: this.session.email };
  }

  #read() {
    try {
      if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(this.file)) return null;
      const data = JSON.parse(safeStorage.decryptString(fs.readFileSync(this.file)));
      return data.expiresAt > Date.now() ? data : null; // expired = log in again
    } catch { return null; }
  }

  #write(data) {
    this.session = data;
    if (!data) { fs.rmSync(this.file, { force: true }); return; }
    if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(this.file, safeStorage.encryptString(JSON.stringify(data)), { mode: 0o600 });
  }

  // Open the browser, wait for Auth0 to send the user back, then get tokens.
  login() {
    if (this.pending) return this.pending;
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    const state = base64url(randomBytes(16));

    this.pending = new Promise((resolve, reject) => {
      const finish = (error, value) => { clearTimeout(timer); server.close(); this.pending = null; error ? reject(error) : resolve(value); };
      const page = text => `<!doctype html><meta charset="utf-8"><title>Clearspace</title><body style="font:18px system-ui;padding:40px">${text}</body>`;
      const server = createServer(async (req, res) => {
        const url = new URL(req.url, REDIRECT);
        if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
        const error = url.searchParams.get('error_description') || url.searchParams.get('error');
        if (error || url.searchParams.get('state') !== state) {
          const reason = (error || 'The login was interrupted.').replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);
          res.writeHead(400, { 'Content-Type': 'text/html' }).end(page(`Login did not finish.<br><br><b>Reason from Auth0:</b> ${reason}<br><br>You can close this tab.`));
          return finish(new Error(error || 'Login was interrupted. Please try again.'));
        }
        try {
          const response = await fetch(`https://${DOMAIN}/oauth/token`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grant_type: 'authorization_code', client_id: CLIENT_ID, code_verifier: verifier, code: url.searchParams.get('code'), redirect_uri: REDIRECT }),
          });
          const tokens = await response.json();
          if (!response.ok) throw new Error(tokens.error_description || 'Auth0 refused the login.');
          const profile = decodeJwt(tokens.id_token);
          this.#write({ accessToken: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000, name: profile.name || profile.nickname || '', email: profile.email || '' });
          res.writeHead(200, { 'Content-Type': 'text/html' }).end(page('✓ You are signed in to Clearspace. You can close this tab.'));
          finish(null, this.user);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' }).end(page('Login failed. You can close this tab.'));
          finish(err);
        }
      });
      const timer = setTimeout(() => finish(new Error('Login timed out.')), 5 * 60 * 1000);
      server.on('error', err => finish(err));
      server.listen(PORT, '127.0.0.1', () => {
        const params = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT, audience: AUDIENCE, scope: 'openid profile email', code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'login' });
        shell.openExternal(`https://${DOMAIN}/authorize?${params}`);
      });
    });
    return this.pending;
  }

  logout() {
    this.#write(null); // forget the tokens (login always asks again: prompt=login)
  }

  // Call our server with the login token attached.
  async api(method, body) {
    if (!this.session) throw new Error('Please sign in first.');
    const response = await fetch(`${API}/api/preferences`, {
      method, headers: { Authorization: `Bearer ${this.session.accessToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { this.#write(null); throw new Error('Please sign in again.'); }
    if (!response.ok) throw new Error(data.error || `Server error (${response.status}).`);
    return data;
  }
}
