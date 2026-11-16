import SwiftUI
import UIKit

// Save to folder: the scan's files and its photos go as one folder into a
// folder the user picks in the Files picker, OneDrive included. The share
// sheet often leaves OneDrive out for a mix of .json, .usdz and .zip; the
// Files picker lists every storage provider the phone has turned on.

extension ScanController {
    // "2344 Main St 2026-10-17_11-50/" holding the plan, the raw scan, the 3D
    // model and Photos/, built fresh in the temporary folder. nil before
    // Build floor plan (there are no scan files yet).
    func folderToSave() -> URL? {
        let files = shareURLs.filter { !$0.lastPathComponent.hasSuffix("photos.zip") }
        guard !files.isEmpty else { return nil }
        let fm = FileManager.default
        let base = files[0].deletingPathExtension().deletingPathExtension().lastPathComponent
        let name = base.hasPrefix("scan-") ? "Scan \(base.dropFirst(5))" : base
        let root = fm.temporaryDirectory.appendingPathComponent("save-folder", isDirectory: true)
        let dir = root.appendingPathComponent(name, isDirectory: true)
        try? fm.removeItem(at: root)
        do {
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            for f in files { try fm.copyItem(at: f, to: dir.appendingPathComponent(f.lastPathComponent)) }
            if let photos = photoDirectory, !self.photos.isEmpty, fm.fileExists(atPath: photos.path) {
                try fm.copyItem(at: photos, to: dir.appendingPathComponent("Photos", isDirectory: true))
            }
            return dir
        } catch {
            message = "Couldn't get the files ready: \(error.localizedDescription)"
            return nil
        }
    }

    // The folder picked last time, so the picker opens there next time.
    static var lastSaveFolder: URL? {
        get {
            guard let data = UserDefaults.standard.data(forKey: "saveFolderBookmark") else { return nil }
            var stale = false
            return try? URL(resolvingBookmarkData: data, bookmarkDataIsStale: &stale)
        }
        set {
            let data = newValue.flatMap { try? $0.bookmarkData() }
            UserDefaults.standard.set(data, forKey: "saveFolderBookmark")
        }
    }
}

// The Files picker, choosing where the folder goes.
struct FolderSaver: UIViewControllerRepresentable {
    let folder: URL
    let done: (URL?) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forExporting: [folder], asCopy: true)
        picker.delegate = context.coordinator
        if let last = ScanController.lastSaveFolder { picker.directoryURL = last }
        return picker
    }

    func updateUIViewController(_ picker: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let done: (URL?) -> Void
        init(done: @escaping (URL?) -> Void) { self.done = done }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            if let saved = urls.first { ScanController.lastSaveFolder = saved.deletingLastPathComponent() }
            done(urls.first)
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { done(nil) }
    }
}
