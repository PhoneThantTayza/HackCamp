# Clearspace

## Desktop app — macOS and Windows

Clearspace now includes a desktop app with Vision, Dyslexia, Motor / mobility, and Cognitive controls. It adds desktop reading guides, dimming, background softening, warm tint, system Dark mode, desktop colour assistance, focus outlines, active-application detection, a reading view, and a browser companion.

```sh
npm install
npm run desktop
```

Use Node.js 24. macOS needs the Xcode Command Line Tools; Windows builds its helper using the system .NET Framework compiler. **[Desktop setup, feature coverage, testing, and packaging](docs/desktop.md)** explains permissions and the browser connection. The UI labels adjustments that work across the desktop, in the reading view/websites, or through system settings. Other applications retain control of their own fonts, layouts, and button sizes.

Run `npm run desktop:package` on each target OS to create installers in `release/`. Windows/macOS CI builds are included. Public distribution still requires signing credentials and testing on the target machines.

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

If applying still fails, the error includes Chrome's reason or the page script's error. A closed or navigated target requires reopening Clearspace from the target webpage's toolbar icon. Permission errors require granting access through that icon or the optional automatic-access control; local files also require **Allow access to file URLs** in Chrome's extension Details. Chrome settings and the Chrome Web Store are protected. For other errors, retain the full message and the failing webpage URL for diagnosis.

Uncheck **Enable webpage adjustments**, then save to disable while remembering choices. **Reset adjustments** clears choices and removes styles from connected pages. The UI theme is separate from website appearance and is remembered on save.

After code changes, rebuild, click Reload on the extension card, refresh webpages and reopen settings.

`npm run dev:client` starts the labelled local UI demo; it does not modify websites. The Express scaffold below remains for teammates; the extension does not use it.

## Extension features and verification

### Combined live preview

**Preview all adjustments** shows all current choices together on an interactive sample webpage. It uses the same page adjustment scripts for vision, dyslexia, motor controls, motion and distraction hiding. Try buttons, links, keyboard focus, text selection and pointer reading tools inside the preview. Listening uses the browser's available speech voices. Choices save and apply to connected websites automatically. **Before adjustments** shows the original sample without changing your saved choices or connected websites. Clear all and Reset choices also update the preview.

Run `npm run build` and `node tests/preview.browser.mjs` for the Chrome integration check. Set `A11YFIX_PLAYWRIGHT` to a local playwright-core `index.mjs` and `A11YFIX_CHROME` to your Chrome executable when needed.

### Colour blindness

Open **Vision → Colour blindness**. Select a red–green palette (red/protan or green/deutan emphasis) or a blue–yellow palette (tritan), then adjust **Strength**. The labelled, shape-coded sample compares original colours with your current settings immediately, including in the local UI demo. Select **Save and apply** to adjust the original webpage.

These are assistance palettes that redistribute colour channels, not deficiency simulations or clinically validated corrections. Neutral greys and opacity are preserved. Choose the palette and strength that help you; preferences vary. Whole-page colour remapping also affects images, videos, charts and canvas as rendered on supported pages. It does not inspect or label their contents. Existing page filters are temporarily overridden and root filtering can affect fixed-position layouts.

**Use cues beyond colour** works independently of the palette: it underlines links, adds borders to form controls/buttons, adds visible keyboard focus and outlines fields that the website marks `aria-invalid="true"` with dashed lines. It cannot infer missing status labels or make arbitrary colour-only charts accessible.

The palette, strength and cues are saved with the other preferences and shared with connected tabs. **Off** restores the original palette while leaving other adjustments available. **Clear all** clears the colour choices along with other selections; save to apply. Switching adjustments off and saving pauses effects without losing choices. **Reset choices** removes effects and resets the colour controls. Existing saved settings start with colour assistance off.

After rebuilding, reload the extension and refresh existing webpages so they load the updated scripts. Manually check each palette at 0% and 100%, switch modes, reload settings, pause/resume and reset. Try dynamic page content, a page with its own SVG/filter styles, and combining the palette with cues beyond colour. Check keyboard operation of the select, slider and cue checkbox. Chrome visual rendering still needs a browser check; Node tests verify filter creation/replacement/removal, independent cues, neutral-colour preservation, malformed settings and packaging.

### Low vision

Open **Vision → Low vision** and select any combination of **Larger text and controls**, **Higher contrast**, **More visible links**, and **More visible keyboard focus**. Each option has a **Strength** slider (0–200%, in steps of 5) that updates its live sample. Save and apply remembers each strength and uses it on webpages. At 0%, that option has no effect; existing choices default to 100% to keep their current appearance. At 100% strength, larger text scales the page to 125%, increases control targets to at least 44px and adds readable line spacing. At the new 200% maximum, it scales the page to 150% with targets of at least 64px; link emphasis and focus outlines also become stronger. Higher contrast gradually adjusts text against its existing background instead of repainting the page. Link emphasis adds bold text, thick underlines and distinct link/visited colours. Keyboard focus uses a black outline with a white surround for visibility on light and dark surfaces.

