import Foundation

final class DesktopAppearance {
    private let queue = DispatchQueue(label: "org.clearspace.appearance")
    private var previous: Bool?

    // Fixed scripts only. The Automation consent dialog belongs to macOS.
    private func script(_ body: String) throws -> String {
        let process = Process(), output = Pipe(), error = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", "tell application \"System Events\" to tell appearance preferences to " + body]
        process.standardOutput = output; process.standardError = error
        let done = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in done.signal() }
        try process.run()
        if done.wait(timeout: .now() + 30) == .timedOut {
            process.terminate()
            throw NSError(domain: "Clearspace", code: 1, userInfo: [NSLocalizedDescriptionKey: "Dark mode needs permission to control System Events. Check the macOS permission dialog, then retry."])
        }
        guard process.terminationStatus == 0 else {
            throw NSError(domain: "Clearspace", code: 2, userInfo: [NSLocalizedDescriptionKey: "macOS blocked Dark mode. Allow Clearspace → System Events in Privacy & Security → Automation, then retry."])
        }
        return String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
    private func apply(_ enabled: Bool) throws -> Bool {
        if !enabled && previous == nil { return false }
        let current = try script("get dark mode") == "true"
        if enabled {
            if previous == nil { previous = current }
            if !current { _ = try script("set dark mode to true") }
            guard try script("get dark mode") == "true" else {
                throw NSError(domain: "Clearspace", code: 3, userInfo: [NSLocalizedDescriptionKey: "macOS did not enable Dark mode. Retry or open system appearance settings."])
            }
        } else {
            // Do not overwrite a user's independent change back to Light.
            if current, let saved = previous, !saved { _ = try script("set dark mode to false") }
            previous = nil
        }
        return enabled
    }
    func set(_ enabled: Bool, id: Any) {
        queue.async {
            do { emit(["requestId": id, "applied": try self.apply(enabled)]) }
            catch { emit(["requestId": id, "error": error.localizedDescription]) }
        }
    }
    func shutdown(_ completion: @escaping () -> Void) {
        queue.async { _ = try? self.apply(false); completion() }
    }
}
