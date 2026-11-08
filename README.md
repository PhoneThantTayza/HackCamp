# Accessify

A browser accessibility extension for **Chrome and Firefox**. Configure preferences once, then browse normally with adjustments applied directly to permitted webpages.

## Our approach

- Choose individual preferences across **vision, dyslexia, motor/mobility and cognitive** categories without selecting a diagnosis.
- Customize reading, colours, contrast, spacing and focus using sidebar settings and a live preview.
- Save preferences locally. Optional automatic site access covers permitted existing tabs, new tabs and navigation across browser windows.
- Disable adjustments while keeping your choices, or reset them to restore pages. The settings theme is separate from webpage adjustments.

Built with React, Tailwind CSS and browser extension scripts. Local adjustments work without a server or account. Optional account sync uses Express and Auth0 and requires separate configuration.

## Build and install

Run from the project root:

```sh
npm install
npm run build:chrome
npm run build:firefox
```

**Chrome 116+:** Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `dist`.

**Firefox desktop 142+:** Open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `dist-firefox/manifest.json`. Temporary installations disappear when Firefox restarts.

Open a regular webpage, click the **Accessify** toolbar icon, choose adjustments, then **Save and apply**. Enable optional automatic site access to apply preferences as you browse.

After changes, rebuild the relevant target, reload the extension and refresh webpages.

## Development

```sh
npm run dev:client
node --test tests/extension.test.js tests/firefox.test.js tests/selection-tts.test.js
```

The development command runs a local UI demo; it cannot adjust other websites. Test both installed extensions for persistence, multiple tabs/windows, navigation, dynamic content, disable/reset and denied permissions.

## Project structure

- `client/src/` — React settings UI, preferences and account integration.
- `client/public/` — manifest, background scripts and webpage adjustments.
- `scripts/extension-manifest.js` — Firefox manifest conversion.
- `server/` — Express scaffold and optional preference sync.
- `tests/` — automated checks and browser test scripts.

## Deployment and limits

Copy `.env.example` to `.env.local` in the project root. After hosting the sync server, set `VITE_API_URL` to its HTTPS origin and rebuild. The build updates both the client API address and the extension's server permission. Until then, the default remains `http://127.0.0.1:3000`; run `npm run dev` for local sync. Auth0 must also allow the callback URL displayed under **Setting up Auth0?** in the installed extension.

Chrome and Firefox are our deployment targets. Build each package separately for store submission; local installation is for development, not a published release.

Adjustments require site access and are best effort. Protected browser/store pages, PDFs, embedded frames and some custom webpage content are unsupported. Website layouts need testing; Accessify does not guarantee accessibility compliance.
