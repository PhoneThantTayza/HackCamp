# Clearspace desktop

Clearspace now has an Electron desktop application for macOS and Windows, alongside the original Chrome extension. It uses the existing adjustment engines in a dedicated reading view and an optional browser companion. Desktop overlays and native helpers add effects outside the browser.

This is a development build. macOS builds and automated UI checks can run on the development Mac. Windows has its own native implementation and CI build job; validate it on a Windows machine before distributing it. Permission-dependent focus tracking and selected-text access also need testing in the applications you intend to support.

## Run

Use Node.js 24 and install dependencies with `npm install`.

```sh
npm run desktop
```

This builds the UI, compiles the native helper, prepares the companion, and opens the app. After preparing once, `npm run desktop:launch` opens the existing build. Re-run `npm run desktop` after source changes. The first Electron launch downloads its runtime if needed.

macOS requires the Xcode Command Line Tools (`xcode-select --install`). The helper is compiled for both Apple Silicon and Intel and combined into a universal binary. On Windows, run commands from PowerShell or Command Prompt; the helper uses the .NET Framework C# compiler and UI Automation assemblies supplied with Windows. The Windows installer targets x64.

The original extension still builds with `npm run build` into `dist`. Its settings and scripts have not been replaced.

## Coverage

Desktop applications own their typography and controls. Accessibility APIs expose selected text and control positions where supported; they do not allow arbitrary restyling of every application. The interface labels each adjustment's scope.

| Category / adjustment | Across the desktop | Reading view / companion websites |
| --- | --- | --- |
| Vision: dimming | Click-through shade on each display | Browser dimming is suppressed to avoid duplication |
| Vision: warm tint | Warm translucent overlay | Browser tint is suppressed to avoid duplication |
| Vision: colour assistance | Windows Magnification API colour matrix; macOS 12.3+ uses ScreenCaptureKit and a Metal colour renderer (Screen Recording permission required) | Existing assistance palettes on both platforms; suppressed only after the native desktop filter confirms it is active |
| Vision: larger text / contrast / link emphasis | System magnification and colour-filter settings are available; no universal app restyling | Existing text and page adjustment engines |
| Vision: soften bright backgrounds | Click-through paper-coloured veil on every display, with adjustable strength; it also tints text and images | Extra background recolouring is suppressed to avoid duplicating the desktop effect |
| Vision: Dark mode | Switches system appearance on macOS and Windows; apps must follow the system theme | Applied to the reading view and companion webpages |
| Vision / Motor: focus outlines | Outline the focused accessible control, where its app exposes bounds | Existing focus styles and keyboard navigation helpers |
| Dyslexia: fonts, letter / word spacing, line / paragraph spacing | Bring text from an accessible app with the reading shortcut, or paste copied text | Existing typography and word / passage highlight engines |
| Dyslexia: listening | Capture an explicit selection into the reading view; no automatic background text collection | Read-aloud controls and optional automatic selection reading, using local voices |
| Dyslexia / Cognitive: Focus mode | Pointer-following reading band; optionally follows a changed keyboard focus location | Desktop guide replaces the duplicate webpage guide |
| Motor: larger targets / button spacing | Enlarges Clearspace controls; system pointer and keyboard settings are available | Companion adjusts webpage targets and spacing |
| Motor: pointer halo | High-contrast ring around the pointer | No webpage integration needed |
| Motor: reduce motion | Opens system motion settings for other apps; Clearspace itself has no decorative animation | Existing motion engine on websites |
| Cognitive: hide distractions | Shades outside the active accessible window, including other monitors | Companion hides recognized webpage clutter; reading view contains only the imported text |

Previously unavailable extension features such as unfamiliar-word explanations and automatic summaries are not introduced by this desktop build. Secure desktops, login screens, privileged windows, exclusive full-screen apps, and custom-drawn controls may not support overlays or accessibility access.

## Desktop detection and controls

The helper reports the active app approximately every 400 ms. It reports control and window bounds when available, without reading window titles or document contents. On macOS, open **Connections → Request Accessibility access**, then enable Clearspace (or `clearspace-native` in development) in **System Settings → Privacy & Security → Accessibility**. Rebuilding or moving an unsigned helper can require granting access again.

Text capture happens only when requested with the global shortcut. Password fields are excluded. If an app does not expose a selected-text range, copy the passage and use **Paste clipboard**. Clipboard content is never polled automatically. The reading view treats imported text as plain text and does not execute copied HTML.

