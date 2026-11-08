import AppKit
import ScreenCaptureKit
import MetalKit
import CoreImage
import CoreMedia

// Shared by the live Metal renderer and the off-screen pixel verification tool.
func remapColourImage(_ input: CIImage, matrix m: [Double]) -> CIImage? {
    guard m.count == 20 else { return nil }
    return CIFilter(name: "CIColorMatrix", parameters: [
        kCIInputImageKey: input,
        "inputRVector": CIVector(x: m[0], y: m[1], z: m[2], w: m[3]),
        "inputGVector": CIVector(x: m[5], y: m[6], z: m[7], w: m[8]),
        "inputBVector": CIVector(x: m[10], y: m[11], z: m[12], w: m[13]),
        "inputAVector": CIVector(x: m[15], y: m[16], z: m[17], w: m[18]),
        "inputBiasVector": CIVector(x: m[4], y: m[9], z: m[14], w: m[19]),
    ])?.outputImage
}

func desktopColourImage(_ input: CIImage, matrix: [Double], size: CGSize) -> CIImage? {
    guard let output = remapColourImage(input, matrix: matrix) else { return nil }
    // Core Image already renders the captured frame the right way up into the
    // Metal drawable, so only scale it. (An extra flip showed the desktop upside down.)
    return output.transformed(by: CGAffineTransform(scaleX: size.width / input.extent.width, y: size.height / input.extent.height))
}

@available(macOS 12.3, *)
final class ColourSurface: NSObject, SCStreamOutput, SCStreamDelegate, MTKViewDelegate {
    let screen: NSScreen
    let panel: NSPanel
    let view: MTKView
    let queue = DispatchQueue(label: "org.clearspace.colour-frames", qos: .userInteractive)
    let context: CIContext
    let commands: MTLCommandQueue
    let colourSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    var stream: SCStream?
    var matrix: [Double]
    var buffer: CVPixelBuffer?
    var ready = false, stopped = false
    var firstFrame: (() -> Void)?
    var failure: ((String) -> Void)?
    private let lock = NSLock()
    private var framePending = false

    init(screen: NSScreen, device: MTLDevice, matrix: [Double]) throws {
        self.screen = screen; self.matrix = matrix
        guard let commands = device.makeCommandQueue() else { throw NSError(domain: "Clearspace", code: 1) }
        self.commands = commands
        context = CIContext(mtlDevice: device, options: [.workingColorSpace: colourSpace, .outputColorSpace: colourSpace])
        panel = NSPanel(contentRect: screen.frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        view = MTKView(frame: NSRect(origin: .zero, size: screen.frame.size), device: device)
        super.init()
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = false
        panel.isReleasedWhenClosed = false; panel.alphaValue = 0.01
        panel.ignoresMouseEvents = true; panel.hidesOnDeactivate = false
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.screenSaver.rawValue + 1)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        view.framebufferOnly = false; view.colorPixelFormat = .bgra8Unorm
        view.isPaused = true; view.enableSetNeedsDisplay = false
        view.delegate = self
        view.autoresizingMask = [.width, .height]
        view.clearColor = MTLClearColorMake(0, 0, 0, 0)
        view.layer?.isOpaque = false
        panel.contentView = view
        // A transparent, visible window lets ScreenCaptureKit discover this helper
        // before we exclude its entire application from every capture stream.
        panel.orderFrontRegardless()
    }
    var displayID: CGDirectDisplayID { (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0 }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        DispatchQueue.main.async { if !self.stopped { self.failure?("Desktop colour processing stopped. Retry the palette or check Screen Recording permission.") } }
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let status = attachments.first?[.status] as? Int, status == SCFrameStatus.complete.rawValue,
              let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lock.lock()
        if framePending { lock.unlock(); return }
        framePending = true; lock.unlock()
        DispatchQueue.main.async {
            defer { self.lock.lock(); self.framePending = false; self.lock.unlock() }
            if self.stopped { return }
            self.buffer = buffer; self.paint()
        }
    }
    func paint() {
        if !stopped { view.draw() }
    }
    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}
    func draw(in view: MTKView) {
        guard !stopped, let buffer = buffer, let drawable = view.currentDrawable, let command = commands.makeCommandBuffer() else { return }
        let input = CIImage(cvPixelBuffer: buffer)
        let width = CGFloat(drawable.texture.width), height = CGFloat(drawable.texture.height)
        guard let output = desktopColourImage(input, matrix: matrix, size: CGSize(width: width, height: height)) else { failure?("The colour matrix could not be rendered."); return }
        context.render(output, to: drawable.texture, commandBuffer: command, bounds: CGRect(x: 0, y: 0, width: width, height: height), colorSpace: colourSpace)
        command.present(drawable)
        command.addCompletedHandler { command in
            DispatchQueue.main.async {
                guard !self.stopped else { return }
                if command.status == .error { self.failure?("The GPU could not render desktop colours."); return }
                if !self.ready { self.ready = true; self.panel.alphaValue = 1; self.firstFrame?() }
            }
        }
        command.commit()
    }
    func stop() {
        stopped = true; firstFrame = nil; failure = nil; buffer = nil
        panel.orderOut(nil); panel.close()
        stream?.stopCapture { _ in }; stream = nil
    }
}

