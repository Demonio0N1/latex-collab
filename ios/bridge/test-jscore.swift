import Foundation
import JavaScriptCore

let ctx = JSContext()!
var jsError: String? = nil
ctx.exceptionHandler = { _, exc in
    jsError = exc?.toString() ?? "unknown JS exception"
}

// JSCore has no console; provide a minimal one so any library logging is safe.
let consoleLog: @convention(block) (String) -> Void = { print("[js]", $0) }
ctx.setObject(consoleLog, forKeyedSubscript: "__log" as NSString)
ctx.evaluateScript("var console = { log: __log, warn: __log, error: __log };")

// JSCore has no Web Crypto; lib0 needs crypto.getRandomValues. (The Swift
// app injects a SecRandomCopyBytes-backed version; Math.random is fine here.)
ctx.evaluateScript("""
var crypto = { getRandomValues: function(a){ for (var i=0;i<a.length;i++) a[i]=Math.floor(Math.random()*256); return a; } };
var __timerId = 0;
function setTimeout(){ return ++__timerId; }
function setInterval(){ return ++__timerId; }
function clearTimeout(){}
function clearInterval(){}
""")

let bundlePath = CommandLine.arguments[1]
let js = try! String(contentsOfFile: bundlePath, encoding: .utf8)
ctx.evaluateScript(js)
if let e = jsError { print("FAIL: bundle eval error:", e); exit(1) }

func check(_ cond: Bool, _ label: String) {
    print(cond ? "ok  " : "FAIL", label)
    if !cond { if let e = jsError { print("   js error:", e) }; exit(1) }
}

let ready = ctx.evaluateScript("globalThis.YBridgeReady === true")!.toBool()
check(ready, "bundle evaluated, YBridge present")

// Two independent replicas (like the iPad and the desktop).
let a = ctx.evaluateScript("YBridge.create()")!.toString()!
let b = ctx.evaluateScript("YBridge.create()")!.toString()!
check(jsError == nil, "created two rooms")

func call(_ expr: String) -> JSValue { let v = ctx.evaluateScript(expr)!; return v }

// A edits, then the sync handshake carries it to B.
_ = call("YBridge.setText('\(a)', 'Hola mundo')")
check(jsError == nil, "A local edit")

// A -> B: send step1, B replies (step2 with A's state), A applies.
let step1 = call("YBridge.syncStep1('\(a)')").toString()!
let reply = call("YBridge.receive('\(b)', '\(step1)')").toString()!
check(!reply.isEmpty, "B produced a sync reply to A's step1")
_ = call("YBridge.receive('\(a)', '\(reply)')")

// Also B needs A's actual update. Drain A's outgoing (from the edit) into B.
let outA = call("JSON.stringify(YBridge.drain('\(a)'))").toString()!
let msgs = try! JSONSerialization.jsonObject(with: outA.data(using: .utf8)!) as! [String]
for m in msgs { _ = call("YBridge.receive('\(b)', '\(m)')") }

// B should now see A's text.
let bText = call("YBridge.text('\(b)')").toString()!
check(bText == "Hola mundo", "B converged to A's text (got: '\(bText)')")

// Now B edits; carry back to A.
_ = call("YBridge.setText('\(b)', 'Hola mundo colaborativo')")
let outB = call("JSON.stringify(YBridge.drain('\(b)'))").toString()!
let msgsB = try! JSONSerialization.jsonObject(with: outB.data(using: .utf8)!) as! [String]
for m in msgsB { _ = call("YBridge.receive('\(a)', '\(m)')") }
let aText = call("YBridge.text('\(a)')").toString()!
check(aText == "Hola mundo colaborativo", "A converged to B's edit (got: '\(aText)')")

// Awareness (presence) round-trips without throwing.
_ = call("YBridge.setLocalUser('\(a)', 'Gary', 'hsl(200,70%,55%)')")
let drainAware = call("JSON.stringify(YBridge.drain('\(a)'))").toString()!
let awareMsgs = try! JSONSerialization.jsonObject(with: drainAware.data(using: .utf8)!) as! [String]
for m in awareMsgs { _ = call("YBridge.receive('\(b)', '\(m)')") }
let peers = call("YBridge.peers('\(b)')").toString()!
check(peers.contains("Gary"), "B sees A's presence (got: \(peers))")

print("ALL PASS — Yjs bridge works in JavaScriptCore")
