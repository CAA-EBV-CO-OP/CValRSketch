import CoreBluetooth
import SwiftUI

// A Bluetooth laser measure. Both kinds send every reading in metric, whatever
// unit the screen shows, and other messages (unit changes, keep-alives) are
// ignored.
//
// Huepar S-series (advertises as "LDM-…"): readings are notifications on AE02.
//   F1 04 01 00 07 | 03 01 31 50 | D2 D1 D0 | 01 | CK
// Byte 4 is the payload length; the last three payload bytes are the distance,
// big-endian, in hundredths of a millimetre; CK is the sum of bytes 1 through
// the end of the payload, mod 256. Decoded from an S60-G-BT; the published
// notes for the S120R-BT give the same service but a different reading prefix.
//
// Bosch GLM-C (advertises service 02A6C0D0…, usually with no name): readings
// are indications on 02A6C0D1, sent only after writing C0 55 02 01 00 1A there.
//   C0 55 10 06 00 <n> 00 | float32 metres, little-endian | 8 × 00 | CRC
// The CRC is CRC-8, polynomial 0xA6, initial 0xAA, over every byte before it.
// Checked on a GLM165-27C.
//
// Leica DISTO (D-, X- and S-series with Bluetooth Smart; advertises "DISTO…"):
// Leica's published service 3AB10100…, the distance an indication on 3AB10101,
// a little-endian float32 in metres. Not yet checked on a DISTO.
//
// Any other laser can be taught (LaserProfiles.swift, LaserTeach.swift): the
// profile saved names the device, the characteristic and how to read it.
@MainActor
final class Laser: NSObject, ObservableObject, @preconcurrency CBCentralManagerDelegate, @preconcurrency CBPeripheralDelegate {
    static let shared = Laser()

    enum Status: Equatable { case off, unauthorized, bluetoothOff, searching, connected(String) }
    struct Reading: Equatable {
        let id = UUID()
        let millimeters: Double
        var inches: Int { Int((millimeters / 25.4).rounded()) }
    }

    @Published private(set) var status = Status.off
    @Published private(set) var reading: Reading?

    private static let service = CBUUID(string: "AE30")
    private static let data = CBUUID(string: "AE02")
    private static let boschService = CBUUID(string: "02A6C0D0-0451-4000-B000-FB3210111989")
    private static let boschData = CBUUID(string: "02A6C0D1-0451-4000-B000-FB3210111989")
    private static let boschSendReadings = Data([0xC0, 0x55, 0x02, 0x01, 0x00, 0x1A])
    private static let leicaService = CBUUID(string: "3AB10100-F831-4395-B29D-570977D5BF94")
    private static let leicaData = CBUUID(string: "3AB10101-F831-4395-B29D-570977D5BF94")
    private static let rememberKey = "laserConnect"
    private static let profilesKey = "laserProfiles"

    // Lasers taught on this phone.
    @Published private(set) var profiles: [LaserProfile] = Laser.loadProfiles()
    private var profile: LaserProfile?          // the taught laser connected now

    private static func loadProfiles() -> [LaserProfile] {
        guard let d = UserDefaults.standard.data(forKey: profilesKey) else { return [] }
        return (try? JSONDecoder().decode([LaserProfile].self, from: d)) ?? []
    }

    // Keeps a taught laser (replacing one taught before on the same device) and
    // connects to it.
    func save(_ p: LaserProfile) {
        profiles.removeAll { $0.id == p.id }
        profiles.append(p)
        storeProfiles()
        disconnect()
        connect()
    }

    func forget(_ p: LaserProfile) {
        profiles.removeAll { $0.id == p.id }
        storeProfiles()
        if profile?.id == p.id { disconnect() }
    }

    private func storeProfiles() {
        UserDefaults.standard.set(try? JSONEncoder().encode(profiles), forKey: Self.profilesKey)
    }

    // Back from the teach screen: look for the laser again if it was wanted.
    func resumeAfterTeaching() { if wanted, laser == nil { connect() } }

    // The teach screen runs its own Bluetooth session; this one lets go first.
    func pauseForTeaching() {
        central?.stopScan()
        if let laser { central?.cancelPeripheralConnection(laser) }
        laser = nil
        profile = nil
        status = .off
    }

    private var central: CBCentralManager?
    private var laser: CBPeripheral?

    // Reconnects at launch once the laser has been connected before, so the
    // Bluetooth permission is asked only when someone taps Connect.
    override init() {
        super.init()
        if UserDefaults.standard.bool(forKey: Self.rememberKey) { connect() }
    }

