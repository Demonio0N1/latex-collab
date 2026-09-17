import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab } from "y-codemirror.next";
import { randomColor } from "@latex-collab/shared";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { resolveLocalMirrorPath, writeMirror, writeMirrorBinary } from "../localMirror";
import { uploadProjectFile } from "../api";
import { wrapSelection, insertTemplate } from "../codeMirrorSnippets";
import EditorToolbar from "./EditorToolbar";

interface EditorProps {
  baseUrl: string;
  projectId: string;
  projectName: string;
  filePath: string;
  token: string;
  userName: string;
  active: boolean;
  onPresenceChange: (peers: { name: string; color: string }[]) => void;
  onLocalPathReady: (path: string | null) => void;
}

const MIRROR_DEBOUNCE_MS = 800;

/**
 * Every open tab keeps its own Editor mounted (just hidden via the `active`
 * flag) instead of remounting on tab switch — that keeps the Yjs doc and
 * WebSocket connection alive so switching tabs doesn't drop sync state or
 * flicker a reconnect. Only the active tab is allowed to push presence/path
 * updates up to the shared header/status bar.
 */
export default function Editor({
  baseUrl,
  projectId,
  projectName,
  filePath,
  token,
  userName,
  active,
  onPresenceChange,
  onLocalPathReady,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const localPathRef = useRef<string | null>(null);
  const activeRef = useRef(active);
  const latestPeersRef = useRef<{ name: string; color: string }[]>([]);
  const latestPathRef = useRef<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    activeRef.current = active;
    if (active) {
      onPresenceChange(latestPeersRef.current);
      onLocalPathReady(latestPathRef.current);
    }
  }, [active, onPresenceChange, onLocalPathReady]);

  useEffect(() => {
    let disposed = false;
    let localPath: string | null = null;
    let mirrorTimer: ReturnType<typeof setTimeout> | null = null;

    const ydoc = new Y.Doc();
    const roomName = `ws/${projectId}/${encodeURIComponent(filePath)}`;
    // Derive the ws origin from baseUrl (http→ws, https→wss) rather than
    // trusting the server's advertised wsUrl, whose host/port/scheme is wrong
    // when reached via Tailscale Funnel or direct TLS. Same rule as iOS.
    const wsUrl = baseUrl.replace(/^http/, "ws");
    const provider = new WebsocketProvider(wsUrl, roomName, ydoc, {
      params: { token },
    });

    const localColor = randomColor(userName);
    provider.awareness.setLocalStateField("user", { name: userName, color: localColor });

    const updatePeers = () => {
      const peers = Array.from(provider.awareness.getStates().values())
        .map((state) => (state as { user?: { name: string; color: string } }).user)
        .filter((user): user is { name: string; color: string } => Boolean(user));
      latestPeersRef.current = peers;
      if (activeRef.current) onPresenceChange(peers);
    };
    provider.awareness.on("change", updatePeers);
    updatePeers();

    const ytext = ydoc.getText("content");

    resolveLocalMirrorPath(projectId, projectName, filePath).then((path) => {
      if (disposed) return;
      localPath = path;
      latestPathRef.current = path;
      localPathRef.current = path;
      if (activeRef.current) onLocalPathReady(path);
      writeMirror(path, ytext.toString()).catch((err) => console.error("mirror write failed", err));
    });

    const scheduleMirror = () => {
      if (!localPath) return;
      if (mirrorTimer) clearTimeout(mirrorTimer);
      mirrorTimer = setTimeout(() => {
        writeMirror(localPath!, ytext.toString()).catch((err) => console.error("mirror write failed", err));
      }, MIRROR_DEBOUNCE_MS);
    };
    ydoc.on("update", scheduleMirror);

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        StreamLanguage.define(stex),
        yCollab(ytext, provider.awareness),
        EditorView.theme({ "&": { height: "100%", fontSize: "14px" } }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current! });
    viewRef.current = view;

    return () => {
      disposed = true;
      if (mirrorTimer) clearTimeout(mirrorTimer);
      if (activeRef.current) onLocalPathReady(null);
      viewRef.current = null;
      view.destroy();
      ydoc.off("update", scheduleMirror);
      provider.awareness.off("change", updatePeers);
      provider.destroy();
      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, projectId, projectName, filePath, token, userName]);

  function withView(fn: (view: EditorView) => void) {
    const view = viewRef.current;
    if (view) fn(view);
  }

  async function handleInsertImage() {
    const view = viewRef.current;
    const localPath = localPathRef.current;
    if (!view || !localPath || imageBusy) return;

    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "pdf", "eps"] }],
    });
    if (typeof picked !== "string") return;

    setImageBusy(true);
    try {
      const bytes = await readFile(picked);
      const fileName = picked.split(/[\\/]/).pop()!;

      await uploadProjectFile(baseUrl, projectId, token, fileName, bytes);

      const dir = localPath.slice(0, Math.max(localPath.lastIndexOf("/"), localPath.lastIndexOf("\\")));
      await writeMirrorBinary(`${dir}/${fileName}`, bytes);

      insertTemplate(
        view,
        "\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{",
        fileName,
        "}\n  \\caption{Descripción de la imagen}\n\\end{figure}\n"
      );
    } catch (err) {
      console.error("insert image failed", err);
      alert(`No se pudo insertar la imagen: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <div className="editor-tab" hidden={!active}>
      <EditorToolbar
        onBold={() => withView((v) => wrapSelection(v, "\\textbf{", "}"))}
        onItalic={() => withView((v) => wrapSelection(v, "\\textit{", "}"))}
        onSection={() => withView((v) => insertTemplate(v, "\\section{", "Título de sección", "}\n"))}
        onSubsection={() => withView((v) => insertTemplate(v, "\\subsection{", "Título", "}\n"))}
        onBulletList={() =>
          withView((v) => insertTemplate(v, "\\begin{itemize}\n  \\item ", "primer punto", "\n  \\item segundo punto\n\\end{itemize}\n"))
        }
        onNumberedList={() =>
          withView((v) => insertTemplate(v, "\\begin{enumerate}\n  \\item ", "primer punto", "\n  \\item segundo punto\n\\end{enumerate}\n"))
        }
        onTable={() =>
          withView((v) =>
            insertTemplate(
              v,
              "\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{|c|c|}\n    \\hline\n    ",
              "Columna 1 & Columna 2",
              " \\\\\n    \\hline\n    Dato 1 & Dato 2 \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{Descripción de la tabla}\n\\end{table}\n"
            )
          )
        }
        onInlineMath={() => withView((v) => wrapSelection(v, "$"))}
        onBlockMath={() => withView((v) => insertTemplate(v, "\\[\n  ", "E = mc^2", "\n\\]\n"))}
        onLink={() => withView((v) => insertTemplate(v, "\\href{https://ejemplo.com}{", "texto del enlace", "}"))}
        onCitation={() => withView((v) => insertTemplate(v, "\\cite{", "clave-referencia", "}"))}
        onReference={() => withView((v) => insertTemplate(v, "\\ref{", "fig:etiqueta", "}"))}
        onInsertImage={handleInsertImage}
        imageBusy={imageBusy}
      />
      <div ref={containerRef} className="editor-container" />
    </div>
  );
}
