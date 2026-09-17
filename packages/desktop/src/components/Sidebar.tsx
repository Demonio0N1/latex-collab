import type { RecentProject } from "../recentProjects";
import { BrandMark } from "./BrandMark";
import { initials } from "../avatar";
import { randomColor } from "@latex-collab/shared";

interface SidebarProps {
  recentProjects: RecentProject[];
  activeKey: string | null;
  onNewProject: () => void;
  onJoinProject: () => void;
  onOpenRecent: (project: RecentProject) => void;
  onRemoveRecent: (id: string, baseUrl: string) => void;
}

export default function Sidebar({
  recentProjects,
  activeKey,
  onNewProject,
  onJoinProject,
  onOpenRecent,
  onRemoveRecent,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <BrandMark size={22} />
        <span className="brand-name">LaTeX Collab</span>
      </div>

      <div className="sidebar-actions">
        <button className="sidebar-action primary" onClick={onNewProject}>
          <span className="icon">＋</span> Nuevo proyecto
        </button>
        <button className="sidebar-action" onClick={onJoinProject}>
          <span className="icon">⇥</span> Unirse
        </button>
      </div>

      <div className="sidebar-section-title">
        Recientes <span className="count-pill">{recentProjects.length}</span>
      </div>

      <div className="sidebar-list">
        {recentProjects.length === 0 && (
          <div className="sidebar-empty">Todavía no tienes proyectos. Crea uno o únete a uno existente.</div>
        )}
        {recentProjects.map((p) => {
          const key = `${p.id}@${p.baseUrl}`;
          const isLocal = /localhost|127\.0\.0\.1/.test(p.baseUrl);
          return (
            <div key={key} className={`sidebar-item ${key === activeKey ? "active" : ""}`} onClick={() => onOpenRecent(p)}>
              <span className="sidebar-item-avatar" style={{ background: randomColor(p.name) }}>
                {initials(p.name)}
              </span>
              <div className="sidebar-item-text">
                <div className="sidebar-item-name">{p.name}</div>
                <div className="sidebar-item-sub">
                  <span className={`sidebar-item-dot ${isLocal ? "local" : "remote"}`} />
                  {p.baseUrl.replace(/^https?:\/\//, "")}
                </div>
              </div>
              <button
                className="sidebar-item-remove"
                title="Quitar de la lista"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveRecent(p.id, p.baseUrl);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
