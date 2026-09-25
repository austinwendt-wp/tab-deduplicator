// Native messaging host for Tab Deduplicator.
// Queries Chrome's AppleScript dictionary for window names and returns a
// windowId → name map. The chrome.windows API and Chrome's AppleScript
// interface share the same internal window IDs, so no bounds-matching is
// needed — IDs match directly.

import Foundation

// MARK: - Native messaging I/O

func readMessage() -> Data? {
    let lengthData = FileHandle.standardInput.readData(ofLength: 4)
    guard lengthData.count == 4 else { return nil }
    let length = lengthData.withUnsafeBytes { $0.load(as: UInt32.self).littleEndian }
    guard length > 0, length < 1_000_000 else { return nil }
    let body = FileHandle.standardInput.readData(ofLength: Int(length))
    return body.count == Int(length) ? body : nil
}

func writeMessage(_ dict: [String: Any]) {
    guard let body = try? JSONSerialization.data(withJSONObject: dict) else { return }
    var length = UInt32(body.count).littleEndian
    FileHandle.standardOutput.write(Data(bytes: &length, count: 4))
    FileHandle.standardOutput.write(body)
}

// MARK: - AppleScript query

// SEP and EOL are captured before the tell block because inside
// "tell application Google Chrome", the identifier `tab` is shadowed by
// Chrome's own AppleScript tab element type and concatenates as the literal
// word "tab" instead of a tab character.
func fetchChromeWindowNames() -> [String: String] {
    let script = """
    set SEP to ASCII character 9
    set EOL to ASCII character 10
    set output to ""
    tell application "Google Chrome"
        repeat with w in windows
            set wId   to (id of w) as string
            set wName to name of w
            set output to output & wId & SEP & wName & EOL
        end repeat
    end tell
    return output
    """

    let task = Process()
    task.launchPath = "/usr/bin/osascript"
    task.arguments = ["-e", script]
    let outPipe = Pipe()
    let errPipe = Pipe()
    task.standardOutput = outPipe
    task.standardError  = errPipe

    do { try task.run() } catch { return [:] }
    task.waitUntilExit()
    guard task.terminationStatus == 0 else { return [:] }

    let raw = String(data: outPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    var result: [String: String] = [:]
    for line in raw.components(separatedBy: "\n") {
        guard let tabIdx = line.firstIndex(of: "\t") else { continue }
        let id   = String(line[line.startIndex..<tabIdx]).trimmingCharacters(in: .whitespaces)
        let name = String(line[line.index(after: tabIdx)...]).trimmingCharacters(in: .whitespaces)
        if !id.isEmpty && !name.isEmpty {
            result[id] = name
        }
    }
    return result
}

// MARK: - Main

guard readMessage() != nil else {
    writeMessage(["error": "could not read message"])
    exit(1)
}

let names = fetchChromeWindowNames()
writeMessage(["windowNames": names])
