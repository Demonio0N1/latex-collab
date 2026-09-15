interface StatusBarProps {
  baseUrl: string;
  connected: boolean;
  peerCount: number;
  activeFile: string | null;
}

export default function StatusBar({ baseUrl, connected, peerCount, activeFile }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-bar-item">
        <span className={`status-dot ${connected ? "connected" : "disconnected"}`} />
        {connected ? "Conectado" : "Sin conexión"} · {baseUrl.replace(/^https?:\/\//, "")}
      </div>
      <div className="status-bar-item">
        {peerCount} {peerCount === 1 ? "colaborador" : "colaboradores"} conectado{peerCount === 1 ? "" : "s"}
      </div>
      {activeFile && <div className="status-bar-item status-bar-file">{activeFile}</div>}
    </div>
  );
}
