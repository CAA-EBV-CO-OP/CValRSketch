import Foundation

// Teaching the app a laser it doesn't know. While the user takes readings and
// types what the laser's screen shows, every message the laser sends is kept;
// LaserSolver then tries the usual ways a distance is packed into a message
// (a float in metres, a whole number of millimetres or finer, digits as text)
// at every place in it, and keeps the ways that give every typed reading. The
// result, a LaserProfile, is saved and used like the built-in Huepar and Bosch
// decoders. Plain values only, so this file builds on a Mac too, for testing.

// How one laser packs a distance into a message.
struct LaserFormat: Codable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable { case float32LE, float32BE, uintLE, uintBE, text }
    var kind: Kind
    var offset: Int = 0          // first byte of the number (not used for text)
    var size: Int = 4            // bytes in the number
    var mmPerUnit: Double        // millimetres per unit of the number
    var length: Int? = nil       // a reading message is this long
    var prefix: [UInt8] = []     // and starts with these bytes

    func millimeters(_ b: [UInt8]) -> Double? {
        if let length, b.count != length { return nil }
        guard b.count >= prefix.count, Array(b[0..<prefix.count]) == prefix else { return nil }
        let v: Double
        switch kind {
        case .text:
            guard let n = Self.firstNumber(in: b) else { return nil }
            v = n
        case .float32LE, .float32BE:
            guard offset + 4 <= b.count else { return nil }
            var bits: UInt32 = 0
            for i in 0..<4 {
                let byte = UInt32(b[offset + (kind == .float32LE ? i : 3 - i)])
                bits |= byte << (8 * UInt32(i))
            }
            let f = Float(bitPattern: bits)
            guard f.isFinite else { return nil }
            v = Double(f)
        case .uintLE, .uintBE:
            guard offset + size <= b.count else { return nil }
            var n: UInt64 = 0
            for i in 0..<size {
                let byte = UInt64(b[offset + (kind == .uintLE ? i : size - 1 - i)])
                n |= byte << (8 * UInt64(i))
            }
            v = Double(n)
        }
        let mm = v * mmPerUnit
        return mm > 20 && mm < 400_000 ? mm : nil     // 2 cm to 400 m
    }

    // "12.345", "3456" in a message of text, as a number.
    static func firstNumber(in b: [UInt8]) -> Double? {
        guard b.allSatisfy({ $0 == 0 || ($0 >= 0x20 && $0 < 0x7F) || $0 == 0x0A || $0 == 0x0D }) else { return nil }
        let s = String(decoding: b.filter { $0 != 0 }, as: UTF8.self)
        guard let r = s.range(of: #"\d+(\.\d+)?"#, options: .regularExpression) else { return nil }
        return Double(s[r])
    }

    // "a float in metres at byte 7", for the screen and the support file.
    var summary: String {
        let unit: String
        switch mmPerUnit {
        case 1000: unit = "metres"
        case 304.8: unit = "feet"
        case 25.4: unit = "inches"
        case 10: unit = "centimetres"
        case 1: unit = "millimetres"
        case 0.1: unit = "tenths of a millimetre"
        case 0.01: unit = "hundredths of a millimetre"
        default: unit = "units of \(mmPerUnit) mm"
        }
        switch kind {
        case .text: return "the distance as text, in \(unit)"
        case .float32LE: return "a decimal number in \(unit) at byte \(offset) (little-endian)"
        case .float32BE: return "a decimal number in \(unit) at byte \(offset) (big-endian)"
        case .uintLE: return "a \(size)-byte whole number of \(unit) at byte \(offset) (little-endian)"
        case .uintBE: return "a \(size)-byte whole number of \(unit) at byte \(offset) (big-endian)"
        }
    }
}

// A laser taught on this phone: which device, which of its characteristics
// carries readings, and how to read them.
struct LaserProfile: Codable, Equatable, Sendable, Identifiable {
    var id: String               // the phone's identifier for the device
    var name: String             // as it advertised, or what the user called it
    var service: String
    var characteristic: String
    var format: LaserFormat
    var taught: Date = Date()
}

// One reading while teaching: what the user typed and every message that
// arrived on each characteristic since the reading before.
struct LaserSample: Codable, Equatable, Sendable {
    var millimeters: Double
    var tolerance: Double        // how close a decoded value must be
    var typed: String
    var packets: [String: [[UInt8]]]   // characteristic UUID → messages
}