    func connect() {
        UserDefaults.standard.set(true, forKey: Self.rememberKey)
        if let laser, laser.state != .connected { central?.cancelPeripheralConnection(laser); self.laser = nil }
        if let central { centralManagerDidUpdateState(central) } else { central = CBCentralManager(delegate: self, queue: nil) }
    }

    func disconnect() {
        UserDefaults.standard.set(false, forKey: Self.rememberKey)
        central?.stopScan()
        if let laser { central?.cancelPeripheralConnection(laser) }
        laser = nil
        status = .off
    }

    static func millimeters(from d: Data) -> Double? {
        let b = [UInt8](d)
        if b.count == 20, b[0] == 0xC0, b[1] == 0x55, b[2] == 0x10, b[3] == 0x06 {
            guard crc8(b[0..<19]) == b[19] else { return nil }
            let bits = UInt32(b[7]) | UInt32(b[8]) << 8 | UInt32(b[9]) << 16 | UInt32(b[10]) << 24
            let meters = Double(Float(bitPattern: bits))
            return meters > 0 ? meters * 1000 : nil
        }
        guard b.count >= 9, b[0] == 0xF1, b[1] == 0x04 else { return nil }
        let len = Int(b[4])
        guard len >= 3, b.count == 7 + len else { return nil }
        let end = 5 + len
        guard b[1..<end].reduce(0, { ($0 + Int($1)) & 0xFF }) == Int(b[end + 1]) else { return nil }
        let raw = Int(b[end - 3]) << 16 | Int(b[end - 2]) << 8 | Int(b[end - 1])
        return Double(raw) / 100
    }

    private static let leica = LaserFormat(kind: .float32LE, offset: 0, size: 4, mmPerUnit: 1000)

    private static func crc8(_ bytes: ArraySlice<UInt8>) -> UInt8 {
        var c: UInt8 = 0xAA
        for byte in bytes {
            c ^= byte
            for _ in 0..<8 { c = c & 0x80 != 0 ? (c << 1) ^ 0xA6 : c << 1 }
        }
        return c
    }

    private var wanted: Bool { UserDefaults.standard.bool(forKey: Self.rememberKey) }

    private func scan() {
        guard let central, central.state == .poweredOn, wanted, laser == nil else { return }
        status = .searching
        central.scanForPeripherals(withServices: nil)
    }

    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        switch c.state {
        case .poweredOn: if laser == nil { scan() }
        case .unauthorized: status = .unauthorized
        case .poweredOff: status = .bluetoothOff; laser = nil
        default: break
        }
    }

    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData ad: [String: Any], rssi: NSNumber) {
        let name = p.name ?? ad[CBAdvertisementDataLocalNameKey] as? String ?? ""
        let services = ad[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
        let taught = profiles.first { $0.id == p.identifier.uuidString }
        guard taught != nil || name.hasPrefix("LDM") || name.hasPrefix("DISTO") || services.contains(Self.boschService)
                || services.contains(Self.leicaService), laser == nil else { return }
        laser = p
        profile = taught
        c.stopScan()
        c.connect(p)
        // CoreBluetooth never gives up on a connection; a laser that switched off
        // just after advertising would leave it waiting for good.
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(10))
            guard self.laser == p, p.state != .connected else { return }
            c.cancelPeripheralConnection(p)
            self.laser = nil
            self.scan()
        }
    }

    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        p.delegate = self
        p.discoverServices(profile != nil ? nil : [Self.service, Self.boschService, Self.leicaService])
    }

    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        laser = nil
        scan()
    }

    // The laser switches itself off after a while; keep looking so it comes
    // back as soon as it is turned on again.
    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        guard p == laser else { return }
        laser = nil
        status = wanted ? .searching : .off
        scan()
    }

    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        for s in p.services ?? [] {
            p.discoverCharacteristics(profile.map { [CBUUID(string: $0.characteristic)] } ?? [Self.data, Self.boschData, Self.leicaData], for: s)
        }
    }

    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        let wanted: Set<CBUUID> = profile.map { [CBUUID(string: $0.characteristic)] } ?? [Self.data, Self.boschData, Self.leicaData]
        for ch in s.characteristics ?? [] where wanted.contains(ch.uuid) {
            p.setNotifyValue(true, for: ch)
            if ch.uuid == Self.boschData { p.writeValue(Self.boschSendReadings, for: ch, type: .withResponse) }
        }
    }

    func peripheral(_ p: CBPeripheral, didUpdateNotificationStateFor ch: CBCharacteristic, error: Error?) {
        if ch.isNotifying {
            status = .connected(profile?.name ?? p.name ?? (ch.uuid == Self.boschData ? "Bosch" : ch.uuid == Self.leicaData ? "DISTO" : "Laser"))
        }
    }

    func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
        guard let v = ch.value else { return }
        let mm: Double?
        if let profile, ch.uuid == CBUUID(string: profile.characteristic) { mm = profile.format.millimeters([UInt8](v)) }
        else if ch.uuid == Self.leicaData { mm = Self.leica.millimeters([UInt8](v)) }
        else { mm = Self.millimeters(from: v) }
        guard let mm else { return }
        reading = Reading(millimeters: mm)
    }
}

