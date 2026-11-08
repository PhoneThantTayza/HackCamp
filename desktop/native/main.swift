import AppKit
import ApplicationServices
import Foundation

let outputLock = NSLock()
func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
    outputLock.lock(); defer { outputLock.unlock() }
    FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
}
func readExactly(_ count: Int) -> Data? {
    var data = Data()
    while data.count < count {
        let part = FileHandle.standardInput.readData(ofLength: count - data.count)
        if part.isEmpty { return nil }; data.append(part)
    }
    return data
}
// Chrome launches this same executable with its extension origin as an argument.
// Only a short-lived preference snapshot is shared. No application text crosses this bridge.
if CommandLine.arguments.contains(where: { $0.hasPrefix("chrome-extension://") }) {
    let file = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Clearspace/browser-settings.json")
    while let header = readExactly(4) {
        let count = header.enumerated().reduce(0) { $0 | (Int($1.element) << ($1.offset * 8)) }
        if count < 1 || count > 4096 { break }
        guard let body = readExactly(count), let request = try? JSONSerialization.jsonObject(with: body) as? [String: Any], request["type"] as? String == "get-settings" else { break }
        var settings: Any = NSNull()
        if let data = try? Data(contentsOf: file), let snapshot = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let expires = snapshot["expiresAt"] as? Double, expires > Date().timeIntervalSince1970 * 1000 {
            settings = snapshot["settings"] ?? NSNull()
        }
        if let data = try? JSONSerialization.data(withJSONObject: ["type": "clearspace:desktop-settings", "settings": settings]) {
            let n = data.count
            FileHandle.standardOutput.write(Data((0..<4).map { UInt8((n >> ($0 * 8)) & 255) }))
            FileHandle.standardOutput.write(data)
        }
    }
    exit(0)
}

let appearance = DesktopAppearance()
let scale = DesktopScale()
var colour: AnyObject?
if #available(macOS 12.3, *) { colour = DesktopColour() }
var watching = true
func attribute(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success ? value : nil
}
func elementAttribute(_ element: AXUIElement, _ key: String) -> AXUIElement? {
    guard let value = attribute(element, key), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}