enum LaserSolver {
    // Every way tried, simplest first: a match early in the list wins a tie.
    static let candidates: [LaserFormat] = {
        var out: [LaserFormat] = []
        let floats = [1000.0, 1, 304.8, 25.4, 10]            // metres first
        let ints = [1.0, 0.1, 0.01, 10, 0.001]               // millimetres first
        for off in 0..<20 {
            for s in floats {
                out.append(LaserFormat(kind: .float32LE, offset: off, size: 4, mmPerUnit: s))
                out.append(LaserFormat(kind: .float32BE, offset: off, size: 4, mmPerUnit: s))
            }
        }
        for size in [4, 3, 2] {
            for off in 0..<20 {
                for s in ints {
                    out.append(LaserFormat(kind: .uintLE, offset: off, size: size, mmPerUnit: s))
                    out.append(LaserFormat(kind: .uintBE, offset: off, size: size, mmPerUnit: s))
                }
            }
        }
        for s in [1000.0, 1, 304.8, 25.4, 10] { out.append(LaserFormat(kind: .text, mmPerUnit: s)) }
        return out
    }()

    struct Match: Equatable, Sendable {
        var characteristic: String
        var format: LaserFormat
    }

    // The ways that give every sample's reading from one of its messages on the
    // same characteristic, each tightened to the length and leading bytes those
    // messages share (so status messages on that characteristic are skipped).
    // Readings must differ, or a byte that never changes could pass.
    static func solve(_ samples: [LaserSample]) -> [Match] {
        guard samples.count >= 2 else { return [] }
        let mms = samples.map(\.millimeters)
        guard (mms.max() ?? 0) - (mms.min() ?? 0) > 30 else { return [] }
        let chars = Set(samples.flatMap { $0.packets.keys }).sorted()
        var out: [Match] = []
        for ch in chars {
            for f in candidates {
                var hits: [[UInt8]] = []
                var ok = true
                for s in samples {
                    let msgs = s.packets[ch] ?? []
                    guard let hit = msgs.last(where: { m in f.millimeters(m).map { abs($0 - s.millimeters) <= s.tolerance } ?? false })
                    else { ok = false; break }
                    hits.append(hit)
                }
                guard ok else { continue }
                var g = f
                let lengths = Set(hits.map(\.count))
                if lengths.count == 1 { g.length = lengths.first }
                g.prefix = commonPrefix(hits, max: f.kind == .text ? 0 : min(f.offset, 4))
                out.append(Match(characteristic: ch, format: g))
            }
        }
        return out
    }

    // The leading bytes every message shares, up to `max`.
    static func commonPrefix(_ msgs: [[UInt8]], max: Int) -> [UInt8] {
        guard let first = msgs.first else { return [] }
        var n = 0
        while n < max, n < first.count, msgs.allSatisfy({ $0.count > n && $0[n] == first[n] }) { n += 1 }
        return Array(first[0..<n])
    }

    // What the user typed, in millimetres, and how close a decoded value must
    // be: "3.456 m", "3456 mm", "345.6 cm", or feet and inches as the reading
    // fields take them ("11 4 7/16"). A whole-inch reading allows half an inch.
    static func typed(_ raw: String) -> (millimeters: Double, tolerance: Double)? {
        let s = raw.lowercased().replacingOccurrences(of: ",", with: ".")
        if let r = s.range(of: #"\d+(\.\d+)?"#, options: .regularExpression), let n = Double(s[r]) {
            let rest = s[r.upperBound...].trimmingCharacters(in: .whitespaces)
            let decimals = s[r].split(separator: ".").dropFirst().first?.count ?? 0
            func metric(_ mmPer: Double) -> (Double, Double) {
                let step = mmPer / pow(10, Double(decimals))      // the last digit shown
                let mm = n * mmPer
                return (mm, max(step, 1.5, mm * 0.002))
            }
            if rest.hasPrefix("mm") { return metric(1) }
            if rest.hasPrefix("cm") { return metric(10) }
            if rest.hasPrefix("m") { return metric(1000) }
        }
        guard let inches = LengthParser.exactInches(of: raw) else { return nil }
        let mm = inches * 25.4
        let whole = inches == inches.rounded()
        return (mm, whole ? 13 : max(2, mm * 0.002))
    }
}

// What a support file holds: enough to add the laser to the app by hand.
struct LaserCapture: Codable, Sendable {
    struct Characteristic: Codable, Sendable {
        var service: String
        var uuid: String
        var properties: [String]
    }
    struct Message: Codable, Sendable {
        var at: Double            // seconds since teaching started
        var characteristic: String
        var hex: String
    }
    struct Reading: Codable, Sendable {
        var at: Double
        var typed: String
        var millimeters: Double
    }
    var app: String
    var device: String
    var advertisedServices: [String]
    var characteristics: [Characteristic]
    var messages: [Message]
    var readings: [Reading]
    var found: String?
}

extension Array where Element == UInt8 {
    var hex: String { map { String(format: "%02X", $0) }.joined(separator: " ") }
}
