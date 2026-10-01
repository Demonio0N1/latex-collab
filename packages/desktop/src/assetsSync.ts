import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { stat } from "@tauri-apps/plugin-fs";
import { resolveLocalMirrorPath, writeMirrorBinary } from "./localMirror";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Sincroniza las imágenes del proyecto DIRECTAMENTE entre los usuarios
 * conectados, a través del canal CRDT "__assets__" del servidor, que es un
 * relé puro: los bytes nunca se guardan en el disco del servidor. Cada
 * cliente escribe su propia copia en la carpeta local del proyecto
 * (p. ej. Documentos/LaTeX Projects/<proyecto>/images/...), de forma
 * automática, para que `\includegraphics{images/...}` compile en todas las
 * máquinas.
 */
export class AssetsSync {
  private doc = new Y.Doc();
  private provider: WebsocketProvider;
  private map: Y.Map<Uint8Array>;
  private listeners = new Set<(names: string[]) => void>();
  private mirrored = new Set<string>();

  constructor(
    baseUrl: string,
    private projectId: string,
    private projectName: string,
    token: string
  ) {
    // Mismo criterio que el editor: el origen ws sale del baseUrl (http→ws).
    const wsUrl = baseUrl.replace(/^http/, "ws");
    this.map = this.doc.getMap<Uint8Array>("files");
    this.provider = new WebsocketProvider(wsUrl, `ws/${projectId}/${encodeURIComponent("__assets__")}`, this.doc, {
      params: { token },
    });

    this.map.observe(() => {
      void this.mirrorAll();
      this.emit();
    });
    this.provider.on("sync", (synced: boolean) => {
      if (!synced) return;
      void this.mirrorAll();
      this.emit();
    });
  }

  /** Rutas relativas (p. ej. "images/foto.png") de todas las imágenes del proyecto. */
  names(): string[] {
    return Array.from(this.map.keys());
  }

  onChange(cb: (names: string[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    const names = this.names();
    this.listeners.forEach((cb) => cb(names));
  }

  /**
   * Escribe en la carpeta local toda imagen que falte O cuyo tamaño en disco
   * no coincida con los bytes sincronizados. Comparar tamaños (y no solo
   * existencia) hace el espejo autocurable: un intento fallido que dejó un
   * archivo de 0 bytes se repara solo en la siguiente pasada.
   */
  private async mirrorAll(): Promise<void> {
    for (const [name, bytes] of this.map.entries()) {
      if (this.mirrored.has(name)) continue;
      if (!bytes || bytes.byteLength === 0) {
        console.warn(`imagen sincronizada vacía, se ignora: ${name}`);
        continue;
      }
      try {
        const fullPath = await resolveLocalMirrorPath(this.projectId, this.projectName, name);
        let diskSize = -1;
        try {
          diskSize = (await stat(fullPath)).size;
        } catch {
          /* no existe todavía */
        }
        if (diskSize !== bytes.byteLength) {
          await writeMirrorBinary(fullPath, bytes);
          const written = (await stat(fullPath)).size;
          if (written !== bytes.byteLength) {
            throw new Error(`escritura incompleta (${written}/${bytes.byteLength} bytes)`);
          }
        }
        this.mirrored.add(name);
      } catch (err) {
        console.error(`no se pudo guardar la imagen sincronizada ${name}`, err);
      }
    }
  }

  /** Agrega una imagen: se replica sola a todos los colaboradores conectados. */
  addImage(relativePath: string, bytes: Uint8Array): void {
    if (!bytes || bytes.byteLength === 0) {
      throw new Error("La imagen llegó vacía (0 bytes) — no se puede sincronizar.");
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("La imagen supera el límite de 8 MB para sincronizar entre usuarios.");
    }
    this.map.set(relativePath, bytes);
  }

  destroy(): void {
    this.listeners.clear();
    this.provider.destroy();
    this.doc.destroy();
  }
}
