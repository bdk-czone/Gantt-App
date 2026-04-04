import AppKit
import Foundation
import Vision

struct OcrLine {
    let text: String
    let x: CGFloat
    let y: CGFloat
}

let imageData = FileHandle.standardInput.readDataToEndOfFile()

guard !imageData.isEmpty else {
    fputs("No image data received.\n", stderr)
    exit(1)
}

guard let image = NSImage(data: imageData) else {
    fputs("Could not decode image data.\n", stderr)
    exit(1)
}

var proposedRect = CGRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
    fputs("Could not create an OCR image.\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US", "he-IL"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
    try handler.perform([request])
} catch {
    fputs("OCR request failed: \(error.localizedDescription)\n", stderr)
    exit(1)
}

let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
if observations.isEmpty {
    print("")
    exit(0)
}

let candidates: [OcrLine] = observations.compactMap { observation in
    guard let candidate = observation.topCandidates(1).first else {
        return nil
    }
    return OcrLine(
        text: candidate.string.trimmingCharacters(in: .whitespacesAndNewlines),
        x: observation.boundingBox.minX,
        y: observation.boundingBox.midY
    )
}
    .filter { !$0.text.isEmpty }

let sorted = candidates.sorted { left, right in
    if abs(left.y - right.y) > 0.025 {
        return left.y > right.y
    }
    return left.x < right.x
}

var groupedLines: [[OcrLine]] = []
for item in sorted {
    if let lastIndex = groupedLines.indices.last {
        let averageY = groupedLines[lastIndex].map(\.y).reduce(0, +) / CGFloat(groupedLines[lastIndex].count)
        if abs(averageY - item.y) <= 0.022 {
            groupedLines[lastIndex].append(item)
            continue
        }
    }
    groupedLines.append([item])
}

let text = groupedLines
    .map { row in
        row.sorted(by: { $0.x < $1.x })
            .map(\.text)
            .joined(separator: " ")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    .filter { !$0.isEmpty }
    .joined(separator: "\n")

print(text)
