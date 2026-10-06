import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { stat } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { findLatexmk, getEngine, pdfPathFor, setEngine, setTexDir, startWatcher, type LatexEngine, type Watcher } from "../latexCompiler";
import { IS_MACOS, IS_WINDOWS } from "../platform";

const LATEX_DOWNLOAD_URL = IS_MACOS
  ? "https://www.tug.org/mactex/" // MacTeX (incluye BasicTeX, más liviano)
  : IS_WINDOWS
    ? "https://miktex.org/download"
    : "https://www.tug.org/texlive/";

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
  const [status, setStatus] = useState<"starting" | "watching" | "error" | "nolatex">("starting");
  const [log, setLog] = useState("");
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [engine, setEngineState] = useState<LatexEngine>(getEngine());
  const [retryKey, setRetryKey] = useState(0);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
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
          // Query param (no fragmento): cambiar solo el "#..." de un iframe
          // NO recarga el documento en WebKit — el PDF nuevo quedaba en disco
          // y el visor seguía mostrando el viejo.
          setPdfSrc(`${convertFileSrc(pdfPath)}?t=${mtime}`);
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
      // latexmk sigue corriendo aunque LaTeX falle: si no avisamos, la vista
      // se queda mostrando el último PDF bueno y parece que "no actualiza".
      // latexmk ni siquiera arrancó: casi siempre significa "LaTeX no está
      // instalado (o no lo encontramos)". Mostramos una guía amable en vez
      // de un log críptico.
      if (/No se pudo iniciar latexmk/.test(chunk)) {
        setStatus("nolatex");
        return;
      }
      const chunkHasError = /^! |Emergency stop|Errors, so I did not complete|Fatal error occurred/m.test(chunk);
      if (chunkHasError) {
        setStatus((current) => {
          if (current !== "error") setShowLog(true); // abre el log la primera vez
          return "error";
        });
      } else {
        setStatus((current) => (current === "starting" ? "watching" : current));
      }
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
  }, [texFilePath, engine, retryKey]);

  function changeEngine(value: LatexEngine) {
    setEngineState(value);
    setEngine(value);
  }

  async function detectAndRetry() {
    setRetryMsg("Buscando LaTeX en tu computador…");
    try {
      const found = await findLatexmk();
      if (found.length > 0) {
        await setTexDir(found[0]);
        setRetryMsg(null);
        setRetryKey((k) => k + 1); // reinicia el compilador con la ruta nueva
      } else {
        setRetryMsg("Aún no encuentro LaTeX instalado. Descárgalo con el botón, instálalo y vuelve a intentar.");
      }
    } catch (err) {
      setRetryMsg(`No se pudo buscar: ${String(err)}`);
    }
  }

  const statusLabel = {
    starting: "Iniciando latexmk…",
    watching: "Vigilando cambios",
    error: "❌ Error de LaTeX — el PDF muestra la última versión buena",
    nolatex: "Falta instalar LaTeX",
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
        {status === "nolatex" ? (
          <div className="pdf-setup">
            <div className="pdf-setup-icon">📄</div>
            <h4>Para ver el PDF necesitas LaTeX (gratis)</h4>
            <p>
              LaTeX es el programa que convierte tu documento en PDF. Se instala una sola vez y la
              app lo encuentra sola.
            </p>
            <div className="pdf-setup-actions">
              <button className="primary" onClick={() => openUrl(LATEX_DOWNLOAD_URL)}>
                ⬇️ Descargar LaTeX {IS_MACOS ? "(MacTeX)" : IS_WINDOWS ? "(MiKTeX)" : "(TeX Live)"}
              </button>
              <button onClick={detectAndRetry}>✅ Ya lo instalé — Reintentar</button>
            </div>
            {retryMsg && <p className="hint">{retryMsg}</p>}
            <p className="hint">
              Mientras tanto puedes seguir escribiendo con normalidad: tus cambios se guardan y se
              comparten igual.
            </p>
          </div>
        ) : pdfSrc ? (
          // key fuerza un iframe nuevo por versión del PDF — recarga garantizada.
          <iframe key={pdfSrc} className="pdf-frame" src={pdfSrc} title="Vista previa PDF" />
        ) : (
          <div className="pdf-placeholder">
            Preparando la vista previa… El primer PDF tarda unos segundos en compilarse.
          </div>
        )}
      </div>
    </div>
  );
}