Select **Save and apply** to use these choices on connected webpages. With **Allow site access**, they also apply to existing and newly opened websites, just like colour blindness settings. Choices are remembered, can be combined with colour assistance, and follow the same pause, clear and reset controls. Styles also cover matching content added later. Fixed layouts may overlap when enlarged; embedded frames and shadow roots remain unsupported. Check actual rendering, keyboard focus and combinations on light/dark and dynamically updated pages after rebuilding and reloading the extension.

Higher contrast preserves background colours, gradients, text shadows, native control themes and already-readable text. At 5%, it makes a small improvement toward 4.5:1 text contrast; at 100%, it aims for 4.5:1; at 200%, it aims for 7:1 where possible without changing the background. It does not claim every target is achievable. The same colour calculation powers the live sample. Changes are reversible, do not accumulate across strength updates, and are refreshed for dynamic content and theme changes. Simple sRGB gradients and transparent background layers are estimated; text over photos, complex gradients, gradient-filled letters and composited effects is left alone rather than guessing. Image, video, canvas, SVG and generated pseudo-element content are not recoloured. These estimates do not account for overlapping siblings or every browser paint effect.

### Focus mode

Open **Cognitive → Focus mode** to dim the page around a clear horizontal reading band. Adjust **Reading band height** (40–320px) and **Surrounding dimming** (0–90%). The live sample follows the pointer; **Save and apply** enables it on connected webpages. On a webpage, the band follows your pointer or the centre of a control you reach with Tab. The reading band starts off. Right-click anywhere on the webpage to enable it, then right-click again to disable it. **Escape** also turns it off. While Focus mode is selected and webpage adjustments are enabled, this replaces the usual right-click context menu. This switch affects only the current page until settings are applied again or the page reloads. At 0% dimming there is no overlay.

Preferences persist with the other adjustments and work with optional automatic site access. Pause removes the spotlight while keeping its settings; Clear all and Reset choices restore its defaults. The overlay allows clicks, scrolling and text selection through it, without changing the page content. Current Chrome uses a manual popover to keep it in viewport coordinates when page zoom or colour filters are active. Embedded frames and controls inside shadow roots are not tracked. Browser rendering still needs a manual check: try pointer movement, keyboard navigation, scrolling, resizing, repeated on/off clicks, Escape and resume, pause/reset and combinations with page enlargement and colour assistance.

### Hide distractions

Select **Cognitive → Hide distractions**, then **Save and apply** to hide ads throughout the page: header banners, inline article ads, sticky and popup ad containers, common ad-network iframes and marked sponsored/promoted widgets. It also hides marked sidebars, complementary regions, related-post panels and social-share widgets. The same rules cover matching content added later. Detection uses ad-specific attributes, class/ID tokens and known iframe sources; custom or unmarked ads, ads inside shadow DOM, and ads embedded in video may remain. This visually hides recognized ads rather than blocking network requests. Uncheck and save, pause adjustments, or reset choices to restore the page. It works independently of Focus mode and follows the same saved preferences and automatic site access.

Matching uses semantic landmarks and common class/ID tokens; some sites will need additional selectors. Primary content containers stay available. General sidebar/related-content rules also preserve containers holding forms or dialogs; explicitly marked ad containers can be hidden even when they include an ad form or dialog. Main navigation outside sidebars stays visible. Existing page columns may leave empty space; this does not rebuild the layout.

Run `node --test tests/hide-distractions.browser.test.js` with `CHROME_BIN` set to a Chrome/Chromium executable for an offline browser check of banner, inline, sticky, popup and iframe ads, dynamically inserted ads, preserved content and restoration. Without `CHROME_BIN`, this browser test is skipped.

Other categories offer letter/button spacing, reduced CSS motion, readable font, shorter text lines, left alignment, larger form/button targets and visible keyboard focus. Reading guide, simplified layout, clear headings and shorter paragraphs are disabled and marked Coming later.

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

### Light sensitivity

Open **Vision → Light sensitivity** to select **Dim page**, **Soften bright backgrounds**, **Warm colour tint**, and **Dark page theme**. The first three have independent 0–200% strength sliders; dark theme is an on/off choice. A live sample shows the combined result. **Save and apply** remembers your choices and applies them to webpages; pause or reset removes the effects.

Dim page lowers content brightness by up to 50%, and warm tint applies a gentle sepia-based filter. Both include images and video and combine with colour assistance. Softening changes bright, nearly neutral solid backgrounds; dark theme uses dark surfaces and light text without inverting media. Dark theme takes precedence over softening when both are selected. These adjust webpage content rather than hardware screen brightness. Images used as backgrounds, embedded frames, and custom page styling can limit coverage.
