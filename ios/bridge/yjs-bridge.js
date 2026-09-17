// Yjs CRDT bridge for the native Swift app, run inside JavaScriptCore.
//
// The server (packages/server/src/docRoom.ts) and the desktop app talk the
// y-protocols "sync" + "awareness" message framing over a WebSocket. This
// module reimplements the CLIENT half of that framing on top of the exact
// same Yjs/y-protocols code, so a native iOS client stays wire-compatible
// with everyone else. Swift owns the WebSocket and the UI; it calls into
// these functions and shuttles binary frames as base64 strings (JSCore has
// no atob/btoa/TextEncoder, so base64 is implemented here).

import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const REMOTE = "remote";
const LOCAL = "local";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function u8ToB64(bytes) {
  let out = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < len ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < len ? B64[b2 & 63] : "=";
  }
  return out;
}

function b64ToU8(str) {
  const clean = str.replace(/[^A-Za-z0-9+/]/g, "");
  const len = clean.length;
  const outLen = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(outLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64.indexOf(clean[i]);
    const c1 = B64.indexOf(clean[i + 1]);
    const c2 = i + 2 < len ? B64.indexOf(clean[i + 2]) : -1;
    const c3 = i + 3 < len ? B64.indexOf(clean[i + 3]) : -1;
    bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0 && p < outLen) bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0 && p < outLen) bytes[p++] = ((c2 & 3) << 6) | c3;
  }
  return bytes;
}

const rooms = new Map();
let nextId = 1;

function room(id) {
  const r = rooms.get(id);
  if (!r) throw new Error("unknown room " + id);
  return r;
}

globalThis.YBridge = {
  // Create a CRDT room (one per open .tex file). Returns a string handle.
  create() {
    const id = String(nextId++);
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    const text = doc.getText("content");
    const outgoing = [];

    doc.on("update", (update, origin) => {
      if (origin === REMOTE) return; // don't echo server-applied updates back
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeUpdate(enc, update);
      outgoing.push(u8ToB64(encoding.toUint8Array(enc)));
    });

    awareness.on("update", ({ added, updated, removed }, origin) => {
      if (origin === REMOTE) return;
      const changed = added.concat(updated, removed);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
      outgoing.push(u8ToB64(encoding.toUint8Array(enc)));
    });

    rooms.set(id, { doc, awareness, text, outgoing });
    return id;
  },

  destroy(id) {
    const r = rooms.get(id);
    if (r) {
      r.doc.destroy();
      rooms.delete(id);
    }
  },

  // First message to send after the socket opens (sync step 1).
  syncStep1(id) {
    const { doc } = room(id);
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(enc, doc);
    return u8ToB64(encoding.toUint8Array(enc));
  },

  // Feed an incoming binary frame (base64). Returns a base64 reply to send
  // back, or "" if none.
  receive(id, b64) {
    const { doc, awareness } = room(id);
    const dec = decoding.createDecoder(b64ToU8(b64));
    const type = decoding.readVarUint(dec);
    if (type === MESSAGE_SYNC) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(dec, enc, doc, REMOTE);
      if (encoding.length(enc) > 1) return u8ToB64(encoding.toUint8Array(enc));
      return "";
    }
    if (type === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(dec), REMOTE);
      return "";
    }
    return "";
  },

  // Drain queued outgoing frames (base64) produced by local edits/presence.
  drain(id) {
    const r = room(id);
    const out = r.outgoing.slice();
    r.outgoing.length = 0;
    return out;
  },

  text(id) {
    return room(id).text.toString();
  },

  // Apply a local edit as a minimal diff against current content so remote
  // peers see granular inserts/deletes (and cursors move sanely), instead of
  // a whole-document replace.
  setText(id, next) {
    const { doc, text } = room(id);
    const prev = text.toString();
    if (prev === next) return;
    let start = 0;
    const minLen = Math.min(prev.length, next.length);
    while (start < minLen && prev[start] === next[start]) start++;
    let endPrev = prev.length;
    let endNext = next.length;
    while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
      endPrev--;
      endNext--;
    }
    doc.transact(() => {
      if (endPrev > start) text.delete(start, endPrev - start);
      if (endNext > start) text.insert(start, next.slice(start, endNext));
    }, LOCAL);
  },

  // Presence: publish this user's identity/cursor for the awareness protocol.
  setLocalUser(id, name, color) {
    room(id).awareness.setLocalStateField("user", { name, color });
  },

  // Peers currently connected (excluding entries with no user), as JSON.
  peers(id) {
    const states = room(id).awareness.getStates();
    const localId = room(id).awareness.clientID;
    const list = [];
    states.forEach((state, clientId) => {
      const u = state && state.user;
      if (u && clientId !== localId) list.push({ name: u.name, color: u.color });
    });
    return JSON.stringify(list);
  },
};

// Sanity value Swift can read to confirm the bundle evaluated.
globalThis.YBridgeReady = true;
