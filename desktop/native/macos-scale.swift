import CoreGraphics
import Foundation

// "Larger text and controls" across the desktop.
// macOS has no setting for one app to enlarge another app's text, so we pick a
// "looks like" display scale with fewer points (= everything bigger), exactly like
// System Settings → Displays → Larger Text. Changes are made "for this app only":
// if Clearspace quits or crashes, macOS puts the original scale back by itself.
final class DesktopScale {
    private var original: [CGDirectDisplayID: CGDisplayMode] = [:]

    private func activeDisplays() -> [CGDirectDisplayID] {
        var count: UInt32 = 0
        guard CGGetActiveDisplayList(0, nil, &count) == .success, count > 0 else { return [] }
        var displays = [CGDirectDisplayID](repeating: 0, count: Int(count))
        guard CGGetActiveDisplayList(count, &displays, &count) == .success else { return [] }
        return Array(displays.prefix(Int(count)))
    }

    // The mode closest to "original size ÷ factor", same shape and sharpness.
    private func mode(for display: CGDirectDisplayID, base: CGDisplayMode, factor: Double) -> CGDisplayMode? {
        let options = [kCGDisplayShowDuplicateLowResolutionModes as String: true] as CFDictionary
        guard let modes = CGDisplayCopyAllDisplayModes(display, options) as? [CGDisplayMode] else { return nil }
        let ratio = Double(base.width) / Double(base.height), retina = base.pixelWidth > base.width
        let target = Double(base.width) / factor
        let fits = modes.filter {
            // Always at least one step bigger than the user's own scale.
            $0.isUsableForDesktopGUI() && $0.width < base.width
                && abs(Double($0.width) / Double($0.height) - ratio) < 0.02
                && ($0.pixelWidth > $0.width) == retina
        }
        return fits.min { a, b in
            let da = abs(Double(a.width) - target), db = abs(Double(b.width) - target)
            if da != db { return da < db }
            return abs(a.refreshRate - base.refreshRate) < abs(b.refreshRate - base.refreshRate)
        }
    }

    func set(_ factor: Double?, id: Any) {
        guard let factor = factor, factor.isFinite, factor > 1.0 else { restore(); emit(["requestId": id, "applied": false]); return }
        var config: CGDisplayConfigRef?
        guard CGBeginDisplayConfiguration(&config) == .success, let config = config else {
            emit(["requestId": id, "error": "macOS would not change the display scale."]); return
        }
        var changed = false
        for display in activeDisplays() {
            guard let current = CGDisplayCopyDisplayMode(display) else { continue }
            let base = original[display] ?? current
            guard let next = mode(for: display, base: base, factor: factor) else { continue }
            if original[display] == nil { original[display] = current }
            if next.width == current.width && next.pixelWidth == current.pixelWidth { changed = true; continue }
            if CGConfigureDisplayWithDisplayMode(config, display, next, nil) == .success { changed = true }
        }
        guard changed else {
            CGCancelDisplayConfiguration(config)
            emit(["requestId": id, "error": "This display has no larger scale to switch to. Try System magnification instead."]); return
        }
        if CGCompleteDisplayConfiguration(config, .forAppOnly) == .success { emit(["requestId": id, "applied": true]) }
        else { emit(["requestId": id, "error": "macOS would not change the display scale."]) }
    }

    func restore() {
        guard !original.isEmpty else { return }
        original = [:]
        CGRestorePermanentDisplayConfiguration() // back to the user's own scale
    }
}
