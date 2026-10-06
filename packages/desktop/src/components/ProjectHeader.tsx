import { useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import PresenceStack from "./PresenceStack";
import { getTexDir, setTexDir, findLatexmk } from "../latexCompiler";
import { SUPPORTS_LOCAL_TOOLS, IS_MACOS } from "../platform";

interface ProjectHeaderProps {
  projectName: string;
  projectId: string;
  localFilePath: string | null;
  /** Carpeta local visible del proyecto (Documentos/LaTeX Projects/...). */
  localDirPath?: string | null;
  showPreview: boolean;
  peers: { name: string; color: string }[];
  selfName: string;
  onToggleNav?: () => void;
  onTogglePeople?: () => void;
  onTogglePreview: () => void;
  onShare: () => void;
}

const CUSTOM_COMMAND_KEY = "latex-collab:openCommand";

export default function ProjectHeader({
  projectName,
  projectId,
  localFilePath,
  localDirPath,
  showPreview,
  peers,
  selfName,
  onToggleNav,
  onTogglePeople,
  onTogglePreview,
  onShare,
}: ProjectHeaderProps) {
  const [appName, setAppName] = useState(() => localStorage.getItem(CUSTOM_COMMAND_KEY) ?? "");
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [texDir, setTexDirState] = useState(() => getTexDir());

  async function pickTexDir() {
    const picked = await openDialog({ directory: true, defaultPath: texDir || undefined });
    if (typeof picked !== "string") return;
    try {
      await setTexDir(picked);
      setTexDirState(picked);
      setStatus("Carpeta de LaTeX aplicada — cierra y vuelve a abrir la Vista previa PDF.");
    } catch (err) {
      setStatus(`No se pudo aplicar la carpeta: ${String(err)}`);
    }
  }

  async function clearTexDir() {
    await setTexDir("");
    setTexDirState("");
    setStatus("Se usará la detección automática (PATH del sistema) al reiniciar la app.");
  }

  async function detectTexDir() {
    try {
      const found = await findLatexmk();
      if (!found || found.length === 0) {
        setStatus(
          'No encontré latexmk en las rutas conocidas. Instala MacTeX/TeX Live, o corre "which latexmk" en una terminal y usa "Elegir…" con esa carpeta.'
        );
        return;
      }
      await setTexDir(found[0]);
      setTexDirState(found[0]);
      setStatus(
        found.length === 1
          ? `latexmk encontrado en: ${found[0]} — reabre la Vista previa PDF.`
          : `Encontrado en ${found.length} lugares; usando ${found[0]}. Otros: ${found.slice(1).join(" · ")}`
      );
    } catch (err) {
      setStatus(`La detección falló: ${String(err)}`);
    }
  }

  async function handleOpen() {
    if (!localFilePath) return;
    try {
      await openPath(localFilePath, appName.trim() || undefined);
      setStatus(null);
    } catch (err) {
      setStatus(`No se pudo abrir: ${String(err)}`);
    }
  }

  function saveAppName(value: string) {
    setAppName(value);
    localStorage.setItem(CUSTOM_COMMAND_KEY, value);
  }

  return (
    <div className="project-header">
      <div className="project-header-title">
        {onToggleNav && (
          <button
            className="icon-button nav-toggle"
            onClick={onToggleNav}
            title="Mostrar/ocultar barra lateral"
            aria-label="Mostrar/ocultar barra lateral"
          >
            ☰
          </button>
        )}
        <strong>{projectName}</strong>
        <span className="project-id" title="ID del proyecto">{projectId}</span>
      </div>
      <div className="project-header-actions">
        <PresenceStack peers={peers} selfName={selfName} />
        <span className="header-sep" />
        {SUPPORTS_LOCAL_TOOLS && (
          <>
            {localDirPath && (
              <button
                className="desktop-only"
                onClick={() => openPath(localDirPath).catch((err) => setStatus(`No se pudo abrir la carpeta: ${String(err)}`))}
                title={`Carpeta local del proyecto:\n${localDirPath}`}
              >
                📂 {IS_MACOS ? "Abrir en Finder" : "Abrir carpeta"}
              </button>
            )}
            <button onClick={onTogglePreview} className={`desktop-only ${showPreview ? "active-toggle" : ""}`}>
              {showPreview ? "Ocultar PDF" : "Vista previa PDF"}
            </button>
            <button className="desktop-only" onClick={handleOpen} disabled={!localFilePath} title={localFilePath ?? undefined}>
              Abrir con…
            </button>
            <button onClick={() => setShowSettings((s) => !s)} className="icon-button desktop-only" title="Configurar programa externo">
              ⚙
            </button>
          </>
        )}
        <button className="btn-accent" onClick={onShare}>Compartir</button>
        {onTogglePeople && (
          <button
            className="icon-button"
            onClick={onTogglePeople}
            title="Mostrar/ocultar archivos y colaboradores"
            aria-label="Mostrar/ocultar archivos y colaboradores"
          >
            ⋯
          </button>
        )}
      </div>
      {showSettings && (
        <div className="settings-popover">
          <label>Nombre de la app (vacío = usar el programa predeterminado del sistema para .tex)</label>
          <input
            placeholder="ej: Texmaker   o   TeXShop"
            value={appName}
            onChange={(e) => saveAppName(e.target.value)}
          />

          <label>Carpeta del compilador LaTeX (donde está `latexmk`)</label>
          <div className="copy-row">
            <input readOnly value={texDir} placeholder="Automático (PATH del sistema)" title={texDir || undefined} />
            <button onClick={detectTexDir}>Detectar</button>
            <button onClick={pickTexDir}>Elegir…</button>
            {texDir && <button onClick={clearTexDir}>Quitar</button>}
          </div>
          <div className="hint">
            Úsalo si la vista previa dice "latexmk: command not found". Ej.:
            /usr/local/texlive/2026/bin/universal-darwin
          </div>
        </div>
      )}
      {status && <div className="status-banner">{status}</div>}
    </div>
  );
}