| Action | macOS | Windows |
| --- | --- | --- |
| Pause / resume | Command + Shift + Space | Ctrl + Shift + Space |
| Read selected text | Command + Shift + R | Ctrl + Shift + R |
| Turn adjustments off | Command + Shift + Escape | Ctrl + Shift + Escape |

Shortcut conflicts appear in Connections. Pause is also available in the window and tray/menu-bar menu. Closing the settings window leaves the app running; **Quit Clearspace** stops it. Quitting closes overlay windows and closes the helper's input pipe. Both helpers restore the system appearance they changed. The Windows helper restores its saved colour filter on normal exit or loss of the parent pipe, provided another application has not changed that filter in the meantime. Screen lock and suspend pause desktop effects. Abrupt termination of the native helper itself is outside that restoration guarantee; use system appearance/colour-filter settings to restore the display if necessary. macOS colour surfaces disappear when their helper exits.

Turning desktop detection off clears the active-app information and stops accessibility polling. Dimming, background softening, tint, a pointer guide and the pointer halo still work. Cognitive's app exceptions pause adjustments while the specified application is active; detection must be enabled for exceptions to take effect.

Desktop background softening uses a translucent paper-coloured veil on both macOS and Windows. It requires no Accessibility or screen-recording permission. At 0% the veil is absent; increasing strength softens bright areas across the screen. It also affects text, images and dark areas because it cannot distinguish background pixels from other content. The standalone extension still adjusts recognized webpage backgrounds selectively. Desktop previews and the companion use the desktop veil once, without adding that webpage effect on top. Pause, uncheck, reset and per-app exceptions remove the veil.

## Dark mode and desktop colour assistance

**Vision → Light sensitivity → Dark mode** now changes system appearance, as well as the Clearspace interface, reader and companion pages. On macOS, allow Clearspace to control **System Events** when prompted. If denied, use **Privacy & Security → Automation**, enable System Events for Clearspace, and click **Retry Dark mode**. Windows changes both app and shell appearance. Applications with a fixed Light theme must be set to follow system appearance. This does not invert photos or force a dark layout into an app that does not support one.

Pausing, unchecking Dark mode, resetting, quitting, locking the screen, or activating an excluded app restores the previous appearance. An independent user change to Light is preserved. macOS automatic appearance schedules may subsequently change the system appearance; Clearspace does not disable the schedule. A native helper crash can prevent restoration.

**Vision → Colour blindness → Palette** applies the selected channel-remapping palette across desktop displays, including native applications. At 0% strength or Original colours, the native filter is removed. These assistance palettes are not clinical corrections; neutral greys deliberately remain unchanged. The coloured shape sample makes the differences visible.

On macOS:

1. Choose a palette and click **Allow desktop colour processing**.
2. Enable **Clearspace** in **System Settings → Privacy & Security → Screen Recording** (called **Screen & System Audio Recording** on some macOS versions). Development builds may appear as the parent terminal/app or `clearspace-native`.
3. Fully quit Clearspace using its menu-bar menu, then reopen it. If permission is already granted, **Retry palette** starts processing again.
4. Confirm the status says **Colour assistance is active across the desktop**. An error leaves the reader/website fallback available and does not claim the desktop is filtered.

ScreenCaptureKit excludes the native colour surfaces from capture, preventing feedback. Click-through panels display the remapped frames on each screen; they do not take keyboard focus. Capture and rendering run at up to 30 frames/second, so this uses GPU resources and can add display latency. HDR content is rendered in SDR sRGB; protected video may appear blank. Secure desktops and some exclusive full-screen applications remain outside coverage. The pointer retains its native colours. Use the global pause shortcut to remove the colour surfaces immediately. Avoid combining these palettes with a separate system colour filter.

Permission must be granted by the user. The automated GPU check verifies all palette matrices and image orientation with synthetic pixels, without screen capture. The manual native check successfully exercised system Dark mode on the development Mac; live desktop colour capture still needs validation after Screen Recording access is granted. Windows appearance and colour integration also require testing on Windows hardware.

## Connect websites

Use the **Clearspace Desktop Companion** in place of the original extension when using desktop preferences, so the same adjustments do not accumulate.

1. In desktop **Connections**, select **Show companion folder**. During development this is `build/companion`; packaged apps include it in their resources.
2. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, and load that folder unpacked.
3. Copy the companion's extension ID into desktop Connections, select the browser, and choose **Install browser connection**.
4. In the companion popup, choose **Connect to desktop** and approve website access.

