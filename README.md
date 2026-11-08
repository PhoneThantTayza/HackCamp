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
4. Select this project's `dist` folder (the folder containing manifest.json).
5. Pin **Clearspace** using Chrome's puzzle-piece Extensions menu.
6. Open a regular webpage, click the Clearspace toolbar icon, choose adjustments, then **Save and apply**. Return to the original tab to see changes.

Click the icon again after navigating to another site. Opening the settings directly through Chrome has no original target tab. For automatic behavior, use **Allow automatic adjustments on websites** and accept Chrome's permission prompt. Saved preferences then apply to permitted existing tabs and new/navigated webpages. Review or revoke permissions in Chrome's extension **Details > Site access**. Refresh adjusted pages after revoking access to clear remaining styles.

If the live colour sample changes but websites do not, first check that you opened Clearspace through its extension icon, rather than localhost. With automatic site access enabled, **Save and apply** also connects open websites when settings were opened directly. Success is reported only after a webpage confirms it received and applied the saved settings. After updating the extension, rebuild, reload its extension card and refresh the website before retrying.

Uncheck **Enable webpage adjustments**, then save to disable while remembering choices. **Reset adjustments** clears choices and removes styles from connected pages. The UI theme is separate from website appearance and is remembered on save.

After code changes, rebuild, click Reload on the extension card, refresh webpages and reopen settings.

`npm run dev:client` starts the labelled local UI demo; it does not modify websites. The Express scaffold below remains for teammates; the extension does not use it.

## Extension features and verification

### Colour blindness

Open **Vision → Colour blindness**. Select a red–green palette (red/protan or green/deutan emphasis) or a blue–yellow palette (tritan), then adjust **Strength**. The labelled, shape-coded sample compares original colours with your current settings immediately, including in the local UI demo. Select **Save and apply** to adjust the original webpage.

These are assistance palettes that redistribute colour channels, not deficiency simulations or clinically validated corrections. Neutral greys and opacity are preserved. Choose the palette and strength that help you; preferences vary. Whole-page colour remapping also affects images, videos, charts and canvas as rendered on supported pages. It does not inspect or label their contents. Existing page filters are temporarily overridden and root filtering can affect fixed-position layouts.

**Use cues beyond colour** works independently of the palette: it underlines links, adds borders to form controls/buttons, adds visible keyboard focus and outlines fields that the website marks `aria-invalid="true"` with dashed lines. It cannot infer missing status labels or make arbitrary colour-only charts accessible.

The palette, strength and cues are saved with the other preferences and shared with connected tabs. **Off** restores the original palette while leaving other adjustments available. **Clear all** clears the colour choices along with other selections; save to apply. Switching adjustments off and saving pauses effects without losing choices. **Reset choices** removes effects and resets the colour controls. Existing saved settings start with colour assistance off.

After rebuilding, reload the extension and refresh existing webpages so they load the updated scripts. Manually check each palette at 0% and 100%, switch modes, reload settings, pause/resume and reset. Try dynamic page content, a page with its own SVG/filter styles, and combining the palette with high contrast and link underlines. Check keyboard operation of the select, slider and cue checkbox. Chrome visual rendering still needs a browser check; Node tests verify filter creation/replacement/removal, independent cues, neutral-colour preservation, malformed settings and packaging.

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
