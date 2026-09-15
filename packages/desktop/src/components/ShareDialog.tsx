import { useEffect, useState } from "react";
import { buildShareLink, getNetworkInfo } from "../api";

interface ShareDialogProps {
  baseUrl: string;
  projectId: string;
  password: string;
  onClose: () => void;
}

const SHARE_HOST_KEY = "latex-collab:shareHost";
const isLoopback = (url: string) => /localhost|127\.0\.0\.1/.test(url);

export default function ShareDialog({ baseUrl, projectId, password, onClose }: ShareDialogProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ host: string; global: boolean }[]>([]);
  const [shareHost, setShareHost] = useState(() => {
    if (!isLoopback(baseUrl)) return baseUrl;
    return localStorage.getItem(SHARE_HOST_KEY) ?? "";
  });

  useEffect(() => {
    if (!isLoopback(baseUrl)) return;
    getNetworkInfo(baseUrl)
      .then(({ addresses, port, funnelUrl }) => {
        const candidates = [
          ...(funnelUrl ? [{ host: funnelUrl, global: true }] : []),
          ...addresses.map((addr) => ({ host: `http://${addr}:${port}`, global: false })),
        ];
        setSuggestions(candidates);
        // Prefer a global (Funnel) address as the default pick when one is available.
        setShareHost((current) => (current && !funnelUrl ? current : candidates[0]?.host ?? current));
      })
      .catch(() => {});
  }, [baseUrl]);

  function chooseHost(host: string) {
    setShareHost(host);
    localStorage.setItem(SHARE_HOST_KEY, host);
  }

  const effectiveHost = shareHost || baseUrl;
  const link = buildShareLink(effectiveHost, projectId, password);
  const usingGlobalHost = suggestions.some((s) => s.host === effectiveHost && s.global);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Compartir proyecto</h3>
        <p>Envía cualquiera de estas dos opciones a la otra persona (WhatsApp, correo, Slack...):</p>

        {isLoopback(baseUrl) && (
          <>
            <label>Dirección con la que te pueden alcanzar</label>
            <input value={shareHost} onChange={(e) => chooseHost(e.target.value)} placeholder="http://192.168.1.20:5959" />
            {suggestions.length > 0 && (
              <div className="host-suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s.host}
                    className={s.host === shareHost ? "host-chip active" : "host-chip"}
                    onClick={() => chooseHost(s.host)}
                  >
                    {s.global && "🌐 "}
                    {s.host.replace(/^https?:\/\//, "")}
                  </button>
                ))}
              </div>
            )}
            <div className="hint">
              {usingGlobalHost ? (
                <>
                  🌐 = link público de Tailscale Funnel: funciona para <strong>cualquier persona en
                  internet</strong>, sin que instale Tailscale ni nada extra.
                </>
              ) : (
                <>
                  "localhost" solo funciona en esta misma máquina. Sin un link 🌐 (Tailscale Funnel)
                  disponible, elige tu IP de red local para la misma Wi-Fi, o tu IP de Tailscale si
                  la otra persona ya está conectada a tu red de Tailscale.
                </>
              )}
            </div>
          </>
        )}

        <label>Link directo (clicable — abre la app sola, o lleva a instalarla si no la tienen)</label>
        <div className="copy-row">
          <input readOnly value={link} />
          <button onClick={() => copy("link", link)}>{copied === "link" ? "Copiado" : "Copiar"}</button>
        </div>

        <label>O, a mano: ID del proyecto + contraseña</label>
        <div className="copy-row">
          <input readOnly value={projectId} />
          <button onClick={() => copy("id", projectId)}>{copied === "id" ? "Copiado" : "Copiar"}</button>
        </div>
        <div className="copy-row">
          <input readOnly value={password} type="text" />
          <button onClick={() => copy("password", password)}>{copied === "password" ? "Copiado" : "Copiar"}</button>
        </div>

        {!usingGlobalHost && (
          <p className="hint">
            Nota: quien se una necesita poder alcanzar por red esta máquina ({effectiveHost}). En la
            misma red local (Wi-Fi/LAN) funciona directo; entre redes distintas, sin un link 🌐,
            necesita estar conectado a tu Tailscale.
          </p>
        )}

        <button className="close-button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
