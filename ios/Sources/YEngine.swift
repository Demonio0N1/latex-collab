import Foundation
import JavaScriptCore
import Security

/// Wraps the bundled Yjs/y-protocols code running in JavaScriptCore. All
/// calls must happen on the main actor — JSContext is not thread-safe.
@MainActor
final class YEngine {
    static let shared = YEngine()

    private let ctx = JSContext()!
    private(set) var loaded = false

    private init() {
        ctx.exceptionHandler = { _, exc in
            print("[YEngine] JS exception:", exc?.toString() ?? "?")
        }
        installPolyfills()
        loadBundle()
    }

    private func installPolyfills() {
        let log: @convention(block) (String) -> Void = { print("[js]", $0) }
        ctx.setObject(log, forKeyedSubscript: "__log" as NSString)

        // Secure crypto.getRandomValues so Yjs client IDs are well-distributed.
        let randomBytes: @convention(block) (Int) -> [Int] = { n in
            var buf = [UInt8](repeating: 0, count: max(0, n))
            _ = SecRandomCopyBytes(kSecRandomDefault, buf.count, &buf)
            return buf.map { Int($0) }
        }
        ctx.setObject(randomBytes, forKeyedSubscript: "__randomBytes" as NSString)

        ctx.evaluateScript("""
        var console = { log: __log, warn: __log, error: __log, debug: __log };
        var crypto = {
          getRandomValues: function(arr) {
            var b = __randomBytes(arr.length);
            for (var i = 0; i < arr.length; i++) arr[i] = b[i];
            return arr;
          }
        };
        var __timerId = 0;
        function setTimeout(){ return ++__timerId; }
        function setInterval(){ return ++__timerId; }
        function clearTimeout(){}
        function clearInterval(){}
        """)
    }

    private func loadBundle() {
        guard let url = Bundle.main.url(forResource: "yjs-bridge", withExtension: "js"),
              let js = try? String(contentsOf: url, encoding: .utf8) else {
            print("[YEngine] yjs-bridge.js not found in bundle")
            return
        }
        ctx.evaluateScript(js)
        loaded = ctx.evaluateScript("globalThis.YBridgeReady === true")?.toBool() ?? false
        if !loaded { print("[YEngine] bridge failed to initialize") }
    }

    private func call(_ expr: String) -> JSValue? { ctx.evaluateScript(expr) }

    // Room handles are short numeric strings; safe to interpolate.
    func createRoom() -> String { call("YBridge.create()")?.toString() ?? "" }
    func destroyRoom(_ id: String) { _ = call("YBridge.destroy('\(id)')") }

    func syncStep1(_ id: String) -> String { call("YBridge.syncStep1('\(id)')")?.toString() ?? "" }

    /// Feed an incoming base64 frame; returns a base64 reply to send, or nil.
    func receive(_ id: String, base64: String) -> String? {
        let r = call("YBridge.receive('\(id)', '\(base64)')")?.toString() ?? ""
        return r.isEmpty ? nil : r
    }

    /// Outgoing base64 frames produced by local edits/presence since last drain.
    func drain(_ id: String) -> [String] {
        guard let json = call("YBridge.drain('\(id)')")?.toString(),
              let data = json.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [String] else { return [] }
        return arr
    }

    func text(_ id: String) -> String { call("YBridge.text('\(id)')")?.toString() ?? "" }

    func setText(_ id: String, _ next: String) {
        // Pass the string via a JS global to avoid quoting/escaping issues.
        ctx.setObject(next, forKeyedSubscript: "__pendingText" as NSString)
        _ = call("YBridge.setText('\(id)', __pendingText)")
    }

    func setLocalUser(_ id: String, name: String, color: String) {
        ctx.setObject(name, forKeyedSubscript: "__uName" as NSString)
        ctx.setObject(color, forKeyedSubscript: "__uColor" as NSString)
        _ = call("YBridge.setLocalUser('\(id)', __uName, __uColor)")
    }

    func peers(_ id: String) -> [Peer] {
        guard let json = call("YBridge.peers('\(id)')")?.toString(),
              let data = json.data(using: .utf8),
              let arr = try? JSONDecoder().decode([Peer].self, from: data) else { return [] }
        return arr
    }
}
