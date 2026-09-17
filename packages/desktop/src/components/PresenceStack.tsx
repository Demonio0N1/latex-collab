import { initials } from "../avatar";
import { randomColor } from "@latex-collab/shared";

interface PresenceStackProps {
  peers: { name: string; color: string }[];
  selfName: string;
}

const MAX_SHOWN = 4;

export default function PresenceStack({ peers, selfName }: PresenceStackProps) {
  const others = peers.filter((p) => p.name !== selfName);
  const people = [{ name: selfName, color: randomColor(selfName), you: true }, ...others.map((p) => ({ ...p, you: false }))];
  const shown = people.slice(0, MAX_SHOWN);
  const overflow = people.length - shown.length;

  return (
    <div className="presence-stack" title={people.map((p) => (p.you ? `${p.name} (tú)` : p.name)).join(", ")}>
      {shown.map((p, i) => (
        <span
          key={`${p.name}-${i}`}
          className={`avatar avatar-sm ${p.you ? "avatar-self" : ""}`}
          style={{ background: p.color, zIndex: shown.length - i }}
        >
          {initials(p.name)}
        </span>
      ))}
      {overflow > 0 && <span className="avatar avatar-sm avatar-more">+{overflow}</span>}
    </div>
  );
}
