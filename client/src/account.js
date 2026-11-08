// Auth0 sign-in for the Accessify extension (Auth0 "Native" app, PKCE flow).
// 1. extensionApi.identity opens the Auth0 login page in a small window.
// 2. Auth0 sends the window to the browser-specific identity.getRedirectURL().
// 3. We swap the one-time code for a token (no client secret needed: PKCE).
// 4. The token proves who you are to our server, which saves your settings.
import { isExtension, isFirefox, extensionApi } from "./settings.js";

const DOMAIN = "dev-tsmyxcbitdn1q1vy.us.auth0.com";
const CLIENT_ID = "lXZhBKJAB3KVeANrjy2G1nfcl6Lp0ts4";
const AUDIENCE = "https://accessify-api";
// Set VITE_API_URL in the root .env.local before building for deployment.
export const API = (import.meta.env.VITE_API_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = size => base64url(crypto.getRandomValues(new Uint8Array(size)));
function decodeJwt(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), c => c.charCodeAt(0))));
  } catch { return {}; }
}

// The address Auth0 must send people back to. Add it to Auth0's Allowed Callback URLs.
export const callbackUrl = () => (isExtension ? extensionApi.identity.getRedirectURL() : "");

export async function getAccount() {
  if (!isExtension) return null;
  const { account } = await extensionApi.storage.local.get("account");
  return account?.expiresAt > Date.now() ? account : null; // expired = sign in again
}

export async function signIn() {
  if (!isExtension) throw new Error("Sign in works inside the installed extension.");
  if (isFirefox && !(await extensionApi.permissions.request({ data_collection: ['personallyIdentifyingInfo', 'technicalAndInteraction'] }))) {
    throw new Error('Account sync stays off. Firefox needs your permission to send account details and preferences.');
  }
  const verifier = random(32), state = random(16);
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const params = new URLSearchParams({
    response_type: "code", client_id: CLIENT_ID, redirect_uri: callbackUrl(), audience: AUDIENCE,
    scope: "openid profile email", code_challenge: challenge, code_challenge_method: "S256", state, prompt: "login",
  });
  let returned;
  try {
    returned = await extensionApi.identity.launchWebAuthFlow({ url: `https://${DOMAIN}/authorize?${params}`, interactive: true });
  } catch (error) {
    throw new Error(`Sign-in failed: ${error.message || "the login window was closed"}. Check that Auth0's Allowed Callback URLs includes ${callbackUrl()}`);
  }
  const url = new URL(returned);
  const problem = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (problem) throw new Error(`Auth0: ${problem}`);
  if (url.searchParams.get("state") !== state) throw new Error("Sign-in was interrupted. Please try again.");
  if (!url.searchParams.get("code")) throw new Error("Auth0 did not return a login code. Please try again.");

  const response = await fetch(`https://${DOMAIN}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", client_id: CLIENT_ID, code_verifier: verifier, code: url.searchParams.get("code"), redirect_uri: callbackUrl() }),
  });
  const tokens = await response.json();
  if (!response.ok) throw new Error(`Auth0: ${tokens.error_description || "login refused"}`);
  if (!tokens.access_token) throw new Error("Auth0 did not return an access token. Please try again.");
  const profile = decodeJwt(tokens.id_token);
  const account = {
    accessToken: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    name: profile.name || profile.nickname || "", email: profile.email || "",
  };
  await extensionApi.storage.local.set({ account });
  return account;
}

export async function signOut() {
  if (isExtension) await extensionApi.storage.local.remove("account");
}

// Call our server with the login token attached.
async function api(method, body) {
  if (isFirefox && !(await extensionApi.permissions.contains({ data_collection: ['personallyIdentifyingInfo', 'technicalAndInteraction'] }))) {
    throw new Error('Account sync permission is off. Sign out and sign in again to enable it.');
  }
  const account = await getAccount();
  if (!account) throw new Error("Please sign in first.");
  let response;
  try {
    response = await fetch(`${API}/api/preferences`, {
      method, headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Can't reach the sync server at ${API}. Check your internet connection and that the server is running.`);
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { await signOut(); throw new Error("Please sign in again."); }
  if (!response.ok) throw new Error(data.error || `Server error (${response.status}).`);
  return data;
}
export const downloadSettings = () => api("GET").then(data => data.settings);
export const uploadSettings = settings => api("PUT", { settings });
