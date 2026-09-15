interface PresenceSidebarProps {
  peers: { name: string; color: string }[];
  selfName: string;
}

export default function PresenceSidebar({ peers, selfName }: PresenceSidebarProps) {
  return (
    <div className="presence-sidebar">
      <div className="file-tree-section-title">En línea ahora</div>
      <div className="presence-item">
        <span className="presence-dot" style={{ background: "#888" }} />
        {selfName} (tú)
      </div>
      {peers
        .filter((p) => p.name !== selfName)
        .map((peer, i) => (
          <div className="presence-item" key={`${peer.name}-${i}`}>
            <span className="presence-dot" style={{ background: peer.color }} />
            {peer.name}
          </div>
        ))}
      {peers.filter((p) => p.name !== selfName).length === 0 && (
        <div className="presence-empty">Nadie más conectado todavía.</div>
      )}
    </div>
  );
}