func bounds(_ element: AXUIElement?) -> [String: Double]? {
    guard let element = element, let p = attribute(element, kAXPositionAttribute), let s = attribute(element, kAXSizeAttribute),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero, size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &point), AXValueGetValue(s as! AXValue, .cgSize, &size), size.width > 0, size.height > 0 else { return nil }
    return ["x": point.x, "y": point.y, "width": size.width, "height": size.height]
}
func protectedField(_ element: AXUIElement) -> Bool {
    let role = attribute(element, kAXSubroleAttribute) as? String ?? ""
    return role == "AXSecureTextField"
}
func context() {
    guard watching else { return }
    guard let app = NSWorkspace.shared.frontmostApplication else { return }
    let trusted = AXIsProcessTrusted()
    var result: [String: Any] = ["type": "context", "accessibility": trusted, "units": "dip",
        "app": ["name": app.localizedName ?? "Application", "id": app.bundleIdentifier ?? String(app.processIdentifier), "pid": app.processIdentifier]]
    if trusted {
        let application = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(application, 0.2)
        result["window"] = bounds(elementAttribute(application, kAXFocusedWindowAttribute))
        let focus = elementAttribute(application, kAXFocusedUIElementAttribute)
        if let focus = focus, !protectedField(focus) { result["focus"] = bounds(focus) }
    }
    emit(result)
}
// ---------- Dyslexia across the desktop ----------
// Finds the word and the paragraph under the pointer in the frontmost app, using
// macOS Accessibility. Only rectangles (positions) are sent to Clearspace, never the text.
var readingWord = false, readingPassage = false, lastPointerText = ""
func parameterized(_ element: AXUIElement, _ name: String, _ value: AXValue) -> CFTypeRef? {
    var result: CFTypeRef?
    return AXUIElementCopyParameterizedAttributeValue(element, name as CFString, value, &result) == .success ? result : nil
}
func textBounds(_ element: AXUIElement, _ range: CFRange) -> CGRect? {
    var r = range
    guard let value = AXValueCreate(.cfRange, &r), let rect = parameterized(element, "AXBoundsForRange", value),
          CFGetTypeID(rect) == AXValueGetTypeID() else { return nil }
    var box = CGRect.zero
    guard AXValueGetValue(rect as! AXValue, .cgRect, &box), box.width > 0, box.height > 0 else { return nil }
    return box
}
func rectDictionary(_ r: CGRect?) -> Any { guard let r = r else { return NSNull() }; return ["x": r.origin.x, "y": r.origin.y, "width": r.width, "height": r.height] }
// The app whose normal window is under the pointer (not necessarily the app in front).
// Skips Clearspace's own see-through overlays and menu bar / Dock layers.
func appUnderPointer(_ point: CGPoint) -> pid_t? {
    let own: Set<pid_t> = [getpid(), getppid()]
    guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
    for window in windows {
        guard let layer = window[kCGWindowLayer as String] as? Int, layer == 0,
              let pid = window[kCGWindowOwnerPID as String] as? Int32,
              let boundsInfo = window[kCGWindowBounds as String] as? NSDictionary,
              let bounds = CGRect(dictionaryRepresentation: boundsInfo), bounds.contains(point) else { continue }
        if (window[kCGWindowAlpha as String] as? Double ?? 1) < 0.05 { continue }
        return own.contains(pid) ? nil : pid // Clearspace's own settings window: nothing to highlight
    }
    return nil
}
func pointerText() {
    var word: CGRect?, passage: CGRect?
    defer {
        let event: [String: Any] = ["type": "pointer-text", "word": rectDictionary(word), "passage": rectDictionary(passage)]
        let key = "\(word.map { "\($0)" } ?? "-")|\(passage.map { "\($0)" } ?? "-")"
        if key != lastPointerText { lastPointerText = key; emit(event) }
    }
    guard watching, readingWord || readingPassage, AXIsProcessTrusted() else { return }
    // AppKit counts y from the bottom of the main screen; Accessibility counts from the top.
    let mouse = NSEvent.mouseLocation, height = NSScreen.screens.first?.frame.height ?? 0
    var point = CGPoint(x: mouse.x, y: height - mouse.y)
    guard let pid = appUnderPointer(point) else { return }
    let application = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(application, 0.1)
    var hit: AXUIElement?
    guard AXUIElementCopyElementAtPosition(application, Float(point.x), Float(point.y), &hit) == .success,
          let element = hit, !protectedField(element),
          let pointValue = AXValueCreate(.cgPoint, &point),
          let rangeRef = parameterized(element, "AXRangeForPosition", pointValue), CFGetTypeID(rangeRef) == AXValueGetTypeID() else { return }
    var hitRange = CFRange()
    guard AXValueGetValue(rangeRef as! AXValue, .cfRange, &hitRange) else { return }
    let total = (attribute(element, kAXNumberOfCharactersAttribute) as? NSNumber)?.intValue ?? 0
    let index = hitRange.location
    guard total > 0, index >= 0, index < total else { return }
    let start = max(0, index - 2000), end = min(total, index + 2000)
    var around = CFRange(location: start, length: end - start)
    guard let aroundValue = AXValueCreate(.cfRange, &around),
          let text = parameterized(element, "AXStringForRange", aroundValue) as? String else { return }
    let units = Array(text.utf16), local = index - start
    guard local >= 0, local < units.count else { return }
    let inside = { (r: CGRect) in r.insetBy(dx: -3, dy: -3).contains(point) }
    if readingWord {
        let isWordUnit = { (u: UInt16) -> Bool in
            if u == 39 || u == 0x2019 || u == 45 { return true } // ' ’ -
            guard let scalar = UnicodeScalar(u) else { return true } // keep surrogate pairs (emoji/CJK) together
            return CharacterSet.alphanumerics.contains(scalar)
        }
        if isWordUnit(units[local]) {
            var a = local, b = local
            while a > 0 && isWordUnit(units[a - 1]) { a -= 1 }
            while b + 1 < units.count && isWordUnit(units[b + 1]) { b += 1 }
            if let box = textBounds(element, CFRange(location: start + a, length: b - a + 1)), inside(box) { word = box }
        }
    }
    if readingPassage {
        let isBreak = { (u: UInt16) in u == 10 || u == 13 || u == 0x2029 || u == 0x2028 }
        var a = local, b = local
        while a > 0 && !isBreak(units[a - 1]) { a -= 1 }
        while b + 1 < units.count && !isBreak(units[b + 1]) { b += 1 }
        if b >= a, !isBreak(units[local]), let box = textBounds(element, CFRange(location: start + a, length: b - a + 1)), inside(box) { passage = box }
    }
}
func command(_ request: [String: Any]) {
    let id = request["requestId"] ?? 0
    switch request["command"] as? String {
    case "appearance": appearance.set(request["enabled"] as? Bool ?? false, id: id)
    case "capture-permission":
        emit(["requestId": id, "allowed": CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess()])
    case "colour":
        if #available(macOS 12.3, *), let colour = colour as? DesktopColour { colour.set(request["matrix"], id: id) }
        else if request["matrix"] == nil || request["matrix"] is NSNull { emit(["requestId": id, "applied": false]) }
        else { emit(["requestId": id, "error": "Desktop colour assistance requires macOS 12.3 or newer."]) }
    case "scale": scale.set((request["factor"] as? NSNumber)?.doubleValue, id: id)
    case "reading": readingWord = request["word"] as? Bool ?? false; readingPassage = request["passage"] as? Bool ?? false
    case "watch": watching = request["enabled"] as? Bool ?? false
    case "permission":
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        emit(["requestId": id, "accessibility": AXIsProcessTrustedWithOptions(options)])
    case "selection":
        guard watching else { emit(["requestId": id, "error": "Enable desktop detection to read selected text, or paste into the reading view."]); return }
        guard AXIsProcessTrusted() else { emit(["requestId": id, "error": "Allow Clearspace in System Settings → Privacy & Security → Accessibility, then try again."]); return }
        guard let app = NSWorkspace.shared.frontmostApplication else { emit(["requestId": id, "error": "No active application."]); return }
        let application = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(application, 0.5)
        var element = elementAttribute(application, kAXFocusedUIElementAttribute)
        for _ in 0..<5 {
            guard let current = element else { break }
            if protectedField(current) { break }
            if let text = attribute(current, kAXSelectedTextAttribute) as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                emit(["requestId": id, "text": String(text.prefix(32768)), "source": app.localizedName ?? "Application"]); return
            }
            element = elementAttribute(current, kAXParentAttribute)
        }
        emit(["requestId": id, "error": "This app did not expose selected text. Copy the passage and use Paste clipboard in the reading view."])
    default: emit(["requestId": id, "error": "Unknown desktop command."])
    }
}
DispatchQueue.global().async {
    while let line = readLine() {
        if line.utf8.count > 10000 { continue }
        if let data = line.data(using: .utf8), let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            DispatchQueue.main.async { command(request) }
        }
    }
    // The parent closes stdin on exit, including when its pipe dies after a crash.
    DispatchQueue.main.async {
        if #available(macOS 12.3, *), let colour = colour as? DesktopColour { colour.stop() }
        scale.restore()
        appearance.shutdown { exit(0) }
    }
}
let timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in context() }
let textTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { _ in pointerText() }
NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
