import CoreBluetooth
import SwiftUI

// Teaching the app a laser it doesn't know (LaserProfiles.swift has the
// decoding). Its own Bluetooth session: it lists every device nearby, connects
// to the one picked, listens on every characteristic that can send, and keeps
// what arrives between one typed reading and the next. Nothing is guessed until
// at least two different readings agree.
@MainActor
final class LaserTeacher: NSObject, ObservableObject, @preconcurrency CBCentralManagerDelegate, @preconcurrency CBPeripheralDelegate {
    struct Device: Identifiable {
        let peripheral: CBPeripheral
        var name: String
        var services: [CBUUID]
        var rssi: Int
        var id: UUID { peripheral.identifier }
    }

    @Published private(set) var devices: [Device] = []
    @Published private(set) var connected: Device?
    @Published private(set) var listening = 0          // characteristics that send
    @Published private(set) var heard = 0              // messages since the last reading
    @Published private(set) var samples: [LaserSample] = []
    @Published private(set) var matches: [LaserSolver.Match] = []
    @Published private(set) var problem: String?

    private var central: CBCentralManager?
    private var pending: [String: [[UInt8]]] = [:]
    private var serviceOf: [String: String] = [:]      // characteristic → service
    private var capture = LaserCapture(app: ScanController.appVersion, device: "", advertisedServices: [],
                                       characteristics: [], messages: [], readings: [])
    private let started = Date()

    func start() {
        Laser.shared.pauseForTeaching()
        if central == nil { central = CBCentralManager(delegate: self, queue: nil) }
    }

    func stop() {
        central?.stopScan()
        if let p = connected?.peripheral { central?.cancelPeripheralConnection(p) }
    }

    func pick(_ d: Device) {
        central?.stopScan()
        connected = d
        capture.device = d.name
        capture.advertisedServices = d.services.map(\.uuidString)
        d.peripheral.delegate = self
        central?.connect(d.peripheral)
    }

    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        switch c.state {
        case .poweredOn: problem = nil; c.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        case .unauthorized: problem = "CValRScan isn't allowed to use Bluetooth. Turn it on in Settings → CValRScan."
        case .poweredOff: problem = "Bluetooth is off. Turn it on in Control Center."
        default: break
        }
    }

    // Named devices, and unnamed ones that advertise a service (a Bosch has no
    // name); strongest signal first, so the laser held next to the phone is on top.
    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData ad: [String: Any], rssi: NSNumber) {
        let name = p.name ?? ad[CBAdvertisementDataLocalNameKey] as? String
        let services = ad[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
        guard name != nil || !services.isEmpty, rssi.intValue < 0 else { return }
        let d = Device(peripheral: p, name: name ?? "Unnamed device \(p.identifier.uuidString.prefix(4))", services: services, rssi: rssi.intValue)
        if let i = devices.firstIndex(where: { $0.id == d.id }) { devices[i] = d } else { devices.append(d) }
        devices.sort { $0.rssi > $1.rssi }
    }

    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) { p.discoverServices(nil) }

    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        problem = "Couldn't connect to \(connected?.name ?? "it"). Make sure it's on and in Bluetooth mode, then pick it again."
        connected = nil
        c.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
    }

    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        guard p.identifier == connected?.id else { return }
        problem = "The laser disconnected (it may have switched itself off). Turn it on and pick it again; readings so far are kept."
        connected = nil
        listening = 0
        c.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
    }

    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        for s in p.services ?? [] { p.discoverCharacteristics(nil, for: s) }
    }

    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        for ch in s.characteristics ?? [] {
            let props = Self.names(ch.properties)
            capture.characteristics.append(.init(service: s.uuid.uuidString, uuid: ch.uuid.uuidString, properties: props))
            serviceOf[ch.uuid.uuidString] = s.uuid.uuidString
            if ch.properties.contains(.notify) || ch.properties.contains(.indicate) {
                p.setNotifyValue(true, for: ch)
                listening += 1
            }
        }
    }

    func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
        guard let v = ch.value, !v.isEmpty else { return }
        let b = [UInt8](v)
        pending[ch.uuid.uuidString, default: []].append(b)
        heard += 1
        capture.messages.append(.init(at: Date().timeIntervalSince(started), characteristic: ch.uuid.uuidString, hex: b.hex))
    }

    // A reading as the laser's screen shows it; the messages since the last
    // one go with it.
    func add(_ typed: String) -> Bool {
        guard let t = LaserSolver.typed(typed) else { return false }
        samples.append(LaserSample(millimeters: t.millimeters, tolerance: t.tolerance, typed: typed, packets: pending))
        capture.readings.append(.init(at: Date().timeIntervalSince(started), typed: typed, millimeters: t.millimeters))
        pending = [:]
        heard = 0
        matches = LaserSolver.solve(samples)
        return true
    }

    func removeLast() {
        guard !samples.isEmpty else { return }
        samples.removeLast()
        capture.readings.removeLast()
        matches = LaserSolver.solve(samples)
    }

    var heardNothing: Bool { samples.count >= 2 && samples.allSatisfy { $0.packets.isEmpty } }

    func profile() -> LaserProfile? {
        guard let d = connected, let m = matches.first else { return nil }
        return LaserProfile(id: d.id.uuidString, name: d.name, service: serviceOf[m.characteristic] ?? "",
                            characteristic: m.characteristic, format: m.format)
    }

    // The file to send to support: the device, what it offers, every message
    // heard and every reading typed.
    func supportFile() -> URL? {
        var c = capture
        c.found = matches.first.map { "\($0.characteristic): \($0.format.summary)" }
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? enc.encode(c) else { return nil }
        let safe = c.device.components(separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|")).joined()
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("Laser capture - \(safe.isEmpty ? "laser" : safe).json")
        return (try? data.write(to: url, options: .atomic)) != nil ? url : nil
    }

    private static func names(_ p: CBCharacteristicProperties) -> [String] {
        [(CBCharacteristicProperties.read, "read"), (.write, "write"), (.writeWithoutResponse, "writeWithoutResponse"),
         (.notify, "notify"), (.indicate, "indicate")].filter { p.contains($0.0) }.map(\.1)
    }
}

