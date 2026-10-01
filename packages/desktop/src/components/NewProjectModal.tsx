import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { JoinProjectResponse } from "@latex-collab/shared";
import { createProject, importArchive, joinProject, listTemplates, uploadProjectFile } from "../api";

const BLANK_MAIN_TEX = `\\documentclass{article}

\\begin{document}

Escribe aquí tu documento.

\\end{document}
`;
import { getDefaultLocationPref, setDefaultLocationPref, suggestProjectPath, type DefaultLocation } from "../projectPaths";
import { SUPPORTS_LOCAL_TOOLS } from "../platform";

const TEMPLATE_LABELS: Record<string, string> = {
  article: "Artículo",
  report: "Reporte",
  beamer: "Presentación (Beamer)",
  cv: "CV / Currículum",
};

const TEMPLATE_ICONS: Record<string, string> = {
  article: "📄",
  report: "📚",
  beamer: "📽️",
  cv: "👤",
};

interface NewProjectModalProps {
  baseUrl: string;
  onServerChange?: (url: string) => void;
  onClose: () => void;
  onReady: (session: JoinProjectResponse & { baseUrl: string; password: string }) => void;
}

export default function NewProjectModal({ baseUrl, onServerChange, onClose, onReady }: NewProjectModalProps) {
  const [templates, setTemplates] = useState<string[]>([]);
  // Which server to create the project on (e.g. your Raspberry Pi). Editable
  // so you're not locked to localhost.
  const [server, setServer] = useState(baseUrl);
  const [name, setName] = useState("");
  const [password, setPassword] = useState(() => Math.random().toString(36).slice(2, 10));
  // Optional server-wide create-password (for servers exposed via Funnel).
  // Remembered per server so the user types it once.
  const createPwKey = `latex-collab:createpw:${server.trim().replace(/\/+$/, "")}`;
  const [createPassword, setCreatePassword] = useState("");
  const [template, setTemplate] = useState<string | undefined>(undefined);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [location, setLocation] = useState<DefaultLocation>(getDefaultLocationPref());
  const [projectPath, setProjectPath] = useState("");
  const [pathTouched, setPathTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Choosing a local folder only makes sense when the server runs on THIS
  // machine. For a remote server (e.g. the Raspberry Pi) the files live on the
  // server, so we hide the folder picker and let the server pick the path.
  const serverIsLocal = /localhost|127\.0\.0\.1/.test(server);
  const showFolderPicker = SUPPORTS_LOCAL_TOOLS && serverIsLocal;

  useEffect(() => {
    listTemplates(server)
      .then((r) => setTemplates(r.templates))
      .catch(() => setTemplates([]));
  }, [server]);

  // Load the remembered create-password for whichever server is selected.
  useEffect(() => {
    try {
      setCreatePassword(localStorage.getItem(createPwKey) ?? "");
    } catch {
      setCreatePassword("");
    }
  }, [createPwKey]);

  useEffect(() => {
    if (!SUPPORTS_LOCAL_TOOLS || pathTouched) return;
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
    const cleanServer = server.trim().replace(/\/+$/, "");
    if (!cleanServer) {
      setError("El servidor es obligatorio.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const trimmedCreatePw = createPassword.trim();
      const { project } = await createProject(
        cleanServer,
        {
          name,
          password,
          template,
          // Only send a local folder when the server is on this machine.
          rootPath: showFolderPicker ? projectPath || undefined : undefined,
        },
        trimmedCreatePw || undefined
      );
      // Only persist once the server accepted it (we got past createProject).
      try {
        if (trimmedCreatePw) localStorage.setItem(createPwKey, trimmedCreatePw);
        else localStorage.removeItem(createPwKey);
      } catch {
        /* localStorage may be unavailable; ignore */
      }
      onServerChange?.(cleanServer);
      // Join first to get the session token, which importArchive/upload require.
      let session = await joinProject(cleanServer, project.id, { password });
      if (importFile) {
        await importArchive(cleanServer, project.id, session.token, importFile);
        session = await joinProject(cleanServer, project.id, { password }); // refresh file list
      } else if (!template) {
        // A blank project has no files, so the editor would open empty with no
        // way to add one. Seed a main.tex so there's something to edit.
        await uploadProjectFile(cleanServer, project.id, session.token, "main.tex", new TextEncoder().encode(BLANK_MAIN_TEX));
        session = await joinProject(cleanServer, project.id, { password }); // refresh file list
      }
      onReady({ ...session, baseUrl: cleanServer, password });
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nuevo proyecto</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <label>Servidor</label>
        <input
          value={server}
          onChange={(e) => {
            setServer(e.target.value);
            // Remember it right away, so reopening the dialog keeps your server
            // instead of snapping back to localhost.
            onServerChange?.(e.target.value);
          }}
          placeholder="https://pi5-oaq.tail61fec5.ts.net"
        />
        <div className="hint">
          Dónde se crea el proyecto. Ej.: tu Raspberry, o http://localhost:5959.
          {!serverIsLocal && SUPPORTS_LOCAL_TOOLS && (
            <> Los archivos viven en el servidor y tendrás una copia local automática en <strong>Documentos/LaTeX Projects</strong>.</>
          )}
        </div>

        <label>Nombre del proyecto</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="tesis-cap3" autoFocus />

        <label>Contraseña para compartir</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} />

        <label>Plantilla</label>
        <div className="template-gallery">
          <button className={template === undefined ? "template-card active" : "template-card"} onClick={() => setTemplate(undefined)}>
            <span className="template-icon">✨</span>
            En blanco
          </button>
          {templates.map((t) => (
            <button key={t} className={template === t ? "template-card active" : "template-card"} onClick={() => setTemplate(t)}>
              <span className="template-icon">{TEMPLATE_ICONS[t] ?? "📄"}</span>
              {TEMPLATE_LABELS[t] ?? t}
            </button>
          ))}
        </div>

        <label>O importar un proyecto existente (.zip)</label>
        <input type="file" accept=".zip" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />

        {showFolderPicker && (
          <>
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
          </>
        )}

        <label>Contraseña del servidor (solo si el servidor la exige)</label>
        <input
          type="password"
          value={createPassword}
          onChange={(e) => setCreatePassword(e.target.value)}
          placeholder="Déjalo vacío si tu servidor no la pide"
        />
        <div className="hint">
          La piden los servidores expuestos a internet (p. ej. con Tailscale Funnel) para que un
          desconocido no cree proyectos. Se recuerda para este servidor.
        </div>

        <button className="primary" disabled={busy} onClick={handleCreate}>
          {busy ? "Creando..." : "Crear proyecto"}
        </button>
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
