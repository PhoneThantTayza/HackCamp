# Dyslexia functions and compatibility

## Feature contracts

| Experience | Default behavior | Reading targets | Removal |
| --- | --- | --- | --- |
| Letters/words difficult to distinguish | Readable font, letter/word spacing, highlight the word under the pointer | Direct readable text in paragraphs, headings, spans, divs, list items and links | Remove owned rules/markers and highlight ranges |
| Long paragraphs overwhelming | Line height 1.8, line length 60ch, extra space after paragraphs, logical start alignment | Text carriers; width/margins only on ordinary block paragraphs outside direct grid/flex/table layouts | Remove owned rules/markers |
| Reading fatigue | Highlight the active passage under the pointer | Current paragraph/list item/small text block; focus events also supported on readable focused elements | Delete owned highlight range |
| Visual reading stress | Warm reading surfaces with dark text | Readable text carriers, preserving link colors and avoiding blanket recoloring of app containers | Remove owned rules/markers and restore inline conflicts |
| Lose place | Pointer-following line guide with optional surrounding dimming | Noninteractive overlay over the current document/frame | Remove owned overlay/listeners |

These are user preferences, not a diagnosis or a WCAG conformance check. Paragraph layout, typography, highlighting and the guide have different roles, so selecting everything does not just repeat the same spacing treatment. Text and meaning are never rewritten. Word explanations, summaries, simpler language and spelling/grammar are not implemented by this engine. The separate selection-to-speech modules now read user-selected text when the saved listening experience is enabled; see [selection-speech.md](selection-speech.md). Hover highlighting never triggers speech.

## Settings and conflicts

`client/public/dyslexia.js` defines `clearspaceDyslexia` in the content script's isolated world. `content.js` supplies vision conflict context and listens for saved settings updates. The configuration UI saves an extra `dyslexia` field alongside the existing version-1 settings:

```js
{
  version: 1,
  enabled: true,
  selected: ['vision:Underline links'],
  light: false, // configuration theme only
  dyslexia: {
    experiences: {
      distinguishWords: true,
      overwhelmingParagraphs: false,
      readingFatigue: false,
      visualStress: false,
      losePlace: true,
    },
    customization: {
      // Omit fields to keep suggestions; explicit values override presets.
      // font: 'sans', // sans | serif | system | null (website font)
      // letterSpacing: 0.06, wordSpacing: 0.12, lineHeight: 1.8,
      // lineLength: 60, paragraphSpacing: 0.9, alignStart: true,
      // wordHighlight: true, focusParagraph: false,
      // guide: true, guideSize: 40, guideColor: '#ffe58a', dimming: 0.15,
      // background: '#f5f0e6', textColor: '#242424',
    },
  },
}
```

Ordering is presets -> explicit customization -> vision conflict resolution. High contrast wins over dyslexia colors. Extra line spacing establishes a minimum line height of 1.8. Colors must be six-digit hex. Foreground/background are paired, and a requested pair below 4.5:1 gets black or white text. This protects the pair only; it is not an accessibility audit of the website. Highlight text has its own contrasting foreground/background. Link colors remain the website's responsibility.

Custom overrides remain active until cleared. The UI shows their count and provides **Use suggested settings**. This resolves the common case where an old explicit setting silently masks a new experience selection. Old dyslexia checkbox settings migrate to explicit customization when the UI loads; other categories are preserved. Global disable remembers choices. Clear all clears them in the form; Save and apply persists the clear. Reset clears and applies immediately. The Vite UI is explicitly a local settings demo and does not adjust other websites.

## Live DOM API

```js
const proposed = clearspaceDyslexia.suggest(preferences, {
  highContrast: false,
  extraLineSpacing: false,
});
const controller = clearspaceDyslexia.createController(document);
controller.apply(preferences); // or enable()/update()
controller.reset();            // or disable()
```

Keep one controller per document. The content script already owns one; do not create a competing controller when using storage integration. An explicit open ShadowRoot can also be a root, but a document controller now discovers accessible nested roots itself. Pass live nodes, never extracted HTML strings. A detached HTML snapshot cannot preserve app state, handlers, editing or later updates.

## Techniques and safety

The engine marks direct readable-text carriers with a unique extension-owned data attribute and adds a root-scoped stylesheet. This includes generic containers, buttons and other interactive labels, code, SVG text and MathML. Hover word highlighting also handles long text nodes without a size cutoff. Editors, native input fields, hidden regions and recognizable icon fonts remain protected. Carriers containing editing controls or known icon elements are not styled, to avoid inherited typography leaking into them; their ordinary text can still be highlighted. Hover only paints ranges: it does not alter the selection, trigger speech, or interrupt existing speech.

The rules have sufficient specificity for ordinary framework CSS. For conflicting inline `!important` properties, a small per-property ledger records the original value and priority. Rollback restores a property only if its current value is still the one the extension wrote. Website changes detected while active become the new restoration value; unrelated inline properties remain untouched. Existing style sheets, nodes, handlers, focus and typed values are preserved.

