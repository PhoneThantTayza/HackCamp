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
        appearance.shutdown { exit(0) }
    }
}
let timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in context() }
NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