The desktop app registers the native host `org.clearspace.desktop` for the specific extension ID. This is a per-user installation; it requires no web server or open TCP port. The native host can only read a short-lived preference snapshot. The browser requests that snapshot every two seconds. Pausing or quitting the desktop app pauses companion adjustments; the snapshot also expires after six seconds if the app crashes. Settings flow from desktop to browser, not in the reverse direction. The standalone extension retains its independent settings.

macOS manifests are installed under `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` or `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/`. Windows uses a manifest under Clearspace's user-data directory and an `HKCU\Software\Google\Chrome\NativeMessagingHosts\org.clearspace.desktop` or corresponding `Microsoft\Edge` registry entry. Removing that host manifest/registry entry and the companion uninstalls the connection. If you move the packaged app, install the connection again so its executable path is updated.

## Local data and permissions

- Preferences: `~/Library/Application Support/Clearspace/preferences.json` on macOS or `%APPDATA%\Clearspace\preferences.json` on Windows.
- Browser snapshot: `browser-settings.json` in that same directory; it expires automatically.
- Imported text and current application metadata stay in memory and are not written to preferences or snapshots. Clear text removes the current passage; quitting clears it.
- macOS desktop colour assistance captures display frames through ScreenCaptureKit while enabled. Frames remain in local GPU/memory buffers; they are not saved, logged, sent to the browser, or uploaded. It uses no audio capture, OCR, cloud account, API key, or backend server. Other overlays require no screen capture.
- Electron renderers are sandboxed, use context isolation, and receive a fixed IPC API. The app serves bundled resources through a restricted local protocol with a Content Security Policy. Native helpers have no shell-command interface.

## Validate and package

```sh
npm run desktop:prepare
npm run test:desktop
npm run test:extension
npm run desktop:smoke
# macOS GPU verification with synthetic pixels:
node scripts/check-colour-renderer.mjs
npm run desktop:package
```

The smoke test uses `build/smoke-profile`, briefly displays a test window, and never changes the real desktop preferences, enables native filters, registers global shortcuts, or installs a browser connection. It exercises the actual Electron renderer, category navigation, persistence, pause/reset, plain-text import and typography restoration. It also checks Dark mode UI, every palette, visible native failures, and reset. It saves `build/desktop-smoke.png`. For an explicit live check, `node scripts/check-desktop-effects.mjs` briefly enables native Dark mode and palettes, then restores them; it may request macOS Automation consent and needs existing Screen Recording access for palettes.

Packaging uses `electron-builder.yml` and outputs to `release/`. Build on the target operating system. For an Intel macOS package use `npm run desktop:package -- --mac --x64`; for Apple Silicon use `--mac --arm64`. The included universal native helper supports either. Windows builds an NSIS installer. `.github/workflows/desktop.yml` builds both platforms and uploads installer artifacts; it does not publish releases. Signing and macOS notarization need your developer credentials for public distribution. CI defaults to unsigned artifacts.

Before release, check real applications and hardware:

- Pointer guide and click-through typing/scrolling in Chrome, a document editor and a PDF app.
- Accessibility granted, denied and later revoked; unsupported/custom controls; no text selection; secure text fields.
- Multiple monitors with different scale factors and displays left/above the primary display; connect/disconnect displays while effects are active.
- Full-screen windows, macOS Spaces, lock/unlock, pause/resume, exceptions, and quit.
- Dark mode restoration and independent theme changes on macOS and Windows.
- macOS colour capture with permission granted/denied/revoked, static and moving content, display hotplug, protected video, and interaction through the surfaces.
- Windows colour restoration, including another colour-filter app changing the display during the session.
- Companion connection/reconnection, permission refusal, browser restart, desktop crash/quit and paused state.
- Local speech voices, speech cancellation, and long passages.

## Implementation references

The desktop overlay uses [Electron window controls](https://www.electronjs.org/docs/latest/api/browser-window) and [screen coordinates](https://www.electronjs.org/docs/latest/api/screen). Native helpers use [macOS accessibility elements](https://developer.apple.com/documentation/applicationservices/axuielement_h), [Windows UI Automation](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-uiautomationoverview), and the [Windows full-screen colour-effect API](https://learn.microsoft.com/en-us/windows/win32/api/magnification/nf-magnification-magsetfullscreencoloreffect). macOS colour processing uses [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos), [Core Image rendering to Metal](https://developer.apple.com/documentation/coreimage/cicontext/render(_:to:commandbuffer:bounds:colorspace:)), and the [MTKView drawing lifecycle](https://developer.apple.com/documentation/metalkit/mtkview/currentdrawable). The companion uses [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
