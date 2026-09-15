import fs from "node:fs";
import * as Y from "yjs";
import { WebSocket } from "ws";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PERSIST_DEBOUNCE_MS = 1000;

/**
 * One DocRoom = one real file on disk (e.g. "chapters/intro.tex").
 * The Y.Doc holds a single Y.Text mirroring the file's contents; every
 * connected client is a CRDT peer. Writes to disk are debounced so a
 * flurry of keystrokes doesn't hammer the filesystem, and any external
 * compiler always sees a plain, valid text file — never Yjs internals.
 */
export class DocRoom {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  readonly clients = new Set<WebSocket>();
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly roomId: string,
    readonly absoluteFilePath: string
  ) {
    const initialContent = fs.existsSync(absoluteFilePath)
      ? fs.readFileSync(absoluteFilePath, "utf8")
      : "";
    this.doc.getText("content").insert(0, initialContent);

    this.doc.on("update", () => this.schedulePersist());
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistNow(), PERSIST_DEBOUNCE_MS);
  }

  persistNow(): void {
    const content = this.doc.getText("content").toString();
    fs.writeFileSync(this.absoluteFilePath, content, "utf8");
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);

    // 1. send this doc's current state as a sync step 1
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(syncEncoder, this.doc);
    ws.send(encoding.toUint8Array(syncEncoder));

    // 2. send current awareness states
    const awarenessStates = this.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(awarenessStates.keys()))
      );
      ws.send(encoding.toUint8Array(awarenessEncoder));
    }

    const docUpdateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === ws) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.send(ws, encoding.toUint8Array(encoder));
    };
    this.doc.on("update", docUpdateHandler);

    const awarenessUpdateHandler = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      this.send(ws, encoding.toUint8Array(encoder));
    };
    this.awareness.on("update", awarenessUpdateHandler);

    ws.on("message", (raw: ArrayBuffer) => {
      const decoder = decoding.createDecoder(new Uint8Array(raw as ArrayBuffer));
      const messageType = decoding.readVarUint(decoder);
      if (messageType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);
        if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          ws
        );
      }
    });

    ws.on("close", () => {
      this.clients.delete(ws);
      this.doc.off("update", docUpdateHandler);
      this.awareness.off("update", awarenessUpdateHandler);
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        Array.from(this.awareness.getStates().keys()).filter(
          (clientId) => this.awareness.getStates().get(clientId)?.__ws === ws
        ),
        null
      );
      this.persistNow();
    });
  }

  private send(ws: WebSocket, message: Uint8Array): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}

const rooms = new Map<string, DocRoom>();

export function getOrCreateRoom(roomId: string, absoluteFilePath: string): DocRoom {
  let room = rooms.get(roomId);
  if (!room) {
    room = new DocRoom(roomId, absoluteFilePath);
    rooms.set(roomId, room);
  }
  return room;
}
