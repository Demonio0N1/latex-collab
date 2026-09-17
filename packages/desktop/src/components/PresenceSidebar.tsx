import { initials } from "../avatar";
import { randomColor } from "@latex-collab/shared";

interface PresenceSidebarProps {
  peers: { name: string; color: string }[];
  selfName: string;
}

export default function PresenceSidebar({ peers, selfName }: PresenceSidebarProps) {
  const others = peers.filter((p) => p.name !== selfName);
  const selfColor = randomColor(selfName);

  return (
    <div className="presence-sidebar">
      <div className="file-tree-section-title">
        En línea <span className="count-pill">{others.length + 1}</span>
      </div>

      <div className="presence-item">
        <span className="avatar" style={{ background: selfColor }}>
          {initials(selfName)}
        </span>
        <div className="presence-item-text">
          <span className="presence-name">{selfName}</span>
          <span className="presence-you">tú</span>
        </div>
      </div>

      {others.map((peer, i) => (
        <div className="presence-item" key={`${peer.name}-${i}`}>
          <span className="avatar" style={{ background: peer.color }}>
            {initials(peer.name)}
          </span>
          <div className="presence-item-text">
            <span className="presence-name">{peer.name}</span>
          </div>
        </div>
      ))}

      {others.length === 0 && (
        <div className="presence-empty">Nadie más conectado todavía. Comparte el proyecto para invitar.</div>
      )}
    </div>
  );
}