struct LaserTeachView: View {
    @StateObject private var teacher = LaserTeacher()
    @ObservedObject private var laser = Laser.shared
    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""
    @State private var bad = false
    @State private var support: URL?

    var body: some View {
        NavigationStack {
            Form {
                if !laser.profiles.isEmpty {
                    Section("Lasers taught on this phone") {
                        ForEach(laser.profiles) { p in
                            VStack(alignment: .leading) {
                                Text(p.name)
                                Text(p.format.summary).font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                        .onDelete { for i in $0 { laser.forget(laser.profiles[i]) } }
                    }
                }
                if let problem = teacher.problem {
                    Section { Text(problem).foregroundStyle(.orange) }
                }
                if let d = teacher.connected {
                    readings(d)
                } else {
                    pickSection
                }
            }
            .navigationTitle("Teach a laser")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
        .onAppear { teacher.start() }
        .onDisappear {
            teacher.stop()
            laser.resumeAfterTeaching()
        }
    }

    private var pickSection: some View {
        Section {
            if teacher.devices.isEmpty {
                HStack { ProgressView(); Text("Looking for Bluetooth devices…").foregroundStyle(.secondary) }
            }
            ForEach(teacher.devices) { d in
                Button { teacher.pick(d) } label: {
                    HStack {
                        Text(d.name)
                        Spacer()
                        Image(systemName: "wifi", variableValue: Double(min(max(d.rssi + 100, 0), 60)) / 60)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        } header: {
            Text("1. Pick your laser")
        } footer: {
            Text("Turn the laser on and switch on its Bluetooth, then hold it next to the phone: it moves to the top of the list. Brands the app already knows (Bosch GLM-C, Huepar, Leica DISTO) connect with Connect laser, no teaching needed.")
        }
    }

    @ViewBuilder
    private func readings(_ d: LaserTeacher.Device) -> some View {
        Section {
            Text("Connected to \(d.name), listening on \(teacher.listening) channel\(teacher.listening == 1 ? "" : "s").")
            HStack {
                TextField("What the laser shows, e.g. 10 8 1/2 or 3.256 m", text: $typed)
                    .keyboardType(.numbersAndPunctuation)
                    .onSubmit(add)
                Button("Add", action: add).disabled(typed.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if bad { Text("Type it as the laser shows it: 10 8 1/2, 10' 8\", 3.256 m or 3256 mm.").font(.footnote).foregroundStyle(.orange) }
            Text(teacher.heard == 0 ? "Nothing heard from the laser yet. Take a reading." : "Heard \(teacher.heard) message\(teacher.heard == 1 ? "" : "s") from the laser. Type what its screen shows.")
                .font(.footnote).foregroundStyle(teacher.heard == 0 ? Color.secondary : Color.green)
            ForEach(Array(teacher.samples.enumerated()), id: \.offset) { i, s in
                HStack {
                    Text("\(i + 1).  \(s.typed)")
                    Spacer()
                    Text(s.packets.isEmpty ? "nothing heard" : "\(s.packets.values.map(\.count).reduce(0, +)) heard")
                        .font(.footnote).foregroundStyle(s.packets.isEmpty ? Color.orange : Color.secondary)
                }
            }
            if !teacher.samples.isEmpty {
                Button("Remove last reading", role: .destructive) { teacher.removeLast() }
            }
        } header: {
            Text("2. Take three readings")
        } footer: {
            Text("Measure three different distances. After each, type exactly what the laser's screen shows and tap Add.")
        }
        Section("3. Result") {
            if let p = teacher.profile() {
                Label("Found it: \(p.format.summary).", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                if teacher.samples.count < 3 {
                    Text("Take one more reading to be sure before using it.").font(.footnote).foregroundStyle(.secondary)
                }
                Button("Use this laser", systemImage: "dot.radiowaves.left.and.right") {
                    laser.save(p)
                    dismiss()
                }
                .disabled(teacher.samples.count < 3)
            } else if teacher.heardNothing {
                Text("The laser sent nothing when it measured. Some lasers wait for the app to ask for readings first, which can't be worked out here. Send the file below to support and it can be added to the app.")
                    .foregroundStyle(.orange)
            } else if teacher.samples.count >= 2 {
                Text("Not worked out yet. Take another reading; if it still can't tell after four, send the file below to support.")
                    .foregroundStyle(.secondary)
            } else {
                Text("Waiting for readings.").foregroundStyle(.secondary)
            }
        }
        Section {
            if let support {
                ShareLink(item: support) { Label("Send the file", systemImage: "square.and.arrow.up") }
            } else {
                Button("Make a file for support", systemImage: "doc.badge.gearshape") { support = teacher.supportFile() }
                    .disabled(teacher.samples.isEmpty)
            }
        } header: {
            Text("Can't work it out?")
        } footer: {
            Text("The file holds what the laser sent and the readings you typed, nothing else. Email or message it to support so the laser can be added for everyone.")
        }
    }

    private func add() {
        bad = !teacher.add(typed)
        if !bad { typed = ""; support = nil }
    }
}
