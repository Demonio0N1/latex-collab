import { useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";

interface ProjectHeaderProps {
  projectName: string;
  projectId: string;
  localFilePath: string | null;
  showPreview: boolean;
  onTogglePreview: () => void;
  onShare: () => void;
}

const CUSTOM_COMMAND_KEY = "latex-collab:openCommand";

export default function ProjectHeader({
  projectName,
  projectId,
  localFilePath,
  showPreview,
  onTogglePreview,
  onShare,
}: ProjectHeaderProps) {
  const [appName, setAppName] = useState(() => localStorage.getItem(CUSTOM_COMMAND_KEY) ?? "");
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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
        <strong>{projectName}</strong>
        <span className="project-id">{projectId}</span>
      </div>
      <div className="project-header-actions">
        <button onClick={onTogglePreview} className={showPreview ? "active-toggle" : ""}>
          {showPreview ? "Ocultar vista previa PDF" : "Vista previa PDF"}
        </button>
        <button onClick={handleOpen} disabled={!localFilePath} title={localFilePath ?? undefined}>
          Abrir/compilar con mi programa
        </button>
        <button onClick={() => setShowSettings((s) => !s)} className="icon-button" title="Configurar programa">
          ⚙️
        </button>
        <button onClick={onShare}>Compartir</button>
      </div>
      {showSettings && (
        <div className="settings-popover">
          <label>Nombre de la app (vacío = usar el programa predeterminado del sistema para .tex)</label>
          <input
            placeholder="ej: Texmaker   o   TeXShop"
            value={appName}
            onChange={(e) => saveAppName(e.target.value)}
          />
        </div>
      )}
      {status && <div className="status-banner">{status}</div>}
    </div>
  );
}
