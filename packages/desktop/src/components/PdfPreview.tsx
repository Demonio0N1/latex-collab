import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { stat } from "@tauri-apps/plugin-fs";
import { getEngine, pdfPathFor, setEngine, startWatcher, type LatexEngine, type Watcher } from "../latexCompiler";

interface PdfPreviewProps {
  texFilePath: string | null;
}

const POLL_MS = 700;
const ENGINE_LABELS: Record<LatexEngine, string> = {
  pdflatex: "pdfLaTeX",
  xelatex: "XeLaTeX",
  lualatex: "LuaLaTeX",
};

export default function PdfPreview({ texFilePath }: PdfPreviewProps) {
  const [status, setStatus] = useState<"starting" | "watching" | "error">("starting");
  const [log, setLog] = useState("");
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [engine, setEngineState] = useState<LatexEngine>(getEngine());
  const logRef = useRef("");

  useEffect(() => {
    if (!texFilePath) return;
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let lastMtime = 0;
    let activeWatcher: Watcher | null = null;
    logRef.current = "";
    setLog("");
    setPdfSrc(null);
    setStatus("starting");

    const pdfPath = pdfPathFor(texFilePath);

    const pollPdf = async () => {
      try {
        const info = await stat(pdfPath);
        const mtime = info.mtime?.getTime() ?? 0;
        if (mtime && mtime !== lastMtime) {
          lastMtime = mtime;
          setPdfSrc(`${convertFileSrc(pdfPath)}#t=${mtime}`);
          setStatus("watching");
        }
      } catch {
        // PDF doesn't exist yet — normal before the first successful compile.
      }
    };

    startWatcher(texFilePath, (chunk) => {
      if (disposed) return;
      logRef.current = `${logRef.current}\n${chunk}`.slice(-8000);
      setLog(logRef.current);
      setStatus((current) => (current === "starting" ? "watching" : current));
    }).then((watcher) => {
      if (disposed) {
        watcher.stop();
        return;
      }
      activeWatcher = watcher;
      pollTimer = setInterval(pollPdf, POLL_MS);
      pollPdf();
    });

    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      activeWatcher?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texFilePath, engine]);

  function changeEngine(value: LatexEngine) {
    setEngineState(value);
    setEngine(value);
  }

  const statusLabel = {
    starting: "Iniciando latexmk…",
    watching: "Vigilando cambios",
    error: "Error — ver log",
  }[status];

  return (
    <div className="pdf-preview">
      <div className="pdf-preview-bar">
        <span className={`pdf-status pdf-status-${status}`}>{statusLabel}</span>
        <div className="pdf-preview-bar-actions">
          <select value={engine} onChange={(e) => changeEngine(e.target.value as LatexEngine)}>
            {(Object.keys(ENGINE_LABELS) as LatexEngine[]).map((key) => (
              <option key={key} value={key}>
                {ENGINE_LABELS[key]}
              </option>
            ))}
          </select>
          <button className="icon-button" onClick={() => setShowLog((s) => !s)}>
            {showLog ? "Ocultar log" : "Ver log"}
          </button>
        </div>
      </div>

      {showLog && <pre className="pdf-log">{log || "Sin salida todavía."}</pre>}

      <div className="pdf-frame-wrap">
        {pdfSrc ? (
          <iframe className="pdf-frame" src={pdfSrc} title="Vista previa PDF" />
        ) : (
          <div className="pdf-placeholder">
            Compilando el PDF por primera vez… (necesita `latexmk` instalado; revisa "Ver log" si
            tarda demasiado).
          </div>
        )}
      </div>
    </div>
  );
}