// A row for a reading field: connects the laser, or says it's ready.
struct LaserRow: View {
    @ObservedObject private var laser = Laser.shared
    @State private var teaching = false

    var body: some View {
        // On the row as a whole: the teach screen stops this session, which
        // changes the row and would close a sheet hung on one of its states.
        Group { row }.sheet(isPresented: $teaching) { LaserTeachView() }
    }

    @ViewBuilder private var row: some View {
        switch laser.status {
        case .off:
            HStack {
                Button("Connect laser", systemImage: "dot.radiowaves.left.and.right") { laser.connect() }
                Spacer()
                Button("Other laser…") { teaching = true }.buttonStyle(.borderless).font(.footnote)
            }
        case .searching:
            HStack {
                ProgressView()
                Text("Looking for the laser. Turn it on.").foregroundStyle(.secondary)
                Spacer()
                Button("Not found?") { teaching = true }.buttonStyle(.borderless).font(.footnote)
                Button("Stop") { laser.disconnect() }.buttonStyle(.borderless)
            }
        case .connected:
            HStack {
                Label("Laser connected: take the reading", systemImage: "dot.radiowaves.left.and.right")
                    .foregroundStyle(.green)
                Spacer()
                Button("Disconnect") { laser.disconnect() }.buttonStyle(.borderless).font(.footnote)
            }
        case .bluetoothOff:
            Text("Bluetooth is off. Turn it on in Control Center to use the laser.").foregroundStyle(.orange)
        case .unauthorized:
            Text("CValRScan isn't allowed to use Bluetooth. Turn it on in Settings → CValRScan.").foregroundStyle(.orange)
        }
    }
}

extension View {
    // Fills a reading field from the laser: the first reading replaces an
    // empty field, later ones are added as pieces (" + 6 5"), to the nearest
    // inch. With `pieces` off each reading replaces the last.
    func laserInput(_ text: Binding<String>, pieces: Bool = true) -> some View {
        modifier(LaserInput(text: text, pieces: pieces))
    }
}

private struct LaserInput: ViewModifier {
    @Binding var text: String
    let pieces: Bool
    @ObservedObject private var laser = Laser.shared

    func body(content: Content) -> some View {
        content.onChange(of: laser.reading) { _, r in
            guard let r else { return }
            let entry = "\(r.inches / 12) \(r.inches % 12)"
            let current = text.trimmingCharacters(in: .whitespaces)
            text = pieces && !current.isEmpty ? current + " + " + entry : entry
        }
    }
}

// Takes the last piece off a reading ("10 9 + 6 5" → "10 9"), for a laser
// press that went wrong or twice, or clears it.
struct ReadingClearRow: View {
    @Binding var text: String

    var body: some View {
        if !text.trimmingCharacters(in: .whitespaces).isEmpty {
            HStack {
                if Self.withoutLast(text) != nil {
                    Button("Clear last", systemImage: "delete.backward") { text = Self.withoutLast(text) ?? "" }
                }
                Spacer()
                Button("Clear all", systemImage: "xmark.circle", role: .destructive) { text = "" }
            }
            .buttonStyle(.borderless)
        }
    }

    // The reading before its last + or − piece; nil when it has only one.
    static func withoutLast(_ s: String) -> String? {
        let cuts = ["+", "−", "–", " - ", " plus ", " minus "].compactMap {
            s.range(of: $0, options: [.backwards, .caseInsensitive])?.lowerBound
        }
        guard let cut = cuts.max() else { return nil }
        let rest = s[..<cut].trimmingCharacters(in: .whitespaces)
        return rest.isEmpty ? nil : rest
    }
}
