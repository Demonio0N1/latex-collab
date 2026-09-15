export interface RecentProject {
  id: string;
  name: string;
  baseUrl: string;
  password: string; // stored locally only (this device), lets a click reopen without retyping it
  lastOpened: number;
}

const KEY = "latex-collab:recentProjects";
const MAX_ENTRIES = 30;

export function listRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentProject[]) : [];
  } catch {
    return [];
  }
}

export function upsertRecentProject(project: Omit<RecentProject, "lastOpened">): void {
  const all = listRecentProjects().filter((p) => !(p.id === project.id && p.baseUrl === project.baseUrl));
  all.unshift({ ...project, lastOpened: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX_ENTRIES)));
}

export function removeRecentProject(id: string, baseUrl: string): void {
  const all = listRecentProjects().filter((p) => !(p.id === id && p.baseUrl === baseUrl));
  localStorage.setItem(KEY, JSON.stringify(all));
}
