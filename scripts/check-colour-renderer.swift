import Foundation
import CoreImage
import Metal
import CoreVideo

func emit(_ value: [String: Any]) {} // The capture controller is linked, but never started.
@main struct ColourRenderCheck {
    static func main() throws {
        let input = FileHandle.standardInput.readDataToEndOfFile()
        let cases = try JSONSerialization.jsonObject(with: input) as! [[String: Any]]
        guard let device = MTLCreateSystemDefaultDevice() else { fatalError("Metal GPU unavailable") }
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        let context = CIContext(mtlDevice: device, options: [.workingColorSpace: space, .outputColorSpace: space])
        // Match capture's top-to-bottom BGRA pixel buffer and the live renderer's
        // Metal texture path. Four different corners detect an upside-down image.
        var buffer: CVPixelBuffer?
        guard CVPixelBufferCreate(nil, 2, 2, kCVPixelFormatType_32BGRA, [kCVPixelBufferMetalCompatibilityKey: true] as CFDictionary, &buffer) == kCVReturnSuccess, let buffer = buffer else { fatalError("Pixel buffer unavailable") }
        let corners: [[UInt8]] = [[0, 0, 255, 255, 0, 255, 0, 255], [255, 0, 0, 255, 0, 255, 255, 255]]
        CVPixelBufferLockBaseAddress(buffer, [])
        for row in 0..<2 { _ = corners[row].withUnsafeBytes { bytes in memcpy(CVPixelBufferGetBaseAddress(buffer)! + row * CVPixelBufferGetBytesPerRow(buffer), bytes.baseAddress!, 8) } }
        CVPixelBufferUnlockBaseAddress(buffer, [])
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: 2, height: 2, mipmapped: false)
        descriptor.usage = [.shaderRead, .shaderWrite, .renderTarget]; descriptor.storageMode = .shared
        let texture = device.makeTexture(descriptor: descriptor)!, command = device.makeCommandQueue()!.makeCommandBuffer()!
        let identity: [Double] = [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0]
        let oriented = desktopColourImage(CIImage(cvPixelBuffer: buffer), matrix: identity, size: CGSize(width: 2, height: 2))!
        context.render(oriented, to: texture, commandBuffer: command, bounds: CGRect(x: 0, y: 0, width: 2, height: 2), colorSpace: space)
        command.commit(); command.waitUntilCompleted()
        var rendered = [UInt8](repeating: 0, count: 16)
        texture.getBytes(&rendered, bytesPerRow: 8, from: MTLRegionMake2D(0, 0, 2, 2), mipmapLevel: 0)
        guard rendered == corners.flatMap({ $0 }) else { fatalError("Capture-to-texture orientation or colours differ: \(rendered)") }
        var results: [[UInt8]] = []
        for item in cases {
            let pixels = (item["pixels"] as! [Int]).map { UInt8($0) }
            let width = pixels.count / 4
            let image = CIImage(bitmapData: Data(pixels), bytesPerRow: width * 4, size: CGSize(width: width, height: 1), format: .RGBA8, colorSpace: space)
            let output = remapColourImage(image, matrix: item["matrix"] as! [Double])!
            var bitmap = [UInt8](repeating: 0, count: pixels.count)
            context.render(output, toBitmap: &bitmap, rowBytes: width * 4, bounds: CGRect(x: 0, y: 0, width: width, height: 1), format: .RGBA8, colorSpace: space)
            results.append(bitmap)
        }
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: results))
    }
}
