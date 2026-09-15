import { useState } from "react";
import type { JoinProjectResponse } from "@latex-collab/shared";
import { joinProject, parseShareLink } from "../api";

interface JoinProjectModalProps {
  defaultBaseUrl: string;
  initialLink?: string;
  initialError?: string;
  onClose: () => void;
  onReady: (session: JoinProjectResponse & { baseUrl: string; password: string }) => void;
}

export default function JoinProjectModal({ defaultBaseUrl, initialLink, initialError, onClose, onReady }: JoinProjectModalProps) {
  const [link, setLink] = useState(initialLink ?? "");
  const initialParsed = initialLink ? parseShareLink(initialLink) : null;
  const [host, setHost] = useState(initialParsed?.baseUrl ?? defaultBaseUrl);
  const [id, setId] = useState(initialParsed?.projectId ?? "");
  const [password, setPassword] = useState(initialParsed?.password ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  function applyLink(value: string) {
    setLink(value);
    const parsed = parseShareLink(value);
    if (parsed) {
      setHost(parsed.baseUrl);
      setId(parsed.projectId);
      setPassword(parsed.password);
    }
  }

  async function handleJoin() {
    if (!id.trim() || !password.trim()) {
      setError("ID de proyecto y contraseña son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await joinProject(host, id.trim(), { password });
      onReady({ ...session, baseUrl: host, password });
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Unirse a un proyecto</h3>

        <label>Pegar link de invitación</label>
        <input value={link} onChange={(e) => applyLink(e.target.value)} placeholder="latexcollab://192.168.1.20:5959/swift-falcon-482?key=..." autoFocus />

        <div className="hint">— o completa los datos a mano —</div>

        <label>Servidor</label>
        <input value={host} onChange={(e) => setHost(e.target.value)} />

        <label>ID del proyecto</label>
        <input value={id} onChange={(e) => setId(e.target.value)} />

        <label>Contraseña</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} />

        <button className="primary" disabled={busy} onClick={handleJoin}>
          {busy ? "Uniendo..." : "Unirse"}
        </button>
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
