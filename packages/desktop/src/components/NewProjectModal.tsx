import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { JoinProjectResponse } from "@latex-collab/shared";
import { createProject, importArchive, joinProject, listTemplates } from "../api";
import { getDefaultLocationPref, setDefaultLocationPref, suggestProjectPath, type DefaultLocation } from "../projectPaths";

const TEMPLATE_LABELS: Record<string, string> = {
  article: "Artículo",
  report: "Reporte",
  beamer: "Presentación (Beamer)",
  cv: "CV / Currículum",
};

interface NewProjectModalProps {
  baseUrl: string;
  onClose: () => void;
  onReady: (session: JoinProjectResponse & { baseUrl: string; password: string }) => void;
}

export default function NewProjectModal({ baseUrl, onClose, onReady }: NewProjectModalProps) {
  const [templates, setTemplates] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState(() => Math.random().toString(36).slice(2, 10));
  const [template, setTemplate] = useState<string | undefined>(undefined);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [location, setLocation] = useState<DefaultLocation>(getDefaultLocationPref());
  const [projectPath, setProjectPath] = useState("");
  const [pathTouched, setPathTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTemplates(baseUrl)
      .then((r) => setTemplates(r.templates))
      .catch(() => setTemplates([]));
  }, [baseUrl]);

  useEffect(() => {
    if (pathTouched) return;
    suggestProjectPath(name || "proyecto").then(setProjectPath);
  }, [name, location, pathTouched]);

  function changeLocation(loc: DefaultLocation) {
    setLocation(loc);
    setDefaultLocationPref(loc);
  }

  async function browseFolder() {
    const picked = await openDialog({ directory: true, defaultPath: projectPath || undefined });
    if (typeof picked === "string") {
      setProjectPath(picked);
      setPathTouched(true);
    }
  }

  async function handleCreate() {
    if (!name.trim() || !password.trim()) {
      setError("Nombre y contraseña son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { project } = await createProject(baseUrl, {
        name,
        password,
        template,
        rootPath: projectPath || undefined,
      });
      if (importFile) {
        await importArchive(baseUrl, project.id, importFile);
      }
      const session = await joinProject(baseUrl, project.id, { password });
      onReady({ ...session, baseUrl, password });
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Nuevo proyecto</h3>

        <label>Nombre del proyecto</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="tesis-cap3" autoFocus />

        <label>Contraseña para compartir</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} />

        <label>Plantilla</label>
        <div className="template-gallery">
          <button className={template === undefined ? "template-card active" : "template-card"} onClick={() => setTemplate(undefined)}>
            En blanco
          </button>
          {templates.map((t) => (
            <button key={t} className={template === t ? "template-card active" : "template-card"} onClick={() => setTemplate(t)}>
              {TEMPLATE_LABELS[t] ?? t}
            </button>
          ))}
        </div>

        <label>O importar un proyecto existente (.zip)</label>
        <input type="file" accept=".zip" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />

        <label>Guardar la carpeta del proyecto en</label>
        <div className="location-toggle">
          <button className={location === "documents" ? "active" : ""} onClick={() => changeLocation("documents")}>
            Documentos
          </button>
          <button className={location === "desktop" ? "active" : ""} onClick={() => changeLocation("desktop")}>
            Escritorio
          </button>
        </div>
        <div className="copy-row">
          <input
            value={projectPath}
            onChange={(e) => {
              setProjectPath(e.target.value);
              setPathTouched(true);
            }}
          />
          <button onClick={browseFolder}>Elegir carpeta…</button>
        </div>
        <div className="hint">Por defecto crea "LaTeX Projects/{name || "proyecto"}" ahí. Puedes elegir otra carpeta.</div>

        <button className="primary" disabled={busy} onClick={handleCreate}>
          {busy ? "Creando..." : "Crear proyecto"}
        </button>
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