The CSS Custom Highlight API paints word/passage ranges without wrapping or splitting text. Where unavailable, a pointer-transparent outline overlay provides a fallback. The guide is rendered in an extension-owned closed shadow root. Visibility is controlled on an internal element so host CSS cannot lock the guide hidden. Escape, scroll, pointer leave and window blur clear active visuals; a user's text selection is left unobscured. Guide/highlight behavior is pointer-driven, with limited focus support; it is not eye tracking, speech highlighting or automatic sentence comprehension.

Passage highlighting changes only the highlight background. Each text run keeps its existing text colour (including a separate tool's text fill); muted ivory or slate is chosen using computed text contrast. White/black is used when neither muted background reaches 4.5:1, choosing the best available contrast without recolouring text. Transparent text, ancestor opacity, filters, gradients and text animations can prevent that target from being reached; this is not a compliance guarantee. Inline/class colour changes refresh the hovered passage even with a stationary pointer. Padding and gaps within the same passage keep it highlighted to avoid blinking between lines. Word highlighting remains a separate setting with its existing colours. Disable/reset removes only owned highlight entries. The outline fallback does not provide adaptive text backgrounds. This uses the [Chrome Custom Highlight API](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/highlight-text-ranges).

MutationObservers enqueue added/removed subtrees and changed text; class/style changes process the affected element rather than blindly rescanning the page. Work is capped at 150 elements or approximately 7ms per batch with a yield between batches. Extension attributes are not observed, and inline fallback writes are recognized to avoid loops. Disabled tools disconnect observers, timers, listeners, queues and highlights. Open shadow roots are scanned at discovery; late custom-element roots are checked in rotating batches of up to 50 hosts every two seconds. Pointer/focus paths can discover other late open roots. Closed roots are never traversed or patched. No framework methods or attachShadow prototypes are replaced.

## Frames and permission limits

Automatic registration uses `allFrames: true` and `matchOriginAsFallback: true`. Manual Apply injects the main frame first, then makes a best-effort all-frame injection. A frame failure produces a partial-support message instead of treating main-frame success as total failure. Each authorized frame runs independently; the parent never attempts to read a cross-origin child's DOM.

Site access remains optional. Cross-origin frames need their own authorized origin; activeTab alone does not authorize arbitrary embedded origins. Existing and new frames are covered by automatic registration only where Chrome permits injection. Browser settings pages, Chrome Web Store/restricted pages, PDFs, canvas/WebGL text, image text, inaccessible sandboxed frames and closed roots cannot be promised. Browser profiles/private windows are separate authorization contexts. User-origin styles, highly unusual CSS, fixed-height content and top-layer dialogs can still limit styling/overlay behavior. Width adjustments deliberately skip direct grid/flex/table reading items. No claim of universal coverage is made.

## Repeatable verification

```powershell
npm.cmd run build
node --test tests/extension.test.js tests/dyslexia.test.js tests/dyslexia-settings.test.js
```

Real Chrome tests require `playwright-core` and an installed Chrome executable. The app has no new runtime dependencies. The suite can load Playwright from a temporary install:

```powershell
npm.cmd install --prefix "$env:TEMP\a11yfix-browser-tests" --no-save --package-lock=false playwright-core
node tests/compatibility.browser.mjs
node tests/compatibility.browser.mjs --live-sites
```

If needed, `A11YFIX_PLAYWRIGHT` can point to Playwright's `index.mjs` and `A11YFIX_CHROME` to the browser executable. The suite creates a separate headless browser profile and two local fixture origins. It never uses the user's normal profile. Live-site mode visits Example.com, Wikipedia's Dyslexia article, and MDN's DOM article.

Local scenarios cover semantic and generic text, inline-important styles, code/editable/icon exclusions, input/click preservation, dynamic SPA-style navigation, new/late/nested open roots, RTL, layout-sensitive paragraphs, site style edits followed by rollback, word/passage highlights, guide pointer transparency, style/highlight fallbacks, same- and cross-origin frame documents injected independently, content-script storage callbacks, reinjection, disable cleanup, React UI persistence/override removal/reset, narrow layout, and a 2,000-paragraph dynamic insertion.

Latest verification: the build, 11 unit/adapter tests, and all 12 real-Chrome scenarios passed, with no captured page errors. The browser scenarios include typography/spacing changes and rollback on Example.com, Wikipedia and MDN. Local fixtures also verify moving an existing text node out of a shadow root and converting reading content into and out of an editable region. Public-site injection uses browser-protocol evaluation of local engine code; script-tag injection would incorrectly test the website's CSP instead of content-script execution.

Frame tests verify engine behavior in separate frame documents, not Chrome's actual extension grant decisions. Storage browser tests mock Chrome's storage API while exercising the real DOM/content script. The suite does not establish full installed-extension behavior across browser restarts, private windows, multiple browser windows or every navigation/permission combination. Those remain manual end-to-end checks after reloading `dist` in Chrome. Reload the extension and existing test pages once when upgrading from the older engine.

## Next highest-impact improvement

Add an automated installed-extension test using a dedicated Chrome-for-Testing/Chromium profile to verify real optional host grants, frame denial, multiple windows, navigation and restart persistence. Current real-browser tests exercise the engine thoroughly but do not simulate those permission decisions.
