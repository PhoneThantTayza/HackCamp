# Clearspace Chrome extension

## Install the extension

The extension runs without a server. From this project folder:

```powershell
npm run build
node --test tests/extension.test.js
```

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** at the top right.
3. Click **Load unpacked**.
4. Select `C:\Users\ton53\Desktop\HackCamp\dist` (the folder containing manifest.json).
5. Pin **Clearspace** using Chrome's puzzle-piece Extensions menu.
6. Open a regular webpage, click the Clearspace toolbar icon, choose adjustments, then **Save and apply**. Return to the original tab to see changes.

Click the icon again after navigating to another site. Opening the settings directly through Chrome has no original target tab. For automatic behavior, use **Allow automatic adjustments on websites** and accept Chrome's permission prompt. Saved preferences then apply to permitted existing tabs and new/navigated webpages. Review or revoke permissions in Chrome's extension **Details > Site access**. Refresh adjusted pages after revoking access to clear remaining styles.

Uncheck **Enable webpage adjustments**, then save to disable while remembering choices. **Reset adjustments** clears choices and removes styles from connected pages. The UI theme is separate from website appearance and is remembered on save.

After code changes, rebuild, click Reload on the extension card, refresh webpages and reopen settings.

`npm run dev:client` starts the labelled local UI demo; it does not modify websites. The Express scaffold below remains for teammates; the extension does not use it.

## Extension features and verification

Implemented: larger text, high contrast, line/letter/button spacing, reduced CSS motion, link underlines, readable font, shorter text lines, left alignment, larger form/button targets and visible keyboard focus. Reading guide, simplified layout, distraction hiding, clear headings and shorter paragraphs are disabled and marked Coming later.

Styles are removable and cover matching dynamically inserted elements. They are best effort: fixed layouts can overlap, website styles can win, and reduced CSS motion does not stop videos or JavaScript effects. Embedded frames, closed shadow roots, canvas, PDFs, browser pages and protected sites are unsupported. No accessibility-compliance guarantee is made.

Build and Node tests cover packaging, repeated application, updates, duplicate prevention and removal of only extension-owned styles. Actual Chrome behavior still requires manual checks:

- Reopen settings and restart Chrome to check persistence.
- Apply repeatedly, disable and reset; check original styles, form values, links and buttons.
- With automatic access, check two windows, new tabs, navigation and dynamically added text.
- Decline permissions and try chrome://settings; check accurate errors.
- Test keyboard controls, narrow widths and 200% zoom.

Extension files: `client/public/manifest.json`, `background.js`, `content.js`, `client/src/settings.js`, `client/src/App.jsx`, `client/res/css/index.css`, `vite.config.js`, and `tests/extension.test.js`.

## Legacy server scaffold

The following describes the retained server scaffold. The URL/preview UI described below has been replaced by extension controls.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000 for the local UI demo. Expand categories to choose
adjustments or search their options. The demo stores settings in localStorage
and cannot change other websites. Install the extension above for live behavior.

Express handles `/api/*` requests, and vite-express serves the client on the
same port. Vite updates the client during development; nodemon restarts the
server when server code changes. Run commands from the project root.

## Check the server

```sh
curl.exe http://localhost:3000/api/health
```

Expected JSON: `{"status":"ok"}`. An unknown API route returns HTTP 404
with `{"error":"API route not found"}`.

The UI can call this endpoint with `fetch("/api/health")`; no separate API
hostname or CORS setup is needed. Page extraction is not implemented yet.

## Build and run production mode

```sh
npm run build
npm start
```

The start command works in PowerShell and serves the built `dist` directory.
Set the `PORT` environment variable to change the default port of 3000.
`npm run dev:client` runs Vite alone and does not start the API.
