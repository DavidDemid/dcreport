import Foundation
import PDFKit
import AppKit

let paths = Array(CommandLine.arguments.dropFirst())
if paths.isEmpty { fatalError("Usage: swift tests/check-pdf.swift report.pdf") }
for path in paths {
  guard let document = PDFDocument(url: URL(fileURLWithPath: path)) else { fatalError("Cannot open PDF") }
  let firstBounds = document.page(at: 0)?.bounds(for: .mediaBox) ?? NSRect(x: 0, y: 0, width: 595, height: 842)
  let columns = 3, width = 320
  let height = Int(Double(width) * firstBounds.height / firstBounds.width) + 30
  let sheet = NSImage(size: NSSize(width: columns * width, height: Int(ceil(Double(document.pageCount) / Double(columns))) * height))
  sheet.lockFocus()
  NSColor.white.setFill()
  NSRect(origin: .zero, size: sheet.size).fill()
  var blankPages: [Int] = []
  for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else { fatalError("Missing page") }
    let image = page.thumbnail(of: NSSize(width: width - 12, height: height - 25), for: .mediaBox)
    let row = index / columns, column = index % columns
    let y = Int(sheet.size.height) - (row + 1) * height
    let fittedHeight = image.size.height * Double(width - 12) / image.size.width
    image.draw(in: NSRect(x: Double(column * width + 6), y: Double(y + 22), width: Double(width - 12), height: fittedHeight))
    let text = "Page \(index + 1)" as NSString
    text.draw(at: NSPoint(x: column * width + 12, y: y + 4), withAttributes: [.font: NSFont.systemFont(ofSize: 12), .foregroundColor: NSColor.black])
    if let bitmap = image.tiffRepresentation.flatMap(NSBitmapImageRep.init(data:)) {
      var dark = 0, samples = 0
      for x in stride(from: 0, to: bitmap.pixelsWide, by: 3) {
        for py in stride(from: 0, to: bitmap.pixelsHigh, by: 3) {
          guard let color = bitmap.colorAt(x: x, y: py)?.usingColorSpace(.deviceRGB) else { continue }
          samples += 1
          if min(color.redComponent, color.greenComponent, color.blueComponent) < 0.85 { dark += 1 }
        }
      }
      if samples > 0 && Double(dark) / Double(samples) < 0.004 { blankPages.append(index + 1) }
    }
  }
  sheet.unlockFocus()
  let output = path.replacingOccurrences(of: ".pdf", with: "-contact-sheet.png")
  guard let tiff = sheet.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { fatalError("Cannot render contact sheet") }
  try png.write(to: URL(fileURLWithPath: output))
  print("\(URL(fileURLWithPath: path).lastPathComponent): \(document.pageCount) pages, potentially blank: \(blankPages)")
}