@available(macOS 12.3, *)
final class DesktopColour {
    private var surfaces: [ColourSurface] = []
    private var generation = 0
    private var pending: Any?
    private var current: [Double]?
    private var observer: NSObjectProtocol?
    init() {
        observer = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self, let matrix = self.current else { return }
            self.stop(); self.start(matrix, id: nil)
        }
    }
    func stop() {
        generation += 1; current = nil
        for surface in surfaces { surface.stop() }; surfaces = []
        if let id = pending { emit(["requestId": id, "error": "Colour processing was interrupted. Retry the palette."]) }
        pending = nil
    }
    private func fail(_ message: String) {
        let id = pending; pending = nil; stop()
        if let id = id { emit(["requestId": id, "error": message]) }
        else { emit(["type": "effect-error", "effect": "colour", "error": message]) }
    }
    func set(_ value: Any?, id: Any) {
        guard let matrix = value as? [Double] else {
            if value == nil || value is NSNull { stop(); emit(["requestId": id, "applied": false]) }
            else { emit(["requestId": id, "error": "Invalid colour matrix."]) }
            return
        }
        guard matrix.count == 20, matrix.allSatisfy({ $0.isFinite && abs($0) <= 4 }) else { emit(["requestId": id, "error": "Invalid colour matrix."]); return }
        if !surfaces.isEmpty && surfaces.allSatisfy({ $0.ready }) {
            current = matrix
            for surface in surfaces { surface.matrix = matrix; surface.paint() }
            emit(["requestId": id, "applied": true]); return
        }
        stop(); start(matrix, id: id)
    }
    private func start(_ matrix: [Double], id: Any?) {
        pending = id
        guard CGPreflightScreenCaptureAccess() else { fail("Allow Screen Recording for Clearspace in Privacy & Security, then quit and reopen Clearspace. Frames are processed locally and are never saved or uploaded."); return }
        guard let device = MTLCreateSystemDefaultDevice() else { fail("Desktop colour processing requires a Metal-compatible GPU."); return }
        current = matrix; let revision = generation
        do { surfaces = try NSScreen.screens.map { try ColourSurface(screen: $0, device: device, matrix: matrix) } }
        catch { fail("Could not create desktop colour surfaces."); return }
        guard !surfaces.isEmpty else { fail("No display is available for colour processing."); return }
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { content, error in
            DispatchQueue.main.async {
                guard revision == self.generation else { return }
                guard let content = content, error == nil else { self.fail("macOS could not capture the desktop. Check Screen Recording permission, then retry."); return }
                guard let ownApp = content.applications.first(where: { $0.processID == ProcessInfo.processInfo.processIdentifier }) else {
                    self.fail("Could not exclude the colour overlay from capture. Retry the palette."); return
                }
                for surface in self.surfaces {
                    guard let display = content.displays.first(where: { $0.displayID == surface.displayID }) else { self.fail("Display layout changed. Retry the palette."); return }
                    let config = SCStreamConfiguration()
                    config.width = Int(surface.screen.frame.width * surface.screen.backingScaleFactor)
                    config.height = Int(surface.screen.frame.height * surface.screen.backingScaleFactor)
                    config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
                    config.queueDepth = 3; config.showsCursor = false
                    config.pixelFormat = kCVPixelFormatType_32BGRA
                    config.colorSpaceName = CGColorSpace.sRGB
                    let filter = SCContentFilter(display: display, excludingApplications: [ownApp], exceptingWindows: [])
                    let stream = SCStream(filter: filter, configuration: config, delegate: surface)
                    surface.stream = stream
                    surface.failure = { [weak self] message in if self?.generation == revision { self?.fail(message) } }
                    surface.firstFrame = { [weak self] in
                        guard let self = self, self.generation == revision, self.surfaces.allSatisfy({ $0.ready }) else { return }
                        if let id = self.pending { self.pending = nil; emit(["requestId": id, "applied": true]) }
                    }
                    do { try stream.addStreamOutput(surface, type: .screen, sampleHandlerQueue: surface.queue) }
                    catch { self.fail("Could not connect the desktop colour renderer."); return }
                    stream.startCapture { error in
                        DispatchQueue.main.async { if revision == self.generation && error != nil { self.fail("Could not start desktop colour processing. Check Screen Recording permission, then retry.") } }
                    }
                }
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
            if self.generation == revision && !self.surfaces.allSatisfy({ $0.ready }) { self.fail("No desktop frames arrived. Check Screen Recording permission, then retry.") }
        }
    }
}
