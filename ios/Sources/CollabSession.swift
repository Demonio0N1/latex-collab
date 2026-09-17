import Foundation

/// Drives real-time collaborative editing of one .tex file: a WebSocket to
/// the server plus a Yjs room in JavaScriptCore. Publishes the text and the
/// connected peers for SwiftUI.
@MainActor
final class CollabSession: ObservableObject {
    @Published var text: String = ""
    @Published var peers: [Peer] = []
    @Published var connected: Bool = false

    let session: Session
    let filePath: String
    let userName: String

    private var roomId: String = ""
    private var socket: URLSessionWebSocketTask?
    private var applyingRemote = false
    private var peersTimer: Timer?

    init(session: Session, filePath: String, userName: String) {
        self.session = session
        self.filePath = filePath
        self.userName = userName
    }

    /// ws(s) base derived from the http(s) base we actually connected to —
    /// robust for both a LAN host:port and a Tailscale Funnel https host
    /// (the server's own wsUrl would carry the wrong scheme/port via Funnel).
    private var wsBase: String {
        if session.baseUrl.hasPrefix("https://") {
            return "wss://" + session.baseUrl.dropFirst("https://".count)
        }
        return "ws://" + session.baseUrl.dropFirst("http://".count)
    }

    func start() {
        roomId = YEngine.shared.createRoom()
        YEngine.shared.setLocalUser(roomId, name: userName, color: colorFor(userName))
        text = YEngine.shared.text(roomId)

        let encodedPath = filePath.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? filePath
        guard let url = URL(string: "\(wsBase)/ws/\(session.project.id)/\(encodedPath)?token=\(session.token)") else { return }

        let task = URLSession.shared.webSocketTask(with: url)
        socket = task
        task.resume()
        connected = true

        // Kick off the Yjs handshake.
        sendBase64(YEngine.shared.syncStep1(roomId))
        flushOutgoing()
        receiveLoop()

        peersTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refreshPeers() }
        }
    }

    func stop() {
        peersTimer?.invalidate()
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        if !roomId.isEmpty { YEngine.shared.destroyRoom(roomId) }
        connected = false
    }

    /// Called by the editor when the user types. Reflect the typed text
    /// immediately (so the bound TextEditor isn't fought by a stale value),
    /// then push the diff into the CRDT and send it out.
    func localEdit(_ newText: String) {
        guard !applyingRemote else { return }
        text = newText
        YEngine.shared.setText(roomId, newText)
        flushOutgoing()
    }

    private func receiveLoop() {
        socket?.receive { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                switch result {
                case .failure:
                    self.connected = false
                case .success(let message):
                    self.handle(message)
                    self.receiveLoop()
                }
            }
        }
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) {
        let data: Data
        switch message {
        case .data(let d): data = d
        case .string(let s): data = Data(s.utf8)
        @unknown default: return
        }
        let b64 = data.base64EncodedString()
        if let reply = YEngine.shared.receive(roomId, base64: b64) {
            sendBase64(reply)
        }
        // Reflect any converged text without treating it as a local edit.
        applyingRemote = true
        let latest = YEngine.shared.text(roomId)
        if latest != text { text = latest }
        applyingRemote = false
        flushOutgoing()
        refreshPeers()
    }

    private func flushOutgoing() {
        for frame in YEngine.shared.drain(roomId) { sendBase64(frame) }
    }

    private func sendBase64(_ b64: String) {
        guard !b64.isEmpty, let data = Data(base64Encoded: b64) else { return }
        socket?.send(.data(data)) { _ in }
    }

    private func refreshPeers() {
        let p = YEngine.shared.peers(roomId)
        if p != peers { peers = p }
    }
}

/// Deterministic per-user color, matching the server's randomColor().
func colorFor(_ seed: String) -> String {
    var hash: UInt32 = 0
    for ch in seed.unicodeScalars { hash = (hash &* 31 &+ ch.value) }
    let hue = Int(hash % 360)
    return "hsl(\(hue), 70%, 55%)"
}
